/**
 * Generators of schemas and of values for property tests. A generated schema
 * is a `Shape`: a description that is written out as the Lion expression
 * that builds the schema, and read by a model, plain TypeScript that says
 * what fits it without the code under test.
 */
import { Arbitrary, Schema } from "effect";
import { element, oneOf } from "./programs";

export type Json =
  | null
  | boolean
  | number
  | string
  | readonly Json[]
  | { readonly [key: string]: Json };

interface Field {
  readonly optional: boolean;
  readonly shape: Shape;
}

export type Shape =
  /** A function of the standard library, such as `value/number?`. */
  | { readonly kind: "predicate"; readonly name: keyof typeof PREDICATES }
  /** Data inside `quote`. */
  | { readonly kind: "literal"; readonly value: Json }
  /** A lambda: a number greater than the limit. */
  | { readonly kind: "above"; readonly limit: number }
  /** A lambda that names a constant the program defines: a number below it. */
  | { readonly kind: "below" }
  /** A function that `func/partial` made: the string itself. */
  | { readonly kind: "equals"; readonly text: string }
  /** The relation `even`, which a value fits when it is one of its rows. */
  | { readonly kind: "member" }
  /** The schema `Tree`, whose shape names itself. */
  | { readonly kind: "tree" }
  /** The schema `Loop`, which is itself or 1, so only 1 fits it. */
  | { readonly kind: "loop" }
  /**
   * The schema `Maybe`, an optional string: as the schema of a record's key
   * it lets the key be left out, like the optional schema it names.
   */
  | { readonly kind: "maybe" }
  /** `schema/open` of the schema `Tree`: a tree with any other keys on top. */
  | { readonly kind: "loose" }
  /** A logic variable: the value it has, or any value, which it then has. */
  | { readonly kind: "variable"; readonly name: string }
  /** The anonymous variable, which fits any value and binds nothing. */
  | { readonly kind: "wildcard" }
  | {
      readonly kind: "record";
      /** True for `schema/open`: the value can have keys the record lacks. */
      readonly open: boolean;
      readonly fields: Readonly<Record<string, Field>>;
    }
  | { readonly kind: "tuple"; readonly items: readonly Shape[] }
  | { readonly kind: "arrayOf" | "recordOf"; readonly item: Shape }
  | { readonly kind: "allOf" | "anyOf"; readonly parts: readonly Shape[] };

const isRecord = (value: unknown): value is { readonly [key: string]: Json } =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const PREDICATES = {
  "value/number?": (value: Json) => typeof value === "number",
  "value/integer?": (value: Json) => Number.isInteger(value),
  "value/string?": (value: Json) => typeof value === "string",
  "value/boolean?": (value: Json) => typeof value === "boolean",
  "value/null?": (value: Json) => value === null,
  "value/array?": (value: Json) => Array.isArray(value),
  "value/object?": (value: Json) => isRecord(value),
  "value/any?": (_: Json) => true,
  // A predicate that answers with something other than true or false.
  "value/identity": (value: Json) => value === true,
};

/** The rows of the relation `even`. */
export const EVEN = [-2, 0, 2, 4];

/** The constant that `below` names. */
export const LIMIT = 3;

/**
 * What every program that uses generated schemas starts with: the relation
 * and the constant that shapes name, and a schema that names itself.
 */
export const PRELUDE: readonly unknown[] = [
  ["relation", "even", ["n"]],
  ["fact", ...EVEN.map((n) => ["even", n])],
  ["define", "limit", LIMIT],
  [
    "schema",
    "Tree",
    { value: "value/number?", children: ["schema/arrayOf", "Tree"] },
  ],
  ["schema", "Loop", ["schema/anyOf", "Loop", 1]],
  ["schema", "Maybe", ["schema/optional", "value/string?"]],
];

/** The Lion expression that evaluates to a value: the value inside `quote`. */
export const quote = (value: Json) => ["quote", value];

/** The Lion expression that builds a shape's schema. */
export const lion = (shape: Shape): unknown => {
  switch (shape.kind) {
    case "predicate":
      return shape.name;
    case "literal":
      return quote(shape.value);
    case "above":
      return ["lambda", ["n"], ["number/greaterThan", "n", shape.limit]];
    case "below":
      return ["lambda", ["n"], ["number/lessThan", "n", "limit"]];
    case "equals":
      return ["func/partial", "string/equals?", quote(shape.text)];
    case "member":
      return "even";
    case "tree":
      return "Tree";
    case "loop":
      return "Loop";
    case "maybe":
      return "Maybe";
    case "loose":
      return ["schema/open", "Tree"];
    case "variable":
      return `?${shape.name}`;
    case "wildcard":
      return "?_";
    case "record": {
      const record = Object.fromEntries(
        Object.entries(shape.fields).map(([key, field]) => [
          key,
          field.optional
            ? ["schema/optional", lion(field.shape)]
            : lion(field.shape),
        ])
      );
      return shape.open ? ["schema/open", record] : record;
    }
    case "tuple":
      return ["array/make", ...shape.items.map(lion)];
    case "arrayOf":
    case "recordOf":
      return [`schema/${shape.kind}`, lion(shape.item)];
    default:
      return [`schema/${shape.kind}`, ...shape.parts.map(lion)];
  }
};

/** A key that is equal for equal JSON values, whatever order their keys have. */
export const keyOf = (value: unknown): string =>
  JSON.stringify(value, (_, item: unknown) =>
    isRecord(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]])
        )
      : item
  );

type Kind = "extra" | "missing" | "wrong";

/** Where a value does not fit, as the model sees it. */
export interface Misfit {
  readonly kind: Kind;
  readonly path: readonly (number | string)[];
}

type Path = Misfit["path"];

const wrong = (path: Path): Misfit[] => [{ kind: "wrong", path }];

const unless = (fits: boolean, path: Path) => (fits ? [] : wrong(path));

/**
 * Data as a schema: a list item by item, and a record key by key, with no
 * key the data lacks. So data fits exactly the values equal to it.
 */
const misfitsOfData = (data: Json, value: Json, path: Path): Misfit[] => {
  if (Array.isArray(data)) {
    return Array.isArray(value) && value.length === data.length
      ? data.flatMap((item: Json, at) =>
          misfitsOfData(item, value[at] as Json, [...path, at])
        )
      : wrong(path);
  }
  if (isRecord(data)) {
    return isRecord(value)
      ? [
          ...Object.entries(data).flatMap(([key, part]) =>
            Object.hasOwn(value, key)
              ? misfitsOfData(part, value[key] as Json, [...path, key])
              : [{ kind: "missing" as const, path: [...path, key] }]
          ),
          ...Object.keys(value)
            .filter((key) => !Object.hasOwn(data, key))
            .map((key) => ({ kind: "extra" as const, path: [...path, key] })),
        ]
      : wrong(path);
  }
  return unless(keyOf(data) === keyOf(value), path);
};

const TREE: Extract<Shape, { kind: "record" }> = {
  kind: "record",
  open: false,
  fields: {
    value: {
      optional: false,
      shape: { kind: "predicate", name: "value/number?" },
    },
    children: {
      optional: false,
      shape: { kind: "arrayOf", item: { kind: "tree" } },
    },
  },
};

const misfitsOfRecord = (
  shape: Extract<Shape, { kind: "record" }>,
  value: Json,
  path: Path
): Misfit[] => {
  if (!isRecord(value)) {
    return wrong(path);
  }
  const fields = Object.entries(shape.fields).flatMap(([key, field]) => {
    if (Object.hasOwn(value, key)) {
      return misfits(field.shape, value[key] as Json, [...path, key]);
    }
    return field.optional || field.shape.kind === "maybe"
      ? []
      : [{ kind: "missing" as const, path: [...path, key] }];
  });
  const extra = shape.open
    ? []
    : Object.keys(value)
        .filter((key) => !Object.hasOwn(shape.fields, key))
        .map((key) => ({ kind: "extra" as const, path: [...path, key] }));
  return [...fields, ...extra];
};

/** Every place where a value does not fit a shape; none when it fits. */
export const misfits = (
  shape: Shape,
  value: Json,
  path: Path = []
): Misfit[] => {
  switch (shape.kind) {
    case "predicate":
      return unless(PREDICATES[shape.name](value), path);
    case "literal":
      return misfitsOfData(shape.value, value, path);
    case "above":
      return unless(typeof value === "number" && value > shape.limit, path);
    case "below":
      return unless(typeof value === "number" && value < LIMIT, path);
    case "equals":
      return unless(value === shape.text, path);
    case "member":
      return unless(typeof value === "number" && EVEN.includes(value), path);
    case "tree":
      return misfits(TREE, value, path);
    case "loop":
      return unless(value === 1, path);
    case "maybe":
      return unless(typeof value === "string", path);
    case "loose":
      return misfits({ ...TREE, open: true }, value, path);
    case "variable":
    case "wildcard":
      // Plain code has no answer to bind in; `bindings` reads these.
      return [];
    case "record":
      return misfitsOfRecord(shape, value, path);
    case "tuple":
      return Array.isArray(value) && value.length === shape.items.length
        ? shape.items.flatMap((item, at) =>
            misfits(item, value[at] as Json, [...path, at])
          )
        : wrong(path);
    case "arrayOf":
      return Array.isArray(value)
        ? value.flatMap((item: Json, at) =>
            misfits(shape.item, item, [...path, at])
          )
        : wrong(path);
    case "recordOf":
      return isRecord(value)
        ? Object.entries(value).flatMap(([key, item]) =>
            misfits(shape.item, item, [...path, key])
          )
        : wrong(path);
    case "allOf":
      return shape.parts.flatMap((part) => misfits(part, value, path));
    default:
      return unless(
        shape.parts.some((part) => fits(part, value)),
        path
      );
  }
};

/** Whether a value fits a shape, as the model sees it. */
export const fits = (shape: Shape, value: Json): boolean =>
  misfits(shape, value).length === 0;

/** The values an answer gives its variables, by name. */
export type Bindings = ReadonlyMap<string, Json>;

/** Fits each part in turn, under every answer of the parts before it. */
const fold = <P>(
  parts: readonly P[],
  vars: Bindings,
  each: (part: P, vars: Bindings) => Bindings[]
) =>
  parts.reduce<Bindings[]>(
    (answers, part) => answers.flatMap((answered) => each(part, answered)),
    [vars]
  );

const bindingsOfRecord = (
  shape: Extract<Shape, { kind: "record" }>,
  value: Json,
  vars: Bindings
): Bindings[] => {
  const named = Object.keys(shape.fields);
  if (
    !(
      isRecord(value) &&
      (shape.open || Object.keys(value).every((key) => named.includes(key)))
    )
  ) {
    return [];
  }
  return fold(Object.entries(shape.fields), vars, ([key, field], answered) => {
    if (Object.hasOwn(value, key)) {
      return bindings(field.shape, value[key] as Json, answered);
    }
    return field.optional || field.shape.kind === "maybe" ? [answered] : [];
  });
};

/**
 * The answers under which a value fits a pattern, as the model sees it: each
 * is `vars` with what the fit bound. A variable that has a value is that
 * value, and one that has none takes the value it meets. A schema that
 * offers a choice gives the answers of every schema that fits, each once.
 */
export const bindings = (
  shape: Shape,
  value: Json,
  vars: Bindings = new Map()
): Bindings[] => {
  switch (shape.kind) {
    case "variable": {
      const held = vars.get(shape.name);
      if (held === undefined) {
        return [new Map(vars).set(shape.name, value)];
      }
      return keyOf(held) === keyOf(value) ? [vars] : [];
    }
    case "wildcard":
      return [vars];
    case "record":
      return bindingsOfRecord(shape, value, vars);
    case "tuple":
      return Array.isArray(value) && value.length === shape.items.length
        ? fold(
            shape.items.map((item, at) => [item, value[at] as Json] as const),
            vars,
            ([item, part], answered) => bindings(item, part, answered)
          )
        : [];
    case "arrayOf":
      return Array.isArray(value)
        ? fold(value as Json[], vars, (part, answered) =>
            bindings(shape.item, part, answered)
          )
        : [];
    case "recordOf":
      return isRecord(value)
        ? fold(Object.values(value), vars, (part, answered) =>
            bindings(shape.item, part, answered)
          )
        : [];
    case "allOf":
      return fold(shape.parts, vars, (part, answered) =>
        bindings(part, value, answered)
      );
    case "anyOf": {
      const found = shape.parts.flatMap((part) => bindings(part, value, vars));
      return [
        ...new Map(
          found.map((answered) => [
            keyOf(Object.fromEntries(answered)),
            answered,
          ])
        ).values(),
      ];
    }
    default:
      return fits(shape, value) ? [vars] : [];
  }
};

/** True when a shape has the relation `even` somewhere in it. */
export const asksEven = (shape: Shape): boolean => {
  switch (shape.kind) {
    case "member":
      return true;
    case "record":
      return Object.values(shape.fields).some((field) => asksEven(field.shape));
    case "tuple":
      return shape.items.some(asksEven);
    case "arrayOf":
    case "recordOf":
      return asksEven(shape.item);
    case "allOf":
    case "anyOf":
      return shape.parts.some(asksEven);
    default:
      return false;
  }
};

/** A misfit as text, to compare the model's with the problems Lion reports. */
export const misfitKey = ({ kind, path }: Misfit) =>
  `${JSON.stringify(path)} ${kind}`;

/** The misfit a reported problem is, by which of its parts it has. */
export const misfitOfProblem = (problem: {
  readonly expected?: unknown;
  readonly found?: unknown;
  readonly path: Path;
}): Misfit => {
  if (!("expected" in problem)) {
    return { kind: "extra", path: problem.path };
  }
  return { kind: "found" in problem ? "wrong" : "missing", path: problem.path };
};

const integer = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

const constant = <A>(value: A): Arbitrary.Arbitrary<A> =>
  Arbitrary.Constant(value);

const KEYS = ["a", "b", "id"] as const;

/**
 * Strings that are also the names of things: a function, a relation, a
 * schema, a variable. As data they must stay strings.
 */
const STRINGS = [
  "a",
  "open",
  "value/number?",
  "even",
  "Tree",
  "Loop",
  "Maybe",
  "?v",
  "limit",
];

const text = element(STRINGS);

const primitive: Arbitrary.Arbitrary<Json> = oneOf<Json>(
  integer(-3, 5),
  integer(-3, 5),
  text,
  text,
  constant(1.5),
  constant(true),
  constant(false),
  constant(null)
);

const recordFrom = <A>(value: Arbitrary.Arbitrary<A>) =>
  Arbitrary.map(
    Arbitrary.array(Arbitrary.all([element(KEYS), value]), { maxLength: 3 }),
    (entries) => Object.fromEntries(entries)
  );

/** JSON data, nested at most `depth` deep. */
export const json = (depth: number): Arbitrary.Arbitrary<Json> => {
  if (depth === 0) {
    return primitive;
  }
  const inner = json(depth - 1);
  return oneOf<Json>(
    primitive,
    primitive,
    Arbitrary.array(inner, { maxLength: 3 }),
    recordFrom(inner)
  );
};

const known: Arbitrary.Arbitrary<Shape> = oneOf<Shape>(
  Arbitrary.map(
    element(Object.keys(PREDICATES) as (keyof typeof PREDICATES)[]),
    (name): Shape => ({ kind: "predicate", name })
  ),
  Arbitrary.map(primitive, (value): Shape => ({ kind: "literal", value })),
  Arbitrary.map(json(1), (value): Shape => ({ kind: "literal", value })),
  Arbitrary.map(integer(-2, 3), (limit): Shape => ({ kind: "above", limit })),
  constant<Shape>({ kind: "below" }),
  Arbitrary.map(text, (value): Shape => ({ kind: "equals", text: value })),
  constant<Shape>({ kind: "member" }),
  constant<Shape>({ kind: "tree" }),
  constant<Shape>({ kind: "loop" }),
  constant<Shape>({ kind: "maybe" }),
  constant<Shape>({ kind: "loose" })
);

/** The names of the variables a generated pattern uses. */
export const VARIABLES = ["x", "y"];

const hole: Arbitrary.Arbitrary<Shape> = oneOf<Shape>(
  Arbitrary.map(
    element(VARIABLES),
    (name): Shape => ({ kind: "variable", name })
  ),
  Arbitrary.map(
    element(VARIABLES),
    (name): Shape => ({ kind: "variable", name })
  ),
  constant<Shape>({ kind: "wildcard" })
);

/**
 * A schema with logic variables in it, nested at most `depth` deep: a
 * pattern, which binds its variables to the parts of a value that fits.
 */
export const pattern = (depth: number): Arbitrary.Arbitrary<Shape> =>
  shape(depth, oneOf(known, hole, hole));

/** A schema nested at most `depth` deep. */
export const shape = (
  depth: number,
  leaf: Arbitrary.Arbitrary<Shape> = known
): Arbitrary.Arbitrary<Shape> => {
  if (depth === 0) {
    return leaf;
  }
  const inner = shape(depth - 1, leaf);
  const several = Arbitrary.array(inner, { maxLength: 3 });
  const field = Arbitrary.map(
    Arbitrary.all([inner, integer(0, 2)]),
    ([part, roll]): Field => ({ optional: roll === 0, shape: part })
  );
  return oneOf<Shape>(
    leaf,
    Arbitrary.map(
      Arbitrary.all([recordFrom(field), integer(0, 2)]),
      ([fields, roll]): Shape => ({ kind: "record", open: roll === 0, fields })
    ),
    Arbitrary.map(
      Arbitrary.all([recordFrom(field), integer(0, 2)]),
      ([fields, roll]): Shape => ({ kind: "record", open: roll === 0, fields })
    ),
    Arbitrary.map(several, (items): Shape => ({ kind: "tuple", items })),
    Arbitrary.map(inner, (item): Shape => ({ kind: "arrayOf", item })),
    Arbitrary.map(inner, (item): Shape => ({ kind: "recordOf", item })),
    Arbitrary.map(several, (parts): Shape => ({ kind: "anyOf", parts })),
    Arbitrary.map(several, (parts): Shape => ({ kind: "allOf", parts }))
  );
};

const tree = (depth: number): Arbitrary.Arbitrary<Json> =>
  Arbitrary.map(
    Arbitrary.all([
      integer(-3, 5),
      depth === 0
        ? constant<Json[]>([])
        : Arbitrary.array(tree(depth - 1), { maxLength: 2 }),
    ]),
    ([value, children]): Json => ({ value, children })
  );

const FITTING: Record<keyof typeof PREDICATES, Arbitrary.Arbitrary<Json>> = {
  "value/number?": oneOf<Json>(integer(-3, 5), constant(1.5)),
  "value/integer?": integer(-3, 5),
  "value/string?": text,
  "value/boolean?": element<Json>([true, false]),
  "value/null?": constant<Json>(null),
  "value/array?": Arbitrary.array(primitive, { maxLength: 2 }),
  "value/object?": recordFrom(primitive),
  "value/any?": json(1),
  "value/identity": constant<Json>(true),
};

/** A value made to fit a shape, where one can be made by its parts. */
const fitting = (given: Shape): Arbitrary.Arbitrary<Json> => {
  switch (given.kind) {
    case "predicate":
      return FITTING[given.name];
    case "literal":
      return constant(given.value);
    case "above":
      return integer(given.limit + 1, given.limit + 3);
    case "below":
      return integer(LIMIT - 3, LIMIT - 1);
    case "equals":
      return constant<Json>(given.text);
    case "member":
      return element<Json>(EVEN);
    case "tree":
    case "loose":
      return tree(2);
    case "loop":
      return constant<Json>(1);
    case "variable":
    case "wildcard":
      return json(1);
    case "maybe":
      return text;
    case "record":
      return Arbitrary.map(
        Arbitrary.all([
          Arbitrary.all(
            Object.entries(given.fields).map(([key, field]) =>
              Arbitrary.all([
                constant(key),
                fitting(field.shape),
                integer(0, 2),
              ])
            )
          ),
          integer(0, 3),
        ]),
        ([entries, roll]): Json => ({
          // Now and then a key the shape does not name, or one left out.
          ...(roll === 0 ? { extra: 1 } : {}),
          ...Object.fromEntries(
            entries.flatMap(([key, value, keep]) =>
              (given.fields[key]?.optional ||
                given.fields[key]?.shape.kind === "maybe") &&
              keep === 0
                ? []
                : [[key, value]]
            )
          ),
        })
      );
    case "tuple":
      return Arbitrary.map(
        Arbitrary.all(given.items.map(fitting)),
        (items): Json => items
      );
    case "arrayOf":
      return Arbitrary.array(fitting(given.item), { maxLength: 3 });
    case "recordOf":
      return recordFrom(fitting(given.item));
    default: {
      const [first, ...rest] = given.parts.map(fitting);
      return first === undefined ? json(1) : oneOf(first, ...rest);
    }
  }
};

const pathsOf = (value: Json, path: Path = []): Path[] => [
  path,
  ...(Array.isArray(value)
    ? value.flatMap((item: Json, at) => pathsOf(item, [...path, at]))
    : []),
  ...(isRecord(value)
    ? Object.entries(value).flatMap(([key, item]) =>
        pathsOf(item, [...path, key])
      )
    : []),
];

const changeAt = (
  value: Json,
  path: Path,
  change: (part: Json) => Json | undefined
): Json | undefined => {
  const [step, ...rest] = path;
  if (step === undefined) {
    return change(value);
  }
  if (Array.isArray(value)) {
    const items = value.flatMap((item: Json, at): Json[] => {
      const next = at === step ? changeAt(item, rest, change) : item;
      return next === undefined ? [] : [next];
    });
    return items;
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]): [string, Json][] => {
      const next = key === step ? changeAt(item, rest, change) : item;
      return next === undefined ? [] : [[key, next]];
    })
  );
};

/** A value with one part replaced, removed, or given a key it did not have. */
const broken = (value: Arbitrary.Arbitrary<Json>) =>
  Arbitrary.map(
    Arbitrary.all([value, integer(0, 50), integer(0, 2), json(1)]),
    ([whole, pick, how, other]): Json => {
      const paths = pathsOf(whole);
      const path = paths[pick % paths.length] ?? [];
      const changed = changeAt(whole, path, (part) => {
        if (how === 0) {
          return other;
        }
        if (how === 1) {
          return undefined;
        }
        return isRecord(part) ? { ...part, extra: other } : other;
      });
      return changed === undefined ? other : changed;
    }
  );

/**
 * A value to check against a shape: one made to fit it, one of those with a
 * part changed, or any JSON data.
 */
export const valueFor = (given: Shape): Arbitrary.Arbitrary<Json> => {
  const made = fitting(given);
  return oneOf(made, made, broken(made), broken(made), json(2));
};

export interface Case {
  readonly shape: Shape;
  readonly value: Json;
}

/** The names the prelude binds, which as data are plain strings. */
export const BOUND = ["even", "limit", "Tree", "Loop", "Maybe"];

/**
 * Data that holds a string which is also a bound name, with a value that
 * would fit what the name stands for.
 */
export const namesAsData: Arbitrary.Arbitrary<Case> = Arbitrary.map(
  Arbitrary.all([
    element(BOUND),
    integer(0, 2),
    oneOf<Json>(json(1), fitting({ kind: "tree" }), constant<Json>(1)),
  ]),
  ([name, nesting, inner]): Case => {
    const wrap = (part: Json): Json =>
      [part, [part], { a: part }][nesting] as Json;
    return {
      shape: { kind: "literal", value: wrap(name) },
      value: wrap(inner),
    };
  }
);

/** A schema with a value to check against it. */
export const checked = (depth = 2): Arbitrary.Arbitrary<Case> =>
  Arbitrary.flatMap(shape(depth), (given) =>
    Arbitrary.map(valueFor(given), (value): Case => ({ shape: given, value }))
  );

export interface Cases {
  readonly shape: Shape;
  readonly values: readonly Json[];
}

/** A schema with several values to check against it. */
export const checkedMany = (depth = 2): Arbitrary.Arbitrary<Cases> =>
  Arbitrary.flatMap(shape(depth), (given) =>
    Arbitrary.map(
      Arbitrary.array(valueFor(given), { minLength: 1, maxLength: 5 }),
      (values): Cases => ({ shape: given, values })
    )
  );

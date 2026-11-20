/**
 * Symbolic values, and the shapes schemas give them.
 *
 * A symbolic value is what a variable that a schema types, and that no
 * goal binds, stands for: a number as a sum of the solver's variables, a
 * truth as the constraints under which it holds, a value as it is, or a
 * record or list of these. A schema that cannot list the values it allows
 * can still give them a shape: `value/integer?` stands for a whole number,
 * `value/number?` for any number, a record or list of schemas for a record
 * or list of what its parts stand for, `schema/anyOf` for any of its
 * schemas' shapes, and a list of at most so many items for a list of each
 * length up to that. `logic/symbolic.ts` works goals out on these values.
 */
import { LogicError } from "@/errors/evaluation";
import {
  type Constraint,
  compare,
  constant,
  fromNumber,
  type Linear,
  minus,
  negate,
  ONE,
  type Rational,
  type Sort,
  times,
  toNumber,
  type Values,
  valueAt,
  variable,
  ZERO,
} from "@/logic/solver";
import {
  allowedBy,
  buildOf,
  isPlainObject,
  nameOf,
  type SchemaInfo,
  sameValue,
  schemaOf,
  show,
} from "@/logic/terms";

/** Constraints that hold in any one of several ways: an `or` of `and`s. */
export type Formula = readonly (readonly Constraint[])[];

export const TRUE: Formula = [[]];
export const FALSE: Formula = [];

/** The most ways a formula may hold, so that working it out ends soon. */
export const MOST_WAYS = 4096;

export const tooManyWays = () =>
  new LogicError({
    message: `The goals about values no goal binds split into more than ${MOST_WAYS.toLocaleString("en")} cases. Narrow the question.`,
  });

export const and = (a: Formula, b: Formula): Formula => {
  if (a.length * b.length > MOST_WAYS) {
    throw tooManyWays();
  }
  return a.flatMap((x) => b.map((y) => [...x, ...y]));
};

export const or = (a: Formula, b: Formula): Formula => {
  if (a.length + b.length > MOST_WAYS) {
    throw tooManyWays();
  }
  return [...a, ...b];
};

const opposite = ({ linear, relation }: Constraint): Constraint => {
  switch (relation) {
    case ">=":
      return { linear: times(linear, negate(ONE)), relation: ">" };
    case ">":
      return { linear: times(linear, negate(ONE)), relation: ">=" };
    case "=":
      return { linear, relation: "!=" };
    default:
      return { linear, relation: "=" };
  }
};

export const not = (a: Formula): Formula =>
  a.reduce<Formula>(
    (sofar, conjunction) =>
      and(
        sofar,
        conjunction.map((c) => [opposite(c)])
      ),
    TRUE
  );

/** What a symbolic value is: a number, a truth, a value, or a record or list of these. */
export type Sym =
  | { readonly kind: "number"; readonly linear: Linear }
  | { readonly kind: "truth"; readonly formula: Formula }
  | { readonly kind: "value"; readonly value: unknown }
  | { readonly kind: "record"; readonly fields: ReadonlyMap<string, Sym> }
  | { readonly kind: "list"; readonly items: readonly Sym[] }
  /**
   * A lambda written where the solver runs, over values it works out: its
   * body runs on the arguments it is given, in the scope it was written in.
   */
  | {
      readonly kind: "closure";
      readonly apply: (args: readonly Sym[], depth: number) => unknown;
    };

/** A value in each of several cases, each with when it holds. */
export type Cases = readonly { readonly when: Formula; readonly sym: Sym }[];

export const one = (sym: Sym): Cases => [{ sym, when: TRUE }];

export const numberSym = (linear: Linear): Sym => ({ kind: "number", linear });

export const truthSym = (formula: Formula): Sym => ({ formula, kind: "truth" });

/** A value as a symbolic value: a number as a sum, a truth as a formula. */
export const fromValue = (value: unknown): Sym => {
  if (typeof value === "number") {
    return numberSym(constant(fromNumber(value)));
  }
  if (typeof value === "boolean") {
    return truthSym(value ? TRUE : FALSE);
  }
  return { kind: "value", value };
};

/** The value a symbolic value has once its variables have values; undefined when one has none. */
export const concrete = (sym: Sym, values: Values): unknown => {
  switch (sym.kind) {
    case "number": {
      const value = valueAt(sym.linear, values);
      return value === undefined ? undefined : toNumber(value);
    }
    case "truth":
      return sym.formula.some((conjunction) =>
        conjunction.every((c) => {
          const value = valueAt(c.linear, values);
          return value !== undefined && meetsValue(c, value);
        })
      );
    case "value":
      return sym.value;
    case "closure":
      return undefined;
    case "record": {
      const out: Record<string, unknown> = {};
      for (const [key, field] of sym.fields) {
        const value = concrete(field, values);
        if (value === undefined) {
          return undefined;
        }
        out[key] = value;
      }
      return out;
    }
    default: {
      const items = sym.items.map((item) => concrete(item, values));
      return items.includes(undefined) ? undefined : items;
    }
  }
};

const meetsValue = (c: Constraint, value: Rational) => {
  const sign = compare(value, ZERO);
  switch (c.relation) {
    case ">=":
      return sign >= 0;
    case ">":
      return sign > 0;
    case "=":
      return sign === 0;
    default:
      return sign !== 0;
  }
};

/** The solver variables a symbolic value holds. */
export const leavesOf = (sym: Sym): string[] => {
  switch (sym.kind) {
    case "number":
      return [...sym.linear.coefficients.keys()];
    case "truth":
      return sym.formula.flatMap((conjunction) =>
        conjunction.flatMap((c) => [...c.linear.coefficients.keys()])
      );
    case "value":
    case "closure":
      return [];
    case "record":
      return [...sym.fields.values()].flatMap(leavesOf);
    default:
      return sym.items.flatMap(leavesOf);
  }
};

/** The formula that two symbolic values are the same value. */
export const equal = (a: Sym, b: Sym): Formula => {
  if (a.kind === "number" && b.kind === "number") {
    return [[{ linear: minus(a.linear, b.linear), relation: "=" }]];
  }
  if (a.kind === "truth" && b.kind === "truth") {
    return or(and(a.formula, b.formula), and(not(a.formula), not(b.formula)));
  }
  if (a.kind === "record" || b.kind === "record") {
    const [left, right] = [fieldsOf(a), fieldsOf(b)];
    if (
      left === undefined ||
      right === undefined ||
      left.size !== right.size ||
      ![...left.keys()].every((key) => right.has(key))
    ) {
      return FALSE;
    }
    return [...left].reduce<Formula>(
      (sofar, [key, field]) => and(sofar, equal(field, right.get(key) as Sym)),
      TRUE
    );
  }
  if (a.kind === "list" || b.kind === "list") {
    const [left, right] = [itemsOf(a), itemsOf(b)];
    if (
      left === undefined ||
      right === undefined ||
      left.length !== right.length
    ) {
      return FALSE;
    }
    return left.reduce<Formula>(
      (sofar, item, at) => and(sofar, equal(item, right[at] as Sym)),
      TRUE
    );
  }
  if (a.kind === "value" && b.kind === "value") {
    return sameValue(a.value, b.value) ? TRUE : FALSE;
  }
  // A number or a truth is never the same as a value of another kind.
  return FALSE;
};

export const fieldsOf = (sym: Sym): ReadonlyMap<string, Sym> | undefined => {
  if (sym.kind === "record") {
    return sym.fields;
  }
  if (sym.kind === "value" && isPlainObject(sym.value)) {
    return new Map(
      Object.entries(sym.value).map(([key, value]) => [key, fromValue(value)])
    );
  }
  return undefined;
};

export const itemsOf = (sym: Sym): readonly Sym[] | undefined => {
  if (sym.kind === "list") {
    return sym.items;
  }
  if (sym.kind === "value" && Array.isArray(sym.value)) {
    return sym.value.map(fromValue);
  }
  return undefined;
};

/** Every way of choosing one case of each, with when all of them hold. */
export const product = (
  all: readonly Cases[]
): readonly { when: Formula; syms: Sym[] }[] => {
  let out: { when: Formula; syms: Sym[] }[] = [{ syms: [], when: TRUE }];
  for (const cases of all) {
    const next: { when: Formula; syms: Sym[] }[] = [];
    for (const sofar of out) {
      for (const { sym, when } of cases) {
        const both = and(sofar.when, when);
        if (both.length > 0) {
          next.push({ syms: [...sofar.syms, sym], when: both });
        }
        // Stops at the first way past the most, before making the rest.
        if (next.length > MOST_WAYS) {
          throw tooManyWays();
        }
      }
    }
    out = next;
  }
  return out;
};

/** Whether a symbolic value holds a lambda the solver runs, which has no plain value. */
const holdsClosure = (sym: Sym): boolean => {
  switch (sym.kind) {
    case "closure":
      return true;
    case "record":
      return [...sym.fields.values()].some(holdsClosure);
    case "list":
      return sym.items.some(holdsClosure);
    default:
      return false;
  }
};

export const isConcrete = (sym: Sym) =>
  leavesOf(sym).length === 0 && !holdsClosure(sym);

/** A value that has no unknown in it, as a plain value. */
export const plainOf = (sym: Sym): unknown => concrete(sym, new Map());

/** What a schema is through its names. */
export const throughNames = (
  schema: unknown,
  seen = new Set<unknown>()
): unknown => {
  const named = schemaOf(schema);
  if (named?.shape === undefined || seen.has(schema)) {
    return schema;
  }
  seen.add(schema);
  return throughNames(named.shape, seen);
};

// Shapes: what a schema stands for when it cannot list its values.

/** A schema that cannot give its values a shape, and why. */
export class Shapeless {
  readonly why: string;
  constructor(why: string) {
    this.why = why;
  }
}

/** A shape in each of several cases, with the sorts of its numbers. */
interface Shaped {
  readonly cases: readonly { readonly when: Formula; readonly sym: Sym }[];
  /** True when some number in it is unknown, so it cannot simply be listed. */
  readonly unknown: boolean;
}

const MOST_SHAPES = 4096;

/**
 * What a schema stands for as symbolic values, with a fresh variable of
 * the solver for each number it leaves open, named by where it stands under
 * `path`. Fails, saying why, when the schema cannot give its values a shape.
 */
export const shapeOf = (
  schema: unknown,
  path: string,
  sorts: Map<string, Sort>,
  seen: ReadonlySet<SchemaInfo>
): Shaped | Shapeless => {
  const named = schemaOf(schema);
  if (named !== undefined) {
    if (named.definition === undefined) {
      return new Shapeless(`"${named.name}" is still being declared`);
    }
    if (seen.has(named)) {
      return new Shapeless(
        `"${named.name}" names itself, so it allows values of any size`
      );
    }
    return shapeOf(named.shape, path, sorts, new Set([...seen, named]));
  }
  if (typeof schema === "function") {
    const allowed = allowedBy(schema);
    if (allowed !== undefined) {
      return {
        cases: allowed.map((v) => ({ sym: fromValue(v), when: TRUE })),
        unknown: false,
      };
    }
    const name = nameOf(schema);
    if (name === "value/integer?" || name === "value/number?") {
      const sort: Sort = name === "value/integer?" ? "integer" : "real";
      sorts.set(path, sort);
      return {
        cases: [{ sym: numberSym(variable(path)), when: TRUE }],
        unknown: true,
      };
    }
    const built = buildOf(schema);
    if (built !== undefined) {
      return shapeBuilt(nameOf(built.by), built.args, path, sorts, seen);
    }
    return new Shapeless(
      `${show(schema)} is a predicate, which says neither which values it accepts nor what kind they are`
    );
  }
  if (isPlainObject(schema)) {
    return shapeRecord(Object.entries(schema), undefined, path, sorts, seen);
  }
  if (Array.isArray(schema)) {
    return shapeList(schema, path, sorts, seen);
  }
  return { cases: [{ sym: fromValue(schema), when: TRUE }], unknown: false };
};

export const combine = (
  parts: readonly Shaped[],
  build: (syms: Sym[]) => Sym
): Shaped => {
  let out: { when: Formula; syms: Sym[] }[] = [{ syms: [], when: TRUE }];
  for (const part of parts) {
    out = out.flatMap((sofar) =>
      part.cases.map((each) => ({
        syms: [...sofar.syms, each.sym],
        when: and(sofar.when, each.when),
      }))
    );
    if (out.length > MOST_SHAPES) {
      throw tooManyWays();
    }
  }
  return {
    cases: out.map(({ syms, when }) => ({ sym: build(syms), when })),
    unknown: parts.some((part) => part.unknown),
  };
};

const shapeRecord = (
  fields: readonly (readonly [string, unknown])[],
  rest: Shaped | undefined,
  path: string,
  sorts: Map<string, Sort>,
  seen: ReadonlySet<SchemaInfo>
): Shaped | Shapeless => {
  const parts: Shaped[] = [];
  const optional: boolean[] = [];
  for (const [key, part] of fields) {
    const built = buildOf(throughNames(part));
    const inner =
      built !== undefined && nameOf(built.by) === "schema/optional"
        ? built.args[0]
        : undefined;
    const shaped = shapeOf(inner ?? part, `${path}.${key}`, sorts, seen);
    if (shaped instanceof Shapeless) {
      return shaped;
    }
    // An optional key is there or not: a missing one is a case of its own.
    parts.push(
      inner === undefined
        ? shaped
        : {
            cases: [
              ...shaped.cases,
              { sym: { kind: "value", value: MISSING }, when: TRUE },
            ],
            unknown: shaped.unknown,
          }
    );
    optional.push(inner !== undefined);
  }
  const keys = fields.map(([key]) => key);
  const record = combine(parts, (syms) => ({
    fields: new Map(
      keys.flatMap((key, at): [string, Sym][] => {
        const sym = syms[at] as Sym;
        return sym.kind === "value" && sym.value === MISSING
          ? []
          : [[key, sym]];
      })
    ),
    kind: "record",
  }));
  if (rest === undefined) {
    return record;
  }
  return combine([record, rest], ([named, other]) => ({
    fields: new Map([
      ...(other?.kind === "record" ? other.fields : []),
      ...(named?.kind === "record" ? named.fields : []),
    ]),
    kind: "record",
  }));
};

const MISSING = Symbol("missing");

export const shapeList = (
  items: readonly unknown[],
  path: string,
  sorts: Map<string, Sort>,
  seen: ReadonlySet<SchemaInfo>
): Shaped | Shapeless => {
  const parts: Shaped[] = [];
  for (const [at, item] of items.entries()) {
    const shaped = shapeOf(item, `${path}.${at}`, sorts, seen);
    if (shaped instanceof Shapeless) {
      return shaped;
    }
    parts.push(shaped);
  }
  return combine(parts, (syms) => ({ items: syms, kind: "list" }));
};

/**
 * The cases of every shape, as one shape; the first that cannot stand, when
 * one cannot. The shapes are made one at a time, so none after it is.
 */
const union = (shapes: Iterable<Shaped | Shapeless>): Shaped | Shapeless => {
  const cases: { when: Formula; sym: Sym }[] = [];
  let unknown = false;
  for (const shaped of shapes) {
    if (shaped instanceof Shapeless) {
      return shaped;
    }
    cases.push(...shaped.cases);
    unknown ||= shaped.unknown;
    if (cases.length > MOST_SHAPES) {
      throw tooManyWays();
    }
  }
  return { cases, unknown };
};

function* shapesOf(
  parts: readonly unknown[],
  path: string,
  sorts: Map<string, Sort>,
  seen: ReadonlySet<SchemaInfo>
): Generator<Shaped | Shapeless> {
  for (const [at, part] of parts.entries()) {
    yield shapeOf(part, `${path}/${at}`, sorts, seen);
  }
}

function* listsUpTo(
  item: unknown,
  most: number,
  path: string,
  sorts: Map<string, Sort>,
  seen: ReadonlySet<SchemaInfo>
): Generator<Shaped | Shapeless> {
  for (let length = 0; length <= most; length += 1) {
    const items = Array.from({ length }, () => item);
    yield shapeList(items, `${path}#${length}`, sorts, seen);
  }
}

/** The first part of a schema/allOf that gives a shape gives it; the others are checked. */
const shapeAll = (
  parts: readonly unknown[],
  path: string,
  sorts: Map<string, Sort>,
  seen: ReadonlySet<SchemaInfo>
): Shaped | Shapeless => {
  for (const part of parts) {
    const shaped = shapeOf(part, path, sorts, seen);
    if (!(shaped instanceof Shapeless)) {
      return shaped;
    }
  }
  return new Shapeless("no part of schema/allOf says what kind its values are");
};

const shapeOpen = (
  [shape, ...rest]: readonly unknown[],
  path: string,
  sorts: Map<string, Sort>,
  seen: ReadonlySet<SchemaInfo>
): Shaped | Shapeless => {
  if (rest.length === 0) {
    return new Shapeless(
      "schema/open with no schema for the rest allows any other keys or items"
    );
  }
  const restShape = shapeOf(rest[0], `${path}.~`, sorts, seen);
  if (restShape instanceof Shapeless) {
    return restShape;
  }
  const items = throughNames(shape);
  if (isPlainObject(items)) {
    return shapeRecord(Object.entries(items), restShape, path, sorts, seen);
  }
  if (!Array.isArray(items)) {
    return new Shapeless(
      "schema/open is not given a record or a list of schemas"
    );
  }
  const named = shapeList(items, path, sorts, seen);
  if (named instanceof Shapeless) {
    return named;
  }
  return combine([named, restShape], ([a, b]) => ({
    items: [
      ...(a?.kind === "list" ? a.items : []),
      ...(b?.kind === "list" ? b.items : []),
    ],
    kind: "list",
  }));
};

const shapeBuilt = (
  name: string | undefined,
  args: readonly unknown[],
  path: string,
  sorts: Map<string, Sort>,
  seen: ReadonlySet<SchemaInfo>
): Shaped | Shapeless => {
  switch (name) {
    case "schema/anyOf":
      return union(shapesOf(args, path, sorts, seen));
    case "schema/allOf":
      return shapeAll(args, path, sorts, seen);
    case "schema/optional":
      return shapeOf(args[0], path, sorts, seen);
    case "schema/arrayOf": {
      const [item, most] = args;
      return most === undefined
        ? new Shapeless(
            "schema/arrayOf with no most length allows lists of any length"
          )
        : union(listsUpTo(item, most as number, path, sorts, seen));
    }
    case "schema/open":
      return shapeOpen(args, path, sorts, seen);
    default:
      return new Shapeless(
        `${name ?? "this schema"} does not say what kind its values are`
      );
  }
};

/**
 * Why a schema cannot stand for symbolic values, or undefined when it can
 * and leaves some number open, so a variable it types is solved for.
 */
export const symbolic = (schema: unknown): string | undefined => {
  try {
    const shaped = shapeOf(schema, "v", new Map(), new Set());
    if (shaped instanceof Shapeless) {
      return shaped.why;
    }
    return shaped.unknown ? undefined : "it leaves no number open";
  } catch (error) {
    return error instanceof LogicError ? error.message : String(error);
  }
};

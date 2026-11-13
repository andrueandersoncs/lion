/**
 * Schemas that name each other. One `schema` form declares several schemas,
 * and the shape of each can name any of them, so a schema can be defined in
 * terms of one that is defined in terms of it. What fits is the least that
 * the shapes allow: a value fits only when that follows from the shapes in
 * finitely many steps. A model works that out from the bottom up, which the
 * engine does from the top down.
 *
 * What a name means is settled when a shape is declared, and never changes
 * after: a name that nothing has yet is a plain string, and then nothing can
 * be declared under it.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect } from "effect";
import { LogicDatabase } from "@/logic/database";
import { loadDatabase, saveDatabase } from "@/logic/snapshot";
import { stdlib } from "@/modules";
import { attempt, element, type Outcome, oneOf } from "./programs";
import {
  fits,
  type Json,
  json,
  keyOf,
  lion,
  PRELUDE,
  quote,
  type Shape,
  shape,
  valueFor,
} from "./shapes";

type Form = unknown;

const OPTIONS = { timeout: 120_000, arbitrary: { runs: 300 } };

/** What the shape of a schema in a group is made of. */
type Body =
  | { readonly kind: "all" | "any"; readonly parts: readonly Body[] }
  | { readonly kind: "leaf"; readonly shape: Shape }
  | { readonly kind: "list"; readonly item: Body }
  /** `schema/open` around the name of a schema of the group. */
  | { readonly kind: "open"; readonly to: number }
  | {
      readonly kind: "record";
      readonly fields: Readonly<Record<string, Body>>;
      readonly open: boolean;
    }
  /** The name of a schema of the group. */
  | { readonly kind: "ref"; readonly to: number };

type Grammar = readonly Body[];

const nameOf = (at: number) => `G${at}`;

/**
 * The Lion expression for a body. `named` says which schemas of the group a
 * name reaches: any other is written as the name alone, which is then a
 * plain string, or inside `quote` when `quoted`.
 */
const written = (
  body: Body,
  named: (at: number) => boolean = () => true,
  quoted = false
): unknown => {
  const inner = (part: Body) => written(part, named, quoted);
  switch (body.kind) {
    case "ref":
      return quoted && !named(body.to)
        ? quote(nameOf(body.to))
        : nameOf(body.to);
    case "open":
      return ["schema/open", nameOf(body.to)];
    case "leaf":
      return lion(body.shape);
    case "list":
      return ["schema/arrayOf", inner(body.item)];
    case "any":
      return ["schema/anyOf", ...body.parts.map(inner)];
    case "all":
      return ["schema/allOf", ...body.parts.map(inner)];
    default: {
      const record = Object.fromEntries(
        Object.entries(body.fields).map(([key, part]) => [key, inner(part)])
      );
      return body.open ? ["schema/open", record] : record;
    }
  }
};

const isRecord = (value: Json): value is { readonly [key: string]: Json } =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A value and every part of it. */
const partsOf = (value: Json): Json[] => [
  value,
  ...(typeof value === "object" && value !== null
    ? Object.values(value).flatMap(partsOf)
    : []),
];

const pair = (at: number, value: Json) => `${at}:${keyOf(value)}`;

/**
 * Whether a record's key with this body can be left out: when the body is
 * an optional schema, also through the names that lead to one. Names that
 * only lead back to each other lead to none.
 */
const canBeLeftOut = (
  grammar: Grammar,
  body: Body,
  named: (at: number) => boolean,
  seen: readonly number[] = []
): boolean => {
  if (body.kind === "leaf") {
    return body.shape.kind === "maybe";
  }
  return (
    body.kind === "ref" &&
    named(body.to) &&
    !seen.includes(body.to) &&
    canBeLeftOut(grammar, grammar[body.to] as Body, named, [...seen, body.to])
  );
};

/**
 * Whether a value fits a body, given the pairs of a schema and a value
 * already known to fit. `named` says which names reach a schema; any other
 * name is the string, which only the string itself fits.
 */
const holds = (
  grammar: Grammar,
  body: Body,
  value: Json,
  known: ReadonlySet<string>,
  named: (at: number) => boolean
): boolean => {
  const inner = (part: Body, item: Json) =>
    holds(grammar, part, item, known, named);
  const record = (
    fields: Readonly<Record<string, Body>>,
    open: boolean
  ): boolean =>
    isRecord(value) &&
    Object.entries(fields).every(([key, part]) =>
      Object.hasOwn(value, key)
        ? inner(part, value[key] as Json)
        : canBeLeftOut(grammar, part, named)
    ) &&
    (open || Object.keys(value).every((key) => Object.hasOwn(fields, key)));
  switch (body.kind) {
    case "ref":
      return named(body.to)
        ? known.has(pair(body.to, value))
        : value === nameOf(body.to);
    case "open": {
      const target = grammar[body.to] as Body;
      return target.kind === "record" && record(target.fields, true);
    }
    case "leaf":
      return fits(body.shape, value);
    case "list":
      return (
        Array.isArray(value) && value.every((item) => inner(body.item, item))
      );
    case "any":
      return body.parts.some((part) => inner(part, value));
    case "all":
      return body.parts.every((part) => inner(part, value));
    default:
      return record(body.fields, body.open);
  }
};

/**
 * The pairs of a schema and a part of the values where the part fits:
 * nothing to begin with, and then whatever follows, until nothing more does.
 */
const fitting = (
  grammar: Grammar,
  values: readonly Json[],
  named: (at: number) => boolean = () => true
): ReadonlySet<string> => {
  const parts = [
    ...new Map(
      values.flatMap(partsOf).map((part) => [keyOf(part), part])
    ).values(),
  ];
  const known = new Set<string>();
  for (let grew = true; grew; ) {
    grew = false;
    for (const [at, body] of grammar.entries()) {
      for (const part of parts) {
        const key = pair(at, part);
        if (!known.has(key) && holds(grammar, body, part, known, named)) {
          known.add(key);
          grew = true;
        }
      }
    }
  }
  return known;
};

const KEYS = ["a", "b", "id"] as const;

/**
 * A body nested at most `depth` deep, which names the first `reach` schemas
 * of the group. `opens` lets it put `schema/open` around a name. At the top
 * it is most often a record or a choice, so that names lead somewhere.
 */
const body = (
  depth: number,
  reach: number,
  opens: boolean,
  top = false
): Arbitrary.Arbitrary<Body> => {
  const to = element(Array.from({ length: reach }, (_, at) => at));
  const ref = Arbitrary.map(to, (at): Body => ({ kind: "ref", to: at }));
  const open = opens
    ? Arbitrary.map(to, (at): Body => ({ kind: "open", to: at }))
    : ref;
  const leaf = Arbitrary.map(
    shape(0),
    (given): Body => ({ kind: "leaf", shape: given })
  );
  if (depth === 0) {
    return oneOf(ref, ref, leaf, leaf, open);
  }
  const inner = body(depth - 1, reach, opens);
  const several = Arbitrary.array(inner, { minLength: 1, maxLength: 3 });
  const record = Arbitrary.map(
    Arbitrary.all([
      Arbitrary.array(Arbitrary.all([element(KEYS), inner]), { maxLength: 2 }),
      element([false, false, true]),
    ]),
    ([entries, more]): Body => ({
      kind: "record",
      fields: Object.fromEntries(entries),
      open: more,
    })
  );
  const any = Arbitrary.map(several, (parts): Body => ({ kind: "any", parts }));
  const list = Arbitrary.map(inner, (item): Body => ({ kind: "list", item }));
  return top
    ? oneOf<Body>(record, record, record, any, any, list, ref, open)
    : oneOf<Body>(
        ref,
        leaf,
        record,
        record,
        list,
        any,
        any,
        Arbitrary.map(several, (parts): Body => ({ kind: "all", parts })),
        open
      );
};

/** `schema/open` takes the name of a record: around any other, the name alone. */
const settled = (grammar: Grammar): Grammar => {
  const settle = (part: Body): Body => {
    switch (part.kind) {
      case "open": {
        const target = grammar[part.to] as Body;
        return target.kind === "record" && !target.open
          ? part
          : { kind: "ref", to: part.to };
      }
      case "list":
        return { ...part, item: settle(part.item) };
      case "any":
      case "all":
        return { ...part, parts: part.parts.map(settle) };
      case "record":
        return {
          ...part,
          fields: Object.fromEntries(
            Object.entries(part.fields).map(([key, field]) => [
              key,
              settle(field),
            ])
          ),
        };
      default:
        return part;
    }
  };
  return grammar.map(settle);
};

/**
 * A group of two or three schemas. The first `base` of them name only each
 * other, so they can be declared in a form of their own.
 */
const group = (opens = true) =>
  Arbitrary.flatMap(
    Arbitrary.all([element([2, 3]), element([1, 2])]),
    ([size, wanted]) => {
      const base = Math.min(wanted, size - 1);
      return Arbitrary.map(
        Arbitrary.all(
          Array.from({ length: size }, (_, at) =>
            body(2, at < base ? base : size, opens, true)
          )
        ),
        (bodies) => ({ base, grammar: settled(bodies) })
      );
    }
  );

/** A value made to fit a body, as far as `fuel` lets its names be followed. */
const made = (
  grammar: Grammar,
  given: Body,
  fuel: number
): Arbitrary.Arbitrary<Json> => {
  const inner = (part: Body) => made(grammar, part, fuel);
  const record = (
    fields: Readonly<Record<string, Body>>,
    open: boolean,
    left = fuel
  ) =>
    Arbitrary.map(
      Arbitrary.all([
        Arbitrary.all(
          Object.fromEntries(
            Object.entries(fields).map(([key, part]) => [
              key,
              made(grammar, part, left),
            ])
          )
        ),
        element([false, false, open]),
        json(0),
      ]),
      ([value, more, extra]): Json => (more ? { ...value, z: extra } : value)
    );
  if ((given.kind === "ref" || given.kind === "open") && fuel === 0) {
    return oneOf(json(1), Arbitrary.Constant<Json>(nameOf(given.to)));
  }
  switch (given.kind) {
    case "ref":
      return made(grammar, grammar[given.to] as Body, fuel - 1);
    case "open": {
      const target = grammar[given.to] as Body;
      return target.kind === "record"
        ? record(target.fields, true, fuel - 1)
        : json(1);
    }
    case "leaf":
      return valueFor(given.shape);
    case "list":
      return Arbitrary.array(inner(given.item), { maxLength: 2 });
    case "any":
      return oneOf(...given.parts.map(inner));
    case "all":
      return inner(given.parts[0] as Body);
    default:
      return record(given.fields, given.open);
  }
};

/** Values to check against the schemas of a group, many of which fit one. */
const valuesFor = (grammar: Grammar) =>
  Arbitrary.array(
    oneOf(
      ...grammar.flatMap((given) => [
        made(grammar, given, 3),
        made(grammar, given, 1),
      ]),
      json(2)
    ),
    { minLength: 1, maxLength: 4 }
  );

const checked = (opens = true) =>
  Arbitrary.flatMap(group(opens), (given) =>
    Arbitrary.map(valuesFor(given.grammar), (values) => ({ ...given, values }))
  );

/** One form that declares the schemas `from` up to `to` of a group. */
const declare = (grammar: Grammar, from = 0, to = grammar.length): Form => [
  "schema",
  ...grammar
    .slice(from, to)
    .flatMap((given, at) => [nameOf(from + at), written(given)]),
];

const evaluate = (forms: readonly Form[], database: LogicDatabase) =>
  attempt(["begin", ...PRELUDE, ...forms, true], database);

const resultOf = (outcome: Outcome): unknown => {
  expect(outcome).toMatchObject({ ok: true });
  return outcome.ok ? outcome.value : undefined;
};

const sorted = (keys: Iterable<string>) => [...new Set(keys)].sort();

const list = (items: readonly Form[]): Form => ["array/make", ...items];

/** Every way of asking whether the values fit the schemas of a group. */
const asks = (grammar: Grammar, values: readonly Json[]) => {
  const names = grammar.map((_, at) => nameOf(at));
  const each = (ask: (name: string, value: Json) => Form) =>
    list(values.map((value) => list(names.map((name) => ask(name, value)))));
  return {
    called: each((name, value) => [name, quote(value)]),
    problems: each((name, value) => [
      "array/length",
      ["schema/problems", quote(value), name],
    ]),
    found: list(
      names.map((name) => [
        "find",
        "?v",
        ["and", ["in", "?v", quote(values as Json)], [name, "?v"]],
      ])
    ),
    part: each((name, value) => [
      "schema/fits?",
      { held: quote(value) },
      { held: name },
    ]),
  };
};

/** What the model says each of those gives. */
const expected = (
  grammar: Grammar,
  values: readonly Json[],
  named?: (at: number) => boolean
) => {
  const known = fitting(grammar, values, named);
  return {
    fit: values.map((value) =>
      grammar.map((_, at) => known.has(pair(at, value)))
    ),
    found: grammar.map((_, at) =>
      sorted(values.filter((value) => known.has(pair(at, value))).map(keyOf))
    ),
  };
};

interface Asked {
  readonly called: unknown;
  readonly found: readonly unknown[][];
  readonly part: unknown;
  readonly problems: readonly number[][];
}

const agrees = (outcome: Outcome, model: ReturnType<typeof expected>): void => {
  const asked = resultOf(outcome) as Asked;
  expect(asked.called).toEqual(model.fit);
  expect(asked.part).toEqual(model.fit);
  expect(asked.problems.map((row) => row.map((count) => count === 0))).toEqual(
    model.fit
  );
  expect(asked.found.map((row) => sorted(row.map(keyOf)))).toEqual(model.found);
};

describe("schemas that name each other", () => {
  it.effect.prop(
    "fit what follows from their shapes, wherever it is asked",
    { given: checked(), goalDirected: element([true, false]) },
    ({ given: { grammar, values }, goalDirected }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase({ goalDirected });
        resultOf(yield* evaluate([declare(grammar)], database));
        const model = expected(grammar, values);
        const ask = asks(grammar, values);
        // In a later run the names are bound to the schemas.
        agrees(yield* attempt(ask, database), model);
        // A snapshot writes the schemas of one form as one form.
        const saved = yield* saveDatabase(database);
        const forms = saved.filter(
          (form) =>
            Array.isArray(form) &&
            form[0] === "schema" &&
            String(form[1]).startsWith("G")
        ) as unknown[][];
        expect(
          forms.map((form) => form.filter((_, at) => at % 2 === 1))
        ).toEqual([grammar.map((_, at) => nameOf(at))]);
        const loaded = yield* loadDatabase(saved, stdlib);
        expect(yield* saveDatabase(loaded)).toEqual(saved);
        agrees(yield* attempt(ask, loaded), model);
      }),
    OPTIONS
  );

  it.effect.prop(
    "can be declared again beside new ones, and a snapshot keeps them all",
    { given: checked() },
    ({ given: { base, grammar, values } }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        const model = expected(grammar, values);
        // The first schemas in a form of their own, and then every schema
        // in one form: those the database holds stay as they are.
        resultOf(yield* evaluate([declare(grammar, 0, base)], database));
        resultOf(yield* evaluate([declare(grammar)], database));
        const ask = asks(grammar, values);
        agrees(yield* attempt(ask, database), model);
        const saved = yield* saveDatabase(database);
        // Declaring any of it again changes nothing.
        resultOf(yield* evaluate([declare(grammar)], database));
        resultOf(yield* evaluate([declare(grammar, 0, base)], database));
        resultOf(
          yield* evaluate([declare(grammar, base, grammar.length)], database)
        );
        expect(yield* saveDatabase(database)).toEqual(saved);
        const loaded = yield* loadDatabase(saved, stdlib);
        expect(yield* saveDatabase(loaded)).toEqual(saved);
        agrees(yield* attempt(ask, loaded), model);
      }),
    OPTIONS
  );

  it.effect.prop(
    "a shape that calls a schema of its own form is refused, and nothing is declared",
    { given: checked(), value: json(1), nested: element([true, false]) },
    ({ given: { grammar }, value, nested }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        resultOf(yield* evaluate([], database));
        const saved = yield* saveDatabase(database);
        const calls = [nameOf(0), quote(value)];
        const outcome = yield* evaluate(
          [
            [
              ...(declare(grammar) as unknown[]),
              "Last",
              nested ? { a: ["schema/anyOf", 1, calls] } : calls,
            ],
          ],
          database
        );
        expect(outcome).toMatchObject({
          ok: false,
          message: expect.stringContaining(
            `Schema "${nameOf(0)}" is still being declared`
          ),
        });
        expect(yield* saveDatabase(database)).toEqual(saved);
        // The names are free for the same schemas without the call.
        resultOf(yield* evaluate([declare(grammar)], database));
      }),
    OPTIONS
  );
});

describe("a name that nothing has yet", () => {
  /** The schemas of a group that the first one names, besides itself. */
  const namedByFirst = (grammar: Grammar) => {
    const found = new Set<number>();
    const visit = (part: Body): void => {
      switch (part.kind) {
        case "ref":
          found.add(part.to);
          break;
        case "list":
          visit(part.item);
          break;
        case "any":
        case "all":
          part.parts.forEach(visit);
          break;
        case "record":
          Object.values(part.fields).forEach(visit);
          break;
        default:
      }
    };
    visit(grammar[0] as Body);
    found.delete(0);
    return [...found];
  };

  it.effect.prop(
    "is a plain string in a shape, and then nothing can be declared under it",
    {
      given: checked(false),
      quoted: element([true, false]),
      asRelation: element([true, false]),
    },
    ({ given: { grammar, values }, quoted, asRelation }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        // Only the first schema is declared, so the names of the others are
        // strings: written as they are, or inside `quote`.
        const first = (at: number) => at === 0;
        const [body0] = grammar as [Body, ...Body[]];
        resultOf(
          yield* evaluate(
            [["schema", nameOf(0), written(body0, first, quoted)]],
            database
          )
        );
        const ask = asks([body0], values);
        const model = expected([body0], values, first);
        agrees(yield* attempt(ask, database), model);
        const saved = yield* saveDatabase(database);
        for (const at of grammar.keys()) {
          if (at === 0) {
            continue;
          }
          const later = asRelation
            ? ["relation", nameOf(at), ["x"]]
            : ["schema", nameOf(at), written(grammar[at] as Body, first, true)];
          const outcome = yield* evaluate([later], database);
          const used = !quoted && namedByFirst(grammar).includes(at);
          expect(outcome.ok).toBe(!used);
          if (!outcome.ok) {
            expect(outcome.message).toContain(
              `"${nameOf(at)}" cannot be declared: schema "${nameOf(0)}" was declared with "${nameOf(at)}" as a plain string`
            );
            expect(outcome.message).toContain(`["quote", "${nameOf(at)}"]`);
            // A refused declaration changes nothing.
            expect(yield* saveDatabase(database)).toEqual(saved);
          }
        }
        // Whatever was declared after, the first schema means what it did.
        agrees(yield* attempt(ask, database), model);
      }),
    OPTIONS
  );
});

describe("schema/open around a name of its own form", () => {
  /** Shapes that are not a record of schemas, and do not name one. */
  const notRecord = Arbitrary.filter(
    shape(1),
    (given) =>
      !(
        given.kind === "tree" ||
        (given.kind === "record" && !given.open) ||
        (given.kind === "literal" && isRecord(given.value))
      )
  );

  it.effect.prop(
    "fails when a value is checked, if the name turned out not to be a record",
    { given: notRecord, value: json(1) },
    ({ given, value }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        // The same shape written out is refused where it is built.
        const direct = yield* evaluate(
          [["schema/open", lion(given)]],
          database
        );
        const message = expect.stringContaining(
          "schema/open expects a record of schemas, or a schema that names one"
        );
        expect(direct).toMatchObject({ ok: false, message });
        resultOf(
          yield* evaluate(
            [
              [
                "schema",
                "Wide",
                ["schema/open", "Narrow"],
                "Narrow",
                lion(given),
              ],
            ],
            database
          )
        );
        expect(yield* attempt(["Wide", quote(value)], database)).toMatchObject({
          ok: false,
          message,
        });
      }),
    OPTIONS
  );
});

/**
 * Patterns: a logic variable in a schema, a record, or a list stands for a
 * value. Once it is bound it is that value, and until then it takes the
 * value it meets. So a goal that binds a variable can take a value apart:
 * `schema/fits?`, "=", "in", and the arguments of a relation call. Each is
 * checked against a model that reads a generated pattern in plain
 * TypeScript, and against the same goal with its variables bound first.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect } from "effect";
import { LogicDatabase } from "@/logic/database";
import { loadDatabase, saveDatabase } from "@/logic/snapshot";
import { stdlib } from "@/modules";
import { attempt, element, type Outcome, oneOf } from "./programs";
import {
  type Bindings,
  bindings,
  type Json,
  json,
  keyOf,
  lion,
  PRELUDE,
  pattern,
  quote,
  type Shape,
  shape,
  VARIABLES,
  valueFor,
} from "./shapes";

type Form = unknown;

const OPTIONS = { timeout: 120_000, arbitrary: { runs: 300 } };

const MODES = [true, false];

const evaluate = (forms: readonly Form[], database: LogicDatabase) =>
  attempt(["begin", ...PRELUDE, ...forms], database);

const resultOf = (outcome: Outcome): unknown => {
  expect(outcome).toMatchObject({ ok: true });
  return outcome.ok ? outcome.value : undefined;
};

const sorted = (keys: Iterable<string>) => [...new Set(keys)].sort();

/** Answers as a query gives them: one record for each, each once. */
const rowsOf = (answers: readonly Bindings[]) =>
  sorted(answers.map((answered) => keyOf(Object.fromEntries(answered))));

const keysOf = (rows: unknown) => sorted((rows as unknown[]).map(keyOf));

const constant = <A>(value: A): Arbitrary.Arbitrary<A> =>
  Arbitrary.Constant(value);

const variable = Arbitrary.map(
  element(VARIABLES),
  (name): Shape => ({ kind: "variable", name })
);

/**
 * A pattern made only of data, variables, records, and lists: what "=", "in",
 * and a relation's arguments can take apart, where a function is a value
 * and not a predicate.
 */
const structure = (depth: number): Arbitrary.Arbitrary<Shape> => {
  const leaf = oneOf<Shape>(
    variable,
    variable,
    constant<Shape>({ kind: "wildcard" }),
    Arbitrary.map(json(1), (value): Shape => ({ kind: "literal", value }))
  );
  if (depth === 0) {
    return leaf;
  }
  const inner = structure(depth - 1);
  return oneOf<Shape>(
    leaf,
    Arbitrary.map(
      Arbitrary.array(Arbitrary.all([element(["a", "b", "id"]), inner]), {
        maxLength: 3,
      }),
      (entries): Shape => ({
        kind: "record",
        open: false,
        fields: Object.fromEntries(
          entries.map(([key, part]) => [key, { optional: false, shape: part }])
        ),
      })
    ),
    Arbitrary.map(
      Arbitrary.array(inner, { maxLength: 3 }),
      (items): Shape => ({ kind: "tuple", items })
    )
  );
};

/** A pattern with values to match against it, most of which fit. */
const matched = (patterns: Arbitrary.Arbitrary<Shape>) =>
  Arbitrary.flatMap(patterns, (given) =>
    Arbitrary.map(
      Arbitrary.array(valueFor(given), { minLength: 1, maxLength: 4 }),
      (values) => ({ pattern: given, values })
    )
  );

describe("a pattern binds its variables", () => {
  it.effect.prop(
    "a schema with variables gives the answers the model gives",
    { given: matched(pattern(2)), goalDirected: element(MODES) },
    ({ given: { pattern: schema, values }, goalDirected }) =>
      Effect.gen(function* () {
        const result = resultOf(
          yield* evaluate(
            [
              [
                "array/make",
                ...values.map((value) => [
                  "query",
                  ["schema/fits?", quote(value), lion(schema)],
                ]),
              ],
            ],
            new LogicDatabase({ goalDirected })
          )
        ) as unknown[];
        expect(result.map(keysOf)).toEqual(
          values.map((value) => rowsOf(bindings(schema, value)))
        );
      }),
    OPTIONS
  );

  it.effect.prop(
    "a variable in a schema is the value another goal gives it, whichever runs first",
    { given: matched(pattern(2)), goalDirected: element(MODES) },
    ({ given: { pattern: schema, values }, goalDirected }) =>
      Effect.gen(function* () {
        // What the variables can be: the values themselves, and their parts.
        const parts = (value: Json): Json[] => [
          value,
          ...(typeof value === "object" && value !== null
            ? Object.values(value).flatMap(parts)
            : []),
        ];
        const held = [
          ...new Map(
            values.flatMap(parts).map((part) => [keyOf(part), part])
          ).values(),
        ].slice(0, 5);
        const [value] = values;
        const result = resultOf(
          yield* evaluate(
            [
              ["relation", "held", ["value"]],
              ["fact", ...held.map((part) => ["held", quote(part)])],
              [
                "query",
                [
                  "and",
                  ["held", "?x"],
                  ["held", "?y"],
                  ["schema/fits?", quote(value as Json), lion(schema)],
                ],
              ],
            ],
            new LogicDatabase({ goalDirected })
          )
        );
        // The same question with the variables bound first.
        const expected = held.flatMap((x) =>
          held.flatMap((y) =>
            bindings(
              schema,
              value as Json,
              new Map([
                ["x", x],
                ["y", y],
              ])
            )
          )
        );
        expect(keysOf(result)).toEqual(rowsOf(expected));
      }),
    OPTIONS
  );

  it.effect.prop(
    '"=", "in", a relation argument, and a schema take the same value apart alike',
    { given: matched(structure(2)), goalDirected: element(MODES) },
    ({ given: { pattern: given, values }, goalDirected }) =>
      Effect.gen(function* () {
        const [value] = values as [Json, ...Json[]];
        const written = lion(given);
        const result = resultOf(
          yield* evaluate(
            [
              ["relation", "item", ["v"]],
              ["fact", ...values.map((each) => ["item", quote(each)])],
              {
                left: ["query", ["=", written, quote(value)]],
                right: ["query", ["=", quote(value), written]],
                schema: ["query", ["schema/fits?", quote(value), written]],
                argument: ["query", ["item", written]],
                element: ["query", ["in", written, quote(values)]],
              },
            ],
            new LogicDatabase({ goalDirected })
          )
        ) as Record<string, unknown>;
        const one = rowsOf(bindings(given, value));
        const all = rowsOf(values.flatMap((each) => bindings(given, each)));
        expect(keysOf(result.left)).toEqual(one);
        expect(keysOf(result.right)).toEqual(one);
        expect(keysOf(result.schema)).toEqual(one);
        expect(keysOf(result.argument)).toEqual(all);
        expect(keysOf(result.element)).toEqual(all);
      }),
    OPTIONS
  );

  it.effect.prop(
    '"=" takes a function for a value, where a schema asks it',
    {
      // Schemas that are functions: predicates, relations, and named ones.
      predicate: Arbitrary.filter(shape(0), ({ kind }) => kind !== "literal"),
      parts: Arbitrary.all([json(1), json(1)]),
      goalDirected: element(MODES),
    },
    ({ predicate, parts: [held, other], goalDirected }) =>
      Effect.gen(function* () {
        const made = { a: "?x", b: lion(predicate) };
        const value = quote({ a: held, b: other });
        const result = resultOf(
          yield* evaluate(
            [
              {
                equal: ["query", ["=", made, value]],
                schema: ["query", ["schema/fits?", value, made]],
              },
            ],
            new LogicDatabase({ goalDirected })
          )
        ) as Record<string, unknown>;
        // No data is equal to a function.
        expect(result.equal).toEqual([]);
        expect(keysOf(result.schema)).toEqual(
          rowsOf(bindings(predicate, other).map(() => new Map([["x", held]])))
        );
      }),
    OPTIONS
  );

  it.effect.prop(
    "a record or list built from variables comes apart into the same values",
    {
      values: Arbitrary.array(json(2), { minLength: 1, maxLength: 3 }),
      asList: element(MODES),
    },
    ({ values, asList }) =>
      Effect.gen(function* () {
        const names = values.map((_, at) => `?v${at}`);
        const made = asList
          ? ["array/make", ...names]
          : Object.fromEntries(names.map((name, at) => [`k${at}`, name]));
        const result = resultOf(
          yield* evaluate(
            [
              [
                "query",
                [
                  "and",
                  // Built from known values, then taken apart again.
                  [
                    "=",
                    "?whole",
                    asList
                      ? ["array/make", ...values.map(quote)]
                      : Object.fromEntries(
                          values.map((value, at) => [`k${at}`, quote(value)])
                        ),
                  ],
                  ["=", "?whole", made],
                ],
              ],
            ],
            new LogicDatabase()
          )
        ) as Record<string, unknown>[];
        expect(result).toHaveLength(1);
        expect(values.map((_, at) => keyOf(result[0]?.[`v${at}`]))).toEqual(
          values.map(keyOf)
        );
      }),
    OPTIONS
  );

  it.effect.prop(
    "a rule that takes values apart gives the same rows after a snapshot",
    { given: matched(oneOf(pattern(2), structure(2))) },
    ({ given: { pattern: given, values } }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        resultOf(
          yield* evaluate(
            [
              ["relation", "item", ["v"]],
              ["relation", "hit", ["v"]],
              ["fact", ...values.map((value) => ["item", quote(value)])],
              [
                "rule",
                ["hit", "?v"],
                ["item", "?v"],
                ["schema/fits?", "?v", lion(given)],
              ],
              true,
            ],
            database
          )
        );
        const ask = ["find", "?v", ["hit", "?v"]];
        const rows = resultOf(yield* attempt(ask, database));
        expect(keysOf(rows)).toEqual(
          sorted(
            values
              .filter((value) => bindings(given, value).length > 0)
              .map(keyOf)
          )
        );
        const saved = yield* saveDatabase(database);
        const loaded = yield* loadDatabase(saved, stdlib);
        expect(yield* saveDatabase(loaded)).toEqual(saved);
        expect(resultOf(yield* attempt(ask, loaded))).toEqual(rows);
      }),
    OPTIONS
  );
});

/** True for a schema that is data: one with no function anywhere in it. */
const isDataShape = (given: Shape): boolean => {
  switch (given.kind) {
    case "literal":
      return true;
    case "tuple":
      return given.items.every(isDataShape);
    case "record":
      return (
        !given.open &&
        Object.values(given.fields).every(
          (field) => !field.optional && isDataShape(field.shape)
        )
      );
    default:
      return false;
  }
};

describe("a relation call", () => {
  /** Rows of `tagged`, each a number and a value, and `held` derived from it. */
  const setup = (values: readonly Json[]): Form[] => [
    ["relation", "tagged", ["n", "v"]],
    ["relation", "held", ["n", "v"]],
    ["fact", ...values.map((value, n) => ["tagged", n, quote(value)])],
    ["rule", ["held", "?n", "?v"], ["tagged", "?n", "?v"]],
  ];

  /** The answers of a call with `n` free: each row's number, and what fit bound. */
  const answered = (schema: Shape, values: readonly Json[]) =>
    rowsOf(
      values.flatMap((value, n) =>
        bindings(schema, value).map((bound) => new Map([...bound, ["n", n]]))
      )
    );

  it.effect.prop(
    "takes a schema for a column: it asks for the rows whose value fits",
    { given: matched(pattern(2)), goalDirected: element(MODES) },
    ({ given: { pattern: schema, values }, goalDirected }) =>
      Effect.gen(function* () {
        const written = lion(schema);
        const result = resultOf(
          yield* evaluate(
            [
              ...setup(values),
              {
                facts: ["query", ["tagged", "?n", written]],
                derived: ["query", ["held", "?n", written]],
                first: ["query", ["held", 0, written]],
                absent: [
                  "find",
                  "?n",
                  [
                    "and",
                    ["tagged", "?n", "?_"],
                    ["not", ["held", "?n", written]],
                  ],
                ],
              },
            ],
            new LogicDatabase({ goalDirected })
          )
        ) as Record<string, unknown>;
        expect(keysOf(result.facts)).toEqual(answered(schema, values));
        expect(keysOf(result.derived)).toEqual(answered(schema, values));
        expect(keysOf(result.first)).toEqual(
          rowsOf(bindings(schema, values[0] as Json))
        );
        // Under "not" the schema's variables are the question's own.
        expect(result.absent).toEqual(
          values.flatMap((value, n) =>
            bindings(schema, value).length === 0 ? [n] : []
          )
        );
      }),
    OPTIONS
  );

  it.effect.prop(
    "takes the schema a variable holds, however the variable got it",
    { given: matched(shape(2)), goalDirected: element(MODES) },
    ({ given: { pattern: schema, values }, goalDirected }) =>
      Effect.gen(function* () {
        const holds = ["=", "?s", lion(schema)];
        const result = resultOf(
          yield* evaluate(
            [
              ...setup(values),
              {
                facts: ["find", "?n", ["and", holds, ["tagged", "?n", "?s"]]],
                derived: ["find", "?n", ["and", holds, ["held", "?n", "?s"]]],
                after: ["find", "?n", ["and", ["held", "?n", "?s"], holds]],
              },
            ],
            new LogicDatabase({ goalDirected })
          )
        ) as Record<string, unknown>;
        const expected = values.flatMap((value, n) =>
          bindings(schema, value).length > 0 ? [n] : []
        );
        expect(result.facts).toEqual(expected);
        expect(result.derived).toEqual(expected);
        expect(result.after).toEqual(expected);
      }),
    OPTIONS
  );

  it.effect.prop(
    "takes a computed argument for its value, whatever the value is",
    {
      values: Arbitrary.array(
        oneOf<Json>(element<Json>([null, false, 0, "", true]), json(1)),
        { minLength: 1, maxLength: 4 }
      ),
      asked: Arbitrary.array(
        oneOf<Json>(element<Json>([null, false, 0, "", true]), json(1)),
        { minLength: 1, maxLength: 3 }
      ),
      goalDirected: element(MODES),
    },
    ({ values, asked, goalDirected }) =>
      Effect.gen(function* () {
        const pair = ["array/make", "?n", "?k"];
        const from = ["in", "?k", quote([...values, ...asked])];
        const result = resultOf(
          yield* evaluate(
            [
              ...setup(values),
              {
                computed: [
                  "find",
                  pair,
                  ["and", from, ["held", "?n", ["value/identity", "?k"]]],
                ],
                bound: ["find", pair, ["and", from, ["held", "?n", "?k"]]],
              },
            ],
            new LogicDatabase({ goalDirected })
          )
        ) as Record<string, unknown>;
        const expected = sorted(
          values.flatMap((value, n) =>
            [...values, ...asked].some((k) => keyOf(k) === keyOf(value))
              ? [keyOf([n, value])]
              : []
          )
        );
        expect(keysOf(result.bound)).toEqual(expected);
        expect(keysOf(result.computed)).toEqual(expected);
      }),
    OPTIONS
  );

  it.effect.prop(
    "of a graph algorithm takes schemas for its columns, and data for its inputs",
    { given: shape(1), goalDirected: element(MODES) },
    ({ given, goalDirected }) =>
      Effect.gen(function* () {
        const holds = ["=", "?s", lion(given)];
        const links = [
          ["relation", "link", ["from", "to"]],
          ["fact", ["link", 0, 1], ["link", 1, 2], ["link", 2, "a"]],
        ];
        const ask = (goals: Form) =>
          evaluate(
            [...links, ["find", ["array/make", "?to", "?km"], goals]],
            new LogicDatabase({ goalDirected })
          );
        const path = (start: Form, end: Form) => [
          "graph/shortestPath",
          "link",
          start,
          end,
          "?km",
          "?_",
        ];
        // Where the path ends is a column: a schema says which ends to give.
        const ends = resultOf(
          yield* ask(path(0, ["schema/allOf", lion(given), "?to"]))
        );
        const reached: [Json, number][] = [
          [0, 0],
          [1, 1],
          [2, 2],
          ["a", 3],
        ];
        expect(keysOf(ends)).toEqual(
          sorted(
            reached
              .filter(([to]) => bindings(given, to).length > 0)
              .map((pair) => keyOf(pair))
          )
        );
        // Where it starts is an input: a value, written or held by a variable.
        const written = yield* ask(path(lion(given), "?to"));
        const held = yield* ask(["and", holds, path("?s", "?to")]);
        if (isDataShape(given)) {
          expect(held).toEqual(written);
          expect(held.ok).toBe(true);
        } else {
          const message = expect.stringContaining(
            'graph/shortestPath expects a value for "start"'
          );
          expect(written).toMatchObject({ ok: false, message });
          expect(held).toMatchObject({ ok: false, message });
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "is explained by the row it matched",
    { given: matched(pattern(2)) },
    ({ given: { pattern: schema, values } }) =>
      Effect.gen(function* () {
        const result = resultOf(
          yield* evaluate(
            [
              ...setup(values),
              ["relation", "hit", ["n"]],
              ["rule", ["hit", "?n"], ["tagged", "?n", lion(schema)]],
              ["array/make", ...values.map((_, n) => ["why", ["hit", n]])],
            ],
            new LogicDatabase()
          )
        ) as ({ because?: unknown[] } | null)[];
        expect(
          result.map((reason) =>
            reason === null ? null : keyOf(reason.because)
          )
        ).toEqual(
          values.map((value, n) =>
            bindings(schema, value).length === 0
              ? null
              : keyOf([{ fact: ["tagged", n, value], given: true }])
          )
        );
      }),
    OPTIONS
  );
});

describe("a recursive relation asked about schemas", () => {
  const NODES: readonly Json[] = [0, 1, 2, "a", "b"];

  const node = element(NODES);

  /** Schemas for a node: a variable, a node, a predicate, or a choice. */
  const leaf = oneOf<Shape>(
    variable,
    variable,
    constant<Shape>({ kind: "wildcard" }),
    Arbitrary.map(node, (value): Shape => ({ kind: "literal", value })),
    Arbitrary.map(node, (value): Shape => ({ kind: "literal", value })),
    constant<Shape>({ kind: "predicate", name: "value/number?" }),
    constant<Shape>({ kind: "predicate", name: "value/string?" }),
    constant<Shape>({ kind: "member" }),
    Arbitrary.map(element([0, 1]), (limit): Shape => ({ kind: "above", limit }))
  );

  const end = oneOf<Shape>(
    leaf,
    leaf,
    Arbitrary.map(
      Arbitrary.array(leaf, { minLength: 1, maxLength: 3 }),
      (parts): Shape => ({ kind: "anyOf", parts })
    ),
    Arbitrary.map(
      Arbitrary.array(leaf, { minLength: 1, maxLength: 2 }),
      (parts): Shape => ({ kind: "allOf", parts })
    )
  );

  const hasVariable = (given: Shape): boolean =>
    given.kind === "variable" ||
    given.kind === "wildcard" ||
    ((given.kind === "anyOf" || given.kind === "allOf") &&
      given.parts.some(hasVariable));

  /** Every pair of nodes that one or more edges lead between. */
  const paths = (edges: readonly (readonly [Json, Json])[]) => {
    const found = new Map<string, readonly [Json, Json]>(
      edges.map((edge) => [keyOf(edge), edge])
    );
    for (let grew = true; grew; ) {
      grew = false;
      for (const [from, middle] of [...found.values()]) {
        for (const [start, to] of edges) {
          const pair = [from, to] as const;
          if (keyOf(start) === keyOf(middle) && !found.has(keyOf(pair))) {
            found.set(keyOf(pair), pair);
            grew = true;
          }
        }
      }
    }
    return [...found.values()];
  };

  it.effect.prop(
    "gives the paths whose ends fit, goal-directed or in full",
    {
      edges: Arbitrary.array(Arbitrary.all([node, node]), { maxLength: 7 }),
      from: end,
      to: end,
      goalDirected: element(MODES),
    },
    ({ edges, from, to, goalDirected }) =>
      Effect.gen(function* () {
        const fixed = [from, to].filter((given) => !hasVariable(given));
        const result = resultOf(
          yield* evaluate(
            [
              ["relation", "edge", ["from", "to"]],
              ["relation", "path", ["from", "to"]],
              ...(edges.length > 0
                ? [
                    [
                      "fact",
                      ...edges.map((pair) => ["edge", ...pair.map(quote)]),
                    ],
                  ]
                : []),
              ["rule", ["path", "?p", "?q"], ["edge", "?p", "?q"]],
              [
                "rule",
                ["path", "?p", "?r"],
                ["path", "?p", "?q"],
                ["edge", "?q", "?r"],
              ],
              {
                asked: ["query", ["path", lion(from), lion(to)]],
                // A schema with nothing to bind can be held by a variable.
                held: [
                  "array/make",
                  ...fixed.map((given) => [
                    "find",
                    "?end",
                    ["and", ["=", "?s", lion(given)], ["path", "?end", "?s"]],
                  ]),
                ],
              },
            ],
            new LogicDatabase({ goalDirected })
          )
        ) as { asked: unknown; held: unknown[][] };
        const reached = paths(edges);
        expect(keysOf(result.asked)).toEqual(
          rowsOf(
            reached.flatMap(([start, finish]) =>
              bindings(from, start).flatMap((bound) =>
                bindings(to, finish, bound)
              )
            )
          )
        );
        expect(result.held.map((found) => found.map(keyOf).sort())).toEqual(
          fixed.map((given) =>
            reached
              .filter(([, finish]) => bindings(given, finish).length > 0)
              .map(([start]) => keyOf(start))
              .sort()
          )
        );
      }),
    OPTIONS
  );
});

describe("a predicate made from a variable", () => {
  const NUMBERS = [-1, 0, 1, 2, 3];

  const number = element(NUMBERS);

  /** Ways to write "greater than ?n" as a schema. */
  const ABOVE: Record<string, Form> = {
    partial: ["func/partial", "number/lessThan", "?n"],
    lambda: ["lambda", ["v"], ["number/lessThan", "?n", "v"]],
    "inside a schema": [
      "schema/allOf",
      "value/number?",
      ["func/partial", "number/lessThan", "?n"],
    ],
    "inside a lambda": [
      "lambda",
      ["v"],
      [["func/partial", "number/lessThan", "?n"], "v"],
    ],
  };

  /** Goals that bind `?n` to each limit: from a list, or from a relation. */
  const LIMITS: Record<string, (limits: readonly number[]) => Form> = {
    "a list": (limits) => ["in", "?n", quote(limits)],
    "a relation": () => ["limit", "?n"],
  };

  /** A goal that binds `?v` to each item that fits the schema. */
  const FITS: Record<string, (above: Form) => readonly Form[]> = {
    "a check": (above) => [
      ["item", "?v"],
      ["schema/fits?", "?v", above],
    ],
    "a relation call": (above) => [["item", ["schema/allOf", above, "?v"]]],
    "a derived relation": (above) => [["kept", ["schema/allOf", above, "?v"]]],
    // The predicate alone is an argument, with nothing around it that waits.
    "a column of its own": (above) => [["twice", "?v", above]],
  };

  it.effect.prop(
    "is the predicate made from its value, whatever binds the variable, and when",
    {
      limits: Arbitrary.array(number, { minLength: 1, maxLength: 3 }),
      values: Arbitrary.array(oneOf<Json>(number, number, json(1)), {
        minLength: 1,
        maxLength: 4,
      }),
      how: element(Object.keys(ABOVE)),
      from: element(Object.keys(LIMITS)),
      where: element(Object.keys(FITS)),
      goalDirected: element(MODES),
    },
    ({ limits, values, how, from, where, goalDirected }) =>
      Effect.gen(function* () {
        const limit = (LIMITS[from] as (limits: readonly number[]) => Form)(
          limits
        );
        const fits = (FITS[where] as (above: Form) => readonly Form[])(
          ABOVE[how]
        );
        const pair = ["array/make", "?n", "?v"];
        const result = resultOf(
          yield* evaluate(
            [
              ["relation", "item", ["v"]],
              ["relation", "kept", ["v"]],
              ["relation", "limit", ["n"]],
              ["relation", "twice", ["v", "again"]],
              ["fact", ...values.map((value) => ["item", quote(value)])],
              [
                "fact",
                ...values.map((value) => ["twice", quote(value), quote(value)]),
              ],
              ["fact", ...limits.map((n) => ["limit", n])],
              ["rule", ["kept", "?v"], ["item", "?v"]],
              {
                before: ["find", pair, ["and", limit, ...fits]],
                after: ["find", pair, ["and", ...fits, limit]],
                // As a function handed to a call that waits.
                mapped: [
                  "find",
                  ["array/make", "?n", "?out"],
                  [
                    "and",
                    ["=", "?out", ["array/map", quote(NUMBERS), ABOVE[how]]],
                    limit,
                  ],
                ],
              },
            ],
            new LogicDatabase({ goalDirected })
          )
        ) as Record<string, unknown>;
        const expected = sorted(
          [...new Set(limits)].flatMap((n) =>
            values
              .filter((value) => typeof value === "number" && n < value)
              .map((value) => keyOf([n, value]))
          )
        );
        expect(keysOf(result.before)).toEqual(expected);
        expect(keysOf(result.after)).toEqual(expected);
        expect(keysOf(result.mapped)).toEqual(
          sorted(
            [...new Set(limits)].map((n) =>
              keyOf([n, NUMBERS.map((value) => n < value)])
            )
          )
        );
      }),
    OPTIONS
  );
});

describe("a predicate that answers with a logic value", () => {
  /** A predicate whose answer is a variable that nothing can bind. */
  const UNANSWERED = ["lambda", ["x"], ["eval", ["quote", "?never"]]];

  const WHERE: Record<string, Form> = {
    "a check": ["and", ["item", "?v"], ["schema/fits?", "?v", UNANSWERED]],
    "a relation call": ["item", UNANSWERED],
    "a part of a pattern": ["item", ["schema/allOf", UNANSWERED, "?v"]],
  };

  it.effect.prop(
    "fails the rule or query, and is not taken for a value that does not fit",
    {
      values: Arbitrary.array(json(1), { minLength: 1, maxLength: 3 }),
      where: element(Object.keys(WHERE)),
      goalDirected: element(MODES),
    },
    ({ values, where, goalDirected }) =>
      Effect.gen(function* () {
        const outcome = yield* evaluate(
          [
            ["relation", "item", ["v"]],
            ["fact", ...values.map((value) => ["item", quote(value)])],
            ["query", WHERE[where]],
          ],
          new LogicDatabase({ goalDirected })
        );
        expect(outcome).toMatchObject({
          ok: false,
          message: expect.stringContaining('"?never" has no value yet'),
        });
      }),
    OPTIONS
  );
});

describe("schema/open around a variable", () => {
  const isRecord = (value: Json): value is { readonly [key: string]: Json } =>
    typeof value === "object" && value !== null && !Array.isArray(value);

  const record = Arbitrary.map(
    Arbitrary.array(Arbitrary.all([element(["a", "b", "id"]), json(0)]), {
      maxLength: 3,
    }),
    (entries): { readonly [key: string]: Json } => Object.fromEntries(entries)
  );

  const given = Arbitrary.flatMap(
    Arbitrary.all([
      Arbitrary.array(record, { minLength: 1, maxLength: 3 }),
      // Sometimes a value that is not a record of schemas is among them.
      oneOf(constant<Json[]>([]), constant<Json[]>([]), constant<Json[]>([5])),
    ]),
    ([records, others]) =>
      Arbitrary.map(
        // A value with the keys of one of the records, and more.
        oneOf(
          Arbitrary.map(
            Arbitrary.all([element(records), record]),
            ([one, more]): Json => ({ ...more, ...one })
          ),
          record
        ),
        (value) => ({ held: [...records, ...others], value })
      )
  );

  it.effect.prop(
    "is schema/open around its value, whichever goal runs first",
    { given, goalDirected: element(MODES) },
    ({ given: { held, value }, goalDirected }) =>
      Effect.gen(function* () {
        const holds = ["held", "?r"];
        const fits = ["schema/fits?", quote(value), ["schema/open", "?r"]];
        const result = yield* evaluate(
          [
            ["relation", "held", ["r"]],
            ["fact", ...held.map((each) => ["held", quote(each)])],
            {
              before: ["find", "?r", ["and", holds, fits]],
              after: ["find", "?r", ["and", fits, holds]],
            },
          ],
          new LogicDatabase({ goalDirected })
        );
        if (held.every(isRecord)) {
          // Data is a schema for itself, so an open record of data fits a
          // record that has its keys with the same values.
          const expected = sorted(
            held
              .filter(
                (each) =>
                  isRecord(each) &&
                  isRecord(value) &&
                  Object.entries(each).every(
                    ([key, part]) =>
                      Object.hasOwn(value, key) &&
                      keyOf(value[key]) === keyOf(part)
                  )
              )
              .map(keyOf)
          );
          const { after, before } = resultOf(result) as Record<string, unknown>;
          expect(keysOf(before)).toEqual(expected);
          expect(keysOf(after)).toEqual(expected);
        } else {
          expect(result).toMatchObject({
            ok: false,
            message: expect.stringContaining(
              "schema/open expects a record of schemas, or a schema that names one"
            ),
          });
        }
        // With nothing to bind the variable, the goal is not safe to ask.
        expect(
          yield* evaluate(
            [["query", fits]],
            new LogicDatabase({ goalDirected })
          )
        ).toMatchObject({
          ok: false,
          message: expect.stringContaining("?r must first be bound"),
        });
      }),
    OPTIONS
  );
});

describe("a pattern without variables", () => {
  it.effect.prop(
    "is the schema it was before patterns could bind",
    { given: matched(shape(2)), goalDirected: element(MODES) },
    ({ given: { pattern: schema, values }, goalDirected }) =>
      Effect.gen(function* () {
        const result = resultOf(
          yield* evaluate(
            [
              ["relation", "item", ["v"]],
              ["fact", ...values.map((value) => ["item", quote(value)])],
              [
                "find",
                "?v",
                ["and", ["item", "?v"], ["schema/fits?", "?v", lion(schema)]],
              ],
            ],
            new LogicDatabase({ goalDirected })
          )
        );
        expect(keysOf(result)).toEqual(
          sorted(
            values
              .filter((value) => bindings(schema, value).length > 0)
              .map(keyOf)
          )
        );
      }),
    OPTIONS
  );
});

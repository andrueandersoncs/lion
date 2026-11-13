/**
 * Schemas: a value fits a schema or it does not, and the answer is the same
 * wherever it is asked: in plain code, under a name, in a rule, under `not`,
 * in a find, in `match` and `cond`, as the schema of a relation's rows, and
 * after a snapshot. Each is checked against a model that reads a generated
 * schema in plain TypeScript.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { LogicDatabase } from "@/logic/database";
import { loadDatabase, saveDatabase } from "@/logic/snapshot";
import { stdlib } from "@/modules";
import { attempt, element, type Outcome, oneOf } from "./programs";
import {
  asksEven,
  checked,
  checkedMany,
  fits,
  type Json,
  json,
  keyOf,
  lion,
  type Misfit,
  misfitKey,
  misfitOfProblem,
  misfits,
  namesAsData,
  PRELUDE,
  quote,
  type Shape,
  shape,
  valueFor,
} from "./shapes";

type Form = unknown;

const OPTIONS = { timeout: 120_000, arbitrary: { runs: 200 } };

const MODES = [true, false];

/**
 * Runs forms after the prelude, and reports the value of the last one, or
 * the error. A declaration's value is a function, which is not data, so a
 * program that ends in one reports `true` instead.
 */
const evaluate = (forms: readonly Form[], database = new LogicDatabase()) => {
  const last = forms.at(-1);
  const declares =
    Array.isArray(last) && (last[0] === "schema" || last[0] === "relation");
  return attempt(
    ["begin", ...PRELUDE, ...forms, ...(declares ? [true] : [])],
    database
  );
};

/** The value of an outcome that must have one. */
const resultOf = (outcome: Outcome): unknown => {
  expect(outcome).toMatchObject({ ok: true });
  return outcome.ok ? outcome.value : undefined;
};

const sorted = (keys: Iterable<string>) => [...new Set(keys)].sort();

/** Values as a set: a relation holds each value once, whatever its key order. */
const keysOf = (values: Iterable<unknown>) => sorted([...values].map(keyOf));

interface Problem {
  readonly expected?: unknown;
  readonly found?: unknown;
  readonly path: readonly (number | string)[];
}

const misfitKeys = (found: readonly Misfit[]) => found.map(misfitKey).sort();

const at = (value: Json, path: Problem["path"]): unknown =>
  path.reduce<unknown>(
    (part, step) => (part as Record<string, unknown> | undefined)?.[step],
    value
  );

/** A value or shape with the keys of every record in the opposite order. */
const reversed = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(reversed);
  }
  return typeof value === "object" && value !== null
    ? Object.fromEntries(
        Object.entries(value)
          .reverse()
          .map(([key, item]) => [key, reversed(item)])
      )
    : value;
};

describe("schemas", () => {
  it.effect.prop(
    "a value fits when the model says so, and its problems are where the model says",
    { given: checked() },
    ({ given: { shape: schema, value } }) =>
      Effect.gen(function* () {
        const result = resultOf(
          yield* evaluate([
            {
              fits: ["schema/fits?", quote(value), lion(schema)],
              problems: ["schema/problems", quote(value), lion(schema)],
            },
          ])
        ) as { fits: boolean; problems: Problem[] };
        const expected = misfits(schema, value);
        expect(result.fits).toBe(expected.length === 0);
        expect(misfitKeys(result.problems.map(misfitOfProblem))).toEqual(
          misfitKeys(expected)
        );
        // A problem shows the part of the value it is about.
        for (const problem of result.problems) {
          if ("found" in problem) {
            expect(keyOf(problem.found)).toBe(keyOf(at(value, problem.path)));
          }
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "what a problem expected is a schema that what it found does not fit",
    { given: oneOf(checked(), namesAsData) },
    ({ given: { shape: schema, value } }) =>
      Effect.gen(function* () {
        const problems = resultOf(
          yield* evaluate([["schema/problems", quote(value), lion(schema)]])
        ) as Problem[];
        const wrong = problems.filter(
          (problem) => "expected" in problem && "found" in problem
        );
        // `expected` is an expression: evaluated again, it is the schema.
        expect(
          resultOf(
            yield* evaluate([
              [
                "array/make",
                ...wrong.map(({ expected, found }) => [
                  "schema/fits?",
                  quote(found as Json),
                  expected,
                ]),
              ],
            ])
          )
        ).toEqual(wrong.map(() => false));
      }),
    OPTIONS
  );

  it.effect.prop(
    "a schema keeps the values its names had when it was declared",
    { given: checked() },
    ({ given: { shape: schema, value } }) =>
      Effect.gen(function* () {
        expect(
          resultOf(
            yield* evaluate([
              ["schema", "S", lion(schema)],
              // Under this limit, nothing would be below it any more.
              ["define", "limit", -100],
              ["S", quote(value)],
            ])
          )
        ).toBe(fits(schema, value));
      }),
    OPTIONS
  );

  it.effect.prop(
    "assert gives the value back when it fits, and fails when it does not",
    { given: checked() },
    ({ given: { shape: schema, value } }) =>
      Effect.gen(function* () {
        const outcome = yield* evaluate([
          ["schema/assert", quote(value), lion(schema)],
        ]);
        if (fits(schema, value)) {
          expect(keyOf(resultOf(outcome))).toBe(keyOf(value));
        } else {
          expect(outcome.ok).toBe(false);
          expect(outcome).toMatchObject({
            message: expect.stringContaining(
              `${JSON.stringify(value)} does not fit `
            ),
          });
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "problems do not depend on the order a record's keys are written in",
    { given: checked() },
    ({ given: { shape: schema, value } }) =>
      Effect.gen(function* () {
        const problems = (given: Form, checkedValue: Form) =>
          Effect.map(
            evaluate([["schema/problems", checkedValue, given]]),
            (outcome) => (resultOf(outcome) as Problem[]).map(misfitOfProblem)
          );
        expect(
          yield* problems(reversed(lion(schema)), reversed(quote(value)))
        ).toEqual(yield* problems(lion(schema), quote(value)));
      }),
    OPTIONS
  );

  it.effect.prop(
    "data is a schema for itself",
    { value: json(3) },
    ({ value }) =>
      Effect.gen(function* () {
        expect(
          resultOf(
            yield* evaluate([
              [
                "array/make",
                ["schema/fits?", quote(value), quote(value)],
                ["schema/problems", quote(value), quote(value)],
              ],
            ])
          )
        ).toEqual([true, []]);
      }),
    OPTIONS
  );

  it.effect.prop(
    "a schema under a name is the schema itself",
    { given: checked() },
    ({ given: { shape: schema, value } }) =>
      Effect.gen(function* () {
        const result = resultOf(
          yield* evaluate([
            ["schema", "S", lion(schema)],
            ["define", "D", lion(schema)],
            {
              named: ["S", quote(value)],
              asked: ["schema/fits?", quote(value), "S"],
              defined: ["schema/fits?", quote(value), "D"],
              inline: ["schema/fits?", quote(value), lion(schema)],
              problems: {
                named: ["schema/problems", quote(value), "S"],
                defined: ["schema/problems", quote(value), "D"],
                inline: ["schema/problems", quote(value), lion(schema)],
              },
            },
          ])
        ) as Record<string, unknown> & { problems: Record<string, unknown> };
        expect(result.named).toBe(result.inline);
        expect(result.asked).toBe(result.inline);
        expect(result.defined).toBe(result.inline);
        expect(result.problems.named).toEqual(result.problems.inline);
        expect(result.problems.defined).toEqual(result.problems.inline);
      }),
    OPTIONS
  );

  it.effect.prop(
    "a rule, a find, not, cond, and match ask what plain code asks",
    { given: checkedMany(), goalDirected: element(MODES) },
    ({ given: { shape: schema, values }, goalDirected }) =>
      Effect.gen(function* () {
        const check = ["schema/fits?", "?v", lion(schema)];
        const yes = ["lambda", ["x"], true];
        const no = ["lambda", ["x"], false];
        const result = resultOf(
          yield* evaluate(
            [
              ["schema", "S", lion(schema)],
              ["relation", "item", ["v"]],
              ["relation", "verdict", ["v", "ok"]],
              ["relation", "trouble", ["v", "problem"]],
              ["fact", ...values.map((value) => ["item", quote(value)])],
              ["rule", ["verdict", "?v", check], ["item", "?v"]],
              [
                "rule",
                ["trouble", "?v", "?p"],
                ["item", "?v"],
                ["in", "?p", ["schema/problems", "?v", "S"]],
              ],
              {
                fit: ["query", ["and", ["item", "?v"], ["S", "?v"]]],
                misfit: ["find", "?v", ["and", ["item", "?v"], ["not", check]]],
                verdicts: ["query", ["verdict", "?v", "?ok"]],
                troubles: ["query", ["trouble", "?v", "?problem"]],
                count: [
                  "aggregate/count",
                  ["find", "?v", ["and", ["item", "?v"], ["S", "?v"]]],
                ],
                matched: [
                  "find",
                  "?v",
                  [
                    "and",
                    ["item", "?v"],
                    ["=", true, ["match", "?v", ["S", yes], no]],
                  ],
                ],
                cond: [
                  "find",
                  "?v",
                  [
                    "and",
                    ["item", "?v"],
                    ["=", "yes", ["cond", [check, "yes"], ["else", "no"]]],
                  ],
                ],
              },
            ],
            new LogicDatabase({ goalDirected })
          )
        ) as {
          cond: Json[];
          count: number;
          fit: { v: Json }[];
          matched: Json[];
          misfit: Json[];
          troubles: { problem: Problem; v: Json }[];
          verdicts: { ok: boolean; v: Json }[];
        };
        const fitting = keysOf(values.filter((value) => fits(schema, value)));
        const others = keysOf(values.filter((value) => !fits(schema, value)));
        expect(keysOf(result.fit.map(({ v }) => v))).toEqual(fitting);
        expect(keysOf(result.misfit)).toEqual(others);
        expect(keysOf(result.matched)).toEqual(fitting);
        expect(keysOf(result.cond)).toEqual(fitting);
        expect(result.count).toBe(fitting.length);
        expect(keysOf(result.verdicts)).toEqual(
          keysOf(values.map((v) => ({ ok: fits(schema, v), v })))
        );
        expect(
          sorted(
            result.troubles.map(
              ({ problem, v }) =>
                `${keyOf(v)} ${misfitKey(misfitOfProblem(problem))}`
            )
          )
        ).toEqual(
          sorted(
            values.flatMap((v) =>
              misfits(schema, v).map(
                (found) => `${keyOf(v)} ${misfitKey(found)}`
              )
            )
          )
        );
      }),
    OPTIONS
  );

  it.effect.prop(
    "a schema over a logic variable is the schema with the variable's value in place",
    {
      values: Arbitrary.array(json(1), { minLength: 1, maxLength: 4 }),
      goalDirected: element(MODES),
    },
    ({ values, goalDirected }) =>
      Effect.gen(function* () {
        // Each value, and a record that holds it, so some pairs fit.
        const items = values.flatMap((value): Json[] => [value, { a: value }]);
        const pairs = items.flatMap((v) => items.map((w) => [v, w] as const));
        const result = resultOf(
          yield* evaluate(
            [
              ["relation", "item", ["v"]],
              ["fact", ...items.map((value) => ["item", quote(value)])],
              {
                rule: [
                  "query",
                  [
                    "and",
                    ["item", "?v"],
                    ["item", "?w"],
                    ["schema/fits?", "?v", { a: "?w" }],
                  ],
                ],
                plain: [
                  "array/make",
                  ...pairs.map(([v, w]) => [
                    "schema/fits?",
                    quote(v),
                    { a: quote(w) },
                  ]),
                ],
              },
            ],
            new LogicDatabase({ goalDirected })
          )
        ) as { plain: boolean[]; rule: { v: Json; w: Json }[] };
        const expected = pairs.filter(([v, w]) =>
          fits({ kind: "literal", value: { a: w } }, v)
        );
        expect(keysOf(result.rule.map(({ v, w }) => [v, w]))).toEqual(
          keysOf(expected)
        );
        expect(keysOf(pairs.filter((_, index) => result.plain[index]))).toEqual(
          keysOf(expected)
        );
      }),
    OPTIONS
  );

  /** How the rule comes by the schema: under its name, built in place, or defined. */
  const WAYS = ["named", "inline", "defined"] as const;

  const even: Shape = { kind: "member" };

  /** A schema, often one that holds the relation `even` inside another. */
  const maybeAsking = oneOf<Shape>(
    shape(2),
    Arbitrary.map(
      shape(1),
      (inner): Shape => ({ kind: "anyOf", parts: [inner, even] })
    ),
    Arbitrary.map(
      shape(1),
      (inner): Shape => ({
        kind: "arrayOf",
        item: { kind: "allOf", parts: [even, inner] },
      })
    )
  );

  it.effect.prop(
    "a rule cannot ask, through a schema, about the relation it derives",
    { schema: maybeAsking, way: element(WAYS) },
    ({ schema, way }) =>
      Effect.gen(function* () {
        const check = {
          named: ["S", "?v"],
          inline: ["schema/fits?", "?v", lion(schema)],
          defined: ["schema/fits?", "?v", "D"],
        }[way];
        const outcome = yield* evaluate([
          ["schema", "S", lion(schema)],
          ["define", "D", lion(schema)],
          ["relation", "item", ["v"]],
          ["rule", ["even", "?v"], ["item", "?v"], check],
          true,
        ]);
        if (asksEven(schema)) {
          expect(outcome).toMatchObject({
            ok: false,
            message: expect.stringContaining('asks about "even"'),
          });
        } else if (!JSON.stringify(lion(schema)).includes('"even"')) {
          // A shape that holds the string "even" only as data may still
          // count as naming the relation: a form that waits keeps every
          // name it mentions, since `eval` could reach it.
          expect(outcome.ok).toBe(true);
        }
      }),
    OPTIONS
  );
});

const rowId = oneOf<Json>(
  element<Json>([1, 2, 3]),
  element<Json>([1, 2, 3]),
  element<Json>(["x", 1.5])
);

interface Table {
  readonly shape: Shape;
  /** Forms that add rows to `row` or retract them, in order. */
  readonly steps: readonly (readonly [
    "fact" | "retract",
    ...(readonly [Json, Json])[],
  ])[];
}

/** A schema for the body of a row, and changes to a relation of such rows. */
const table: Arbitrary.Arbitrary<Table> = Arbitrary.flatMap(
  shape(2),
  (given) => {
    const row = Arbitrary.all([rowId, valueFor(given)]);
    const rows = Arbitrary.array(row, { minLength: 1, maxLength: 3 });
    const step = Arbitrary.map(
      Arbitrary.all([
        element(["fact", "fact", "fact", "retract"] as const),
        rows,
      ]),
      ([form, items]) => [form, ...items] as Table["steps"][number]
    );
    return Arbitrary.map(
      Arbitrary.array(step, { minLength: 1, maxLength: 6 }),
      (steps): Table => ({ shape: given, steps })
    );
  }
);

const ROW_SCHEMA = (schema: Shape) => [
  "schema",
  "Row",
  { id: "value/integer?", body: lion(schema) },
];

/** The invariant that the relation option `{"schema": "Row"}` stands for. */
const ROWS_FIT = [
  "invariant",
  [
    "and",
    ["row", "?id", "?body"],
    ["not", ["Row", { id: "?id", body: "?body" }]],
  ],
  { assert: "none" },
];

const rowsOf = (database: LogicDatabase) =>
  Effect.map(attempt(["query", ["row", "?id", "?body"]], database), (rows) =>
    keysOf(
      (resultOf(rows) as { body: Json; id: Json }[]).map((r) => [r.id, r.body])
    )
  );

describe("the schema of a relation's rows", () => {
  it.effect.prop(
    "a change is kept only when every row fits, and is the invariant it stands for",
    { given: table },
    ({ given: { shape: schema, steps } }) =>
      Effect.gen(function* () {
        const typed = new LogicDatabase();
        const written = new LogicDatabase();
        resultOf(
          yield* evaluate(
            [
              ROW_SCHEMA(schema),
              ["relation", "row", ["id", "body"], { key: "id", schema: "Row" }],
            ],
            typed
          )
        );
        resultOf(
          yield* evaluate(
            [
              ROW_SCHEMA(schema),
              ["relation", "row", ["id", "body"], { key: "id" }],
              ROWS_FIT,
            ],
            written
          )
        );
        // The model: rows by key, where a fact with a key replaces its row.
        let model = new Map<string, readonly [Json, Json]>();
        for (const [form, ...rows] of steps) {
          const next = new Map(model);
          for (const row of rows) {
            if (form === "fact") {
              next.set(keyOf(row[0]), row);
            } else if (keyOf(next.get(keyOf(row[0]))) === keyOf(row)) {
              next.delete(keyOf(row[0]));
            }
          }
          const kept = [...next.values()].every(
            ([id, body]) => Number.isInteger(id) && fits(schema, body)
          );
          const change = [
            form,
            ...rows.map(([id, body]) => ["row", quote(id), quote(body)]),
          ];
          const outcome = yield* attempt(change, typed);
          expect(outcome.ok).toBe(kept);
          if (!outcome.ok) {
            expect(outcome.message).toContain("so nothing changed");
            expect(outcome.message).toContain(" does not fit ");
          }
          expect(yield* attempt(change, written)).toEqual(outcome);
          model = kept ? next : model;
          expect(yield* rowsOf(typed)).toEqual(keysOf(model.values()));
          expect(yield* saveDatabase(typed)).toEqual(
            yield* saveDatabase(written)
          );
        }
      }),
    OPTIONS
  );

  const NAMES = ["ada", "ben", "cy"];

  const kinFact = oneOf<readonly Json[]>(
    Arbitrary.map(element(NAMES), (name) => ["person", name]),
    Arbitrary.map(Arbitrary.all([element(NAMES), element(NAMES)]), (pair) => [
      "parent",
      ...pair,
    ])
  );

  const kinStep = Arbitrary.map(
    Arbitrary.all([
      element(["fact", "fact", "retract"] as const),
      Arbitrary.array(kinFact, { minLength: 1, maxLength: 3 }),
    ]),
    ([form, facts]) => [form, ...facts] as const
  );

  it.effect.prop(
    "a relation as a schema is a foreign key, kept through facts and retracts",
    {
      steps: Arbitrary.array(kinStep, { minLength: 1, maxLength: 8 }),
      goalDirected: element(MODES),
    },
    ({ steps, goalDirected }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase({ goalDirected });
        resultOf(
          yield* evaluate(
            [
              ["relation", "person", ["name"]],
              ["schema", "Kin", { parent: "person", child: "person" }],
              ["relation", "parent", ["parent", "child"], { schema: "Kin" }],
            ],
            database
          )
        );
        let model = new Set<string>();
        for (const [form, ...facts] of steps) {
          const next = new Set(model);
          for (const fact of facts) {
            if (form === "fact") {
              next.add(keyOf(fact));
            } else {
              next.delete(keyOf(fact));
            }
          }
          const kept = NAMES.every((parent) =>
            NAMES.every(
              (child) =>
                !next.has(keyOf(["parent", parent, child])) ||
                (next.has(keyOf(["person", parent])) &&
                  next.has(keyOf(["person", child])))
            )
          );
          const outcome = yield* attempt([form, ...facts], database);
          expect(outcome.ok).toBe(kept);
          model = kept ? next : model;
          const held = resultOf(
            yield* attempt(
              {
                people: [
                  "find",
                  ["array/make", ["quote", "person"], "?n"],
                  ["person", "?n"],
                ],
                parents: [
                  "find",
                  ["array/make", ["quote", "parent"], "?p", "?c"],
                  ["parent", "?p", "?c"],
                ],
              },
              database
            )
          ) as { parents: Json[]; people: Json[] };
          expect(keysOf([...held.people, ...held.parents])).toEqual(
            sorted(model)
          );
        }
      }),
    OPTIONS
  );
});

describe("a relation as a schema", () => {
  /** Ways to ask whether a value fits the relation `held`, each true or false. */
  const PLACES: Record<string, (value: Json) => Form> = {
    "schema/fits?": (value) => ["schema/fits?", quote(value), "held"],
    "a part of a record": (value) => [
      "schema/fits?",
      { a: quote(value) },
      { a: "held" },
    ],
    "schema/problems": (value) => [
      "=",
      0,
      ["array/length", ["schema/problems", quote(value), "held"]],
    ],
    match: (value) => [
      "match",
      quote(value),
      ["held", ["lambda", ["v"], true]],
      ["lambda", ["v"], false],
    ],
    "a find": (value) => [
      "=",
      1,
      [
        "array/length",
        [
          "find",
          "?v",
          [
            "and",
            ["in", "?v", ["array/make", quote(value)]],
            ["schema/fits?", "?v", ["schema/anyOf", "held"]],
          ],
        ],
      ],
    ],
    "a named schema": (value) => [
      "begin",
      ["schema", "Held", { a: "held" }],
      ["Held", { a: quote(value) }],
    ],
    "an argument of a relation call": (value) => [
      "begin",
      ["relation", "seen", ["v"]],
      ["fact", ["seen", quote(value)]],
      ["=", 1, ["array/length", ["query", ["seen", "held"]]]],
    ],
  };

  const asked = Arbitrary.flatMap(
    Arbitrary.array(json(1), { minLength: 1, maxLength: 4 }),
    (rows) =>
      Arbitrary.map(oneOf(element(rows), json(1)), (value) => ({
        rows,
        value,
      }))
  );

  it.effect.prop(
    "is the schema of one value only when it has one column",
    {
      given: asked,
      columns: element([1, 1, 2, 3]),
      place: element(Object.keys(PLACES)),
      goalDirected: element(MODES),
    },
    ({ given: { rows, value }, columns, place, goalDirected }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase({ goalDirected });
        const names = ["x", "y", "z"].slice(0, columns);
        const rest = names.slice(1).map(() => 0);
        resultOf(
          yield* evaluate(
            [
              ["relation", "held", names],
              ["fact", ...rows.map((row) => ["held", quote(row), ...rest])],
              true,
            ],
            database
          )
        );
        const ask = (PLACES[place] as (value: Json) => Form)(value);
        const outcome = yield* attempt(ask, database);
        if (columns === 1) {
          expect(outcome).toEqual({
            ok: true,
            value: rows.some((row) => keyOf(row) === keyOf(value)),
          });
        } else {
          expect(outcome).toMatchObject({
            ok: false,
            message: expect.stringContaining(
              `"held" has ${columns} columns, so it cannot be the schema of one value`
            ),
          });
        }
        // Inside quote the name is the string, whatever the relation is.
        expect(
          yield* attempt(
            ["schema/fits?", ["quote", "held"], ["quote", "held"]],
            database
          )
        ).toEqual({ ok: true, value: true });
      }),
    OPTIONS
  );
});

describe("schemas in a database", () => {
  const twoShapes = Arbitrary.flatMap(
    Arbitrary.all([shape(2), shape(2)]),
    ([first, second]) =>
      Arbitrary.map(
        Arbitrary.array(oneOf(valueFor(first), valueFor(second)), {
          minLength: 1,
          maxLength: 5,
        }),
        (values) => ({ first, second, values })
      )
  );

  /** A database that uses schemas every way a snapshot has to write. */
  const build = (first: Shape, second: Shape, values: readonly Json[]) => [
    ["schema", "S", lion(first)],
    [
      "schema",
      "Row",
      {
        id: "value/integer?",
        body: "S",
        note: ["schema/optional", lion(second)],
      },
    ],
    ["relation", "item", ["v"]],
    ["relation", "good", ["v"]],
    ["relation", "odd", ["v"]],
    ["relation", "row", ["id", "body"], { key: "id", schema: "Row" }],
    ["fact", ...values.map((value) => ["item", quote(value)])],
    [
      "fact",
      ["item", 0],
      ...values
        .filter((value) => fits(first, value))
        .map((value, id) => ["row", id, quote(value)]),
    ],
    ["rule", ["good", "?v"], ["item", "?v"], ["S", "?v"]],
    [
      "rule",
      ["odd", "?v"],
      ["item", "?v"],
      ["not", ["schema/fits?", "?v", ["schema/anyOf", "S", lion(second)]]],
    ],
  ];

  const ASK = {
    good: ["find", "?v", ["good", "?v"]],
    odd: ["find", "?v", ["odd", "?v"]],
    rows: ["find", ["array/make", "?id", "?body"], ["row", "?id", "?body"]],
  };

  it.effect.prop(
    "a snapshot rebuilds the schemas, and saving it again changes nothing",
    { given: twoShapes },
    ({ given: { first, second, values } }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        resultOf(yield* evaluate(build(first, second, values), database));
        const saved = yield* saveDatabase(database);
        // The snapshot is loaded where the program's own names are not bound.
        const loaded = yield* loadDatabase(saved, stdlib);
        expect(yield* saveDatabase(loaded)).toEqual(saved);
        expect(yield* attempt(ASK, loaded)).toEqual(
          yield* attempt(ASK, database)
        );
        const checks = [
          "array/make",
          ...values.map((value) => ["S", quote(value)]),
        ];
        expect(resultOf(yield* attempt(checks, loaded))).toEqual(
          values.map((value) => fits(first, value))
        );
        // The relation's schema is still kept.
        const misfit = ["fact", ["row", "x", 0]];
        const refused = yield* attempt(misfit, loaded);
        expect(refused.ok).toBe(false);
        expect(refused).toEqual(yield* attempt(misfit, database));
      }),
    OPTIONS
  );

  it.effect.prop(
    "declaring what the database holds changes nothing, and a name keeps its schema",
    { given: twoShapes },
    ({ given: { first, second, values } }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        const program = build(first, second, values);
        resultOf(yield* evaluate(program, database));
        const saved = yield* saveDatabase(database);
        // The same program again, in a run of its own.
        resultOf(yield* evaluate(program, database));
        expect(yield* saveDatabase(database)).toEqual(saved);
        // The name under another shape is refused, and nothing changes.
        const other = yield* evaluate(
          [["schema", "S", lion(second)]],
          database
        );
        const same = keyOf(lion(first)) === keyOf(lion(second));
        expect(other.ok).toBe(same);
        if (!other.ok) {
          expect(other.message).toContain('Schema "S" is already declared');
        }
        expect(yield* saveDatabase(database)).toEqual(saved);
        // A later run finds the schema under its name.
        const checks = [
          "array/make",
          ...values.map((value) => ["S", quote(value)]),
        ];
        expect(resultOf(yield* attempt(checks, database))).toEqual(
          values.map((value) => fits(first, value))
        );
      }),
    OPTIONS
  );

  /** Expressions that ask the database when they are evaluated. */
  const ASKS = [
    ["find", "?n", ["even", "?n"]],
    ["even", 2],
    ["cond", [["even", 2], 1], ["else", 2]],
    ["array/map", ["array/make", 1, 2], "even"],
  ];

  it.effect.prop(
    "a shape that asks the database while it is declared is refused",
    { schema: shape(1), asks: element(ASKS), nested: element(MODES) },
    ({ schema, asks, nested }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        resultOf(yield* evaluate([true], database));
        const saved = yield* saveDatabase(database);
        const asking = ["schema/anyOf", lion(schema), asks];
        const outcome = yield* evaluate(
          [["schema", "S", nested ? { a: asking } : asking]],
          database
        );
        expect(outcome).toMatchObject({
          ok: false,
          message: expect.stringContaining("while it is declared"),
        });
        // Nothing was declared, so the name is free for a shape that asks
        // when it checks a value instead.
        expect(yield* saveDatabase(database)).toEqual(saved);
        const later = ["lambda", ["v"], ["=", "v", asks]];
        expect(
          resultOf(
            yield* evaluate(
              [
                ["schema", "S", ["schema/anyOf", lion(schema), later]],
                ["S", ["quote", "no such value"]],
              ],
              database
            )
          )
        ).toBe(fits(schema, "no such value"));
      }),
    OPTIONS
  );

  it.effect.prop(
    "a relation and a schema cannot share a name",
    { schema: shape(1), relationFirst: element(MODES) },
    ({ schema, relationFirst }) =>
      Effect.gen(function* () {
        const relation = ["relation", "Thing", ["x"]];
        const declared = ["schema", "Thing", lion(schema)];
        const database = new LogicDatabase();
        const [first, second] = relationFirst
          ? [relation, declared]
          : [declared, relation];
        resultOf(yield* evaluate([first], database));
        const saved = yield* saveDatabase(database);
        const outcome = yield* evaluate([second], database);
        expect(outcome).toMatchObject({
          ok: false,
          message: expect.stringContaining("so it cannot also name"),
        });
        expect(yield* saveDatabase(database)).toEqual(saved);
      }),
    OPTIONS
  );
});

describe("a schema in a rule", () => {
  it.effect.prop(
    "schema/assert gives each value when all fit, and fails the find when one does not",
    { given: checkedMany(1), goalDirected: element(MODES) },
    ({ given: { shape: schema, values }, goalDirected }) =>
      Effect.gen(function* () {
        const outcome = yield* evaluate(
          [
            ["relation", "item", ["v"]],
            ["fact", ...values.map((value) => ["item", quote(value)])],
            ["find", ["schema/assert", "?v", lion(schema)], ["item", "?v"]],
          ],
          new LogicDatabase({ goalDirected })
        );
        if (values.every((value) => fits(schema, value))) {
          expect(keysOf(resultOf(outcome) as unknown[])).toEqual(
            keysOf(values)
          );
        } else {
          expect(outcome).toMatchObject({
            ok: false,
            message: expect.stringContaining("does not fit"),
          });
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "is a check that why shows, after the row the rule matched",
    { given: checkedMany(1) },
    ({ given: { shape: schema, values } }) =>
      Effect.gen(function* () {
        const explained = resultOf(
          yield* evaluate([
            ["schema", "Wanted", lion(schema)],
            ["relation", "item", ["v"]],
            ["relation", "wanted", ["v"]],
            ["fact", ...values.map((value) => ["item", quote(value)])],
            ["rule", ["wanted", "?v"], ["item", "?v"], ["Wanted", "?v"]],
            [
              "array/make",
              ...values.map((value) => ["why", ["wanted", quote(value)]]),
            ],
          ])
        ) as ({ because: { check?: unknown[]; fact?: unknown }[] } | null)[];
        for (const [at, value] of values.entries()) {
          const reason = explained[at];
          if (!fits(schema, value)) {
            expect(reason).toBeNull();
            continue;
          }
          const [row, check] = reason?.because ?? [];
          expect(keyOf(row)).toBe(
            keyOf({ fact: ["item", value], given: true })
          );
          expect(check?.check?.[0]).toBe("Wanted");
        }
      }),
    OPTIONS
  );
});

describe("the schema of a relation's rows names its columns", () => {
  it.effect.prop(
    "all of them, or some of them when the schema is open",
    { given: checkedMany(1) },
    ({ given: { shape: schema, values } }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        resultOf(
          yield* evaluate(
            [
              ["schema", "Body", { body: lion(schema) }],
              ["schema", "OpenBody", ["schema/open", { body: lion(schema) }]],
              ["relation", "strict", ["id", "body"], { schema: "Body" }],
              ["relation", "loose", ["id", "body"], { schema: "OpenBody" }],
            ],
            database
          )
        );
        for (const [id, value] of values.entries()) {
          // A row is a record of every column, so `id` is a key too many.
          expect(
            yield* attempt(["fact", ["strict", id, quote(value)]], database)
          ).toMatchObject({
            ok: false,
            message: expect.stringContaining('does not fit "Body"'),
          });
          const problems = resultOf(
            yield* attempt(
              ["schema/problems", { id, body: quote(value) }, "Body"],
              database
            )
          ) as unknown[];
          expect(problems.map(keyOf)).toContain(
            keyOf({ path: ["id"], found: id })
          );
          const kept = yield* attempt(
            ["fact", ["loose", id, quote(value)]],
            database
          );
          expect(kept.ok).toBe(fits(schema, value));
        }
        const rows = resultOf(
          yield* attempt(
            {
              loose: ["find", "?body", ["loose", "?_", "?body"]],
              strict: ["find", "?body", ["strict", "?_", "?body"]],
            },
            database
          )
        ) as { loose: unknown[]; strict: unknown[] };
        expect(rows.strict).toEqual([]);
        expect(keysOf(rows.loose)).toEqual(
          keysOf(values.filter((value) => fits(schema, value)))
        );
      }),
    OPTIONS
  );
});

describe("a schema used or declared wrongly", () => {
  const ARGUMENT = { a: 1 };

  /** What can be called, how many arguments it takes, and what it says. */
  const CALLS: Record<
    string,
    { call: (args: readonly Form[]) => Form; says: string; takes: number }
  > = {
    "a named schema": {
      call: (args) => ["Tree", ...args],
      says: 'Schema "Tree" takes 1 argument, the value to check',
      takes: 1,
    },
    "a built schema": {
      call: (args) => [["schema/arrayOf", "value/number?"], ...args],
      says: "takes 1 argument, the value to check",
      takes: 1,
    },
    ...Object.fromEntries(
      ["arrayOf", "recordOf", "optional", "open"].map((name) => [
        `schema/${name}`,
        {
          call: (args: readonly Form[]) => [`schema/${name}`, ...args],
          says: `schema/${name} takes 1 argument, a schema`,
          takes: 1,
        },
      ])
    ),
    ...Object.fromEntries(
      ["fits?", "problems", "assert"].map((name) => [
        `schema/${name}`,
        {
          call: (args: readonly Form[]) => [`schema/${name}`, ...args],
          says: `schema/${name} takes 2 arguments, a value and a schema`,
          takes: 2,
        },
      ])
    ),
  };

  it.effect.prop(
    "a call with the wrong number of arguments fails, and says how many it takes",
    { what: element(Object.keys(CALLS)), count: element([0, 1, 2, 3, 4]) },
    ({ what, count }) =>
      Effect.gen(function* () {
        const { call, says, takes } = CALLS[what] as (typeof CALLS)[string];
        const args = Array.from({ length: count }, () => ARGUMENT);
        const outcome = yield* evaluate([call(args), true]);
        if (count === takes) {
          expect(outcome).toEqual({ ok: true, value: true });
          return;
        }
        expect(outcome).toMatchObject({
          ok: false,
          message: expect.stringContaining(says),
        });
        expect(outcome).toMatchObject({
          message: expect.stringContaining(`but got ${count}.`),
        });
      }),
    OPTIONS
  );

  /** What cannot name a schema: a special form's name, or not a string. */
  const NOT_NAMES: readonly Form[] = [
    "begin",
    "quote",
    "schema",
    5,
    null,
    ["quote", "Named"],
    { a: 1 },
  ];

  it.effect.prop(
    "the schema form refuses what is not a name, and a name with no shape, and declares nothing",
    {
      schema: shape(1),
      notName: element(NOT_NAMES),
      how: element(["first", "second", "no shape"] as const),
    },
    ({ schema, notName, how }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        resultOf(yield* evaluate([true], database));
        const saved = yield* saveDatabase(database);
        const written = lion(schema);
        const form = {
          first: ["schema", notName, written, "Good", written],
          second: ["schema", "Good", written, notName, written],
          "no shape": ["schema", "Good", written, "Other"],
        }[how];
        const outcome = yield* evaluate([form], database);
        expect(outcome.ok).toBe(false);
        if (!outcome.ok && how === "second") {
          expect(outcome.message).toContain(
            "A schema's name must be a string that is not the name of a special form"
          );
        }
        if (!outcome.ok && how === "no shape") {
          expect(outcome.message).toContain('"Other" has no shape');
        }
        // Nothing was declared: not even the schema that came before.
        expect(yield* saveDatabase(database)).toEqual(saved);
        resultOf(
          yield* evaluate([["schema", "Good", ["quote", "x"]]], database)
        );
      }),
    OPTIONS
  );

  /** Options that do not name a declared schema, and what each is told. */
  const NOT_SCHEMAS: Record<string, { options: Form; says: string }> = {
    "a name nothing is declared under": {
      options: { schema: "Missing" },
      says: 'names the schema "Missing" for its rows, but no schema is declared under that name',
    },
    "the name of a relation": {
      options: { schema: "even" },
      says: 'names the schema "even" for its rows, but no schema is declared under that name',
    },
    "a shape written in place": {
      options: { schema: { id: "value/integer?" } },
      says: 'The schema of "rows" must be the name of a declared schema, but found',
    },
    "a number": {
      options: { schema: 5 },
      says: 'The schema of "rows" must be the name of a declared schema, but found 5',
    },
    "an option that is not one": {
      options: { shape: "Tree" },
      says: 'Unknown relation option "shape". Relation options are "key", "schema".',
    },
  };

  it.effect.prop(
    "the relation option schema takes the name of a declared schema, and nothing else",
    {
      what: element(Object.keys(NOT_SCHEMAS)),
      columns: element([["id"], ["id", "body"], ["id", "body", "note"]]),
    },
    ({ what, columns }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        resultOf(yield* evaluate([true], database));
        const saved = yield* saveDatabase(database);
        const { options, says } = NOT_SCHEMAS[
          what
        ] as (typeof NOT_SCHEMAS)[string];
        expect(
          yield* evaluate([["relation", "rows", columns, options]], database)
        ).toMatchObject({ ok: false, message: expect.stringContaining(says) });
        // The relation was not declared, so it can be, another way.
        expect(yield* saveDatabase(database)).toEqual(saved);
        resultOf(
          yield* evaluate(
            [["relation", "rows", [...columns, "more"], { schema: "Tree" }]],
            database
          )
        );
      }),
    OPTIONS
  );

  /** Shapes that are not known yet: each waits for a logic variable. */
  const WAITING: readonly Form[] = [
    "?x",
    { a: "?x" },
    ["array/make", 1, "?x"],
    ["schema/arrayOf", "?x"],
    ["schema/anyOf", 1, { a: "?y" }],
    ["number/add", "?x", 1],
  ];

  it.effect.prop(
    "a shape that waits for a logic variable is refused, and nothing is declared",
    { waiting: element(WAITING), schema: shape(1), second: element(MODES) },
    ({ waiting, schema, second }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        resultOf(yield* evaluate([true], database));
        const saved = yield* saveDatabase(database);
        const form = second
          ? ["schema", "Good", lion(schema), "Waits", waiting]
          : ["schema", "Waits", waiting];
        expect(yield* evaluate([form], database)).toMatchObject({
          ok: false,
          message: expect.stringContaining(
            'The shape of schema "Waits" must be known when it is declared'
          ),
        });
        expect(yield* saveDatabase(database)).toEqual(saved);
        resultOf(
          yield* evaluate([["schema", "Waits", lion(schema)]], database)
        );
      }),
    OPTIONS
  );
});

describe("match", () => {
  const branch = Arbitrary.schema(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2 }))
  );

  it.effect.prop(
    "takes the first branch whose schema the value fits",
    {
      given: Arbitrary.flatMap(
        Arbitrary.array(shape(1), { minLength: 1, maxLength: 3 }),
        (shapes) =>
          Arbitrary.map(
            Arbitrary.flatMap(branch, (pick) =>
              valueFor(shapes[pick % shapes.length] as Shape)
            ),
            (value) => ({ shapes, value })
          )
      ),
    },
    ({ given: { shapes, value } }) =>
      Effect.gen(function* () {
        const result = resultOf(
          yield* evaluate([
            [
              "match",
              quote(value),
              ...shapes.map((schema, index) => [
                lion(schema),
                ["lambda", ["x"], index],
              ]),
              ["lambda", ["x"], "none"],
            ],
          ])
        );
        const first = shapes.findIndex((schema) => fits(schema, value));
        expect(result).toBe(first === -1 ? "none" : first);
      }),
    OPTIONS
  );
});

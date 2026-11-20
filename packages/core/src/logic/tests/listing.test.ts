/**
 * A schema stands for every value it allows. When nothing else binds the
 * value a `schema/fits?` checks, and the schema says which values it allows,
 * the check binds the value to each value that fits, as `in` binds its
 * element to each item of a list. Each property checks this against a model
 * that reads a generated schema in plain TypeScript, or against Lion's own
 * check, wherever the goal stands.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { LogicDatabase } from "@/logic/database";
import { MOST_LISTED } from "@/logic/listing";
import { loadDatabase, saveDatabase } from "@/logic/snapshot";
import { stdlib } from "@/modules";
import { attempt, type Outcome } from "./programs";
import {
  bindings,
  candidates,
  countOf,
  finite,
  fits,
  holeAt,
  type Json,
  keyOf,
  lion,
  listed,
  PRELUDE,
  pathsInto,
  quote,
  type Shape,
  valueFor,
} from "./shapes";

const OPTIONS = { timeout: 120_000, arbitrary: { runs: 300 } };

/** Listings the model can work out quickly; larger ones are left out. */
const MOST_IN_A_RUN = 5000;

/**
 * What a goal says when its schema cannot list the values it allows: that
 * it cannot stand for them, or, for one that gives them a shape with
 * numbers left open, that they are infinitely many.
 */
const REFUSED =
  /A schema binds the value it checks only when it can stand|infinitely many values|cannot stand for it|The solver cannot reason/;

const evaluate = (forms: readonly unknown[], database = new LogicDatabase()) =>
  attempt(["begin", ...PRELUDE, ...forms], database);

const keysOf = (values: Iterable<unknown>) =>
  [...new Set([...values].map(keyOf))].sort();

/** The value of an outcome that must have one. */
const succeeded = (outcome: Outcome): unknown => {
  expect(outcome).toMatchObject({ ok: true });
  return outcome.ok ? outcome.value : undefined;
};

/** True when the model can list a shape's values, and they are few. */
const small = (shape: Shape) => {
  const count = countOf(shape);
  return count !== undefined && count <= MOST_IN_A_RUN;
};

/** A shape the model lists, with its values, or the shape it refuses. */
const shapes = Arbitrary.filter(finite(2), (shape) => {
  const count = countOf(shape);
  return count === undefined || count <= MOST_IN_A_RUN;
});

const listable = Arbitrary.filter(finite(2), small);

/** A whole number to pick an item or a path with. */
const index = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000 }))
);

/** A shape the model lists, with values made to fit it or to almost fit. */
const listableWithValues = Arbitrary.flatMap(listable, (shape) =>
  Arbitrary.map(
    Arbitrary.array(valueFor(shape), { maxLength: 8 }),
    (values) => ({ shape, values })
  )
);

const find = (shape: Shape) => [
  "find",
  "?x",
  ["schema/fits?", "?x", lion(shape)],
];

describe("a schema that stands for each value it allows", () => {
  it.effect.prop(
    "binds the value to exactly the values that fit, or is refused when it cannot say which",
    {
      tried: Arbitrary.flatMap(shapes, (shape) =>
        Arbitrary.map(
          Arbitrary.array(valueFor(shape), { maxLength: 6 }),
          (values) => ({ shape, values })
        )
      ),
    },
    ({ tried: { shape, values } }) =>
      Effect.gen(function* () {
        const outcome = yield* evaluate([find(shape)]);
        const expected = listed(shape);
        if (expected !== undefined) {
          expect(keysOf(succeeded(outcome) as unknown[])).toEqual(
            keysOf(expected)
          );
          return;
        }
        // The model cannot list it. Lion refuses, or says the values are
        // infinitely many, or, when the solver shows there are finitely
        // many, such as none, lists them: each fits, and none is left out.
        if (!outcome.ok) {
          expect(outcome.message).toMatch(REFUSED);
          return;
        }
        const found = new Set((outcome.value as Json[]).map(keyOf));
        for (const value of outcome.value as Json[]) {
          expect(fits(shape, value)).toBe(true);
        }
        for (const value of values.filter((v) => fits(shape, v))) {
          expect(found.has(keyOf(value)), JSON.stringify(value)).toBe(true);
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "lists a value exactly when checking that value says it fits",
    { tried: listableWithValues },
    ({ tried: { shape, values: made } }) =>
      Effect.gen(function* () {
        const found = (yield* evaluate([find(shape)])) as Outcome;
        const values = succeeded(found) as Json[];
        const listedKeys = new Set(values.map(keyOf));
        // Every candidate the model gives, those that fit and those that do
        // not, and values made to fit or to almost fit.
        const tried = [...(candidates(shape) ?? []), ...made];
        for (const value of tried) {
          const checked = succeeded(
            yield* evaluate([["schema/fits?", quote(value), lion(shape)]])
          );
          expect(listedKeys.has(keyOf(value)), JSON.stringify(value)).toBe(
            checked
          );
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "binds the variables of a pattern in place of the value to each value's parts",
    {
      shape: listable,
      pick: index,
      path: index,
    },
    ({ path, pick, shape }) =>
      Effect.gen(function* () {
        const values = listed(shape) ?? [];
        const sample = values[pick % Math.max(values.length, 1)];
        if (sample === undefined) {
          return;
        }
        const paths = pathsInto(sample);
        const pattern = holeAt(sample, paths[path % paths.length] ?? []);
        const outcome = yield* evaluate([
          ["find", "?y", ["schema/fits?", lion(pattern), lion(shape)]],
        ]);
        const expected = values.flatMap((value) =>
          bindings(pattern, value).map((bound) => bound.get("y"))
        );
        expect(keysOf(succeeded(outcome) as unknown[])).toEqual(
          keysOf(expected)
        );
      }),
    OPTIONS
  );

  it.effect.prop(
    "gives the same values in a rule, a query, under not, goal-directed, and after a snapshot",
    { shape: listable, pick: index },
    ({ pick, shape }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        const values = (listed(shape) ?? []) as Json[];
        const setup = yield* evaluate(
          [
            ["relation", "allowed", ["x"]],
            ["rule", ["allowed", "?x"], ["schema/fits?", "?x", lion(shape)]],
            true,
          ],
          database
        );
        expect(setup).toEqual({ ok: true, value: true });
        const rows = succeeded(
          yield* evaluate([["find", "?x", ["allowed", "?x"]]], database)
        );
        expect(keysOf(rows as unknown[])).toEqual(keysOf(values));
        const query = succeeded(
          yield* evaluate(
            [["query", ["schema/fits?", "?x", lion(shape)]]],
            database
          )
        ) as { readonly x: unknown }[];
        expect(keysOf(query.map(({ x }) => x))).toEqual(keysOf(values));
        const none = succeeded(
          yield* evaluate(
            [
              [
                "query",
                [
                  "and",
                  ["=", "?any", true],
                  // As for "in" and "=", the variable is the question's
                  // own when `exists` says so.
                  [
                    "not",
                    ["exists", ["?x"], ["schema/fits?", "?x", lion(shape)]],
                  ],
                ],
              ],
            ],
            database
          )
        ) as unknown[];
        expect(none.length).toBe(values.length === 0 ? 1 : 0);
        const one = values[pick % Math.max(values.length, 1)];
        if (one !== undefined) {
          const asked = succeeded(
            yield* evaluate([["query", ["allowed", quote(one)]]], database)
          );
          expect(asked).toEqual([{}]);
          const why = yield* evaluate(
            [["why", ["allowed", quote(one)]]],
            database
          );
          expect(why).toMatchObject({
            ok: true,
            value: { because: [{ check: expect.anything() }] },
          });
        }
        const loaded = yield* loadDatabase(
          yield* saveDatabase(database),
          stdlib
        );
        const again = succeeded(
          yield* attempt(["find", "?x", ["allowed", "?x"]], loaded)
        );
        expect(keysOf(again as unknown[])).toEqual(keysOf(values));
      }),
    OPTIONS
  );

  it.effect.prop(
    "binds a value only where no relation goal or test can, so goal order changes nothing",
    { shape: listable, from: index },
    ({ from, shape }) =>
      Effect.gen(function* () {
        const values = (listed(shape) ?? []) as Json[];
        // Some of the listed values, and a value no schema here lists.
        const kept = [
          ...values.filter((_, at) => (at + from) % 2 === 0),
          "not listed",
        ];
        const forms = [
          ["relation", "kept", ["x"]],
          ["fact", ...kept.map((value) => ["kept", quote(value)])],
        ];
        const check = ["schema/fits?", "?x", lion(shape)];
        const first = yield* evaluate([
          ...forms,
          ["find", "?x", ["and", check, ["kept", "?x"]]],
        ]);
        const second = yield* evaluate([
          ...forms,
          ["find", "?x", ["and", ["kept", "?x"], check]],
        ]);
        expect(first).toEqual(second);
        expect(keysOf(succeeded(first) as unknown[])).toEqual(
          keysOf(
            kept.filter((value) =>
              values.some((v) => keyOf(v) === keyOf(value))
            )
          )
        );
      }),
    OPTIONS
  );

  it.effect.prop(
    "is never listed where a relation goal binds the value, however many values it allows",
    {
      size: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 }))
      ),
      written: Arbitrary.schema(Schema.Boolean),
    },
    ({ size, written }) =>
      Effect.gen(function* () {
        // Far more lists than may be listed, of which the relation holds two.
        const digits = [
          "schema/anyOf",
          ...Array.from({ length: 10 }, (_, n) => n),
        ];
        const many = ["schema/arrayOf", digits, 6 + size];
        const held = [
          [1, 2],
          [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2],
        ];
        const goals = [
          ["schema/fits?", "?x", many],
          ["held", "?x"],
        ];
        const outcome = yield* evaluate([
          ["relation", "held", ["x"]],
          ["fact", ...held.map((list) => ["held", quote(list)])],
          ["find", "?x", ["and", ...(written ? goals : goals.toReversed())]],
        ]);
        expect(outcome).toEqual({ ok: true, value: [[1, 2]] });
      }),
    { timeout: 120_000, arbitrary: { runs: 8 } }
  );

  it.effect.prop(
    "refuses to list more values than it may, and says how many",
    {
      size: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 }))
      ),
    },
    ({ size }) =>
      Effect.gen(function* () {
        // Ten choices for each of six items: a million lists, and more.
        const digits = [
          "schema/anyOf",
          ...Array.from({ length: 10 }, (_, n) => n),
        ];
        const outcome = yield* evaluate([
          [
            "find",
            "?x",
            ["schema/fits?", "?x", ["schema/arrayOf", digits, 6 + size]],
          ],
        ]);
        expect(outcome).toMatchObject({
          ok: false,
          message: expect.stringContaining(
            `at most ${MOST_LISTED.toLocaleString("en")} values`
          ),
        });
      }),
    { timeout: 120_000, arbitrary: { runs: 4 } }
  );
});

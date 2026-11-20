/**
 * schema/includes? says whether every value one schema allows fits another.
 * For a schema that lists its values, the model lists them too and checks
 * each; for whole numbers between bounds, every number of the box is
 * checked by plain code. Where Lion answers, it agrees.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { LogicDatabase } from "@/logic/database";
import { attempt } from "./programs";
import {
  countOf,
  finite,
  fits,
  type Json,
  lion,
  listed,
  PRELUDE,
  type Shape,
  shape,
} from "./shapes";

const OPTIONS = { timeout: 120_000 };

const int = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

const evaluate = (form: unknown) =>
  attempt(["begin", ...PRELUDE, form], new LogicDatabase());

const small = (given: Shape) => {
  const count = countOf(given);
  return count !== undefined && count <= 200;
};

/** A comparison of the number n with a bound. */
const comparison = Arbitrary.map(
  Arbitrary.all([
    Arbitrary.schema(
      Schema.Literals([
        "number/lessThan",
        "number/lessThanOrEqualTo",
        "number/greaterThan",
        "number/greaterThanOrEqualTo",
      ])
    ),
    int(-4, 4),
    int(-3, 3),
  ]),
  ([op, bound, k]) => [
    op,
    ["number/add", ["number/multiply", k, "n"], 1],
    bound,
  ]
);

/** Whole numbers between two bounds, and maybe a comparison more. */
const bounded = (low: number, high: number, more: unknown[]) => [
  "schema/allOf",
  "value/integer?",
  [
    "lambda",
    ["n"],
    [
      ["number/greaterThanOrEqualTo", "n", low],
      ["number/lessThanOrEqualTo", "n", high],
      ...more,
    ].reduce((all, each) => ["boolean/and", all, each]),
  ],
];

describe("schema/includes?", () => {
  it.effect.prop(
    "says a schema that lists its values includes another exactly when each of its values fits that one",
    { inner: Arbitrary.filter(finite(2), small), outer: shape(2) },
    ({ inner, outer }) =>
      Effect.gen(function* () {
        const values = listed(inner);
        if (values === undefined) {
          return;
        }
        const outcome = yield* evaluate([
          "schema/includes?",
          lion(inner),
          lion(outer),
        ]);
        expect(outcome).toEqual({
          ok: true,
          value: values.every((value) => fits(outer, value as Json)),
        });
      }),
    OPTIONS
  );

  it.effect.prop(
    "decides for whole numbers whether each between bounds meets a comparison, as checking every one says",
    {
      low: int(-4, 0),
      high: int(0, 4),
      inner: Arbitrary.array(comparison, { maxLength: 1 }),
      outer: comparison,
      record: Arbitrary.schema(Schema.Boolean),
    },
    ({ high, inner, low, outer, record }) =>
      Effect.gen(function* () {
        const innerSchema = bounded(low, high, inner);
        const outerSchema = [
          "schema/allOf",
          "value/integer?",
          ["lambda", ["n"], outer],
        ];
        // The same, about a field of a record.
        const wrap = (schema: unknown) => (record ? { a: schema } : schema);
        const outcome = yield* evaluate([
          "schema/includes?",
          wrap(innerSchema),
          wrap(outerSchema),
        ]);
        const check = (schema: unknown, n: number) =>
          evaluate(["schema/fits?", n, schema]);
        let every = true;
        for (let n = low; n <= high; n += 1) {
          const allowed = yield* check(innerSchema, n);
          if (allowed.ok && allowed.value === true) {
            const fit = yield* check(outerSchema, n);
            every &&= fit.ok && fit.value === true;
          }
        }
        expect(outcome).toEqual({ ok: true, value: every });
      }),
    OPTIONS
  );

  it.effect.prop(
    "never says an unbounded schema is included where some value of a box fails the other",
    { outer: comparison },
    ({ outer }) =>
      Effect.gen(function* () {
        const outerSchema = [
          "schema/allOf",
          "value/integer?",
          ["lambda", ["n"], outer],
        ];
        const outcome = yield* evaluate([
          "schema/includes?",
          "value/integer?",
          outerSchema,
        ]);
        expect(outcome).toMatchObject({ ok: true });
        let anyFails = false;
        for (let n = -10; n <= 10; n += 1) {
          const fit = yield* evaluate(["schema/fits?", n, outerSchema]);
          anyFails ||= !(fit.ok && fit.value === true);
        }
        if (anyFails) {
          expect(outcome).toEqual({ ok: true, value: false });
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "says a schema includes itself, whatever it allows",
    { given: shape(2) },
    ({ given }) =>
      Effect.gen(function* () {
        const outcome = yield* evaluate([
          "schema/includes?",
          lion(given),
          lion(given),
        ]);
        expect(outcome).toEqual({ ok: true, value: true });
      }),
    OPTIONS
  );
});

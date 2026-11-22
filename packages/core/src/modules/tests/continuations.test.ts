/**
 * Delimited continuations, resumed once. The model is plain TypeScript
 * arithmetic: a reset of f around a shift whose handler is g of k of v is
 * g(f(v)), a reset with no shift is its thunk's value, and a generator made
 * of shifts gives back the items it was written with, in order.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";

const small = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: -9, maximum: 9 }))
);

const outcome = (program: unknown) =>
  run(program, stdlib).pipe(
    Effect.map((value) => ({ value })),
    Effect.catch((error) =>
      Effect.succeed({ failed: String((error as Error).message) })
    )
  );

describe("func/reset and func/shift", () => {
  it.effect.prop(
    "give g(f(v)) for a reset of f around a shift whose handler gives g of k of v",
    { a: small, b: small, v: small, resumes: Arbitrary.schema(Schema.Boolean) },
    ({ a, b, v, resumes }) =>
      Effect.gen(function* () {
        // f adds a, g multiplies by b; without a resume the handler gives b.
        const handler = resumes
          ? ["lambda", ["k"], ["number/multiply", b, ["k", v]]]
          : ["lambda", ["k"], b];
        const result = yield* outcome([
          "func/reset",
          ["lambda", [], ["number/add", a, ["func/shift", handler]]],
        ]);
        // Lion has no -0: an exact product of 0 is 0.
        expect(result).toEqual({ value: (resumes ? b * (a + v) : b) + 0 });
        expect(
          yield* outcome(["func/reset", ["lambda", [], ["number/add", a, v]]])
        ).toEqual({ value: a + v });
      })
  );

  it.effect.prop(
    "make a generator that gives back its items in order",
    { items: Arbitrary.array(small, { maxLength: 6 }) },
    ({ items }) =>
      Effect.gen(function* () {
        // Each item is yielded by a shift whose handler gives it and k.
        const generator = [
          "func/reset",
          [
            "lambda",
            [],
            [
              "begin",
              ...items.map((item) => [
                "func/shift",
                ["lambda", ["k"], { value: item, rest: "k" }],
              ]),
              { value: null, rest: null },
            ],
          ],
        ];
        const program = [
          "begin",
          [
            "define",
            "drain",
            [
              "lambda",
              ["step", "got"],
              [
                "cond",
                [["value/null?", ["object/get", "step", "rest"]], "got"],
                [
                  "else",
                  [
                    "drain",
                    [["object/get", "step", "rest"], null],
                    [
                      "array/concat",
                      "got",
                      ["array/make", ["object/get", "step", "value"]],
                    ],
                  ],
                ],
              ],
            ],
          ],
          ["drain", generator, ["array/make"]],
        ];
        expect(yield* outcome(program)).toEqual({ value: items });
      })
  );

  it.effect.prop(
    "fail on a second resume of one continuation, and on a shift with no reset",
    { v: small },
    ({ v }) =>
      Effect.gen(function* () {
        const twice = yield* outcome([
          "func/reset",
          [
            "lambda",
            [],
            [
              "number/add",
              1,
              [
                "func/shift",
                ["lambda", ["k"], ["array/make", ["k", v], ["k", v]]],
              ],
            ],
          ],
        ]);
        expect(twice).toEqual({
          failed:
            "A continuation was resumed a second time: the one func/shift gives goes on once.",
        });
        const outside = yield* outcome(["func/shift", ["lambda", ["k"], v]]);
        expect((outside as { failed: string }).failed).toContain(
          "func/shift needs a func/reset around it"
        );
      })
  );
});

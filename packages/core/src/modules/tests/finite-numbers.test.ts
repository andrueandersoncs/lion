/**
 * Lion's numbers are JSON numbers, so arithmetic never produces Infinity or
 * NaN: a result that is not a finite number is an ArithmeticError.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";

/** Ordinary numbers, plus zeros and numbers near the largest double. */
const number = Arbitrary.flatMap(
  Arbitrary.schema(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 }))
  ),
  (kind) =>
    kind === 0
      ? Arbitrary.schema(Schema.Literals([0, 1e308, -1e308, 1.5e308]))
      : Arbitrary.schema(
          Schema.Int.check(Schema.isBetween({ minimum: -1000, maximum: 1000 }))
        )
);

const OPERATIONS: Record<string, (a: number, b: number) => number> = {
  "number/add": (a, b) => a + b,
  "number/subtract": (a, b) => a - b,
  "number/multiply": (a, b) => a * b,
  "number/divide": (a, b) => a / b,
};

/** The result, or the tag and message of the error. */
const outcome = (program: unknown) =>
  run(program, stdlib).pipe(
    Effect.map((value) => ({ value })),
    Effect.catch((error) =>
      Effect.succeed({
        tag: (error as { _tag?: unknown })._tag,
        message: String((error as { message?: unknown }).message),
      })
    )
  );

describe("arithmetic", () => {
  it.effect.prop(
    "returns the JavaScript result when it is finite, and fails otherwise",
    { a: number, b: number },
    ({ a, b }) =>
      Effect.gen(function* () {
        for (const [name, operate] of Object.entries(OPERATIONS)) {
          const expected = operate(a, b);
          const result = yield* outcome([name, a, b]);
          if (Number.isFinite(expected)) {
            expect(result).toEqual({ value: expected });
          } else {
            expect(result).toMatchObject({ tag: "ArithmeticError" });
            expect((result as { message: string }).message).toContain(name);
          }
        }
      })
  );

  it.effect.prop(
    "of aggregate/sum and aggregate/mean follows the same rule",
    { values: Arbitrary.array(number, { minLength: 1, maxLength: 5 }) },
    ({ values }) =>
      Effect.gen(function* () {
        const sum = values.reduce((total, value) => total + value, 0);
        for (const [name, expected] of [
          ["aggregate/sum", sum],
          ["aggregate/mean", sum / values.length],
        ] as const) {
          const result = yield* outcome([name, ["quote", values]]);
          if (Number.isFinite(expected)) {
            expect(result).toEqual({ value: expected });
          } else {
            expect(result).toMatchObject({ tag: "ArithmeticError" });
          }
        }
      })
  );
});

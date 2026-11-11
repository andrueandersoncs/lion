import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate.ts";
import { stdlib } from "@/modules";

describe("function call evaluation", () => {
  it.effect.prop(
    "should evaluate pure function calls by applying the function to the arguments",
    [Schema.Number, Schema.Number],
    ([a, b]) =>
      Effect.gen(function* () {
        // A result JSON cannot hold, such as an overflow, is an error.
        for (const [name, expected] of [
          ["number/add", a + b],
          ["number/subtract", a - b],
          ["number/multiply", a * b],
        ] as const) {
          const outcome = yield* run([name, a, b], stdlib).pipe(
            Effect.map((value) => ({ value })),
            Effect.catch((error) =>
              Effect.succeed({ tag: (error as { _tag?: unknown })._tag })
            )
          );
          expect(outcome).toEqual(
            Number.isFinite(expected)
              ? { value: expected }
              : { tag: "ArithmeticError" }
          );
        }
      })
  );
});

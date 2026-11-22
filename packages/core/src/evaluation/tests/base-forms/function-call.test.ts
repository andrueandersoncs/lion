import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate.ts";
import { stdlib } from "@/modules";
import { asFraction, minus, plus, same, times } from "@/numbers/tests/model";

describe("function call evaluation", () => {
  it.effect.prop(
    "should evaluate pure function calls by applying the function to the arguments, exactly",
    [Schema.Finite, Schema.Finite],
    ([a, b]) =>
      Effect.gen(function* () {
        // Every number is exact, so no sum, difference, or product overflows
        // or rounds: each is the exact one.
        for (const [name, model] of [
          ["number/add", plus],
          ["number/subtract", minus],
          ["number/multiply", times],
        ] as const) {
          const value = yield* run([name, a, b], stdlib);
          expect(
            same(asFraction(value), model(asFraction(a), asFraction(b))),
            `${name} ${a} ${b}`
          ).toBe(true);
        }
      })
  );
});

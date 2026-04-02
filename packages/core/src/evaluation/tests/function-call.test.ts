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
        expect(yield* run(["number/add", a, b], stdlib)).toBe(a + b);
        expect(yield* run(["number/subtract", a, b], stdlib)).toBe(a - b);
        expect(yield* run(["number/multiply", a, b], stdlib)).toBe(a * b);
      })
  );
});

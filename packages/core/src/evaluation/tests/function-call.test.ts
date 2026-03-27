import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Ref, Schema } from "effect";
import { evaluate } from "@/evaluation/evaluate.ts";
import { stdlib } from "@/modules/index.ts";
import { LionEnvironmentService } from "@/services/evaluation.ts";

const testEnvLayer = Layer.effect(LionEnvironmentService, Ref.make(stdlib));

describe("function call evaluation", () => {
  it.effect.prop(
    "should evaluate pure function calls by applying the function to the arguments",
    [Schema.Number, Schema.Number],
    ([a, b]) =>
      Effect.gen(function* () {
        expect(yield* evaluate(["math/+", a, b])).toBe(a + b);
        expect(yield* evaluate(["math/-", a, b])).toBe(a - b);
        expect(yield* evaluate(["math/*", a, b])).toBe(a * b);
      }).pipe(Effect.provide(testEnvLayer))
  );
});

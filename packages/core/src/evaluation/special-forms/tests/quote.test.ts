import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Ref } from "effect";
import { stdlib } from "@/modules/index.ts";
import { LionEnvironmentService } from "@/services/evaluation.ts";
import { evaluateQuote } from "../quote.ts";

const testEnvLayer = Layer.effect(LionEnvironmentService, Ref.make(stdlib));

describe("quote special form", () => {
  it.effect("should return the argument unevaluated", () =>
    Effect.gen(function* () {
      expect(yield* evaluateQuote(["quote", ["+", 1, 2]])).toEqual(["+", 1, 2]);
    }).pipe(Effect.provide(testEnvLayer))
  );

  it.effect("should quote primitives", () =>
    Effect.gen(function* () {
      expect(yield* evaluateQuote(["quote", 42])).toBe(42);
      expect(yield* evaluateQuote(["quote", "hello"])).toBe("hello");
    }).pipe(Effect.provide(testEnvLayer))
  );

  it.effect("should quote nested structures", () =>
    Effect.gen(function* () {
      const nested = ["list", ["quote", 1], ["quote", 2]];
      expect(yield* evaluateQuote(["quote", nested])).toEqual(nested);
    }).pipe(Effect.provide(testEnvLayer))
  );
});

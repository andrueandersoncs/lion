import { describe, it, expect } from "@effect/vitest";
import { evaluateFunctionCall } from "../function.ts";
import { Effect, Layer, Ref } from "effect";
import { LionEnvironment } from "../../evaluate.ts";
import { math } from "../../../modules/math.ts";

const stdlib: Record<string, unknown> = {
  ...math,
};

const testEnvLayer = Layer.effect(LionEnvironment, Ref.make(stdlib));

describe("evaluateFunctionCall", () => {
  it.effect("should evaluate a function call", () =>
    Effect.gen(function* () {
      const result = yield* evaluateFunctionCall(["+", 1, 2]);
      expect(result).toBe(3);
    }).pipe(Effect.provide(testEnvLayer))
  );
  it.effect("should should return a list cons expression if the function call is not a function", () =>
    Effect.gen(function* () {
      const result = yield* evaluateFunctionCall(["not-a-function", ["+", 1, 1], 1, 2]);
      expect(result).toEqual(["not-a-function", 2, 1, 2]);
    }).pipe(Effect.provide(testEnvLayer))
  );
});

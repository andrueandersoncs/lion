import { describe, it, expect } from "@effect/vitest";
import { evaluateEval } from "../eval.ts";
import { Effect, Layer, Ref } from "effect";
import { LionEnvironment } from "../../evaluate.ts";
import { math } from "../../../modules/math.ts";
import { ParseError } from "effect/ParseResult";

const stdlib: Record<string, unknown> = {
  ...math,
};

const testEnvLayer = Layer.effect(LionEnvironment, Ref.make(stdlib));

describe("eval special form", () => {
  it.effect("should evaluate a quoted expression", () =>
    Effect.gen(function* () {
      const env: Record<string, unknown> = { ...stdlib, expr: ["+", 1, 2] };
      const result = yield* evaluateEval(["eval", "expr"]).pipe(
        Effect.provideServiceEffect(LionEnvironment, Ref.make<Record<string, unknown>>(env))
      );
      expect(result).toBe(3);
    })
  );

  it.effect("should double-evaluate nested quotes", () =>
    Effect.gen(function* () {
      const result = yield* evaluateEval(["eval", ["quote", ["+", 1, 2]]]);
      expect(result).toBe(3);
    }).pipe(Effect.provide(testEnvLayer))
  );

  it.effect("should throw for invalid expressions in eval", () =>
    Effect.gen(function* () {
      // Functions are valid LionValues but not valid LionExpressions
      const env: Record<string, unknown> = {
        ...stdlib,
        fn: () => Effect.succeed(() => Effect.succeed(null)),
      };
      const result = yield* Effect.flip(evaluateEval(["eval", ["fn"]])).pipe(
        Effect.provideServiceEffect(LionEnvironment, Ref.make<Record<string, unknown>>(env))
      );
      expect(result).toBeInstanceOf(ParseError);
    })
  );
});

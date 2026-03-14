import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Ref } from "effect";
import { ParseError } from "effect/ParseResult";
import { LionEnvironmentService } from "@/evaluation/evaluate";
import { evaluateEval } from "@/evaluation/special-forms/eval";

const testEnvLayer = Layer.effect(LionEnvironmentService, Ref.make(stdlib));

describe("eval special form", () => {
  it.effect("should evaluate a quoted expression", () =>
    Effect.gen(function* () {
      const env: Record<string, unknown> = { ...stdlib, expr: ["+", 1, 2] };
      const result = yield* evaluateEval(["eval", "expr"]).pipe(
        Effect.provideServiceEffect(
          LionEnvironmentService,
          Ref.make<Record<string, unknown>>(env)
        )
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
        Effect.provideServiceEffect(
          LionEnvironmentService,
          Ref.make<Record<string, unknown>>(env)
        )
      );
      expect(result).toBeInstanceOf(ParseError);
    })
  );
});

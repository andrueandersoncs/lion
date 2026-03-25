import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Ref } from "effect";
import { ContinuationNeededError } from "@/errors/evaluation";
import { evaluateEval } from "@/evaluation/special-forms/eval";
import { stdlib } from "@/modules";
import type { OplogEntrySchema } from "@/schemas/oplog";
import { LionEnvironmentService } from "@/services/evaluation";
import { LionOplogService } from "@/services/oplog";

const testEnvLayer = Layer.merge(
  Layer.effect(LionEnvironmentService, Ref.make(stdlib)),
  Layer.effect(LionOplogService, Ref.make<(typeof OplogEntrySchema.Type)[]>([]))
);

describe("eval special form", () => {
  it.effect("should evaluate a quoted expression", () =>
    Effect.gen(function* () {
      const env: Record<string, unknown> = {
        ...stdlib,
        expr: ["math/+", 1, 2],
      };
      const result = yield* evaluateEval(["eval", "expr"]).pipe(
        Effect.provideServiceEffect(
          LionEnvironmentService,
          Ref.make<Record<string, unknown>>(env)
        ),
        Effect.provideServiceEffect(
          LionOplogService,
          Ref.make<(typeof OplogEntrySchema.Type)[]>([])
        )
      );
      expect(result).toBe(3);
    })
  );

  it.effect("should double-evaluate nested quotes", () =>
    Effect.gen(function* () {
      const result = yield* evaluateEval(["eval", ["quote", ["math/+", 1, 2]]]);
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
        ),
        Effect.provideServiceEffect(
          LionOplogService,
          Ref.make<(typeof OplogEntrySchema.Type)[]>([])
        )
      );
      expect(result).toBeInstanceOf(ContinuationNeededError);
    })
  );
});

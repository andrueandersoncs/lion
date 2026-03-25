import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, type Record, Ref } from "effect";
import { stdlib } from "@/modules/index.ts";
import type { OplogEntrySchema } from "@/schemas/oplog.ts";
import { LionEnvironmentService } from "@/services/evaluation.ts";
import { LionOplogService } from "@/services/oplog.ts";
import { evaluateFunctionCall } from "../function.ts";

const stdlibLayer = Layer.effect(LionEnvironmentService, Ref.make(stdlib));

const testEnvLayer = Layer.merge(
  stdlibLayer,
  Layer.effect(LionOplogService, Ref.make<(typeof OplogEntrySchema.Type)[]>([]))
);

describe("evaluateFunctionCall", () => {
  it.effect("should evaluate a function call", () =>
    Effect.gen(function* () {
      const result = yield* evaluateFunctionCall(["+", 1, 2]);
      expect(result).toBe(3);
    }).pipe(Effect.provide(testEnvLayer))
  );
  it.effect(
    "should should return a list cons expression if the function call is not a function",
    () =>
      Effect.gen(function* () {
        const result = yield* evaluateFunctionCall([
          "not-a-function",
          ["+", 1, 1],
          1,
          2,
        ]);
        expect(result).toEqual(["not-a-function", 2, 1, 2]);
      }).pipe(Effect.provide(testEnvLayer))
  );
  it.effect("should ignore oplog for pure functions", () =>
    Effect.gen(function* () {
      const result = yield* evaluateFunctionCall(["+", 1, 2]);
      expect(result).toBe(3);
    }).pipe(Effect.provide(testEnvLayer))
  );
  it.effect(
    "should pause evaluation for impure functions that haven't been started",
    () =>
      Effect.gen(function* () {
        const result = yield* evaluateFunctionCall(["+", 1, 2]);
        expect(result);
      }).pipe(
        Effect.provideServiceEffect(
          LionEnvironmentService,
          Ref.make<Record<string, unknown>>({
            ...stdlib,
            "impure-function": () => Effect.succeed(3),
          })
        ),
        Effect.provideServiceEffect(
          LionOplogService,
          Ref.make<(typeof OplogEntrySchema.Type)[]>([])
        )
      )
  );
});

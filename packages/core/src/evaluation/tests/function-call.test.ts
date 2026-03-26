import { describe, expect, it, vi } from "@effect/vitest";
import { Effect, Layer, Ref, Schema } from "effect";
import { ContinuationNeededError } from "@/errors/evaluation.ts";
import { evaluate } from "@/evaluation/evaluate.ts";
import { stdlib } from "@/modules/index.ts";
import {
  OperationCompletedSchema,
  OperationStartedSchema,
} from "@/schemas/oplog";
import {
  LionEnvironmentService,
  makeEnvironmentRef,
} from "@/services/evaluation.ts";
import { LionOplogService, makeOplogRef } from "@/services/oplog.ts";

const stdlibLayer = Layer.effect(LionEnvironmentService, Ref.make(stdlib));

const testEnvLayer = Layer.merge(
  stdlibLayer,
  Layer.effect(LionOplogService, makeOplogRef([]))
);

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
  it.effect(
    "should pause evaluation, inserting an operation_started entry for impure functions that haven't been started",
    () =>
      Effect.gen(function* () {
        const expression = ["impure-function", 1, 2] as const;
        const impureFunction = vi.fn(() => Effect.succeed(3));
        const oplogRef = yield* makeOplogRef([]);
        const result = yield* Effect.flip(evaluate(expression)).pipe(
          Effect.provideServiceEffect(
            LionEnvironmentService,
            makeEnvironmentRef({
              ...stdlib,
              "impure-function": impureFunction,
            })
          ),
          Effect.provideService(LionOplogService, oplogRef)
        );
        expect(result).toBeInstanceOf(ContinuationNeededError);
        expect(yield* Ref.get(oplogRef)).toEqual([
          new OperationStartedSchema({
            expression,
          }),
        ]);
        expect(impureFunction).not.toHaveBeenCalled();
      })
  );
  it.effect(
    "should continue evaluation, reusing the existing value from the operation_completed entry for impure functions that were already completed",
    () =>
      Effect.gen(function* () {
        const impureFunction = vi.fn(() => Effect.succeed(3));
        const oplogRef = yield* makeOplogRef([
          new OperationCompletedSchema({
            expression: ["impure-function", 1, 2],
            result: 7,
          }),
          new OperationStartedSchema({
            expression: ["impure-function", 1, 2],
          }),
        ]);
        const result = yield* evaluate(["impure-function", 1, 2]).pipe(
          Effect.provideServiceEffect(
            LionEnvironmentService,
            makeEnvironmentRef({
              ...stdlib,
              "impure-function": impureFunction,
            })
          ),
          Effect.provideService(LionOplogService, oplogRef)
        );
        expect(result).toBe(7);
        expect(impureFunction).not.toHaveBeenCalled();
        expect(yield* Ref.get(oplogRef)).toEqual([]);
      })
  );
});

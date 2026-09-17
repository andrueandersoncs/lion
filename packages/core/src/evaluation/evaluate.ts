import { Effect, pipe, Schema } from "effect";
import { evaluateArray } from "@/evaluation/base-forms/array";
import { evaluatePrimitive } from "@/evaluation/base-forms/primitive";
import { evaluateRecord } from "@/evaluation/base-forms/record";
import { makeEnvironment } from "@/evaluation/environment";
import {
  LionArrayExpressionSchema,
  LionExpressionSchema,
  type LionExpressionType,
  LionRecordExpressionSchema,
} from "@/schemas/lion-expression";
import { LionEnvironmentService } from "@/services/evaluation";
import type { EvaluateResult } from "@/types/evaluation";

export const evaluate = (expression: LionExpressionType): EvaluateResult => {
  if (Schema.is(LionArrayExpressionSchema)(expression)) {
    return evaluateArray(expression);
  }
  if (Schema.is(LionRecordExpressionSchema)(expression)) {
    return evaluateRecord(expression);
  }
  return evaluatePrimitive(expression);
};

export const run = (
  expression: unknown,
  environment: Record<string, unknown>
) =>
  pipe(
    Schema.decodeUnknownEffect(LionExpressionSchema)(expression),
    Effect.flatMap(evaluate),
    Effect.provideServiceEffect(
      LionEnvironmentService,
      makeEnvironment(environment)
    )
  );

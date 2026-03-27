import { Effect, Match, pipe, Schema } from "effect";
import { evaluateArray } from "@/evaluation/base-forms/array";
import { evaluatePrimitive } from "@/evaluation/base-forms/primitive";
import { evaluateRecord } from "@/evaluation/base-forms/record";
import { JsonPrimitiveSchema } from "@/schemas/json-primitive";
import {
  LionArrayExpressionSchema,
  LionExpressionSchema,
  type LionExpressionType,
  LionRecordExpressionSchema,
} from "@/schemas/lion-expression";
import {
  LionEnvironmentService,
  makeEnvironmentRef,
} from "@/services/evaluation";
import type { EvaluateResult } from "@/types/evaluation";

export const evaluate = (expression: LionExpressionType): EvaluateResult =>
  pipe(
    Match.value(expression),
    Match.when(Schema.is(LionArrayExpressionSchema), (_) => evaluateArray(_)),
    Match.when(Schema.is(LionRecordExpressionSchema), (_) => evaluateRecord(_)),
    Match.when(Schema.is(JsonPrimitiveSchema), (_) => evaluatePrimitive(_)),
    Match.exhaustive
  );

export const run = (
  expression: unknown,
  environment: Record<string, unknown>
): EvaluateResult =>
  pipe(
    Schema.decodeUnknown(LionExpressionSchema)(expression),
    Effect.flatMap(evaluate),
    Effect.provideServiceEffect(
      LionEnvironmentService,
      makeEnvironmentRef(environment)
    )
  );

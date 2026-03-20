import { Match, pipe, Schema } from "effect";
import { evaluateArray } from "@/evaluation/base-forms/array.ts";
import { evaluatePrimitive } from "@/evaluation/base-forms/primitive.ts";
import { evaluateRecord } from "@/evaluation/base-forms/record.ts";
import { JsonPrimitiveSchema } from "@/schemas/json-primitive.ts";
import {
  LionArrayExpressionSchema,
  type LionExpressionType,
  LionRecordExpressionSchema,
} from "@/schemas/lion-expression.ts";
import type { EvaluateResult } from "@/types/evaluation.ts";

export const evaluate = (expression: LionExpressionType): EvaluateResult =>
  pipe(
    Match.value(expression),
    Match.when(Schema.is(LionArrayExpressionSchema), (_) => evaluateArray(_)),
    Match.when(Schema.is(LionRecordExpressionSchema), (_) => evaluateRecord(_)),
    Match.when(Schema.is(JsonPrimitiveSchema), (_) => evaluatePrimitive(_)),
    Match.exhaustive
  );

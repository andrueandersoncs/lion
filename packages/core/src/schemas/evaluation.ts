import { Schema } from "effect";
import { LionExpressionSchema } from "@/schemas/lion-expression.ts";
import { OplogEntrySchema } from "@/schemas/oplog.ts";
import type { EvaluateResult } from "@/types/evaluation.ts";

// evaluation paused
export class EvaluationPaused extends Schema.TaggedClass<EvaluationPaused>(
  "EvaluationPaused"
)("EvaluationPaused", {
  oplog: Schema.Array(OplogEntrySchema),
}) {}

// evaluation completed
export class EvaluationCompleted extends Schema.TaggedClass<EvaluationCompleted>(
  "EvaluationCompleted"
)("EvaluationCompleted", { result: Schema.Unknown }) {}

export type LionFunctionValueType = (...args: unknown[]) => EvaluateResult;

export const LionFunctionValueSchema = Schema.declare(
  (input: unknown): input is LionFunctionValueType => {
    return typeof input === "function";
  }
);

export const FunctionCallFormSchema = Schema.Tuple(
  [Schema.String],
  LionExpressionSchema
);

import { Schema } from "effect";
import { LionExpressionSchema } from "@/schemas/lion-expression.ts";
import type { EvaluateResult } from "@/types/evaluation.ts";

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

export const EvalFormSchema = Schema.Tuple(
  Schema.Literal("eval"),
  LionExpressionSchema
);

export const QuoteFormSchema = Schema.Tuple(
  Schema.Literal("quote"),
  LionExpressionSchema
);

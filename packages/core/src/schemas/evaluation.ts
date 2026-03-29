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
  [LionExpressionSchema],
  LionExpressionSchema
);

export const EvalFormSchema = Schema.Tuple(
  Schema.Literal("/eval"),
  LionExpressionSchema
);

export const QuoteFormSchema = Schema.Tuple(
  Schema.Literal("/quote"),
  LionExpressionSchema
);

export const BeginFormSchema = Schema.Tuple(
  [Schema.Literal("/begin")],
  LionExpressionSchema
);

const DISALLOWED_IDENTIFIERS = ["/begin", "/define", "/eval", "/quote"];

const ValidIdentifierSchema = Schema.String.pipe(
  Schema.filter((s) => !DISALLOWED_IDENTIFIERS.includes(s)),
  Schema.minLength(1)
);

export const DefineFormSchema = Schema.Tuple(
  Schema.Literal("/define"),
  ValidIdentifierSchema,
  LionExpressionSchema
);

export const LambdaFormSchema = Schema.Tuple(
  Schema.Literal("/lambda"),
  Schema.Array(ValidIdentifierSchema),
  LionExpressionSchema
);

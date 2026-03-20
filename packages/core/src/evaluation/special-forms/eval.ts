import { Effect, pipe, Schema } from "effect";
import { evaluate } from "@/evaluation/evaluate.ts";
import { LionExpressionSchema } from "@/schemas/lion-expression";

export const EvalFormSchema = Schema.Tuple(
  Schema.Literal("eval"),
  LionExpressionSchema
);

export const evaluateEval = ([_, args]: typeof EvalFormSchema.Type) =>
  pipe(
    args,
    evaluate,
    Effect.flatMap(Schema.decodeUnknown(LionExpressionSchema)),
    Effect.flatMap(evaluate)
  );

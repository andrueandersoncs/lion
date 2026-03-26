import { Effect, pipe, Schema } from "effect";
import { evaluate } from "@/evaluation/evaluate.ts";
import type { EvalFormSchema } from "@/schemas/evaluation";
import { LionExpressionSchema } from "@/schemas/lion-expression";

export const evaluateEval = ([_, args]: typeof EvalFormSchema.Type) =>
  pipe(
    evaluate(args),
    Effect.flatMap(Schema.decodeUnknown(LionExpressionSchema)),
    Effect.flatMap(evaluate)
  );

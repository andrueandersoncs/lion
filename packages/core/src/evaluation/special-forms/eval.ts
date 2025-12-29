import { Effect, pipe, Schema } from "effect";
import { LionExpressionSchema } from "../../schemas/lion-expression.ts";
import { evaluate } from "../evaluate.ts";

export const EvalFormSchema = Schema.Tuple(Schema.Literal("eval"), LionExpressionSchema);

export const evaluateEval = ([_, args]: typeof EvalFormSchema.Type) =>
  pipe(args, evaluate, Effect.flatMap(Schema.decodeUnknown(LionExpressionSchema)), Effect.flatMap(evaluate));

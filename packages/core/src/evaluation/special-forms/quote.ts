import { Effect, Schema } from "effect";
import { LionExpressionSchema } from "../../schemas/lion-expression.ts";

export const QuoteFormSchema = Schema.Tuple(Schema.Literal("quote"), LionExpressionSchema);

export const evaluateQuote = ([_, args]: typeof QuoteFormSchema.Type) => Effect.succeed(args);

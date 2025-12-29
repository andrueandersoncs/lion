import { Array, Effect, flow, Match, pipe, Schema } from "effect";
import { evaluate } from "../evaluate.ts";
import { type LionArrayExpressionType } from "../../schemas/lion-expression.ts";
import { evaluateQuote, QuoteFormSchema } from "../special-forms/quote.ts";
import { EvalFormSchema, evaluateEval } from "../special-forms/eval.ts";
import { FunctionCallFormSchema, evaluateFunctionCall } from "../special-forms/function.ts";

export const evaluateArray = (expression: LionArrayExpressionType) =>
  pipe(
    Match.value(expression),
    Match.when(Array.isEmptyReadonlyArray, Effect.succeed),
    Match.when(Schema.is(EvalFormSchema), (_) => evaluateEval(_)),
    Match.when(Schema.is(QuoteFormSchema), (_) => evaluateQuote(_)),
    Match.when(Schema.is(FunctionCallFormSchema), (_) => evaluateFunctionCall(_)),
    Match.orElse(flow(Array.map(evaluate), Effect.all))
  );

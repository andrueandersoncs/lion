import { Array, Effect, flow, Match, pipe, Schema } from "effect";
import type { LionArrayExpressionType } from "../../schemas/lion-expression.ts";
import { evaluate } from "../evaluate.ts";
import { EvalFormSchema, evaluateEval } from "../special-forms/eval.ts";
import {
  evaluateFunctionCall,
  FunctionCallFormSchema,
} from "../special-forms/function.ts";
import { evaluateQuote, QuoteFormSchema } from "../special-forms/quote.ts";

export const evaluateArray = (expression: LionArrayExpressionType) =>
  pipe(
    Match.value(expression),
    Match.when(Array.isEmptyReadonlyArray, Effect.succeed),
    Match.when(Schema.is(EvalFormSchema), (_) => evaluateEval(_)),
    Match.when(Schema.is(QuoteFormSchema), (_) => evaluateQuote(_)),
    Match.when(Schema.is(FunctionCallFormSchema), (_) =>
      evaluateFunctionCall(_)
    ),
    Match.orElse(flow(Array.map(evaluate), Effect.all))
  );

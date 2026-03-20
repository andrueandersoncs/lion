import { Array as Arr, Effect, flow, Match, pipe, Schema } from "effect";
import { FunctionCallFormSchema } from "@/schemas/evaluation.ts";
import type { LionArrayExpressionType } from "../../schemas/lion-expression.ts";
import { evaluate } from "../evaluate.ts";
import { EvalFormSchema, evaluateEval } from "../special-forms/eval.ts";
import { evaluateFunctionCall } from "../special-forms/function.ts";
import { evaluateQuote, QuoteFormSchema } from "../special-forms/quote.ts";

export const evaluateArray = (expression: LionArrayExpressionType) =>
  pipe(
    Match.value(expression),
    Match.when(Arr.isEmptyReadonlyArray, Effect.succeed),
    Match.when(Schema.is(EvalFormSchema), (_) => evaluateEval(_)),
    Match.when(Schema.is(QuoteFormSchema), (_) => evaluateQuote(_)),
    Match.when(Schema.is(FunctionCallFormSchema), (_) =>
      evaluateFunctionCall(_)
    ),
    Match.orElse(flow(Arr.map(evaluate), Effect.all))
  );

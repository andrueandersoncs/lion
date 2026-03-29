import { Array as Arr, Effect, flow, Match, pipe, Schema } from "effect";
import { evaluate } from "@/evaluation/evaluate.ts";
import { evaluateBegin } from "@/evaluation/special-forms/begin.ts";
import { evaluateDefine } from "@/evaluation/special-forms/define.ts";
import { evaluateEval } from "@/evaluation/special-forms/eval.ts";
import { evaluateFunctionCall } from "@/evaluation/special-forms/function.ts";
import { evaluateQuote } from "@/evaluation/special-forms/quote.ts";
import {
  BeginFormSchema,
  DefineFormSchema,
  EvalFormSchema,
  FunctionCallFormSchema,
  QuoteFormSchema,
} from "@/schemas/evaluation.ts";
import type { LionArrayExpressionType } from "@/schemas/lion-expression.ts";

export const evaluateArray = (expression: LionArrayExpressionType) =>
  pipe(
    Match.value(expression),
    Match.when(Arr.isEmptyReadonlyArray, Effect.succeed),
    Match.when(Schema.is(EvalFormSchema), (_) => evaluateEval(_)),
    Match.when(Schema.is(QuoteFormSchema), (_) => evaluateQuote(_)),
    Match.when(Schema.is(BeginFormSchema), (_) => evaluateBegin(_)),
    Match.when(Schema.is(DefineFormSchema), (_) => evaluateDefine(_)),
    Match.when(Schema.is(FunctionCallFormSchema), (_) =>
      evaluateFunctionCall(_)
    ),
    Match.orElse(flow(Arr.map(evaluate), Effect.all))
  );

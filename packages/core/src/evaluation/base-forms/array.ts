import { Array as Arr, Effect, Match, pipe, Schema } from "effect";
import { InvalidFunctionCallError } from "@/errors/evaluation";
import { evaluateBegin } from "@/evaluation/special-forms/begin.ts";
import { evaluateCond } from "@/evaluation/special-forms/cond.ts";
import { evaluateDefine } from "@/evaluation/special-forms/define.ts";
import { evaluateEval } from "@/evaluation/special-forms/eval.ts";
import { evaluateFunctionCall } from "@/evaluation/special-forms/function.ts";
import { evaluateLambda } from "@/evaluation/special-forms/lambda";
import {
  evaluateAnd,
  evaluateFact,
  evaluateIn,
  evaluateNot,
  evaluateOr,
  evaluateQuery,
  evaluateRelation,
  evaluateRetract,
  evaluateRule,
  evaluateSnapshot,
  evaluateUnify,
  evaluateWhy,
} from "@/evaluation/special-forms/logic";
import { evaluateMatch } from "@/evaluation/special-forms/match";
import { evaluateQuote } from "@/evaluation/special-forms/quote.ts";
import {
  AndFormSchema,
  BeginFormSchema,
  CondFormSchema,
  DefineFormSchema,
  EvalFormSchema,
  FactFormSchema,
  FunctionCallFormSchema,
  InFormSchema,
  LambdaFormSchema,
  MatchFormSchema,
  NotFormSchema,
  OrFormSchema,
  QueryFormSchema,
  QuoteFormSchema,
  RelationFormSchema,
  RetractFormSchema,
  RuleFormSchema,
  SnapshotFormSchema,
  UnifyFormSchema,
  WhyFormSchema,
} from "@/schemas/evaluation.ts";
import type { LionArrayExpressionType } from "@/schemas/lion-expression.ts";
import type { EvaluateResult } from "@/types/evaluation";

// Plain checks instead of another Match keep the matcher types shallow
// enough for TypeScript.
const isInForm = Schema.is(InFormSchema);
const isSnapshotForm = Schema.is(SnapshotFormSchema);

const evaluateDataForm = (
  expression: LionArrayExpressionType
): EvaluateResult | undefined => {
  if (isInForm(expression)) {
    return evaluateIn(expression);
  }
  return isSnapshotForm(expression) ? evaluateSnapshot() : undefined;
};

const evaluateLogicForm = (
  expression: LionArrayExpressionType
): EvaluateResult | undefined =>
  pipe(
    Match.value(expression),
    Match.when(Schema.is(RelationFormSchema), (_) => evaluateRelation(_)),
    Match.when(Schema.is(RuleFormSchema), (_) => evaluateRule(_)),
    Match.when(Schema.is(FactFormSchema), (_) => evaluateFact(_)),
    Match.when(Schema.is(RetractFormSchema), (_) => evaluateRetract(_)),
    Match.when(Schema.is(QueryFormSchema), (_) => evaluateQuery(_)),
    Match.when(Schema.is(WhyFormSchema), (_) => evaluateWhy(_)),
    Match.when(Schema.is(NotFormSchema), (_) => evaluateNot(_)),
    Match.when(Schema.is(AndFormSchema), (_) => evaluateAnd(_)),
    Match.when(Schema.is(OrFormSchema), (_) => evaluateOr(_)),
    Match.when(Schema.is(UnifyFormSchema), (_) => evaluateUnify(_)),
    Match.orElse(() => evaluateDataForm(expression))
  );

export const evaluateArray = (
  expression: LionArrayExpressionType
): EvaluateResult =>
  pipe(
    Match.value(expression),
    Match.when(Arr.isReadonlyArrayEmpty, Effect.succeed),
    Match.when(Schema.is(EvalFormSchema), (_) => evaluateEval(_)),
    Match.when(Schema.is(QuoteFormSchema), (_) => evaluateQuote(_)),
    Match.when(Schema.is(BeginFormSchema), (_) => evaluateBegin(_)),
    Match.when(Schema.is(DefineFormSchema), (_) => evaluateDefine(_)),
    Match.when(Schema.is(LambdaFormSchema), (_) => evaluateLambda(_)),
    Match.when(Schema.is(CondFormSchema), (_) => evaluateCond(_)),
    Match.when(Schema.is(MatchFormSchema), (_) => evaluateMatch(_)),
    Match.orElse(
      (expression) =>
        evaluateLogicForm(expression) ??
        (Schema.is(FunctionCallFormSchema)(expression)
          ? evaluateFunctionCall(expression)
          : Effect.fail(new InvalidFunctionCallError({ expression })))
    )
  );

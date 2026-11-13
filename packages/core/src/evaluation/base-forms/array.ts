import { Effect } from "effect";
import { evaluateBegin } from "@/evaluation/special-forms/begin.ts";
import { evaluateCond } from "@/evaluation/special-forms/cond.ts";
import { evaluateDefine } from "@/evaluation/special-forms/define.ts";
import { evaluateEval } from "@/evaluation/special-forms/eval.ts";
import { evaluateFunctionCall } from "@/evaluation/special-forms/function.ts";
import { evaluateLambda } from "@/evaluation/special-forms/lambda";
import {
  evaluateAnd,
  evaluateFact,
  evaluateFind,
  evaluateIn,
  evaluateInvariant,
  evaluateNot,
  evaluateOr,
  evaluateQuery,
  evaluateRelation,
  evaluateRetract,
  evaluateRule,
  evaluateSchema,
  evaluateSnapshot,
  evaluateUnify,
  evaluateWhy,
} from "@/evaluation/special-forms/logic";
import { evaluateMatch } from "@/evaluation/special-forms/match";
import { evaluateQuote } from "@/evaluation/special-forms/quote.ts";
import {
  type FunctionCallFormSchema,
  type SpecialFormName,
  specialFormOf,
} from "@/schemas/evaluation.ts";
import type { LionArrayExpressionType } from "@/schemas/lion-expression.ts";
import type { EvaluateResult } from "@/types/evaluation";

const SPECIAL_FORMS: Record<
  SpecialFormName,
  (expression: never) => EvaluateResult
> = {
  begin: evaluateBegin,
  define: evaluateDefine,
  eval: evaluateEval,
  quote: evaluateQuote,
  lambda: evaluateLambda,
  cond: evaluateCond,
  match: evaluateMatch,
  relation: evaluateRelation,
  schema: evaluateSchema,
  rule: evaluateRule,
  fact: evaluateFact,
  retract: evaluateRetract,
  query: evaluateQuery,
  find: evaluateFind,
  why: evaluateWhy,
  not: evaluateNot,
  and: evaluateAnd,
  or: evaluateOr,
  "=": evaluateUnify,
  in: evaluateIn,
  snapshot: evaluateSnapshot,
  invariant: evaluateInvariant,
};

/**
 * An empty array is itself. An array that starts with a special form's name
 * and has the form's shape is that form. Any other array is a function call.
 */
export const evaluateArray = (
  expression: LionArrayExpressionType
): EvaluateResult => {
  if (expression.length === 0) {
    return Effect.succeed(expression);
  }
  const form = specialFormOf(expression);
  return form === undefined
    ? evaluateFunctionCall(expression as typeof FunctionCallFormSchema.Type)
    : SPECIAL_FORMS[form](expression as never);
};

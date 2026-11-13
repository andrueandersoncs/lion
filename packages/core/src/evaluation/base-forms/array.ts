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

/**
 * How each special form is evaluated. Each entry calls its form's evaluator
 * when a form is evaluated, and does not hold it: the forms import the
 * evaluator, so this module can load before the forms are defined,
 * whichever module a program or a bundler happens to load first.
 */
const SPECIAL_FORMS: Record<SpecialFormName, (form: never) => EvaluateResult> =
  {
    begin: (form) => evaluateBegin(form),
    define: (form) => evaluateDefine(form),
    eval: (form) => evaluateEval(form),
    quote: (form) => evaluateQuote(form),
    lambda: (form) => evaluateLambda(form),
    cond: (form) => evaluateCond(form),
    match: (form) => evaluateMatch(form),
    relation: (form) => evaluateRelation(form),
    schema: (form) => evaluateSchema(form),
    rule: (form) => evaluateRule(form),
    fact: (form) => evaluateFact(form),
    retract: (form) => evaluateRetract(form),
    query: (form) => evaluateQuery(form),
    find: (form) => evaluateFind(form),
    why: (form) => evaluateWhy(form),
    not: (form) => evaluateNot(form),
    and: (form) => evaluateAnd(form),
    or: (form) => evaluateOr(form),
    "=": (form) => evaluateUnify(form),
    in: (form) => evaluateIn(form),
    snapshot: () => evaluateSnapshot(),
    invariant: (form) => evaluateInvariant(form),
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

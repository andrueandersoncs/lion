import { Effect } from "effect";
import { type Compiled, Pending } from "@/evaluation/compiled";
import { compileBegin } from "@/evaluation/special-forms/begin.ts";
import { compileCond } from "@/evaluation/special-forms/cond.ts";
import { compileDefine } from "@/evaluation/special-forms/define.ts";
import { compileEval } from "@/evaluation/special-forms/eval.ts";
import { compileFunctionCall } from "@/evaluation/special-forms/function.ts";
import { compileLambda } from "@/evaluation/special-forms/lambda";
import {
  compileAnd,
  compileIn,
  compileNot,
  compileOr,
  compileUnify,
  evaluateAssuming,
  evaluateExists,
  evaluateFact,
  evaluateFind,
  evaluateInvariant,
  evaluateQuery,
  evaluateRelation,
  evaluateRetract,
  evaluateRule,
  evaluateSchema,
  evaluateSnapshot,
  evaluateSome,
  evaluateWhy,
} from "@/evaluation/special-forms/logic";
import { compileMatch } from "@/evaluation/special-forms/match";
import { compileQuote } from "@/evaluation/special-forms/quote.ts";
import {
  type FunctionCallFormSchema,
  type SpecialFormName,
  specialFormOf,
} from "@/schemas/evaluation.ts";
import type { LionArrayExpressionType } from "@/schemas/lion-expression.ts";
import { LionEnvironmentService } from "@/services/evaluation";
import type { EvaluateResult } from "@/types/evaluation";

/**
 * A form that reads or changes the logic database runs as an Effect, in the
 * scope it was written in. It evaluates its parts as it runs: they are
 * mostly data, such as the facts of a `fact` form, that run once.
 */
const inEffect =
  <F>(evaluateForm: (form: F) => EvaluateResult) =>
  (form: F): Compiled =>
  (environment) =>
    new Pending(
      Effect.provideService(
        evaluateForm(form),
        LionEnvironmentService,
        environment
      )
    );

/**
 * How each special form is compiled. Each entry calls its form's compiler
 * when a form is compiled, and does not hold it: the forms import the
 * compiler, so this module can load before the forms are defined,
 * whichever module a program or a bundler happens to load first.
 */
const SPECIAL_FORMS: Record<SpecialFormName, (form: never) => Compiled> = {
  begin: (form) => compileBegin(form),
  define: (form) => compileDefine(form),
  eval: (form) => compileEval(form),
  quote: (form) => compileQuote(form),
  lambda: (form) => compileLambda(form),
  cond: (form) => compileCond(form),
  match: (form) => compileMatch(form),
  relation: (form) => inEffect(evaluateRelation)(form),
  schema: (form) => inEffect(evaluateSchema)(form),
  rule: (form) => inEffect(evaluateRule)(form),
  fact: (form) => inEffect(evaluateFact)(form),
  retract: (form) => inEffect(evaluateRetract)(form),
  query: (form) => inEffect(evaluateQuery)(form),
  find: (form) => inEffect(evaluateFind)(form),
  assuming: (form) => inEffect(evaluateAssuming)(form),
  exists: (form) => inEffect(evaluateExists)(form),
  some: (form) => inEffect(evaluateSome)(form),
  why: (form) => inEffect(evaluateWhy)(form),
  not: (form) => compileNot(form),
  and: (form) => compileAnd(form),
  or: (form) => compileOr(form),
  "=": (form) => compileUnify(form),
  in: (form) => compileIn(form),
  snapshot: () => inEffect(evaluateSnapshot)(undefined),
  invariant: (form) => inEffect(evaluateInvariant)(form),
};

/**
 * An empty array is itself. An array that starts with a special form's name
 * and has the form's shape is that form. Any other array is a function call.
 */
export const compileArray = (expression: LionArrayExpressionType): Compiled => {
  if (expression.length === 0) {
    return () => expression;
  }
  const form = specialFormOf(expression);
  return form === undefined
    ? compileFunctionCall(expression as typeof FunctionCallFormSchema.Type)
    : SPECIAL_FORMS[form](expression as never);
};

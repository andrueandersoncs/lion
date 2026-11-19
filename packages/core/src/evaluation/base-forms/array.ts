import { Effect } from "effect";
import { MalformedFormError } from "@/errors/evaluation";
import { type Compiled, Pending } from "@/evaluation/compiled";
import { declares, type Scope } from "@/evaluation/environment";
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
import { compileSet } from "@/evaluation/special-forms/set.ts";
import {
  type FunctionCallFormSchema,
  fitsForm,
  isSpecialFormName,
  type SpecialFormName,
  USAGE,
} from "@/schemas/evaluation.ts";
import type { LionArrayExpressionType } from "@/schemas/lion-expression.ts";
import { LionEnvironmentService } from "@/services/evaluation";
import type { EvaluateResult } from "@/types/evaluation";

/**
 * A form that reads or changes the logic database runs as an Effect, in the
 * scope it was written in. It evaluates its parts as it runs: they are
 * mostly data, such as the facts of a `fact` form, that run once. They are
 * compiled in the scope the form runs in, which declares what the scope
 * the form was written in declares.
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
 * How each special form is compiled, in the scope it is written in. Each
 * entry calls its form's compiler when a form is compiled, and does not hold
 * it: the forms import the compiler, so this module can load before the
 * forms are defined, whichever module a program or a bundler happens to
 * load first.
 */
const SPECIAL_FORMS: Record<
  SpecialFormName,
  (form: never, scope: Scope | undefined) => Compiled
> = {
  begin: (form, scope) => compileBegin(form, scope),
  define: (form, scope) => compileDefine(form, scope),
  "set!": (form, scope) => compileSet(form, scope),
  eval: (form, scope) => compileEval(form, scope),
  quote: (form) => compileQuote(form),
  lambda: (form, scope) => compileLambda(form, scope),
  cond: (form, scope) => compileCond(form, scope),
  match: (form, scope) => compileMatch(form, scope),
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
  not: (form, scope) => compileNot(form, scope),
  and: (form, scope) => compileAnd(form, scope),
  or: (form, scope) => compileOr(form, scope),
  "=": (form, scope) => compileUnify(form, scope),
  in: (form, scope) => compileIn(form, scope),
  snapshot: () => inEffect(evaluateSnapshot)(undefined),
  invariant: (form) => inEffect(evaluateInvariant)(form),
};

/**
 * An empty array is itself. An array that starts with a special form's name,
 * which no scope around it declares, is that form, and fails when it does
 * not have the form's shape. Any other array is a function call.
 */
export const compileArray = (
  expression: LionArrayExpressionType,
  scope: Scope | undefined
): Compiled => {
  if (expression.length === 0) {
    return () => expression;
  }
  const [head] = expression;
  if (!isSpecialFormName(head) || declares(scope, head)) {
    return compileFunctionCall(
      expression as typeof FunctionCallFormSchema.Type,
      scope
    );
  }
  if (!fitsForm(head, expression)) {
    const error = new MalformedFormError({
      expression,
      form: head,
      usage: USAGE[head],
    });
    return () => new Pending(Effect.fail(error));
  }
  return SPECIAL_FORMS[head](expression as never, scope);
};

import { Effect, Schema } from "effect";
import { answer, isWriting } from "@/evaluation/asking";
import { evaluate } from "@/evaluation/evaluate";
import { apply } from "@/evaluation/special-forms/function";
import { suspend } from "@/evaluation/special-forms/lambda";
import { fits } from "@/logic/fit";
import { isWaiting, LogicValue } from "@/logic/terms";
import {
  LionFunctionValueSchema,
  type MatchFormSchema,
} from "@/schemas/evaluation";
import type { LionExpressionType } from "@/schemas/lion-expression";
import type { EvaluateResult } from "@/types/evaluation";

/*
["match", <value>, [<schema>, <fn>], ..., <fallback-fn>]
*/

const evaluateFunction = (expression: LionExpressionType) =>
  evaluate(expression).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(LionFunctionValueSchema))
  );

/**
 * Applies the function of the first pattern whose schema the value fits, or
 * the fallback. Anything is a schema: a predicate, a relation, a record or
 * list of schemas, or a plain value. A value that is a question is asked.
 * When the value, or what a schema says about it, is not known yet, the
 * form waits.
 */
export const evaluateMatch = (
  expression: typeof MatchFormSchema.Type
): EvaluateResult =>
  Effect.gen(function* () {
    const [_, subject, ...rest] = expression;
    let value = yield* evaluate(subject);
    if (value instanceof LogicValue) {
      if (isWaiting(value) || (yield* isWriting)) {
        return yield* suspend(expression);
      }
      value = yield* answer(value);
    }
    const patterns = rest.slice(0, -1) as (readonly [
      LionExpressionType,
      LionExpressionType,
    ])[];
    for (const [schemaExpression, functionExpression] of patterns) {
      const schema = yield* evaluate(schemaExpression);
      const fn = yield* evaluateFunction(functionExpression);
      if (yield* fits(schema, value)) {
        return yield* apply(fn, [value]);
      }
    }
    const fallback = yield* evaluateFunction(rest.at(-1) as LionExpressionType);
    return yield* apply(fallback, [value]);
  }).pipe(
    Effect.catchTag("WaitingError", () => suspend(expression))
  ) as EvaluateResult;

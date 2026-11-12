import { Effect, Schema } from "effect";
import { evaluate } from "@/evaluation/evaluate";
import { suspend } from "@/evaluation/special-forms/lambda";
import { call, isWaiting, type LionFunction } from "@/logic/terms";
import {
  LionFunctionValueSchema,
  type MatchFormSchema,
} from "@/schemas/evaluation";
import type { LionExpressionType } from "@/schemas/lion-expression";
import type { EvaluateResult } from "@/types/evaluation";

/*
["match", <value>, [<predicate>, <fn>], ..., <fallback-fn>]
*/

/** A function, or a record of predicates for the keys a record must have. */
type Predicate = LionFunction | { readonly [key: string]: Predicate };

const PredicateSchema: Schema.Codec<Predicate> = Schema.Union([
  Schema.Record(
    Schema.String,
    Schema.suspend((): Schema.Codec<Predicate> => PredicateSchema)
  ),
  LionFunctionValueSchema,
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A predicate that fails, or answers anything but true, does not match. */
const matches = (
  value: unknown,
  predicate: Predicate
): Effect.Effect<boolean, never, unknown> => {
  if (typeof predicate === "function") {
    return call(predicate, value).pipe(
      Effect.map((result) => result === true),
      Effect.catch(() => Effect.succeed(false))
    );
  }
  return Effect.gen(function* () {
    for (const [key, nested] of Object.entries(predicate)) {
      const present = isRecord(value) && Object.hasOwn(value, key);
      if (!(present && (yield* matches(value[key], nested)))) {
        return false;
      }
    }
    return isRecord(value);
  });
};

const evaluateTo =
  <A>(schema: Schema.Codec<A>) =>
  (expression: LionExpressionType) =>
    evaluate(expression).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(schema))
    );

const evaluateFunction = evaluateTo(LionFunctionValueSchema);

/**
 * Applies the function of the first pattern whose predicate matches the
 * value, or the fallback. A value that is not known yet makes the form wait
 * for its logic variables.
 */
export const evaluateMatch = (
  expression: typeof MatchFormSchema.Type
): EvaluateResult =>
  Effect.gen(function* () {
    const [_, subject, ...rest] = expression;
    const value = yield* evaluate(subject);
    if (isWaiting(value)) {
      return yield* suspend(expression);
    }
    const patterns = rest.slice(0, -1) as (readonly [
      LionExpressionType,
      LionExpressionType,
    ])[];
    for (const [predicateExpression, functionExpression] of patterns) {
      const predicate = yield* evaluateTo(PredicateSchema)(predicateExpression);
      const fn = yield* evaluateFunction(functionExpression);
      if (yield* matches(value, predicate)) {
        return yield* call(fn, value);
      }
    }
    const fallback = yield* evaluateFunction(rest.at(-1) as LionExpressionType);
    return yield* call(fallback, value);
  }) as EvaluateResult;

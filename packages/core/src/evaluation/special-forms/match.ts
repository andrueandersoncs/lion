import { Effect, Record, Schema } from "effect";
import { evaluate } from "@/evaluation/evaluate";
import {
  LionFunctionValueSchema,
  type MatchFormSchema,
  MatchPatternSchema,
} from "@/schemas/evaluation";
import type { LionExpressionSchema } from "@/schemas/lion-expression";
import type { LionEnvironmentService } from "@/services/evaluation";
import type { EvaluateResult } from "@/types/evaluation";

/*
["match", <value>, [<predicate>, <fn>], ..., <fallback-fn>]
*/

type AssumedMatchPredicateType =
  | { readonly [key: string]: AssumedMatchPredicateType }
  | typeof LionFunctionValueSchema.Type;

const MatchPredicateRecordSchema = Schema.Record(
  Schema.String,
  Schema.suspend(
    (): Schema.Codec<AssumedMatchPredicateType> => MatchPredicateSchema
  )
);

const MatchPredicateSchema = Schema.Union([
  MatchPredicateRecordSchema,
  LionFunctionValueSchema,
]);

const AnyRecordSchema = Schema.Record(Schema.String, Schema.Any);

const evaluatePredicate = (
  value: unknown,
  predicate: typeof MatchPredicateSchema.Type
): Effect.Effect<boolean, never, LionEnvironmentService> => {
  if (Schema.is(MatchPredicateRecordSchema)(predicate)) {
    return Effect.gen(function* () {
      if (!Schema.is(AnyRecordSchema)(value)) {
        return false;
      }

      if (!Record.keys(predicate).every((key) => Record.has(value, key))) {
        return false;
      }

      for (const [key, nestedPredicate] of Record.toEntries(predicate)) {
        if (!(yield* evaluatePredicate(value[key], nestedPredicate))) {
          return false;
        }
      }
      return true;
    });
  }

  return predicate(value).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.Boolean)),
    Effect.catch(() => Effect.succeed(false))
  );
};

const evaluateMatchPatterns = (
  value: unknown,
  patternExprs: ReadonlyArray<
    typeof MatchPatternSchema.Type | typeof LionExpressionSchema.Type
  >
): EvaluateResult =>
  Effect.gen(function* () {
    const patternExpr = patternExprs[0];
    if (patternExpr === undefined) {
      return yield* Effect.die(
        new Error("Match expression requires a fallback function")
      );
    }

    if (Schema.is(MatchPatternSchema)(patternExpr)) {
      const [predicateExpr, functionExpr] = patternExpr;
      const predicate = yield* evaluate(predicateExpr).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(MatchPredicateSchema))
      );
      const fn = yield* evaluate(functionExpr).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(LionFunctionValueSchema))
      );
      return (yield* evaluatePredicate(value, predicate))
        ? yield* fn(value)
        : yield* evaluateMatchPatterns(value, patternExprs.slice(1));
    }

    const fallback = yield* evaluate(patternExpr).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(LionFunctionValueSchema))
    );
    return yield* fallback(value);
  });

export const evaluateMatch = ([
  _,
  valueExpression,
  ...patternExpressions
]: typeof MatchFormSchema.Type) =>
  evaluate(valueExpression).pipe(
    Effect.flatMap((value) => evaluateMatchPatterns(value, patternExpressions))
  );

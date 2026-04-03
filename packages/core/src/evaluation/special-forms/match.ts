import {
  Array as Arr,
  Effect,
  Match,
  Option,
  pipe,
  Record,
  Schema,
} from "effect";
import { evaluate } from "@/evaluation/evaluate";
import {
  LionFunctionValueSchema,
  type MatchFormSchema,
  MatchPatternSchema,
} from "@/schemas/evaluation";
import { LionExpressionSchema } from "@/schemas/lion-expression";
import type { LionEnvironmentService } from "@/services/evaluation";
import type { EvaluateResult } from "@/types/evaluation";

/*
["match", <value>, [<predicate>, <fn>], ..., <fallback-fn>]
*/

type AssumedMatchPredicateType =
  | { readonly [key: string]: AssumedMatchPredicateType }
  | typeof LionFunctionValueSchema.Type;

const MatchPredicateRecordSchema = Schema.Record({
  key: Schema.String,
  value: Schema.suspend(
    (): Schema.Schema<AssumedMatchPredicateType> => MatchPredicateSchema
  ),
});

const MatchPredicateSchema = Schema.Union(
  MatchPredicateRecordSchema,
  LionFunctionValueSchema
);

const AnyRecordSchema = Schema.Record({
  key: Schema.String,
  value: Schema.Any,
});

const evaluatePredicate = (
  value: unknown,
  predicate: typeof MatchPredicateSchema.Type
): Effect.Effect<boolean, never, LionEnvironmentService> =>
  pipe(
    Match.value(predicate),
    Match.when(Schema.is(MatchPredicateRecordSchema), (record) =>
      Effect.gen(function* () {
        if (!Schema.is(AnyRecordSchema)(value)) {
          return false;
        }

        if (!Record.keys(record).every((key) => Record.has(value, key))) {
          return false;
        }

        let result = true;
        for (const [recordKey, recordValue] of Record.toEntries(record)) {
          const recordValueResult = yield* evaluatePredicate(
            value[recordKey],
            recordValue
          );
          result = result && recordValueResult;
        }

        return result;
      })
    ),
    Match.when(Schema.is(LionFunctionValueSchema), (predicateFn) =>
      pipe(
        predicateFn(value),
        Effect.flatMap(Schema.decodeUnknown(Schema.Boolean)),
        Effect.catchAll(() => Effect.succeed(false))
      )
    ),
    Match.orElseAbsurd
  );

const evaluateMatchPatterns = (
  value: unknown,
  patternExprs: (
    | typeof MatchPatternSchema.Type
    | typeof LionExpressionSchema.Type
  )[]
): EvaluateResult =>
  pipe(
    Arr.head(patternExprs),
    Option.getOrThrow,
    Match.value,
    Match.when(Schema.is(MatchPatternSchema), ([predicateExpr, fnExpr]) =>
      pipe(
        Effect.Do,
        Effect.bind("predicate", () => evaluate(predicateExpr)),
        Effect.bind("fn", () =>
          pipe(
            evaluate(fnExpr),
            Effect.flatMap(Schema.decodeUnknown(LionFunctionValueSchema))
          )
        ),
        Effect.flatMap(({ predicate, fn }) =>
          pipe(
            Schema.decodeUnknown(MatchPredicateSchema)(predicate),
            Effect.flatMap((predicate) => evaluatePredicate(value, predicate)),
            Effect.if({
              onTrue: () => fn(value),
              onFalse: () =>
                pipe(Arr.tail(patternExprs), Option.getOrThrow, (tail) =>
                  evaluateMatchPatterns(value, tail)
                ),
            })
          )
        )
      )
    ),
    Match.when(Schema.is(LionExpressionSchema), (fallbackFn) =>
      pipe(
        evaluate(fallbackFn),
        Effect.flatMap(Schema.decodeUnknown(LionFunctionValueSchema)),
        Effect.flatMap((fallbackFn) => fallbackFn(value))
      )
    ),
    Match.exhaustive
  );

export const evaluateMatch = ([
  _,
  valueExpr,
  ...patternExprs
]: typeof MatchFormSchema.Type) =>
  pipe(
    evaluate(valueExpr),
    Effect.flatMap((value) => evaluateMatchPatterns(value, patternExprs))
  );

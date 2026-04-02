import { Array as Arr, Effect, Match, Option, pipe, Schema } from "effect";
import { evaluate } from "@/evaluation/evaluate";
import {
  LionFunctionValueSchema,
  type MatchFormSchema,
  MatchPatternSchema,
} from "@/schemas/evaluation";
import { LionExpressionSchema } from "@/schemas/lion-expression";
import type { EvaluateResult } from "@/types/evaluation";

/*
["match", <value>, [<predicate>, <fn>], ..., <fallback-fn>]
*/

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
        Effect.bind("predicate", () =>
          Effect.andThen(
            evaluate(predicateExpr),
            Schema.decodeUnknown(LionFunctionValueSchema)
          )
        ),
        Effect.bind("fn", () =>
          Effect.andThen(
            evaluate(fnExpr),
            Schema.decodeUnknown(LionFunctionValueSchema)
          )
        ),
        Effect.flatMap(({ predicate, fn }) =>
          Effect.if(
            pipe(
              Effect.andThen(
                predicate(value),
                Schema.decodeUnknown(Schema.Boolean)
              ),
              Effect.catchAll(() => Effect.succeed(false))
            ),
            {
              onTrue: () => fn(value),
              onFalse: () =>
                pipe(Arr.tail(patternExprs), Option.getOrThrow, (tail) =>
                  evaluateMatchPatterns(value, tail)
                ),
            }
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

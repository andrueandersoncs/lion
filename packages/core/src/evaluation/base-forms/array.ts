import { Array, Effect, Match, pipe } from "effect";
import { evaluate, type EvaluateResult } from "../evaluate.ts";
import type { LionArrayExpressionType } from "../../schemas/lion-expression.ts";
import { evaluateQuote } from "../special-forms/quote.ts";
import { evaluateEval } from "../special-forms/eval.ts";
import { evaluateFunctionCall } from "../special-forms/function.ts";

export const evaluateArray = (expression: LionArrayExpressionType): EvaluateResult =>
  pipe(
    Match.value(expression),
    // empty array expression: default return empty array
    Match.when(
      (expression) => Array.isEmptyReadonlyArray(expression),
      (emptyArray) => Effect.succeed(emptyArray)
    ),
    // nonempty array expression: evaluate
    Match.when(
      (expression) => Array.isNonEmptyReadonlyArray(expression),
      (nonEmptyArray) =>
        pipe(
          Array.unprepend(nonEmptyArray),
          Match.value,
          // function call form: match on correct evaluation order
          Match.when([Match.string, Match.any], ([name, args]) =>
            pipe(
              Match.value(name),
              Match.when("quote", evaluateQuote(args)),
              Match.when("eval", evaluateEval(args)),
              Match.when(Match.string, evaluateFunctionCall(nonEmptyArray)),
              Match.exhaustive
            )
          ),
          // basically a "cons" expression: just evaluate and return the list
          Match.orElse(() => pipe(nonEmptyArray, Array.map(evaluate), Effect.all))
        )
    ),
    Match.orElseAbsurd
  );

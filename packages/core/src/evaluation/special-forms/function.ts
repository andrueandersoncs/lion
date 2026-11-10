import { Array as Arr, Effect, Match, pipe, Schema } from "effect";
import { InvalidFunctionCallError } from "@/errors/evaluation";
import { evaluate } from "@/evaluation/evaluate.ts";
import { DeferredCall, isLogicTerm, isPureFunction } from "@/logic/terms";
import {
  type FunctionCallFormSchema,
  LionFunctionValueSchema,
} from "@/schemas/evaluation";

const calleeName = (expression: unknown) =>
  typeof expression === "string" ? expression : "<function>";

export const evaluateFunctionCall = (
  functionCallExpression: typeof FunctionCallFormSchema.Type
) =>
  pipe(
    Effect.all(Arr.map(functionCallExpression, evaluate)),
    Effect.map(Arr.unprepend),
    Effect.flatMap(([head, tail]) =>
      pipe(
        Match.value(head),
        Match.when(Schema.is(LionFunctionValueSchema), (fn) => {
          // A pure function applied to logic variables waits until the
          // variables are bound, so it can be used as a goal or a term.
          if (isPureFunction(fn) && tail.some(isLogicTerm)) {
            return Effect.succeed(
              new DeferredCall(fn, calleeName(functionCallExpression[0]), tail)
            );
          }
          const result = fn(...tail);
          return Effect.isEffect(result) ? result : Effect.succeed(result);
        }),
        Match.orElse(() =>
          Effect.fail(
            new InvalidFunctionCallError({ expression: functionCallExpression })
          )
        )
      )
    )
  );

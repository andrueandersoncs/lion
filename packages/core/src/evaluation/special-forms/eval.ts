import { Array, Effect, Match, Option, pipe, Schema } from "effect";
import { LionExpressionSchema, type AssumedExpressionType } from "../../schemas/lion-expression.ts";
import { evaluate, InvalidArgumentTypeError, LionFunctionValueSchema, TooFewArgumentsError } from "../evaluate.ts";

export const evaluateEval = (args: readonly AssumedExpressionType[]) => () =>
  pipe(
    Array.head(args),
    Option.match({
      onSome: (firstArg) =>
        pipe(
          evaluate(firstArg),
          Effect.flatMap((value) =>
            pipe(
              Match.value(value),
              Match.when(Schema.is(LionFunctionValueSchema), (_) =>
                Effect.fail(
                  new InvalidArgumentTypeError({
                    functionName: "eval",
                    passedArgs: args,
                    expectedArgs: ["expression"],
                  })
                )
              ),
              Match.when(Schema.is(LionExpressionSchema), (_) => evaluate(_)),
              Match.orElseAbsurd
            )
          )
        ),
      onNone: () =>
        Effect.fail(
          new TooFewArgumentsError({
            functionName: "eval",
            passedArgs: args,
            expectedArgs: ["expression"],
          })
        ),
    })
  );

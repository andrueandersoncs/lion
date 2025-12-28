import { Array, Effect, Option, pipe } from "effect";
import type { AssumedExpressionType } from "../../schemas/lion-expression.ts";
import { TooFewArgumentsError } from "../evaluate.ts";

export const evaluateQuote = (args: readonly AssumedExpressionType[]) => () =>
  pipe(
    Array.head(args),
    Option.match({
      onSome: (quotedValue) => Effect.succeed(quotedValue),
      onNone: () =>
        Effect.fail(
          new TooFewArgumentsError({
            functionName: "quote",
            passedArgs: args,
            expectedArgs: ["quotedValue"],
          })
        ),
    })
  );

import { Array, Effect, Match, pipe, Schema } from "effect";
import type { AssumedExpressionType } from "../../schemas/lion-expression.ts";
import { evaluate, LionFunctionValueSchema } from "../evaluate.ts";
import type { NonEmptyReadonlyArray } from "effect/Array";

export const evaluateFunctionCall = (nonEmptyArray: NonEmptyReadonlyArray<AssumedExpressionType>) => () =>
  pipe(
    nonEmptyArray,
    Array.map(evaluate),
    Effect.all,
    Effect.map(Array.unprepend),
    Effect.flatMap(([head, tail]) =>
      pipe(
        Match.value(head),
        Match.when(Schema.is(LionFunctionValueSchema), (fn) => fn(...tail)),
        Match.orElse(() => Effect.succeed([head, ...tail]))
      )
    )
  );

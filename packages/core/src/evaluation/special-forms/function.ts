import { Array, Effect, Match, pipe, Schema } from "effect";
import { LionExpressionSchema } from "../../schemas/lion-expression.ts";
import { evaluate, LionFunctionValueSchema } from "../evaluate.ts";

export const FunctionCallFormSchema = Schema.Tuple([Schema.String], LionExpressionSchema);

export const evaluateFunctionCall = (x: typeof FunctionCallFormSchema.Type) =>
  pipe(
    x,
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

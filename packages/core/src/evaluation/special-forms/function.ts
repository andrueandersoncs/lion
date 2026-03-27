import { Array as Arr, Effect, Match, pipe, Schema } from "effect";
import { evaluate } from "@/evaluation/evaluate.ts";
import {
  type FunctionCallFormSchema,
  LionFunctionValueSchema,
} from "@/schemas/evaluation";

export const evaluateFunctionCall = (
  functionCallExpression: typeof FunctionCallFormSchema.Type
) =>
  pipe(
    Effect.all(Arr.map(functionCallExpression, evaluate)),
    Effect.map(Arr.unprepend),
    Effect.flatMap(([head, tail]) =>
      pipe(
        Match.value(head),
        Match.when(Schema.is(LionFunctionValueSchema), (fn) => fn(...tail)),
        Match.orElse(() => Effect.succeed([head, ...tail]))
      )
    )
  );

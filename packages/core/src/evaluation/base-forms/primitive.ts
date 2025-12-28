import { Effect, Match, String, Record, Option, pipe } from "effect";
import { LionEnvironment, type EvaluateResult } from "../evaluate.ts";
import type { JsonPrimitiveType } from "../../schemas/json-primitive.ts";

export const evaluatePrimitive = (expression: JsonPrimitiveType): EvaluateResult =>
  pipe(
    Match.value(expression),
    Match.when(String.isString, (name) =>
      Effect.gen(function* () {
        const envService = yield* LionEnvironment;
        const environment = yield* envService.get;
        return pipe(
          Record.get(environment, name),
          Option.match({
            onSome: (referencedValue) => referencedValue,
            onNone: () => expression,
          })
        );
      })
    ),
    Match.orElse((_) => Effect.succeed(_))
  );

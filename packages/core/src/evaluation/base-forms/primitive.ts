import { Effect, Match, String, Record, Option, pipe } from "effect";
import { LionEnvironment } from "../evaluate.ts";
import { type JsonPrimitiveType } from "../../schemas/json-primitive.ts";

export const evaluatePrimitive = (expression: JsonPrimitiveType) =>
  pipe(Match.value(expression), Match.when(String.isString, evaluateReference), Match.orElse(Effect.succeed));

export const evaluateReference = (name: string) =>
  Effect.gen(function* () {
    const envService = yield* LionEnvironment;
    const environment = yield* envService.get;
    return pipe(
      Record.get(environment, name),
      Option.getOrElse(() => name)
    );
  });

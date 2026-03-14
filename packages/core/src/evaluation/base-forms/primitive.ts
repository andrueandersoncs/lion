import { Effect, Match, Option, pipe, Record, String } from "effect";
import type { JsonPrimitiveType } from "../../schemas/json-primitive.ts";
import { LionEnvironmentService } from "../evaluate.ts";

export const evaluatePrimitive = (expression: JsonPrimitiveType) =>
  pipe(
    Match.value(expression),
    Match.when(String.isString, evaluateReference),
    Match.orElse(Effect.succeed)
  );

export const evaluateReference = (name: string) =>
  Effect.gen(function* () {
    const envService = yield* LionEnvironmentService;
    const environment = yield* envService.get;
    return pipe(
      Record.get(environment, name),
      Option.getOrElse(() => name)
    );
  });

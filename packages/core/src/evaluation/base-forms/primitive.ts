import { Effect, Match, Option, pipe, Record, String as Str } from "effect";
import type { JsonPrimitiveType } from "@/schemas/json-primitive";
import { LionEnvironmentService } from "@/services/evaluation.ts";

export const evaluatePrimitive = (expression: JsonPrimitiveType) =>
  pipe(
    Match.value(expression),
    Match.when(Str.isString, evaluateReference),
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

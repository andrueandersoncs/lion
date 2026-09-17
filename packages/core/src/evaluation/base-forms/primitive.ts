import { Effect, Match, Option, pipe, String as Str } from "effect";
import { getBinding } from "@/evaluation/environment";
import type { JsonPrimitiveType } from "@/schemas/json-primitive";
import { LionEnvironmentService } from "@/services/evaluation.ts";

export const evaluatePrimitive = (expression: JsonPrimitiveType) =>
  pipe(
    Match.value(expression),
    Match.when(Str.isString, evaluateReference),
    Match.orElse(Effect.succeed)
  );

export const evaluateReference = (name: string) =>
  pipe(
    Effect.service(LionEnvironmentService),
    Effect.flatMap((environment) => getBinding(environment, name)),
    Effect.map(Option.getOrElse(() => name))
  );

import { Effect, Match, Option, pipe, Ref, String as Str } from "effect";
import { getBinding } from "@/evaluation/environment";
import type { JsonPrimitiveType } from "@/schemas/json-primitive";
import { getService, LionEnvironmentService } from "@/services/evaluation.ts";

export const evaluatePrimitive = (expression: JsonPrimitiveType) =>
  pipe(
    Match.value(expression),
    Match.when(Str.isString, evaluateReference),
    Match.orElse(Effect.succeed)
  );

export const evaluateReference = (name: string) =>
  pipe(
    getService(LionEnvironmentService),
    Effect.flatMap(Ref.get),
    Effect.map((environment) => getBinding(environment, name)),
    Effect.map(Option.getOrElse(() => name))
  );

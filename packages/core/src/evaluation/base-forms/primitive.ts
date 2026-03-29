import {
  Context,
  Effect,
  Match,
  Option,
  pipe,
  Record,
  Ref,
  String as Str,
} from "effect";
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
    getService(LionEnvironmentService),
    Effect.flatMap(Ref.get),
    Effect.map(Record.get(name)),
    Effect.map(Option.getOrElse(() => name))
  );

export const getService = <T, U>(context: Context.Tag<T, U>) =>
  pipe(Effect.context<T>(), Effect.map(Context.get(context)));

import { Effect, flow, Option, Record, Schema } from "effect";
import { tupled } from "effect/Function";

class ObjectError extends Schema.TaggedError<ObjectError>("ObjectError")(
  "ObjectError",
  {}
) {}

export const object = {
  get: flow(
    (obj: unknown, key: unknown) => [obj, key],
    Schema.decodeUnknown(
      Schema.mutable(
        Schema.Tuple(
          Schema.Record({ key: Schema.String, value: Schema.Unknown }),
          Schema.String
        )
      )
    ),
    Effect.map(tupled(Record.get)),
    Effect.map(Option.map(Effect.succeed)),
    Effect.flatMap(Option.getOrElse(() => new ObjectError()))
  ),
  access: flow(
    (obj: unknown, key: unknown) => [obj, key],
    Effect.fn(function* ([obj, key]) {
      return typeof obj === "object" ? [obj, key] : yield* new ObjectError();
    }),
    Effect.map(([obj, key]) => (obj as Record<string, unknown>)[key as string])
  ),
  keys: flow(
    (obj: unknown) => obj,
    Schema.decodeUnknown(
      Schema.Record({ key: Schema.String, value: Schema.Unknown })
    ),
    Effect.map(Record.keys)
  ),
  values: flow(
    (obj: unknown) => obj,
    Schema.decodeUnknown(
      Schema.Record({ key: Schema.String, value: Schema.Unknown })
    ),
    Effect.map(Record.values)
  ),
};

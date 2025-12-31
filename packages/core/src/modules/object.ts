import { Effect, flow, Option, Record, Schema } from "effect";
import { tupled } from "effect/Function";

export const object = {
  get: flow(
    (obj: unknown, key: unknown) => [obj, key],
    Schema.decodeUnknown(
      Schema.mutable(Schema.Tuple(Schema.Record({ key: Schema.String, value: Schema.Unknown }), Schema.String))
    ),
    Effect.map(tupled(Record.get)),
    Effect.map(Option.map(Effect.succeed)),
    Effect.flatMap(Option.getOrElse(() => Effect.fail(new Error("Key not found"))))
  ),
  keys: flow(
    (obj: unknown) => obj,
    Schema.decodeUnknown(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
    Effect.map(Record.keys)
  ),
  values: flow(
    (obj: unknown) => obj,
    Schema.decodeUnknown(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
    Effect.map(Record.values)
  ),
};

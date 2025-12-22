import { Effect, Array, Schema, flow } from "effect";

export const list = {
  list: (...args: unknown[]) => args,

  head: <T>(s: Schema.Schema<T>) =>
    flow((a: unknown) => a, Schema.decodeUnknown(Schema.Array(s)), Effect.map(Array.head)),

  tail: <T>(s: Schema.Schema<T>) =>
    flow((a: unknown) => a, Schema.decodeUnknown(Schema.Array(s)), Effect.map(Array.tail)),

  length: <T>(s: Schema.Schema<T>) =>
    flow((a: unknown) => a, Schema.decodeUnknown(Schema.Array(s)), Effect.map(Array.length)),

  concat: <T>(s: Schema.Schema<T>) =>
    flow(
      (a: unknown[], b: unknown[]) => [a, b],
      Schema.decodeUnknown(Schema.Array(Schema.Array(s))),
      Effect.map(Array.flatten)
    ),
};

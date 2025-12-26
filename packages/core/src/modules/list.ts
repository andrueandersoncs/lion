import { Effect, Array, Schema, flow, Option } from "effect";

export const list = {
  list: <T>(...args: T[]) => Effect.succeed(args),

  head: flow(
    <T>(a: T) => a,
    Schema.decodeUnknown(Schema.Array(Schema.Any)),
    Effect.map(Array.head),
    Effect.map(Option.getOrThrow)
  ),

  tail: flow(
    <T>(a: T) => a,
    Schema.decodeUnknown(Schema.Array(Schema.Any)),
    Effect.map(Array.tail),
    Effect.map(Option.getOrThrow)
  ),

  length: flow(<T>(a: T) => a, Schema.decodeUnknown(Schema.Array(Schema.Any)), Effect.map(Array.length)),

  concat: flow(
    <T>(a: T, b: T) => [a, b],
    Schema.decodeUnknown(Schema.Array(Schema.Array(Schema.Any))),
    Effect.map(Array.flatten)
  ),
};

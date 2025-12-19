import { Effect, Array, pipe, Schema, flow } from "effect";

export const list = {
  list: (...args: unknown[]) => Schema.decodeUnknown(Schema.Array(Schema.Unknown))(args),
  first: flow(Schema.decodeUnknown(Schema.Array(Schema.Unknown)), Effect.map(Array.head)),
  rest: flow(Schema.decodeUnknown(Schema.Array(Schema.Unknown)), Effect.map(Array.tail)),
  length: flow(Schema.decodeUnknown(Schema.Array(Schema.Unknown)), Effect.map(Array.length)),
  concat: (...args: unknown[]) =>
    pipe(args, Schema.decodeUnknown(Schema.Array(Schema.Array(Schema.Unknown))), Effect.map(Array.flatten)),
};

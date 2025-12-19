import { Effect, flow, pipe, Schema, Array } from "effect";

export const logic = {
  not: flow(
    Schema.decodeUnknown(Schema.Boolean),
    Effect.map((a) => !a)
  ),
  and: flow(Schema.decodeUnknown(Schema.Array(Schema.Boolean)), Effect.map(Array.every(Boolean))),
  or: flow(Schema.decodeUnknown(Schema.Array(Schema.Boolean)), Effect.map(Array.some(Boolean))),
  if: (cond: unknown, then: unknown, else_: unknown) =>
    pipe(
      cond,
      Schema.decodeUnknown(Schema.Boolean),
      Effect.map((cond) => (cond ? then : else_))
    ),
};

import { Effect, flow, Schema, Array, Boolean, Equal } from "effect";

export const logic = {
  not: flow((a: unknown) => a, Schema.decodeUnknown(Schema.Boolean), Effect.map(Boolean.not)),
  and: flow(
    (a: unknown, b: unknown) => [a, b],
    Schema.decodeUnknown(Schema.mutable(Schema.Tuple(Schema.Boolean, Schema.Boolean))),
    Effect.map(Array.every(Equal.equals(true)))
  ),
  or: flow(
    (a: unknown, b: unknown) => [a, b],
    Schema.decodeUnknown(Schema.mutable(Schema.Tuple(Schema.Boolean, Schema.Boolean))),
    Effect.map(Array.some(Equal.equals(true)))
  ),
  if: (cond: unknown, then: unknown, else_: unknown) => Effect.succeed(cond ? then : else_),
};

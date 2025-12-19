import { Effect, Schema } from "effect";

export const logic = {
  not: (a: unknown) =>
    Effect.gen(function* () {
      const aBoolean = yield* Schema.decodeUnknown(Schema.Boolean)(a);
      return !aBoolean;
    }),
  and: (...args: unknown[]) =>
    Effect.gen(function* () {
      const booleans = yield* Schema.decodeUnknown(Schema.Array(Schema.Boolean))(args);
      return booleans.every(Boolean);
    }),
  or: (...args: unknown[]) =>
    Effect.gen(function* () {
      const booleans = yield* Schema.decodeUnknown(Schema.Array(Schema.Boolean))(args);
      return booleans.some(Boolean);
    }),
  if: (cond: unknown, then: unknown, else_: unknown) =>
    Effect.gen(function* () {
      const aBoolean = yield* Schema.decodeUnknown(Schema.Boolean)(cond);
      return aBoolean ? then : else_;
    }),
};

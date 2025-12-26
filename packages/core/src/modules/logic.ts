import { Effect, flow, Schema, Array, Boolean, Equal } from "effect";
import { tupled } from "effect/Function";

const not = Boolean.not;

const and = Array.every(Equal.equals(true));

const or = Array.some(Equal.equals(true));

const if_ = (cond: boolean, then: unknown, else_: unknown) => (cond ? then : else_);

export const logic = {
  not: flow(
    (...flowArgs: unknown[]) => flowArgs,
    Schema.decodeUnknown(Schema.mutable(Schema.Tuple(Schema.Boolean))),
    Effect.map(tupled(not))
  ),

  and: flow(
    (...flowArgs: unknown[]) => flowArgs,
    Schema.decodeUnknown(Schema.mutable(Schema.Tuple(Schema.Boolean, Schema.Boolean))),
    Effect.map(and)
  ),

  or: flow(
    (...flowArgs: unknown[]) => flowArgs,
    Schema.decodeUnknown(Schema.mutable(Schema.Tuple(Schema.Boolean, Schema.Boolean))),
    Effect.map(or)
  ),

  if: flow(
    (...flowArgs: unknown[]) => flowArgs,
    Schema.decodeUnknown(Schema.mutable(Schema.Tuple(Schema.Boolean, Schema.Any, Schema.Any))),
    Effect.map(tupled(if_))
  ),
};

import { Boolean as Bool, Effect, flow, Schema } from "effect";
import { decode } from "@/modules/lib/shared";

export const module = {
  symbol: Symbol("boolean"),

  "equals?": flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple(Schema.Boolean, Schema.Boolean)),
    Effect.map(([a, b]) => a === b)
  ),

  not: flow(decode(Schema.Boolean), Effect.map(Bool.not)),

  and: flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple(Schema.Boolean, Schema.Boolean)),
    Effect.map(([a, b]) => Bool.and(a, b))
  ),

  or: flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple(Schema.Boolean, Schema.Boolean)),
    Effect.map(([a, b]) => Bool.or(a, b))
  ),

  xor: flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple(Schema.Boolean, Schema.Boolean)),
    Effect.map(([a, b]) => Bool.xor(a, b))
  ),

  nand: flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple(Schema.Boolean, Schema.Boolean)),
    Effect.map(([a, b]) => Bool.nand(a, b))
  ),

  nor: flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple(Schema.Boolean, Schema.Boolean)),
    Effect.map(([a, b]) => Bool.nor(a, b))
  ),
};

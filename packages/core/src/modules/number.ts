import { Effect, flow, Schema } from "effect";
import { decode } from "@/modules/lib/shared";

export const module = {
  symbol: Symbol("number"),

  "equals?": flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple(Schema.Number, Schema.Number)),
    Effect.map(([a, b]) => a === b)
  ),

  lessThan: flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple(Schema.Number, Schema.Number)),
    Effect.map(([a, b]) => a < b)
  ),

  greaterThan: flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple(Schema.Number, Schema.Number)),
    Effect.map(([a, b]) => a > b)
  ),

  lessThanOrEqualTo: flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple(Schema.Number, Schema.Number)),
    Effect.map(([a, b]) => a <= b)
  ),

  greaterThanOrEqualTo: flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple(Schema.Number, Schema.Number)),
    Effect.map(([a, b]) => a >= b)
  ),

  add: flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple(Schema.Number, Schema.Number)),
    Effect.map(([a, b]) => a + b)
  ),

  subtract: flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple(Schema.Number, Schema.Number)),
    Effect.map(([a, b]) => a - b)
  ),

  multiply: flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple(Schema.Number, Schema.Number)),
    Effect.map(([a, b]) => a * b)
  ),

  divide: flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple(Schema.Number, Schema.Number)),
    Effect.map(([a, b]) => a / b)
  ),
};

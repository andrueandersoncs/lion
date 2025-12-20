import { Effect, Schema, flow } from "effect";
import { dual } from "effect/Function";
import { tupled } from "effect/Function";

const add = dual(2, (a: number, b: number) => a + b);
const subtract = dual(2, (a: number, b: number) => a - b);
const multiply = dual(2, (a: number, b: number) => a * b);

const divide = dual(2, (a: number, b: number) =>
  b === 0 ? Effect.fail(new Error("Division by zero")) : Effect.succeed(a / b)
);

const equals = dual(2, (a: number, b: number) => a === b);
const lessThan = dual(2, (a: number, b: number) => a < b);
const greaterThan = dual(2, (a: number, b: number) => a > b);
const lessThanOrEqualTo = dual(2, (a: number, b: number) => a <= b);
const greaterThanOrEqualTo = dual(2, (a: number, b: number) => a >= b);

export const math = {
  "+": flow(
    (a: unknown, b: unknown) => [a, b],
    Schema.decodeUnknown(Schema.mutable(Schema.Tuple(Schema.Number, Schema.Number))),
    Effect.map(tupled(add))
  ),
  "-": flow(
    (a: unknown, b: unknown) => [a, b],
    Schema.decodeUnknown(Schema.mutable(Schema.Tuple(Schema.Number, Schema.Number))),
    Effect.map(tupled(subtract))
  ),
  "*": flow(
    (a: unknown, b: unknown) => [a, b],
    Schema.decodeUnknown(Schema.mutable(Schema.Tuple(Schema.Number, Schema.Number))),
    Effect.map(tupled(multiply))
  ),
  "/": flow(
    (a: unknown, b: unknown) => [a, b],
    Schema.decodeUnknown(Schema.mutable(Schema.Tuple(Schema.Number, Schema.Number))),
    Effect.flatMap(tupled(divide))
  ),
  "=": flow(
    (a: unknown, b: unknown) => [a, b],
    Schema.decodeUnknown(Schema.mutable(Schema.Tuple(Schema.Number, Schema.Number))),
    Effect.map(tupled(equals))
  ),
  "<": flow(
    (a: unknown, b: unknown) => [a, b],
    Schema.decodeUnknown(Schema.mutable(Schema.Tuple(Schema.Number, Schema.Number))),
    Effect.map(tupled(lessThan))
  ),
  ">": flow(
    (a: unknown, b: unknown) => [a, b],
    Schema.decodeUnknown(Schema.mutable(Schema.Tuple(Schema.Number, Schema.Number))),
    Effect.map(tupled(greaterThan))
  ),
  "<=": flow(
    (a: unknown, b: unknown) => [a, b],
    Schema.decodeUnknown(Schema.mutable(Schema.Tuple(Schema.Number, Schema.Number))),
    Effect.map(tupled(lessThanOrEqualTo))
  ),
  ">=": flow(
    (a: unknown, b: unknown) => [a, b],
    Schema.decodeUnknown(Schema.mutable(Schema.Tuple(Schema.Number, Schema.Number))),
    Effect.map(tupled(greaterThanOrEqualTo))
  ),
};

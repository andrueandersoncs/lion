import { Effect, Schema, flow } from "effect";
import { dual, tupled } from "effect/Function";

const add = (a: number, b: number) => a + b;

const subtract = (a: number, b: number) => a - b;

const multiply = (a: number, b: number) => a * b;

const divide = dual(2, (a: number, b: number) =>
  b === 0 ? Effect.fail(new Error("Division by zero")) : Effect.succeed(a / b)
);

const equals = (a: number, b: number) => a === b;

const lessThan = (a: number, b: number) => a < b;

const greaterThan = (a: number, b: number) => a > b;

const lessThanOrEqualTo = (a: number, b: number) => a <= b;

const greaterThanOrEqualTo = (a: number, b: number) => a >= b;

export const math = {
  "+": flow(
    (...flowArgs: unknown[]) => flowArgs,
    Schema.decodeUnknown(Schema.mutable(Schema.Tuple(Schema.Number, Schema.Number))),
    Effect.map(tupled(add))
  ),
  "-": flow(
    (...flowArgs: unknown[]) => flowArgs,
    Schema.decodeUnknown(Schema.mutable(Schema.Tuple(Schema.Number, Schema.Number))),
    Effect.map(tupled(subtract))
  ),
  "*": flow(
    (...flowArgs: unknown[]) => flowArgs,
    Schema.decodeUnknown(Schema.mutable(Schema.Tuple(Schema.Number, Schema.Number))),
    Effect.map(tupled(multiply))
  ),
  "/": flow(
    (...flowArgs: unknown[]) => flowArgs,
    Schema.decodeUnknown(Schema.mutable(Schema.Tuple(Schema.Number, Schema.Number))),
    Effect.flatMap(tupled(divide))
  ),
  "=": flow(
    (...flowArgs: unknown[]) => flowArgs,
    Schema.decodeUnknown(Schema.mutable(Schema.Tuple(Schema.Number, Schema.Number))),
    Effect.map(tupled(equals))
  ),
  "<": flow(
    (...flowArgs: unknown[]) => flowArgs,
    Schema.decodeUnknown(Schema.mutable(Schema.Tuple(Schema.Number, Schema.Number))),
    Effect.map(tupled(lessThan))
  ),
  ">": flow(
    (...flowArgs: unknown[]) => flowArgs,
    Schema.decodeUnknown(Schema.mutable(Schema.Tuple(Schema.Number, Schema.Number))),
    Effect.map(tupled(greaterThan))
  ),
  "<=": flow(
    (...flowArgs: unknown[]) => flowArgs,
    Schema.decodeUnknown(Schema.mutable(Schema.Tuple(Schema.Number, Schema.Number))),
    Effect.map(tupled(lessThanOrEqualTo))
  ),
  ">=": flow(
    (...flowArgs: unknown[]) => flowArgs,
    Schema.decodeUnknown(Schema.mutable(Schema.Tuple(Schema.Number, Schema.Number))),
    Effect.map(tupled(greaterThanOrEqualTo))
  ),
};

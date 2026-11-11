import { Effect, flow, Schema } from "effect";
import { ArithmeticError } from "@/errors/evaluation";
import { decode } from "@/modules/lib/shared";

/**
 * Arithmetic on two numbers. A result that is not a finite number, such as
 * one from dividing by zero, fails: JSON cannot hold Infinity or NaN.
 */
const arithmetic = (
  name: string,
  operator: string,
  operate: (a: number, b: number) => number
) =>
  flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple([Schema.Number, Schema.Number])),
    Effect.flatMap(([a, b]) => {
      const result = operate(a, b);
      return Number.isFinite(result)
        ? Effect.succeed(result)
        : Effect.fail(
            new ArithmeticError({
              message: `number/${name}: ${a} ${operator} ${b} has no finite result.`,
            })
          );
    })
  );

export const module = {
  symbol: Symbol("number"),

  "equals?": flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple([Schema.Number, Schema.Number])),
    Effect.map(([a, b]) => a === b)
  ),

  lessThan: flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple([Schema.Number, Schema.Number])),
    Effect.map(([a, b]) => a < b)
  ),

  greaterThan: flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple([Schema.Number, Schema.Number])),
    Effect.map(([a, b]) => a > b)
  ),

  lessThanOrEqualTo: flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple([Schema.Number, Schema.Number])),
    Effect.map(([a, b]) => a <= b)
  ),

  greaterThanOrEqualTo: flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple([Schema.Number, Schema.Number])),
    Effect.map(([a, b]) => a >= b)
  ),

  add: arithmetic("add", "+", (a, b) => a + b),

  subtract: arithmetic("subtract", "-", (a, b) => a - b),

  multiply: arithmetic("multiply", "×", (a, b) => a * b),

  divide: arithmetic("divide", "÷", (a, b) => a / b),
};

import { Effect, flow, Schema } from "effect";
import { ArithmeticError } from "@/errors/evaluation";
import { decode } from "@/modules/lib/shared";

const pair = flow(
  (a: unknown, b: unknown) => [a, b],
  decode(Schema.Tuple([Schema.Number, Schema.Number]))
);

const compare = (test: (a: number, b: number) => boolean) =>
  flow(
    pair,
    Effect.map(([a, b]) => test(a, b))
  );

/**
 * A result that is not a finite number, such as one from dividing by zero,
 * fails: JSON cannot hold Infinity or NaN.
 */
const finite = (result: number, describe: () => string) =>
  Number.isFinite(result)
    ? Effect.succeed(result)
    : Effect.fail(
        new ArithmeticError({
          message: `${describe()} has no finite result.`,
        })
      );

/** Arithmetic on two numbers. */
const arithmetic = (
  name: string,
  operator: string,
  operate: (a: number, b: number) => number
) =>
  flow(
    pair,
    Effect.flatMap(([a, b]) =>
      finite(operate(a, b), () => `number/${name}: ${a} ${operator} ${b}`)
    )
  );

/** Arithmetic on one number. */
const rounding = (operate: (a: number) => number) =>
  flow(decode(Schema.Number), Effect.map(operate));

export const module = {
  symbol: Symbol("number"),

  "equals?": compare((a, b) => a === b),
  lessThan: compare((a, b) => a < b),
  greaterThan: compare((a, b) => a > b),
  lessThanOrEqualTo: compare((a, b) => a <= b),
  greaterThanOrEqualTo: compare((a, b) => a >= b),

  add: arithmetic("add", "+", (a, b) => a + b),
  subtract: arithmetic("subtract", "-", (a, b) => a - b),
  multiply: arithmetic("multiply", "×", (a, b) => a * b),
  divide: arithmetic("divide", "÷", (a, b) => a / b),
  /** What is left after dividing, with the sign of the first number. */
  remainder: arithmetic("remainder", "mod", (a, b) => a % b),
  power: arithmetic("power", "to the power of", (a, b) => a ** b),
  min: arithmetic("min", "and", Math.min),
  max: arithmetic("max", "and", Math.max),

  absolute: rounding(Math.abs),
  floor: rounding(Math.floor),
  ceiling: rounding(Math.ceil),
  /** The nearest whole number; a half rounds up. */
  round: rounding(Math.round),
};

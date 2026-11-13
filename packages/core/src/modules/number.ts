import { Effect, Schema } from "effect";
import {
  ArithmeticError,
  atLeast,
  type Count,
  takes,
} from "@/errors/evaluation";
import { combining, decode, over } from "@/modules/lib/shared";

const compare = (test: (a: number, b: number) => boolean) =>
  over([Schema.Number, Schema.Number], test);

/**
 * Arithmetic on two numbers, or on as many as `count` says, taken from left
 * to right. A result that is not a finite number, such as one from dividing
 * by zero, fails: JSON cannot hold Infinity or NaN.
 */
const arithmetic = (
  name: string,
  operator: string,
  operate: (a: number, b: number) => number,
  count: Count = 2
) =>
  combining(
    Schema.Number,
    (values) => {
      const result = values.reduce((a, b) => operate(a, b));
      return Number.isFinite(result)
        ? Effect.succeed(result)
        : Effect.fail(
            new ArithmeticError({
              message: `number/${name}: ${values.join(` ${operator} `)} has no finite result.`,
            })
          );
    },
    count
  );

/** One or more numbers, combined as the function of two combines a pair. */
const SOME = atLeast(1);

/** Arithmetic on one number. */
const rounding = (operate: (a: number) => number) =>
  over([Schema.Number], operate);

/** What `toString` takes: the number, and what goes between its groups. */
const Written = decode(Schema.Tuple([Schema.Number, Schema.String]));

/** The digits of a number's whole part: the first run of digits in its text. */
const WHOLE = /\d+/;

/** Each digit with a multiple of three digits after it, up to the end. */
const GROUPS = /\d(?=(\d{3})+$)/g;

export const module = {
  symbol: Symbol("number"),

  "equals?": compare((a, b) => a === b),
  lessThan: compare((a, b) => a < b),
  greaterThan: compare((a, b) => a > b),
  lessThanOrEqualTo: compare((a, b) => a <= b),
  greaterThanOrEqualTo: compare((a, b) => a >= b),

  add: arithmetic("add", "+", (a, b) => a + b, SOME),
  subtract: arithmetic("subtract", "-", (a, b) => a - b),
  multiply: arithmetic("multiply", "×", (a, b) => a * b, SOME),
  divide: arithmetic("divide", "÷", (a, b) => a / b),
  /** What is left after dividing, with the sign of the first number. */
  remainder: arithmetic("remainder", "mod", (a, b) => a % b),
  power: arithmetic("power", "to the power of", (a, b) => a ** b),
  min: arithmetic("min", "and", Math.min, SOME),
  max: arithmetic("max", "and", Math.max, SOME),

  absolute: rounding(Math.abs),
  floor: rounding(Math.floor),
  ceiling: rounding(Math.ceil),
  /** The nearest whole number; a half rounds up. */
  round: rounding(Math.round),

  /**
   * The number as text, the way JSON writes it. With a separator, the whole
   * part is written in groups of three digits with it between them, as
   * `#:group-sep` does in Racket: "1,234,567.5".
   */
  toString: takes([1, 2], (value: unknown, separator: unknown = "") =>
    Effect.map(Written([value, separator]), ([n, between]) =>
      String(n).replace(WHOLE, (digits) =>
        digits.replace(GROUPS, (digit) => digit + between)
      )
    )
  ),
};

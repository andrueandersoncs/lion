import { Effect, Schema } from "effect";
import { ArithmeticError, atLeast, type Count } from "@/errors/evaluation";
import { readNumber } from "@/modules/lib/numerals";
import { combining, over } from "@/modules/lib/shared";

const compare = (test: (a: number, b: number) => boolean) =>
  over([Schema.Number, Schema.Number], test);

/**
 * Arithmetic on two numbers, or on as many as `count` says, taken from left
 * to right. A result that is not a finite number, such as one from dividing
 * by zero, fails: JSON cannot hold Infinity or NaN. Integers a JSON number
 * holds exactly, those from -(2^53 - 1) to 2^53 - 1, do exact arithmetic,
 * as Scheme's exact integers do: given `exact`, the exact result of such
 * integers, a result that is not the exact one fails, as
 * 9007199254740991 + 2 would round to 9007199254740992. Past that range a
 * JSON number is a float, and rounds as one.
 */
const arithmetic = (
  name: string,
  operator: string,
  operate: (a: number, b: number) => number,
  count: Count = 2,
  exact?: (a: bigint, b: bigint) => bigint,
  none?: number
) =>
  combining(
    Schema.Number,
    (values) => {
      const result = values.reduce((a, b) => operate(a, b));
      const said = () => `number/${name}: ${values.join(` ${operator} `)}`;
      if (!Number.isFinite(result)) {
        return Effect.fail(
          new ArithmeticError({ message: `${said()} has no finite result.` })
        );
      }
      // A result of rounding once is exact when a JSON number holds it,
      // and one that is no integer, as a negative power is, is a float.
      if (
        exact === undefined ||
        Number.isSafeInteger(result) ||
        !Number.isInteger(result) ||
        !values.every(Number.isSafeInteger)
      ) {
        return Effect.succeed(result);
      }
      const whole = values
        .slice(1)
        .reduce((a, b) => exact(a, BigInt(b)), BigInt(values[0] as number));
      if (whole === BigInt(result)) {
        return Effect.succeed(result);
      }
      return Effect.fail(
        new ArithmeticError({
          message: `${said()} is ${whole}, but a JSON number would hold it as ${result}: it holds every integer only from -9007199254740991 to 9007199254740991.`,
        })
      );
    },
    count,
    none
  );

/** One or more numbers, combined as the function of two combines a pair. */
const SOME = atLeast(1);

/** Any number of numbers: none gives what combining nothing gives. */
const ANY = atLeast(0);

/** Arithmetic on one number. */
const rounding = (operate: (a: number) => number) =>
  over([Schema.Number], operate);

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

  /** Zero or more numbers' sum: none is 0, as `(+)` is in Scheme. */
  add: arithmetic(
    "add",
    "+",
    (a, b) => a + b,
    ANY,
    (a, b) => a + b,
    0
  ),
  subtract: arithmetic(
    "subtract",
    "-",
    (a, b) => a - b,
    2,
    (a, b) => a - b
  ),
  /** Zero or more numbers' product: none is 1, as `(*)` is in Scheme. */
  multiply: arithmetic(
    "multiply",
    "×",
    (a, b) => a * b,
    ANY,
    (a, b) => a * b,
    1
  ),
  // A quotient of such integers is exact whenever it is an integer.
  divide: arithmetic("divide", "÷", (a, b) => a / b),
  /** What is left after dividing, with the sign of the first number. */
  remainder: arithmetic("remainder", "mod", (a, b) => a % b),
  // A negative power of an integer is a fraction, which never comes here.
  power: arithmetic(
    "power",
    "to the power of",
    (a, b) => a ** b,
    2,
    (a, b) => (b >= 0n ? a ** b : 0n)
  ),
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
  toString: over(
    [Schema.Number, Schema.String],
    (n, between = "") =>
      String(n).replace(WHOLE, (digits) =>
        digits.replace(GROUPS, (digit) => digit + between)
      ),
    1
  ),
  /**
   * The number the text writes, as `string->number` reads it in Scheme, or
   * null when the text is not one number. With a separator, the whole part
   * may be in groups of three digits with it between them, so the text
   * `toString` writes with a separator reads back as the number.
   */
  fromString: over(
    [Schema.String, Schema.String],
    (text, between = "") => readNumber(text, between),
    1
  ),
};

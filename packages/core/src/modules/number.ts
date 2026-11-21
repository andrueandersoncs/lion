import { Effect, Schema } from "effect";
import { ArithmeticError, atLeast, type Count } from "@/errors/evaluation";
import { readNumber } from "@/modules/lib/numerals";
import { combining, over } from "@/modules/lib/shared";
import {
  absolute,
  ceilingOf,
  compareNumbers,
  DIGITS,
  difference,
  floorOf,
  type LionNumber,
  numberText,
  power,
  product,
  quotient,
  remainder,
  roundTo,
  sum,
} from "@/numbers/exact";
import { NumberSchema } from "@/schemas/number";

const compare = (test: (order: number) => boolean) =>
  over([NumberSchema, NumberSchema], (a, b) => test(compareNumbers(a, b)));

/**
 * Arithmetic on two numbers, or on as many as `count` says, taken from left
 * to right. Every number is exact, so every result is: a sum, difference,
 * product, or quotient of numbers is the exact one, as Scheme's exact
 * numbers give, and 0.1 + 0.2 is 0.3. `operate` gives undefined where there
 * is no result, as for dividing by zero, and the call fails.
 */
const arithmetic = (
  name: string,
  operator: string,
  operate: (a: LionNumber, b: LionNumber) => LionNumber | undefined,
  count: Count = 2,
  why = "has no finite result"
) =>
  combining(
    NumberSchema,
    (values) => {
      let result: LionNumber | undefined = values[0] as LionNumber;
      for (let at = 1; at < values.length && result !== undefined; at += 1) {
        result = operate(result, values[at] as LionNumber);
      }
      return result === undefined
        ? Effect.fail(
            new ArithmeticError({
              message: `number/${name}: ${values.map(numberText).join(` ${operator} `)} ${why}.`,
            })
          )
        : Effect.succeed(result);
    },
    count
  );

/** One or more numbers, combined as the function of two combines a pair. */
const SOME = atLeast(1);

/** Arithmetic on one number. */
const rounding = (operate: (a: LionNumber) => LionNumber) =>
  over([NumberSchema], operate);

/** The digits of a number's whole part: the first run of digits in its text. */
const WHOLE = /\d+/;

/** Each digit with a multiple of three digits after it, up to the end. */
const GROUPS = /\d(?=(\d{3})+$)/g;

const least = (a: LionNumber, b: LionNumber) =>
  compareNumbers(b, a) < 0 ? b : a;
const most = (a: LionNumber, b: LionNumber) =>
  compareNumbers(b, a) > 0 ? b : a;

export const module = {
  symbol: Symbol("number"),

  "equals?": compare((order) => order === 0),
  lessThan: compare((order) => order < 0),
  greaterThan: compare((order) => order > 0),
  lessThanOrEqualTo: compare((order) => order <= 0),
  greaterThanOrEqualTo: compare((order) => order >= 0),

  add: arithmetic("add", "+", sum, SOME),
  subtract: arithmetic("subtract", "-", difference),
  multiply: arithmetic("multiply", "×", product, SOME),
  /** The exact quotient: 1 ÷ 3 is the fraction one third. */
  divide: arithmetic("divide", "÷", quotient),
  /** What is left after dividing, with the sign of the first number. */
  remainder: arithmetic("remainder", "mod", remainder),
  /**
   * A whole power is exact; a power past so many digits that it would take
   * long to make fails. A power that is not whole, such as a square root,
   * is the nearest number a JavaScript number writes.
   */
  power: arithmetic(
    "power",
    "to the power of",
    power,
    2,
    `has no finite result, or would have more than ${DIGITS} digits`
  ),
  min: arithmetic("min", "and", least, SOME),
  max: arithmetic("max", "and", most, SOME),

  absolute: rounding(absolute),
  floor: rounding(floorOf),
  ceiling: rounding(ceilingOf),
  /**
   * The nearest whole number, or with `places`, the nearest number with that
   * many digits after the point; a half rounds up.
   */
  round: over(
    [NumberSchema, Schema.Int],
    (n, places = 0) => roundTo(n, places),
    1
  ),

  /**
   * The number as text, the way JSON writes it, and a fraction no decimal
   * writes as Scheme writes it, "1/3". With a separator, the whole part is
   * written in groups of three digits with it between them, as `#:group-sep`
   * does in Racket: "1,234,567.5".
   */
  toString: over(
    [NumberSchema, Schema.String],
    (n, between = "") =>
      numberText(n).replace(WHOLE, (digits) =>
        digits.replace(GROUPS, (digit) => digit + between)
      ),
    1
  ),
  /**
   * The number the text writes, as `string->number` reads it in Scheme, or
   * null when the text is not one number: "0.1" is one tenth and "1/3" one
   * third. With a separator, the whole part may be in groups of three digits
   * with it between them, so the text `toString` writes with a separator
   * reads back as the number.
   */
  fromString: over(
    [Schema.String, Schema.String],
    (text, between = "") => readNumber(text, between),
    1
  ),
};

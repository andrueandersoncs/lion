/**
 * Reading a program, or a database, from its JSON text, and writing a value
 * as JSON text. Every number is exact, so a number in the text is read as the
 * exact value its digits write: 0.1 is one tenth, and 9007199254740993 is
 * itself, where `JSON.parse` would read the nearest double. A value is
 * written with each number's digits, and a fraction no decimal writes, such
 * as 1/3, has no JSON text.
 */
import { Effect } from "effect";
import { ArithmeticError, LogicError } from "@/errors/evaluation";
import { DIGITS, NotJson, readNumberText } from "@/numbers/exact";

/** A JSON string, which is skipped, or a JSON number, with its parts. */
const TOKEN = /"(?:[^"\\]|\\.)*"|-?\d+(\.\d+)?([eE][+-]?\d+)?/g;

/**
 * Whether a number token reads exactly as the double `JSON.parse` makes of
 * it: a decimal of at most 15 significant digits, as every double holds,
 * that is neither too large nor too small for one.
 */
const EXPONENT = /[eE].*$/;
const SIGN_AND_POINT = /[-.]/g;
const LEADING_ZEROS = /^0+/;
const TRAILING_ZEROS = /0+$/;

const readsAsDouble = (token: string) => {
  const mantissa = token.replace(EXPONENT, "").replace(SIGN_AND_POINT, "");
  const significant = mantissa
    .replace(LEADING_ZEROS, "")
    .replace(TRAILING_ZEROS, "");
  const value = Number(token);
  return (
    significant.length <= 15 &&
    Number.isFinite(value) &&
    (value !== 0 || significant === "")
  );
};

/** Whether some number in the text needs its digits to be read exactly. */
const needsDigits = (text: string) => {
  for (const [token] of text.matchAll(TOKEN)) {
    if (!(token.startsWith('"') || readsAsDouble(token))) {
      return true;
    }
  }
  return false;
};

/** Raised by the reader for a number with more digits than text may write. */
class TooLong extends Error {}

/** The line and column of a place in the text, counted from 1. */
const placeOf = (text: string, at: number) => {
  const before = text.slice(0, at).split("\n");
  return `line ${before.length}, column ${(before.at(-1)?.length ?? 0) + 1}`;
};

type Reviver = (
  this: unknown,
  key: string,
  value: unknown,
  context?: { readonly source?: string }
) => unknown;

const exactly: Reviver = (_key, value, context) => {
  if (typeof value !== "number" || context?.source === undefined) {
    return value;
  }
  const read = readNumberText(context.source);
  if (read === undefined) {
    throw new TooLong(context.source);
  }
  return read;
};

/**
 * The value JSON text writes, each number exactly as its digits write it,
 * or a failure when the text is not JSON or writes a number with more digits
 * than a number read from text may have.
 */
export const readJson = (text: string): Effect.Effect<unknown, LogicError> =>
  Effect.suspend(() => {
    try {
      return Effect.succeed(
        needsDigits(text)
          ? JSON.parse(text, exactly as Parameters<typeof JSON.parse>[1])
          : JSON.parse(text)
      );
    } catch (error) {
      if (error instanceof TooLong) {
        const at = text.indexOf(error.message);
        return Effect.fail(
          new LogicError({
            message: `The number at ${placeOf(text, at)} has more than ${DIGITS} digits, more than a number read from text may have.`,
          })
        );
      }
      return Effect.fail(
        new LogicError({
          message: `The text is not JSON: ${error instanceof Error ? error.message : String(error)}`,
        })
      );
    }
  });

/**
 * A value as JSON text, each number with its digits, or a failure when it
 * holds a fraction no decimal writes, such as 1/3.
 */
export const writeJson = (
  value: unknown,
  space?: number | string
): Effect.Effect<string, ArithmeticError> =>
  Effect.suspend(() => {
    try {
      return Effect.succeed(
        JSON.stringify(value === undefined ? null : value, null, space)
      );
    } catch (error) {
      if (error instanceof NotJson) {
        return Effect.fail(new ArithmeticError({ message: error.message }));
      }
      throw error;
    }
  });

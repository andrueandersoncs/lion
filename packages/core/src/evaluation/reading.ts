/**
 * Reading a program, or a database, from its JSON text. JSON numbers are
 * JavaScript's, which hold every integer only up to 2^53 - 1: the text
 * 9007199254740993 would read as 9007199254740992 without a word, and
 * compare equal to it. So an integer written in the text that would come
 * back as another when Lion writes it is refused, as arithmetic whose
 * integer result cannot be held exactly is. Text Lion writes always reads
 * back: past that range a number is a float, which JSON may write with
 * digits alone, as it writes 36944794794896088 as 36944794794896090. A
 * number written with a fraction or an exponent is read as near as it can
 * be, as any JSON number is.
 */
import { Effect } from "effect";
import { LogicError } from "@/errors/evaluation";

/** A JSON string, which is skipped, or a JSON number, with its parts. */
const TOKEN = /"(?:[^"\\]|\\.)*"|-?\d+(\.\d+)?([eE][+-]?\d+)?/g;

/**
 * Whether written digits, with maybe a minus sign, read as what they say:
 * as the integer itself, or as the number JSON writes with these digits.
 */
export const readsAsWritten = (written: string) => {
  const n = Number(written);
  return BigInt(written) === BigInt(n) || JSON.stringify(n) === written;
};

/** The first integer the text writes that does not read as itself. */
export const inexactInteger = (
  text: string
): { readonly at: number; readonly written: string } | undefined => {
  for (const found of text.matchAll(TOKEN)) {
    const [written, fraction, exponent] = found;
    const isInteger =
      !written.startsWith('"') &&
      fraction === undefined &&
      exponent === undefined;
    if (isInteger && !readsAsWritten(written)) {
      return { at: found.index, written };
    }
  }
  return undefined;
};

/** The line and column of a place in the text, counted from 1. */
const placeOf = (text: string, at: number) => {
  const before = text.slice(0, at).split("\n");
  return `line ${before.length}, column ${(before.at(-1)?.length ?? 0) + 1}`;
};

/** The failure of text that writes an integer JSON numbers cannot hold. */
export const inexactIntegerError = (
  text: string,
  at: number,
  written: string
) =>
  new LogicError({
    message: `The integer ${written} at ${placeOf(text, at)} cannot be held exactly: a JSON number holds every integer only from -9007199254740991 to 9007199254740991, and this one would read as ${String(Number(written))}.`,
  });

/**
 * The value JSON text writes, as `JSON.parse` reads it, or a failure when the
 * text is not JSON or writes an integer that would not read as itself.
 */
export const readJson = (text: string): Effect.Effect<unknown, LogicError> =>
  Effect.suspend(() => {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (error) {
      return Effect.fail(
        new LogicError({
          message: `The text is not JSON: ${error instanceof Error ? error.message : String(error)}`,
        })
      );
    }
    const inexact = inexactInteger(text);
    return inexact === undefined
      ? Effect.succeed(value)
      : Effect.fail(inexactIntegerError(text, inexact.at, inexact.written));
  });

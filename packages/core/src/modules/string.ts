import { Effect, Schema, String as Str } from "effect";
import { numbersIn } from "@/modules/lib/numerals";
import { combining, over, slicing } from "@/modules/lib/shared";

// Like the rest of the library, each function takes its subject first:
// ["string/startsWith", text, prefix]. indexOf returns -1 when the text does
// not contain the search string, as JavaScript does.
const onTwo = <A>(operate: (text: string, other: string) => A) =>
  over([Schema.String, Schema.String], operate);

/** Text made as long as `length` with copies of `fill`, as JavaScript pads. */
const padding = (pad: (text: string, length: number, fill: string) => string) =>
  over([Schema.String, Schema.Int, Schema.String], pad);

export const module = {
  symbol: Symbol("string"),

  "equals?": onTwo((a, b) => a === b),
  length: over([Schema.String], Str.length),
  /** One or more strings, joined in order. */
  concat: combining(Schema.String, (texts) => Effect.succeed(texts.join(""))),
  startsWith: onTwo((text, search) => text.startsWith(search)),
  endsWith: onTwo((text, search) => text.endsWith(search)),
  includes: onTwo((text, search) => text.includes(search)),
  indexOf: onTwo((text, search) => text.indexOf(search)),
  /**
   * A list of strings with the separator between them. With a third string,
   * that one stands before the last item instead, as `#:before-last` does in
   * Racket: "a, b and c".
   */
  join: over(
    [Schema.Array(Schema.String), Schema.String, Schema.String],
    (texts, between, before = between) =>
      texts.length < 2
        ? texts.join("")
        : `${texts.slice(0, -1).join(between)}${before}${texts.at(-1)}`,
    2
  ),
  /** The parts of the text between each separator: what `join` joins back. */
  split: onTwo((text, separator): string[] => text.split(separator)),
  /** The text from `start` up to `end`, as `array/slice` cuts a list. */
  slice: slicing(Schema.String),
  padStart: padding((text, length, fill) => text.padStart(length, fill)),
  padEnd: padding((text, length, fill) => text.padEnd(length, fill)),
  /**
   * Every number written in the text, in order, each read as
   * `number/fromString` reads it: "$1,250.5M, down -3%" holds 1250.5 and -3
   * with the separator ",".
   */
  numbers: over(
    [Schema.String, Schema.String],
    (text, between = "") => numbersIn(text, between),
    1
  ),
};

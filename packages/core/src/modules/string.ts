import { Effect, Schema, String as Str } from "effect";
import { takes } from "@/errors/evaluation";
import { combining, decode, over } from "@/modules/lib/shared";

// Like the rest of the library, each function takes its subject first:
// ["string/startsWith", text, prefix]. indexOf returns -1 when the text does
// not contain the search string, as JavaScript does.
const onTwo = <A>(operate: (text: string, other: string) => A) =>
  over([Schema.String, Schema.String], operate);

/** What `join` takes: the strings, what goes between, and before the last. */
const Joined = decode(
  Schema.Tuple([Schema.Array(Schema.String), Schema.String, Schema.String])
);

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
  join: takes(
    [2, 3],
    (items: unknown, separator: unknown, last: unknown = separator) =>
      Effect.map(
        Joined([items, separator, last]),
        ([texts, between, before]) =>
          texts.length < 2
            ? texts.join("")
            : `${texts.slice(0, -1).join(between)}${before}${texts.at(-1)}`
      )
  ),
  /** The parts of the text between each separator: what `join` joins back. */
  split: onTwo((text, separator): string[] => text.split(separator)),
  padStart: padding((text, length, fill) => text.padStart(length, fill)),
  padEnd: padding((text, length, fill) => text.padEnd(length, fill)),
};

import { Effect, Schema, String as Str } from "effect";
import { combining, over } from "@/modules/lib/shared";

// Like the rest of the library, each function takes its subject first:
// ["string/startsWith", text, prefix]. indexOf returns -1 when the text does
// not contain the search string, as JavaScript does.
const onTwo = <A>(operate: (text: string, other: string) => A) =>
  over([Schema.String, Schema.String], operate);

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
};

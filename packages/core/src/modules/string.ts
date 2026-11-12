import { Effect, flow, Schema, String as Str } from "effect";
import { decode } from "@/modules/lib/shared";

// Like the rest of the library, each function takes its subject first:
// ["string/startsWith", text, prefix]. indexOf returns -1 when the text does
// not contain the search string, as JavaScript does.
const onTwo = <A>(operate: (text: string, other: string) => A) =>
  flow(
    (text: unknown, other: unknown) => [text, other],
    decode(Schema.Tuple([Schema.String, Schema.String])),
    Effect.map(([text, other]) => operate(text, other))
  );

export const module = {
  symbol: Symbol("string"),

  "equals?": onTwo((a, b) => a === b),
  length: flow(decode(Schema.String), Effect.map(Str.length)),
  concat: onTwo((a, b) => a + b),
  startsWith: onTwo((text, search) => text.startsWith(search)),
  endsWith: onTwo((text, search) => text.endsWith(search)),
  includes: onTwo((text, search) => text.includes(search)),
  indexOf: onTwo((text, search) => text.indexOf(search)),
};

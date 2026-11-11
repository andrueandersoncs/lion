import { Effect, flow, Schema, String as Str } from "effect";
import { decode } from "@/modules/lib/shared";

// Like the rest of the library, each function takes its subject first:
// ["string/startsWith", text, prefix]. indexOf returns -1 when the text does
// not contain the search string, as JavaScript does.
export const module = {
  symbol: Symbol("string"),

  "equals?": flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple([Schema.String, Schema.String])),
    Effect.map(([a, b]) => a === b)
  ),

  length: flow(decode(Schema.String), Effect.map(Str.length)),

  concat: flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple([Schema.String, Schema.String])),
    Effect.map(([a, b]) => Str.concat(a, b))
  ),

  startsWith: flow(
    (text: unknown, search: unknown) => [text, search],
    decode(Schema.Tuple([Schema.String, Schema.String])),
    Effect.map(([text, search]) => text.startsWith(search))
  ),

  endsWith: flow(
    (text: unknown, search: unknown) => [text, search],
    decode(Schema.Tuple([Schema.String, Schema.String])),
    Effect.map(([text, search]) => text.endsWith(search))
  ),

  includes: flow(
    (text: unknown, search: unknown) => [text, search],
    decode(Schema.Tuple([Schema.String, Schema.String])),
    Effect.map(([text, search]) => text.includes(search))
  ),

  indexOf: flow(
    (text: unknown, search: unknown) => [text, search],
    decode(Schema.Tuple([Schema.String, Schema.String])),
    Effect.map(([text, search]) => text.indexOf(search))
  ),
};

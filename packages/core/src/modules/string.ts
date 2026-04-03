import { Effect, flow, Schema, String as Str } from "effect";
import { decode } from "@/modules/lib/shared";

export const module = {
  symbol: Symbol("string"),

  "equals?": flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple(Schema.String, Schema.String)),
    Effect.map(([a, b]) => a === b)
  ),

  length: flow(decode(Schema.String), Effect.map(Str.length)),

  concat: flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple(Schema.String, Schema.String)),
    Effect.map(([a, b]) => Str.concat(a, b))
  ),

  startsWith: flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple(Schema.String, Schema.String)),
    Effect.map(([a, b]) => Str.startsWith(a)(b))
  ),

  endsWith: flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple(Schema.String, Schema.String)),
    Effect.map(([a, b]) => Str.endsWith(a)(b))
  ),

  includes: flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple(Schema.String, Schema.String)),
    Effect.map(([a, b]) => Str.includes(a)(b))
  ),

  indexOf: flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple(Schema.String, Schema.String)),
    Effect.map(([a, b]) => Str.indexOf(a)(b))
  ),
};

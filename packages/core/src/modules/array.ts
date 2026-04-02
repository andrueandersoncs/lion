import { Array as Arr, Effect, flow, Option, Schema } from "effect";
import { decode } from "@/modules/shared";

export const module = {
  symbol: Symbol("array"),

  make: (...args: unknown[]) => Effect.succeed(args),

  head: flow(
    decode(Schema.Array(Schema.Any)),
    Effect.map(Arr.head),
    Effect.map(Option.getOrThrow)
  ),

  tail: flow(
    decode(Schema.Array(Schema.Any)),
    Effect.map(Arr.tail),
    Effect.map(Option.getOrThrow)
  ),

  length: flow(decode(Schema.Array(Schema.Any)), Effect.map(Arr.length)),

  concat: flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple(Schema.Array(Schema.Any), Schema.Array(Schema.Any))),
    Effect.map(Arr.flatten)
  ),

  "includes?": flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple(Schema.Array(Schema.Any), Schema.Any)),
    Effect.map(([list, item]) => Arr.contains(list, item))
  ),

  map: flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple(Schema.Array(Schema.Any), Schema.Any)),
    Effect.flatMap(([list, fn]) =>
      Effect.all(Arr.map(list, fn) as Effect.Effect<unknown>[])
    )
  ),

  reduce: flow(
    (a: unknown, b: unknown, c: unknown) => [a, b, c],
    decode(Schema.Tuple(Schema.Array(Schema.Any), Schema.Any, Schema.Any)),
    Effect.flatMap(([list, initial, fn]) =>
      Arr.reduce(list, Effect.succeed(initial), (accEffect, item) =>
        Effect.flatMap(accEffect, (acc) =>
          (fn as (acc: unknown, item: unknown) => Effect.Effect<unknown>)(
            acc,
            item
          )
        )
      )
    )
  ),
};

import { Array as Arr, Effect, flow, Option, Schema } from "effect";

export const list = {
  list: <T>(...args: T[]) => Effect.succeed(args),

  head: flow(
    <T>(a: T) => a,
    Schema.decodeUnknown(Schema.Array(Schema.Any)),
    Effect.map(Arr.head),
    Effect.map(Option.getOrThrow)
  ),

  tail: flow(
    <T>(a: T) => a,
    Schema.decodeUnknown(Schema.Array(Schema.Any)),
    Effect.map(Arr.tail),
    Effect.map(Option.getOrThrow)
  ),

  length: flow(
    <T>(a: T) => a,
    Schema.decodeUnknown(Schema.Array(Schema.Any)),
    Effect.map(Arr.length)
  ),

  concat: flow(
    <T>(a: T, b: T) => [a, b],
    Schema.decodeUnknown(
      Schema.Tuple(Schema.Array(Schema.Any), Schema.Array(Schema.Any))
    ),
    Effect.map(Arr.flatten)
  ),

  includes: flow(
    <T>(a: T, b: T) => [a, b],
    Schema.decodeUnknown(Schema.Tuple(Schema.Array(Schema.Any), Schema.Any)),
    Effect.map(([list, item]) => Arr.contains(list, item))
  ),

  map: flow(
    <T, U>(a: T, b: U) => [a, b],
    Schema.decodeUnknown(Schema.Tuple(Schema.Array(Schema.Any), Schema.Any)),
    Effect.flatMap(([list, fn]) =>
      Effect.all(Arr.map(list, fn) as Effect.Effect<unknown>[])
    )
  ),

  reduce: flow(
    <T, U>(a: T, b: U, c: unknown) => [a, b, c],
    Schema.decodeUnknown(
      Schema.Tuple(Schema.Array(Schema.Any), Schema.Any, Schema.Any)
    ),
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

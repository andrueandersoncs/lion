import { Array as Arr, Effect, flow, Option, pipe, Schema } from "effect";
import { LogicError } from "@/errors/evaluation";
import { decode } from "@/modules/lib/shared";

const MAX_RANGE = 1_000_000;

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
    decode(Schema.Tuple([Schema.Array(Schema.Any), Schema.Array(Schema.Any)])),
    Effect.map(Arr.flatten)
  ),

  "includes?": flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple([Schema.Array(Schema.Any), Schema.Any])),
    Effect.map(([list, item]) => Arr.contains(list, item))
  ),

  map: flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple([Schema.Array(Schema.Any), Schema.Any])),
    Effect.flatMap(([list, fn]) =>
      Effect.all(Arr.map(list, fn) as Effect.Effect<unknown>[])
    )
  ),

  "flat-map": flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple([Schema.Array(Schema.Any), Schema.Any])),
    Effect.flatMap(([list, fn]) =>
      pipe(
        Arr.map(list, fn) as Effect.Effect<unknown[]>[],
        Effect.all,
        Effect.map(Arr.flatten)
      )
    )
  ),

  reduce: flow(
    (a: unknown, b: unknown, c: unknown) => [a, b, c],
    decode(Schema.Tuple([Schema.Array(Schema.Any), Schema.Any, Schema.Any])),
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

  /** Whole numbers from start up to, but not including, end. */
  range: flow(
    (start: unknown, end: unknown) => [start, end],
    decode(Schema.Tuple([Schema.Int, Schema.Int])),
    Effect.flatMap(([start, end]) =>
      end - start > MAX_RANGE
        ? Effect.fail(
            new LogicError({
              message: `array/range can make at most ${MAX_RANGE} numbers, but was asked for ${end - start}.`,
            })
          )
        : Effect.succeed(
            Array.from(
              { length: Math.max(0, end - start) },
              (_, index) => start + index
            )
          )
    )
  ),
};

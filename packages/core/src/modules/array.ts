import { Array as Arr, Effect, flow, Option, Schema } from "effect";
import { LogicError } from "@/errors/evaluation";
import { call } from "@/logic/terms";
import { decode } from "@/modules/lib/shared";

const MAX_RANGE = 1_000_000;

/** The function's result for each item of a list, in order. */
const mapItems = flow(
  (a: unknown, b: unknown) => [a, b],
  decode(Schema.Tuple([Schema.Array(Schema.Any), Schema.Any])),
  Effect.flatMap(([list, fn]) => Effect.all(list.map((item) => call(fn, item))))
);

export const module = {
  symbol: Symbol("array"),

  make: (...args: unknown[]) => Effect.succeed(args),

  /** The first item, or null for an empty list. */
  head: flow(
    decode(Schema.Array(Schema.Any)),
    Effect.map(Arr.head),
    Effect.map(Option.getOrNull)
  ),

  /** Every item after the first; an empty list has none. */
  tail: flow(
    decode(Schema.Array(Schema.Any)),
    Effect.map(Arr.tail),
    Effect.map(Option.getOrElse((): unknown[] => []))
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

  /** Calls the function on each item, in order. */
  map: mapItems,

  "flat-map": flow(
    mapItems,
    Effect.map((lists) => lists.flat())
  ),

  reduce: flow(
    (a: unknown, b: unknown, c: unknown) => [a, b, c],
    decode(Schema.Tuple([Schema.Array(Schema.Any), Schema.Any, Schema.Any])),
    Effect.flatMap(([list, initial, fn]) =>
      Effect.reduce(
        list,
        (): unknown => initial,
        (total, item) => call(fn, total, item)
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

import { Array as Arr, Effect, Option, Schema } from "effect";
import { logicError } from "@/errors/evaluation";
import { call } from "@/evaluation/special-forms/function";
import { listMaker } from "@/logic/terms";
import { combining, over, overEffect } from "@/modules/lib/shared";

const MAX_RANGE = 1_000_000;

const List = Schema.Array(Schema.Any);

/** The function's result for each item of a list, in order. */
const mapItems = overEffect([List, Schema.Any], (list, fn) =>
  Effect.all(list.map((item) => call(fn, item)))
);

export const module = {
  symbol: Symbol("array"),

  make: listMaker((...args: unknown[]) => Effect.succeed(args)),

  /** The first item, or null for an empty list. */
  head: over([List], (list) => Option.getOrNull(Arr.head(list))),

  /** Every item after the first; an empty list has none. */
  tail: over([List], (list): unknown[] => list.slice(1)),

  length: over([List], Arr.length),

  /** One or more lists, joined in order. */
  concat: combining(List, (lists) => Effect.succeed(Arr.flatten(lists))),

  "includes?": over([List, Schema.Any], (list, item) =>
    Arr.contains(list, item)
  ),

  /** Calls the function on each item, in order. */
  map: mapItems,

  "flat-map": overEffect([List, Schema.Any], (list, fn) =>
    Effect.map(mapItems(list, fn), (lists) => lists.flat())
  ),

  reduce: overEffect([List, Schema.Any, Schema.Any], (list, initial, fn) =>
    Effect.reduce(
      list,
      (): unknown => initial,
      (total, item) => call(fn, total, item)
    )
  ),

  /** Whole numbers from start up to, but not including, end. */
  range: overEffect([Schema.Int, Schema.Int], (start, end) =>
    end - start > MAX_RANGE
      ? logicError(
          `array/range can make at most ${MAX_RANGE} numbers, but was asked for ${end - start}.`
        )
      : Effect.succeed(
          Array.from(
            { length: Math.max(0, end - start) },
            (_, index) => start + index
          )
        )
  ),
};

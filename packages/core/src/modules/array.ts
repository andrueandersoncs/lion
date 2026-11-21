import { Array as Arr, Effect, Schema } from "effect";
import { atLeast, logicError } from "@/errors/evaluation";
import { call } from "@/evaluation/special-forms/function";
import { listMaker, show } from "@/logic/terms";
import { combining, over, overEffect, slicing } from "@/modules/lib/shared";

const MAX_RANGE = 1_000_000;

const List = Schema.Array(Schema.Any);

/** A list with an item in it, as Scheme's car and cdr take. */
const Filled = List.check(
  Schema.isMinLength(1, { expected: "a value that is not empty" })
);

/**
 * Whether the function gives `stop` for some item, asked item by item and
 * stopping at the first that does, as Racket's ormap and andmap do. The
 * function gives true or false, as a condition does.
 */
const asking = (name: string, stop: boolean) =>
  overEffect([List, Schema.Any], (list, fn) =>
    Effect.gen(function* () {
      for (const item of list) {
        const value = yield* call(fn, item);
        if (typeof value !== "boolean") {
          return yield* logicError(
            `${name} needs its function to give true or false, but for ${show(item)} it gives ${show(value)}.`
          );
        }
        if (value === stop) {
          return stop;
        }
      }
      return !stop;
    })
  );

/** The function's result for each item of a list, in order. */
const mapItems = overEffect([List, Schema.Any], (list, fn) =>
  Effect.all(list.map((item) => call(fn, item)))
);

export const module = {
  symbol: Symbol("array"),

  make: listMaker((...args: unknown[]) => Effect.succeed(args)),

  /**
   * The first item of a list that has one, as Scheme's car gives it. An
   * empty list has no first item, so it fails, as `object/get` fails for a
   * key a record does not have: a null would read as the head of [null].
   */
  head: over([Filled], (list) => list[0]),

  /** Every item after the first, of a list that has one, as Scheme's cdr gives them. */
  tail: over([Filled], (list): unknown[] => list.slice(1)),

  /** The items from `start` up to `end`, as `string/slice` cuts text. */
  slice: slicing(List),

  length: over([List], Arr.length),

  /** Zero or more lists, joined in order: none is [], as `(append)` is in Scheme. */
  concat: combining(
    List,
    (lists) => Effect.succeed(Arr.flatten(lists)),
    atLeast(0),
    []
  ),

  /**
   * One or more lists, paired up item by item: the first items, then the
   * second, up to the end of the shortest list, as Scheme's `map` goes over
   * several lists at once.
   */
  zip: combining(List, (lists) =>
    Effect.succeed(
      Array.from(
        { length: Math.min(...lists.map((list) => list.length)) },
        (_, at) => lists.map((list) => list[at])
      )
    )
  ),

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

  /**
   * Every value `reduce` passes through, starting with `initial`, so the
   * last is what `reduce` gives: the states a run of steps goes through.
   */
  reductions: overEffect([List, Schema.Any, Schema.Any], (list, initial, fn) =>
    Effect.reduce(
      list,
      (): unknown[] => [initial],
      (states, item) =>
        Effect.map(call(fn, states.at(-1), item), (next) => {
          states.push(next);
          return states;
        })
    )
  ),

  /** Whether the function is true for some item; it stops at the first. */
  "some?": asking("array/some?", true),

  /** Whether the function is true for every item; it stops at the first that is not. */
  "every?": asking("array/every?", false),

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

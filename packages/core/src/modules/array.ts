import { Array as Arr, Effect, Schema } from "effect";
import { atLeast, logicError } from "@/errors/evaluation";
import { call } from "@/evaluation/special-forms/function";
import { compareValues, listMaker, sameValue, show } from "@/logic/terms";
import { combining, over, overEffect, slicing } from "@/modules/lib/shared";
import { IndexOutOfBoundsError } from "@/modules/object";

const MAX_RANGE = 1_000_000;

const List = Schema.Array(Schema.Any);

/** A list with an item in it, as Scheme's car and cdr take. */
const Filled = List.check(
  Schema.isMinLength(1, { expected: "a value that is not empty" })
);

const booleanResult = (name: string, input: string, value: unknown) =>
  typeof value === "boolean"
    ? Effect.succeed(value)
    : logicError(
        `${name} needs its function to give true or false, but for ${input} it gives ${show(value)}.`
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
        const value = yield* booleanResult(
          name,
          show(item),
          yield* call(fn, item)
        );
        if (value === stop) {
          return stop;
        }
      }
      return !stop;
    })
  );

/** Stable merge sort with an Effect-returning strict boolean `before` comparator. */
const mergeSort = (
  items: readonly unknown[],
  before: unknown
): Effect.Effect<unknown[], unknown> =>
  items.length < 2
    ? Effect.succeed([...items])
    : Effect.gen(function* () {
        const mid = Math.floor(items.length / 2);
        const left = yield* mergeSort(items.slice(0, mid), before);
        const right = yield* mergeSort(items.slice(mid), before);
        const out: unknown[] = [];
        let i = 0;
        let j = 0;
        while (i < left.length && j < right.length) {
          const rightFirst = yield* booleanResult(
            "array/sort",
            `${show(right[j])}, ${show(left[i])}`,
            yield* call(before, right[j], left[i])
          );
          if (rightFirst) {
            out.push(right[j]);
            j += 1;
          } else {
            out.push(left[i]);
            i += 1;
          }
        }
        while (i < left.length) {
          out.push(left[i]);
          i += 1;
        }
        while (j < right.length) {
          out.push(right[j]);
          j += 1;
        }
        return out;
      });

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

  /**
   * The item at `index` (negative counts from the end, as `array/slice`
   * counts). For an index outside the list, gives the optional third argument,
   * or fails with `IndexOutOfBoundsError`, as `object/get` does for a missing
   * key.
   */
  at: overEffect(
    [List, Schema.Int, Schema.Any],
    (...args) => {
      const [list, index, fallback] = args;
      const resolved = index < 0 ? list.length + index : index;
      if (resolved >= 0 && resolved < list.length) {
        return Effect.succeed(list[resolved]);
      }
      return (args as readonly unknown[]).length >= 3
        ? Effect.succeed(fallback)
        : Effect.fail(
            new IndexOutOfBoundsError({ index, length: list.length })
          );
    },
    2
  ),

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
    list.some((each) => sameValue(each, item))
  ),

  /** The first index of an equal item in the list, or -1 if none matches. */
  indexOf: over([List, Schema.Any], (list, item) =>
    list.findIndex((each) => sameValue(each, item))
  ),

  /**
   * The first item for which the function gives true, stopping early. When no
   * item matches, gives the optional third argument, or fails.
   */
  find: overEffect(
    [List, Schema.Any, Schema.Any],
    (...args) => {
      const [list, fn, fallback] = args;
      const hasFallback = (args as readonly unknown[]).length >= 3;
      return Effect.gen(function* () {
        for (const item of list) {
          if (
            yield* booleanResult(
              "array/find",
              show(item),
              yield* call(fn, item)
            )
          ) {
            return item;
          }
        }
        return hasFallback
          ? fallback
          : yield* logicError("array/find found no matching item.");
      });
    },
    2
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

  /** The items for which the function gives true, in order. */
  filter: overEffect([List, Schema.Any], (list, fn) =>
    Effect.gen(function* () {
      const kept: unknown[] = [];
      for (const item of list) {
        if (
          yield* booleanResult(
            "array/filter",
            show(item),
            yield* call(fn, item)
          )
        ) {
          kept.push(item);
        }
      }
      return kept;
    })
  ),

  /** A new list with the items in reverse order. */
  reverse: over([List], (list): unknown[] => [...list].reverse()),

  /**
   * A new list sorted in ascending value order, or stably by `before`, a
   * function of two items that gives true when the first comes before the
   * second, as Racket's `sort` takes.
   */
  sort: overEffect(
    [List, Schema.Any],
    (list, before) =>
      before === undefined
        ? Effect.succeed([...list].sort(compareValues))
        : mergeSort(list, before),
    1
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

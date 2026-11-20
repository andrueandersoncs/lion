/**
 * A set of tuples keeps its tuples in the order they were added, finds them
 * through indexes, and takes a logged change back. The model is a plain list
 * without duplicates: adding appends, and removing takes a tuple out. After
 * any steps the set must hold what the list holds, in its order, through
 * every index. And undoing logged steps must leave the set as it was before
 * them, however the steps before, the lookups between them, and the steps
 * after used it. A lookup of every value a tuple holds finds it by its key,
 * so a set of tuples of one width answers it without an index.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary } from "effect";
import { type Change, type Tuple, TupleSet, undo } from "@/logic/model";
import { valueKey } from "@/logic/terms";
import { element, oneOf } from "./programs";

// Few values, so tuples are added again, removed again, and share buckets.
const VALUES = [0, 1, 2];

/**
 * Mostly two values, and now and then three: a lookup of both columns of a
 * set of pairs reads a tuple by its key, and of a set that holds wider
 * tuples too, reads part of one through an index.
 */
const tuple = oneOf<Tuple>(
  Arbitrary.all([element(VALUES), element(VALUES)]),
  Arbitrary.all([element(VALUES), element(VALUES)]),
  Arbitrary.all([element(VALUES), element(VALUES), element(VALUES)])
);

const POSITIONS = [[0], [1], [0, 1]] as const;

type Step =
  | { readonly kind: "add" | "delete"; readonly tuple: Tuple }
  | { readonly kind: "lookup"; readonly positions: readonly number[] }
  | { readonly kind: "tidy" };

const change = Arbitrary.map(
  Arbitrary.all([element(["add", "delete"] as const), tuple]),
  ([kind, row]): Step => ({ kind, tuple: row })
);

const lookup = Arbitrary.map(
  element(POSITIONS),
  (positions): Step => ({ kind: "lookup", positions })
);

/** Mostly changes, with a lookup now and then to build an index midway. */
const step = oneOf(change, change, change, lookup);

const steps = Arbitrary.array(step, { maxLength: 60 });

/**
 * How many times a tuple is added and removed again before the steps: past
 * 64 times, the gaps it leaves are enough for the set to tidy itself.
 */
const churn = Arbitrary.map(element([0, 10, 64, 80, 200]), (times) =>
  Array.from({ length: times }, (_, at): Step[] => [
    { kind: "add", tuple: [VALUES[at % 3] as number, 9] },
    { kind: "delete", tuple: [VALUES[at % 3] as number, 9] },
  ]).flat()
);

/** Makes a step on the set and on the list that models it. */
const take = (set: TupleSet, model: Tuple[], each: Step, log?: Change[]) => {
  if (each.kind === "tidy") {
    set.tidy();
    return;
  }
  if (each.kind === "lookup") {
    set.lookup(
      each.positions,
      each.positions.map(() => 0)
    );
    return;
  }
  const key = valueKey(each.tuple);
  const at = model.findIndex((row) => valueKey(row) === key);
  if (each.kind === "add") {
    expect(set.add(each.tuple, log)).toBe(at < 0);
    if (at < 0) {
      model.push(each.tuple);
    }
    return;
  }
  expect(set.delete(each.tuple, log)).toBe(at >= 0);
  if (at >= 0) {
    model.splice(at, 1);
  }
};

/** Checks the set against the list: its tuples, and every lookup. */
const expectSame = (set: TupleSet, model: readonly Tuple[]) => {
  expect([...set.values()]).toEqual(model);
  expect(set.size).toBe(model.length);
  for (const positions of POSITIONS) {
    for (const first of VALUES) {
      for (const second of VALUES) {
        const values = positions.length === 1 ? [first] : [first, second];
        expect([...set.lookup(positions, values)]).toEqual(
          model.filter((row) =>
            positions.every((position, at) => row[position] === values[at])
          )
        );
      }
    }
  }
  for (const first of VALUES) {
    for (const second of VALUES) {
      expect(set.has([first, second])).toBe(
        model.some((row) => valueKey(row) === valueKey([first, second]))
      );
    }
  }
};

describe("a set of tuples", () => {
  it.prop(
    "holds what a list without duplicates holds, in the order added",
    { all: steps, first: steps, gaps: churn },
    ({ all, first, gaps }) => {
      const set = new TupleSet();
      const model: Tuple[] = [];
      // Tidying must change nothing a reader can see.
      for (const each of [
        ...first,
        ...gaps,
        { kind: "tidy" } as const,
        ...all,
      ]) {
        take(set, model, each);
      }
      expectSame(set, model);
      expectSame(set.clone(), model);
    },
    { arbitrary: { runs: 300 } }
  );

  it.prop(
    "is as it was once a logged change is undone",
    { after: steps, before: steps, gaps: churn, logged: steps },
    ({ after, before, gaps, logged }) => {
      const set = new TupleSet();
      const model: Tuple[] = [];
      for (const each of [...before, ...gaps, { kind: "tidy" } as const]) {
        take(set, model, each);
      }
      const kept = [...model];
      const log: Change[] = [];
      for (const each of logged) {
        take(set, model, each, log);
      }
      undo(log);
      expectSame(set, kept);
      // The set goes on working as the list does.
      for (const each of after) {
        take(set, kept, each);
      }
      expectSame(set, kept);
    },
    { arbitrary: { runs: 300 } }
  );
});

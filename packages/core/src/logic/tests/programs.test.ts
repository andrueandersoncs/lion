/**
 * `attempt` reports what a program gives as data that tests compare, so a
 * test can only be as sure as the report is faithful: every program gets
 * one, whatever its value, and two programs get the same one only when their
 * values are the same. A value holds data and functions, at any depth.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect } from "effect";
import { LogicDatabase } from "@/logic/database";
import { attempt, element, oneOf } from "./programs";
import { keyOf } from "./shapes";

const SETUP: readonly unknown[] = [
  ["relation", "even", ["n"]],
  ["schema", "Small", ["lambda", ["n"], ["number/lessThan", "n", 3]]],
];

/**
 * Expressions with different values: data, and functions of each kind a
 * program can make, declarations among them. A function is reported by its
 * name when it has one, which reads like the string of that name, so no
 * string here is a name.
 */
const LEAVES: readonly unknown[] = [
  1,
  2,
  true,
  ["quote", null],
  ["quote", "a"],
  "number/add",
  "number/subtract",
  "even",
  "Small",
  ["relation", "odd", ["n"]],
  ["schema", "Big", ["lambda", ["n"], ["number/greaterThan", "n", 3]]],
  ["lambda", ["n"], "n"],
  ["lambda", ["n"], ["number/add", "n", 1]],
  ["func/partial", "number/add", 1],
];

/** A value as a description: a leaf, a list, or a record of values. */
type Value =
  | { readonly leaf: number }
  | { readonly items: readonly Value[] }
  | { readonly fields: readonly (readonly [string, Value])[] };

const indexes = <A>(items: readonly A[]) => items.map((_, at) => at);

const leaf = Arbitrary.map(
  element(indexes(LEAVES)),
  (at): Value => ({ leaf: at })
);

const value = (depth: number): Arbitrary.Arbitrary<Value> => {
  if (depth === 0) {
    return leaf;
  }
  const inner = value(depth - 1);
  const items = Arbitrary.map(
    Arbitrary.array(inner, { maxLength: 3 }),
    (parts): Value => ({ items: parts })
  );
  const fields = Arbitrary.map(
    Arbitrary.array(Arbitrary.all([element(["a", "b"]), inner]), {
      maxLength: 3,
    }),
    (parts): Value => ({ fields: parts })
  );
  // Mostly data that holds values, where a function is easiest to lose.
  return oneOf<Value>(leaf, items, items, fields, fields);
};

/** The expression that makes the value a description describes. */
const expression = (given: Value): unknown => {
  if ("leaf" in given) {
    return LEAVES[given.leaf];
  }
  if ("items" in given) {
    return ["array/make", ...given.items.map(expression)];
  }
  return Object.fromEntries(
    given.fields.map(([key, item]) => [key, expression(item)])
  );
};

/** The model: equal values have equal descriptions, with leaves as indexes. */
const modelKey = (given: Value): string => {
  const plain = (part: Value): unknown => {
    if ("leaf" in part) {
      return `#${part.leaf}`;
    }
    if ("items" in part) {
      return part.items.map(plain);
    }
    return Object.fromEntries(
      part.fields.map(([key, item]) => [key, plain(item)])
    );
  };
  return keyOf(plain(given));
};

const leavesIn = (given: Value): number =>
  "leaf" in given
    ? 1
    : ("items" in given ? given.items : given.fields.map(([, item]) => item))
        .map(leavesIn)
        .reduce((sum, count) => sum + count, 0);

/** The value with its leaf at `at`, in reading order, made `to`. */
const replaced = (given: Value, at: number, to: number): Value => {
  let seen = 0;
  const walk = (part: Value): Value => {
    if ("leaf" in part) {
      seen += 1;
      return seen - 1 === at ? { leaf: to } : part;
    }
    if ("items" in part) {
      return { items: part.items.map(walk) };
    }
    return {
      fields: part.fields.map(([key, item]) => [key, walk(item)] as const),
    };
  };
  return walk(given);
};

/** Where a leaf is, counted in reading order and wrapped around. */
const POSITIONS = Array.from({ length: 8 }, (_, at) => at);

/** Two values: the same, one leaf apart, or any two. */
const pairs = Arbitrary.flatMap(value(2), (first) => {
  const count = leavesIn(first);
  const changed = Arbitrary.map(
    Arbitrary.all([element(POSITIONS), element(indexes(LEAVES))]),
    ([at, to]) => (count === 0 ? first : replaced(first, at % count, to))
  );
  return Arbitrary.map(
    oneOf<Value>(Arbitrary.Constant(first), changed, changed, value(2)),
    (second) => [first, second] as const
  );
});

const report = (given: Value) =>
  Effect.map(
    attempt(["begin", ...SETUP, expression(given)], new LogicDatabase()),
    (outcome) => {
      expect(outcome).toMatchObject({ ok: true });
      return outcome.ok ? keyOf(outcome.value) : "";
    }
  );

describe("attempt", () => {
  it.effect.prop(
    "reports two programs the same only when their values are the same",
    { pair: pairs },
    ({ pair: [first, second] }) =>
      Effect.gen(function* () {
        expect((yield* report(first)) === (yield* report(second))).toBe(
          modelKey(first) === modelKey(second)
        );
      }),
    { arbitrary: { runs: 300 } }
  );
});

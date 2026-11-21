/**
 * Reading JSON text: each number exactly as its digits write it. The model
 * writes the text itself, from a tree of values whose integers are kept as
 * their digits, so it knows each integer it wrote.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Result, Schema } from "effect";
import { readJson } from "@/evaluation/reading";
import { oneOf } from "@/logic/tests/programs";
import { fromRational, ratio } from "@/numbers/exact";

/** A value written as JSON text, with each integer kept as its digits. */
type Tree =
  | { readonly integer: bigint }
  | { readonly number: number }
  | { readonly text: string }
  | { readonly list: readonly Tree[] }
  | { readonly record: readonly (readonly [string, Tree])[] };

const SAFE = 2n ** 53n - 1n;

/** Integers on both sides of where JSON stops holding every one. */
const integer = Arbitrary.map(
  Arbitrary.all([
    Arbitrary.schema(
      Schema.Int.check(Schema.isBetween({ minimum: -3, maximum: 3 }))
    ),
    Arbitrary.schema(
      Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 4 }))
    ),
    Arbitrary.schema(Schema.Boolean),
  ]),
  ([offset, power, negative]): Tree => {
    const base = [0n, 100n, SAFE, 2n ** 60n, 10n ** 20n][power] as bigint;
    const value = base + BigInt(offset);
    return { integer: negative ? -value : value };
  }
);

/** Text that holds digits, which is never a number. */
const text = Arbitrary.map(
  Arbitrary.schema(Schema.String.check(Schema.isPattern(/^[0-9a" -]{0,6}$/))),
  (value): Tree => ({ text: value })
);

const number = Arbitrary.map(
  Arbitrary.schema(Schema.Number.check(Schema.isFinite())),
  (value): Tree => ({ number: value })
);

const tree = (depth: number): Arbitrary.Arbitrary<Tree> => {
  const leaf = oneOf(integer, integer, text, number);
  return depth === 0
    ? leaf
    : oneOf(
        leaf,
        Arbitrary.map(
          Arbitrary.array(tree(depth - 1), { maxLength: 3 }),
          (list): Tree => ({ list })
        ),
        Arbitrary.map(
          Arbitrary.array(Arbitrary.all([text, tree(depth - 1)]), {
            maxLength: 3,
          }),
          (entries): Tree => ({
            record: entries.map(([key, value]) => [
              (key as { text: string }).text,
              value,
            ]),
          })
        )
      );
};

/** The JSON text of a tree, its integers written digit for digit. */
const written = (value: Tree): string => {
  if ("integer" in value) {
    return value.integer.toString();
  }
  if ("number" in value || "text" in value) {
    return JSON.stringify("number" in value ? value.number : value.text);
  }
  if ("list" in value) {
    return `[${value.list.map(written).join(",")}]`;
  }
  return `{${value.record.map(([key, part]) => `${JSON.stringify(key)}:${written(part)}`).join(",")}}`;
};

/**
 * The value a tree's text writes: each integer exactly, however large, in
 * Lion's one form for it, and each other number as the double that wrote it.
 */
const valueIn = (value: Tree): unknown => {
  if ("integer" in value) {
    return fromRational(ratio(value.integer));
  }
  if ("number" in value) {
    // JSON writes -0 as 0.
    return value.number + 0;
  }
  if ("text" in value) {
    return value.text;
  }
  if ("list" in value) {
    return value.list.map(valueIn);
  }
  return Object.fromEntries(
    value.record.map(([key, part]) => [key, valueIn(part)])
  );
};

describe("reading JSON text", () => {
  it.effect.prop(
    "gives each number exactly as its digits write it, an integer past 2^53 among them",
    { value: tree(2) },
    ({ value }) =>
      Effect.gen(function* () {
        const result = yield* Effect.result(readJson(written(value)));
        expect(result).toStrictEqual(Result.succeed(valueIn(value)));
      }),
    { arbitrary: { runs: 300 } }
  );
});

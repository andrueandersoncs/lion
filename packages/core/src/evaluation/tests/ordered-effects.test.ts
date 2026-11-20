/**
 * `set!` where the engine chooses the order. A rule, query, or find runs
 * its parts when and as often as the engine chooses, so a `set!` there of a
 * binding made outside it is refused, while plain code changes it once for
 * each call. A binding the call made for itself, such as a helper's own
 * counter, it changes wherever it runs, and gives what plain code gives.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { element } from "@/logic/tests/programs";
import { stdlib } from "@/modules";

/** A helper that numbers what it is called on, with a counter outside it. */
const COUNTED = [
  "lambda",
  ["x"],
  ["begin", ["set!", "calls", ["number/add", "calls", 1]], "calls"],
];

/** A helper with a counter of its own, which gives x + 1. */
const OWN = [
  "lambda",
  ["x"],
  [
    "begin",
    ["define", "steps", 0],
    ["set!", "steps", ["number/add", "x", 1]],
    "steps",
  ],
];

/** Where the helper is called on each item. */
const PLACES: Record<string, (items: readonly number[]) => unknown> = {
  "plain code": (items) => ["array/map", ["array/make", ...items], "helper"],
  "rule body": (items) => [
    "begin",
    ["relation", "item", ["x"]],
    ["relation", "numbered", ["x", "n"]],
    ["rule", ["numbered", "?x", ["helper", "?x"]], ["item", "?x"]],
    ["fact", ...items.map((x) => ["item", x])],
    ["find", "?n", ["numbered", "?_", "?n"]],
  ],
  query: (items) => [
    "array/map",
    [
      "query",
      [
        "and",
        ["in", "?x", ["array/make", ...items]],
        ["=", "?n", ["helper", "?x"]],
      ],
    ],
    ["lambda", ["answer"], ["object/get", "answer", ["quote", "n"]]],
  ],
  find: (items) => [
    "find",
    ["helper", "?x"],
    ["in", "?x", ["array/make", ...items]],
  ],
};

/** The value or the message a program gives. */
const outcome = (program: unknown) =>
  run(program, stdlib).pipe(
    Effect.map((value) => ({ value })),
    Effect.catch((error) =>
      Effect.succeed({ message: String((error as Error).message) })
    )
  );

/** Distinct items, so every place gives one answer for each. */
const items = Arbitrary.map(
  Arbitrary.array(
    Arbitrary.schema(
      Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 9 }))
    ),
    { minLength: 1, maxLength: 4 }
  ),
  (values) => [...new Set(values)]
);

describe("set! where the engine chooses the order", () => {
  it.effect.prop(
    "is refused for a binding made outside, and gives what plain code gives for the call's own",
    {
      items,
      place: element(Object.keys(PLACES)),
      own: Arbitrary.schema(Schema.Boolean),
    },
    ({ items, place, own }) =>
      Effect.gen(function* () {
        const program = [
          "begin",
          ["define", "calls", 0],
          ["define", "helper", own ? OWN : COUNTED],
          (PLACES[place] as (items: readonly number[]) => unknown)(items),
        ];
        const result = yield* outcome(program);
        if (own) {
          const sorted = (values: unknown) =>
            [...(values as number[])].sort((a, b) => a - b);
          expect(result).toHaveProperty("value");
          expect(sorted((result as { value: unknown }).value)).toEqual(
            items.map((x) => x + 1).sort((a, b) => a - b)
          );
        } else if (place === "plain code") {
          expect(result).toEqual({ value: items.map((_, at) => at + 1) });
        } else {
          expect(result).toHaveProperty("message");
          expect((result as { message: string }).message).toContain(
            'set! cannot change "calls" while a rule, query, or find runs'
          );
        }
      })
  );
});

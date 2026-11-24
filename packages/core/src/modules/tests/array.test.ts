import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { module as array } from "../array.ts";
import { stdlib } from "../index.ts";

describe("array", () => {
  it("should return the head of an array", () => {
    expect(Effect.runSync(array.head([12, 34, 56]))).toEqual(12);
  });
  it("should return the tail of an array", () => {
    expect(Effect.runSync(array.tail([12, 34, 56]))).toEqual([34, 56]);
  });
  it("should return the length of an array", () => {
    expect(Effect.runSync(array.length([12, 34, 56]))).toEqual(3);
  });
  it.effect("should return the concat of twon arrays", () =>
    Effect.gen(function* () {
      const result = yield* run(
        ["array/concat", ["array/make", 12, 34, 56], ["array/make", 78, 90]],
        stdlib
      );
      expect(result).toEqual([12, 34, 56, 78, 90]);
    })
  );
  describe("map", () => {
    it("should map an array", () => {
      expect(
        Effect.runSync(
          array.map([12, 34, 56], (x: number) => Effect.succeed(x * 2))
        )
      ).toEqual([24, 68, 112]);
    });
    it.effect("should map an array (via run())", () =>
      Effect.gen(function* () {
        const result = yield* run(
          [
            "array/map",
            ["array/make", 12, 34, 56],
            ["lambda", ["x"], ["number/multiply", "x", 2]],
          ],
          stdlib
        );
        expect(result).toEqual([24, 68, 112]);
      })
    );
  });
  describe("reduce", () => {
    it("should reduce an array", () => {
      expect(
        Effect.runSync(
          array.reduce([1, 2, 3, 4], 0, (acc: number, x: number) =>
            Effect.succeed(acc + x)
          )
        )
      ).toEqual(10);
    });
    it.effect("should reduce an array (via run())", () =>
      Effect.gen(function* () {
        const result = yield* run(
          [
            "array/reduce",
            ["array/make", 1, 2, 3, 4],
            0,
            ["lambda", ["acc", "x"], ["number/add", "acc", "x"]],
          ],
          stdlib
        );
        expect(result).toEqual(10);
      })
    );
  });
});

describe("array/reductions", () => {
  const list = Arbitrary.schema(
    Schema.Array(
      Schema.Int.check(Schema.isBetween({ minimum: -50, maximum: 50 }))
    )
  );
  it.effect.prop(
    "gives every value array/reduce passes through: the k-th is the first k items reduced, and the last is array/reduce's",
    { items: list, initial: list },
    ({ initial, items }) =>
      Effect.gen(function* () {
        // A step that keeps the order of what it saw, so any other order shows.
        const step = [
          "lambda",
          ["seen", "x"],
          ["array/concat", "seen", ["array/make", "x"]],
        ];
        const states = yield* run(
          ["array/reductions", ["quote", items], ["quote", initial], step],
          stdlib
        );
        expect(states).toEqual(
          Array.from({ length: items.length + 1 }, (_, k) => [
            ...initial,
            ...items.slice(0, k),
          ])
        );
        const reduced = yield* run(
          ["array/reduce", ["quote", items], ["quote", initial], step],
          stdlib
        );
        expect((states as unknown[]).at(-1)).toEqual(reduced);
      })
  );
});

describe("array/some? and array/every?", () => {
  const items = Arbitrary.schema(
    Schema.Array(
      Schema.Int.check(Schema.isBetween({ minimum: -5, maximum: 5 }))
    )
  );
  const above = Arbitrary.schema(
    Schema.Int.check(Schema.isBetween({ minimum: -5, maximum: 5 }))
  );
  it.effect.prop(
    "say whether the function is true for some item, and for each, asking no further than the first item that settles it",
    { items, above },
    ({ above, items }) =>
      Effect.gen(function* () {
        const test = ["lambda", ["x"], ["number/greaterThan", "x", above]];
        const some = yield* run(
          ["array/some?", ["quote", items], test],
          stdlib
        );
        const every = yield* run(
          ["array/every?", ["quote", items], test],
          stdlib
        );
        expect(some).toBe(items.some((x) => x > above));
        expect(every).toBe(items.every((x) => x > above));
        // An item after the one that settles it would fail, and is not asked.
        const failing = [
          "lambda",
          ["x"],
          [
            "cond",
            [
              ["number/equals?", "x", 99],
              ["number/add", "x", "not a number"],
            ],
            ["else", ["number/greaterThan", "x", above]],
          ],
        ];
        const settled = (stop: boolean) => {
          const at = items.findIndex((x) => x > above === stop);
          return at === -1 ? undefined : [...items.slice(0, at + 1), 99];
        };
        const someList = settled(true);
        if (someList !== undefined) {
          expect(
            yield* run(["array/some?", ["quote", someList], failing], stdlib)
          ).toBe(true);
        }
        const everyList = settled(false);
        if (everyList !== undefined) {
          expect(
            yield* run(["array/every?", ["quote", everyList], failing], stdlib)
          ).toBe(false);
        }
      })
  );

  it.effect.prop(
    "fail when the function gives anything but true or false, as a condition does",
    {
      items: Arbitrary.array(Arbitrary.schema(Schema.Int), { minLength: 1 }),
    },
    ({ items }) =>
      Effect.gen(function* () {
        for (const name of ["array/some?", "array/every?"]) {
          const outcome = yield* Effect.exit(
            run([name, ["quote", items], ["lambda", ["x"], "x"]], stdlib)
          );
          expect(outcome._tag).toBe("Failure");
        }
      })
  );
});

const zipItem = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: -9, maximum: 9 }))
);

describe("array/zip", () => {
  it.effect.prop(
    "pairs up the items of its lists up to the end of the shortest, and the pairs give the lists back",
    {
      lists: Arbitrary.array(Arbitrary.array(zipItem, { maxLength: 4 }), {
        minLength: 1,
        maxLength: 4,
      }),
    },
    ({ lists }) =>
      Effect.gen(function* () {
        const shortest = Math.min(...lists.map((list) => list.length));
        const zipped = yield* run(
          ["array/zip", ...lists.map((list) => ["quote", list])],
          stdlib
        );
        // The model: the items at each place, from every list, in order.
        expect(zipped).toEqual(
          Array.from({ length: shortest }, (_, at) =>
            lists.map((list) => list[at])
          )
        );
        // Each list, cut to the shortest, is the items at its place in the pairs.
        for (const [which, list] of lists.entries()) {
          const back = yield* run(
            [
              "array/map",
              ["quote", zipped],
              [
                "lambda",
                ["pair"],
                ["array/head", ["array/slice", "pair", which]],
              ],
            ],
            stdlib
          );
          expect(back).toEqual(list.slice(0, shortest));
        }
      })
  );

  it.effect.prop(
    "waits in a find for the lists a rule binds, and gives what plain code gives",
    {
      a: Arbitrary.array(zipItem, { maxLength: 4 }),
      b: Arbitrary.array(zipItem, { maxLength: 4 }),
    },
    ({ a, b }) =>
      Effect.gen(function* () {
        const plain = yield* run(
          ["array/zip", ["quote", a], ["quote", b]],
          stdlib
        );
        const found = yield* run(
          [
            "find",
            ["array/zip", "?a", "?b"],
            ["and", ["=", "?a", ["quote", a]], ["=", "?b", ["quote", b]]],
          ],
          stdlib
        );
        expect(found).toEqual([plain]);
      })
  );
});

describe("array/filter, array/reverse, and array/sort", () => {
  const nums = Arbitrary.array(zipItem, { maxLength: 8 });
  const threshold = zipItem;

  it.effect.prop(
    "array/filter keeps matching items in order, rejects non-boolean predicates, and works in logic and the solver",
    { items: nums, above: threshold },
    ({ above, items }) =>
      Effect.gen(function* () {
        const pred = ["lambda", ["x"], ["number/greaterThan", "x", above]];
        const expected = items.filter((x) => x > above);
        expect(
          yield* run(["array/filter", ["quote", items], pred], stdlib)
        ).toEqual(expected);
        // Works waiting in find.
        expect(
          yield* run(
            [
              "find",
              ["array/filter", "?xs", pred],
              ["=", "?xs", ["quote", items]],
            ],
            stdlib
          )
        ).toEqual([expected]);
        // Non-boolean predicate fails cleanly when list is non-empty.
        if (items.length > 0) {
          const failed = yield* Effect.exit(
            run(
              ["array/filter", ["quote", items], ["lambda", ["x"], "x"]],
              stdlib
            )
          );
          expect(failed._tag).toBe("Failure");
        }
        // Symbolic proof: every element of array/filter(xs, x > above) is > above.
        const proved = yield* run(
          [
            "query",
            [
              "not",
              [
                "exists",
                ["?xs", "?kept"],
                [
                  "and",
                  [
                    "schema/fits?",
                    "?xs",
                    ["schema/arrayOf", "value/integer?", 3],
                  ],
                  ["=", "?kept", ["array/filter", "?xs", pred]],
                  ["not", ["array/every?", "?kept", pred]],
                ],
              ],
            ],
          ],
          stdlib
        );
        expect(proved).toEqual([{}]);
      })
  );

  it.effect.prop(
    "array/reverse reverses a list without mutating it, is its own inverse, and works in the solver",
    { items: nums },
    ({ items }) =>
      Effect.gen(function* () {
        const copy = [...items];
        const reversed = yield* run(
          ["array/reverse", ["quote", items]],
          stdlib
        );
        expect(reversed).toEqual([...items].reverse());
        expect(items).toEqual(copy);
        // Involution proved symbolically over all bounded integer lists.
        const proved = yield* run(
          [
            "query",
            [
              "not",
              [
                "exists",
                ["?xs"],
                [
                  "and",
                  [
                    "schema/fits?",
                    "?xs",
                    ["schema/arrayOf", "value/integer?", 3],
                  ],
                  [
                    "not",
                    ["=", ["array/reverse", ["array/reverse", "?xs"]], "?xs"],
                  ],
                ],
              ],
            ],
          ],
          stdlib
        );
        expect(proved).toEqual([{}]);
      })
  );

  it.effect.prop(
    "array/sort sorts ascending by default and stably by a boolean comparator, without mutating, and works in the solver",
    {
      items: nums,
      pairs: Arbitrary.array(
        Arbitrary.all([
          Arbitrary.schema(
            Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 }))
          ),
          zipItem,
        ]),
        { maxLength: 8 }
      ),
    },
    ({ items, pairs }) =>
      Effect.gen(function* () {
        const sorted = yield* run(["array/sort", ["quote", items]], stdlib);
        expect(sorted).toEqual([...items].sort((a, b) => a - b));
        // Descending with number/greaterThan comparator.
        const desc = yield* run(
          ["array/sort", ["quote", items], "number/greaterThan"],
          stdlib
        );
        expect(desc).toEqual([...items].sort((a, b) => b - a));
        // Stability: records with equal keys keep their original order.
        const tagged = pairs.map(([key, val], index) => ({ index, key, val }));
        const byKey = (yield* run(
          [
            "array/sort",
            ["quote", tagged],
            [
              "lambda",
              ["a", "b"],
              [
                "number/lessThan",
                ["object/get", "a", "key"],
                ["object/get", "b", "key"],
              ],
            ],
          ],
          stdlib
        )) as { readonly index: number; readonly key: number }[];
        for (let at = 1; at < byKey.length; at += 1) {
          const prev = byKey[at - 1] as { index: number; key: number };
          const curr = byKey[at] as { index: number; key: number };
          expect(prev.key).toBeLessThanOrEqual(curr.key);
          if (prev.key === curr.key) {
            expect(prev.index).toBeLessThan(curr.index);
          }
        }
        // Non-boolean comparator fails cleanly when list has at least 2 items.
        if (items.length >= 2) {
          const failed = yield* Effect.exit(
            run(
              [
                "array/sort",
                ["quote", items],
                ["lambda", ["a", "b"], ["number/subtract", "a", "b"]],
              ],
              stdlib
            )
          );
          expect(failed._tag).toBe("Failure");
        }
      })
  );

  it.effect.prop(
    "array/sort is proved to preserve length and order symbolically for bounded integer lists",
    {
      descending: Arbitrary.schema(Schema.Boolean),
    },
    ({ descending }) =>
      Effect.gen(function* () {
        const op = descending ? "number/greaterThan" : "number/lessThan";
        const okOp = descending
          ? "number/greaterThanOrEqualTo"
          : "number/lessThanOrEqualTo";
        const callSort = descending
          ? ["array/sort", "?xs", op]
          : ["array/sort", "?xs"];
        const proved = yield* run(
          [
            "begin",
            [
              "define",
              "ordered?",
              [
                "lambda",
                ["xs"],
                [
                  "cond",
                  [["number/lessThan", ["array/length", "xs"], 2], true],
                  [
                    "else",
                    [
                      "and",
                      [
                        okOp,
                        ["array/head", "xs"],
                        ["array/head", ["array/tail", "xs"]],
                      ],
                      ["ordered?", ["array/tail", "xs"]],
                    ],
                  ],
                ],
              ],
            ],
            [
              "query",
              [
                "not",
                [
                  "exists",
                  ["?xs", "?out"],
                  [
                    "and",
                    [
                      "schema/fits?",
                      "?xs",
                      ["schema/arrayOf", "value/integer?", 4],
                    ],
                    ["=", "?out", callSort],
                    [
                      "not",
                      [
                        "and",
                        [
                          "=",
                          ["array/length", "?out"],
                          ["array/length", "?xs"],
                        ],
                        ["ordered?", "?out"],
                      ],
                    ],
                  ],
                ],
              ],
            ],
          ],
          stdlib
        );
        expect(proved).toEqual([{}]);
      }),
    { arbitrary: { runs: 4 } }
  );
});

describe("array/at, array/indexOf, and array/find", () => {
  const item = Arbitrary.schema(
    Schema.Union([
      Schema.Int.check(Schema.isBetween({ minimum: -5, maximum: 5 })),
      Schema.Null,
    ])
  );
  const items = Arbitrary.array(item, { maxLength: 6 });
  const idx = Arbitrary.schema(
    Schema.Int.check(Schema.isBetween({ minimum: -8, maximum: 8 }))
  );

  it.effect.prop(
    "array/at indexes forward and backward, uses optional fallback, and fails with IndexOutOfBoundsError without one",
    { list: items, index: idx, fallback: item },
    ({ fallback, index, list }) =>
      Effect.gen(function* () {
        const resolved = index < 0 ? list.length + index : index;
        const inBounds = resolved >= 0 && resolved < list.length;
        const withFallback = yield* run(
          ["array/at", ["quote", list], index, ["quote", fallback]],
          stdlib
        );
        expect(withFallback).toEqual(inBounds ? list[resolved] : fallback);
        const withoutFallback = yield* Effect.exit(
          run(["array/at", ["quote", list], index], stdlib)
        );
        if (inBounds) {
          expect(withoutFallback._tag).toBe("Success");
          if (withoutFallback._tag === "Success") {
            expect(withoutFallback.value).toEqual(list[resolved]);
          }
        } else {
          expect(withoutFallback._tag).toBe("Failure");
          expect(String(withoutFallback)).toContain("IndexOutOfBoundsError");
        }
        // Waiting on logic variables gives the same result as plain code.
        expect(
          yield* run(
            [
              "find",
              ["array/at", "?xs", "?i", ["quote", fallback]],
              ["and", ["=", "?xs", ["quote", list]], ["=", "?i", index]],
            ],
            stdlib
          )
        ).toEqual([withFallback]);
      })
  );

  it.effect.prop(
    "array/indexOf finds the first structurally equal item (including lists and records) or -1",
    {
      pairs: Arbitrary.array(Arbitrary.all([zipItem, zipItem]), {
        maxLength: 6,
      }),
      target: Arbitrary.all([zipItem, zipItem]),
    },
    ({ pairs, target }) =>
      Effect.gen(function* () {
        const expected = pairs.findIndex(
          ([a, b]) => a === target[0] && b === target[1]
        );
        expect(
          yield* run(
            ["array/indexOf", ["quote", pairs], ["quote", target]],
            stdlib
          )
        ).toBe(expected);
        const records = pairs.map(([a, b]) => ({ a, b }));
        const reversedTarget = { b: target[1], a: target[0] };
        expect(
          yield* run(
            ["array/indexOf", ["quote", records], ["quote", reversedTarget]],
            stdlib
          )
        ).toBe(expected);
      })
  );

  it.effect.prop(
    "array/find returns the first matching item, stops early, respects optional fallback, and rejects non-boolean predicates",
    {
      list: Arbitrary.array(zipItem, { maxLength: 7 }),
      limit: zipItem,
      fallback: zipItem,
    },
    ({ fallback, limit, list }) =>
      Effect.gen(function* () {
        const pred = ["lambda", ["v"], ["number/greaterThan", "v", limit]];
        const expected = list.find((v) => v > limit);
        const withFallback = yield* run(
          ["array/find", ["quote", list], pred, fallback],
          stdlib
        );
        expect(withFallback).toBe(expected === undefined ? fallback : expected);
        const withoutFallback = yield* Effect.exit(
          run(["array/find", ["quote", list], pred], stdlib)
        );
        if (expected === undefined) {
          expect(withoutFallback._tag).toBe("Failure");
        } else {
          expect(withoutFallback._tag).toBe("Success");
          if (withoutFallback._tag === "Success") {
            expect(withoutFallback.value).toBe(expected);
          }
        }
        // Stops early: counts calls up to and including the first match.
        const calls = (yield* run(
          [
            "begin",
            ["define", "seen", 0],
            [
              "array/find",
              ["quote", list],
              [
                "lambda",
                ["v"],
                [
                  "begin",
                  ["set!", "seen", ["number/add", "seen", 1]],
                  ["number/greaterThan", "v", limit],
                ],
              ],
              null,
            ],
            "seen",
          ],
          stdlib
        )) as number;
        const firstIdx = list.findIndex((v) => v > limit);
        expect(calls).toBe(firstIdx < 0 ? list.length : firstIdx + 1);
      })
  );
});

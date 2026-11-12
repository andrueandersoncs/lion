import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";

const orders = [
  ["relation", "order", ["id", "customer", "amount"]],
  [
    "fact",
    ["order", 1, "ana", 30],
    ["order", 2, "ana", 20],
    ["order", 3, "bo", 50],
    ["order", 4, "bo", 50],
    ["order", 5, "cy", 5],
  ],
];

const program = (...expressions: unknown[]) => [
  "begin",
  ...orders,
  ...expressions,
];

const logicError = (expression: unknown) =>
  run(expression, stdlib).pipe(
    Effect.flip,
    Effect.map((error) => String((error as { message?: unknown }).message))
  );

describe("aggregates in rule heads", () => {
  it.effect("group by the other head columns", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        program(
          ["relation", "spend", ["customer", "total", "orders"]],
          [
            "rule",
            [
              "spend",
              "?c",
              ["aggregate/sum", "?amount"],
              ["aggregate/count", "?id"],
            ],
            ["order", "?id", "?c", "?amount"],
          ],
          ["query", ["spend", "?customer", "?total", "?orders"]]
        ),
        stdlib
      );
      expect(rows).toEqual([
        { customer: "ana", total: 50, orders: 2 },
        { customer: "bo", total: 100, orders: 2 },
        { customer: "cy", total: 5, orders: 1 },
      ]);
    })
  );

  it.effect("count every match, not every distinct value", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        program(
          ["relation", "amounts", ["customer", "all", "distinct", "listed"]],
          [
            "rule",
            [
              "amounts",
              "?c",
              ["aggregate/count", "?amount"],
              ["aggregate/countUnique", "?amount"],
              ["aggregate/unique", "?amount"],
            ],
            ["order", "?_", "?c", "?amount"],
          ],
          ["query", ["amounts", "bo", "?all", "?distinct", "?listed"]]
        ),
        stdlib
      );
      expect(rows).toEqual([{ all: 2, distinct: 1, listed: [50] }]);
    })
  );

  it.effect("aggregate the whole body when every head column aggregates", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        program(
          ["relation", "stats", ["low", "high", "mean", "amounts"]],
          [
            "rule",
            [
              "stats",
              ["aggregate/min", "?a"],
              ["aggregate/max", "?a"],
              ["aggregate/mean", "?a"],
              ["aggregate/collect", "?a"],
            ],
            ["order", "?_", "?_", "?a"],
          ],
          ["query", ["stats", "?low", "?high", "?mean", "?amounts"]]
        ),
        stdlib
      );
      expect(rows).toEqual([
        { low: 5, high: 50, mean: 31, amounts: [5, 20, 30, 50, 50] },
      ]);
    })
  );

  it.effect("aggregate computed values", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        program(
          ["relation", "taxed", ["customer", "total"]],
          [
            "rule",
            [
              "taxed",
              "?c",
              ["aggregate/sum", ["number/multiply", "?amount", 2]],
            ],
            ["order", "?_", "?c", "?amount"],
          ],
          ["query", ["taxed", "ana", "?total"]]
        ),
        stdlib
      );
      expect(rows).toEqual([{ total: 100 }]);
    })
  );

  it.effect("count a match found by several alternatives once", () =>
    Effect.gen(function* () {
      const tally = (...alternatives: unknown[]) =>
        run(
          program(
            ["relation", "tally", ["n"]],
            [
              "rule",
              ["tally", ["aggregate/count", "?id"]],
              ["or", ...alternatives],
            ],
            ["query", ["tally", "?n"]]
          ),
          stdlib
        );
      expect(
        yield* tally(["order", "?id", "bo", 50], ["order", "?id", "?_", 50])
      ).toEqual([{ n: 4 }]);
      expect(
        yield* tally(["order", "?id", "bo", 50], ["order", "?id", "bo", "?_"])
      ).toEqual([{ n: 4 }]);
      expect(
        yield* tally(["order", "?id", "bo", 50], ["order", "?id", "bo", 50])
      ).toEqual([{ n: 2 }]);
    })
  );

  it.effect("add up separate rules for the same relation", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        program(
          ["relation", "refund", ["customer", "amount"]],
          ["relation", "moved", ["customer", "amount"]],
          ["fact", ["refund", "ana", 30]],
          [
            "rule",
            ["moved", "?c", ["aggregate/sum", "?a"]],
            ["order", "?_", "?c", "?a"],
          ],
          [
            "rule",
            ["moved", "?c", ["aggregate/sum", "?a"]],
            ["refund", "?c", "?a"],
          ],
          ["query", ["moved", "ana", "?total"]]
        ),
        stdlib
      );
      expect(rows).toEqual([{ total: 80 }]);
    })
  );

  it.effect("feed other rules and negation", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        program(
          ["relation", "spend", ["customer", "total"]],
          ["relation", "vip", ["customer"]],
          ["relation", "regular", ["customer"]],
          [
            "rule",
            ["spend", "?c", ["aggregate/sum", "?a"]],
            ["order", "?_", "?c", "?a"],
          ],
          [
            "rule",
            ["vip", "?c"],
            ["spend", "?c", "?t"],
            ["number/greaterThan", "?t", 40],
          ],
          [
            "rule",
            ["regular", "?c"],
            ["order", "?_", "?c", "?_"],
            ["not", ["vip", "?c"]],
          ],
          ["query", ["regular", "?who"]]
        ),
        stdlib
      );
      expect(rows).toEqual([{ who: "cy" }]);
    })
  );

  it.effect("explain an aggregated fact with every match it combines", () =>
    Effect.gen(function* () {
      const explanation = yield* run(
        program(
          ["relation", "spend", ["customer", "total"]],
          [
            "rule",
            ["spend", "?c", ["aggregate/sum", "?a"]],
            ["order", "?_", "?c", "?a"],
          ],
          ["why", ["spend", "ana", 50]]
        ),
        stdlib
      );
      expect(explanation).toEqual({
        fact: ["spend", "ana", 50],
        rule: [
          "rule",
          ["spend", "?c", ["aggregate/sum", "?a"]],
          ["order", "?_", "?c", "?a"],
        ],
        matches: [
          [{ fact: ["order", 1, "ana", 30], given: true }],
          [{ fact: ["order", 2, "ana", 20], given: true }],
        ],
      });
    })
  );

  it.effect("explain min and max with the match that won", () =>
    Effect.gen(function* () {
      const explanation = yield* run(
        program(
          ["relation", "smallest", ["amount"]],
          [
            "rule",
            ["smallest", ["aggregate/min", "?a"]],
            ["order", "?_", "?_", "?a"],
          ],
          ["why", ["smallest", 5]]
        ),
        stdlib
      );
      expect(explanation).toMatchObject({
        fact: ["smallest", 5],
        because: [{ fact: ["order", 5, "cy", 5], given: true }],
      });
    })
  );

  it.effect("produce no group when nothing matches", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        program(
          ["relation", "huge", ["n"]],
          [
            "rule",
            ["huge", ["aggregate/count", "?id"]],
            ["order", "?id", "?_", "?a"],
            ["number/greaterThan", "?a", 1000],
          ],
          ["query", ["huge", "?n"]]
        ),
        stdlib
      );
      expect(rows).toEqual([]);
    })
  );
});

describe("aggregate checks", () => {
  it.effect("reject aggregation through recursion", () =>
    Effect.gen(function* () {
      const message = yield* logicError([
        "begin",
        ["relation", "edge", ["from", "to"]],
        ["relation", "hops", ["node", "n"]],
        [
          "rule",
          ["hops", "?x", ["aggregate/count", "?y"]],
          ["edge", "?x", "?y"],
        ],
        [
          "rule",
          ["hops", "?y", ["aggregate/count", "?n"]],
          ["hops", "?x", "?n"],
          ["edge", "?x", "?y"],
        ],
      ]);
      expect(message).toContain('aggregates with aggregate/count over "hops"');
      expect(message).toContain("can go through recursion");
    })
  );

  it.effect("require every rule for a relation to aggregate the same way", () =>
    Effect.gen(function* () {
      const message = yield* logicError(
        program(
          ["relation", "spend", ["customer", "total"]],
          [
            "rule",
            ["spend", "?c", ["aggregate/sum", "?a"]],
            ["order", "?_", "?c", "?a"],
          ],
          ["rule", ["spend", "?c", "?a"], ["order", "?_", "?c", "?a"]]
        )
      );
      expect(message).toContain("must aggregate the same columns");
    })
  );

  it.effect("keep facts and aggregate rules apart", () =>
    Effect.gen(function* () {
      const factsFirst = yield* logicError(
        program(
          ["relation", "spend", ["customer", "total"]],
          ["fact", ["spend", "dee", 1]],
          [
            "rule",
            ["spend", "?c", ["aggregate/sum", "?a"]],
            ["order", "?_", "?c", "?a"],
          ]
        )
      );
      expect(factsFirst).toContain("cannot aggregate into it");
      const rulesFirst = yield* logicError(
        program(
          ["relation", "spend", ["customer", "total"]],
          [
            "rule",
            ["spend", "?c", ["aggregate/sum", "?a"]],
            ["order", "?_", "?c", "?a"],
          ],
          ["fact", ["spend", "dee", 1]]
        )
      );
      expect(rulesFirst).toContain("cannot have facts");
    })
  );

  it.effect("report values an aggregate cannot combine", () =>
    Effect.gen(function* () {
      const message = yield* logicError(
        program(
          ["relation", "total", ["n"]],
          [
            "rule",
            ["total", ["aggregate/sum", "?c"]],
            ["order", "?_", "?c", "?_"],
          ],
          ["query", ["total", "?n"]]
        )
      );
      expect(message).toContain(
        'aggregate/sum expects numbers, but found "ana"'
      );
    })
  );
});

describe("aggregate functions on lists", () => {
  it.effect("combine a list right away", () =>
    Effect.gen(function* () {
      const list = ["array/make", 3, 1, 2, 3];
      expect(yield* run(["aggregate/sum", list], stdlib)).toBe(9);
      expect(yield* run(["aggregate/count", list], stdlib)).toBe(4);
      expect(yield* run(["aggregate/countUnique", list], stdlib)).toBe(3);
      expect(yield* run(["aggregate/mean", list], stdlib)).toBe(2.25);
      expect(yield* run(["aggregate/min", list], stdlib)).toBe(1);
      expect(yield* run(["aggregate/max", list], stdlib)).toBe(3);
      expect(yield* run(["aggregate/collect", list], stdlib)).toEqual([
        1, 2, 3, 3,
      ]);
      expect(yield* run(["aggregate/unique", list], stdlib)).toEqual([1, 2, 3]);
      expect(
        yield* run(["aggregate/min", ["array/make", "b", "a"]], stdlib)
      ).toBe("a");
      expect(yield* run(["aggregate/min", ["array/make"]], stdlib)).toBeNull();
      expect(yield* run(["aggregate/sum", ["array/make"]], stdlib)).toBe(0);
    })
  );

  it.effect("reject values they cannot combine", () =>
    Effect.gen(function* () {
      const message = yield* logicError([
        "aggregate/max",
        ["array/make", 1, "a"],
      ]);
      expect(message).toContain("expects all numbers or all strings");
    })
  );
});

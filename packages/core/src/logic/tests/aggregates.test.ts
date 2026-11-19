import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";
import { element, nearestSum } from "./programs";

const int = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

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

/** Orders of two customers, with few amounts, so that several tie. */
const someOrders = Arbitrary.map(
  Arbitrary.array(Arbitrary.all([element(["ana", "bo"]), element([1, 2, 3])]), {
    minLength: 1,
    maxLength: 8,
  }),
  (rows) => rows.map(([customer, amount], at) => [at + 1, customer, amount])
);

const RULES = [
  ["relation", "order", ["id", "customer", "amount"]],
  ["relation", "spend", ["customer", "total"]],
  ["relation", "least", ["customer", "amount"]],
  ["relation", "most", ["customer", "amount"]],
  [
    "rule",
    ["spend", "?c", ["aggregate/sum", "?a"]],
    ["order", "?_", "?c", "?a"],
  ],
  [
    "rule",
    ["least", "?c", ["aggregate/min", "?a"]],
    ["order", "?_", "?c", "?a"],
  ],
  [
    "rule",
    ["most", "?c", ["aggregate/max", "?a"]],
    ["order", "?_", "?c", "?a"],
  ],
];

const given = (row: unknown) => ({
  fact: ["order", ...(row as unknown[])],
  given: true,
});

describe("why on an aggregated row", () => {
  it.effect.prop(
    "tells the matches in the order of their answers, and the least that gives a minimum or maximum, whatever order the facts came in",
    { rows: someOrders, reversed: element([false, true]) },
    ({ reversed, rows }) =>
      Effect.gen(function* () {
        const facts = reversed ? [...rows].reverse() : rows;
        for (const customer of ["ana", "bo"]) {
          // The body binds the id first, so its answers go by id.
          const own = rows.filter((row) => row[1] === customer);
          if (own.length === 0) {
            continue;
          }
          const amounts = own.map((row) => row[2] as number);
          const total = amounts.reduce((sum, amount) => sum + amount, 0);
          const why = (fact: unknown[]) =>
            run(
              [
                "begin",
                ...RULES,
                ["fact", ...facts.map((row) => ["order", ...row])],
                ["why", fact],
              ],
              stdlib
            );
          expect(yield* why(["spend", customer, total])).toMatchObject({
            matches: own.map((row) => [given(row)]),
          });
          for (const [relation, value] of [
            ["least", Math.min(...amounts)],
            ["most", Math.max(...amounts)],
          ] as const) {
            const first = own.find((row) => row[2] === value);
            expect(yield* why([relation, customer, value])).toMatchObject({
              because: [given(first)],
            });
          }
        }
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

  it.effect("require the rules that aggregate into a relation to agree", () =>
    Effect.gen(function* () {
      const message = yield* logicError(
        program(
          ["relation", "spend", ["customer", "total"]],
          [
            "rule",
            ["spend", "?c", ["aggregate/sum", "?a"]],
            ["order", "?_", "?c", "?a"],
          ],
          [
            "rule",
            ["spend", "?c", ["aggregate/max", "?a"]],
            ["order", "?_", "?c", "?a"],
          ]
        )
      );
      expect(message).toContain("must aggregate the same columns");
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

/** Numbers whose sums round, cancel, and carry: fractions and big steps. */
const number = Arbitrary.map(
  Arbitrary.all([
    int(-50, 50),
    int(1, 9),
    Arbitrary.schema(Schema.Literals([1, 1e-8, 1e8, 1e16])),
  ]),
  ([top, bottom, scale]) => (top / bottom) * scale
);

describe("aggregate/sum", () => {
  it.effect.prop(
    "is the number nearest the exact sum of its values, so the order they come in never changes it, in a list, a rule, or a merge",
    { values: Arbitrary.array(number, { maxLength: 8 }), turn: int(0, 7) },
    ({ turn, values }) =>
      Effect.gen(function* () {
        const total = (yield* run(
          ["aggregate/sum", ["quote", values]],
          stdlib
        )) as number;
        expect(total).toBe(nearestSum(values));
        // Facts come in another order, as candidates of a merge or as the
        // matches of a rule: the total is the same.
        const at = values.length === 0 ? 0 : turn % values.length;
        const turned = [...values.slice(at), ...values.slice(0, at)];
        const facts = turned.map((value, id) => ["amount", id, value]);
        const rows = yield* run(
          [
            "begin",
            ["relation", "amount", ["id", "value"]],
            ["relation", "total", ["all", "sum"]],
            [
              "relation",
              "merged",
              ["all", "sum"],
              { key: "all", merge: { sum: "aggregate/sum" } },
            ],
            ...(facts.length === 0 ? [] : [["fact", ...facts]]),
            [
              "rule",
              ["total", "all", ["aggregate/sum", "?v"]],
              ["amount", "?id", "?v"],
            ],
            ["rule", ["merged", "all", "?v"], ["amount", "?id", "?v"]],
            [
              "array/make",
              ["find", "?s", ["total", "all", "?s"]],
              ["find", "?s", ["merged", "all", "?s"]],
            ],
          ],
          stdlib
        );
        expect(rows).toEqual(
          values.length === 0 ? [[], []] : [[total], [total]]
        );
      })
  );
});

describe("aggregate/sum near the largest number", () => {
  it.effect.prop(
    "is the exact sum where adding in order would pass the largest number, and fails only where the exact sum does",
    {
      big: Arbitrary.array(element([1e308, 1.5e308, 1.7e308]), {
        minLength: 2,
        maxLength: 3,
      }),
      kept: Arbitrary.array(Arbitrary.schema(Schema.Boolean), {
        minLength: 3,
        maxLength: 3,
      }),
      rest: int(-1000, 1000),
    },
    ({ big, kept, rest }) =>
      Effect.gen(function* () {
        // The large numbers first, so their running sum passes the largest
        // number, then the negations of all but those kept.
        const values = [
          ...big,
          ...big.filter((_, at) => !kept[at]).map((value) => -value),
          rest,
        ];
        const exact = nearestSum(values);
        const outcome = yield* Effect.result(
          run(["aggregate/sum", ["quote", values]], stdlib)
        );
        if (Number.isFinite(exact)) {
          expect(outcome).toMatchObject({ success: exact });
        } else {
          expect(outcome._tag).toBe("Failure");
        }
      })
  );
});

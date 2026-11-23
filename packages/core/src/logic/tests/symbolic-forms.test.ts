/**
 * Full Lion expressions inside lambdas run symbolically in the solver:
 * `=`, `and`, `or`, `not`, `in`, `begin` with local `define`, `match`,
 * `schema/fits?`, `array/slice`, `array/zip`, and recursive functions over
 * bounded lists. Every answer agrees with listing the box or plain code.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { LogicDatabase } from "@/logic/database";
import { attempt, element, type Outcome } from "./programs";
import { keyOf } from "./shapes";

const OPTIONS = { timeout: 120_000, arbitrary: { runs: 100 } };

const int = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

const evaluate = (form: unknown) => attempt(form, new LogicDatabase());

const resultOf = (outcome: Outcome) => {
  expect(outcome).toMatchObject({ ok: true });
  return outcome.ok ? outcome.value : undefined;
};

const keys = (values: unknown) =>
  [...new Set((values as unknown[]).map(keyOf))].sort();

const BOX = 3;
const RANGE = Array.from({ length: 2 * BOX + 1 }, (_, at) => at - BOX);

const INSERT_DEF = [
  "define",
  "insert",
  [
    "lambda",
    ["x", "sorted"],
    [
      "cond",
      [
        ["=", "sorted", ["quote", []]],
        ["array/make", "x"],
      ],
      [
        ["number/lessThanOrEqualTo", "x", ["array/head", "sorted"]],
        ["array/concat", ["array/make", "x"], "sorted"],
      ],
      [
        "else",
        [
          "array/concat",
          ["array/make", ["array/head", "sorted"]],
          ["insert", "x", ["array/tail", "sorted"]],
        ],
      ],
    ],
  ],
];

const INSERTION_SORT_DEF = [
  "define",
  "insertion-sort",
  [
    "lambda",
    ["xs"],
    [
      "array/reduce",
      "xs",
      ["quote", []],
      ["lambda", ["done", "x"], ["insert", "x", "done"]],
    ],
  ],
];

const MERGE_DEF = [
  "define",
  "merge",
  [
    "lambda",
    ["a", "b"],
    [
      "cond",
      [["=", "a", ["quote", []]], "b"],
      [["=", "b", ["quote", []]], "a"],
      [
        ["number/lessThanOrEqualTo", ["array/head", "a"], ["array/head", "b"]],
        [
          "array/concat",
          ["array/make", ["array/head", "a"]],
          ["merge", ["array/tail", "a"], "b"],
        ],
      ],
      [
        "else",
        [
          "array/concat",
          ["array/make", ["array/head", "b"]],
          ["merge", "a", ["array/tail", "b"]],
        ],
      ],
    ],
  ],
];

const MERGE_SORT_DEF = [
  "define",
  "merge-sort",
  [
    "lambda",
    ["xs"],
    [
      "cond",
      [["number/lessThan", ["array/length", "xs"], 2], "xs"],
      [
        "else",
        [
          "begin",
          [
            "define",
            "half",
            ["number/floor", ["number/divide", ["array/length", "xs"], 2]],
          ],
          [
            "merge",
            ["merge-sort", ["array/slice", "xs", 0, "half"]],
            ["merge-sort", ["array/slice", "xs", "half"]],
          ],
        ],
      ],
    ],
  ],
];

const SORTED_DEF = [
  "define",
  "sorted?",
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
            "number/lessThanOrEqualTo",
            ["array/head", "xs"],
            ["array/head", ["array/tail", "xs"]],
          ],
          ["sorted?", ["array/tail", "xs"]],
        ],
      ],
    ],
  ],
];

describe("solver: full Lion expressions and recursive functions", () => {
  it.effect.prop(
    "evaluates =, and, or, not, in, begin/define, match, and schema/fits? inside lambdas, agreeing with listing",
    {
      k: int(-3, 3),
      threshold: int(-2, 2),
      pick: int(0, 3),
    },
    ({ k, pick, threshold }) =>
      Effect.gen(function* () {
        const helpers: unknown[] = [
          // =, and, or, not inside a lambda
          [
            "lambda",
            ["x", "y"],
            [
              "and",
              ["or", ["=", "x", "y"], ["number/greaterThan", "x", threshold]],
              ["not", ["=", "y", k]],
            ],
          ],
          // begin + local define + in inside a lambda
          [
            "lambda",
            ["x", "y"],
            [
              "begin",
              ["define", "sum", ["number/add", "x", "y"]],
              ["in", "sum", ["array/make", k, threshold, 0]],
            ],
          ],
          // match inside a lambda
          [
            "lambda",
            ["x", "y"],
            [
              "=",
              [
                "match",
                "x",
                [k, ["lambda", ["v"], ["number/add", "v", 1]]],
                [
                  ["lambda", ["v"], ["number/greaterThan", "v", threshold]],
                  ["lambda", ["v"], "y"],
                ],
                ["lambda", ["v"], 0],
              ],
              "y",
            ],
          ],
          // schema/fits? inside a lambda
          [
            "lambda",
            ["x", "y"],
            [
              "and",
              ["schema/fits?", "x", ["schema/anyOf", k, threshold]],
              ["number/lessThanOrEqualTo", "x", "y"],
            ],
          ],
        ];
        const fn = helpers[pick];
        const ask = (typing: (v: string) => unknown[]) => [
          "begin",
          ["define", "check", fn],
          [
            "find",
            ["array/make", "?x", "?y"],
            ["and", ...typing("?x"), ...typing("?y"), ["check", "?x", "?y"]],
          ],
        ];
        const bySolver = yield* evaluate(
          ask((v) => [
            ["schema/fits?", v, "value/integer?"],
            ["number/greaterThanOrEqualTo", v, -BOX],
            ["number/lessThanOrEqualTo", v, BOX],
          ])
        );
        const byListing = yield* evaluate(
          ask((v) => [["schema/fits?", v, ["schema/anyOf", ...RANGE]]])
        );
        expect(keys(resultOf(bySolver))).toEqual(keys(resultOf(byListing)));

        // Also check unbounded universal tautology (cannot fall back to box listing!).
        const unbounded = yield* evaluate([
          "begin",
          ["define", "check", fn],
          [
            "query",
            [
              "not",
              [
                "exists",
                ["?x", "?y"],
                [
                  "and",
                  ["schema/fits?", "?x", "value/integer?"],
                  ["schema/fits?", "?y", "value/integer?"],
                  ["check", "?x", "?y"],
                  ["not", ["check", "?x", "?y"]],
                ],
              ],
            ],
          ],
        ]);
        expect(resultOf(unbounded)).toEqual([{}]);
      }),
    OPTIONS
  );

  it.effect.prop(
    "proves recursive insertion-sort and merge-sort correct for every bounded list of arbitrary whole numbers, and refutes broken sorts",
    {
      algo: element(["insertion-sort", "merge-sort"]),
      most: int(0, 4),
      bugAt: int(2, 5),
    },
    ({ algo, bugAt, most }) =>
      Effect.gen(function* () {
        const proves = (sortExpr: unknown) => [
          "begin",
          INSERT_DEF,
          INSERTION_SORT_DEF,
          MERGE_DEF,
          MERGE_SORT_DEF,
          SORTED_DEF,
          ["define", "sort", sortExpr],
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
                    ["schema/arrayOf", "value/integer?", most],
                  ],
                  ["=", "?out", ["sort", "?xs"]],
                  [
                    "not",
                    [
                      "and",
                      ["=", ["array/length", "?out"], ["array/length", "?xs"]],
                      ["sorted?", "?out"],
                    ],
                  ],
                ],
              ],
            ],
          ],
        ];
        // The real sort is always proved correct.
        expect(resultOf(yield* evaluate(proves(algo)))).toEqual([{}]);

        // A sort that returns xs unchanged at length === bugAt fails iff bugAt <= most.
        const buggy = [
          "lambda",
          ["xs"],
          [
            "cond",
            [["number/equals?", ["array/length", "xs"], bugAt], "xs"],
            ["else", [algo, "xs"]],
          ],
        ];
        const buggyResult = resultOf(
          yield* evaluate(proves(buggy))
        ) as unknown[];
        expect(buggyResult.length).toBe(bugAt <= most ? 0 : 1);
      }),
    { timeout: 120_000, arbitrary: { runs: 25 } }
  );

  it.effect.prop(
    "evaluates array/slice and array/zip symbolically, agreeing with listing",
    {
      start: int(-3, 3),
      end: element([undefined, -1, 0, 1, 2, 3]),
    },
    ({ end, start }) =>
      Effect.gen(function* () {
        const sliceCall =
          end === undefined
            ? ["array/slice", "?xs", start]
            : ["array/slice", "?xs", start, end];
        const ask = (elemSchema: unknown) => [
          "find",
          ["array/make", "?xs", "?sliced", "?zipped"],
          [
            "and",
            ["schema/fits?", "?xs", ["schema/arrayOf", elemSchema, 2]],
            ["=", "?sliced", sliceCall],
            ["=", "?zipped", ["array/zip", "?xs", ["quote", ["a", "b"]]]],
          ],
        ];
        const bySolver = yield* evaluate(
          ask([
            "schema/allOf",
            "value/integer?",
            [
              "lambda",
              ["n"],
              [
                "and",
                ["number/greaterThanOrEqualTo", "n", -1],
                ["number/lessThanOrEqualTo", "n", 1],
              ],
            ],
          ])
        );
        const byListing = yield* evaluate(ask(["schema/anyOf", -1, 0, 1]));
        expect(keys(resultOf(bySolver))).toEqual(keys(resultOf(byListing)));
      }),
    OPTIONS
  );

  it.effect.prop(
    "evaluates a suspended lambda referencing a symbolic logic variable inside a goal",
    {
      delta: int(-5, 5),
      offset: int(-5, 5),
    },
    ({ delta, offset }) =>
      Effect.gen(function* () {
        const result = resultOf(
          yield* evaluate([
            "begin",
            [
              "define",
              "make-adder",
              [
                "lambda",
                ["k"],
                [
                  "cond",
                  [
                    ["number/greaterThanOrEqualTo", "k", 0],
                    ["lambda", ["v"], ["number/add", "v", "k"]],
                  ],
                  ["else", ["lambda", ["v"], ["number/add", "v", "k"]]],
                ],
              ],
            ],
            [
              "query",
              [
                "not",
                [
                  "exists",
                  ["?x"],
                  [
                    "and",
                    ["schema/fits?", "?x", "value/integer?"],
                    [
                      "not",
                      [
                        "=",
                        [["make-adder", "?x"], offset],
                        ["number/add", "?x", delta],
                      ],
                    ],
                  ],
                ],
              ],
            ],
          ])
        ) as unknown[];
        expect(result.length).toBe(offset === delta ? 1 : 0);
      }),
    OPTIONS
  );
});

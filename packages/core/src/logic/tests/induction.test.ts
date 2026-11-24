/**
 * Property-based tests for structural induction, list induction, numeric
 * induction, polynomial cancellation, and the CIC guard condition.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { type Certificate, checks } from "@/logic/certificate";
import { LogicDatabase } from "@/logic/database";
import { attempt } from "./programs";

const OPTIONS = { timeout: 120_000 };

const int = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

describe("structural and numeric induction", () => {
  it.effect.prop(
    "proves or disproves bounds on recursive binary trees by structural induction",
    {
      bound: int(-2, 4),
      lo: int(1, 5),
    },
    ({ bound, lo }) =>
      Effect.gen(function* () {
        const outcome = yield* attempt(
          [
            "begin",
            [
              "schema",
              "LeafVal",
              [
                "schema/allOf",
                "value/integer?",
                ["lambda", ["n"], ["number/greaterThanOrEqualTo", "n", lo]],
              ],
            ],
            [
              "schema",
              "Tree",
              [
                "schema/anyOf",
                { leaf: "LeafVal" },
                { left: "Tree", node: "LeafVal", right: "Tree" },
              ],
            ],
            [
              "define",
              "tree-sum",
              [
                "lambda",
                ["t"],
                [
                  "cond",
                  [
                    ["object/has?", "t", "leaf"],
                    ["object/get", "t", "leaf"],
                  ],
                  [
                    "else",
                    [
                      "number/add",
                      ["object/get", "t", "node"],
                      ["tree-sum", ["object/get", "t", "left"]],
                      ["tree-sum", ["object/get", "t", "right"]],
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
                  ["?t"],
                  [
                    "and",
                    ["schema/fits?", "?t", "Tree"],
                    ["number/lessThan", ["tree-sum", "?t"], bound],
                  ],
                ],
              ],
            ],
          ],
          new LogicDatabase()
        );
        // `tree-sum(t) >= bound` is false when bound > lo, self-inductive when
        // -lo <= bound <= lo (since lo + 2*bound >= bound), and true-but-not-
        // self-inductive when bound < -lo (where Lion must refuse, never lie).
        if (bound > lo) {
          expect(outcome).toEqual({ ok: true, value: [] });
        } else if (bound >= -lo) {
          expect(outcome).toEqual({ ok: true, value: [{}] });
        } else {
          expect(outcome.ok).toBe(false);
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "proves or disproves bounds on unbounded schema/arrayOf lists by list induction",
    {
      bound: int(-2, 3),
      lo: int(0, 4),
    },
    ({ bound, lo }) =>
      Effect.gen(function* () {
        const outcome = yield* attempt(
          [
            "begin",
            [
              "schema",
              "Elem",
              [
                "schema/allOf",
                "value/integer?",
                ["lambda", ["n"], ["number/greaterThanOrEqualTo", "n", lo]],
              ],
            ],
            [
              "define",
              "sum-list",
              [
                "lambda",
                ["xs"],
                [
                  "cond",
                  [["=", "xs", ["quote", []]], 0],
                  [
                    "else",
                    [
                      "number/add",
                      ["array/head", "xs"],
                      ["sum-list", ["array/tail", "xs"]],
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
                  ["?xs"],
                  [
                    "and",
                    ["schema/fits?", "?xs", ["schema/arrayOf", "Elem"]],
                    ["number/lessThan", ["sum-list", "?xs"], bound],
                  ],
                ],
              ],
            ],
          ],
          new LogicDatabase()
        );
        // Empty list sums to 0, non-empty elements are >= lo >= 0, so min sum is 0.
        expect(outcome).toEqual({
          ok: true,
          value: bound <= 0 ? [{}] : [],
        });
      }),
    OPTIONS
  );

  it.effect.prop(
    "proves linear closed forms and disproves mismatched formulas by numeric induction",
    {
      baseVal: int(-3, 3),
      claimedSlope: int(-3, 4),
      step: int(-3, 4),
    },
    ({ baseVal, claimedSlope, step }) =>
      Effect.gen(function* () {
        const outcome = yield* attempt(
          [
            "begin",
            [
              "define",
              "lin",
              [
                "lambda",
                ["n"],
                [
                  "cond",
                  [["number/lessThanOrEqualTo", "n", 0], baseVal],
                  [
                    "else",
                    ["number/add", step, ["lin", ["number/subtract", "n", 1]]],
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
                  ["?n"],
                  [
                    "and",
                    ["schema/fits?", "?n", "value/integer?"],
                    ["number/greaterThanOrEqualTo", "?n", 0],
                    [
                      "not",
                      [
                        "number/equals?",
                        ["lin", "?n"],
                        [
                          "number/add",
                          baseVal,
                          ["number/multiply", claimedSlope, "?n"],
                        ],
                      ],
                    ],
                  ],
                ],
              ],
            ],
          ],
          new LogicDatabase()
        );
        expect(outcome).toEqual({
          ok: true,
          value: claimedSlope === step ? [{}] : [],
        });
      }),
    { ...OPTIONS, arbitrary: { runs: 25 } }
  );

  it.effect.prop(
    "proves quadratic sum of odd numbers and disproves threshold counterfeits for arbitrary thresholds",
    {
      threshold: int(10, 1_000_000),
    },
    ({ threshold }) =>
      Effect.gen(function* () {
        const check = (f: unknown) =>
          attempt(
            [
              "begin",
              [
                "define",
                "sum-odd",
                [
                  "lambda",
                  ["n"],
                  [
                    "cond",
                    [["number/lessThanOrEqualTo", "n", 0], 0],
                    [
                      "else",
                      [
                        "number/add",
                        ["number/subtract", ["number/multiply", 2, "n"], 1],
                        ["sum-odd", ["number/subtract", "n", 1]],
                      ],
                    ],
                  ],
                ],
              ],
              ["define", "f", f],
              [
                "query",
                [
                  "not",
                  [
                    "exists",
                    ["?n"],
                    [
                      "and",
                      ["schema/fits?", "?n", "value/integer?"],
                      ["number/greaterThanOrEqualTo", "?n", 0],
                      [
                        "not",
                        ["number/equals?", ["sum-odd", "?n"], ["f", "?n"]],
                      ],
                    ],
                  ],
                ],
              ],
            ],
            new LogicDatabase()
          );
        expect(
          yield* check(["lambda", ["n"], ["number/multiply", "n", "n"]])
        ).toEqual({ ok: true, value: [{}] });
        expect(
          yield* check([
            "lambda",
            ["n"],
            [
              "cond",
              [
                ["number/lessThan", "n", threshold],
                ["number/multiply", "n", "n"],
              ],
              ["else", 0],
            ],
          ])
        ).toEqual({ ok: true, value: [] });
      }),
    { ...OPTIONS, arbitrary: { runs: 20 } }
  );

  it.effect.prop(
    "decides polynomial ring identities by cancelling matching nonlinear monomials",
    {
      c: int(-5, 5),
      delta: int(-2, 2),
    },
    ({ c, delta }) =>
      Effect.gen(function* () {
        // (x + c)^2 == x^2 + 2*c*x + c^2 + delta
        const outcome = yield* attempt(
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
                      "number/equals?",
                      [
                        "number/multiply",
                        ["number/add", "?x", c],
                        ["number/add", "?x", c],
                      ],
                      [
                        "number/add",
                        ["number/multiply", "?x", "?x"],
                        ["number/multiply", 2 * c, "?x"],
                        c * c + delta,
                      ],
                    ],
                  ],
                ],
              ],
            ],
          ],
          new LogicDatabase()
        );
        expect(outcome).toEqual({ ok: true, value: delta === 0 ? [{}] : [] });
      }),
    OPTIONS
  );

  it.effect.prop(
    "CIC guard refuses non-decreasing and base-skipping recursive functions",
    {
      step: int(0, 3),
    },
    ({ step }) =>
      Effect.gen(function* () {
        // f(n) = if n == 0 then 0 else 1 + f(n + step) — never decreases!
        const nonDecreasing = yield* attempt(
          [
            "begin",
            [
              "define",
              "bad",
              [
                "lambda",
                ["n"],
                [
                  "cond",
                  [["number/lessThan", "n", 0], 0],
                  [
                    "else",
                    ["number/add", 1, ["bad", ["number/add", "n", step]]],
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
                  ["?n"],
                  [
                    "and",
                    ["schema/fits?", "?n", "value/integer?"],
                    ["number/greaterThanOrEqualTo", "?n", 0],
                    ["number/lessThan", ["bad", "?n"], 0],
                  ],
                ],
              ],
            ],
          ],
          new LogicDatabase()
        );
        expect(nonDecreasing.ok).toBe(false);
        if (!nonDecreasing.ok) {
          expect(nonDecreasing.message).toContain("does not strictly decrease");
        }

        // f(n) = if n == 0 then 0 else 1 + f(n - 2) — skips past 0 on odd n!
        const skipsBase = yield* attempt(
          [
            "begin",
            [
              "define",
              "skip",
              [
                "lambda",
                ["n"],
                [
                  "cond",
                  [["number/equals?", "n", 0], 0],
                  [
                    "else",
                    ["number/add", 1, ["skip", ["number/subtract", "n", 2]]],
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
                  ["?n"],
                  [
                    "and",
                    ["schema/fits?", "?n", "value/integer?"],
                    ["number/greaterThanOrEqualTo", "?n", 0],
                    ["number/lessThan", ["skip", "?n"], 0],
                  ],
                ],
              ],
            ],
          ],
          new LogicDatabase()
        );
        expect(skipsBase.ok).toBe(false);
      }),
    { ...OPTIONS, arbitrary: { runs: 15 } }
  );

  it.effect.prop(
    "why reports a checkable induction proof with guards and case certificates",
    {
      lo: int(1, 5),
    },
    ({ lo }) =>
      Effect.gen(function* () {
        const outcome = yield* attempt(
          [
            "begin",
            [
              "schema",
              "Pos",
              [
                "schema/allOf",
                "value/integer?",
                ["lambda", ["n"], ["number/greaterThanOrEqualTo", "n", lo]],
              ],
            ],
            [
              "schema",
              "PosTree",
              [
                "schema/anyOf",
                { leaf: "Pos" },
                { left: "PosTree", node: "Pos", right: "PosTree" },
              ],
            ],
            [
              "define",
              "tree-sum",
              [
                "lambda",
                ["t"],
                [
                  "cond",
                  [
                    ["object/has?", "t", "leaf"],
                    ["object/get", "t", "leaf"],
                  ],
                  [
                    "else",
                    [
                      "number/add",
                      ["object/get", "t", "node"],
                      ["tree-sum", ["object/get", "t", "left"]],
                      ["tree-sum", ["object/get", "t", "right"]],
                    ],
                  ],
                ],
              ],
            ],
            ["relation", "ok-trees", ["ok"]],
            [
              "rule",
              ["ok-trees", true],
              [
                "not",
                [
                  "exists",
                  ["?t"],
                  [
                    "and",
                    ["schema/fits?", "?t", "PosTree"],
                    ["number/lessThan", ["tree-sum", "?t"], lo],
                  ],
                ],
              ],
            ],
            ["why", ["ok-trees", true]],
          ],
          new LogicDatabase()
        );
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) {
          return;
        }
        const why = outcome.value as {
          readonly because?: readonly {
            readonly induction?: {
              readonly basis: string;
              readonly cases: readonly {
                readonly case: string;
                readonly certificates?: readonly Certificate[];
              }[];
              readonly guards: readonly { readonly kind: string }[];
              readonly kind: string;
            };
          }[];
        };
        const ind = why.because?.[0]?.induction;
        expect(ind).toBeDefined();
        expect(ind?.kind).toBe("induction");
        expect(ind?.basis).toBe("schema");
        expect(ind?.guards[0]?.kind).toBe("structural");
        expect(ind?.cases.length).toBe(2);
        for (const c of ind?.cases ?? []) {
          expect(c.certificates).toBeDefined();
          for (const cert of c.certificates ?? []) {
            expect(checks(cert)).toBe(true);
          }
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "matches plain code when nonlinear products appear in array/sort, array/includes?, in, and schema/fits?",
    {
      hi: int(2, 4),
      target: int(0, 9),
    },
    ({ hi, target }) =>
      Effect.gen(function* () {
        const outcome = yield* attempt(
          [
            "begin",
            ["define", "sq", ["lambda", ["v"], ["number/multiply", "v", "v"]]],
            {
              fits: [
                "query",
                [
                  "and",
                  ["schema/fits?", "?x", "value/integer?"],
                  ["number/greaterThanOrEqualTo", "?x", 1],
                  ["number/lessThanOrEqualTo", "?x", hi],
                  ["=", "?v", ["schema/fits?", ["sq", "?x"], target]],
                ],
                { order: "x" },
              ],
              includes: [
                "query",
                [
                  "and",
                  ["schema/fits?", "?x", "value/integer?"],
                  ["number/greaterThanOrEqualTo", "?x", 1],
                  ["number/lessThanOrEqualTo", "?x", hi],
                  [
                    "=",
                    "?v",
                    [
                      "array/includes?",
                      ["array/make", target, target + 1],
                      ["sq", "?x"],
                    ],
                  ],
                ],
                { order: "x" },
              ],
              sorted: [
                "query",
                [
                  "and",
                  ["schema/fits?", "?x", "value/integer?"],
                  ["number/greaterThanOrEqualTo", "?x", 1],
                  ["number/lessThanOrEqualTo", "?x", hi],
                  [
                    "=",
                    "?v",
                    [
                      "array/sort",
                      [
                        "array/make",
                        ["sq", "?x"],
                        0,
                        ["number/add", ["sq", "?x"], 1],
                      ],
                    ],
                  ],
                ],
                { order: "x" },
              ],
            },
          ],
          new LogicDatabase()
        );
        const xs = Array.from({ length: hi }, (_, i) => i + 1);
        expect(outcome).toEqual({
          ok: true,
          value: {
            fits: xs.map((x) => ({ v: x * x === target, x })),
            includes: xs.map((x) => ({
              v: x * x === target || x * x === target + 1,
              x,
            })),
            sorted: xs.map((x) => ({ v: [0, x * x, x * x + 1], x })),
          },
        });
      }),
    OPTIONS
  );
});

import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";

const smallInt = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: -10, maximum: 10 }))
);
const posInt = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 8 }))
);
const bool = Arbitrary.schema(Schema.Boolean);

/** Universal proof: asking for a counterexample returns `[]`. */
const prove = (premise: unknown, claim: unknown) => [
  "query",
  ["and", premise, ["not", claim]],
];

describe("idiomatic Lion in the symbolic solver", () => {
  it.effect.prop(
    "reasons symbolically about object/set, remove, merge, keys, values, entries, fromEntries, and get-path",
    { delta: smallInt, k: posInt, start: smallInt },
    ({ delta, k, start }) =>
      Effect.gen(function* () {
        // Unbounded proof of a record state transition using object/set, object/merge,
        // object/remove, object/entries, object/fromEntries, object/keys, object/values, object/get-path.
        const proved = yield* run(
          [
            "begin",
            [
              "define",
              "step",
              [
                "lambda",
                ["state", "n"],
                [
                  "begin",
                  [
                    "define",
                    "updated",
                    [
                      "object/set",
                      "state",
                      "count",
                      ["number/add", ["object/get", "state", "count"], "n"],
                    ],
                  ],
                  [
                    "object/fromEntries",
                    [
                      "object/entries",
                      [
                        "object/remove",
                        [
                          "object/merge",
                          "updated",
                          { meta: { scale: k }, temp: 0 },
                        ],
                        "temp",
                      ],
                    ],
                  ],
                ],
              ],
            ],
            [
              "define",
              "okTransition?",
              [
                "lambda",
                ["s", "d"],
                [
                  "begin",
                  ["define", "next", ["step", "s", "d"]],
                  [
                    "and",
                    [
                      "=",
                      ["object/get", "next", "count"],
                      ["number/add", ["object/get", "s", "count"], "d"],
                    ],
                    ["=", ["object/get-path", "next", "meta.scale"], k],
                    ["not", ["object/has?", "next", "temp"]],
                    ["=", ["array/length", ["object/keys", "next"]], 3],
                    ["=", ["array/length", ["object/values", "next"]], 3],
                  ],
                ],
              ],
            ],
            [
              "define",
              "stateSchema",
              { count: "value/integer?", tag: ["schema/anyOf", "ok"] },
            ],
            prove(
              [
                "and",
                ["schema/fits?", "?s", "stateSchema"],
                ["schema/fits?", "?d", "value/integer?"],
              ],
              ["okTransition?", "?s", "?d"]
            ),
          ],
          stdlib
        );
        expect(proved).toEqual([]);

        // Solving for an unknown input through object/set + object/get-path matches plain arithmetic.
        const solved = yield* run(
          [
            "find",
            "?x",
            [
              "and",
              ["schema/fits?", "?x", "value/integer?"],
              [
                "=",
                [
                  "object/get-path",
                  [
                    "object/set",
                    { nested: { v: start } },
                    "nested",
                    { v: ["number/add", "?x", delta] },
                  ],
                  "nested.v",
                ],
                start,
              ],
            ],
          ],
          stdlib
        );
        expect(solved).toEqual([start - delta]);
      }),
    { arbitrary: { runs: 30 } }
  );

  it.effect.prop(
    "reasons symbolically about boolean/xor, nand, nor, equals?, value/identity, and value/* predicates",
    { a: bool, b: bool, n: smallInt },
    ({ a, b, n }) =>
      Effect.gen(function* () {
        // Prove boolean identities & value/* predicates universally over arbitrary integers.
        const proved = yield* run(
          [
            "begin",
            [
              "define",
              "checkLaws",
              [
                "lambda",
                ["x", "y"],
                [
                  "begin",
                  ["define", "p", ["number/greaterThan", "x", n]],
                  ["define", "q", ["number/greaterThan", "y", n]],
                  [
                    "and",
                    [
                      "boolean/equals?",
                      ["boolean/xor", "p", "q"],
                      ["not", ["boolean/equals?", "p", "q"]],
                    ],
                    [
                      "boolean/equals?",
                      ["boolean/nand", "p", "q"],
                      ["not", ["and", "p", "q"]],
                    ],
                    [
                      "boolean/equals?",
                      ["boolean/nor", "p", "q"],
                      ["not", ["or", "p", "q"]],
                    ],
                    ["=", ["value/identity", "x"], "x"],
                    ["value/integer?", "x"],
                    ["value/number?", "x"],
                    ["value/boolean?", "p"],
                    ["not", ["value/string?", "x"]],
                    ["not", ["value/null?", "x"]],
                    ["not", ["value/array?", "x"]],
                    ["not", ["value/object?", "x"]],
                    ["not", ["value/function?", "x"]],
                    ["value/any?", "x"],
                  ],
                ],
              ],
            ],
            prove(
              [
                "and",
                ["schema/fits?", "?x", "value/integer?"],
                ["schema/fits?", "?y", "value/integer?"],
              ],
              ["checkLaws", "?x", "?y"]
            ),
          ],
          stdlib
        );
        expect(proved).toEqual([]);

        // Agree with plain evaluation when solving boolean variables.
        const xorResult = yield* run(
          [
            "find",
            "?r",
            [
              "and",
              ["schema/fits?", "?r", "value/boolean?"],
              ["=", "?r", ["boolean/xor", a, b]],
            ],
          ],
          stdlib
        );
        expect(xorResult).toEqual([a !== b]);
      }),
    { arbitrary: { runs: 30 } }
  );

  it.effect.prop(
    "applies concrete and symbolic func/partial inside the solver as in plain code",
    {
      k: smallInt,
      xs: Arbitrary.schema(
        Schema.Array(
          Schema.Int.check(Schema.isBetween({ minimum: -8, maximum: 8 }))
        ).check(Schema.isMinLength(1), Schema.isMaxLength(4))
      ),
    },
    ({ k, xs }) =>
      Effect.gen(function* () {
        // Concrete pre-built func/partial AND symbolically constructed func/partial capturing ?t.
        const proved = yield* run(
          [
            "begin",
            ["define", "addK", ["func/partial", "number/add", k]],
            [
              "define",
              "shiftPair",
              [
                "lambda",
                ["x", "t"],
                [
                  "begin",
                  ["define", "addT", ["func/partial", "number/add", "t"]],
                  [
                    "=",
                    ["array/map", ["array/make", "x", ["addK", "x"]], "addT"],
                    [
                      "array/make",
                      ["number/add", "t", "x"],
                      ["number/add", "t", k, "x"],
                    ],
                  ],
                ],
              ],
            ],
            prove(
              [
                "and",
                ["schema/fits?", "?x", "value/integer?"],
                ["schema/fits?", "?t", "value/integer?"],
              ],
              ["shiftPair", "?x", "?t"]
            ),
          ],
          stdlib
        );
        expect(proved).toEqual([]);

        // Filtering with a symbolic partial agrees with plain code.
        const plain = yield* run(
          [
            "array/filter",
            ["quote", xs],
            ["func/partial", "number/lessThan", k],
          ],
          stdlib
        );
        const solved = yield* run(
          [
            "find",
            "?out",
            [
              "and",
              ["schema/fits?", "?k", "value/integer?"],
              ["=", "?k", k],
              [
                "=",
                "?out",
                [
                  "array/filter",
                  ["quote", xs],
                  ["func/partial", "number/lessThan", "?k"],
                ],
              ],
            ],
          ],
          stdlib
        );
        expect(solved).toEqual([plain]);
      }),
    { arbitrary: { runs: 30 } }
  );

  it.effect.prop(
    "proves guarded contracted lambdas and schema/assert safe, and refuses unguarded violations",
    { bound: posInt },
    ({ bound }) =>
      Effect.gen(function* () {
        const proved = yield* run(
          [
            "begin",
            [
              "define",
              "positive",
              ["lambda", ["v"], ["number/greaterThan", "v", 0]],
            ],
            [
              "define",
              "safeDouble",
              [
                "lambda",
                [["x", "positive"]],
                ["number/multiply", 2, ["schema/assert", "x", "positive"]],
              ],
            ],
            [
              "define",
              "guardedCond",
              [
                "lambda",
                ["x"],
                [
                  "cond",
                  [
                    ["number/greaterThan", "x", bound],
                    [
                      "number/greaterThan",
                      [
                        [
                          "lambda",
                          [
                            [
                              "y",
                              [
                                "lambda",
                                ["u"],
                                ["number/greaterThan", "u", bound],
                              ],
                            ],
                          ],
                          ["safeDouble", "y"],
                        ],
                        "x",
                      ],
                      ["number/multiply", 2, bound],
                    ],
                  ],
                  ["else", true],
                ],
              ],
            ],
            [
              "define",
              "guardedMatch",
              [
                "lambda",
                ["x"],
                [
                  "match",
                  "x",
                  [
                    "positive",
                    [
                      "lambda",
                      ["v"],
                      ["number/greaterThan", ["safeDouble", "v"], 0],
                    ],
                  ],
                  ["lambda", ["_"], true],
                ],
              ],
            ],
            [
              "array/make",
              // Guarded by outer query conjunction
              prove(
                [
                  "and",
                  ["schema/fits?", "?x", "value/integer?"],
                  ["number/greaterThan", "?x", 0],
                ],
                ["number/greaterThan", ["safeDouble", "?x"], 1]
              ),
              // Guarded by cond branch + inline contracted lambda
              prove(
                ["schema/fits?", "?x", "value/integer?"],
                ["guardedCond", "?x"]
              ),
              // Guarded by match arm
              prove(
                ["schema/fits?", "?x", "value/integer?"],
                ["guardedMatch", "?x"]
              ),
            ],
          ],
          stdlib
        );
        expect(proved).toEqual([[], [], []]);

        // Unguarded call that can violate the contract MUST be refused (not falsely proved even for a tautological body).
        const unguarded = yield* Effect.exit(
          run(
            [
              "begin",
              [
                "define",
                "positive",
                ["lambda", ["v"], ["number/greaterThan", "v", 0]],
              ],
              [
                "define",
                "safeDouble",
                ["lambda", [["x", "positive"]], ["number/multiply", 2, "x"]],
              ],
              prove(
                ["schema/fits?", "?x", "value/integer?"],
                [
                  "=",
                  ["number/add", ["safeDouble", "?x"], bound],
                  ["number/add", ["number/multiply", 2, "?x"], bound],
                ]
              ),
            ],
            stdlib
          )
        );
        expect(unguarded._tag).toBe("Failure");
      }),
    { arbitrary: { runs: 20 } }
  );

  it.effect.prop(
    "reasons symbolically about array/at (concrete and symbolic index), array/indexOf, array/find, and array/range",
    {
      a: smallInt,
      b: smallInt,
      c: smallInt,
      idx: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: -5, maximum: 5 }))
      ),
      target: smallInt,
    },
    ({ a, b, c, idx, target }) =>
      Effect.gen(function* () {
        const list = [a, b, c];
        // Symbolic index in array/at with fallback agrees with plain code.
        const plainAt = yield* run(
          ["array/at", ["quote", list], idx, -999],
          stdlib
        );
        const solvedAt = yield* run(
          [
            "find",
            "?v",
            [
              "and",
              ["schema/fits?", "?i", "value/integer?"],
              ["=", "?i", idx],
              ["=", "?v", ["array/at", ["quote", list], "?i", -999]],
            ],
          ],
          stdlib
        );
        expect(solvedAt).toEqual([plainAt]);

        // Unbounded proof: array/indexOf finds element at returned index, and array/find satisfies predicate.
        const proved = yield* run(
          [
            "begin",
            [
              "define",
              "checkArrayOps",
              [
                "lambda",
                ["x", "y", "z", "t"],
                [
                  "begin",
                  [
                    "define",
                    "xs",
                    ["array/make", ["number/add", "x", a], "y", "z"],
                  ],
                  ["define", "pos", ["array/indexOf", "xs", "t"]],
                  [
                    "define",
                    "found",
                    [
                      "array/find",
                      "xs",
                      ["lambda", ["v"], ["number/greaterThan", "v", "t"]],
                      "t",
                    ],
                  ],
                  [
                    "and",
                    [
                      "cond",
                      [
                        ["number/greaterThanOrEqualTo", "pos", 0],
                        ["=", ["array/at", "xs", "pos"], "t"],
                      ],
                      ["else", ["not", ["in", "t", "xs"]]],
                    ],
                    ["number/greaterThanOrEqualTo", "found", "t"],
                    ["=", ["array/at", "xs", -1], "z"],
                  ],
                ],
              ],
            ],
            prove(
              [
                "and",
                ["schema/fits?", "?x", "value/integer?"],
                ["schema/fits?", "?y", "value/integer?"],
                ["schema/fits?", "?z", "value/integer?"],
                ["schema/fits?", "?t", "value/integer?"],
              ],
              ["checkArrayOps", "?x", "?y", "?z", "?t"]
            ),
          ],
          stdlib
        );
        expect(proved).toEqual([]);

        // Symbolic array/range agrees with plain code.
        const hi = Math.abs(target % 5) + 1;
        const plainRange = yield* run(["array/range", 0, hi], stdlib);
        const solvedRange = yield* run(
          [
            "find",
            "?r",
            [
              "and",
              ["schema/fits?", "?n", "value/integer?"],
              ["=", "?n", hi],
              ["=", "?r", ["array/range", 0, "?n"]],
            ],
          ],
          stdlib
        );
        expect(solvedRange).toEqual([plainRange]);
      }),
    { arbitrary: { runs: 30 } }
  );

  it.effect.prop(
    "reasons symbolically about aggregate/* functions on symbolic lists",
    { a: smallInt, b: smallInt, c: smallInt },
    ({ a, b, c }) =>
      Effect.gen(function* () {
        // Unbounded algebraic laws of aggregates over arbitrary triples of integers.
        const proved = yield* run(
          [
            "begin",
            [
              "define",
              "checkAggregates",
              [
                "lambda",
                ["x", "y", "z"],
                [
                  "begin",
                  [
                    "define",
                    "xs",
                    ["array/make", ["number/add", "x", a], "y", "z"],
                  ],
                  ["define", "sorted", ["aggregate/collect", "xs"]],
                  ["define", "uniq", ["aggregate/unique", "xs"]],
                  [
                    "and",
                    ["=", ["aggregate/count", "xs"], 3],
                    ["=", ["aggregate/sum", "sorted"], ["aggregate/sum", "xs"]],
                    [
                      "number/lessThanOrEqualTo",
                      ["aggregate/min", "xs"],
                      ["aggregate/mean", "xs"],
                    ],
                    [
                      "number/lessThanOrEqualTo",
                      ["aggregate/mean", "xs"],
                      ["aggregate/max", "xs"],
                    ],
                    [
                      "=",
                      ["aggregate/countUnique", "xs"],
                      ["array/length", "uniq"],
                    ],
                    [
                      "number/lessThanOrEqualTo",
                      ["aggregate/countUnique", "xs"],
                      ["aggregate/count", "xs"],
                    ],
                    [
                      "=",
                      [
                        "aggregate/union",
                        [
                          "array/make",
                          ["array/make", ["number/add", "x", a], "y"],
                          ["array/make", "y", "z"],
                        ],
                      ],
                      "uniq",
                    ],
                  ],
                ],
              ],
            ],
            prove(
              [
                "and",
                ["schema/fits?", "?x", "value/integer?"],
                ["schema/fits?", "?y", "value/integer?"],
                ["schema/fits?", "?z", "value/integer?"],
              ],
              ["checkAggregates", "?x", "?y", "?z"]
            ),
          ],
          stdlib
        );
        expect(proved).toEqual([]);

        // Agree with concrete plain code for random triple.
        const plain = yield* run(
          [
            "begin",
            ["define", "xs", ["quote", [a, b, c]]],
            [
              "array/make",
              ["aggregate/sum", "xs"],
              ["aggregate/mean", "xs"],
              ["aggregate/min", "xs"],
              ["aggregate/max", "xs"],
              ["aggregate/countUnique", "xs"],
            ],
          ],
          stdlib
        );
        const solved = yield* run(
          [
            "begin",
            [
              "define",
              "summary",
              [
                "lambda",
                ["x", "y", "z"],
                [
                  "begin",
                  ["define", "xs", ["array/make", "x", "y", "z"]],
                  [
                    "array/make",
                    ["aggregate/sum", "xs"],
                    ["aggregate/mean", "xs"],
                    ["aggregate/min", "xs"],
                    ["aggregate/max", "xs"],
                    ["aggregate/countUnique", "xs"],
                  ],
                ],
              ],
            ],
            [
              "find",
              "?out",
              [
                "and",
                ["schema/fits?", "?x", "value/integer?"],
                ["schema/fits?", "?y", "value/integer?"],
                ["schema/fits?", "?z", "value/integer?"],
                ["=", "?x", a],
                ["=", "?y", b],
                ["=", "?z", c],
                ["=", "?out", ["summary", "?x", "?y", "?z"]],
              ],
            ],
          ],
          stdlib
        );
        expect(solved).toEqual([plain]);
      }),
    { arbitrary: { runs: 15 } }
  );

  it.effect.prop(
    "reasons symbolically about quantity/* arithmetic and unit conversion",
    { meters: posInt, seconds: posInt },
    ({ meters, seconds }) =>
      Effect.gen(function* () {
        // Prove unit conversion & dimensional arithmetic universally for arbitrary distances.
        const proved = yield* run(
          [
            "begin",
            [
              "define",
              "checkQuantity",
              [
                "lambda",
                ["d"],
                [
                  "begin",
                  ["define", "q", { unit: { m: 1 }, value: "d" }],
                  [
                    "define",
                    "inCm",
                    [
                      "quantity/multiply",
                      "q",
                      { unit: { cm: 1, m: -1 }, value: 100 },
                    ],
                  ],
                  [
                    "define",
                    "sumCm",
                    ["quantity/add", "inCm", { unit: { cm: 1 }, value: 100 }],
                  ],
                  [
                    "define",
                    "speed",
                    [
                      "quantity/divide",
                      "q",
                      { unit: { s: 1 }, value: seconds },
                    ],
                  ],
                  [
                    "and",
                    [
                      "=",
                      ["quantity/in", "sumCm", { cm: 1 }],
                      ["number/add", ["number/multiply", "d", 100], 100],
                    ],
                    [
                      "=",
                      [
                        "quantity/in",
                        [
                          "quantity/multiply",
                          "speed",
                          { unit: { s: 1 }, value: seconds },
                        ],
                        { m: 1 },
                      ],
                      "d",
                    ],
                    [
                      "=",
                      [
                        "quantity/in",
                        [
                          "quantity/subtract",
                          ["quantity/power", { unit: { m: 1 }, value: "d" }, 2],
                          { unit: { m: 2 }, value: ["number/power", "d", 2] },
                        ],
                        { m: 2 },
                      ],
                      0,
                    ],
                  ],
                ],
              ],
            ],
            prove(
              ["schema/fits?", "?d", "value/number?"],
              ["checkQuantity", "?d"]
            ),
          ],
          stdlib
        );
        expect(proved).toEqual([]);

        // Solving for an unknown quantity in m given a target in m.
        const solved = yield* run(
          [
            "find",
            "?extra",
            [
              "and",
              ["schema/fits?", "?extra", "value/number?"],
              [
                "=",
                [
                  "quantity/in",
                  [
                    "quantity/add",
                    { unit: { m: 1 }, value: meters },
                    { unit: { m: 1 }, value: "?extra" },
                  ],
                  { m: 1 },
                ],
                meters + 2,
              ],
            ],
          ],
          stdlib
        );
        expect(solved).toEqual([2]);

        // Unit mismatch fails cleanly just like plain code.
        const mismatch = yield* Effect.exit(
          run(
            [
              "find",
              "?x",
              [
                "and",
                ["schema/fits?", "?x", "value/number?"],
                [
                  "=",
                  [
                    "quantity/add",
                    { unit: { m: 1 }, value: "?x" },
                    { unit: { s: 1 }, value: seconds },
                  ],
                  { unit: { m: 1 }, value: meters },
                ],
              ],
            ],
            stdlib
          )
        );
        expect(mismatch._tag).toBe("Failure");
      }),
    { arbitrary: { runs: 20 } }
  );
});

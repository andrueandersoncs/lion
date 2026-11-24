import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { analyze } from "@/analysis/analyze";
import { run } from "@/evaluation/evaluate";
import { LogicDatabase, writtenRules } from "@/logic/database";
import { loadDatabase, saveDatabase } from "@/logic/snapshot";
import { stdlib } from "@/modules";

/** A database that uses every kind of relation, fact, and goal. */
const program = [
  ["define", "budget", 100],
  ["relation", "edge", ["from", "to"]],
  ["relation", "path", ["from", "to"]],
  ["relation", "road", ["from", "to", "km"]],
  ["relation", "dist", ["to", "km"]],
  ["relation", "order", ["id", "status", "tags"], { key: "id" }],
  ["relation", "spend", ["status", "count"]],
  ["relation", "tagged", ["tag", "id"]],
  ["relation", "group", ["node", "component"]],
  [
    "fact",
    ["edge", "a", "b"],
    ["edge", "b", ["quote", "?c"]],
    ["edge", ["quote", "edge"], ["quote", "x/y"]],
    ["edge", ["quote", "budget"], 3],
  ],
  ["fact", ["road", "a", "b", 4], ["road", "a", "c", 1], ["road", "c", "b", 2]],
  [
    "fact",
    ["order", 1, "open", ["array/make", "red", "big"]],
    ["order", 2, "open", ["array/make", "red"]],
    ["order", 1, "paid", ["array/make", "red", { size: 2 }]],
  ],
  ["rule", ["path", "?x", "?y"], ["edge", "?x", "?y"]],
  [
    "rule",
    ["path", "?x", "?z"],
    ["or", ["path", "?x", "?y"], ["edge", "?y", "?x"]],
    ["edge", "?y", "?z"],
    ["not", ["order", "?z", "?_", "?_"]],
  ],
  [
    "rule",
    ["dist", "?to", ["aggregate/min", "?km"]],
    ["road", "a", "?to", "?km"],
  ],
  [
    "rule",
    ["dist", "?to", ["aggregate/min", ["number/add", "?d", "?km"]]],
    ["dist", "?via", "?d"],
    ["road", "?via", "?to", "?km"],
  ],
  [
    "rule",
    ["spend", "?s", ["aggregate/count", "?id"]],
    ["order", "?id", "?s", "?_"],
    ["number/lessThan", "?id", "budget"],
  ],
  [
    "rule",
    ["tagged", "?tag", "?id"],
    ["order", "?id", "?_", "?tags"],
    ["in", "?tag", "?tags"],
    ["=", "?copy", "?tag"],
  ],
  ["rule", ["group", "?n", "?c"], ["graph/components", "edge", "?n", "?c"]],
  [
    "invariant",
    [
      "and",
      ["edge", ["quote", "budget"], "?n"],
      ["number/greaterThan", "?n", "budget"],
    ],
    { assert: "none" },
  ],
  ["invariant", ["group", "a", "?_"], { assert: "some" }],
];

const queries = [
  ["query", ["path", "?x", "?y"], { order: ["x", "y"] }],
  ["query", ["dist", "?to", "?km"], { order: "to" }],
  ["query", ["order", "?id", "?status", "?tags"], { order: "id" }],
  ["query", ["spend", "?status", "?count"], { order: "status" }],
  ["query", ["tagged", "?tag", "?id"], { order: ["tag", "id"] }],
  ["query", ["group", "?node", "?component"], { order: "node" }],
];

const answers = (database: LogicDatabase) =>
  Effect.gen(function* () {
    const results: unknown[] = [];
    for (const query of queries) {
      results.push(yield* run(query, stdlib, { database }));
    }
    return results;
  });

describe("snapshots", () => {
  it.effect("rebuild a database with the same answers", () =>
    Effect.gen(function* () {
      const original = new LogicDatabase();
      const saved = yield* run(["begin", ...program, ["snapshot"]], stdlib, {
        database: original,
      });
      const loaded = yield* loadDatabase(
        JSON.parse(JSON.stringify(saved)),
        stdlib
      );
      expect(yield* answers(loaded)).toEqual(yield* answers(original));
      // Saving the rebuilt database gives the same program again.
      expect(yield* saveDatabase(loaded)).toEqual(
        yield* saveDatabase(original)
      );
    })
  );

  it.effect("write relations, facts, and rules as Lion forms", () =>
    Effect.gen(function* () {
      const saved = yield* run(
        [
          "begin",
          ["relation", "edge", ["from", "to"]],
          ["relation", "path", ["from", "to"]],
          ["relation", "label", ["node", "text"], { key: ["node"] }],
          ["fact", ["edge", "a", "b"], ["edge", "b", "c"]],
          ["fact", ["label", "a", "start"]],
          ["rule", ["path", "?x", "?y"], ["edge", "?x", "?y"]],
          [
            "rule",
            ["path", "?x", "?z"],
            ["path", "?x", "?y"],
            ["edge", "?y", "?z"],
          ],
          ["snapshot"],
        ],
        stdlib
      );
      expect(saved).toEqual([
        "begin",
        ["relation", "edge", ["from", "to"]],
        ["relation", "path", ["from", "to"]],
        ["relation", "label", ["node", "text"], { key: ["node"] }],
        ["rule", ["path", "?x", "?y"], ["edge", "?x", "?y"]],
        [
          "rule",
          ["path", "?x", "?z"],
          ["path", "?x", "?y"],
          ["edge", "?y", "?z"],
        ],
        [
          "fact",
          ["edge", "a", "b"],
          ["edge", "b", "c"],
          ["label", "a", "start"],
        ],
      ]);
    })
  );

  it.effect("quote strings that would load as something else", () =>
    Effect.gen(function* () {
      const saved = (yield* run(
        [
          "begin",
          ["define", "budget", 100],
          ["relation", "note", ["text"]],
          [
            "fact",
            ["note", "plain"],
            ["note", ["quote", "?x"]],
            ["note", ["quote", "budget"]],
            ["note", ["quote", "note"]],
            ["note", ["quote", "number/add"]],
            ["note", ["array/make", 1, 2]],
          ],
          ["snapshot"],
        ],
        stdlib
      )) as unknown[][];
      expect(saved[2]).toEqual([
        "fact",
        ["note", "plain"],
        ["note", ["quote", "?x"]],
        ["note", ["quote", "budget"]],
        ["note", ["quote", "note"]],
        ["note", ["quote", "number/add"]],
        ["note", ["quote", [1, 2]]],
      ]);
    })
  );

  it.effect("bind a shared database's relations in later runs", () =>
    Effect.gen(function* () {
      const database = yield* loadDatabase(
        [
          "begin",
          ["relation", "edge", ["from", "to"]],
          ["fact", ["edge", "a", "b"]],
        ],
        stdlib
      );
      expect(
        yield* run(["query", ["edge", "a", "?to"]], stdlib, { database })
      ).toEqual([{ to: "b" }]);
      // A name the environment binds wins over the relation.
      expect(yield* run("edge", { ...stdlib, edge: 7 }, { database })).toBe(7);
    })
  );

  it("are classified by the analyzer", () => {
    expect(analyze(["snapshot"]).specialForm).toBe("snapshot");
  });
});

const smallNonNeg = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 12 }))
);
const smallInt = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: -5, maximum: 5 }))
);

describe("recursive and mutually recursive lambdas in snapshots", () => {
  it.effect.prop(
    "self-recursive lambda with captured outer value survives snapshot round-trip, deduplication, retraction, and later redefinition",
    {
      inputs: Arbitrary.array(smallNonNeg, { minLength: 1, maxLength: 5 }),
      scale: smallInt,
    },
    ({ inputs, scale }) =>
      Effect.gen(function* () {
        const distinct = [...new Set(inputs)].sort((a, b) => a - b);
        const recRule = [
          "rule",
          ["out", "?x", ["scaled-sum", "?x"]],
          ["n", "?x"],
        ];
        const setup = [
          "begin",
          ["define", "factor", scale],
          [
            "define",
            "scaled-sum",
            [
              "lambda",
              ["v"],
              [
                "cond",
                [["number/lessThanOrEqualTo", "v", 0], 0],
                [
                  "else",
                  [
                    "number/add",
                    ["number/multiply", "v", "factor"],
                    ["scaled-sum", ["number/subtract", "v", 1]],
                  ],
                ],
              ],
            ],
          ],
          ["relation", "n", ["x"]],
          ["relation", "out", ["x", "v"]],
          ["fact", ...distinct.map((x) => ["n", x])],
          recRule,
          // Re-adding the same rule changes nothing.
          recRule,
          // Redefining the name after the rule was added leaves the rule intact.
          ["define", "scaled-sum", ["lambda", ["v"], -999]],
        ];
        const db = new LogicDatabase();
        yield* run(setup, stdlib, { database: db });
        expect(writtenRules(db.rules)).toHaveLength(1);
        const expected = distinct.map((x) => ({
          x,
          v: ((x * (x + 1)) / 2) * scale + 0,
        }));
        const query = ["query", ["out", "?x", "?v"], { order: "x" }];
        expect(yield* run(query, stdlib, { database: db })).toEqual(expected);

        const saved = yield* saveDatabase(db);
        const loaded = yield* loadDatabase(
          JSON.parse(JSON.stringify(saved)),
          stdlib
        );
        expect(yield* run(query, stdlib, { database: loaded })).toEqual(
          expected
        );
        expect(yield* saveDatabase(loaded)).toEqual(saved);

        // Retracting the rule by its written form removes it.
        const savedRule = saved.find(
          (form) => Array.isArray(form) && form[0] === "rule"
        );
        yield* run(["retract", savedRule], stdlib, { database: loaded });
        expect(writtenRules(loaded.rules)).toHaveLength(0);
        expect(yield* run(query, stdlib, { database: loaded })).toEqual([]);
      })
  );

  it.effect.prop(
    "mutually recursive lambdas and aliased recursive lambdas survive snapshot round-trip",
    {
      inputs: Arbitrary.array(smallNonNeg, { minLength: 1, maxLength: 5 }),
    },
    ({ inputs }) =>
      Effect.gen(function* () {
        const distinct = [...new Set(inputs)].sort((a, b) => a - b);
        const db = new LogicDatabase();
        yield* run(
          [
            "begin",
            [
              "define",
              "is-even",
              [
                "lambda",
                ["k"],
                [
                  "cond",
                  [["number/equals?", "k", 0], true],
                  ["else", ["is-odd", ["number/subtract", "k", 1]]],
                ],
              ],
            ],
            [
              "define",
              "is-odd",
              [
                "lambda",
                ["k"],
                [
                  "cond",
                  [["number/equals?", "k", 0], false],
                  ["else", ["is-even", ["number/subtract", "k", 1]]],
                ],
              ],
            ],
            ["define", "alias", "is-even"],
            ["relation", "n", ["x"]],
            ["relation", "evens", ["x", "ok"]],
            ["fact", ...distinct.map((x) => ["n", x])],
            ["rule", ["evens", "?x", ["alias", "?x"]], ["n", "?x"]],
          ],
          stdlib,
          { database: db }
        );
        const expected = distinct.map((x) => ({ x, ok: x % 2 === 0 }));
        const query = ["query", ["evens", "?x", "?ok"], { order: "x" }];
        const saved = yield* saveDatabase(db);
        const loaded = yield* loadDatabase(
          JSON.parse(JSON.stringify(saved)),
          stdlib
        );
        expect(yield* run(query, stdlib, { database: loaded })).toEqual(
          expected
        );
        expect(yield* saveDatabase(loaded)).toEqual(saved);
      })
  );

  it.effect.prop(
    "recursive lambdas passed through func/partial survive snapshot round-trip",
    {
      inputs: Arbitrary.array(smallNonNeg, { minLength: 1, maxLength: 4 }),
      offset: smallInt,
    },
    ({ inputs, offset }) =>
      Effect.gen(function* () {
        const distinct = [...new Set(inputs)].sort((a, b) => a - b);
        const db = new LogicDatabase();
        yield* run(
          [
            "begin",
            [
              "define",
              "acc",
              [
                "lambda",
                ["base", "k"],
                [
                  "cond",
                  [["number/lessThanOrEqualTo", "k", 0], "base"],
                  [
                    "else",
                    ["number/add", "k", ["step", ["number/subtract", "k", 1]]],
                  ],
                ],
              ],
            ],
            ["define", "step", ["func/partial", "acc", offset]],
            ["relation", "n", ["x"]],
            ["relation", "out", ["x", "v"]],
            ["fact", ...distinct.map((x) => ["n", x])],
            ["rule", ["out", "?x", ["step", "?x"]], ["n", "?x"]],
          ],
          stdlib,
          { database: db }
        );
        const expected = distinct.map((x) => ({
          x,
          v: offset + (x * (x + 1)) / 2,
        }));
        const query = ["query", ["out", "?x", "?v"], { order: "x" }];
        const saved = yield* saveDatabase(db);
        const loaded = yield* loadDatabase(
          JSON.parse(JSON.stringify(saved)),
          stdlib
        );
        expect(yield* run(query, stdlib, { database: loaded })).toEqual(
          expected
        );
        expect(yield* saveDatabase(loaded)).toEqual(saved);
      })
  );

  it.effect.prop(
    "shadowed mutually recursive lambdas with colliding names survive snapshot round-trip",
    {
      inputs: Arbitrary.array(smallNonNeg, { minLength: 1, maxLength: 4 }),
    },
    ({ inputs }) =>
      Effect.gen(function* () {
        const distinct = [...new Set(inputs)].sort((a, b) => a - b);
        const db = new LogicDatabase();
        yield* run(
          [
            "begin",
            [
              "define",
              "f",
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
                      1,
                      [
                        "number/add",
                        ["f", 0],
                        ["g", ["number/subtract", "n", 1]],
                      ],
                    ],
                  ],
                ],
              ],
            ],
            [
              "define",
              "g",
              [
                [
                  "lambda",
                  ["up"],
                  [
                    "begin",
                    [
                      "define",
                      "f",
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
                              2,
                              [
                                "number/add",
                                ["f", 0],
                                ["up", ["number/subtract", "n", 1]],
                              ],
                            ],
                          ],
                        ],
                      ],
                    ],
                    "f",
                  ],
                ],
                "f",
              ],
            ],
            ["relation", "n", ["x"]],
            ["relation", "out", ["x", "v"]],
            ["fact", ...distinct.map((x) => ["n", x])],
            ["rule", ["out", "?x", ["f", "?x"]], ["n", "?x"]],
          ],
          stdlib,
          { database: db }
        );
        const expected = distinct.map((x) => ({
          x,
          v: x + Math.floor(x / 2),
        }));
        const query = ["query", ["out", "?x", "?v"], { order: "x" }];
        expect(yield* run(query, stdlib, { database: db })).toEqual(expected);
        const saved = yield* saveDatabase(db);
        const loaded = yield* loadDatabase(
          JSON.parse(JSON.stringify(saved)),
          stdlib
        );
        expect(yield* run(query, stdlib, { database: loaded })).toEqual(
          expected
        );
        expect(yield* saveDatabase(loaded)).toEqual(saved);
      })
  );
});

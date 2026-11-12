import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { analyze } from "@/analysis/analyze";
import { run } from "@/evaluation/evaluate";
import { LogicDatabase } from "@/logic/database";
import { stdlib } from "@/modules";

const exposure = [
  ["relation", "holds", ["owner", "position"]],
  ["relation", "allocates", ["vault", "market"]],
  ["relation", "collateral", ["market", "token"]],
  ["relation", "priced_by", ["token", "oracle"]],
  ["relation", "changed", ["node"]],
  ["relation", "dep", ["from", "to"]],
  ["relation", "needs_review", ["owner", "position", "dependency"]],

  ["fact", ["holds", "alice", "vault_a"], ["holds", "alice", "vault_b"]],
  ["fact", ["allocates", "vault_a", "market_1"]],
  ["fact", ["allocates", "vault_b", "market_2"]],
  ["fact", ["collateral", "market_1", "token_x"]],
  ["fact", ["collateral", "market_2", "token_y"]],
  ["fact", ["priced_by", "token_x", "oracle_7"]],
  ["fact", ["priced_by", "token_y", "oracle_9"]],

  ["rule", ["dep", "?x", "?y"], ["allocates", "?x", "?y"]],
  ["rule", ["dep", "?x", "?y"], ["collateral", "?x", "?y"]],
  ["rule", ["dep", "?x", "?y"], ["priced_by", "?x", "?y"]],
  ["rule", ["dep", "?x", "?z"], ["dep", "?x", "?y"], ["dep", "?y", "?z"]],
  [
    "rule",
    ["needs_review", "?who", "?p", "?d"],
    ["holds", "?who", "?p"],
    ["dep", "?p", "?d"],
    ["changed", "?d"],
  ],
];

const program = (...expressions: unknown[]) => [
  "begin",
  ...exposure,
  ...expressions,
];

const logicError = (expression: unknown) =>
  run(expression, stdlib).pipe(
    Effect.flip,
    Effect.map((error) => ({
      tag: (error as { _tag?: string })._tag,
      message: String((error as { message?: unknown }).message),
    }))
  );

describe("logic variables", () => {
  it.effect("evaluate unbound ?names to logic variables", () =>
    Effect.gen(function* () {
      const result = yield* run("?x", {});
      expect(JSON.parse(JSON.stringify(result))).toBe("?x");
    })
  );

  it.effect("prefer a binding when the ?name is bound", () =>
    Effect.gen(function* () {
      expect(yield* run("?x", { "?x": 1 })).toBe(1);
    })
  );

  it.effect("leave a lone question mark as a string", () =>
    Effect.gen(function* () {
      expect(yield* run("?", {})).toBe("?");
    })
  );
});

describe("relations", () => {
  it.effect("bind a callable relation that builds goals", () =>
    Effect.gen(function* () {
      const result = yield* run(
        ["begin", ["relation", "edge", ["from", "to"]], ["edge", "a", "?b"]],
        stdlib
      );
      expect(JSON.parse(JSON.stringify(result))).toEqual(["edge", "a", "?b"]);
    })
  );

  it.effect("reject calls with the wrong number of arguments", () =>
    Effect.gen(function* () {
      const error = yield* logicError([
        "begin",
        ["relation", "edge", ["from", "to"]],
        ["edge", "a"],
      ]);
      expect(error.tag).toBe("LogicError");
      expect(error.message).toContain("takes 2 arguments");
    })
  );

  it.effect("allow identical redeclaration but not changed columns", () =>
    Effect.gen(function* () {
      yield* run(
        [
          "begin",
          ["relation", "edge", ["from", "to"]],
          ["relation", "edge", ["from", "to"]],
        ],
        stdlib
      );
      const error = yield* logicError([
        "begin",
        ["relation", "edge", ["from", "to"]],
        ["relation", "edge", ["source", "target"]],
      ]);
      expect(error.message).toContain("already declared");
    })
  );
});

describe("query", () => {
  it.effect("follows recursive rules", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        program(["query", ["dep", "vault_a", "?d"]]),
        stdlib
      );
      expect(rows).toEqual([
        { d: "market_1" },
        { d: "token_x" },
        { d: "oracle_7" },
      ]);
    })
  );

  it.effect("joins across relations", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        program(
          ["fact", ["changed", "oracle_7"]],
          ["query", ["needs_review", "alice", "?p", "?d"]]
        ),
        stdlib
      );
      expect(rows).toEqual([{ p: "vault_a", d: "oracle_7" }]);
    })
  );

  it.effect("returns one empty row for a true ground goal", () =>
    Effect.gen(function* () {
      expect(
        yield* run(program(["query", ["dep", "vault_b", "oracle_9"]]), stdlib)
      ).toEqual([{}]);
      expect(
        yield* run(program(["query", ["dep", "vault_b", "oracle_7"]]), stdlib)
      ).toEqual([]);
    })
  );

  it.effect("supports and, or, and anonymous variables", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        program([
          "query",
          [
            "and",
            ["holds", "?who", "?_"],
            ["or", ["dep", "?p", "oracle_7"], ["dep", "?p", "oracle_9"]],
            ["holds", "?who", "?p"],
          ],
        ]),
        stdlib
      );
      expect(rows).toEqual([
        { who: "alice", p: "vault_a" },
        { who: "alice", p: "vault_b" },
      ]);
    })
  );
});

describe("rules", () => {
  it.effect("support stratified negation", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        program(
          ["relation", "untouched", ["position"]],
          ["fact", ["changed", "token_x"]],
          [
            "rule",
            ["untouched", "?p"],
            ["holds", "?_", "?p"],
            ["not", ["needs_review", "?_", "?p", "?_"]],
          ],
          ["query", ["untouched", "?p"]]
        ),
        stdlib
      );
      expect(rows).toEqual([{ p: "vault_b" }]);
    })
  );

  it.effect("reject negation through recursion", () =>
    Effect.gen(function* () {
      const error = yield* logicError([
        "begin",
        ["relation", "node", ["id"]],
        ["relation", "p", ["id"]],
        ["relation", "q", ["id"]],
        ["rule", ["p", "?x"], ["node", "?x"], ["not", ["q", "?x"]]],
        ["rule", ["q", "?x"], ["node", "?x"], ["not", ["p", "?x"]]],
      ]);
      expect(error.message).toContain(
        'A question, such as a goal under "not", cannot go through recursion'
      );
    })
  );

  it.effect("reject head variables that the body never binds", () =>
    Effect.gen(function* () {
      const error = yield* logicError([
        "begin",
        ["relation", "node", ["id"]],
        ["relation", "pair", ["a", "b"]],
        ["rule", ["pair", "?x", "?y"], ["node", "?x"]],
      ]);
      expect(error.message).toContain("?y never appears");
    })
  );

  it.effect("reject filters on variables that are never bound", () =>
    Effect.gen(function* () {
      const error = yield* logicError([
        "begin",
        ["relation", "node", ["id"]],
        ["relation", "big", ["id"]],
        [
          "rule",
          ["big", "?x"],
          ["node", "?x"],
          ["number/greaterThan", "?y", 3],
        ],
      ]);
      expect(error.message).toContain("Unsafe goal");
      expect(error.message).toContain("?y");
    })
  );

  it.effect("lift pure functions into filters and computed values", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        [
          "begin",
          ["define", "threshold", 100],
          ["relation", "balance", ["account", "amount"]],
          ["relation", "large", ["account", "cents"]],
          [
            "fact",
            ["balance", "a", 50],
            ["balance", "b", 150],
            ["balance", "c", 300],
          ],
          [
            "rule",
            ["large", "?acct", "?cents"],
            ["balance", "?acct", "?amt"],
            ["number/greaterThan", "?amt", "threshold"],
            ["=", "?cents", ["number/multiply", "?amt", 100]],
          ],
          ["query", ["large", "?acct", "?cents"]],
        ],
        stdlib
      );
      expect(rows).toEqual([
        { acct: "b", cents: 15_000 },
        { acct: "c", cents: 30_000 },
      ]);
    })
  );

  it.effect("compute head values in non-recursive rules", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        [
          "begin",
          ["relation", "name", ["id", "text"]],
          ["relation", "label", ["id", "text"]],
          ["fact", ["name", 1, "lion"]],
          [
            "rule",
            ["label", "?id", ["string/concat", "?text", "!"]],
            ["name", "?id", "?text"],
          ],
          ["query", ["label", 1, "?l"]],
        ],
        stdlib
      );
      expect(rows).toEqual([{ l: "lion!" }]);
    })
  );

  it.effect("reject computed head values in recursive rules", () =>
    Effect.gen(function* () {
      const error = yield* logicError([
        "begin",
        ["relation", "count", ["n"]],
        ["fact", ["count", 0]],
        ["rule", ["count", ["number/add", "?n", 1]], ["count", "?n"]],
      ]);
      expect(error.message).toContain("may never finish");
    })
  );

  it.effect("accept goals built by ordinary lambdas", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        program(
          [
            "define",
            "exposed_to",
            [
              "lambda",
              ["p", "d"],
              ["and", ["holds", "alice", "p"], ["dep", "p", "d"]],
            ],
          ],
          ["query", ["exposed_to", "?p", "token_y"]]
        ),
        stdlib
      );
      expect(rows).toEqual([{ p: "vault_b" }]);
    })
  );
});

describe("facts", () => {
  it.effect("reject logic variables", () =>
    Effect.gen(function* () {
      const error = yield* logicError([
        "begin",
        ["relation", "node", ["id"]],
        ["fact", ["node", "?x"]],
      ]);
      expect(error.message).toContain("cannot contain logic variables");
    })
  );

  it.effect("retract updates derived answers", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        program(
          ["fact", ["changed", "oracle_7"]],
          ["query", ["needs_review", "alice", "?p", "?_"]],
          ["retract", ["allocates", "vault_a", "market_1"]],
          ["query", ["needs_review", "alice", "?p", "?_"]]
        ),
        stdlib
      );
      expect(rows).toEqual([]);
    })
  );

  it.effect("persist across runs when a database is passed in", () =>
    Effect.gen(function* () {
      const database = new LogicDatabase();
      yield* run(program(), stdlib, { database });
      const rows = yield* run(
        [
          "begin",
          ["relation", "changed", ["node"]],
          ["relation", "needs_review", ["owner", "position", "dependency"]],
          ["fact", ["changed", "token_y"]],
          ["query", ["needs_review", "alice", "?p", "?d"]],
        ],
        stdlib,
        { database }
      );
      expect(rows).toEqual([{ p: "vault_b", d: "token_y" }]);
    })
  );
});

describe("why", () => {
  it.effect("explains a derived fact down to the given facts", () =>
    Effect.gen(function* () {
      const explanation = yield* run(
        program(
          ["fact", ["changed", "token_x"]],
          ["why", ["needs_review", "alice", "vault_a", "token_x"]]
        ),
        stdlib
      );
      expect(explanation).toMatchObject({
        fact: ["needs_review", "alice", "vault_a", "token_x"],
        rule: [
          "rule",
          ["needs_review", "?who", "?p", "?d"],
          ["holds", "?who", "?p"],
          ["dep", "?p", "?d"],
          ["changed", "?d"],
        ],
        because: [
          { fact: ["holds", "alice", "vault_a"], given: true },
          {
            fact: ["dep", "vault_a", "token_x"],
            because: [
              { fact: ["dep", "vault_a", "market_1"] },
              { fact: ["dep", "market_1", "token_x"] },
            ],
          },
          { fact: ["changed", "token_x"], given: true },
        ],
      });
    })
  );

  it.effect("records checks and absences", () =>
    Effect.gen(function* () {
      const explanation = yield* run(
        [
          "begin",
          ["relation", "score", ["id", "value"]],
          ["relation", "flagged", ["id"]],
          ["relation", "ok", ["id"]],
          ["fact", ["score", "a", 9]],
          [
            "rule",
            ["ok", "?id"],
            ["score", "?id", "?v"],
            ["number/greaterThan", "?v", 5],
            ["not", ["flagged", "?id"]],
          ],
          ["why", ["ok", "a"]],
        ],
        stdlib
      );
      expect(explanation).toMatchObject({
        because: [
          { fact: ["score", "a", 9], given: true },
          { check: ["number/greaterThan", 9, 5] },
          { absent: ["flagged", "a"] },
        ],
      });
    })
  );

  it.effect("returns null when the fact does not hold", () =>
    Effect.gen(function* () {
      expect(
        yield* run(program(["why", ["dep", "vault_a", "oracle_9"]]), stdlib)
      ).toBeNull();
    })
  );
});

describe("logic forms outside rules", () => {
  it.effect("act as boolean operators on plain values", () =>
    Effect.gen(function* () {
      expect(yield* run(["and", true, ["=", 1, 1]], stdlib)).toBe(true);
      expect(yield* run(["or", false, ["=", "a", "b"]], stdlib)).toBe(false);
      expect(yield* run(["not", ["=", { a: 1 }, { a: 1 }]], stdlib)).toBe(
        false
      );
    })
  );

  it.effect("defer pure calls on logic variables", () =>
    Effect.gen(function* () {
      const result = yield* run(["number/add", "?x", 1], stdlib);
      expect(JSON.parse(JSON.stringify(result))).toEqual([
        "number/add",
        "?x",
        1,
      ]);
    })
  );
});

describe("recursion safety", () => {
  const counter = (...body: unknown[]) => [
    "begin",
    ["relation", "c", ["n"]],
    ["fact", ["c", 0]],
    ["rule", ["c", "?m"], ["c", "?n"], ...body],
    ["query", ["c", "?x"]],
  ];

  it.effect("reject head values computed through = or in while recursing", () =>
    Effect.gen(function* () {
      const viaUnify = yield* logicError(
        counter(["=", "?m", ["number/add", "?n", 1]])
      );
      expect(viaUnify.message).toContain(
        'computes a new value for "?m" in its head while recursing'
      );
      expect(viaUnify.message).toContain(
        "aggregate/shortest, or aggregate/union"
      );
      const viaIn = yield* logicError(
        counter(["in", "?m", ["array/make", ["number/add", "?n", 1]]])
      );
      expect(viaIn.message).toContain('a new value for "?m"');
    })
  );

  it.effect("allow = and in when the values come from facts", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        [
          "begin",
          ["relation", "edge", ["from", "to"]],
          ["relation", "tags", ["node", "list"]],
          ["relation", "reach", ["node"]],
          ["fact", ["edge", "a", "b"], ["edge", "b", "c"]],
          ["fact", ["tags", "c", ["array/make", "x", "y"]]],
          ["rule", ["reach", "?n"], ["=", "?n", "a"]],
          [
            "rule",
            ["reach", "?m"],
            ["reach", "?n"],
            ["edge", "?n", "?to"],
            ["=", "?m", "?to"],
          ],
          [
            "rule",
            ["reach", "?t"],
            ["reach", "?n"],
            ["tags", "?n", "?list"],
            ["in", "?t", "?list"],
          ],
          ["query", ["reach", "?n"]],
        ],
        stdlib
      );
      expect(rows).toEqual([
        { n: "a" },
        { n: "b" },
        { n: "c" },
        { n: "x" },
        { n: "y" },
      ]);
    })
  );
});

describe("analysis", () => {
  it("classifies logic forms and relation definitions", () => {
    expect(analyze(["relation", "edge", ["a", "b"]]).specialForm).toBe(
      "relation"
    );
    expect(
      analyze(["relation", "edge", ["a", "b"]]).relationships
    ).toContainEqual({ kind: "definition", name: "edge" });
    expect(analyze(["rule", ["p", "?x"], ["q", "?x"]]).specialForm).toBe(
      "rule"
    );
    expect(analyze(["query", ["p", "?x"]]).specialForm).toBe("query");
    expect(analyze(["=", "?x", 1]).specialForm).toBe("=");
  });
});

import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { analyze } from "@/analysis/analyze";
import { run } from "@/evaluation/evaluate";
import { LogicDatabase } from "@/logic/database";
import { stdlib } from "@/modules";

const orders = [
  ["relation", "order", ["id", "status", "total"], { key: ["id"] }],
  ["fact", ["order", 1, "open", 30], ["order", 2, "open", 12]],
];

const errorMessage = (expression: unknown) =>
  run(expression, stdlib).pipe(
    Effect.flip,
    Effect.map((error) => String((error as { message?: unknown }).message))
  );

describe("keyed relations", () => {
  it.effect("replace the row with the same key", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        [
          "begin",
          ...orders,
          ["fact", ["order", 1, "shipped", 30]],
          ["query", ["order", "?id", "?status", "?total"], { order: "id" }],
        ],
        stdlib
      );
      expect(rows).toEqual([
        { id: 1, status: "shipped", total: 30 },
        { id: 2, status: "open", total: 12 },
      ]);
    })
  );

  it.effect("let the last of several facts for one key win", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        [
          "begin",
          ...orders,
          ["fact", ["order", 3, "open", 1], ["order", 3, "paid", 1]],
          ["query", ["order", 3, "?status", "?_"]],
        ],
        stdlib
      );
      expect(rows).toEqual([{ status: "paid" }]);
    })
  );

  it.effect("key on several columns", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        [
          "begin",
          [
            "relation",
            "stock",
            ["warehouse", "sku", "count"],
            { key: ["warehouse", "sku"] },
          ],
          [
            "fact",
            ["stock", "east", "pen", 5],
            ["stock", "west", "pen", 2],
            ["stock", "east", "pen", 9],
          ],
          ["query", ["stock", "?w", "pen", "?count"], { order: "w" }],
        ],
        stdlib
      );
      expect(rows).toEqual([
        { w: "east", count: 9 },
        { w: "west", count: 2 },
      ]);
    })
  );

  it.effect("retract only an exact row", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        [
          "begin",
          ...orders,
          ["retract", ["order", 1, "shipped", 30]],
          ["retract", ["order", 2, "open", 12]],
          ["query", ["order", "?id", "?_", "?_"]],
        ],
        stdlib
      );
      expect(rows).toEqual([{ id: 1 }]);
    })
  );

  it.effect("keep upserts across runs that share a database", () =>
    Effect.gen(function* () {
      const database = new LogicDatabase();
      yield* run(["begin", ...orders], stdlib, { database });
      // Each run binds relations again by declaring them with the same key.
      const rows = yield* run(
        [
          "begin",
          orders[0],
          ["fact", ["order", 2, "paid", 12]],
          ["query", ["order", 2, "?status", "?_"]],
        ],
        stdlib,
        { database }
      );
      expect(rows).toEqual([{ status: "paid" }]);
    })
  );

  it.effect("accept rules whose rows keep one per key", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        [
          "begin",
          ...orders,
          ["relation", "label", ["id", "text"], { key: "id" }],
          [
            "rule",
            ["label", "?id", "?status"],
            ["order", "?id", "?status", "?_"],
          ],
          ["query", ["label", 1, "?text"]],
        ],
        stdlib
      );
      expect(rows).toEqual([{ text: "open" }]);
    })
  );

  it.effect("report rules that derive two rows for one key", () =>
    Effect.gen(function* () {
      const program = [
        "begin",
        ...orders,
        ["relation", "summary", ["status", "id"], { key: ["status"] }],
        ["rule", ["summary", "?s", "?id"], ["order", "?id", "?s", "?_"]],
      ];
      expect(
        yield* errorMessage([...program, ["query", ["summary", "?s", "?id"]]])
      ).toContain('"summary" is keyed by ["status"], but');
      // Goal-directed queries check the rows they derive the same way.
      expect(
        yield* errorMessage([...program, ["query", ["summary", "open", "?id"]]])
      ).toContain(
        'derived ["summary","open",2] while ["summary","open",1] holds'
      );
    })
  );
});

describe("relation options", () => {
  it.effect("reject bad keys and unknown options", () =>
    Effect.gen(function* () {
      const declare = (options: unknown) =>
        errorMessage(["relation", "r", ["a", "b"], options]);
      expect(yield* declare({ key: ["c"] })).toContain('has no column "c"');
      expect(yield* declare({ key: [] })).toContain("at least one key column");
      expect(yield* declare({ key: ["a", "a"] })).toContain(
        "repeats a key column"
      );
      expect(yield* declare({ unique: ["a"] })).toContain(
        'Unknown relation option "unique"'
      );
      expect(yield* declare({ key: 1 })).toContain("must be a column name");
      expect(yield* declare("a")).toContain(
        "Relation options must be a record"
      );
    })
  );

  it.effect("require a redeclaration to repeat the key", () =>
    Effect.gen(function* () {
      yield* run(
        [
          "begin",
          ["relation", "r", ["a", "b"], { key: "a" }],
          ["relation", "r", ["a", "b"], { key: ["a"] }],
        ],
        stdlib
      );
      expect(
        yield* errorMessage([
          "begin",
          ["relation", "r", ["a", "b"], { key: "a" }],
          ["relation", "r", ["a", "b"]],
        ])
      ).toContain('already declared with columns ["a","b"] and key ["a"]');
    })
  );

  it("are classified by the analyzer", () => {
    const node = analyze(["relation", "r", ["a"], { key: ["a"] }]);
    expect(node.specialForm).toBe("relation");
    expect(node.children.map((child) => child.role)).toEqual([
      "operator",
      "binding",
      "columns",
      "options",
    ]);
  });
});

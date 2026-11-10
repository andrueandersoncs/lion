import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { analyze } from "@/analysis/analyze";
import { run } from "@/evaluation/evaluate";
import { LogicDatabase } from "@/logic/database";
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
        ["fact", ["edge", "a", "b"], ["edge", "b", "c"]],
        ["fact", ["label", "a", "start"]],
        ["rule", ["path", "?x", "?y"], ["edge", "?x", "?y"]],
        [
          "rule",
          ["path", "?x", "?z"],
          ["path", "?x", "?y"],
          ["edge", "?y", "?z"],
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

  it.effect("refuse rules that hold values other than JSON data", () =>
    Effect.gen(function* () {
      const error = yield* run(
        [
          "begin",
          ["relation", "list", ["items"]],
          ["relation", "bigger", ["items"]],
          [
            "rule",
            ["bigger", ["array/map", "?items", ["lambda", ["x"], "x"]]],
            ["list", "?items"],
          ],
          ["snapshot"],
        ],
        stdlib
      ).pipe(Effect.flip);
      expect(String((error as { message?: unknown }).message)).toContain(
        "Cannot snapshot the database"
      );
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

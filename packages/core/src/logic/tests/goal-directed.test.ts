import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { run } from "@/evaluation/evaluate";
import { LogicDatabase } from "@/logic/database";
import { valueKey } from "@/logic/terms";
import { stdlib } from "@/modules";

const graph = [
  ["relation", "edge", ["from", "to"]],
  ["relation", "path", ["from", "to"]],
  [
    "fact",
    ["edge", "a", "b"],
    ["edge", "b", "c"],
    ["edge", "c", "a"],
    ["edge", "c", "d"],
    ["edge", "x", "y"],
  ],
  ["rule", ["path", "?x", "?y"], ["edge", "?x", "?y"]],
  ["rule", ["path", "?x", "?z"], ["path", "?x", "?y"], ["edge", "?y", "?z"]],
];

/** Programs whose last expression is a query, run both ways below. */
const CORPUS: Record<string, unknown[]> = {
  "left recursion from a start": [...graph, ["query", ["path", "a", "?to"]]],
  "left recursion to an end": [...graph, ["query", ["path", "?from", "d"]]],
  "a ground goal": [...graph, ["query", ["path", "x", "a"]]],
  "right recursion": [
    ...graph,
    ["relation", "reach", ["from", "to"]],
    ["rule", ["reach", "?x", "?y"], ["edge", "?x", "?y"]],
    [
      "rule",
      ["reach", "?x", "?z"],
      ["edge", "?x", "?y"],
      ["reach", "?y", "?z"],
    ],
    ["query", ["reach", "b", "?to"]],
  ],
  "mutual recursion": [
    ["relation", "step", ["from", "to"]],
    ["relation", "even", ["from", "to"]],
    ["relation", "odd", ["from", "to"]],
    ["fact", ["step", 1, 2], ["step", 2, 3], ["step", 3, 4], ["step", 4, 5]],
    ["rule", ["odd", "?x", "?y"], ["step", "?x", "?y"]],
    ["rule", ["even", "?x", "?z"], ["odd", "?x", "?y"], ["step", "?y", "?z"]],
    ["rule", ["odd", "?x", "?z"], ["even", "?x", "?y"], ["step", "?y", "?z"]],
    ["query", ["even", 1, "?to"]],
  ],
  "facts and rules on one relation": [
    ...graph,
    ["fact", ["path", "q", "a"]],
    ["query", ["path", "q", "?to"]],
  ],
  "a query that binds its start through another relation": [
    ...graph,
    ["relation", "start", ["node"]],
    ["fact", ["start", "x"], ["start", "c"]],
    ["query", ["and", ["start", "?s"], ["path", "?s", "?to"]]],
  ],
  "constants in rule heads": [
    ["relation", "status", ["id", "state"]],
    ["relation", "ticket", ["id", "closed"]],
    ["fact", ["ticket", 1, true], ["ticket", 2, false]],
    ["rule", ["status", "?id", "open"], ["ticket", "?id", false]],
    ["rule", ["status", "?id", "closed"], ["ticket", "?id", true]],
    ["query", ["status", "?id", "closed"]],
  ],
  "computed head values": [
    ["relation", "price", ["item", "cents"]],
    ["relation", "taxed", ["item", "cents"]],
    ["fact", ["price", "pen", 100], ["price", "ink", 250]],
    [
      "rule",
      ["taxed", "?i", ["number/multiply", "?c", 2]],
      ["price", "?i", "?c"],
    ],
    ["query", ["taxed", "?item", 500]],
  ],
  "a repeated variable": [
    ...graph,
    ["relation", "loop", ["from", "to"]],
    ["rule", ["loop", "?x", "?x"], ["path", "?x", "?x"]],
    ["query", ["loop", "a", "?x"]],
  ],
  "or and anonymous variables": [
    ...graph,
    ["relation", "near", ["from", "to"]],
    [
      "rule",
      ["near", "?x", "?y"],
      ["or", ["edge", "?x", "?y"], ["edge", "?y", "?x"]],
    ],
    ["query", ["and", ["near", "c", "?n"], ["path", "?n", "?_"]]],
  ],
  negation: [
    ...graph,
    ["relation", "blocked", ["node"]],
    ["relation", "open", ["from", "to"]],
    ["fact", ["blocked", "c"]],
    [
      "rule",
      ["open", "?x", "?y"],
      ["path", "?x", "?y"],
      ["not", ["blocked", "?y"]],
    ],
    ["query", ["open", "a", "?to"]],
  ],
  "negation of a derived relation": [
    ...graph,
    ["relation", "unreached", ["from", "to"]],
    ["relation", "node", ["id"]],
    ["fact", ["node", "a"], ["node", "d"], ["node", "x"], ["node", "y"]],
    [
      "rule",
      ["unreached", "?x", "?y"],
      ["node", "?x"],
      ["node", "?y"],
      ["not", ["path", "?x", "?y"]],
    ],
    ["query", ["unreached", "a", "?to"]],
  ],
  "aggregates over derived relations": [
    ...graph,
    ["relation", "fanout", ["from", "n"]],
    ["rule", ["fanout", "?x", ["aggregate/count", "?y"]], ["path", "?x", "?y"]],
    ["query", ["fanout", "a", "?n"]],
  ],
  "rules over aggregates": [
    ...graph,
    ["relation", "fanout", ["from", "n"]],
    ["relation", "hub", ["node"]],
    ["rule", ["fanout", "?x", ["aggregate/count", "?y"]], ["path", "?x", "?y"]],
    [
      "rule",
      ["hub", "?x"],
      ["fanout", "?x", "?n"],
      ["number/greaterThan", "?n", 2],
    ],
    ["query", ["hub", "b"]],
  ],
  "lattice recursion": [
    ["relation", "road", ["from", "to", "km"]],
    ["relation", "dist", ["to", "km"]],
    ["relation", "close", ["to"]],
    [
      "fact",
      ["road", "a", "b", 4],
      ["road", "a", "c", 1],
      ["road", "c", "b", 2],
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
      ["close", "?to"],
      ["dist", "?to", "?km"],
      ["number/lessThan", "?km", 4],
    ],
    ["query", ["close", "b"]],
  ],
  "graph algorithms in rules": [
    ...graph,
    ["relation", "rank", ["node", "group"]],
    [
      "rule",
      ["rank", "?n", "?g"],
      ["graph/stronglyConnected", "edge", "?n", "?g"],
    ],
    ["query", ["rank", "b", "?group"]],
  ],
  "lists with in": [
    ["relation", "post", ["id", "tags"]],
    ["relation", "tagged", ["tag", "post"]],
    [
      "fact",
      ["post", "p1", ["array/make", "a", "b"]],
      ["post", "p2", ["array/make", "b"]],
    ],
    [
      "rule",
      ["tagged", "?t", "?p"],
      ["post", "?p", "?ts"],
      ["in", "?t", "?ts"],
    ],
    ["query", ["tagged", "b", "?post"]],
  ],
  "keyed relations": [
    ["relation", "manager", ["person", "boss"], { key: "person" }],
    ["relation", "above", ["person", "boss"]],
    [
      "fact",
      ["manager", "ana", "bo"],
      ["manager", "bo", "cy"],
      ["manager", "ana", "dee"],
      ["manager", "dee", "cy"],
    ],
    ["rule", ["above", "?p", "?b"], ["manager", "?p", "?b"]],
    [
      "rule",
      ["above", "?p", "?b"],
      ["above", "?p", "?m"],
      ["manager", "?m", "?b"],
    ],
    ["query", ["above", "ana", "?boss"]],
  ],
  "computed arguments in recursive calls": [
    ["relation", "num", ["n"]],
    ["relation", "down", ["n"]],
    ["rule", ["num", "?n"], ["in", "?n", ["array/range", 0, 15]]],
    ["fact", ["down", 14]],
    ["rule", ["down", "?n"], ["num", "?n"], ["down", ["number/add", "?n", 1]]],
    ["query", ["down", 3]],
  ],
  "lattice aggregates of computed values": [
    ["relation", "num", ["n"]],
    ["relation", "fib", ["n", "f"]],
    ["rule", ["num", "?n"], ["in", "?n", ["array/range", 0, 15]]],
    [
      "rule",
      ["fib", "?n", ["aggregate/max", "?n"]],
      ["in", "?n", ["array/make", 0, 1]],
    ],
    [
      "rule",
      ["fib", "?n", ["aggregate/max", ["number/add", "?a", "?b"]]],
      ["num", "?n"],
      ["number/greaterThan", "?n", 1],
      ["fib", ["number/subtract", "?n", 1], "?a"],
      ["fib", ["number/subtract", "?n", 2], "?b"],
    ],
    ["query", ["fib", 12, "?f"]],
  ],
};

const sorted = (rows: unknown) => (rows as unknown[]).map(valueKey).sort();

const runWith = (program: unknown[], goalDirected: boolean) =>
  run(["begin", ...program], stdlib, {
    database: new LogicDatabase({ goalDirected }),
  });

describe("goal-directed queries", () => {
  for (const [name, program] of Object.entries(CORPUS)) {
    it.effect(`match full evaluation: ${name}`, () =>
      Effect.gen(function* () {
        const directed = yield* runWith(program, true);
        const full = yield* runWith(program, false);
        expect(sorted(directed)).toEqual(sorted(full));
      })
    );
  }

  it.effect("find the expected answers", () =>
    Effect.gen(function* () {
      expect(
        sorted(
          yield* runWith(CORPUS["left recursion from a start"] ?? [], true)
        )
      ).toEqual(sorted(["a", "b", "c", "d"].map((to) => ({ to }))));
      expect(
        yield* runWith(
          CORPUS["lattice aggregates of computed values"] ?? [],
          true
        )
      ).toEqual([{ f: 144 }]);
      expect(
        yield* runWith(
          CORPUS["computed arguments in recursive calls"] ?? [],
          true
        )
      ).toEqual([{}]);
    })
  );

  it.effect("derive only what the query can reach", () =>
    Effect.gen(function* () {
      // Every number reaches the next one. Evaluating every relation in full
      // would derive about 1.1 million paths; the query needs six.
      const chain = [
        ["relation", "edge", ["from", "to"]],
        ["relation", "path", ["from", "to"]],
        [
          "rule",
          ["edge", "?n", ["number/add", "?n", 1]],
          ["in", "?n", ["array/range", 0, 1500]],
        ],
        ["rule", ["path", "?x", "?y"], ["edge", "?x", "?y"]],
        [
          "rule",
          ["path", "?x", "?z"],
          ["edge", "?x", "?y"],
          ["path", "?y", "?z"],
        ],
        ["query", ["path", 1494, "?to"]],
      ];
      const started = performance.now();
      const rows = yield* runWith(chain, true);
      expect(performance.now() - started).toBeLessThan(2000);
      expect(rows).toEqual(
        [1495, 1496, 1497, 1498, 1499, 1500].map((to) => ({ to }))
      );
    })
  );

  it.effect("never touch relations the query cannot reach", () =>
    Effect.gen(function* () {
      // Full evaluation fails on the string amount; the query never reaches it.
      const program = [
        ["relation", "spend", ["team", "amount"]],
        ["relation", "big", ["team"]],
        ["fact", ["spend", "web", 500], ["spend", "ops", "lots"]],
        [
          "rule",
          ["big", "?t"],
          ["spend", "?t", "?a"],
          ["number/greaterThan", "?a", 100],
        ],
        ["query", ["big", "web"]],
      ];
      expect(yield* runWith(program, true)).toEqual([{}]);
      const error = yield* runWith(program, false).pipe(Effect.flip);
      expect(String(error)).toContain("Expected number");
    })
  );

  it.effect("see facts and rules added after an earlier query", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        [
          "begin",
          ...graph,
          ["query", ["path", "x", "?to"]],
          ["fact", ["edge", "y", "z"]],
          ["query", ["path", "x", "?to"]],
        ],
        stdlib
      );
      expect(rows).toEqual([{ to: "y" }, { to: "z" }]);
    })
  );
});

import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { run } from "@/evaluation/evaluate";
import { defineAlgorithm } from "@/logic/algorithms";
import { stdlib } from "@/modules";

const roads = [
  ["relation", "road", ["from", "to", "km"]],
  [
    "fact",
    ["road", "a", "b", 4],
    ["road", "a", "c", 1],
    ["road", "c", "b", 2],
    ["road", "b", "d", 5],
    ["road", "d", "e", 1],
    ["road", "e", "d", 1],
  ],
];

const graph = (...expressions: unknown[]) => [
  "begin",
  ...roads,
  ...expressions,
];

const errorMessage = (expression: unknown, environment = stdlib) =>
  run(expression, environment).pipe(
    Effect.flip,
    Effect.map((error) => String((error as { message?: unknown }).message))
  );

describe("graph algorithms", () => {
  it.effect("find weighted shortest paths from a start node", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        graph([
          "query",
          ["graph/shortestPath", "road", "a", "?to", "?km", "?path"],
        ]),
        stdlib
      );
      expect(rows).toEqual([
        { to: "a", km: 0, path: ["a"] },
        { to: "c", km: 1, path: ["a", "c"] },
        { to: "b", km: 3, path: ["a", "c", "b"] },
        { to: "d", km: 8, path: ["a", "c", "b", "d"] },
        { to: "e", km: 9, path: ["a", "c", "b", "d", "e"] },
      ]);
    })
  );

  it.effect("count hops when edges have no weight column", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        [
          "begin",
          ["relation", "link", ["from", "to"]],
          ["fact", ["link", 1, 2], ["link", 2, 3], ["link", 1, 3]],
          ["query", ["graph/shortestPath", "link", 1, 3, "?hops", "?path"]],
        ],
        stdlib
      );
      expect(rows).toEqual([{ hops: 1, path: [1, 3] }]);
    })
  );

  it.effect("rank nodes with PageRank", () =>
    Effect.gen(function* () {
      const rows = (yield* run(
        graph([
          "query",
          ["graph/pageRank", "road", "?node", "?rank"],
          { order: "-rank" },
        ]),
        stdlib
      )) as { node: string; rank: number }[];
      expect(rows.map((row) => row.node)).toEqual(["d", "e", "b", "c", "a"]);
      const total = rows.reduce((sum, row) => sum + row.rank, 0);
      expect(total).toBeCloseTo(1, 5);
    })
  );

  it.effect("group nodes into components named after their smallest node", () =>
    Effect.gen(function* () {
      const weak = yield* run(
        [
          "begin",
          ["relation", "link", ["from", "to"]],
          ["fact", ["link", "b", "a"], ["link", "x", "y"], ["link", "c", "b"]],
          ["query", ["graph/components", "link", "?node", "?group"]],
        ],
        stdlib
      );
      expect(weak).toEqual([
        { node: "a", group: "a" },
        { node: "b", group: "a" },
        { node: "c", group: "a" },
        { node: "x", group: "x" },
        { node: "y", group: "x" },
      ]);
      const strong = yield* run(
        graph([
          "query",
          ["graph/stronglyConnected", "road", "?node", "?group"],
        ]),
        stdlib
      );
      expect(strong).toEqual([
        { node: "a", group: "a" },
        { node: "b", group: "b" },
        { node: "c", group: "c" },
        { node: "d", group: "d" },
        { node: "e", group: "d" },
      ]);
    })
  );

  it.effect("order a dependency graph, or report its cycle", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        [
          "begin",
          ["relation", "before", ["first", "then"]],
          [
            "fact",
            ["before", "build", "test"],
            ["before", "test", "ship"],
            ["before", "lint", "ship"],
          ],
          ["query", ["graph/topologicalOrder", "before", "?step", "?n"]],
        ],
        stdlib
      );
      expect(rows).toEqual([
        { step: "build", n: 0 },
        { step: "lint", n: 1 },
        { step: "test", n: 2 },
        { step: "ship", n: 3 },
      ]);
      expect(
        yield* errorMessage(
          graph(["query", ["graph/topologicalOrder", "road", "?n", "?p"]])
        )
      ).toContain('found a cycle among "d", "e"');
    })
  );

  it.effect("feed rules, negation, aggregates, and why", () =>
    Effect.gen(function* () {
      const program = graph(
        ["relation", "far", ["node"]],
        ["relation", "near", ["node"]],
        ["relation", "spread", ["most"]],
        [
          "rule",
          ["far", "?n"],
          ["graph/shortestPath", "road", "a", "?n", "?km", "?_"],
          ["number/greaterThan", "?km", 5],
        ],
        [
          "rule",
          ["near", "?n"],
          ["road", "?n", "?_", "?_"],
          ["not", ["far", "?n"]],
        ],
        [
          "rule",
          ["spread", ["aggregate/max", "?km"]],
          ["graph/shortestPath", "road", "a", "?_", "?km", "?_"],
        ]
      );
      expect(
        yield* run([...program, ["query", ["near", "?n"]]], stdlib)
      ).toEqual([{ n: "a" }, { n: "c" }, { n: "b" }]);
      expect(
        yield* run([...program, ["query", ["spread", "?most"]]], stdlib)
      ).toEqual([{ most: 9 }]);
      expect(yield* run([...program, ["why", ["far", "e"]]], stdlib)).toEqual({
        fact: ["far", "e"],
        rule: [
          "rule",
          ["far", "?n"],
          ["graph/shortestPath", "road", "a", "?n", "?km", "?_"],
          ["number/greaterThan", "?km", 5],
        ],
        because: [
          {
            fact: [
              "graph/shortestPath",
              "road",
              "a",
              "e",
              9,
              ["a", "c", "b", "d", "e"],
            ],
            computed: true,
          },
          { check: ["number/greaterThan", 9, 5] },
        ],
      });
    })
  );

  it.effect("update when the input relation changes", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        graph(
          ["query", ["graph/shortestPath", "road", "a", "d", "?km", "?_"]],
          ["fact", ["road", "a", "d", 2]],
          ["query", ["graph/shortestPath", "road", "a", "d", "?km", "?_"]]
        ),
        stdlib
      );
      expect(rows).toEqual([{ km: 2 }]);
    })
  );
});

describe("graph algorithm checks", () => {
  it.effect("reject wrong arguments", () =>
    Effect.gen(function* () {
      expect(
        yield* errorMessage(graph(["graph/pageRank", "road", "?n"]))
      ).toContain('"graph/pageRank" takes 3 arguments (edges, node, rank)');
      expect(
        yield* errorMessage(graph(["graph/pageRank", "nowhere", "?n", "?r"]))
      ).toContain('expects a relation for "edges"');
    })
  );

  it.effect("reject negative weights", () =>
    Effect.gen(function* () {
      expect(
        yield* errorMessage(
          graph(
            ["fact", ["road", "a", "z", -1]],
            ["query", ["graph/shortestPath", "road", "a", "?to", "?c", "?p"]]
          )
        )
      ).toContain("needs weights of at least 0");
    })
  );

  it.effect("keep computed relations read-only and out of cycles", () =>
    Effect.gen(function* () {
      expect(
        yield* errorMessage(graph(["fact", ["graph/pageRank", "road", "a", 1]]))
      ).toContain('["graph/pageRank","road"] is computed from its inputs');
      expect(
        yield* errorMessage(
          graph([
            "rule",
            ["graph/pageRank", "road", "?n", 1],
            ["road", "?n", "?_", "?_"],
          ])
        )
      ).toContain("Rules cannot add to");
      expect(
        yield* errorMessage(
          graph(
            ["relation", "link", ["from", "to"]],
            [
              "rule",
              ["link", "?a", "?b"],
              ["graph/components", "link", "?a", "?b"],
            ]
          )
        )
      ).toContain("cannot be part of a recursive cycle");
    })
  );
});

describe("defineAlgorithm", () => {
  it.effect("lets a host add its own algorithm", () =>
    Effect.gen(function* () {
      const degree = defineAlgorithm({
        name: "my/degree",
        inputs: [{ kind: "relation", name: "edges" }],
        columns: ["node", "degree"],
        run: ([tuples]) => {
          const counts = new Map<unknown, number>();
          for (const [from] of tuples as unknown[][]) {
            counts.set(from, (counts.get(from) ?? 0) + 1);
          }
          return [...counts];
        },
      });
      const rows = yield* run(
        graph(["query", ["my/degree", "road", "?node", "?degree"]]),
        { ...stdlib, "my/degree": degree }
      );
      expect(rows).toEqual([
        { node: "a", degree: 2 },
        { node: "c", degree: 1 },
        { node: "b", degree: 1 },
        { node: "d", degree: 1 },
        { node: "e", degree: 1 },
      ]);
    })
  );
});

import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
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

const smallNode = Arbitrary.map(
  Arbitrary.schema(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 }))
  ),
  (i) => `n${i}`
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
      ).toContain(
        '["graph/pageRank","road"] is computed from its inputs, so a rule cannot add to it.'
      );
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

const nodeName = Schema.Literals(["a", "b", "c", "d", "e"]);
const dirEdge = Arbitrary.schema(Schema.Tuple([nodeName, nodeName]));
const graphEdges = Arbitrary.array(dirEdge, { minLength: 1, maxLength: 10 });
const dagEdge = Arbitrary.schema(
  Schema.Tuple([
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 })),
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 })),
  ])
);
const weightedEdge = Arbitrary.schema(
  Schema.Tuple([
    Schema.Literals(["a", "b", "c", "d"]),
    Schema.Literals(["a", "b", "c", "d"]),
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 5 })),
  ])
);
const weightedGraph = Arbitrary.array(weightedEdge, {
  minLength: 1,
  maxLength: 8,
});

/** Independent brute-force all-pairs shortest-path betweenness reference model. */
const bruteBetweenness = (
  edges: readonly (readonly [string, string, number])[]
): Map<string, number> => {
  const nodeSet = new Set<string>();
  for (const [u, v] of edges) {
    nodeSet.add(u);
    nodeSet.add(v);
  }
  const nodes = [...nodeSet].sort();
  const minW = new Map<string, Map<string, number>>();
  for (const [u, v, w] of edges) {
    if (u === v) {
      continue;
    }
    const row = minW.get(u) ?? new Map<string, number>();
    const prev = row.get(v);
    if (prev === undefined || w < prev) {
      row.set(v, w);
    }
    minW.set(u, row);
  }
  const scores = new Map(nodes.map((n) => [n, 0]));
  for (const s of nodes) {
    for (const t of nodes) {
      if (s === t) {
        continue;
      }
      // Enumerate all simple paths from s to t to find exact shortest cost and count.
      let bestCost = Number.POSITIVE_INFINITY;
      let shortestPaths: string[][] = [];
      const dfs = (cur: string, cost: number, path: string[]) => {
        if (cost > bestCost) {
          return;
        }
        if (cur === t) {
          if (cost < bestCost) {
            bestCost = cost;
            shortestPaths = [path];
          } else {
            shortestPaths.push(path);
          }
          return;
        }
        for (const [next, w] of minW.get(cur) ?? []) {
          if (!path.includes(next)) {
            dfs(next, cost + w, [...path, next]);
          }
        }
      };
      dfs(s, 0, [s]);
      if (shortestPaths.length === 0) {
        continue;
      }
      for (const v of nodes) {
        if (v === s || v === t) {
          continue;
        }
        const through = shortestPaths.filter((p) => p.includes(v)).length;
        scores.set(v, (scores.get(v) ?? 0) + through / shortestPaths.length);
      }
    }
  }
  for (const [n, val] of scores) {
    scores.set(n, Math.round(val * 1e6) / 1e6);
  }
  return scores;
};

describe("graph/cycles, graph/transitiveReduction, and graph/betweenness", () => {
  it.effect.prop(
    "graph/cycles is empty iff graph/topologicalOrder succeeds, returns valid simple shortest cycles per cyclic SCC, and is order-independent",
    { pairs: graphEdges },
    ({ pairs }) =>
      Effect.gen(function* () {
        const edgeSet = new Set(pairs.map(([u, v]) => `${u}->${v}`));
        const forward = (yield* run(
          [
            "begin",
            ["relation", "edge", ["from", "to"]],
            ["fact", ...pairs.map(([u, v]) => ["edge", u, v])],
            ["query", ["graph/cycles", "edge", "?component", "?cycle"]],
          ],
          stdlib
        )) as readonly {
          readonly component: string;
          readonly cycle: readonly string[];
        }[];
        const reversed = yield* run(
          [
            "begin",
            ["relation", "edge", ["from", "to"]],
            ["fact", ...[...pairs].reverse().map(([u, v]) => ["edge", u, v])],
            ["query", ["graph/cycles", "edge", "?component", "?cycle"]],
          ],
          stdlib
        );
        expect(forward).toEqual(reversed);

        const topo = yield* Effect.result(
          run(
            [
              "begin",
              ["relation", "edge", ["from", "to"]],
              ["fact", ...pairs.map(([u, v]) => ["edge", u, v])],
              ["query", ["graph/topologicalOrder", "edge", "?n", "?p"]],
            ],
            stdlib
          )
        );
        expect(forward.length === 0).toBe(topo._tag === "Success");

        for (const { component, cycle } of forward) {
          expect(cycle.length).toBeGreaterThanOrEqual(2);
          expect(cycle[0]).toBe(component);
          expect(cycle.at(-1)).toBe(component);
          const inner = cycle.slice(0, -1);
          expect(new Set(inner).size).toBe(inner.length);
          for (let at = 0; at < cycle.length - 1; at += 1) {
            expect(edgeSet.has(`${cycle[at]}->${cycle[at + 1]}`)).toBe(true);
          }
        }
      }),
    { arbitrary: { runs: 60 } }
  );

  it.effect.prop(
    "graph/transitiveReduction on a DAG preserves exact reachability, is minimal, and is order-independent; cyclic graphs are refused",
    { raw: Arbitrary.array(dagEdge, { minLength: 1, maxLength: 12 }) },
    ({ raw }) =>
      Effect.gen(function* () {
        // Strict u < v guarantees a DAG.
        const dag = raw
          .filter(([u, v]) => u !== v)
          .map(([u, v]) => (u < v ? ([u, v] as const) : ([v, u] as const)));
        if (dag.length === 0) {
          return;
        }
        const uniqueDag = [
          ...new Map(dag.map((e) => [`${e[0]}:${e[1]}`, e])).values(),
        ];
        const reduced = (yield* run(
          [
            "begin",
            ["relation", "e", ["from", "to"]],
            ["fact", ...uniqueDag.map(([u, v]) => ["e", u, v])],
            [
              "query",
              ["graph/transitiveReduction", "e", "?from", "?to"],
              { order: ["from", "to"] },
            ],
          ],
          stdlib
        )) as readonly { readonly from: number; readonly to: number }[];
        const reversed = yield* run(
          [
            "begin",
            ["relation", "e", ["from", "to"]],
            ["fact", ...[...uniqueDag].reverse().map(([u, v]) => ["e", u, v])],
            [
              "query",
              ["graph/transitiveReduction", "e", "?from", "?to"],
              { order: ["from", "to"] },
            ],
          ],
          stdlib
        );
        expect(reduced).toEqual(reversed);

        // Subset of original edges.
        const origKeys = new Set(uniqueDag.map(([u, v]) => `${u}:${v}`));
        for (const { from, to } of reduced) {
          expect(origKeys.has(`${from}:${to}`)).toBe(true);
        }

        // Exact same transitive closure as original DAG.
        const reachOf = (edgeList: readonly (readonly [number, number])[]) =>
          run(
            [
              "begin",
              ["relation", "e", ["from", "to"]],
              ["fact", ...edgeList.map(([u, v]) => ["e", u, v])],
              ["relation", "r", ["from", "to"]],
              ["rule", ["r", "?a", "?b"], ["e", "?a", "?b"]],
              ["rule", ["r", "?a", "?c"], ["r", "?a", "?b"], ["e", "?b", "?c"]],
              ["query", ["r", "?a", "?b"], { order: ["a", "b"] }],
            ],
            stdlib
          );
        const origReach = yield* reachOf(uniqueDag);
        const redPairs = reduced.map(({ from, to }) => [from, to] as const);
        expect(yield* reachOf(redPairs)).toEqual(origReach);

        // Minimality: removing any single edge loses reachability for that pair.
        for (let at = 0; at < redPairs.length; at += 1) {
          const without = redPairs.filter((_, i) => i !== at);
          const [u, v] = redPairs[at] as readonly [number, number];
          const stillReaches =
            without.length > 0 &&
            (yield* run(
              [
                "begin",
                ["relation", "e", ["from", "to"]],
                ["fact", ...without.map(([a, b]) => ["e", a, b])],
                ["relation", "r", ["from", "to"]],
                ["rule", ["r", "?a", "?b"], ["e", "?a", "?b"]],
                [
                  "rule",
                  ["r", "?a", "?c"],
                  ["r", "?a", "?b"],
                  ["e", "?b", "?c"],
                ],
                ["query", ["r", u, v]],
              ],
              stdlib
            ));
          expect(stillReaches).toEqual(without.length === 0 ? false : []);
        }

        // Adding a back-edge creates a cycle which transitiveReduction refuses.
        const [firstU, firstV] = uniqueDag[0] as readonly [number, number];
        const msg = yield* errorMessage([
          "begin",
          ["relation", "e", ["from", "to"]],
          [
            "fact",
            ...uniqueDag.map(([u, v]) => ["e", u, v]),
            ["e", firstV, firstU],
          ],
          ["query", ["graph/transitiveReduction", "e", "?from", "?to"]],
        ]);
        expect(msg).toContain("found a cycle");
      }),
    { arbitrary: { runs: 40 } }
  );

  it.effect.prop(
    "graph/betweenness matches brute-force all-pairs shortest paths for unweighted and weighted graphs, and is order-independent",
    { weighted: weightedGraph },
    ({ weighted }) =>
      Effect.gen(function* () {
        const unweighted = weighted.map(([u, v]) => [u, v, 1] as const);
        const expectedUnweighted = bruteBetweenness(unweighted);
        const actualUnweighted = (yield* run(
          [
            "begin",
            ["relation", "e", ["from", "to"]],
            ["fact", ...weighted.map(([u, v]) => ["e", u, v])],
            ["query", ["graph/betweenness", "e", "?node", "?score"]],
          ],
          stdlib
        )) as readonly { readonly node: string; readonly score: number }[];
        for (const { node, score } of actualUnweighted) {
          expect(score).toBe(expectedUnweighted.get(node));
        }
        expect(actualUnweighted.length).toBe(expectedUnweighted.size);

        const expectedWeighted = bruteBetweenness(weighted);
        const actualWeighted = (yield* run(
          [
            "begin",
            ["relation", "e", ["from", "to", "w"]],
            ["fact", ...weighted.map(([u, v, w]) => ["e", u, v, w])],
            ["query", ["graph/betweenness", "e", "?node", "?score"]],
          ],
          stdlib
        )) as readonly { readonly node: string; readonly score: number }[];
        const reversedWeighted = yield* run(
          [
            "begin",
            ["relation", "e", ["from", "to", "w"]],
            [
              "fact",
              ...[...weighted].reverse().map(([u, v, w]) => ["e", u, v, w]),
            ],
            ["query", ["graph/betweenness", "e", "?node", "?score"]],
          ],
          stdlib
        );
        expect(actualWeighted).toEqual(reversedWeighted);
        for (const { node, score } of actualWeighted) {
          expect(score).toBe(expectedWeighted.get(node));
        }
      }),
    { arbitrary: { runs: 50 } }
  );

  it.effect.prop(
    "graph/lca matches an independent BFS+reachability oracle on arbitrary DAGs and refuses cycles",
    {
      rawEdges: Arbitrary.array(
        Arbitrary.all([
          Arbitrary.map(
            Arbitrary.schema(
              Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 }))
            ),
            (i) => `n${i}`
          ),
          Arbitrary.map(
            Arbitrary.schema(
              Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 }))
            ),
            (i) => `n${i}`
          ),
        ]),
        {
          minLength: 0,
          maxLength: 14,
        }
      ),
      a: Arbitrary.map(
        Arbitrary.schema(
          Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 }))
        ),
        (i) => `n${i}`
      ),
      b: Arbitrary.map(
        Arbitrary.schema(
          Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 }))
        ),
        (i) => `n${i}`
      ),
    },
    ({ rawEdges, a, b }) =>
      Effect.gen(function* () {
        // Build a DAG by orienting edges strictly from smaller to larger node id.
        const dag = [
          ...new Map(
            rawEdges
              .filter(([u, v]) => u < v)
              .map(([u, v]) => [`${u},${v}`, [u, v] as const])
          ).values(),
        ];
        const out = new Map<string, Set<string>>();
        for (const [u, v] of dag) {
          const set = out.get(u) ?? new Set<string>();
          set.add(v);
          out.set(u, set);
        }
        const bfs = (start: string) => {
          const dist = new Map<string, number>([[start, 0]]);
          const q = [start];
          for (const u of q) {
            const d = (dist.get(u) as number) + 1;
            for (const v of out.get(u) ?? []) {
              if (!dist.has(v)) {
                dist.set(v, d);
                q.push(v);
              }
            }
          }
          return dist;
        };
        const distA = bfs(a);
        const distB = bfs(b);
        const common = [...distA.keys()].filter((k) => distB.has(k));
        const expected = common
          .filter((x) => !common.some((y) => y !== x && bfs(y).has(x)))
          .sort()
          .map((lca) => ({
            lca,
            da: distA.get(lca),
            db: distB.get(lca),
          }));

        const actual = yield* run(
          [
            "begin",
            ["relation", "isa", ["child", "parent"]],
            ...(dag.length === 0
              ? []
              : [["fact", ...dag.map(([u, v]) => ["isa", u, v])]]),
            [
              "query",
              ["graph/lca", "isa", a, b, "?lca", "?da", "?db"],
              { order: "lca" },
            ],
          ],
          stdlib
        );
        expect(actual).toEqual(expected);

        // Order independence
        const reversed = yield* run(
          [
            "begin",
            ["relation", "isa", ["child", "parent"]],
            ...(dag.length === 0
              ? []
              : [
                  [
                    "fact",
                    ...[...dag].reverse().map(([u, v]) => ["isa", u, v]),
                  ],
                ]),
            [
              "query",
              ["graph/lca", "isa", a, b, "?lca", "?da", "?db"],
              { order: "lca" },
            ],
          ],
          stdlib
        );
        expect(actual).toEqual(reversed);
      }),
    { arbitrary: { runs: 60 } }
  );

  it.effect.prop(
    "graph/simplePaths matches an independent brute-force DFS oracle on arbitrary weighted cyclic graphs",
    {
      edges: Arbitrary.array(
        Arbitrary.all([
          smallNode,
          smallNode,
          Arbitrary.schema(
            Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 }))
          ),
        ]),
        { minLength: 0, maxLength: 10 }
      ),
      start: smallNode,
      end: smallNode,
      maxHops: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 4 }))
      ),
    },
    ({ edges, start, end, maxHops }) =>
      Effect.gen(function* () {
        // Independent brute-force DFS over deduplicated minimum-weight edges.
        const minEdge = new Map<string, Map<string, number>>();
        for (const [u, v, w] of edges) {
          const row = minEdge.get(u) ?? new Map<string, number>();
          const prev = row.get(v);
          if (prev === undefined || w < prev) {
            row.set(v, w);
          }
          minEdge.set(u, row);
        }
        const expected: { cost: number; path: string[] }[] = [];
        const walk = (u: string, cost: number, path: string[]) => {
          if (u === end) {
            expected.push({ cost, path: [...path] });
            return;
          }
          if (path.length - 1 >= maxHops) {
            return;
          }
          for (const [v, w] of minEdge.get(u) ?? []) {
            if (!path.includes(v)) {
              walk(v, cost + w, [...path, v]);
            }
          }
        };
        walk(start, 0, [start]);
        expected.sort((x, y) =>
          x.cost === y.cost
            ? JSON.stringify(x.path).localeCompare(JSON.stringify(y.path))
            : x.cost - y.cost
        );

        const actual = yield* run(
          [
            "begin",
            ["relation", "e", ["from", "to", "w"]],
            ...(edges.length === 0
              ? []
              : [["fact", ...edges.map(([u, v, w]) => ["e", u, v, w])]]),
            [
              "query",
              ["graph/simplePaths", "e", start, end, maxHops, "?cost", "?path"],
              { order: ["cost", "path"] },
            ],
          ],
          stdlib
        );
        expect(actual).toEqual(expected);

        const reversed = yield* run(
          [
            "begin",
            ["relation", "e", ["from", "to", "w"]],
            ...(edges.length === 0
              ? []
              : [
                  [
                    "fact",
                    ...[...edges].reverse().map(([u, v, w]) => ["e", u, v, w]),
                  ],
                ]),
            [
              "query",
              ["graph/simplePaths", "e", start, end, maxHops, "?cost", "?path"],
              { order: ["cost", "path"] },
            ],
          ],
          stdlib
        );
        expect(actual).toEqual(reversed);
      }),
    { arbitrary: { runs: 60 } }
  );

  it.effect.prop(
    "graph/dominators matches an independent set-intersection dominator oracle on arbitrary cyclic graphs and forms a DAG tree",
    {
      edges: Arbitrary.array(Arbitrary.all([smallNode, smallNode]), {
        minLength: 0,
        maxLength: 14,
      }),
      start: smallNode,
    },
    ({ edges, start }) =>
      Effect.gen(function* () {
        // Independent set-intersection fixed-point dominator solver:
        // Dom(start) = {start}; Dom(v) = {v} U intersect_{p in pred(v)} Dom(p).
        const out = new Map<string, Set<string>>();
        for (const [u, v] of edges) {
          const s = out.get(u) ?? new Set<string>();
          s.add(v);
          out.set(u, s);
        }
        const reachable = new Set<string>([start]);
        const queue = [start];
        for (const u of queue) {
          for (const v of out.get(u) ?? []) {
            if (!reachable.has(v)) {
              reachable.add(v);
              queue.push(v);
            }
          }
        }
        const preds = new Map<string, Set<string>>();
        for (const u of reachable) {
          for (const v of out.get(u) ?? []) {
            if (reachable.has(v)) {
              const s = preds.get(v) ?? new Set<string>();
              s.add(u);
              preds.set(v, s);
            }
          }
        }
        const dom = new Map<string, Set<string>>();
        for (const v of reachable) {
          dom.set(v, v === start ? new Set([start]) : new Set(reachable));
        }
        let changed = true;
        while (changed) {
          changed = false;
          for (const v of reachable) {
            if (v === start) {
              continue;
            }
            const ps = [...(preds.get(v) ?? [])];
            const next = new Set<string>([v]);
            for (const candidate of reachable) {
              if (ps.every((p) => dom.get(p)?.has(candidate))) {
                next.add(candidate);
              }
            }
            const prev = dom.get(v) as Set<string>;
            if (
              next.size !== prev.size ||
              [...next].some((x) => !prev.has(x))
            ) {
              dom.set(v, next);
              changed = true;
            }
          }
        }
        // Immediate dominator of v != start is the unique strict dominator d
        // dominated by every other strict dominator of v (i.e. |Dom(d)| == |Dom(v)| - 1).
        const expected = [...reachable]
          .filter((v) => v !== start)
          .sort()
          .map((v) => {
            const vDom = dom.get(v) as Set<string>;
            const idom = [...vDom].find(
              (d) => d !== v && (dom.get(d)?.size ?? 0) === vDom.size - 1
            );
            return { node: v, idom };
          });

        const actual = yield* run(
          [
            "begin",
            ["relation", "e", ["from", "to"]],
            ["relation", "idom", ["node", "dom"]],
            ...(edges.length === 0
              ? []
              : [["fact", ...edges.map(([u, v]) => ["e", u, v])]]),
            [
              "rule",
              ["idom", "?n", "?d"],
              ["graph/dominators", "e", start, "?n", "?d"],
            ],
            // Also verify the dominator tree is always acyclic (topologicalOrder succeeds).
            {
              doms: ["query", ["idom", "?node", "?idom"], { order: "node" }],
              topo: ["query", ["graph/topologicalOrder", "idom", "?n", "?pos"]],
            },
          ],
          stdlib
        );
        expect((actual as { doms: unknown }).doms).toEqual(expected);
      }),
    { arbitrary: { runs: 60 } }
  );

  it.effect.prop(
    "graph/simplePaths never revisits a node when a cycle sits between start and end",
    {
      w1: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 5 }))
      ),
      w2: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 5 }))
      ),
      w3: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 5 }))
      ),
      extraHops: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3 }))
      ),
    },
    ({ w1, w2, w3, extraHops }) =>
      Effect.gen(function* () {
        // s -> a <-> b -> t has a 2-cycle a <-> b; maxHops >= 4 would loop without visited check.
        const rows = (yield* run(
          [
            "begin",
            ["relation", "e", ["from", "to", "w"]],
            [
              "fact",
              ["e", "s", "a", w1],
              ["e", "a", "b", w2],
              ["e", "b", "a", w2],
              ["e", "b", "t", w3],
            ],
            [
              "query",
              [
                "graph/simplePaths",
                "e",
                "s",
                "t",
                3 + extraHops,
                "?cost",
                "?path",
              ],
            ],
          ],
          stdlib
        )) as readonly { cost: number; path: string[] }[];
        expect(rows).toEqual([
          { cost: w1 + w2 + w3, path: ["s", "a", "b", "t"] },
        ]);
      }),
    { arbitrary: { runs: 25 } }
  );

  it.effect.prop(
    "graph/dominators converges on irreducible graphs needing multiple passes",
    {
      tail: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 4 }))
      ),
    },
    ({ tail }) =>
      Effect.gen(function* () {
        // Irreducible graph where RPO visits s -> a -> b -> c -> d, and edge s -> c
        // plus back-edge c -> b forces a second pass to lower idom(b) from a to s.
        const tailEdges = Array.from({ length: tail }, (_, i) => [
          "e",
          i === 0 ? "b" : `t${i - 1}`,
          `t${i}`,
        ]);
        const rows = (yield* run(
          [
            "begin",
            ["relation", "e", ["from", "to"]],
            [
              "fact",
              ["e", "s", "a"],
              ["e", "s", "c"],
              ["e", "a", "b"],
              ["e", "b", "c"],
              ["e", "c", "b"],
              ...tailEdges,
            ],
            [
              "query",
              ["graph/dominators", "e", "s", "?node", "?dom"],
              { order: "node" },
            ],
          ],
          stdlib
        )) as readonly { node: string; dom: string }[];
        const byNode = Object.fromEntries(rows.map((r) => [r.node, r.dom]));
        expect(byNode.a).toBe("s");
        expect(byNode.b).toBe("s");
        expect(byNode.c).toBe("s");
        expect(byNode.t0).toBe("b");
      }),
    { arbitrary: { runs: 10 } }
  );
});

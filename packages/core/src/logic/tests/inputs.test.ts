/**
 * An algorithm's value inputs are columns that must be bound before its goal
 * runs. A variable that another goal binds works like a value written in the
 * call: the model here is one query per value, each with the value in place.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect } from "effect";
import { run } from "@/evaluation/evaluate";
import { defineAlgorithm } from "@/logic/algorithms";
import { LogicDatabase } from "@/logic/database";
import { loadDatabase } from "@/logic/snapshot";
import { stdlib } from "@/modules";
import { edgeFact, element, NODES } from "./programs";

const edges = Arbitrary.array(edgeFact, { minLength: 1, maxLength: 8 });

const starts = Arbitrary.map(
  Arbitrary.array(element([...NODES, "z"]), { minLength: 1, maxLength: 4 }),
  (items) => [...new Set(items)].sort()
);

const declare = (facts: readonly unknown[]) => [
  ["relation", "edge", ["from", "to"]],
  ["relation", "start", ["at"]],
  ["relation", "node", ["name"]],
  ["relation", "reach", ["from", "to", "cost"]],
  ["relation", "apart", ["from", "to"]],
  ["fact", ...facts],
  ["fact", ...NODES.map((name) => ["node", name])],
];

const ORDER = { order: ["from", "to"] };

/** The model: shortest paths from each start, one constant query each. */
const fromEach = (facts: readonly unknown[], from: readonly string[]) =>
  Effect.gen(function* () {
    const rows: Record<string, unknown>[] = [];
    for (const start of from) {
      const found = (yield* run(
        [
          "begin",
          ...declare(facts),
          [
            "query",
            [
              "graph/shortestPath",
              "edge",
              ["quote", start],
              "?to",
              "?cost",
              "?path",
            ],
            { order: "to" },
          ],
        ],
        stdlib
      )) as Record<string, unknown>[];
      rows.push(...found.map((row) => ({ from: start, ...row })));
    }
    return rows;
  });

const OPTIONS = { timeout: 120_000 };

describe("an algorithm input bound by another goal", () => {
  it.effect.prop(
    "gives the rows of the same call with each value written in",
    { edges, starts },
    ({ edges: facts, starts: from }) =>
      Effect.gen(function* () {
        const rows = yield* run(
          [
            "begin",
            ...declare(facts),
            [
              "query",
              [
                "and",
                ["in", "?from", ["quote", from]],
                [
                  "graph/shortestPath",
                  "edge",
                  "?from",
                  "?to",
                  "?cost",
                  "?path",
                ],
              ],
              ORDER,
            ],
          ],
          stdlib
        );
        expect(rows).toEqual(yield* fromEach(facts, from));
      }),
    OPTIONS
  );

  it.effect.prop(
    "works in rules and under not, with any way of evaluating, and after a snapshot",
    { edges, starts },
    ({ edges: facts, starts: from }) =>
      Effect.gen(function* () {
        const model = yield* fromEach(facts, from);
        const reach = model.map(({ cost, from: start, to }) => ({
          from: start,
          to,
          cost,
        }));
        const apart = from.flatMap((start) =>
          NODES.filter(
            (name) =>
              !model.some((row) => row.from === start && row.to === name)
          ).map((to) => ({ from: start, to }))
        );
        const program = [
          "begin",
          ...declare(facts),
          ["fact", ...from.map((start) => ["start", ["quote", start]])],
          [
            "rule",
            ["reach", "?from", "?to", "?cost"],
            ["start", "?from"],
            ["graph/shortestPath", "edge", "?from", "?to", "?cost", "?_"],
          ],
          [
            "rule",
            ["apart", "?from", "?to"],
            ["start", "?from"],
            ["node", "?to"],
            ["not", ["graph/shortestPath", "edge", "?from", "?to", "?_", "?_"]],
          ],
        ];
        const ask = (database: LogicDatabase) =>
          run(
            {
              reach: ["query", ["reach", "?from", "?to", "?cost"], ORDER],
              apart: ["query", ["apart", "?from", "?to"], ORDER],
              one: [
                "query",
                ["reach", ["quote", from[0]], "?to", "?cost"],
                { order: "to" },
              ],
            },
            stdlib,
            { database }
          );
        const expected = {
          reach,
          apart,
          one: reach
            .filter((row) => row.from === from[0])
            .map(({ cost, to }) => ({ to, cost })),
        };
        for (const goalDirected of [true, false]) {
          const database = new LogicDatabase({ goalDirected });
          const snapshot = yield* run([...program, ["snapshot"]], stdlib, {
            database,
          });
          expect(yield* ask(database)).toEqual(expected);
          expect(yield* ask(yield* loadDatabase(snapshot, stdlib))).toEqual(
            expected
          );
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "is explained as the computed fact that names its value",
    { edges, starts },
    ({ edges: facts, starts: from }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        yield* run(["begin", ...declare(facts)], stdlib, { database });
        for (const { cost, from: start, path, to } of yield* fromEach(
          facts,
          from
        )) {
          const fact = [
            "graph/shortestPath",
            "edge",
            ["quote", start],
            ["quote", to],
            cost,
            ["quote", path],
          ];
          expect(yield* run(["why", fact], stdlib, { database })).toEqual({
            fact: ["graph/shortestPath", "edge", start, to, cost, path],
            computed: true,
          });
        }
      }),
    OPTIONS
  );
});

/**
 * An algorithm whose value inputs sit on both sides of its relation, and
 * that fails for one of them.
 */
const scale = defineAlgorithm({
  name: "my/scale",
  inputs: [
    { kind: "value", name: "factor" },
    { kind: "relation", name: "edges" },
    { kind: "value", name: "offset" },
  ],
  columns: ["from", "scaled"],
  run: ([factor, tuples, offset]) =>
    factor === 0
      ? "my/scale cannot scale by 0."
      : (tuples as [number, number][]).map(([from, to]) => [
          from,
          to * (factor as number) + (offset as number),
        ]),
});

const digit = element([0, 1, 2, 3]);
const digits = Arbitrary.map(
  Arbitrary.array(digit, { minLength: 1, maxLength: 3 }),
  (items) => [...new Set(items)].sort()
);
const pairs = Arbitrary.array(Arbitrary.all([digit, digit]), {
  minLength: 1,
  maxLength: 5,
});

describe("a host algorithm with several inputs", () => {
  it.effect.prop(
    "runs once per combination of input values, and fails when one of them does",
    { pairs, factors: digits, offsets: digits },
    ({ factors, offsets, pairs: links }) =>
      Effect.gen(function* () {
        const distinct = [
          ...new Map(links.map((link) => [String(link), link])).values(),
        ];
        const expected = factors.flatMap((factor) =>
          offsets.flatMap((offset) =>
            distinct.map(([from, to]) => ({
              factor,
              offset,
              from,
              scaled: to * factor + offset,
            }))
          )
        );
        const result = yield* run(
          [
            "begin",
            ["relation", "link", ["from", "to"]],
            ["fact", ...links.map(([from, to]) => ["link", from, to])],
            [
              "query",
              [
                "and",
                ["in", "?factor", ["quote", factors]],
                ["in", "?offset", ["quote", offsets]],
                ["my/scale", "?factor", "link", "?offset", "?from", "?scaled"],
              ],
            ],
          ],
          { ...stdlib, "my/scale": scale }
        ).pipe(
          Effect.catch((error) =>
            Effect.succeed(String((error as { message?: unknown }).message))
          )
        );
        if (factors.includes(0)) {
          expect(result).toBe("my/scale cannot scale by 0.");
        } else {
          const key = (row: object) => JSON.stringify(row);
          expect((result as object[]).map(key).sort()).toEqual(
            [...new Set(expected.map(key))].sort()
          );
        }
      }),
    OPTIONS
  );
});

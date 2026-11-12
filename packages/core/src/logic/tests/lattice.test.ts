import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { run } from "@/evaluation/evaluate";
import { MAX_LATTICE_ROUNDS } from "@/logic/model";
import { stdlib } from "@/modules";

const roads = [
  ["relation", "road", ["from", "to", "km"]],
  ["relation", "dist", ["to", "km"]],
  [
    "fact",
    ["road", "a", "b", 4],
    ["road", "a", "c", 1],
    ["road", "c", "b", 2],
    ["road", "b", "d", 5],
    ["road", "d", "a", 1],
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
];

const routes = [
  ["relation", "route", ["from", "to"]],
  ["relation", "best", ["to", "path"]],
  [
    "fact",
    ["route", "a", "b"],
    ["route", "a", "c"],
    ["route", "b", "d"],
    ["route", "c", "d"],
    ["route", "d", "e"],
    ["route", "e", "a"],
  ],
  [
    "rule",
    ["best", "?to", ["aggregate/shortest", ["array/make", "a", "?to"]]],
    ["route", "a", "?to"],
  ],
  [
    "rule",
    [
      "best",
      "?to",
      ["aggregate/shortest", ["array/concat", "?p", ["array/make", "?to"]]],
    ],
    ["best", "?via", "?p"],
    ["route", "?via", "?to"],
  ],
];

const logicError = (expression: unknown) =>
  run(expression, stdlib).pipe(
    Effect.flip,
    Effect.map((error) => String((error as { message?: unknown }).message))
  );

describe("lattice aggregates in recursion", () => {
  it.effect("find minimum distances around a cycle", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        ["begin", ...roads, ["query", ["dist", "?to", "?km"]]],
        stdlib
      );
      expect(rows).toEqual([
        { to: "c", km: 1 },
        { to: "b", km: 3 },
        { to: "d", km: 8 },
        { to: "a", km: 9 },
      ]);
    })
  );

  it.effect("find shortest paths, breaking ties by the smaller path", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        ["begin", ...routes, ["query", ["best", "?to", "?path"]]],
        stdlib
      );
      expect(rows).toEqual([
        { to: "b", path: ["a", "b"] },
        { to: "c", path: ["a", "c"] },
        { to: "d", path: ["a", "b", "d"] },
        { to: "e", path: ["a", "b", "d", "e"] },
        { to: "a", path: ["a", "b", "d", "e", "a"] },
      ]);
    })
  );

  it.effect("collect reachable sets with union", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        [
          "begin",
          ["relation", "edge", ["from", "to"]],
          ["relation", "reach", ["from", "nodes"]],
          ["fact", ["edge", "a", "b"], ["edge", "b", "c"], ["edge", "c", "d"]],
          [
            "rule",
            ["reach", "?x", ["aggregate/union", ["array/make", "?y"]]],
            ["edge", "?x", "?y"],
          ],
          [
            "rule",
            ["reach", "?x", ["aggregate/union", "?nodes"]],
            ["edge", "?x", "?y"],
            ["reach", "?y", "?nodes"],
          ],
          ["query", ["reach", "?from", "?nodes"]],
        ],
        stdlib
      );
      expect(rows).toEqual([
        { from: "c", nodes: ["d"] },
        { from: "b", nodes: ["c", "d"] },
        { from: "a", nodes: ["b", "c", "d"] },
      ]);
    })
  );

  it.effect("keep only the best row per group for later rules", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        [
          "begin",
          ...roads,
          ["relation", "far", ["to"]],
          [
            "rule",
            ["far", "?to"],
            ["dist", "?to", "?km"],
            ["number/greaterThan", "?km", 3],
          ],
          ["query", ["far", "?to"]],
        ],
        stdlib
      );
      expect(rows).toEqual([{ to: "d" }, { to: "a" }]);
    })
  );

  it.effect("explain a minimum with the chain that produced it", () =>
    Effect.gen(function* () {
      const explanation = yield* run(
        ["begin", ...roads, ["why", ["dist", "b", 3]]],
        stdlib
      );
      expect(explanation).toMatchObject({
        fact: ["dist", "b", 3],
        because: [
          {
            fact: ["dist", "c", 1],
            because: [{ fact: ["road", "a", "c", 1], given: true }],
          },
          { fact: ["road", "c", "b", 2], given: true },
        ],
      });
      expect(
        yield* run(["begin", ...roads, ["why", ["dist", "b", 4]]], stdlib)
      ).toBeNull();
    })
  );

  it.effect("stop a cycle that keeps improving", () =>
    Effect.gen(function* () {
      const message = yield* logicError([
        "begin",
        ...roads,
        ["fact", ["road", "b", "a", -10]],
        ["query", ["dist", "?to", "?km"]],
      ]);
      expect(message).toContain(
        `"dist" kept improving after ${MAX_LATTICE_ROUNDS} rounds`
      );
    })
  );
});

describe("recursive aggregate checks", () => {
  it.effect("reject aggregates that do not move one way", () =>
    Effect.gen(function* () {
      const message = yield* logicError([
        "begin",
        ["relation", "edge", ["from", "to"]],
        ["relation", "hops", ["node", "n"]],
        [
          "rule",
          ["hops", "?x", ["aggregate/sum", "?n"]],
          ["hops", "?y", "?n"],
          ["edge", "?y", "?x"],
        ],
      ]);
      expect(message).toContain(
        "Only aggregate/min, aggregate/max, aggregate/shortest, and aggregate/union can go through recursion"
      );
    })
  );

  it.effect("require every relation in the cycle to aggregate", () =>
    Effect.gen(function* () {
      const message = yield* logicError([
        "begin",
        ...roads,
        ["relation", "seen", ["to"]],
        ["rule", ["seen", "?to"], ["dist", "?to", "?_"]],
        [
          "rule",
          ["dist", "?to", ["aggregate/min", "?km"]],
          ["seen", "?via"],
          ["road", "?via", "?to", "?km"],
        ],
      ]);
      expect(message).toContain('"seen" must aggregate too');
    })
  );

  it.effect("still reject computed group columns while recursing", () =>
    Effect.gen(function* () {
      const message = yield* logicError([
        "begin",
        ["relation", "n", ["value", "best"]],
        [
          "rule",
          ["n", ["number/add", "?v", 1], ["aggregate/min", "?b"]],
          ["n", "?v", "?b"],
        ],
      ]);
      expect(message).toContain("computes a new value in its head");
    })
  );
});

describe("lattice aggregate functions on lists", () => {
  it.effect("combine a list right away", () =>
    Effect.gen(function* () {
      expect(
        yield* run(
          [
            "aggregate/shortest",
            ["array/make", ["array/make", 1, 2], ["array/make", 0, 9], "abc"],
          ],
          stdlib
        )
      ).toEqual([0, 9]);
      expect(
        yield* run(
          [
            "aggregate/union",
            ["array/make", ["array/make", 3, 1], ["array/make", 2, 3]],
          ],
          stdlib
        )
      ).toEqual([1, 2, 3]);
    })
  );
});

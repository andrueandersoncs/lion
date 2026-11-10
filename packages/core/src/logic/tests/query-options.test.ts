import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { analyze } from "@/analysis/analyze";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";

const scores = [
  ["relation", "score", ["player", "points"]],
  [
    "fact",
    ["score", "ana", 12],
    ["score", "bo", 30],
    ["score", "cy", 30],
    ["score", "dee", 7],
  ],
];

const query = (options: unknown) =>
  run(
    ["begin", ...scores, ["query", ["score", "?player", "?points"], options]],
    stdlib
  );

const queryError = (options: unknown) =>
  query(options).pipe(
    Effect.flip,
    Effect.map((error) => String((error as { message?: unknown }).message))
  );

describe("query options", () => {
  it.effect("sort by several keys, descending with a leading -", () =>
    Effect.gen(function* () {
      expect(yield* query({ order: ["-points", "player"] })).toEqual([
        { player: "bo", points: 30 },
        { player: "cy", points: 30 },
        { player: "ana", points: 12 },
        { player: "dee", points: 7 },
      ]);
      expect(yield* query({ order: "?player" })).toEqual([
        { player: "ana", points: 12 },
        { player: "bo", points: 30 },
        { player: "cy", points: 30 },
        { player: "dee", points: 7 },
      ]);
    })
  );

  it.effect("page with offset and limit", () =>
    Effect.gen(function* () {
      expect(yield* query({ order: "-points", limit: 2 })).toEqual([
        { player: "bo", points: 30 },
        { player: "cy", points: 30 },
      ]);
      expect(yield* query({ order: "points", offset: 1, limit: 2 })).toEqual([
        { player: "ana", points: 12 },
        { player: "bo", points: 30 },
      ]);
      expect(yield* query({ limit: 0 })).toEqual([]);
      expect(yield* query({ offset: 10 })).toEqual([]);
    })
  );

  it.effect("sort mixed values in a fixed order", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        [
          "begin",
          ["relation", "item", ["value"]],
          [
            "fact",
            ["item", "b"],
            ["item", 2],
            ["item", null],
            ["item", true],
            ["item", ["array/make", 1]],
            ["item", "a"],
            ["item", -1],
          ],
          ["query", ["item", "?value"], { order: "value" }],
        ],
        stdlib
      );
      expect(rows).toEqual([
        { value: null },
        { value: true },
        { value: -1 },
        { value: 2 },
        { value: "a" },
        { value: "b" },
        { value: [1] },
      ]);
    })
  );

  it.effect("assert that a query has answers, or none", () =>
    Effect.gen(function* () {
      expect(yield* query({ assert: "some", limit: 1 })).toHaveLength(1);
      expect(yield* queryError({ assert: "none" })).toContain(
        "expected no answers but found 4"
      );
      const missing = yield* run(
        [
          "begin",
          ...scores,
          ["query", ["score", "zed", "?points"], { assert: "some" }],
        ],
        stdlib
      ).pipe(Effect.flip);
      expect(String((missing as { message?: unknown }).message)).toContain(
        'expected at least one answer but found none: ["score","zed","?points"]'
      );
      expect(
        yield* run(
          [
            "begin",
            ...scores,
            ["query", ["score", "zed", "?points"], { assert: "none" }],
          ],
          stdlib
        )
      ).toEqual([]);
    })
  );

  it.effect("reject options it does not understand", () =>
    Effect.gen(function* () {
      expect(yield* queryError({ limt: 2 })).toContain(
        'Unknown query option "limt"'
      );
      expect(yield* queryError({ order: "-score" })).toContain(
        "the query's variables are ?player, ?points"
      );
      expect(yield* queryError({ limit: -1 })).toContain(
        "must be a whole number of at least 0"
      );
      expect(yield* queryError({ assert: "all" })).toContain(
        'must be "some" or "none"'
      );
      expect(yield* queryError(5)).toContain("Query options must be a record");
    })
  );

  it("are classified by the analyzer", () => {
    const node = analyze(["query", ["p", "?x"], { limit: 1 }]);
    expect(node.specialForm).toBe("query");
    expect(node.children.map((child) => child.role)).toEqual([
      "operator",
      "goal",
      "options",
    ]);
  });
});

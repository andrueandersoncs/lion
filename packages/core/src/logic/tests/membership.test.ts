import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { analyze } from "@/analysis/analyze";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";

const posts = [
  ["relation", "post", ["id", "tags"]],
  ["relation", "tagged", ["tag", "post"]],
  [
    "fact",
    ["post", "p1", ["array/make", "lisp", "json", "lisp"]],
    ["post", "p2", ["array/make", "json", "logic"]],
  ],
  [
    "rule",
    ["tagged", "?tag", "?p"],
    ["post", "?p", "?tags"],
    ["in", "?tag", "?tags"],
  ],
];

const errorMessage = (expression: unknown) =>
  run(expression, stdlib).pipe(
    Effect.flip,
    Effect.map((error) => String((error as { message?: unknown }).message))
  );

describe("in", () => {
  it.effect("binds a variable to each item of a list", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        ["begin", ...posts, ["query", ["tagged", "?tag", "?post"]]],
        stdlib
      );
      expect(rows).toEqual([
        { tag: "lisp", post: "p1" },
        { tag: "json", post: "p1" },
        { tag: "json", post: "p2" },
        { tag: "logic", post: "p2" },
      ]);
    })
  );

  it.effect("tests membership once the element is bound", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        [
          "begin",
          ...posts,
          [
            "query",
            ["and", ["post", "?post", "?tags"], ["in", "logic", "?tags"]],
          ],
        ],
        stdlib
      );
      expect(rows).toEqual([{ post: "p2", tags: ["json", "logic"] }]);
    })
  );

  it.effect("works on computed lists", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        [
          "begin",
          ["relation", "n", ["value"]],
          ["rule", ["n", "?x"], ["in", "?x", ["array/range", 0, 5]]],
          [
            "query",
            [
              "and",
              ["n", "?x"],
              ["in", "?y", ["array/make", "?x", ["number/multiply", "?x", 10]]],
              ["number/greaterThan", "?y", 3],
            ],
          ],
        ],
        stdlib
      );
      expect(rows).toEqual([
        { x: 1, y: 10 },
        { x: 2, y: 20 },
        { x: 3, y: 30 },
        { x: 4, y: 4 },
        { x: 4, y: 40 },
      ]);
    })
  );

  it.effect("is plain membership without logic variables", () =>
    Effect.gen(function* () {
      expect(yield* run(["in", "b", ["array/make", "a", "b"]], stdlib)).toBe(
        true
      );
      expect(yield* run(["in", 3, ["array/range", 0, 3]], stdlib)).toBe(false);
      expect(yield* errorMessage(["in", 1, 2])).toContain(
        '"in" expects a list, but found 2'
      );
    })
  );

  it.effect("reports a value that is not a list", () =>
    Effect.gen(function* () {
      const message = yield* errorMessage([
        "begin",
        ["relation", "p", ["value"]],
        ["fact", ["p", 5]],
        ["query", ["and", ["p", "?v"], ["in", "?x", "?v"]]],
      ]);
      expect(message).toContain('"in" expects a list, but "?v" is 5');
    })
  );

  it.effect("needs the list bound first", () =>
    Effect.gen(function* () {
      const message = yield* errorMessage(["query", ["in", "?x", "?list"]]);
      expect(message).toContain(
        'must first be bound by a relation, "=", "in", or "schema/fits?"'
      );
    })
  );

  it("is classified by the analyzer", () => {
    const node = analyze(["in", "?x", "?list"]);
    expect(node.specialForm).toBe("in");
    expect(node.children.map((child) => child.role)).toEqual([
      "operator",
      "element",
      "list",
    ]);
  });
});

describe("array/range", () => {
  it.effect("counts from start up to end", () =>
    Effect.gen(function* () {
      expect(yield* run(["array/range", 2, 5], stdlib)).toEqual([2, 3, 4]);
      expect(yield* run(["array/range", 5, 2], stdlib)).toEqual([]);
      expect(yield* errorMessage(["array/range", 0, 2_000_000])).toContain(
        "at most 1000000 numbers"
      );
    })
  );
});

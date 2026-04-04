import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";

describe("match special form", () => {
  it.effect("should require at least one pattern and a fallback function", () =>
    Effect.gen(function* () {
      const expression = [
        "match",
        1,
        ["value/string?", "value/identity"],
        ["lambda", ["x"], "x"],
      ];
      const result = yield* run(expression, stdlib);
      expect(result).toBe(1);
    })
  );
  it.effect(
    "should apply the function for the first pattern that matches",
    () =>
      Effect.gen(function* () {
        const expression = [
          "match",
          1,
          ["value/number?", ["lambda", ["x"], ["number/add", "x", 1]]],
          ["lambda", ["x"], "x"],
        ];
        const result = yield* run(expression, stdlib);
        expect(result).toBe(2);
        expect(result).not.toBe(1);
      })
  );
  it.effect("should apply ONLY the first pattern that matches", () =>
    Effect.gen(function* () {
      const expression = [
        "match",
        1,
        ["value/number?", ["lambda", ["x"], ["number/add", "x", 1]]],
        ["value/number?", ["lambda", ["x"], ["number/add", "x", 2]]],
        ["lambda", ["x"], "x"],
      ];
      const result = yield* run(expression, stdlib);
      expect(result).toBe(2);
      expect(result).not.toBe(3);
    })
  );
  it.effect("should apply the fallback function if no pattern matches", () =>
    Effect.gen(function* () {
      const expression = [
        "match",
        1,
        ["value/string?", "value/identity"],
        ["lambda", ["x"], "x"],
      ];
      const result = yield* run(expression, stdlib);
      expect(result).toBe(1);
    })
  );
  it.effect("should accept arbitrary predicates as pattern matchers", () =>
    Effect.gen(function* () {
      const expression = [
        "match",
        1,
        [
          ["lambda", ["x"], ["number/equals?", "x", 1]],
          ["lambda", ["x"], ["number/add", "x", 1]],
        ],
        ["lambda", ["x"], "x"],
      ];
      const result = yield* run(expression, stdlib);
      expect(result).toBe(2);
    })
  );
  it.effect(
    "should evaluate the value expression before applying the patterns",
    () =>
      Effect.gen(function* () {
        const expression = [
          "match",
          ["number/add", 1, 2],
          ["value/number?", ["lambda", ["x"], ["number/add", "x", 1]]],
          ["lambda", ["x"], "x"],
        ];
        const result = yield* run(expression, stdlib);
        expect(result).toBe(4);
      })
  );
  it.effect("should accept structural predicates as pattern matchers", () =>
    Effect.gen(function* () {
      const expression = [
        "match",
        { a: 1, b: 2 },
        [
          {
            a: "value/number?",
          },
          "value/identity",
        ],
        ["lambda", ["x"], 1],
      ];
      const result = yield* run(expression, stdlib);
      expect(result).toEqual({ a: 1, b: 2 });
    })
  );
  it.effect("should only match structural predicates if all substructures match", () =>
    Effect.gen(function* () {
      const expression = [
        "match",
        { a: 1, b: 2 },
        [
          {
            a: "value/number?",
            b: "value/boolean?",
          },
          "value/identity",
        ],
        ["lambda", ["x"], 1],
      ];
      const result = yield* run(expression, stdlib);
      expect(result).toEqual(1);
    })
  );
  it.effect("should match nested structural predicates", () =>
    Effect.gen(function* () {
      const expression = [
        "match",
        { a: { c: 3 }, b: 2 },
        [
          {
            a: {
              c: "value/number?",
            },
          },
          "value/identity",
        ],
        ["lambda", ["x"], 1],
      ];
      const result = yield* run(expression, stdlib);
      expect(result).toEqual({ a: { c: 3 }, b: 2 });
    })
  );
});

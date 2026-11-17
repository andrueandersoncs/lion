/**
 * A body hands its answers on a batch at a time, so it never holds them all
 * at once. That must not show: however many answers a body has, a query, a
 * rule, a find, and an aggregate get every one of them, once, in the order
 * a plain loop over the facts finds them. The numbers of facts here reach
 * well past one batch, and land on both sides of where a batch ends.
 *
 * What a failed assertion shows as an example must not depend on the order
 * the answers were found in either: it is the first in sort order.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { assertionProblem } from "@/logic/query-options";
import { stdlib } from "@/modules";
import { element } from "./programs";

const between = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

const range = (length: number) => Array.from({ length }, (_, at) => at);

/** Sizes around the ends of the first batches, and any size up to a few. */
const size = Arbitrary.flatMap(
  element([0, 1, 2, 3]),
  (batches): Arbitrary.Arbitrary<number> =>
    Arbitrary.map(between(-3, 3), (near) => Math.max(0, batches * 512 + near))
);

describe("the answers of a body with many answers", () => {
  it.effect.prop(
    "all reach a query, a rule, a find, and an aggregate, in order",
    { left: size, right: between(1, 3) },
    ({ left, right }) =>
      Effect.gen(function* () {
        const pairs = range(left).flatMap((x) =>
          range(right).map((y) => ({ x, y }))
        );
        const result = (yield* run(
          [
            "begin",
            ["relation", "a", ["x"]],
            ["relation", "b", ["y"]],
            ["relation", "pair", ["x", "y"]],
            ["relation", "total", ["y", "count"]],
            ...(left > 0
              ? [["fact", ...range(left).map((x) => ["a", x])]]
              : []),
            ["fact", ...range(right).map((y) => ["b", y])],
            ["rule", ["pair", "?x", "?y"], ["a", "?x"], ["b", "?y"]],
            [
              "rule",
              ["total", "?y", ["aggregate/count", "?x"]],
              ["a", "?x"],
              ["b", "?y"],
            ],
            {
              query: ["query", ["and", ["a", "?x"], ["b", "?y"]]],
              rule: ["query", ["pair", "?x", "?y"]],
              find: [
                "array/length",
                ["find", ["array/make", "?x", "?y"], ["pair", "?x", "?y"]],
              ],
              totals: ["query", ["total", "?y", "?count"], { order: "y" }],
            },
          ],
          stdlib
        )) as Record<string, unknown>;
        expect(result.query).toEqual(pairs);
        expect(result.rule).toEqual(pairs);
        expect(result.find).toBe(pairs.length);
        expect(result.totals).toEqual(
          left === 0 ? [] : range(right).map((y) => ({ y, count: left }))
        );
      }),
    { timeout: 120_000 }
  );
});

describe("the example a failed assertion shows", () => {
  it.prop(
    "is the same in whatever order the answers were found",
    {
      rows: Arbitrary.array(
        Arbitrary.all({ id: between(0, 5), name: element(["a", "b", "c"]) }),
        { minLength: 1, maxLength: 8 }
      ),
      turn: between(0, 7),
    },
    ({ rows, turn }) => {
      const turned = [
        ...rows.slice(turn % rows.length),
        ...rows.slice(0, turn % rows.length),
      ];
      const said = assertionProblem("query", "none", rows, ["p", "?id"]);
      expect(assertionProblem("query", "none", turned, ["p", "?id"])).toBe(
        said
      );
      expect(assertionProblem("query", "none", turned.reverse(), [])).toBe(
        assertionProblem("query", "none", rows, [])
      );
    }
  );
});

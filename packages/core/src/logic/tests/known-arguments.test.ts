/**
 * A goal-directed query derives only what it asks about. An argument counts
 * as known when it is a value, or a variable the query has already bound,
 * however it was bound, or a value computed from such variables. Whatever
 * the form, the answers are those of evaluating every relation in full.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { LogicDatabase } from "@/logic/database";
import { stdlib } from "@/modules";
import { element } from "./programs";

const LENGTH = 40;

/** Every number below LENGTH steps to the next, and `path` follows steps. */
const chain = [
  ["relation", "edge", ["from", "to"]],
  ["relation", "path", ["from", "to"]],
  ["relation", "start", ["at"]],
  [
    "rule",
    ["edge", "?n", ["number/add", "?n", 1]],
    ["in", "?n", ["array/range", 0, LENGTH]],
  ],
  ["rule", ["path", "?x", "?y"], ["edge", "?x", "?y"]],
  ["rule", ["path", "?x", "?z"], ["path", "?x", "?y"], ["edge", "?y", "?z"]],
];

const node = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: LENGTH - 6, maximum: LENGTH }))
);

const shift = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: -3, maximum: 3 }))
);

/** Ways to tell `path` where to start, each with the start it means. */
const FORMS: Record<
  string,
  (at: number, by: number) => { goal: unknown; from: number }
> = {
  "a value": (at) => ({ goal: ["path", at, "?to"], from: at }),
  "a variable bound by a relation": (at) => ({
    goal: ["and", ["start", "?s"], ["path", "?s", "?to"]],
    from: at,
  }),
  "a variable bound by =": (at) => ({
    goal: ["and", ["=", "?s", at], ["path", "?s", "?to"]],
    from: at,
  }),
  "a variable bound by in": (at) => ({
    goal: ["and", ["in", "?s", ["array/make", at]], ["path", "?s", "?to"]],
    from: at,
  }),
  "a variable bound to a computed value": (at, by) => ({
    goal: [
      "and",
      ["start", "?s"],
      ["=", "?t", ["number/add", "?s", by]],
      ["path", "?t", "?to"],
    ],
    from: at + by,
  }),
  "a value computed in the argument": (at, by) => ({
    goal: ["and", ["start", "?s"], ["path", ["number/add", "?s", by], "?to"]],
    from: at + by,
  }),
  "a cond in the argument": (at, by) => ({
    goal: [
      "and",
      ["start", "?s"],
      [
        "path",
        [
          "cond",
          [
            ["number/greaterThan", by, 0],
            ["number/add", "?s", by],
          ],
          ["else", "?s"],
        ],
        "?to",
      ],
    ],
    from: by > 0 ? at + by : at,
  }),
};

const OPTIONS = { timeout: 120_000 };

describe("a query that knows where a recursive relation starts", () => {
  it.effect.prop(
    "is answered goal-directed, with the answers of full evaluation",
    { at: node, by: shift, form: element(Object.keys(FORMS)) },
    ({ at, by, form }) =>
      Effect.gen(function* () {
        const { from, goal } = (FORMS[form] as (typeof FORMS)[string])(at, by);
        const expected = Array.from(
          { length: Math.max(0, LENGTH - Math.max(from, -1)) },
          (_, index) => Math.max(from, -1) + index + 1
        ).filter(() => from >= 0);
        for (const goalDirected of [true, false]) {
          const database = new LogicDatabase({ goalDirected });
          const rows = (yield* run(
            [
              "begin",
              ...chain,
              ["fact", ["start", at]],
              ["query", goal, { order: "to" }],
            ],
            stdlib,
            { database }
          )) as { to: number }[];
          expect(rows.map(({ to }) => to)).toEqual(expected);
          // A rewritten query keeps its own model; a full one never makes one.
          expect(database.goals.size).toBe(goalDirected ? 1 : 0);
          const paths = [...database.goals.values()].flatMap((model) =>
            [...model.relations].flatMap(([name, tuples]) =>
              name.includes("path") && !name.includes("magic")
                ? tuples.size
                : []
            )
          );
          // Goal-directed, it derives the paths from one start, not all 820.
          expect(paths.every((size) => size <= LENGTH)).toBe(true);
        }
      }),
    OPTIONS
  );
});

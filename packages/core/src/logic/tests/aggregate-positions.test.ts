/**
 * Where an aggregate call sits decides what it combines. As a whole argument
 * of a rule head it combines one value from every match. Anywhere else it
 * combines the list it is given, as it does outside of logic.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { AGGREGATORS } from "@/logic/aggregates";
import { stdlib } from "@/modules";
import { element } from "./programs";

const small = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: -5, maximum: 5 }))
);

const numbers = Arbitrary.array(small, { maxLength: 5 });

/** A list of numbers, or of lists for the aggregates that take those. */
const list: Arbitrary.Arbitrary<readonly unknown[]> = Arbitrary.flatMap(
  Arbitrary.schema(Schema.Boolean),
  (nested): Arbitrary.Arbitrary<readonly unknown[]> =>
    nested ? Arbitrary.array(numbers, { maxLength: 3 }) : numbers
);

const kind = element(Object.keys(AGGREGATORS));

/** The value, or the message of the error. */
const outcome = (program: unknown) =>
  run(program, stdlib).pipe(
    Effect.catch((error) =>
      Effect.succeed({
        failed: String((error as { message?: unknown }).message),
      })
    )
  );

const lists = (items: readonly (readonly unknown[])[]) => [
  ["relation", "item", ["id", "list"]],
  ["relation", "out", ["id", "result"]],
  ["fact", ...items.map((list, id) => ["item", id, ["quote", list]])],
];

const OPTIONS = { timeout: 120_000 };

describe("an aggregate call outside a rule head", () => {
  it.effect.prop(
    "combines the list it is given, as it does on a plain list",
    {
      kind,
      items: Arbitrary.array(list, { minLength: 1, maxLength: 4 }),
    },
    ({ items, kind: name }) =>
      Effect.gen(function* () {
        const call = [`aggregate/${name}`, "?list"];
        const model: unknown[] = [];
        let failed = false;
        for (const [id, item] of items.entries()) {
          const result = yield* outcome([`aggregate/${name}`, ["quote", item]]);
          failed ||=
            typeof result === "object" && result !== null && "failed" in result;
          model.push({ id, result });
        }
        const programs = {
          "in a rule body": [
            "begin",
            [
              "rule",
              ["out", "?id", "?result"],
              ["item", "?id", "?list"],
              ["=", "?result", call],
            ],
            ["query", ["out", "?id", "?result"], { order: "id" }],
          ],
          "inside a call in a rule head": [
            "begin",
            [
              "rule",
              ["out", "?id", ["value/identity", call]],
              ["item", "?id", "?list"],
            ],
            ["query", ["out", "?id", "?result"], { order: "id" }],
          ],
        };
        for (const program of Object.values(programs)) {
          const actual = yield* outcome(["begin", ...lists(items), program]);
          if (failed) {
            expect(actual).toHaveProperty("failed");
          } else {
            expect(actual).toEqual(model);
          }
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "says where it belongs when it is given something that is not a list",
    { kind, value: small },
    ({ kind: name, value }) =>
      Effect.gen(function* () {
        const result = yield* outcome([
          "query",
          ["and", ["=", "?v", value], ["=", "?r", [`aggregate/${name}`, "?v"]]],
        ]);
        expect(result).toEqual({
          failed: `aggregate/${name} expects a list, but found ${value}. An aggregate combines a rule's matches only as a whole argument of the rule's head.`,
        });
      }),
    OPTIONS
  );
});

describe("an aggregate call as a whole argument of a rule head", () => {
  it.effect.prop(
    "combines a constant once for every match",
    {
      ids: Arbitrary.array(small, { minLength: 1, maxLength: 6 }),
      value: small,
    },
    ({ ids, value }) =>
      Effect.gen(function* () {
        const matches = new Set(ids).size;
        const rows = yield* run(
          [
            "begin",
            ["relation", "n", ["x"]],
            ["relation", "stats", ["count", "sum", "least", "all"]],
            ["fact", ...ids.map((x) => ["n", x])],
            [
              "rule",
              [
                "stats",
                ["aggregate/count", value],
                ["aggregate/sum", value],
                ["aggregate/min", value],
                ["aggregate/collect", value],
              ],
              ["n", "?x"],
            ],
            ["query", ["stats", "?count", "?sum", "?least", "?all"]],
          ],
          stdlib
        );
        expect(rows).toEqual([
          {
            count: matches,
            sum: value * matches,
            least: value,
            all: Array.from({ length: matches }, () => value),
          },
        ]);
      }),
    OPTIONS
  );

  it.effect.prop(
    "combines one value from every match, and says so when the values are lists",
    { items: Arbitrary.array(numbers, { minLength: 1, maxLength: 4 }) },
    ({ items }) =>
      Effect.gen(function* () {
        const result = yield* outcome([
          "begin",
          ...lists(items),
          ["relation", "total", ["sum"]],
          [
            "rule",
            ["total", ["aggregate/sum", "?list"]],
            ["item", "?_", "?list"],
          ],
          ["query", ["total", "?sum"]],
        ]);
        expect(result).toHaveProperty("failed");
        const { failed } = result as { failed: string };
        expect(failed).toContain("aggregate/sum expects numbers, but found [");
        expect(failed).toContain(
          'To combine each match\'s own list, do it in the body, as in ["=", "?result", ["aggregate/sum", "?list"]].'
        );
      }),
    OPTIONS
  );
});

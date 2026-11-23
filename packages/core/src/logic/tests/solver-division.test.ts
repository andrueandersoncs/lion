/**
 * The solver decides floor, ceiling, round, remainder by a known non-zero
 * number, and value/integer? on arbitrary numbers. Every answer is checked
 * against plain code, and universal identities are proved over all numbers.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { type Certificate, checks } from "@/logic/certificate";
import { LogicDatabase } from "@/logic/database";
import { attempt, element, type Outcome, oneOf } from "./programs";
import { keyOf } from "./shapes";

const OPTIONS = { timeout: 120_000, arbitrary: { runs: 150 } };

const int = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

const evaluate = (form: unknown) => attempt(form, new LogicDatabase());

const resultOf = (outcome: Outcome) => {
  expect(outcome).toMatchObject({ ok: true });
  return outcome.ok ? outcome.value : undefined;
};

const keys = (values: unknown) =>
  [...new Set((values as unknown[]).map(keyOf))].sort();

const BOX = 5;
const RANGE = Array.from({ length: 2 * BOX + 1 }, (_, at) => at - BOX);

const nonZeroInt = Arbitrary.filter(int(-5, 5), (n) => n !== 0);

const divisor = oneOf<unknown>(
  nonZeroInt,
  element<unknown>([0.5, -0.5, 1.5, -1.5, ["number/divide", 1, 3]])
);

describe("solver: remainder, floor, ceiling, round, and value/integer?", () => {
  it.effect.prop(
    "number/remainder on whole numbers in a box agrees with listing the box",
    {
      a: int(-3, 3),
      b: int(-4, 4),
      k: divisor,
      target: oneOf<unknown>(int(-4, 4), element<unknown>([0, 0.5, -0.5])),
      op: element([
        "=",
        "number/lessThan",
        "number/lessThanOrEqualTo",
        "number/greaterThan",
        "number/greaterThanOrEqualTo",
      ]),
      negate: Arbitrary.schema(Schema.Boolean),
    },
    ({ a, b, k, negate, op, target }) =>
      Effect.gen(function* () {
        const expr = ["number/add", ["number/multiply", a, "?x"], b];
        const raw = [op, ["number/remainder", expr, k], target];
        const goal = negate ? ["not", raw] : raw;
        const bySolver = yield* evaluate([
          "find",
          "?x",
          [
            "and",
            ["schema/fits?", "?x", "value/integer?"],
            ["number/greaterThanOrEqualTo", "?x", -BOX],
            ["number/lessThanOrEqualTo", "?x", BOX],
            goal,
          ],
        ]);
        const byListing = yield* evaluate([
          "find",
          "?x",
          ["and", ["schema/fits?", "?x", ["schema/anyOf", ...RANGE]], goal],
        ]);
        expect(keys(resultOf(bySolver))).toEqual(keys(resultOf(byListing)));
      }),
    OPTIONS
  );

  it.effect.prop(
    "number/floor, number/ceiling, and number/round on numbers satisfy exact universal identities",
    {
      k: nonZeroInt,
      places: int(-1, 2),
      schema: element(["value/number?", "value/integer?"]),
    },
    ({ k, places, schema }) =>
      Effect.gen(function* () {
        const scaled = ["number/divide", "?x", k];
        // floor(u) <= u < floor(u) + 1 and ceiling(u) - 1 < u <= ceiling(u)
        const floorHolds = resultOf(
          yield* evaluate([
            "query",
            [
              "not",
              [
                "exists",
                ["?x"],
                [
                  "and",
                  ["schema/fits?", "?x", schema],
                  [
                    "or",
                    ["number/greaterThan", ["number/floor", scaled], scaled],
                    [
                      "number/greaterThanOrEqualTo",
                      scaled,
                      ["number/add", ["number/floor", scaled], 1],
                    ],
                  ],
                ],
              ],
            ],
          ])
        );
        expect(floorHolds).toEqual([{}]);

        const ceilingMatchesNegFloor = resultOf(
          yield* evaluate([
            "query",
            [
              "not",
              [
                "exists",
                ["?x"],
                [
                  "and",
                  ["schema/fits?", "?x", schema],
                  [
                    "not",
                    [
                      "=",
                      ["number/ceiling", scaled],
                      [
                        "number/multiply",
                        -1,
                        ["number/floor", ["number/multiply", -1, scaled]],
                      ],
                    ],
                  ],
                ],
              ],
            ],
          ])
        );
        expect(ceilingMatchesNegFloor).toEqual([{}]);

        // round(u, places) is within 0.5 * 10^-places of u
        const halfUnit =
          places >= 0
            ? ["number/divide", 1, 2 * 10 ** places]
            : ["number/divide", 10 ** -places, 2];
        const roundBounds = resultOf(
          yield* evaluate([
            "query",
            [
              "not",
              [
                "exists",
                ["?x"],
                [
                  "and",
                  ["schema/fits?", "?x", schema],
                  [
                    "or",
                    [
                      "number/greaterThan",
                      [
                        "number/subtract",
                        ["number/round", scaled, places],
                        scaled,
                      ],
                      halfUnit,
                    ],
                    [
                      "number/greaterThanOrEqualTo",
                      [
                        "number/subtract",
                        scaled,
                        ["number/round", scaled, places],
                      ],
                      halfUnit,
                    ],
                  ],
                ],
              ],
            ],
          ])
        );
        expect(roundBounds).toEqual([{}]);
      }),
    OPTIONS
  );

  it.effect.prop(
    "proves unbounded parity and divisibility properties over all whole numbers",
    {
      k: int(1, 7),
      extra: int(0, 4),
    },
    ({ extra, k }) =>
      Effect.gen(function* () {
        // For every whole x >= 0, x % k cannot equal k + extra.
        const impossible = resultOf(
          yield* evaluate([
            "query",
            [
              "not",
              [
                "exists",
                ["?x"],
                [
                  "and",
                  ["schema/fits?", "?x", "value/integer?"],
                  ["number/greaterThanOrEqualTo", "?x", 0],
                  ["=", ["number/remainder", "?x", k], k + extra],
                ],
              ],
            ],
          ])
        );
        expect(impossible).toEqual([{}]);

        // For every whole x, (k * x) % k = 0.
        const multiple = resultOf(
          yield* evaluate([
            "query",
            [
              "not",
              [
                "exists",
                ["?x"],
                [
                  "and",
                  ["schema/fits?", "?x", "value/integer?"],
                  [
                    "not",
                    [
                      "=",
                      ["number/remainder", ["number/multiply", k, "?x"], k],
                      0,
                    ],
                  ],
                ],
              ],
            ],
          ])
        );
        expect(multiple).toEqual([{}]);
      }),
    OPTIONS
  );

  it.effect.prop(
    "value/integer? on arbitrary numbers agrees with plain code in bounded and unbounded queries",
    {
      low: int(-4, 0),
      high: int(0, 4),
    },
    ({ high, low }) =>
      Effect.gen(function* () {
        const expected = Array.from(
          { length: high - low + 1 },
          (_, at) => low + at
        );
        const found = resultOf(
          yield* evaluate([
            "find",
            "?x",
            [
              "and",
              ["schema/fits?", "?x", "value/number?"],
              ["number/greaterThanOrEqualTo", "?x", low],
              ["number/lessThanOrEqualTo", "?x", high],
              ["value/integer?", "?x"],
            ],
          ])
        );
        expect(keys(found)).toEqual(keys(expected));

        // Between any low < high there exists a non-integer number, and for low == high there does not.
        const hasNonInt = resultOf(
          yield* evaluate([
            "query",
            [
              "exists",
              ["?x"],
              [
                "and",
                ["schema/fits?", "?x", "value/number?"],
                ["number/greaterThanOrEqualTo", "?x", low],
                ["number/lessThanOrEqualTo", "?x", high],
                ["not", ["value/integer?", "?x"]],
              ],
            ],
          ])
        ) as unknown[];
        expect(hasNonInt.length).toBe(low < high ? 1 : 0);
      }),
    OPTIONS
  );

  it.effect.prop(
    "number/remainder on arbitrary numbers agrees with plain code at fractional samples and produces valid witnesses",
    {
      k: divisor,
      target: oneOf<unknown>(
        int(-3, 3),
        element<unknown>([0, 0.5, -0.5, 0.25])
      ),
      op: element(["=", "number/lessThan", "number/greaterThan"]),
    },
    ({ k, op, target }) =>
      Effect.gen(function* () {
        const goal = [
          "and",
          ["schema/fits?", "?x", "value/number?"],
          ["number/greaterThanOrEqualTo", "?x", -3],
          ["number/lessThanOrEqualTo", "?x", 3],
          [op, ["number/remainder", "?x", k], target],
        ];
        const proved =
          (
            resultOf(
              yield* evaluate(["query", ["not", ["exists", ["?x"], goal]]])
            ) as unknown[]
          ).length > 0;
        const samples = [-3, -2.5, -1.25, -0.5, 0, 0.25, 0.5, 1.5, 2.75, 3];
        const plain = resultOf(
          yield* evaluate([
            "array/make",
            ...samples.map((s) => [op, ["number/remainder", s, k], target]),
          ])
        ) as boolean[];
        if (proved) {
          expect(plain.some(Boolean)).toBe(false);
        }
        // Check why's witness (when satisfiable) or proof certificates (when unsatisfiable).
        const explanation = resultOf(
          yield* evaluate([
            "begin",
            ["relation", "found", ["n"]],
            ["rule", ["found", 1], ["exists", ["?x"], goal]],
            ["why", ["found", 1]],
          ])
        ) as {
          readonly example?: Record<string, unknown>;
          readonly premises?: readonly {
            readonly certificates?: readonly Certificate[];
            readonly example?: Record<string, unknown>;
          }[];
        };
        const example =
          explanation.example ?? explanation.premises?.[0]?.example;
        if (!proved && example !== undefined) {
          const x = example["?x"];
          expect(
            resultOf(
              yield* evaluate([
                "and",
                ["number/greaterThanOrEqualTo", x, -3],
                ["number/lessThanOrEqualTo", x, 3],
                [op, ["number/remainder", x, k], target],
              ])
            )
          ).toBe(true);
        }
        const certificates = explanation.premises?.[0]?.certificates;
        if (proved && certificates !== undefined) {
          expect(certificates.every(checks)).toBe(true);
        }
      }),
    OPTIONS
  );
});

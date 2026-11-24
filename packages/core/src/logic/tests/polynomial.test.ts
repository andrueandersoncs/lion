import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";

const smallInt = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: -6, maximum: 6 }))
);
const nonZeroSmall = Arbitrary.filter(smallInt, (n) => n !== 0);
const boundInt = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: -10, maximum: 10 }))
);

const OPS = [
  ["=", (v: number) => v === 0],
  ["number/equals?", (v: number) => v === 0],
  ["number/lessThan", (v: number) => v < 0],
  ["number/lessThanOrEqualTo", (v: number) => v <= 0],
  ["number/greaterThan", (v: number) => v > 0],
  ["number/greaterThanOrEqualTo", (v: number) => v >= 0],
] as const;

const quadExpr = (a: number, b: number, c: number) => [
  "number/add",
  ["number/multiply", a, "?x", "?x"],
  ["number/multiply", b, "?x"],
  c,
];

describe("polynomial cancellation and univariate quadratic solving", () => {
  it.effect.prop(
    "decides every univariate integer quadratic equality and inequality exactly as plain arithmetic does",
    {
      a: nonZeroSmall,
      b: smallInt,
      c: smallInt,
      lo: boundInt,
      hi: boundInt,
      opIndex: Arbitrary.schema(
        Schema.Int.check(
          Schema.isBetween({ minimum: 0, maximum: OPS.length - 1 })
        )
      ),
    },
    ({ a, b, c, hi, lo, opIndex }) =>
      Effect.gen(function* () {
        const min = Math.min(lo, hi);
        const max = Math.max(lo, hi);
        const [op, test] = OPS[opIndex] as (typeof OPS)[number];
        const expected: number[] = [];
        for (let x = min; x <= max; x += 1) {
          if (test(a * x * x + b * x + c)) {
            expected.push(x);
          }
        }
        const actual = yield* run(
          [
            "find",
            "?x",
            [
              "and",
              ["schema/fits?", "?x", "value/integer?"],
              ["number/greaterThanOrEqualTo", "?x", min],
              ["number/lessThanOrEqualTo", "?x", max],
              [op, quadExpr(a, b, c), 0],
            ],
          ],
          stdlib
        );
        expect(actual).toEqual(expected);
      }),
    { arbitrary: { runs: 200 } }
  );

  it.effect.prop(
    "decides unbounded integer quadratic satisfiability for negative, zero, square, and non-square discriminants",
    {
      a: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 5 }))
      ),
      b: smallInt,
      c: smallInt,
    },
    ({ a, b, c }) =>
      Effect.gen(function* () {
        const delta = b * b - 4 * a * c;
        // Over all integers, a*x^2 + b*x + c < 0 holds for some integer iff
        // delta > 0 and there is an integer strictly between the two real roots.
        const hasNeg = (yield* run(
          [
            "query",
            [
              "exists",
              ["?x"],
              [
                "and",
                ["schema/fits?", "?x", "value/integer?"],
                ["number/lessThan", quadExpr(a, b, c), 0],
              ],
            ],
          ],
          stdlib
        )) as unknown[];
        let expectedNeg = false;
        if (delta > 0) {
          const r1 = (-b - Math.sqrt(delta)) / (2 * a);
          const r2 = (-b + Math.sqrt(delta)) / (2 * a);
          for (let x = Math.floor(r1) - 1; x <= Math.ceil(r2) + 1; x += 1) {
            if (a * x * x + b * x + c < 0) {
              expectedNeg = true;
            }
          }
        }
        expect(hasNeg.length > 0).toBe(expectedNeg);
      })
  );

  it.effect.prop(
    "decides unbounded real quadratics with rational roots or negative discriminant",
    {
      a: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 4 }))
      ),
      r1: smallInt,
      r2: smallInt,
      shift: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 5 }))
      ),
    },
    ({ a, r1, r2, shift }) =>
      Effect.gen(function* () {
        // a*(x - r1)*(x - r2) has exact rational roots r1 and r2.
        const roots = (yield* run(
          [
            "find",
            "?x",
            [
              "and",
              ["schema/fits?", "?x", "value/number?"],
              [
                "=",
                [
                  "number/multiply",
                  a,
                  ["number/subtract", "?x", r1],
                  ["number/subtract", "?x", r2],
                ],
                0,
              ],
            ],
          ],
          stdlib
        )) as number[];
        expect(roots).toEqual([...new Set([r1, r2])].sort((x, y) => x - y));

        // a*(x - r1)^2 + shift is strictly positive for every real number.
        const alwaysPos = yield* run(
          [
            "query",
            [
              "not",
              [
                "exists",
                ["?x"],
                [
                  "and",
                  ["schema/fits?", "?x", "value/number?"],
                  [
                    "number/lessThanOrEqualTo",
                    [
                      "number/add",
                      [
                        "number/multiply",
                        a,
                        ["number/power", ["number/subtract", "?x", r1], 2],
                      ],
                      shift,
                    ],
                    0,
                  ],
                ],
              ],
            ],
          ],
          stdlib
        );
        expect(alwaysPos).toEqual([{}]);
      })
  );

  it.effect.prop(
    "cancels nonlinear terms across multivariate algebraic identities and power expansions",
    { a: smallInt, b: smallInt },
    ({ a, b }) =>
      Effect.gen(function* () {
        // (a*x + b*y)^2 == a^2*x^2 + 2*a*b*x*y + b^2*y^2 for all numbers x, y.
        const identity = yield* run(
          [
            "query",
            [
              "not",
              [
                "exists",
                ["?x", "?y"],
                [
                  "and",
                  ["schema/fits?", "?x", "value/number?"],
                  ["schema/fits?", "?y", "value/number?"],
                  [
                    "not",
                    [
                      "=",
                      [
                        "number/power",
                        [
                          "number/add",
                          ["number/multiply", a, "?x"],
                          ["number/multiply", b, "?y"],
                        ],
                        2,
                      ],
                      [
                        "number/add",
                        ["number/multiply", a * a, "?x", "?x"],
                        ["number/multiply", 2 * a * b, "?x", "?y"],
                        ["number/multiply", b * b, "?y", "?y"],
                      ],
                    ],
                  ],
                ],
              ],
            ],
          ],
          stdlib
        );
        expect(identity).toEqual([{}]);

        // Cubic step cancellation: (n + 1)^3 - n^3 == 3*n^2 + 3*n + 1 for all n.
        const cubicStep = yield* run(
          [
            "query",
            [
              "not",
              [
                "exists",
                ["?n"],
                [
                  "and",
                  ["schema/fits?", "?n", "value/integer?"],
                  [
                    "not",
                    [
                      "=",
                      [
                        "number/subtract",
                        ["number/power", ["number/add", "?n", 1], 3],
                        ["number/power", "?n", 3],
                      ],
                      [
                        "number/add",
                        ["number/multiply", 3, "?n", "?n"],
                        ["number/multiply", 3, "?n"],
                        1,
                      ],
                    ],
                  ],
                ],
              ],
            ],
          ],
          stdlib
        );
        expect(cubicStep).toEqual([{}]);
      })
  );
});

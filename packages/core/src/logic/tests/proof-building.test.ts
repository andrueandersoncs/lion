import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { loadDatabase, saveDatabase } from "@/logic/snapshot";
import { stdlib } from "@/modules";

const int = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

describe("proof/prove", () => {
  it.effect.prop(
    "proves valid universal interval/ratio inequalities with kernel-valid proofs and synthesizes concrete counterexamples when false",
    {
      revLo: int(200, 400),
      revSpan: int(0, 60),
      costLo: int(50, 150),
      costSpan: int(0, 40),
      marginPct: int(10, 80),
    },
    ({ revLo, revSpan, costLo, costSpan, marginPct }) =>
      Effect.gen(function* () {
        const revHi = revLo + revSpan;
        const costHi = costLo + costSpan;
        // Worst-case (minimum) gross margin is (revLo - costHi) / revLo.
        const minMarginTimes100 = ((revLo - costHi) * 100) / revLo;
        const shouldHold = minMarginTimes100 >= marginPct;

        const goal = [
          "not",
          [
            "exists",
            ["?rev", "?cost"],
            [
              "and",
              ["schema/fits?", "?rev", "value/number?"],
              ["schema/fits?", "?cost", "value/number?"],
              ["number/greaterThanOrEqualTo", "?rev", revLo],
              ["number/lessThanOrEqualTo", "?rev", revHi],
              ["number/greaterThanOrEqualTo", "?cost", costLo],
              ["number/lessThanOrEqualTo", "?cost", costHi],
              [
                "number/lessThan",
                [
                  "number/multiply",
                  100,
                  [
                    "number/divide",
                    ["number/subtract", "?rev", "?cost"],
                    "?rev",
                  ],
                ],
                marginPct,
              ],
            ],
          ],
        ];

        const out = (yield* run(
          [
            "begin",
            ["define", "res", ["proof/prove", goal]],
            { res: "res", valid: ["proof/valid?", "res"] },
          ],
          stdlib
        )) as {
          res: {
            proved: boolean;
            proof?: unknown;
            counterexample?: { "?rev": number; "?cost": number };
          };
          valid: boolean;
        };

        expect(out.res.proved).toBe(shouldHold);
        if (shouldHold) {
          expect(out.valid).toBe(true);
          expect(out.res.proof).toBeDefined();
        } else {
          expect(out.valid).toBe(false);
          expect(out.res.counterexample).toBeDefined();
          const rev = out.res.counterexample?.["?rev"] as number;
          const cost = out.res.counterexample?.["?cost"] as number;
          // Independently verify the counterexample in plain Lion!
          const breaks = yield* run(
            [
              "and",
              ["number/greaterThanOrEqualTo", rev, revLo],
              ["number/lessThanOrEqualTo", rev, revHi],
              ["number/greaterThanOrEqualTo", cost, costLo],
              ["number/lessThanOrEqualTo", cost, costHi],
              [
                "number/lessThan",
                [
                  "number/multiply",
                  100,
                  ["number/divide", ["number/subtract", rev, cost], rev],
                ],
                marginPct,
              ],
            ],
            stdlib
          );
          expect(breaks).toBe(true);
        }
      })
  );

  it.effect.prop(
    "proves empirical database obligations, extracts facts/assumptions, composes with assuming, and round-trips snapshots",
    {
      hasA: Arbitrary.schema(Schema.Boolean),
      hasB: Arbitrary.schema(Schema.Boolean),
      blocked: Arbitrary.schema(Schema.Boolean),
    },
    ({ hasA, hasB, blocked }) =>
      Effect.gen(function* () {
        const facts: unknown[][] = [];
        if (hasA) {
          facts.push(["backs", "pubA", "q1", 42]);
        }
        if (hasB) {
          facts.push(["backs", "pubB", "q1", 42]);
        }
        if (blocked) {
          facts.push(["retracted", "pubB", "q1"]);
        }
        const setup = [
          "begin",
          ["relation", "backs", ["pub", "q", "v"]],
          ["relation", "retracted", ["pub", "q"]],
          ["relation", "confirmed", ["q", "v"]],
          ...(facts.length > 0 ? [["fact", ...facts]] : []),
          [
            "rule",
            ["confirmed", "?q", "?v"],
            ["backs", "?p1", "?q", "?v"],
            ["backs", "?p2", "?q", "?v"],
            ["not", ["=", "?p1", "?p2"]],
            ["not", ["retracted", "?p1", "?q"]],
            ["not", ["retracted", "?p2", "?q"]],
          ],
        ];
        const db = yield* loadDatabase(setup, stdlib);
        const reloaded = yield* loadDatabase(yield* saveDatabase(db), stdlib);

        const out = (yield* run(
          [
            "begin",
            ["define", "p", ["proof/prove", ["confirmed", "q1", 42]]],
            [
              "define",
              "cf",
              [
                "assuming",
                [
                  "fact",
                  ["backs", "pubA", "q1", 42],
                  ["backs", "pubB", "q1", 42],
                ],
                ["retract", ["retracted", "pubB", "q1"]],
                ["proof/prove", ["confirmed", "q1", 42]],
              ],
            ],
            {
              p: "p",
              pValid: ["proof/valid?", "p"],
              cfProved: ["object/get", "cf", "proved"],
              cfValid: ["proof/valid?", "cf"],
            },
          ],
          stdlib,
          { database: reloaded }
        )) as {
          p: {
            proved: boolean;
            facts?: readonly unknown[];
            assumptions?: readonly unknown[];
          };
          pValid: boolean;
          cfProved: boolean;
          cfValid: boolean;
        };

        const expected = hasA && hasB && !blocked;
        expect(out.p.proved).toBe(expected);
        expect(out.pValid).toBe(expected);
        if (expected) {
          expect(out.p.facts?.length).toBe(2);
          expect(out.p.assumptions?.length).toBeGreaterThanOrEqual(2);
        }
        // Under counterfactual assuming both backs and no retraction, always proved!
        expect(out.cfProved).toBe(true);
        expect(out.cfValid).toBe(true);
      })
  );
});

describe("proof/bounds", () => {
  it.effect.prop(
    "computes exact integer and continuous bounds with valid witnesses and kernel-checked bound certificates",
    {
      aLo: int(1, 20),
      aSpan: int(0, 15),
      bLo: int(-10, 10),
      bSpan: int(0, 15),
      coeffA: int(1, 4),
      coeffB: int(-3, 3),
    },
    ({ aLo, aSpan, bLo, bSpan, coeffA, coeffB }) =>
      Effect.gen(function* () {
        const aHi = aLo + aSpan;
        const bHi = bLo + bSpan;
        const expectedMin =
          coeffA * aLo + (coeffB >= 0 ? coeffB * bLo : coeffB * bHi);
        const expectedMax =
          coeffA * aHi + (coeffB >= 0 ? coeffB * bHi : coeffB * bLo);

        const res = (yield* run(
          [
            "begin",
            [
              "define",
              "b",
              [
                "proof/bounds",
                [
                  "number/add",
                  ["number/multiply", coeffA, "?a"],
                  ["number/multiply", coeffB, "?b"],
                ],
                [
                  "and",
                  ["schema/fits?", "?a", "value/integer?"],
                  ["schema/fits?", "?b", "value/integer?"],
                  ["number/greaterThanOrEqualTo", "?a", aLo],
                  ["number/lessThanOrEqualTo", "?a", aHi],
                  ["number/greaterThanOrEqualTo", "?b", bLo],
                  ["number/lessThanOrEqualTo", "?b", bHi],
                ],
              ],
            ],
            {
              b: "b",
              minCertOk: ["proof/valid?", ["object/get", "b", "minProof"]],
              maxCertOk: ["proof/valid?", ["object/get", "b", "maxProof"]],
            },
          ],
          stdlib
        )) as {
          b: {
            satisfiable: boolean;
            min: number;
            max: number;
            minInclusive: boolean;
            maxInclusive: boolean;
            witnessMin?: { "?a": number; "?b": number };
            witnessMax?: { "?a": number; "?b": number };
          };
          minCertOk: boolean;
          maxCertOk: boolean;
        };

        expect(res.b.satisfiable).toBe(true);
        expect(res.b.min).toBe(expectedMin);
        expect(res.b.max).toBe(expectedMax);
        expect(res.b.minInclusive).toBe(true);
        expect(res.b.maxInclusive).toBe(true);
        expect(res.minCertOk).toBe(true);
        expect(res.maxCertOk).toBe(true);
        expect(
          coeffA * (res.b.witnessMin?.["?a"] as number) +
            coeffB * (res.b.witnessMin?.["?b"] as number)
        ).toBe(expectedMin);
        expect(
          coeffA * (res.b.witnessMax?.["?a"] as number) +
            coeffB * (res.b.witnessMax?.["?b"] as number)
        ).toBe(expectedMax);
      })
  );

  it.effect.prop(
    "computes exact linear-fractional ratio bounds via Charnes-Cooper and proves both endpoints",
    {
      revLo: int(100, 500),
      revSpan: int(1, 50),
      costLo: int(20, 80),
      costSpan: int(1, 15),
    },
    ({ revLo, revSpan, costLo, costSpan }) =>
      Effect.gen(function* () {
        const revHi = revLo + revSpan;
        const costHi = costLo + costSpan;
        const out = (yield* run(
          [
            "begin",
            [
              "define",
              "b",
              [
                "proof/bounds",
                ["number/divide", ["number/subtract", "?rev", "?cost"], "?rev"],
                [
                  "and",
                  ["schema/fits?", "?rev", "value/number?"],
                  ["schema/fits?", "?cost", "value/number?"],
                  ["number/greaterThanOrEqualTo", "?rev", revLo],
                  ["number/lessThanOrEqualTo", "?rev", revHi],
                  ["number/greaterThanOrEqualTo", "?cost", costLo],
                  ["number/lessThanOrEqualTo", "?cost", costHi],
                ],
              ],
            ],
            {
              sat: ["object/get", "b", "satisfiable"],
              minExact: [
                "=",
                ["object/get", "b", "min"],
                ["number/divide", ["number/subtract", revLo, costHi], revLo],
              ],
              maxExact: [
                "=",
                ["object/get", "b", "max"],
                ["number/divide", ["number/subtract", revHi, costLo], revHi],
              ],
              minProofOk: ["proof/valid?", ["object/get", "b", "minProof"]],
              maxProofOk: ["proof/valid?", ["object/get", "b", "maxProof"]],
              witnessMin: ["object/get", "b", "witnessMin"],
              witnessMax: ["object/get", "b", "witnessMax"],
            },
          ],
          stdlib
        )) as {
          sat: boolean;
          minExact: boolean;
          maxExact: boolean;
          minProofOk: boolean;
          maxProofOk: boolean;
          witnessMin: { "?rev": number; "?cost": number };
          witnessMax: { "?rev": number; "?cost": number };
        };

        expect(out.sat).toBe(true);
        expect(out.minExact).toBe(true);
        expect(out.maxExact).toBe(true);
        expect(out.minProofOk).toBe(true);
        expect(out.maxProofOk).toBe(true);
        expect(out.witnessMin["?rev"]).toBe(revLo);
        expect(out.witnessMin["?cost"]).toBe(costHi);
        expect(out.witnessMax["?rev"]).toBe(revHi);
        expect(out.witnessMax["?cost"]).toBe(costLo);
      })
  );

  it.effect.prop(
    "detects contradictory numeric constraints with kernel-valid unsatisfiability proof",
    {
      hi: int(10, 50),
      gap: int(1, 20),
    },
    ({ hi, gap }) =>
      Effect.gen(function* () {
        const lo = hi + gap;
        const out = (yield* run(
          [
            "begin",
            [
              "define",
              "b",
              [
                "proof/bounds",
                "?x",
                [
                  "and",
                  ["schema/fits?", "?x", "value/number?"],
                  ["number/greaterThanOrEqualTo", "?x", lo],
                  ["number/lessThanOrEqualTo", "?x", hi],
                ],
              ],
            ],
            {
              sat: ["object/get", "b", "satisfiable"],
              valid: ["proof/valid?", ["object/get", "b", "proof"]],
            },
          ],
          stdlib
        )) as { sat: boolean; valid: boolean };
        expect(out.sat).toBe(false);
        expect(out.valid).toBe(true);
      })
  );

  it.effect.prop(
    "computes exact bounds over relational/database goals matching aggregate/min and aggregate/max",
    {
      vals: Arbitrary.array(int(-50, 100), { minLength: 1, maxLength: 8 }),
    },
    ({ vals }) =>
      Effect.gen(function* () {
        const expectedMin = Math.min(...vals);
        const expectedMax = Math.max(...vals);
        const out = (yield* run(
          [
            "begin",
            ["relation", "obs", ["id", "val"]],
            ["fact", ...vals.map((v, i) => ["obs", `o${i}`, v])],
            ["proof/bounds", "?v", ["obs", "?id", "?v"]],
          ],
          stdlib
        )) as {
          satisfiable: boolean;
          min: number;
          max: number;
          minInclusive: boolean;
          maxInclusive: boolean;
        };
        expect(out.satisfiable).toBe(true);
        expect(out.min).toBe(expectedMin);
        expect(out.max).toBe(expectedMax);
        expect(out.minInclusive).toBe(true);
        expect(out.maxInclusive).toBe(true);
      })
  );

  it.effect.prop(
    "refines integer bounds past fractional LP relaxations via binary search",
    {
      k: int(1, 15),
    },
    ({ k }) =>
      Effect.gen(function* () {
        // 2*x + 3*y = 2*k + 1, x >= 0, y >= 0, x <= k + 5, y <= k + 5
        // Maximize 2*x + 2*y = (2*k + 1) - y -> minimized at smallest y >= 0 with 2 | (2*k + 1 - 3*y), i.e. y = 1!
        // LP relaxation allows y = 0 (gives 2*k + 1), but integer optimum requires y = 1 (gives 2*k).
        const out = (yield* run(
          [
            "begin",
            [
              "define",
              "b",
              [
                "proof/bounds",
                [
                  "number/add",
                  ["number/multiply", 2, "?x"],
                  ["number/multiply", 2, "?y"],
                ],
                [
                  "and",
                  ["schema/fits?", "?x", "value/integer?"],
                  ["schema/fits?", "?y", "value/integer?"],
                  ["number/greaterThanOrEqualTo", "?x", 0],
                  ["number/greaterThanOrEqualTo", "?y", 0],
                  [
                    "number/equals?",
                    [
                      "number/add",
                      ["number/multiply", 2, "?x"],
                      ["number/multiply", 3, "?y"],
                    ],
                    2 * k + 1,
                  ],
                ],
              ],
            ],
            {
              max: ["object/get", "b", "max"],
              min: ["object/get", "b", "min"],
              maxCert: ["proof/valid?", ["object/get", "b", "maxProof"]],
            },
          ],
          stdlib
        )) as { max: number; min: number; maxCert: boolean };
        expect(out.max).toBe(2 * k);
        expect(out.maxCert).toBe(true);
      })
  );

  it.effect.prop(
    "handles negative denominators accurately in symbolic ratio comparisons",
    {
      denHi: int(-15, -5),
      denSpan: int(1, 10),
      numVal: int(10, 40),
      threshold: int(-10, -1),
    },
    ({ denHi, denSpan, numVal, threshold }) =>
      Effect.gen(function* () {
        const denLo = denHi - denSpan;
        // For d in [denLo, denHi] < 0 and numVal > 0:
        // numVal / d is minimized at d = denHi (closest to 0, most negative) and maximized at d = denLo.
        // So exists d in [denLo, denHi] with numVal / d < threshold iff numVal / denHi < threshold.
        const shouldExist = numVal / denHi < threshold;
        const out = (yield* run(
          [
            "proof/prove",
            [
              "not",
              [
                "exists",
                ["?d"],
                [
                  "and",
                  ["schema/fits?", "?d", "value/number?"],
                  ["number/greaterThanOrEqualTo", "?d", denLo],
                  ["number/lessThanOrEqualTo", "?d", denHi],
                  [
                    "number/lessThan",
                    ["number/divide", numVal, "?d"],
                    threshold,
                  ],
                ],
              ],
            ],
          ],
          stdlib
        )) as { proved: boolean };
        expect(out.proved).toBe(!shouldExist);
      })
  );
});

describe("research-grade proof/rules", () => {
  it.effect.prop(
    "proves soundness of research frames with column invariants, record/open patterns, and research aggregates",
    {
      floorVal: int(1, 50),
      tooHigh: int(51, 100),
    },
    ({ floorVal, tooHigh }) =>
      Effect.gen(function* () {
        const program = [
          "begin",
          [
            "schema",
            "PosNum",
            [
              "schema/allOf",
              "value/number?",
              ["lambda", ["n"], ["number/greaterThanOrEqualTo", "n", floorVal]],
            ],
          ],
          [
            "schema",
            "Says",
            [
              "schema/anyOf",
              { revenue: "value/string?", usd_m: "PosNum" },
              { note: "value/string?", tag: "value/string?" },
            ],
          ],
          ["relation", "claim", ["id", "source", "quote", "says"]],
          [
            "invariant",
            [
              "and",
              ["claim", "?id", "?_", "?_", "?says"],
              ["not", ["Says", "?says"]],
            ],
            { assert: "none" },
          ],
          ["relation", "rev_answer", ["company", "usd_m", "claim"]],
          [
            "rule",
            ["rev_answer", "?co", "?v", "?c"],
            ["claim", "?c", "?_", "?_", { revenue: "?co", usd_m: "?v" }],
          ],
          ["relation", "rev_count", ["company", "n"]],
          [
            "rule",
            ["rev_count", "?co", ["aggregate/count", "?c"]],
            ["rev_answer", "?co", "?_", "?c"],
          ],
          ["relation", "rev_sum", ["company", "total"]],
          [
            "rule",
            ["rev_sum", "?co", ["aggregate/sum", "?v"]],
            ["rev_answer", "?co", "?v", "?_"],
          ],
          ["relation", "rev_mean", ["company", "avg"]],
          [
            "rule",
            ["rev_mean", "?co", ["aggregate/mean", "?v"]],
            ["rev_answer", "?co", "?v", "?_"],
          ],
          [
            "schema",
            "RevAnswerRow",
            { company: "value/string?", usd_m: "PosNum", claim: "value/any?" },
          ],
          [
            "schema",
            "CountRow",
            {
              company: "value/string?",
              n: [
                "schema/allOf",
                "value/integer?",
                ["lambda", ["k"], ["number/greaterThanOrEqualTo", "k", 1]],
              ],
            },
          ],
          ["schema", "SumRow", { company: "value/string?", total: "PosNum" }],
          ["schema", "MeanRow", { company: "value/string?", avg: "PosNum" }],
          [
            "schema",
            "TooTightRow",
            {
              company: "value/string?",
              usd_m: [
                "schema/allOf",
                "value/number?",
                [
                  "lambda",
                  ["n"],
                  ["number/greaterThanOrEqualTo", "n", tooHigh],
                ],
              ],
              claim: "value/any?",
            },
          ],
          [
            "define",
            "bundle",
            [
              "proof/rules",
              {
                rev_answer: "RevAnswerRow",
                rev_count: "CountRow",
                rev_sum: "SumRow",
                rev_mean: "MeanRow",
              },
            ],
          ],
          ["define", "bad", ["proof/rules", "rev_answer", "TooTightRow"]],
          {
            bundleProved: ["object/get", "bundle", "proved"],
            bundleValid: ["proof/valid?", "bundle"],
            badProved: ["object/get", "bad", "proved"],
            badValid: ["proof/valid?", "bad"],
          },
        ];

        const out = (yield* run(program, stdlib)) as {
          bundleProved: boolean;
          bundleValid: boolean;
          badProved: boolean;
          badValid: boolean;
        };
        expect(out.bundleProved).toBe(true);
        expect(out.bundleValid).toBe(true);
        expect(out.badProved).toBe(false);
        expect(out.badValid).toBe(false);
      })
  );
});

describe("symbolic time/ reasoning", () => {
  it.effect.prop(
    "computes exact bounds and proofs over time/add, time/diff, and time/fromParts",
    {
      startHour: int(1, 10),
      windowMin: int(5, 45),
      durationMin: int(30, 120),
    },
    ({ startHour, windowMin, durationMin }) =>
      Effect.gen(function* () {
        const out = (yield* run(
          [
            "begin",
            [
              "define",
              "t0",
              ["time/fromParts", 2026, 3, 3, startHour, 0, 0, 0],
            ],
            ["define", "tEnd", ["time/add", "t0", durationMin, "minutes"]],
            [
              "define",
              "b",
              [
                "proof/bounds",
                ["time/diff", "tEnd", "?t", "minutes"],
                [
                  "and",
                  ["schema/fits?", "?t", "value/integer?"],
                  ["number/greaterThanOrEqualTo", "?t", "t0"],
                  [
                    "number/lessThanOrEqualTo",
                    "?t",
                    ["time/add", "t0", windowMin, "minutes"],
                  ],
                ],
              ],
            ],
            [
              "define",
              "p",
              [
                "proof/prove",
                [
                  "not",
                  [
                    "exists",
                    ["?t"],
                    [
                      "and",
                      ["schema/fits?", "?t", "value/integer?"],
                      ["number/greaterThanOrEqualTo", "?t", "t0"],
                      [
                        "number/lessThanOrEqualTo",
                        "?t",
                        ["time/add", "t0", windowMin, "minutes"],
                      ],
                      [
                        "number/lessThan",
                        ["time/diff", "tEnd", "?t", "minutes"],
                        durationMin - windowMin,
                      ],
                    ],
                  ],
                ],
              ],
            ],
            {
              min: ["object/get", "b", "min"],
              max: ["object/get", "b", "max"],
              proved: ["object/get", "p", "proved"],
              valid: ["proof/valid?", "p"],
            },
          ],
          stdlib
        )) as { min: number; max: number; proved: boolean; valid: boolean };

        expect(out.min).toBe(durationMin - windowMin);
        expect(out.max).toBe(durationMin);
        expect(out.proved).toBe(true);
        expect(out.valid).toBe(true);
      })
  );
});

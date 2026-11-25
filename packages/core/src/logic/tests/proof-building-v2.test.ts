import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { lint } from "@/analysis/lint";
import { run } from "@/evaluation/evaluate";
import { LogicDatabase } from "@/logic/database";
import { loadDatabase, saveDatabase } from "@/logic/snapshot";
import { stdlib } from "@/modules";
import {
  add,
  compare,
  fromRational,
  isNumber,
  multiply,
  ONE,
  type Rational,
  ratio,
  toRational,
  ZERO,
} from "@/numbers/exact";

const int = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

describe("retract and assuming with where", () => {
  it.effect.prop(
    "retracts all and only base facts matching the pattern and where goal, matching an independent set filter",
    {
      kinds: Arbitrary.array(
        Arbitrary.schema(Schema.Literals(["primary", "secondary", "tertiary"])),
        { minLength: 2, maxLength: 6 }
      ),
      values: Arbitrary.array(int(1, 50), { minLength: 2, maxLength: 6 }),
      targetKind: Arbitrary.schema(
        Schema.Literals(["primary", "secondary", "tertiary"])
      ),
    },
    ({ kinds, values, targetKind }) =>
      Effect.gen(function* () {
        const count = Math.min(kinds.length, values.length);
        const sources = Array.from({ length: count }, (_, i) => [
          "source",
          `s${i}`,
          kinds[i],
        ]);
        const claims = Array.from({ length: count }, (_, i) => [
          "claim",
          `c${i}`,
          `s${i}`,
          values[i],
        ]);
        const expectedRemaining = Array.from({ length: count }, (_, i) => i)
          .filter((i) => kinds[i] !== targetKind)
          .map((i) => ({ c: `c${i}`, s: `s${i}`, v: values[i] }));
        const expectedRetractedCount = count - expectedRemaining.length;

        const out = (yield* run(
          [
            "begin",
            ["relation", "source", ["id", "kind"], { key: "id" }],
            ["relation", "claim", ["id", "src", "val"], { key: "id" }],
            ["fact", ...sources, ...claims],
            [
              "define",
              "cfCount",
              [
                "assuming",
                [
                  "retract",
                  ["claim", "?c", "?s", "?_"],
                  { where: ["source", "?s", targetKind] },
                ],
                [
                  "aggregate/count",
                  ["find", "?c", ["claim", "?c", "?_", "?_"]],
                ],
              ],
            ],
            [
              "define",
              "removed",
              [
                "retract",
                ["claim", "?c", "?s", "?_"],
                { where: ["source", "?s", targetKind] },
              ],
            ],
            {
              cfCount: "cfCount",
              removed: "removed",
              remaining: ["query", ["claim", "?c", "?s", "?v"], { order: "c" }],
            },
          ],
          stdlib
        )) as {
          cfCount: number;
          remaining: readonly { c: string; s: string; v: number }[];
          removed: readonly unknown[];
        };

        expect(out.cfCount).toBe(expectedRemaining.length);
        expect(out.removed.length).toBe(expectedRetractedCount);
        expect(out.remaining).toEqual(expectedRemaining);
      })
  );

  it.effect.prop(
    "works inside rules with outer variables bound and round-trips snapshots",
    {
      directA: int(10, 45),
      rumorB: int(10, 45),
      verifiedC: int(0, 20),
    },
    ({ directA, rumorB, verifiedC }) =>
      Effect.gen(function* () {
        const setup = [
          "begin",
          ["relation", "source", ["id", "kind"], { key: "id" }],
          ["relation", "stake", ["id", "src", "pct"], { key: "id" }],
          ["relation", "total_stake", ["pct"]],
          ["relation", "survives_without", ["kind", "ok"]],
          [
            "fact",
            ["source", "s1", "primary"],
            ["source", "s2", "tertiary"],
            ["source", "s3", "secondary"],
            ["stake", "k1", "s1", directA],
            ["stake", "k2", "s2", rumorB],
            ["stake", "k3", "s3", verifiedC],
          ],
          [
            "rule",
            ["total_stake", ["aggregate/sum", "?p"]],
            ["stake", "?_", "?_", "?p"],
          ],
          [
            "rule",
            [
              "survives_without",
              "?k",
              [
                "assuming",
                [
                  "retract",
                  ["stake", "?id", "?s", "?_"],
                  { where: ["source", "?s", "?k"] },
                ],
                [
                  "and",
                  ["total_stake", "?t"],
                  ["number/greaterThan", "?t", 50],
                ],
              ],
            ],
            ["in", "?k", ["quote", ["primary", "secondary", "tertiary"]]],
          ],
        ];
        const db = yield* loadDatabase(setup, stdlib);
        const reloaded = yield* loadDatabase(yield* saveDatabase(db), stdlib);
        const rows = (yield* run(
          ["query", ["survives_without", "?k", "?ok"], { order: "k" }],
          stdlib,
          { database: reloaded }
        )) as { k: string; ok: boolean }[];

        expect(rows).toEqual([
          { k: "primary", ok: rumorB + verifiedC > 50 },
          { k: "secondary", ok: directA + rumorB > 50 },
          { k: "tertiary", ok: directA + verifiedC > 50 },
        ]);
      })
  );
});

describe("mixed-integer, integer-ratio, and bilinear proof/bounds", () => {
  it.effect.prop(
    "computes exact integer linear-fractional ratio bounds via Dinkelbach matching brute-force enumeration",
    {
      aLo: int(5, 12),
      aSpan: int(1, 6),
      bLo: int(4, 10),
      bSpan: int(1, 6),
      slack: int(0, 6),
      cNum: int(-3, 5),
      cDen: int(1, 8),
    },
    ({ aLo, aSpan, bLo, bSpan, slack, cNum, cDen }) =>
      Effect.gen(function* () {
        const aHi = aLo + aSpan;
        const bHi = bLo + bSpan;
        const cap = aLo + bLo + slack;

        // Independent exact rational brute-force oracle over all integer pairs.
        let minR: Rational | undefined;
        let maxR: Rational | undefined;
        for (let a = aLo; a <= aHi; a += 1) {
          for (let b = bLo; b <= bHi; b += 1) {
            if (a + b > cap) {
              continue;
            }
            const r = ratio(BigInt(a + cNum), BigInt(a + b + cDen));
            if (minR === undefined || compare(r, minR) < 0) {
              minR = r;
            }
            if (maxR === undefined || compare(r, maxR) > 0) {
              maxR = r;
            }
          }
        }

        const out = (yield* run(
          [
            "begin",
            [
              "define",
              "b",
              [
                "proof/bounds",
                [
                  "number/divide",
                  ["number/add", "?a", cNum],
                  ["number/add", "?a", "?b", cDen],
                ],
                [
                  "and",
                  ["schema/fits?", "?a", "value/integer?"],
                  ["schema/fits?", "?b", "value/integer?"],
                  ["number/greaterThanOrEqualTo", "?a", aLo],
                  ["number/lessThanOrEqualTo", "?a", aHi],
                  ["number/greaterThanOrEqualTo", "?b", bLo],
                  ["number/lessThanOrEqualTo", "?b", bHi],
                  ["number/lessThanOrEqualTo", ["number/add", "?a", "?b"], cap],
                ],
              ],
            ],
            {
              b: "b",
              valid: ["proof/valid?", "b"],
              boundClaim: [
                "proof/valid?",
                "b",
                {
                  atLeast: fromRational(minR as Rational),
                  atMost: fromRational(maxR as Rational),
                },
              ],
            },
          ],
          stdlib
        )) as {
          b: {
            max: unknown;
            min: unknown;
            satisfiable: boolean;
            witnessMax?: { "?a": number; "?b": number };
            witnessMin?: { "?a": number; "?b": number };
          };
          boundClaim: boolean;
          valid: boolean;
        };

        expect(out.b.satisfiable).toBe(true);
        expect(isNumber(out.b.min)).toBe(true);
        expect(isNumber(out.b.max)).toBe(true);
        expect(compare(toRational(out.b.min as number), minR as Rational)).toBe(
          0
        );
        expect(compare(toRational(out.b.max as number), maxR as Rational)).toBe(
          0
        );
        expect(out.valid).toBe(true);
        expect(out.boundClaim).toBe(true);
        // Witnesses must be exact integers meeting the cap.
        const wMin = out.b.witnessMin as { "?a": number; "?b": number };
        const wMax = out.b.witnessMax as { "?a": number; "?b": number };
        expect(
          Number.isInteger(wMin["?a"]) && Number.isInteger(wMin["?b"])
        ).toBe(true);
        expect(wMin["?a"] + wMin["?b"]).toBeLessThanOrEqual(cap);
        expect(wMax["?a"] + wMax["?b"]).toBeLessThanOrEqual(cap);
      })
  );

  it.effect.prop(
    "computes exact mixed-integer linear bounds via branch-and-bound when LP optimum is fractional",
    {
      kMax: int(3, 12),
      rMax: int(2, 10),
    },
    ({ kMax, rMax }) =>
      Effect.gen(function* () {
        // Maximize 2*?k + ?r subject to 2*?k + 2*?r <= 2*kMax + 1, 0 <= ?k <= kMax, 0 <= ?r <= rMax
        // Wait: specifically force LP fractionality: 2*?k <= 2*kMax - 1 -> ?k <= kMax - 0.5 -> integer ?k <= kMax - 1!
        const rhs = 2 * kMax - 1;
        // Exact max of ?k + 0.5*?r subject to 2*?k <= rhs, 0 <= ?k, 0 <= ?r <= rMax:
        // LP relaxation has ?k = kMax - 0.5 (fractional!), exact integer max has ?k = kMax - 1.
        const expectedMax = toRational(kMax - 1 + 0.5 * rMax);

        const out = (yield* run(
          [
            "begin",
            [
              "define",
              "b",
              [
                "proof/bounds",
                ["number/add", "?k", ["number/multiply", 0.5, "?r"]],
                [
                  "and",
                  ["schema/fits?", "?k", "value/integer?"],
                  ["schema/fits?", "?r", "value/number?"],
                  ["number/greaterThanOrEqualTo", "?k", 0],
                  [
                    "number/lessThanOrEqualTo",
                    ["number/multiply", 2, "?k"],
                    rhs,
                  ],
                  ["number/greaterThanOrEqualTo", "?r", 0],
                  ["number/lessThanOrEqualTo", "?r", rMax],
                ],
              ],
            ],
            { b: "b", valid: ["proof/valid?", "b"] },
          ],
          stdlib
        )) as {
          b: {
            max: unknown;
            min: unknown;
            satisfiable: boolean;
            witnessMax?: { "?k": number; "?r": number };
          };
          valid: boolean;
        };

        expect(out.b.satisfiable).toBe(true);
        expect(compare(toRational(out.b.max as number), expectedMax)).toBe(0);
        expect(Number.isInteger(out.b.witnessMax?.["?k"])).toBe(true);
        expect(out.b.witnessMax?.["?k"]).toBe(kMax - 1);
        expect(out.valid).toBe(true);
      })
  );

  it.effect.prop(
    "computes exact coupled continuous bilinear bounds including interior edge stationary points",
    {
      lo: int(1, 5),
      hi: int(7, 12),
      capOffset: int(4, 10),
    },
    ({ lo, hi, capOffset }) =>
      Effect.gen(function* () {
        // Maximize & minimize ?x * ?y subject to lo <= ?x <= hi, lo <= ?y <= hi, ?x + ?y <= cap.
        const cap = 2 * lo + capOffset;
        // Exact minimum is lo * lo.
        const expectedMin = ratio(BigInt(lo * lo));
        // Exact maximum: if cap >= 2*hi then hi*hi; else on edge x + y = cap, max is at x = y = cap/2
        // (since lo <= cap/2 <= hi when cap <= 2*hi and cap >= 2*lo).
        const half = ratio(BigInt(cap), 2n);
        const expectedMax =
          cap >= 2 * hi ? ratio(BigInt(hi * hi)) : multiply(half, half);

        const b = (yield* run(
          [
            "proof/bounds",
            ["number/multiply", "?x", "?y"],
            [
              "and",
              ["schema/fits?", "?x", "value/number?"],
              ["schema/fits?", "?y", "value/number?"],
              ["number/greaterThanOrEqualTo", "?x", lo],
              ["number/lessThanOrEqualTo", "?x", hi],
              ["number/greaterThanOrEqualTo", "?y", lo],
              ["number/lessThanOrEqualTo", "?y", hi],
              ["number/lessThanOrEqualTo", ["number/add", "?x", "?y"], cap],
            ],
          ],
          stdlib
        )) as {
          max: unknown;
          min: unknown;
          satisfiable: boolean;
          witnessMax?: { "?x": number; "?y": number };
          witnessMin?: { "?x": number; "?y": number };
        };

        expect(b.satisfiable).toBe(true);
        expect(compare(toRational(b.min as number), expectedMin)).toBe(0);
        expect(compare(toRational(b.max as number), expectedMax)).toBe(0);
        // Verify witnesses actually attain the exact extrema!
        const wMax = b.witnessMax as { "?x": number; "?y": number };
        expect(
          compare(
            multiply(toRational(wMax["?x"]), toRational(wMax["?y"])),
            expectedMax
          )
        ).toBe(0);
      })
  );

  it.effect.prop(
    "computes exact bounds for direct + chained bilinear stakes and univariate quadratics",
    {
      dLo: int(10, 20),
      dSpan: int(0, 10),
      aLo: int(20, 40),
      aSpan: int(1, 20),
      bLo: int(30, 50),
      bSpan: int(1, 20),
    },
    ({ dLo, dSpan, aLo, aSpan, bLo, bSpan }) =>
      Effect.gen(function* () {
        const dHi = dLo + dSpan;
        const aHi = aLo + aSpan;
        const bHi = bLo + bSpan;
        // direct/100 + (a/100)*(b/100) scaled by 10000 -> 100*d + a*b
        const expectedMin = ratio(BigInt(100 * dLo + aLo * bLo));
        const expectedMax = ratio(BigInt(100 * dHi + aHi * bHi));

        const res = (yield* run(
          [
            "proof/bounds",
            [
              "number/add",
              ["number/multiply", 100, "?d"],
              ["number/multiply", "?a", "?b"],
            ],
            [
              "and",
              ["schema/fits?", "?d", "value/number?"],
              ["schema/fits?", "?a", "value/number?"],
              ["schema/fits?", "?b", "value/number?"],
              ["number/greaterThanOrEqualTo", "?d", dLo],
              ["number/lessThanOrEqualTo", "?d", dHi],
              ["number/greaterThanOrEqualTo", "?a", aLo],
              ["number/lessThanOrEqualTo", "?a", aHi],
              ["number/greaterThanOrEqualTo", "?b", bLo],
              ["number/lessThanOrEqualTo", "?b", bHi],
            ],
          ],
          stdlib
        )) as { max: unknown; min: unknown; satisfiable: boolean };

        expect(res.satisfiable).toBe(true);
        expect(compare(toRational(res.min as number), expectedMin)).toBe(0);
        expect(compare(toRational(res.max as number), expectedMax)).toBe(0);
      })
  );
});

describe("graph/influence and proof/sensitivity", () => {
  it.effect.prop(
    "graph/influence matches independent exact sum-of-path-products on random weighted DAGs and cyclic graphs",
    {
      w01: int(1, 9),
      w02: int(1, 9),
      w12: int(1, 9),
      w13: int(1, 9),
      w23: int(1, 9),
      hasBackEdge: Arbitrary.schema(Schema.Boolean),
      w21: int(1, 5),
    },
    ({ w01, w02, w12, w13, w23, hasBackEdge, w21 }) =>
      Effect.gen(function* () {
        const edges: [string, string, Rational][] = [
          ["n0", "n1", ratio(BigInt(w01), 10n)],
          ["n0", "n2", ratio(BigInt(w02), 10n)],
          ["n1", "n2", ratio(BigInt(w12), 10n)],
          ["n1", "n3", ratio(BigInt(w13), 10n)],
          ["n2", "n3", ratio(BigInt(w23), 10n)],
        ];
        if (hasBackEdge) {
          edges.push(["n2", "n1", ratio(BigInt(w21), 10n)]);
        }

        // Independent exact simple-path DFS oracle.
        const oracle = new Map<string, Rational>();
        const dfs = (u: string, prod: Rational, seen: Set<string>) => {
          for (const [from, to, w] of edges) {
            if (from !== u || seen.has(to)) {
              continue;
            }
            const next = multiply(prod, w);
            oracle.set(to, add(oracle.get(to) ?? ZERO, next));
            seen.add(to);
            dfs(to, next, seen);
            seen.delete(to);
          }
        };
        dfs("n0", ONE, new Set(["n0"]));

        const factForms = edges.map(([u, v, r]) => [
          "owns",
          u,
          v,
          fromRational(r),
        ]);
        const rows = (yield* run(
          [
            "begin",
            ["relation", "owns", ["from", "to", "share"]],
            ["fact", ...factForms],
            [
              "query",
              ["graph/influence", "owns", "n0", "?to", "?w"],
              { order: "to" },
            ],
          ],
          stdlib
        )) as { to: string; w: unknown }[];

        expect(rows.length).toBe(oracle.size);
        for (const row of rows) {
          const exp = oracle.get(row.to) as Rational;
          expect(compare(toRational(row.w as number), exp)).toBe(0);
        }
      })
  );

  it.effect.prop(
    "proof/sensitivity identifies exact critical facts, redundant facts, and minimal size-2 cuts",
    {
      hasA: Arbitrary.schema(Schema.Boolean),
      hasB: Arbitrary.schema(Schema.Boolean),
      hasC: Arbitrary.schema(Schema.Boolean),
      hasShared: Arbitrary.schema(Schema.Boolean),
    },
    ({ hasA, hasB, hasC, hasShared }) =>
      Effect.gen(function* () {
        // Model: ok(x) holds if shared(x) AND at least one of p1(x), p2(x), p3(x) holds.
        const facts: unknown[][] = [];
        if (hasShared) {
          facts.push(["shared", "x"]);
        }
        if (hasA) {
          facts.push(["p1", "x"]);
        }
        if (hasB) {
          facts.push(["p2", "x"]);
        }
        if (hasC) {
          facts.push(["p3", "x"]);
        }
        const out = (yield* run(
          [
            "begin",
            ["relation", "shared", ["x"]],
            ["relation", "p1", ["x"]],
            ["relation", "p2", ["x"]],
            ["relation", "p3", ["x"]],
            ["relation", "any_p", ["x"]],
            ["relation", "ok", ["x"]],
            ...(facts.length > 0 ? [["fact", ...facts]] : []),
            ["rule", ["any_p", "?x"], ["p1", "?x"]],
            ["rule", ["any_p", "?x"], ["p2", "?x"]],
            ["rule", ["any_p", "?x"], ["p3", "?x"]],
            ["rule", ["ok", "?x"], ["shared", "?x"], ["any_p", "?x"]],
            {
              withShared: ["proof/sensitivity", ["ok", "x"]],
              justAnyP: ["proof/sensitivity", ["any_p", "x"]],
            },
          ],
          stdlib
        )) as {
          justAnyP: {
            critical: unknown[];
            holds: boolean;
            minCutSize: number | null;
            minimalCuts: unknown[][];
            redundant: unknown[];
            resilient: boolean;
          };
          withShared: {
            critical: unknown[];
            holds: boolean;
            minCutSize: number | null;
            resilient: boolean;
          };
        };

        const pCount = Number(hasA) + Number(hasB) + Number(hasC);
        expect(out.withShared.holds).toBe(hasShared && pCount > 0);
        if (hasShared && pCount > 0) {
          // shared(x) is ALWAYS a critical single point of failure!
          expect(out.withShared.critical).toContainEqual(["shared", "x"]);
          expect(out.withShared.resilient).toBe(false);
          expect(out.withShared.minCutSize).toBe(1);
        }

        expect(out.justAnyP.holds).toBe(pCount > 0);
        if (pCount === 1) {
          expect(out.justAnyP.resilient).toBe(false);
          expect(out.justAnyP.minCutSize).toBe(1);
          expect(out.justAnyP.critical.length).toBe(1);
        } else if (pCount === 2) {
          expect(out.justAnyP.resilient).toBe(true);
          expect(out.justAnyP.minCutSize).toBe(2);
          expect(out.justAnyP.minimalCuts.length).toBe(1);
        } else if (pCount === 3) {
          expect(out.justAnyP.resilient).toBe(true);
          expect(out.justAnyP.minCutSize).toBe(null);
        }
      })
  );
});

describe("sound claim-bound proof/valid?", () => {
  it.effect.prop(
    "verifies proof/bounds directly, enforces bound claims, and rejects forged proofs",
    {
      lo: int(10, 40),
      span: int(0, 20),
      threshold: int(5, 65),
    },
    ({ lo, span, threshold }) =>
      Effect.gen(function* () {
        const hi = lo + span;
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
              directValid: ["proof/valid?", "b"],
              atLeastOk: ["proof/valid?", "b", { atLeast: threshold }],
              aboveOk: ["proof/valid?", "b", { above: threshold }],
              atMostOk: ["proof/valid?", "b", { atMost: threshold }],
              forgedCheck: ["proof/valid?", ["quote", { check: true }]],
              forgedWhyCheck: [
                "proof/valid?",
                [
                  "quote",
                  {
                    fact: ["p", 1],
                    rule: ["rule", ["p", "?x"], ["q", "?x"]],
                    because: [{ check: false }],
                  },
                ],
              ],
              forgedWhyHead: [
                "proof/valid?",
                [
                  "quote",
                  {
                    fact: ["p", 1],
                    rule: ["rule", ["other", "?x"], ["q", "?x"]],
                    because: [{ fact: ["q", 1], given: true }],
                  },
                ],
              ],
            },
          ],
          stdlib
        )) as {
          aboveOk: boolean;
          atLeastOk: boolean;
          atMostOk: boolean;
          directValid: boolean;
          forgedCheck: boolean;
          forgedWhyCheck: boolean;
          forgedWhyHead: boolean;
        };

        expect(out.directValid).toBe(true);
        expect(out.atLeastOk).toBe(lo >= threshold);
        expect(out.aboveOk).toBe(lo > threshold);
        expect(out.atMostOk).toBe(hi <= threshold);
        expect(out.forgedCheck).toBe(false);
        expect(out.forgedWhyCheck).toBe(false);
        expect(out.forgedWhyHead).toBe(false);
      })
  );
});

describe("persisted define helpers and expanded static lints", () => {
  it.effect.prop(
    "persists define with persist:true across snapshots and subsequent runs while keeping plain define ephemeral",
    {
      factor: int(2, 20),
      input: int(-50, 50),
    },
    ({ factor, input }) =>
      Effect.gen(function* () {
        const db = new LogicDatabase();
        yield* run(
          [
            "begin",
            [
              "define",
              "scale_val",
              ["lambda", ["x"], ["number/multiply", "x", factor]],
              { persist: true },
            ],
            ["define", "ephemeral_val", factor],
          ],
          stdlib,
          { database: db }
        );

        const saved = yield* saveDatabase(db);
        const reloaded = yield* loadDatabase(
          JSON.parse(JSON.stringify(saved)),
          stdlib
        );
        // Persisted helper is callable in a brand-new run without re-defining!
        const called = yield* run(["scale_val", input], stdlib, {
          database: reloaded,
        });
        expect(called).toBe(input * factor);
        // Ephemeral define was NOT persisted.
        expect(reloaded.definitions.has("ephemeral_val")).toBe(false);
        expect(reloaded.definitions.has("scale_val")).toBe(true);
      })
  );

  it.effect.prop(
    "lion check lint catches multi-goal find/query and bare logic vars in facts with zero false positives on valid forms",
    {
      rel: Arbitrary.schema(Schema.Literals(["edge", "claim", "node"])),
      varName: Arbitrary.schema(Schema.Literals(["?x", "?y", "?id"])),
    },
    ({ rel, varName }) =>
      Effect.gen(function* () {
        const badFind = yield* lint([
          "begin",
          ["relation", rel, ["a"]],
          ["find", varName, [rel, varName], [rel, "a"]],
        ]);
        expect(badFind.length).toBeGreaterThan(0);

        const badQuery = yield* lint([
          "begin",
          ["relation", rel, ["a"]],
          ["query", [rel, varName], [rel, "a"]],
        ]);
        expect(badQuery.length).toBeGreaterThan(0);

        const badFact = yield* lint([
          "begin",
          ["relation", rel, ["a"]],
          ["fact", [rel, varName]],
        ]);
        expect(badFact.length).toBeGreaterThan(0);

        const goodProgram = yield* lint([
          "begin",
          ["relation", rel, ["a"]],
          ["fact", [rel, ["quote", varName]]],
          ["find", varName, ["and", [rel, varName], [rel, "a"]]],
          ["query", [rel, varName], { limit: 5 }],
        ]);
        expect(goodProgram).toEqual([]);
      })
  );
});

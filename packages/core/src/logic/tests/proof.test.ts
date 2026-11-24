/**
 * Property-based tests for CIC-style rule induction (`proof/rules`),
 * Omega integer split certificates (`refuteWithSplits`), and the unified
 * trusted proof kernel (`proof/valid?`).
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import {
  type Certificate,
  checksProof,
  refuteWithSplits,
  type SplitCertificate,
} from "@/logic/certificate";
import { LogicDatabase } from "@/logic/database";
import {
  type Constraint,
  constant,
  minus,
  plus,
  type Sort,
  satisfiable,
  times,
  variable,
} from "@/logic/solver";
import { ratio } from "@/numbers/exact";
import { attempt } from "./programs";

const OPTIONS = { timeout: 120_000 };

const int = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

describe("rule induction and proof kernel", () => {
  it.effect.prop(
    "proves positive path weights by rule induction and disproves rules that can break the bound",
    {
      edgeLo: int(1, 5),
      subtract: Arbitrary.schema(Schema.Boolean),
      targetLo: int(1, 5),
    },
    ({ edgeLo, subtract, targetLo }) =>
      Effect.gen(function* () {
        const combineOp = subtract ? "number/subtract" : "number/add";
        const outcome = yield* attempt(
          [
            "begin",
            [
              "schema",
              "EdgeCost",
              [
                "schema/allOf",
                "value/integer?",
                ["lambda", ["c"], ["number/greaterThanOrEqualTo", "c", edgeLo]],
              ],
            ],
            [
              "schema",
              "PosEdge",
              {
                cost: "EdgeCost",
                from: "value/string?",
                to: "value/string?",
              },
            ],
            [
              "schema",
              "TargetPath",
              {
                cost: [
                  "schema/allOf",
                  "value/integer?",
                  [
                    "lambda",
                    ["c"],
                    ["number/greaterThanOrEqualTo", "c", targetLo],
                  ],
                ],
                from: "value/string?",
                to: "value/string?",
              },
            ],
            ["relation", "edge", ["from", "to", "cost"], { schema: "PosEdge" }],
            ["relation", "path", ["from", "to", "cost"]],
            [
              "rule",
              ["path", "?a", "?b", ["aggregate/min", "?c"]],
              ["edge", "?a", "?b", "?c"],
            ],
            [
              "rule",
              [
                "path",
                "?a",
                "?c",
                ["aggregate/min", [combineOp, "?c1", "?c2"]],
              ],
              ["edge", "?a", "?b", "?c1"],
              ["path", "?b", "?c", "?c2"],
            ],
            ["define", "p", ["proof/rules", "path", "TargetPath"]],
            { proof: "p", valid: ["proof/valid?", "p"] },
          ],
          new LogicDatabase()
        );
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) {
          return;
        }
        const { proof, valid } = outcome.value as {
          readonly proof: { readonly proved: boolean };
          readonly valid: boolean;
        };
        // With addition: holds iff edgeLo >= targetLo (since edgeLo + targetLo >= targetLo).
        // With subtraction: edgeLo - targetLo can be <= 0 < targetLo, so always disproved!
        const expected = !subtract && edgeLo >= targetLo;
        expect(proof.proved).toBe(expected);
        expect(valid).toBe(expected);
      }),
    OPTIONS
  );

  it.effect.prop(
    "proves mutually recursive relations by simultaneous rule induction",
    {
      baseLo: int(0, 4),
      step: int(1, 3),
      targetLo: int(0, 4),
    },
    ({ baseLo, step, targetLo }) =>
      Effect.gen(function* () {
        const outcome = yield* attempt(
          [
            "begin",
            [
              "schema",
              "SeedRow",
              {
                n: [
                  "schema/allOf",
                  "value/integer?",
                  [
                    "lambda",
                    ["n"],
                    ["number/greaterThanOrEqualTo", "n", baseLo],
                  ],
                ],
                node: "value/string?",
              },
            ],
            [
              "schema",
              "TargetRow",
              {
                n: [
                  "schema/allOf",
                  "value/integer?",
                  [
                    "lambda",
                    ["n"],
                    ["number/greaterThanOrEqualTo", "n", targetLo],
                  ],
                ],
                node: "value/string?",
              },
            ],
            ["relation", "seed", ["node", "n"], { schema: "SeedRow" }],
            ["relation", "even", ["node", "n"]],
            ["relation", "odd", ["node", "n"]],
            [
              "rule",
              ["even", "?x", ["aggregate/min", "?n"]],
              ["seed", "?x", "?n"],
            ],
            [
              "rule",
              ["odd", "?x", ["aggregate/min", ["number/add", "?n", step]]],
              ["even", "?x", "?n"],
            ],
            [
              "rule",
              ["even", "?x", ["aggregate/min", ["number/add", "?n", step]]],
              ["odd", "?x", "?n"],
            ],
            [
              "define",
              "p",
              ["proof/rules", { even: "TargetRow", odd: "TargetRow" }],
            ],
            { proof: "p", valid: ["proof/valid?", "p"] },
          ],
          new LogicDatabase()
        );
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) {
          return;
        }
        const { proof, valid } = outcome.value as {
          readonly proof: { readonly proved: boolean };
          readonly valid: boolean;
        };
        const expected = baseLo >= targetLo;
        expect(proof.proved).toBe(expected);
        expect(valid).toBe(expected);
      }),
    OPTIONS
  );

  it.effect.prop(
    "proof/valid? accepts genuine why proofs, induction proofs, lemmas, and rejects tampered proofs",
    {
      bound: int(1, 6),
    },
    ({ bound }) =>
      Effect.gen(function* () {
        const outcome = yield* attempt(
          [
            "begin",
            ["relation", "limit", ["n"]],
            ["relation", "room", ["n"]],
            ["fact", ["limit", bound + 1]],
            [
              "rule",
              ["room", "?n"],
              ["limit", "?n"],
              ["schema/fits?", "?x", "value/integer?"],
              ["number/greaterThan", "?x", bound],
              ["number/lessThan", "?x", "?n"],
            ],
            ["define", "w", ["why", ["room", bound + 1]]],
            [
              "define",
              "certs",
              [
                "object/get",
                [
                  "object/get",
                  ["array/head", ["object/get", "w", "because"]],
                  "but",
                ],
                "certificate",
              ],
            ],
            [
              "define",
              "lemma",
              {
                claim: ["quote", ["no-room", bound]],
                in: "certs",
                kind: ["quote", "lemma"],
                proof: "certs",
              },
            ],
            [
              "define",
              "forged",
              [
                "quote",
                {
                  constraints: [{ constant: 0, relation: ">=", sum: { x: 1 } }],
                  steps: [{ from: [[0, -1]], tightened: false }],
                },
              ],
            ],
            [
              "define",
              "emptyInduction",
              [
                "quote",
                {
                  basis: "rules",
                  cases: [],
                  kind: "induction",
                  proved: true,
                  target: "fake",
                },
              ],
            ],
            {
              certsValid: ["proof/valid?", "certs"],
              emptyIndValid: ["proof/valid?", "emptyInduction"],
              forgedValid: ["proof/valid?", "forged"],
              lemmaValid: ["proof/valid?", "lemma"],
              whyValid: ["proof/valid?", "w"],
            },
          ],
          new LogicDatabase()
        );
        expect(outcome).toEqual({
          ok: true,
          value: {
            certsValid: true,
            emptyIndValid: false,
            forgedValid: false,
            lemmaValid: true,
            whyValid: true,
          },
        });
      }),
    OPTIONS
  );

  it.prop(
    "certifies Omega grey-shadow integer unsatisfiability with verifiable split certificates",
    {
      shift: int(-5, 5),
    },
    ({ shift }) => {
      // Classic Omega grey-shadow UNSAT system (real-satisfiable, integer-unsatisfiable):
      // 2y + 1 <= 3x <= 2y + 2  and  3y + 1 <= 2x <= 3y + 2  (shifted by `shift`)
      // Let x' = x - shift, y' = y - shift:
      // 3x' - 2y' >= 1, -3x' + 2y' >= -2, 2x' - 3y' >= 1, -2x' + 3y' >= -2
      const x = minus(variable("x"), constant(ratio(BigInt(shift))));
      const y = minus(variable("y"), constant(ratio(BigInt(shift))));
      const c1: Constraint = {
        linear: minus(
          minus(times(x, ratio(3n)), times(y, ratio(2n))),
          constant(ratio(1n))
        ),
        relation: ">=",
      };
      const c2: Constraint = {
        linear: plus(
          minus(times(y, ratio(2n)), times(x, ratio(3n))),
          constant(ratio(2n))
        ),
        relation: ">=",
      };
      const c3: Constraint = {
        linear: minus(
          minus(times(x, ratio(2n)), times(y, ratio(3n))),
          constant(ratio(1n))
        ),
        relation: ">=",
      };
      const c4: Constraint = {
        linear: plus(
          minus(times(y, ratio(3n)), times(x, ratio(2n))),
          constant(ratio(2n))
        ),
        relation: ">=",
      };
      const constraints = [c1, c2, c3, c4];
      const sorts = new Map<string, Sort>([
        ["x", "integer"],
        ["y", "integer"],
      ]);
      expect(satisfiable(constraints, sorts)).toBe(false);
      const cert = refuteWithSplits(constraints, sorts);
      expect(cert).toBeDefined();
      expect(checksProof(cert)).toBe(true);
      // Tampering with the split bound or with only the low child's split line
      // must be rejected by the kernel.
      if (cert !== undefined && "kind" in cert && cert.kind === "split") {
        const split = cert as SplitCertificate;
        expect(checksProof({ ...split, bound: Number(split.bound) + 1 })).toBe(
          false
        );
        const lowBase = split.low.constraints.slice(0, -1);
        const forgedLow: Certificate = {
          constraints: [...lowBase, { constant: 0, relation: ">", sum: {} }],
          steps: [{ from: [[lowBase.length, 1]], tightened: false }],
        };
        expect(checksProof({ ...split, low: forgedLow })).toBe(false);
      } else if (cert !== undefined) {
        const linear = cert as Certificate;
        expect(checksProof({ ...linear, steps: [] })).toBe(false);
      }
    }
  );
});

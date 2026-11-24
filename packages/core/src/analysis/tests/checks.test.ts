/**
 * Static diagnostics and warnings in `analyze`: declaration/option errors
 * match runtime `LogicError` messages, unsafe rule heads / find templates /
 * ground facts match runtime safety checks, and warnings flag duplicate
 * lambda parameters, unreachable `cond` branches, and near-miss bare calls.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { analyze, flattenAnalysis } from "@/analysis/analyze";
import { element } from "@/logic/tests/programs";
import { stdlib } from "@/modules";
import { outcome } from "./programs";

const OPTIONS = { arbitrary: { runs: 60 } };

const ident = element(["alpha", "beta", "gamma", "delta"]);
const smallInt = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: -5, maximum: 5 }))
);

describe("analyze: static declaration, option, and safety checks", () => {
  it.effect.prop(
    "flags invalid relation declarations with the exact runtime error message",
    {
      badKind: element([
        "valid",
        "dup-col",
        "unknown-opt",
        "empty-key",
        "missing-key-col",
        "dup-key-col",
        "merge-no-key",
        "merge-missing-col",
        "merge-key-col",
        "merge-bad-agg",
      ]),
      colA: element(["id", "k"]),
      colB: element(["val", "score"]),
    },
    ({ badKind, colA, colB }) =>
      Effect.gen(function* () {
        let program: unknown;
        switch (badKind) {
          case "valid":
            program = [
              "relation",
              "r",
              [colA, colB],
              { key: [colA], merge: { [colB]: "aggregate/min" } },
            ];
            break;
          case "dup-col":
            program = ["relation", "r", [colA, colA]];
            break;
          case "unknown-opt":
            program = ["relation", "r", [colA, colB], { bogus: 1 }];
            break;
          case "empty-key":
            program = ["relation", "r", [colA, colB], { key: [] }];
            break;
          case "missing-key-col":
            program = ["relation", "r", [colA, colB], { key: ["nope"] }];
            break;
          case "dup-key-col":
            program = ["relation", "r", [colA, colB], { key: [colA, colA] }];
            break;
          case "merge-no-key":
            program = [
              "relation",
              "r",
              [colA, colB],
              { merge: { [colB]: "aggregate/sum" } },
            ];
            break;
          case "merge-missing-col":
            program = [
              "relation",
              "r",
              [colA, colB],
              { key: [colA], merge: { nope: "aggregate/sum" } },
            ];
            break;
          case "merge-key-col":
            program = [
              "relation",
              "r",
              [colA, colB],
              { key: [colA], merge: { [colA]: "aggregate/sum" } },
            ];
            break;
          case "merge-bad-agg":
            program = [
              "relation",
              "r",
              [colA, colB],
              { key: [colA], merge: { [colB]: "number/add" } },
            ];
            break;
          default:
            program = ["relation", "r", [colA, colB]];
        }
        const root = analyze(program as never, stdlib);
        const ran = yield* outcome(program);
        if (badKind === "valid") {
          expect(root.diagnostic).toBeUndefined();
          expect("value" in ran).toBe(true);
        } else {
          expect(ran).toMatchObject({ error: "LogicError" });
          expect(root.diagnostic).toBe(
            "message" in ran ? ran.message : undefined
          );
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "flags invalid query and invariant options with the exact runtime error message",
    {
      badLimit: smallInt,
      form: element(["query", "invariant"]),
      kind: element([
        "valid",
        "unknown-opt",
        "bad-assert",
        "missing-assert",
        "bad-order-var",
        "bad-limit",
      ]),
    },
    ({ badLimit, form, kind }) =>
      Effect.gen(function* () {
        if (
          form === "invariant" &&
          (kind === "bad-order-var" || kind === "bad-limit")
        ) {
          return;
        }
        if (form === "query" && kind === "missing-assert") {
          return;
        }
        const optionsByKind: Record<string, Record<string, unknown>> = {
          valid:
            form === "invariant"
              ? { assert: "some" }
              : { limit: Math.abs(badLimit), order: "-x" },
          "unknown-opt": { extra: true },
          "bad-assert": { assert: "always" },
          "missing-assert": {},
          "bad-order-var": { order: "missing" },
          "bad-limit": { limit: -Math.abs(badLimit) - 1 },
        };
        const options = optionsByKind[kind];
        const program = [
          "begin",
          ["relation", "p", ["x"]],
          ["fact", ["p", 1]],
          [form, ["p", "?x"], options],
        ];
        const target = flattenAnalysis(analyze(program as never, stdlib)).find(
          (node) => node.pointer === "/3"
        );
        const ran = yield* outcome(program);
        if (kind === "valid") {
          expect(target?.diagnostic).toBeUndefined();
          expect("value" in ran).toBe(true);
        } else {
          expect(ran).toMatchObject({ error: "LogicError" });
          expect(target?.diagnostic).toBe(
            "message" in ran ? ran.message : undefined
          );
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "flags unsafe rule heads, anonymous rule heads, unsafe find templates, and logic variables in facts",
    {
      kind: element([
        "rule-unsafe",
        "rule-anon",
        "rule-exists-ok",
        "rule-question-anon-ok",
        "find-unsafe",
        "find-ok",
        "fact-var",
        "fact-assuming-ok",
      ]),
      varName: ident,
    },
    ({ kind, varName }) =>
      Effect.gen(function* () {
        const v = `?${varName}`;
        const other = "?other";
        let program: unknown;
        let pointer = "/3";
        switch (kind) {
          case "rule-unsafe":
            program = [
              "begin",
              ["relation", "p", ["a"]],
              ["relation", "q", ["a", "b"]],
              ["rule", ["q", other, v], ["p", other]],
            ];
            break;
          case "rule-anon":
            program = [
              "begin",
              ["relation", "p", ["a"]],
              ["relation", "q", ["a", "b"]],
              ["rule", ["q", other, "?_"], ["p", other]],
            ];
            break;
          case "rule-exists-ok":
            program = [
              "begin",
              ["relation", "p", ["a"]],
              ["relation", "q", ["a", "b"]],
              ["rule", ["exists", [v], ["q", other, v]], ["p", other]],
            ];
            break;
          case "rule-question-anon-ok":
            program = [
              "begin",
              ["relation", "p", ["a"]],
              ["relation", "q", ["a", "flag"]],
              [
                "rule",
                ["q", other, ["cond", [["p", "?_"], true], ["else", false]]],
                ["p", other],
              ],
            ];
            break;
          case "find-unsafe":
            program = [
              "begin",
              ["relation", "p", ["a"]],
              ["fact", ["p", 1]],
              ["find", v, ["p", other]],
            ];
            break;
          case "find-ok":
            program = [
              "begin",
              ["relation", "p", ["a"]],
              ["fact", ["p", 1]],
              ["find", v, ["p", v]],
            ];
            break;
          case "fact-var":
            program = ["begin", ["relation", "p", ["a"]], ["fact", ["p", v]]];
            pointer = "/2";
            break;
          case "fact-assuming-ok":
            program = [
              "begin",
              ["relation", "p", ["a"]],
              ["fact", ["p", 1]],
              [
                "query",
                ["and", ["p", v], ["assuming", ["fact", ["p", v]], ["p", v]]],
              ],
            ];
            pointer = "/3/1/2/1";
            break;
          default:
            program = 0;
        }
        const target = flattenAnalysis(analyze(program as never, stdlib)).find(
          (node) => node.pointer === pointer
        );
        const ran = yield* outcome(program);
        const shouldFail =
          kind === "rule-unsafe" ||
          kind === "rule-anon" ||
          kind === "find-unsafe" ||
          kind === "fact-var";
        if (shouldFail) {
          expect(ran).toMatchObject({ error: "LogicError" });
          expect(target?.diagnostic).toBe(
            "message" in ran ? ran.message : undefined
          );
        } else {
          expect(target?.diagnostic).toBeUndefined();
          expect("value" in ran).toBe(true);
        }
      }),
    OPTIONS
  );

  it.prop(
    "warns on duplicate lambda parameters, unreachable cond branches after unshadowed else, and near-miss bare call heads",
    {
      name: ident,
      shadowElse: Arbitrary.schema(Schema.Boolean),
    },
    ({ name, shadowElse }) => {
      // 1. Duplicate lambda parameters (including contracted form)
      const dupLambda = [
        "lambda",
        [[name, "value/number?"], "other", name],
        name,
      ];
      const dupWarnings = flattenAnalysis(
        analyze(dupLambda as never, stdlib)
      ).filter((node) => node.warning !== undefined);
      expect(dupWarnings).toHaveLength(1);
      expect(dupWarnings[0]?.pointer).toBe("/1/2");
      expect(dupWarnings[0]?.warning).toContain(`Parameter "${name}"`);

      // 2. Unreachable cond branch after unshadowed else (respecting lexical shadowing!)
      const condExpr = ["cond", ["else", 1], [true, 2]];
      const wrapped = shadowElse
        ? ["begin", ["define", "else", false], condExpr]
        : condExpr;
      const condWarnings = flattenAnalysis(
        analyze(wrapped as never, stdlib)
      ).filter((node) => node.warning !== undefined);
      if (shadowElse) {
        expect(condWarnings).toEqual([]);
      } else {
        expect(condWarnings).toHaveLength(1);
        expect(condWarnings[0]?.pointer).toBe("/2");
        expect(condWarnings[0]?.warning).toContain("can never be reached");
      }

      // 3. Near-miss bare call head (misspelled user binding & misspelled special form)
      const typo = `${name}z`;
      const callProg = [
        "begin",
        ["define", name, ["lambda", ["v"], "v"]],
        [typo, 1],
      ];
      const typoNode = flattenAnalysis(analyze(callProg as never, stdlib)).find(
        (node) => node.pointer === "/2/0"
      );
      expect(typoNode?.meaning).toEqual({ kind: "unbound" });
      expect(typoNode?.diagnostic).toBeUndefined();
      expect(typoNode?.warning).toBe(
        `Nothing in scope binds "${typo}". Did you mean "${name}"?`
      );

      const formTypo = flattenAnalysis(
        analyze(["defin", "x", 1] as never, stdlib)
      ).find((node) => node.pointer === "/0");
      expect(formTypo?.meaning).toEqual({ kind: "unbound" });
      expect(formTypo?.warning).toBe(
        'Nothing in scope binds "defin". Did you mean "define"?'
      );
    },
    OPTIONS
  );
});

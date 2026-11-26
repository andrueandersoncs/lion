import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { applyJsonPatches, suggestFixes } from "@/analysis/autofix";
import { run } from "@/evaluation/evaluate";
import { safeStdlib } from "@/modules";

const smallInt = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: -50, maximum: 50 }))
);

describe("RFC 6902 auto-fix suggestions", () => {
  it.effect.prop(
    "auto-fixes misspelled module/name calls so the patched program evaluates cleanly",
    { a: smallInt, b: smallInt },
    ({ a, b }) =>
      Effect.gen(function* () {
        const broken = ["number/ad", a, b];
        const fixes = yield* suggestFixes(broken);
        expect(fixes.length).toBeGreaterThanOrEqual(1);
        const patched = applyJsonPatches(
          broken,
          fixes.flatMap((f) => f.patch)
        );
        expect(patched).toEqual(["number/add", a, b]);
        expect(yield* run(patched, safeStdlib)).toBe(a + b);
      })
  );

  it.effect.prop(
    "auto-fixes bare list patterns and multi-goal queries into valid runnable Lion",
    { a: smallInt, b: smallInt },
    ({ a, b }) =>
      Effect.gen(function* () {
        const bareListProgram = [
          "find",
          "?x",
          ["in", ["?x", "?y"], ["quote", [[a, b]]]],
        ];
        const listFixes = yield* suggestFixes(bareListProgram);
        expect(listFixes.length).toBeGreaterThanOrEqual(1);
        const fixedList = applyJsonPatches(
          bareListProgram,
          listFixes.flatMap((f) => f.patch)
        );
        expect(yield* run(fixedList, safeStdlib)).toEqual([a]);

        const multiGoalProgram = [
          "begin",
          ["relation", "p", ["x"]],
          ["fact", ["p", a], ["p", b]],
          ["query", ["p", "?x"], ["number/equals?", "?x", a]],
        ];
        const goalFixes = yield* suggestFixes(multiGoalProgram);
        expect(goalFixes.length).toBeGreaterThanOrEqual(1);
        const fixedGoal = applyJsonPatches(
          multiGoalProgram,
          goalFixes.flatMap((f) => f.patch)
        );
        expect(yield* run(fixedGoal, safeStdlib)).toEqual([{ x: a }]);
      })
  );
});

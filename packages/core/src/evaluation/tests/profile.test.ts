import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { profileRun } from "@/evaluation/profile";
import { safeStdlib } from "@/modules";

const chainLen = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 2, maximum: 8 }))
);

describe("execution profiling and plan inspection", () => {
  it.effect.prop(
    "reports base facts, derived rows, recursive strata, and step metrics accurately",
    { len: chainLen },
    ({ len }) =>
      Effect.gen(function* () {
        const edges = Array.from({ length: len }, (_, i) => [
          "edge",
          `n${i}`,
          `n${i + 1}`,
        ]);
        const program = [
          "begin",
          ["relation", "edge", ["from", "to"]],
          ["relation", "reach", ["from", "to"]],
          ["rule", ["reach", "?x", "?y"], ["edge", "?x", "?y"]],
          [
            "rule",
            ["reach", "?x", "?z"],
            ["reach", "?x", "?y"],
            ["edge", "?y", "?z"],
          ],
          ["fact", ...edges],
          ["query", ["reach", "?x", "?y"]],
        ];
        const profile = yield* profileRun(program, safeStdlib);
        const expectedDerived = (len * (len + 1)) / 2;
        expect(profile.metrics.steps).toBeGreaterThan(0);
        expect(profile.plan.totalBaseFacts).toBe(len);
        expect(profile.plan.rules).toBe(2);

        const reachInfo = profile.plan.relations.find(
          (r) => r.name === "reach"
        );
        expect(reachInfo?.baseFacts).toBe(0);
        expect(reachInfo?.derivedRows).toBe(expectedDerived);

        const reachStratum = profile.plan.strata.find((s) =>
          s.relations.includes("reach")
        );
        expect(reachStratum?.recursive).toBe(true);
      })
  );
});

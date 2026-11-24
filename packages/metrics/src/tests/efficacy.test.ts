import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { countAstNodes, evaluateEfficacy, KB_TASKS } from "../efficacy.ts";
import { load } from "../lion.ts";
import { CORE, REPOSITORY } from "../sources.ts";

describe("research-KB efficacy benchmark", () => {
  it.prop(
    "countAstNodes counts every leaf and container node strictly",
    {
      items: Arbitrary.array(
        Arbitrary.schema(
          Schema.Int.check(Schema.isBetween({ minimum: -50, maximum: 50 }))
        ),
        { maxLength: 8 }
      ),
    },
    ({ items }) => {
      expect(countAstNodes(items)).toBe(1 + items.length);
      expect(countAstNodes({ a: items, b: 1 })).toBe(
        1 + (1 + items.length) + 1
      );
    }
  );

  it.effect.prop(
    "every KB efficacy task passes natively with bounded AST size",
    {
      index: Arbitrary.schema(
        Schema.Int.check(
          Schema.isBetween({ minimum: 0, maximum: KB_TASKS.length - 1 })
        )
      ),
    },
    ({ index }) =>
      Effect.gen(function* () {
        const sourceDir = join(REPOSITORY, CORE);
        const lion = yield* load(sourceDir);
        const summary = yield* evaluateEfficacy(sourceDir, lion);
        const result = summary.results[index];
        expect(result?.passed).toBe(true);
        expect(result?.mode).toBe("native");
        expect(result?.astNodes ?? 0).toBeGreaterThan(0);
        expect(summary.passedCount).toBe(KB_TASKS.length);
        expect(summary.nativeCount).toBe(KB_TASKS.length);
      }),
    { timeout: 60_000, arbitrary: { runs: 1 } }
  );
});

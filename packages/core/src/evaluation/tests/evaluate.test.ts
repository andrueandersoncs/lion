import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";

describe("run", () => {
  it("should evaluate an expression", () =>
    Effect.gen(function* () {
      const result = yield* run(["math/+", 1, 2], stdlib);
      expect(result).toBe(3);
    }));
});

import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";

describe("lambda special form", () => {
  it.effect(
    "should evaluate to a function that can be called with the given arguments",
    () =>
      Effect.gen(function* () {
        const expression = [
          ["/lambda", ["x", "y"], ["math/+", "x", "y"]],
          1,
          2,
        ];
        const result = yield* run(expression, stdlib);
        expect(result).toBe(3);
      })
  );
});

import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { isBound, makeEnvironment } from "@/evaluation/environment";
import { evaluate, run } from "@/evaluation/evaluate";
import { LionEnvironmentService } from "@/services/evaluation";

describe("cond special form", () => {
  it.effect(
    "should return the result of the first case that evaluates to true",
    () =>
      Effect.gen(function* () {
        const expression = ["cond", [false, "false"], [true, "true"]];
        const result = yield* run(expression, {});
        expect(result).toBe("true");
      })
  );

  it.effect(
    "should not continue evaluating the condition expressions after the first true case",
    () =>
      Effect.gen(function* () {
        const expression = [
          "cond",
          [false, "false"],
          [true, "true"],
          [["define", "x", 1], "huh?"],
        ];
        const environment = makeEnvironment({});
        const result = yield* evaluate(expression).pipe(
          Effect.provideService(LionEnvironmentService, environment)
        );
        expect(result).toBe("true");
        expect(isBound(environment, "x")).toBe(false);
      })
  );

  it.effect(
    "should not evaluate the result body of more than one true case",
    () =>
      Effect.gen(function* () {
        const expression = [
          "cond",
          [false, "false"],
          [true, "true"],
          [true, ["define", "x", 1]],
        ];
        const environment = makeEnvironment({});
        const result = yield* evaluate(expression).pipe(
          Effect.provideService(LionEnvironmentService, environment)
        );
        expect(result).toBe("true");
        expect(isBound(environment, "x")).toBe(false);
      })
  );

  it.effect("should not evaluate the result body of false cases", () =>
    Effect.gen(function* () {
      const expression = [
        "cond",
        [false, ["define", "x", 1]],
        [true, "true"],
        [true, ["define", "y", 1]],
      ];
      const environment = makeEnvironment({});
      const result = yield* evaluate(expression).pipe(
        Effect.provideService(LionEnvironmentService, environment)
      );
      expect(result).toBe("true");
      expect(isBound(environment, "x")).toBe(false);
      expect(isBound(environment, "y")).toBe(false);
    })
  );
});

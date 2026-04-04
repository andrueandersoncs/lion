import { describe, expect, it } from "@effect/vitest";
import { Effect, Ref } from "effect";
import { getBinding, makeEnvironment } from "@/evaluation/environment";
import { evaluate, run } from "@/evaluation/evaluate";
import {
  LionEnvironmentService,
  makeEnvironmentRef,
} from "@/services/evaluation";

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
        const environmentRef = yield* makeEnvironmentRef(makeEnvironment({}));
        const result = yield* evaluate(expression).pipe(
          Effect.provideService(LionEnvironmentService, environmentRef)
        );
        expect(result).toBe("true");
        const environment = yield* Ref.get(environmentRef);
        expect(getBinding(environment, "x")).not.toBe(1);
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
        const environmentRef = yield* makeEnvironmentRef(makeEnvironment({}));
        const result = yield* evaluate(expression).pipe(
          Effect.provideService(LionEnvironmentService, environmentRef)
        );
        expect(result).toBe("true");
        const environment = yield* Ref.get(environmentRef);
        expect(getBinding(environment, "x")).not.toBe(1);
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
      const environmentRef = yield* makeEnvironmentRef(makeEnvironment({}));
      const result = yield* evaluate(expression).pipe(
        Effect.provideService(LionEnvironmentService, environmentRef)
      );
      expect(result).toBe("true");
      const environment = yield* Ref.get(environmentRef);
      expect(getBinding(environment, "x")).not.toBe(1);
      expect(getBinding(environment, "y")).not.toBe(1);
    })
  );
});

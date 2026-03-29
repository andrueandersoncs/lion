import { describe, expect, it } from "@effect/vitest";
import { Effect, Ref } from "effect";
import { evaluate } from "@/evaluation/evaluate";
import { DefineFormSchema } from "@/schemas/evaluation";
import {
  LionEnvironmentService,
  makeEnvironmentRef,
} from "@/services/evaluation";

const TestSchema = DefineFormSchema;

describe("define special form", () => {
  it.effect.prop(
    "should define a variable in the environment",
    [TestSchema],
    ([expression]) =>
      Effect.gen(function* () {
        // should return the value of the evaluated "value" argument
        const environmentRef = yield* makeEnvironmentRef({});
        const result = yield* evaluate(expression).pipe(
          Effect.provideService(LionEnvironmentService, environmentRef)
        );
        const value = yield* evaluate(expression[2]).pipe(
          Effect.provideService(LionEnvironmentService, environmentRef)
        );
        expect(result).toEqual(value);

        // should be stored in the environment
        const environment = yield* Ref.get(environmentRef);
        const environmentValue = environment[expression[1]];
        expect(environmentValue).toEqual(result);
      })
  );
});

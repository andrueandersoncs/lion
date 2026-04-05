import { describe, expect, it } from "@effect/vitest";
import { Effect, Match, Option, pipe, Schema } from "effect";
import { InvalidFunctionCallError } from "@/errors/evaluation";
import { getBinding, makeEnvironment } from "@/evaluation/environment";
import { evaluate, run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";
import { DefineFormSchema } from "@/schemas/evaluation";
import { LionEnvironmentService } from "@/services/evaluation";

const TestSchema = DefineFormSchema;

describe("define special form", () => {
  it.effect.prop(
    "should define a variable in the environment",
    [TestSchema],
    ([expression]) =>
      Effect.gen(function* () {
        // should return the value of the evaluated "value" argument
        const environment = yield* makeEnvironment({});
        const result = yield* evaluate(expression).pipe(
          Effect.provideService(LionEnvironmentService, environment),
          Effect.catchTag("InvalidFunctionCallError", (e) => Effect.succeed(e))
        );
        const value = yield* evaluate(expression[2]).pipe(
          Effect.provideService(LionEnvironmentService, environment),
          Effect.catchTag("InvalidFunctionCallError", (e) => Effect.succeed(e))
        );
        expect(result).toEqual(value);

        // should be stored in the environment
        yield* pipe(
          Match.value(result),
          Match.when(Schema.is(InvalidFunctionCallError), () =>
            Effect.succeed(null)
          ),
          Match.orElse(() =>
            Effect.gen(function* () {
              const environmentValue = yield* getBinding(
                environment,
                expression[1]
              );
              expect(Option.getOrUndefined(environmentValue)).toEqual(result);
            })
          )
        );
      })
  );
  it.effect(
    "should overwrite a global binding when called from within a lambda",
    () =>
      Effect.gen(function* () {
        const program = [
          "begin",
          ["define", "x", 1],
          [["lambda", [], ["define", "x", 2]]],
          "x",
        ];
        const result = yield* run(program, stdlib);
        expect(result).toBe(2);
      })
  );
  it.effect(
    "should overwrite a global binding when called from within a callback",
    () =>
      Effect.gen(function* () {
        const program = [
          "begin",
          ["define", "x", 1],
          [["func/callback", ["lambda", [], ["define", "x", 2]]]],
          "x",
        ];
        const result = yield* run(program, stdlib);
        expect(result).toBe(2);
      })
  );
});

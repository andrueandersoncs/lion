import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Match, Option, pipe, Schema } from "effect";
import { InvalidFunctionCallError } from "@/errors/evaluation";
import { getBinding, makeEnvironment } from "@/evaluation/environment";
import { evaluate, run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";
import { DefineFormSchema, SPECIAL_FORM_NAMES } from "@/schemas/evaluation";
import { LionEnvironmentService } from "@/services/evaluation";

const TestSchema = DefineFormSchema;

describe("define special form", () => {
  it.effect.prop(
    "should define a variable in the environment",
    [TestSchema],
    ([expression]) =>
      Effect.gen(function* () {
        // should return the value of the evaluated "value" argument; define
        // evaluates it before binding, so compute the expectation in a separate
        // environment where the defined name is never bound
        const valueEnvironment = yield* makeEnvironment({});
        const value = yield* evaluate(expression[2]).pipe(
          Effect.provideService(LionEnvironmentService, valueEnvironment),
          Effect.catchTag("InvalidFunctionCallError", (e) => Effect.succeed(e))
        );
        const environment = yield* makeEnvironment({});
        const result = yield* evaluate(expression).pipe(
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

  it.effect.prop(
    "should say what is wrong when the name belongs to a special form",
    {
      name: Arbitrary.schema(Schema.Literals(SPECIAL_FORM_NAMES)),
      value: Arbitrary.schema(Schema.Int),
    },
    ({ name, value }) =>
      Effect.gen(function* () {
        const expression = ["define", name, value];
        const error = yield* run(expression, stdlib).pipe(Effect.flip);
        expect(error).toBeInstanceOf(InvalidFunctionCallError);
        expect((error as InvalidFunctionCallError).message).toBe(
          `${JSON.stringify(expression)} is not a call: its first element must be a special form or evaluate to a function.`
        );
      })
  );
});

import { describe, expect, it } from "@effect/vitest";
import { Effect, Match, pipe, Ref, Schema } from "effect";
import { InvalidFunctionCallError } from "@/errors/evaluation";
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
          Effect.provideService(LionEnvironmentService, environmentRef),
          Effect.catchTag("InvalidFunctionCallError", (e) => Effect.succeed(e))
        );
        const value = yield* evaluate(expression[2]).pipe(
          Effect.provideService(LionEnvironmentService, environmentRef),
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
              const environment = yield* Ref.get(environmentRef);
              const environmentValue = environment[expression[1]];
              expect(environmentValue).toEqual(result);
            })
          )
        );
      })
  );
});

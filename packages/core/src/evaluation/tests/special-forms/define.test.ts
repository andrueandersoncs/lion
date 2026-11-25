import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Match, pipe, Schema } from "effect";
import { InvalidFunctionCallError } from "@/errors/evaluation";
import { lookup, makeEnvironment } from "@/evaluation/environment";
import { evaluate, run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";
import { NameSchema, SPECIAL_FORM_NAMES } from "@/schemas/evaluation";
import { LionExpressionSchema } from "@/schemas/lion-expression";
import { LionEnvironmentService } from "@/services/evaluation";

const TestSchema = Schema.Tuple([
  Schema.Literal("define"),
  NameSchema,
  LionExpressionSchema,
]);

const WORD = /^[a-z]{1,6}$/;

describe("define special form", () => {
  it.effect.prop(
    "should define a variable in the environment",
    [TestSchema],
    ([expression]) =>
      Effect.gen(function* () {
        // should return the value of the evaluated "value" argument; define
        // evaluates it before binding, so compute the expectation in a separate
        // environment where the defined name is never bound
        const valueEnvironment = makeEnvironment({});
        const value = yield* evaluate(expression[2]).pipe(
          Effect.provideService(LionEnvironmentService, valueEnvironment),
          Effect.catchTag("InvalidFunctionCallError", (e) => Effect.succeed(e))
        );
        const environment = makeEnvironment({});
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
            Effect.sync(() => {
              expect(lookup(environment, expression[1])).toEqual(result);
            })
          )
        );
      })
  );
  it.effect.prop(
    "binds in the body it stands in, so a define in a lambda never changes the name around it, and set! does",
    {
      name: Arbitrary.schema(Schema.String.check(Schema.isPattern(WORD))),
      outer: Arbitrary.schema(Schema.Int),
      inner: Arbitrary.schema(Schema.Int),
      how: Arbitrary.schema(
        Schema.Literals(["define", "set!", "callback define", "callback set!"])
      ),
    },
    ({ name, outer, inner, how }) =>
      Effect.gen(function* () {
        const form = how.endsWith("set!") ? "set!" : "define";
        const lambda = ["lambda", [], [form, name, inner]];
        const called = how.startsWith("callback")
          ? [["func/callback", lambda]]
          : [lambda];
        const program = ["begin", ["define", name, outer], called, name];
        expect(yield* run(program, stdlib)).toBe(
          form === "set!" ? inner : outer
        );
      })
  );

  it.effect.prop(
    "binds any name, a special form's among them, which then means the binding in its scope",
    {
      name: Arbitrary.schema(
        Schema.Literals(SPECIAL_FORM_NAMES.filter((name) => name !== "define"))
      ),
      value: Arbitrary.schema(Schema.Int),
    },
    ({ name, value }) =>
      Effect.gen(function* () {
        const body = ["array/make", ["define", name, value], name];
        expect(yield* run([["lambda", [], body]], stdlib)).toEqual([
          value,
          value,
        ]);
        expect(yield* run([["lambda", [name], name], value], stdlib)).toBe(
          value
        );
      })
  );
});

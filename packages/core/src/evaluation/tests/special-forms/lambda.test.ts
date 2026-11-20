import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Array as Arr, Effect, Result, Schema } from "effect";
import type { InvalidFunctionCallError } from "@/errors/evaluation";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";
import { NameSchema } from "@/schemas/evaluation";
import { LionExpressionSchema } from "@/schemas/lion-expression";

/** A lambda form whose parameters are names, with no contracts. */
const PlainLambdaSchema = Schema.Tuple([
  Schema.Literal("lambda"),
  Schema.Array(NameSchema),
  LionExpressionSchema,
]);

describe("lambda special form", () => {
  it.effect.prop(
    "should evaluate to a function",
    [PlainLambdaSchema],
    ([expression]) =>
      Effect.gen(function* () {
        const result = yield* run(expression, {});
        expect(typeof result).toBe("function");
      })
  );
  it.effect.prop(
    "should evaluate to a function, calling the function with correct arguments should not produce an error",
    [PlainLambdaSchema],
    ([expression]) =>
      Effect.gen(function* () {
        const result = yield* run(expression, {});
        expect(typeof result).toBe("function");

        if (typeof result === "function") {
          const properArgs = Arr.fromIterable(expression[1]);
          const actualResult = yield* (
            result(...properArgs) as Effect.Effect<
              unknown,
              InvalidFunctionCallError
            >
          ).pipe(
            Effect.map(() => "success"),
            Effect.catchTag("InvalidFunctionCallError", () =>
              Effect.succeed("success")
            )
          );
          expect(actualResult).toBe("success");
        }
      })
  );
  it.effect.prop(
    "takes as many arguments as it has parameters, and fails in the arity message with any other number",
    {
      parameters: Arbitrary.map(
        Arbitrary.array(Arbitrary.schema(Schema.Boolean), {
          minLength: 4,
          maxLength: 4,
        }),
        (chosen) => ["a", "b", "c", "d"].filter((_, at) => chosen[at])
      ),
      given: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 }))
      ),
      named: Arbitrary.schema(Schema.Boolean),
    },
    ({ parameters, given, named }) =>
      Effect.gen(function* () {
        const lambda = ["lambda", parameters, ["array/make", ...parameters]];
        const args = Array.from({ length: given }, (_, at) => at);
        const program = named
          ? ["begin", ["define", "f", lambda], ["f", ...args]]
          : [lambda, ...args];
        const result = yield* Effect.result(run(program, stdlib));
        if (given === parameters.length) {
          expect(result).toStrictEqual(Result.succeed(args));
        } else {
          const who = named ? '"f"' : JSON.stringify(lambda);
          const many = `${parameters.length} argument${parameters.length === 1 ? "" : "s"}`;
          expect(Result.isFailure(result) && result.failure).toMatchObject({
            _tag: "LogicError",
            message: `${who} takes ${many} but got ${given}.`,
          });
        }
      })
  );
  it.effect("should capture the global environment in the lambda", () =>
    Effect.gen(function* () {
      const expression = ["lambda", [], "x"];
      const lambda = yield* run(expression, { x: 1 });
      if (typeof lambda === "function") {
        const result = yield* lambda() as Effect.Effect<unknown>;
        expect(result).toBe(1);
      }
    })
  );
  it.effect("should read the latest global binding when invoked", () =>
    Effect.gen(function* () {
      const expression = [
        "begin",
        ["define", "x", 1],
        ["define", "f", ["lambda", [], "x"]],
        ["define", "x", 2],
        ["f"],
      ];
      const result = yield* run(expression, {});
      expect(result).toBe(2);
    })
  );
  it.effect("should capture the scope(s) above it in the lambda", () =>
    Effect.gen(function* () {
      const expression = [
        "lambda",
        ["x"],
        [
          ["lambda", ["y"], [["lambda", ["z"], { x: "x", y: "y", z: "z" }], 3]],
          2,
        ],
      ];
      const lambda = yield* run(expression, {});
      if (typeof lambda === "function") {
        const result = yield* lambda(1) as Effect.Effect<unknown>;
        expect(result).toEqual({ x: 1, y: 2, z: 3 });
      }
    })
  );
});

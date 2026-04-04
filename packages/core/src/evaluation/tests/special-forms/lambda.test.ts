import { describe, expect, it } from "@effect/vitest";
import { Array as Arr, Effect, Schema } from "effect";
import {
  ArgumentMismatchError,
  type InvalidFunctionCallError,
} from "@/errors/evaluation";
import { run } from "@/evaluation/evaluate";
import { LambdaFormSchema, ValidIdentifierSchema } from "@/schemas/evaluation";
import { LionExpressionSchema } from "@/schemas/lion-expression";

describe("lambda special form", () => {
  it.effect.prop(
    "should evaluate to a function",
    [LambdaFormSchema],
    ([expression]) =>
      Effect.gen(function* () {
        const result = yield* run(expression, {});
        expect(typeof result).toBe("function");
      })
  );
  it.effect.prop(
    "should evaluate to a function, calling the function with correct arguments should not produce an error",
    [LambdaFormSchema],
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
    "should evaluate to a function, calling the function with too few arguments should produce an error",
    [
      Schema.Tuple(
        Schema.Literal("lambda"),
        Schema.Tuple([ValidIdentifierSchema], ValidIdentifierSchema),
        LionExpressionSchema
      ),
    ],
    ([expression]) =>
      Effect.gen(function* () {
        const result = yield* run(expression, {});
        expect(typeof result).toBe("function");

        if (typeof result === "function") {
          const result2 = result();
          expect(Effect.isEffect(result2)).toBe(true);

          const result3 = yield* (
            result2 as Effect.Effect<unknown, ArgumentMismatchError>
          ).pipe(
            Effect.catchTag("ArgumentMismatchError", (e) => Effect.succeed(e))
          );
          expect(result3).toBeInstanceOf(ArgumentMismatchError);
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
  it.effect("should capture the scope(s) above it in the lambda", () =>
    Effect.gen(function* () {
      const expression = ["lambda", ["x"], [["lambda", [], "x"]]];
      const lambda = yield* run(expression, {});
      if (typeof lambda === "function") {
        const result = yield* lambda(1) as Effect.Effect<unknown>;
        expect(result).toBe(1);
      }
    })
  );
});

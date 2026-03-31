import { describe, expect, it } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";
import {
  ArgumentMismatchError,
  type InvalidFunctionCallError,
} from "@/errors/evaluation";
import { run } from "@/evaluation/evaluate";
import { LambdaFormSchema } from "@/schemas/evaluation";

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
    "should evaluate to a function, calling the function with incorrect arguments should produce an error",
    [LambdaFormSchema],
    ([expression]) =>
      Effect.gen(function* () {
        const result = yield* run(expression, {});
        expect(typeof result).toBe("function");

        if (typeof result === "function") {
          const improperArgs = Arr.fromIterable(expression[1]).concat("extra");
          const result2 = result(...improperArgs);
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
});

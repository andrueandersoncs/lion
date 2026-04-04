import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { run } from "@/evaluation/evaluate";
import { EvalFormSchema } from "@/schemas/evaluation";

describe("eval special form", () => {
  it.effect.prop(
    "an eval expression should evaluate to the same result as calling evaluate() on its argument",
    [EvalFormSchema],
    ([expression]) =>
      Effect.gen(function* () {
        const result = yield* run(expression, {}).pipe(
          Effect.catchTag("InvalidFunctionCallError", (e) => Effect.succeed(e))
        );
        const argResult = yield* run(expression[1], {}).pipe(
          Effect.catchTag("InvalidFunctionCallError", (e) => Effect.succeed(e))
        );
        expect(result).toEqual(argResult);
      })
  );
});

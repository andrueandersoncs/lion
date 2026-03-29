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
        const result = yield* run(expression, {});
        const argResult = yield* run(expression[1], {});
        expect(result).toEqual(argResult);
      })
  );
});

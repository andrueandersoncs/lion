import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { evaluate } from "@/evaluation/evaluate";
import { EvalFormSchema } from "@/schemas/evaluation";
import {
  LionEnvironmentService,
  makeEnvironmentRef,
} from "@/services/evaluation";

describe("eval special form", () => {
  it.effect.prop(
    "an eval expression should evaluate to the same result as calling evaluate() on its argument",
    [EvalFormSchema],
    ([expression]) =>
      Effect.gen(function* () {
        const result = yield* evaluate(expression);
        const argResult = yield* evaluate(expression[1]);
        expect(result).toEqual(argResult);
      }).pipe(
        Effect.provideServiceEffect(
          LionEnvironmentService,
          makeEnvironmentRef({})
        )
      )
  );
});

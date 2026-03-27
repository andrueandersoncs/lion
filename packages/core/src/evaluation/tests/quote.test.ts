import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { evaluate } from "@/evaluation/evaluate.ts";
import { QuoteFormSchema } from "@/schemas/evaluation";
import {
  LionEnvironmentService,
  makeEnvironmentRef,
} from "@/services/evaluation.ts";

describe("quote special form", () => {
  it.effect.prop(
    "should return the argument unevaluated",
    [QuoteFormSchema],
    ([expression]) =>
      Effect.gen(function* () {
        expect(yield* evaluate(expression)).toEqual(expression[1]);
      }).pipe(
        Effect.provideServiceEffect(
          LionEnvironmentService,
          makeEnvironmentRef({})
        )
      )
  );
});

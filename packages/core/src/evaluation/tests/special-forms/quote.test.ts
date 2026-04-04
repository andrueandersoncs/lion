import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { run } from "@/evaluation/evaluate.ts";
import { QuoteFormSchema } from "@/schemas/evaluation";

describe("quote special form", () => {
  it.effect.prop(
    "should return the argument unevaluated",
    [QuoteFormSchema],
    ([expression]) =>
      Effect.gen(function* () {
        expect(yield* run(expression, {})).toEqual(expression[1]);
      })
  );
});

import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { run } from "@/evaluation/evaluate";
import { LionArrayExpressionSchema } from "@/schemas/lion-expression";

describe("array evaluation", () => {
  it.effect.prop(
    "primitive array expressions should evaluate to themselves (autoquote)",
    [LionArrayExpressionSchema],
    ([expression]) =>
      Effect.gen(function* () {
        const result = yield* run(expression, {});
        expect(result).toEqual(expression);
      })
  );
});

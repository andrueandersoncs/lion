import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { run } from "@/evaluation/evaluate";
import { LionRecordExpressionSchema } from "@/schemas/lion-expression";

describe("evaluate", () => {
  it.effect.prop(
    "should evaluate record expressions by evaluating the values of the record",
    [LionRecordExpressionSchema],
    ([expression]) =>
      Effect.gen(function* () {
        const result = yield* run(expression, {});
        expect(result).toEqual(expression);
      })
  );
});

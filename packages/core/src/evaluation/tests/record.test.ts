import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { evaluate } from "@/evaluation/evaluate";
import { LionRecordExpressionSchema } from "@/schemas/lion-expression";
import {
  LionEnvironmentService,
  makeEnvironmentRef,
} from "@/services/evaluation";

describe("evaluate", () => {
  it.effect.prop(
    "should evaluate record expressions by evaluating the values of the record",
    [LionRecordExpressionSchema],
    ([expression]) =>
      Effect.gen(function* () {
        const result = yield* evaluate(expression);
        expect(result).toEqual(expression);
      }).pipe(
        Effect.provideServiceEffect(
          LionEnvironmentService,
          makeEnvironmentRef({})
        )
      )
  );
});

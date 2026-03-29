import { describe, expect, it } from "@effect/vitest";
import { Array as Arr, Effect, Option, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";
import { LionExpressionSchema } from "@/schemas/lion-expression";

const TestSchema = Schema.Array(LionExpressionSchema);

describe("begin special form", () => {
  it.effect.prop(
    "should evaluate the arguments in order and return the last result",
    [TestSchema],
    ([expressions]) =>
      Effect.gen(function* () {
        const result = yield* run(["begin", ...expressions], stdlib);
        const lastExpressionResult = yield* run(
          Arr.last(expressions).pipe(Option.getOrElse(() => [])),
          stdlib
        );
        expect(result).toEqual(lastExpressionResult);
      })
  );
});

import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";
import { DefineFormSchema } from "@/schemas/evaluation";

const TestSchema = DefineFormSchema;

describe("define special form", () => {
  it.effect.prop(
    "should define a variable in the environment",
    [TestSchema],
    ([expression]) =>
      Effect.gen(function* () {
        const result = yield* run(expression, stdlib);
        const value = yield* run(expression[2], stdlib);
        expect(result).toEqual(value);
      })
  );
});

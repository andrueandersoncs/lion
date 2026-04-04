import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { run } from "@/evaluation/evaluate";
import { ValidIdentifierSchema } from "@/schemas/evaluation";
import { JsonPrimitiveSchema } from "@/schemas/json-primitive";

describe("primitive evaluation", () => {
  it.effect.prop(
    "primitives should evaluate to themselves",
    [JsonPrimitiveSchema],
    ([expression]) =>
      Effect.gen(function* () {
        const result = yield* run(expression, {});
        expect(result).toEqual(expression);
      })
  );
  it.effect.prop(
    "string references should evaluate to the value of the reference",
    [ValidIdentifierSchema],
    ([expression]) =>
      Effect.gen(function* () {
        const result = yield* run(expression, { [expression]: "value" });
        expect(result).toEqual("value");
      })
  );
});

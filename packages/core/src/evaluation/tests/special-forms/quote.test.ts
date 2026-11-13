import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate.ts";
import { QuoteFormSchema } from "@/schemas/evaluation";

/** Whether a JSON value has a record with the key __proto__ anywhere in it. */
const hasProto = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  (Object.hasOwn(value, "__proto__") || Object.values(value).some(hasProto));

/**
 * Any JSON value, drawn independently of Lion's own schema, so its records
 * have every kind of key JSON allows, the empty key among them. Lion leaves
 * out only __proto__.
 */
const json = Arbitrary.filter(
  Arbitrary.schema(Schema.Json),
  (value) => !hasProto(value)
);

describe("quote special form", () => {
  it.effect.prop(
    "should return the argument unevaluated",
    [QuoteFormSchema],
    ([expression]) =>
      Effect.gen(function* () {
        expect(yield* run(expression, {})).toEqual(expression[1]);
      })
  );

  it.effect.prop(
    "gives back any JSON value as it was written",
    { value: json },
    ({ value }) =>
      Effect.gen(function* () {
        expect(yield* run(["quote", value], {})).toEqual(value);
      }),
    { arbitrary: { runs: 300 } }
  );
});

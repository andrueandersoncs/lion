import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import {
  isLogicVariableName,
  isNamespacedName,
  LogicVariable,
} from "@/logic/terms";
import { ValidIdentifierSchema } from "@/schemas/evaluation";
import { JsonPrimitiveSchema } from "@/schemas/json-primitive";

// Unbound `?name` strings evaluate to logic variables, and unbound
// `module/name` strings are names that nothing is bound to; every other
// primitive evaluates to itself.
const NonVariablePrimitiveSchema = JsonPrimitiveSchema.pipe(
  Schema.check(
    Schema.makeFilter(
      (value) =>
        typeof value !== "string" ||
        !(isLogicVariableName(value) || isNamespacedName(value))
    )
  )
);

const LogicVariableNameSchema = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[A-Za-z_][\w-]*$/))
);

describe("primitive evaluation", () => {
  it.effect.prop(
    "primitives should evaluate to themselves",
    [NonVariablePrimitiveSchema],
    ([expression]) =>
      Effect.gen(function* () {
        const result = yield* run(expression, {});
        expect(result).toEqual(expression);
      })
  );
  it.effect.prop(
    "unbound ?names should evaluate to logic variables",
    [LogicVariableNameSchema],
    ([name]) =>
      Effect.gen(function* () {
        const result = yield* run(`?${name}`, {});
        expect(result).toBeInstanceOf(LogicVariable);
        expect((result as LogicVariable).name).toBe(name);
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

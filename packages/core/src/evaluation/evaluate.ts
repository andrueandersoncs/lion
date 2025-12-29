import { Context, Effect, Match, Ref, Schema, pipe } from "effect";
import { type LionExpressionType } from "../schemas/lion-expression.ts";
import { evaluateArray } from "./base-forms/array.ts";
import { evaluateRecord } from "./base-forms/record.ts";
import { evaluatePrimitive } from "./base-forms/primitive.ts";
import type { ParseError } from "effect/ParseResult";
import { JsonPrimitiveSchema } from "../schemas/json-primitive.ts";
import { LionRecordExpressionSchema } from "../schemas/lion-expression.ts";
import { LionArrayExpressionSchema } from "../schemas/lion-expression.ts";

// IDEA:
// walk creates a stream of expressions to evaluate
// evaluate creates a stream of evaluated values

export type LionFunctionValueType = (...args: unknown[]) => EvaluateResult;

export const LionFunctionValueSchema = Schema.declare((input: unknown): input is LionFunctionValueType => {
  return typeof input === "function";
});

export class LionEnvironment extends Context.Tag("LionEnvironment")<
  LionEnvironment,
  Ref.Ref<Record<string, unknown>>
>() {}

export type EvaluateResult = Effect.Effect<unknown, ParseError, LionEnvironment>;

export const evaluate = (expression: LionExpressionType): EvaluateResult =>
  pipe(
    Match.value(expression),
    Match.when(Schema.is(LionArrayExpressionSchema), (_) => evaluateArray(_)),
    Match.when(Schema.is(LionRecordExpressionSchema), (_) => evaluateRecord(_)),
    Match.when(Schema.is(JsonPrimitiveSchema), (_) => evaluatePrimitive(_)),
    Match.exhaustive
  );

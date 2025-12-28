import { Context, Effect, Match, Ref, Schema, pipe, Data } from "effect";
import {
  LionArrayExpressionSchema,
  LionRecordExpressionSchema,
  type LionExpressionType,
} from "../schemas/lion-expression.ts";
import { JsonPrimitiveSchema } from "../schemas/json-primitive.ts";
import { evaluateArray } from "./base-forms/array.ts";
import { evaluateRecord } from "./base-forms/record.ts";
import { evaluatePrimitive } from "./base-forms/primitive.ts";

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

export class TooFewArgumentsError extends Data.TaggedError("TooFewArgumentsError")<{
  functionName: string;
  passedArgs: readonly unknown[];
  expectedArgs: string[];
}> {}

export class InvalidArgumentTypeError extends Data.TaggedError("InvalidArgumentTypeError")<{
  functionName: string;
  passedArgs: readonly unknown[];
  expectedArgs: string[];
}> {}

export type EvaluateResult = Effect.Effect<unknown, EvaluateError, LionEnvironment>;

export type EvaluateError = TooFewArgumentsError | InvalidArgumentTypeError;

export const evaluate = (expression: LionExpressionType): EvaluateResult =>
  pipe(
    Match.value(expression),
    Match.when(Schema.is(LionArrayExpressionSchema), (_) => evaluateArray(_)),
    Match.when(Schema.is(LionRecordExpressionSchema), (_) => evaluateRecord(_)),
    Match.when(Schema.is(JsonPrimitiveSchema), (_) => evaluatePrimitive(_)),
    Match.exhaustive
  );

import { Context, type Effect, Match, pipe, type Ref, Schema } from "effect";
import type { ParseError } from "effect/ParseResult";
import { OplogEntrySchema } from "../oplog/oplog.ts";
import { JsonPrimitiveSchema } from "../schemas/json-primitive.ts";
import {
  LionArrayExpressionSchema,
  type LionExpressionType,
  LionRecordExpressionSchema,
} from "../schemas/lion-expression.ts";
import { evaluateArray } from "./base-forms/array.ts";
import { evaluatePrimitive } from "./base-forms/primitive.ts";
import { evaluateRecord } from "./base-forms/record.ts";

export type LionFunctionValueType = (...args: unknown[]) => EvaluateResult;

export const LionFunctionValueSchema = Schema.declare(
  (input: unknown): input is LionFunctionValueType => {
    return typeof input === "function";
  }
);

export class LionEnvironmentService extends Context.Tag(
  "LionEnvironmentService"
)<LionEnvironmentService, Ref.Ref<Record<string, unknown>>>() {}

export type EvaluateResult = Effect.Effect<
  unknown,
  ParseError,
  LionEnvironmentService | LionOplogService
>;

// evaluation paused
export class EvaluationPaused extends Schema.TaggedClass<EvaluationPaused>(
  "EvaluationPaused"
)("EvaluationPaused", {
  oplog: Schema.Array(OplogEntrySchema),
}) {}

// evaluation completed
export class EvaluationCompleted extends Schema.TaggedClass<EvaluationCompleted>(
  "EvaluationCompleted"
)("EvaluationCompleted", { result: Schema.Unknown }) {}

export class LionOplogService extends Context.Tag("LionOplogService")<
  LionOplogService,
  Ref.Ref<Array<typeof OplogEntrySchema.Type>>
>() {}

export const evaluate = (expression: LionExpressionType): EvaluateResult =>
  pipe(
    Match.value(expression),
    Match.when(Schema.is(LionArrayExpressionSchema), (_) => evaluateArray(_)),
    Match.when(Schema.is(LionRecordExpressionSchema), (_) => evaluateRecord(_)),
    Match.when(Schema.is(JsonPrimitiveSchema), (_) => evaluatePrimitive(_)),
    Match.exhaustive
  );

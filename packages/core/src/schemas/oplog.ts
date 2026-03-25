import { Schema } from "effect";
import { FunctionCallFormSchema } from "@/schemas/evaluation";

// started
export class OperationStartedSchema extends Schema.TaggedClass<OperationStartedSchema>(
  "OperationStartedSchema"
)("OperationStartedSchema", {
  expression: FunctionCallFormSchema,
}) {}

// completed
export class OperationCompletedSchema extends Schema.TaggedClass<OperationCompletedSchema>(
  "OperationCompletedSchema"
)("OperationCompletedSchema", {
  expression: FunctionCallFormSchema,
  result: Schema.Unknown,
}) {}

export const OplogEntrySchema = Schema.Union(
  OperationStartedSchema,
  OperationCompletedSchema
);

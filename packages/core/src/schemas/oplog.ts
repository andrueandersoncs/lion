import { Schema } from "effect";

// started
export class OperationStartedSchema extends Schema.TaggedClass<OperationStartedSchema>(
  "OperationStartedSchema"
)("OperationStartedSchema", {
  operation: Schema.String,
  arguments: Schema.Array(Schema.Unknown),
}) {}

// completed
export class OperationCompletedSchema extends Schema.TaggedClass<OperationCompletedSchema>(
  "OperationCompletedSchema"
)("OperationCompletedSchema", {
  operation: Schema.String,
  result: Schema.Unknown,
}) {}

export const OplogEntrySchema = Schema.Union(
  OperationStartedSchema,
  OperationCompletedSchema
);

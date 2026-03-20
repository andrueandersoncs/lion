import { Schema } from "effect";
import { FunctionCallFormSchema } from "@/schemas/evaluation";
import { OplogEntrySchema } from "@/schemas/oplog";

export class ContinuationNeededError extends Schema.TaggedError<ContinuationNeededError>(
  "ContinuationNeededError"
)("ContinuationNeededError", {
  oplog: Schema.Array(OplogEntrySchema),
}) {}

export class OplogMismatchError extends Schema.TaggedError<OplogMismatchError>(
  "OplogMismatchError"
)("OplogMismatchError", {
  oplog: Schema.Array(OplogEntrySchema),
  evaluatedOperation: FunctionCallFormSchema,
  storedOperation: Schema.String,
}) {}

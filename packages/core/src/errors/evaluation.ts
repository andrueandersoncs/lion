import { Schema } from "effect";
import { FunctionCallFormSchema } from "@/schemas/evaluation";

export class ContinuationNeededError extends Schema.TaggedError<ContinuationNeededError>(
  "ContinuationNeededError"
)("ContinuationNeededError", {}) {}

export class OplogMismatchError extends Schema.TaggedError<OplogMismatchError>(
  "OplogMismatchError"
)("OplogMismatchError", {
  evaluatedExpression: FunctionCallFormSchema,
  storedExpression: FunctionCallFormSchema,
}) {}

import { Schema } from "effect";

export class ArgumentMismatchError extends Schema.TaggedError<ArgumentMismatchError>(
  "ArgumentMismatchError"
)("ArgumentMismatchError", {}) {}

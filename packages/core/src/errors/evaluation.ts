import { Schema } from "effect";
import { LionExpressionSchema } from "@/schemas/lion-expression";

export class ArgumentMismatchError extends Schema.TaggedError<ArgumentMismatchError>(
  "ArgumentMismatchError"
)("ArgumentMismatchError", {}) {}

export class InvalidFunctionCallError extends Schema.TaggedError<InvalidFunctionCallError>(
  "InvalidFunctionCallError"
)("InvalidFunctionCallError", { expression: LionExpressionSchema }) {}

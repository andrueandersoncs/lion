import { Schema } from "effect";
import { LionExpressionSchema } from "@/schemas/lion-expression";

export class ArgumentMismatchError extends Schema.TaggedError<ArgumentMismatchError>()(
  "ArgumentMismatchError",
  {}
) {}

export class InvalidFunctionCallError extends Schema.TaggedError<InvalidFunctionCallError>()(
  "InvalidFunctionCallError",
  { expression: LionExpressionSchema }
) {}

/** Raised by relations, rules, facts, and queries. */
export class LogicError extends Schema.TaggedError<LogicError>()("LogicError", {
  message: Schema.String,
}) {}

/**
 * Raised when arithmetic has no finite result, such as division by zero.
 * Lion's numbers are JSON numbers, which cannot be Infinity or NaN.
 */
export class ArithmeticError extends Schema.TaggedError<ArithmeticError>()(
  "ArithmeticError",
  { message: Schema.String }
) {}

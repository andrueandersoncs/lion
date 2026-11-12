import { Effect, Schema } from "effect";
import { show } from "@/logic/terms";
import { LionExpressionSchema } from "@/schemas/lion-expression";

export class ArgumentMismatchError extends Schema.TaggedError<ArgumentMismatchError>()(
  "ArgumentMismatchError",
  {}
) {
  override get message() {
    return "A lambda was called with fewer arguments than it has parameters.";
  }
}

export class InvalidFunctionCallError extends Schema.TaggedError<InvalidFunctionCallError>()(
  "InvalidFunctionCallError",
  { expression: LionExpressionSchema }
) {
  override get message() {
    return `${JSON.stringify(this.expression)} is not a call: its first element must be a special form or evaluate to a function.`;
  }
}

/** Raised by relations, rules, facts, and queries. */
export class LogicError extends Schema.TaggedError<LogicError>()("LogicError", {
  message: Schema.String,
}) {}

export const logicError = (message: string) =>
  Effect.fail(new LogicError({ message }));

/**
 * Raised when arithmetic has no finite result, such as division by zero.
 * Lion's numbers are JSON numbers, which cannot be Infinity or NaN.
 */
export class ArithmeticError extends Schema.TaggedError<ArithmeticError>()(
  "ArithmeticError",
  { message: Schema.String }
) {}

/**
 * Raised inside a function that needs a value it cannot have yet: a value
 * that waits for a logic variable, or the answer to a question while a rule
 * is being written. The call the function is part of then waits instead.
 */
export class WaitingError extends Schema.TaggedError<WaitingError>()(
  "WaitingError",
  { value: Schema.Unknown }
) {
  override get message() {
    return `${show(this.value)} has no value yet: it waits for a logic variable, or for the rule it is part of to run.`;
  }
}

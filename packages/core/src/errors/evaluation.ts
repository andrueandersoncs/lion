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

/**
 * Raised when a string of the form `module/name` is evaluated, nothing is
 * bound to it, and it reads as a misspelled name: other names of its module
 * are bound, or a bound name is a letter or two away. It is then not taken
 * for data, since a misspelled function would quietly become a string.
 */
export class UnboundNameError extends Schema.TaggedError<UnboundNameError>()(
  "UnboundNameError",
  {
    nearest: Schema.NullOr(Schema.String),
    unbound: Schema.String,
    /** Why a name was needed, when it is not that it reads as misspelled. */
    why: Schema.optional(Schema.String),
  }
) {
  override get message() {
    if (this.why !== undefined) {
      return `Nothing is bound to "${this.unbound}". ${this.why}`;
    }
    const module = this.unbound.slice(0, this.unbound.indexOf("/") + 1);
    const why =
      this.nearest === null
        ? `Other names begin with "${module}", so it reads as a misspelled name.`
        : `Did you mean "${this.nearest}"?`;
    return `Nothing is bound to "${this.unbound}". ${why} ${asString(this.unbound)}`;
  }
}

/** The error of a `set!` whose name no scope around it declares. */
export const unboundSet = (name: string) =>
  new UnboundNameError({
    nearest: null,
    unbound: name,
    why: "set! changes a binding, and no scope around it binds the name. Bind it with define first.",
  });

/**
 * Raised when a name is read before the `define` that binds it has run. The
 * scope declares the name from its start, so the string means the
 * definition, which has no value yet.
 */
export class UndefinedYetError extends Schema.TaggedError<UndefinedYetError>()(
  "UndefinedYetError",
  { unassigned: Schema.String }
) {
  override get message() {
    return `"${this.unassigned}" is read before it is defined. A define binds its name from the start of the body it is in, and a relation or schema form from the start of the program, so the string means that definition, which has no value yet. Define it first, or write ["quote", "${this.unassigned}"] to mean the string.`;
  }
}

/**
 * Raised when an array starts with a special form's name but does not have
 * the form's shape.
 */
export class MalformedFormError extends Schema.TaggedError<MalformedFormError>()(
  "MalformedFormError",
  {
    expression: LionExpressionSchema,
    form: Schema.String,
    usage: Schema.String,
  }
) {
  override get message() {
    return `${JSON.stringify(this.expression)} is not a well-formed ${this.form} form: ${this.usage}`;
  }
}

/**
 * How to write a string that is a name, so that it stays a string: said
 * wherever a name was met and the string may have been meant.
 */
export const asString = (name: string) =>
  `To mean the string itself, write ["quote", "${name}"].`;

/**
 * Raised when a program breaks a rule of Lion: by relations, rules, facts,
 * and queries, and by a call that gives a function the wrong number of
 * arguments.
 */
export class LogicError extends Schema.TaggedError<LogicError>()("LogicError", {
  message: Schema.String,
}) {}

export const logicError = (message: string) =>
  Effect.fail(new LogicError({ message }));

/** How many arguments a function takes: a number, or the fewest and most. */
export type Count = number | readonly [least: number, most: number];

/** That many arguments or more. */
export const atLeast = (least: number): Count => [
  least,
  Number.POSITIVE_INFINITY,
];

const plural = (count: number) => `${count} argument${count === 1 ? "" : "s"}`;

/**
 * A function that takes a set number of arguments. A call with any other
 * number fails and says how many the function takes, so no argument is
 * dropped and none is missing. `what` says what the arguments are, as a
 * relation's columns do.
 */
export const takes = <A extends unknown[], B, E, R>(
  count: Count,
  fn: (...args: A) => Effect.Effect<B, E, R>,
  what?: string
) => {
  const [least, most] = typeof count === "number" ? [count, count] : count;
  let many = `${least} to ${plural(most)}`;
  if (most === least) {
    many = plural(least);
  } else if (most === Number.POSITIVE_INFINITY) {
    many = `${least} or more arguments`;
  }
  const self = (...args: A): Effect.Effect<B, E | LogicError, R> =>
    args.length < least || args.length > most
      ? logicError(
          `${show(self)} takes ${many}${what ? ` (${what})` : ""} but got ${args.length}.`
        )
      : fn(...args);
  return self;
};

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

import { Effect, Schema } from "effect";
import { sameValue, show } from "@/logic/terms";
import { isSpecialFormName } from "@/schemas/evaluation";
import { ExactExpressionSchema } from "@/schemas/lion-expression";

export class InvalidFunctionCallError extends Schema.TaggedError<InvalidFunctionCallError>()(
  "InvalidFunctionCallError",
  { expression: ExactExpressionSchema }
) {
  override get message() {
    return `${show(this.expression)} is not a call: its first element must be a special form or evaluate to a function.`;
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
    const module = this.unbound.slice(0, this.unbound.indexOf("/") + 1);
    const misspelled =
      this.nearest === null
        ? `Other names begin with "${module}", so it reads as a misspelled name.`
        : `Did you mean "${this.nearest}"?`;
    const why = this.why ?? `${misspelled} ${asString(this.unbound)}`;
    return `Nothing is bound to "${this.unbound}". ${why}`;
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
    const name = this.unassigned;
    if (isSpecialFormName(name)) {
      return `"${name}" is read before it is defined. The body it is in defines "${name}", which binds it from the start of the body, so there an array that starts with "${name}" calls that definition, which has no value yet, instead of being the ${name} form. As in R7RS Scheme, a body cannot define the name of a form and use the form: give the definition another name.`;
    }
    return `"${name}" is read before it is defined. A define binds its name from the start of the body it is in, and a relation or schema form from the start of the program, so the string means that definition, which has no value yet. Define it first, or write ["quote", "${name}"] to mean the string.`;
  }
}

/**
 * Raised when an array starts with a special form's name but does not have
 * the form's shape.
 */
export class MalformedFormError extends Schema.TaggedError<MalformedFormError>()(
  "MalformedFormError",
  {
    expression: ExactExpressionSchema,
    form: Schema.String,
    usage: Schema.String,
  }
) {
  override get message() {
    return `${show(this.expression)} is not a well-formed ${this.form} form: ${this.usage}`;
  }
}

/**
 * What an expression gave, beside the expression when they differ: a
 * message says "found 0" of a value written as it is, and names the
 * expression that gave it otherwise.
 */
const butFound = (expression: unknown, value: unknown, shown = show(value)) =>
  sameValue(expression, value)
    ? `found ${shown}`
    : `${show(expression)} is ${shown}`;

/**
 * What a condition that is not true or false is told, wherever a condition
 * stands: a case of `cond`, a filter in a rule or query, and a condition the
 * solver reasons over. `shown` says what the value is when it is not one.
 */
export const notTruth = (condition: unknown, value: unknown, shown?: string) =>
  `A condition must be true or false, but ${butFound(condition, value, shown)}.`;

/** What `in` is told of a list that is not one, in plain code and in a rule. */
export const notList = (list: unknown, value: unknown) =>
  `"in" expects a list, but ${butFound(list, value)}.`;

/**
 * What a call of a value that is not a function is told: by a call, by a
 * case of `match`, and by a call that waited for its function, which it
 * names.
 */
export const notAFunction = (fn: unknown, call?: unknown) =>
  `${show(fn)} is not a function, so it cannot be called${call === undefined ? "" : ` in ${show(call)}`}.`;

/**
 * What a find, a rule, or a query that gave something other than data is
 * told: the logic database holds only data, so each says it the same way.
 */
export const producedNonData = (what: string, value: unknown) =>
  `${what} produced a value that is not data: ${show(value)}.`;

/**
 * What a fact or a rule for a relation a graph algorithm computes is told:
 * its rows come from its inputs alone.
 */
export const computedAddedTo = (call: string, what: string) =>
  `${call} is computed from its inputs, so ${what} cannot add to it.`;

/**
 * What a rule that invents values for a relation that aggregates is told,
 * whether the rule itself aggregates or another rule for the relation does.
 */
export const inventsIntoAggregate = (rule: string, relation: string) =>
  `${rule} invents a value for "${relation}", whose rules aggregate. A rule that invents values cannot give a row of a relation that aggregates.`;

/**
 * What `exists` in a rule head and `some` in a goal say of an expression
 * that computes with an unknown they own.
 */
export const computesWithUnknown = (what: string, form: "exists" | "some") =>
  `${what} computes with a variable that "${form}" owns. An unknown can stand as an argument, or inside a record or list, but nothing can compute with it.`;

/**
 * What a graph algorithm given the wrong kind of value for one of its
 * columns is told, as it is called and as its relation is asked.
 */
export const expectsFor = (
  who: unknown,
  kind: string,
  column: unknown,
  value: unknown
) => `${who} expects a ${kind} for "${column}", but found ${show(value)}.`;

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

/** How many arguments each function takes, the fewest and the most. */
const COUNTS = new WeakMap<object, readonly [least: number, most: number]>();

/** What a function's arguments are, when declared with `takes`. */
const WHATS = new WeakMap<object, string>();

/** Records how many arguments a function takes. */
export const counted = <F extends object>(fn: F, count: Count): F => {
  COUNTS.set(fn, typeof count === "number" ? [count, count] : count);
  return fn;
};

/** How many arguments a function takes, when it says. */
export const countOf = (fn: unknown) =>
  typeof fn === "function" ? COUNTS.get(fn) : undefined;

/** What a function's arguments are, when `takes` named them. */
export const whatOf = (fn: unknown) =>
  typeof fn === "function" ? WHATS.get(fn) : undefined;

/** The failure of a call that gives `who` a number of arguments it does not take. */
export const wrongCount = (
  who: string,
  [least, most]: readonly [number, number],
  got: number,
  what?: string
) => {
  let many = `${least} to ${plural(most)}`;
  if (most === least) {
    many = plural(least);
  } else if (most === Number.POSITIVE_INFINITY) {
    many = `${least} or more arguments`;
  }
  return new LogicError({
    message: `${who} takes ${many}${what ? ` (${what})` : ""} but got ${got}.`,
  });
};

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
  const range: readonly [number, number] =
    typeof count === "number" ? [count, count] : count;
  const [least, most] = range;
  const self = (...args: A): Effect.Effect<B, E | LogicError, R> =>
    args.length < least || args.length > most
      ? Effect.fail(wrongCount(show(self), range, args.length, what))
      : fn(...args);
  if (what !== undefined) {
    WHATS.set(self, what);
  }
  return counted(self, range);
};

/**
 * The failure of a call that gives a function an argument it does not
 * take, in the form of the message for the wrong number of arguments: which
 * argument, what the function takes there, and what it got.
 */
export const wrongArgument = (
  fn: unknown,
  at: number,
  expected: string,
  got: unknown
) =>
  new LogicError({
    message: `${show(fn)} takes ${expected} as argument ${at + 1} but got ${show(got)}.`,
  });

/** Failures that steer evaluation, which pass out of a call as they are. */
const STEERING = new WeakSet<object>();

/** Marks a failure that steers evaluation, so no call adds to it. */
export const steers = <A extends object>(error: A) => {
  STEERING.add(error);
  return error;
};

/** The message a failure had before calls added the functions it left. */
const TRAILS = new WeakMap<
  object,
  { readonly message: string; readonly names: readonly string[] }
>();

/** The value each failure `func/raise` made was raised with. */
const RAISED = new WeakMap<object, unknown>();

/**
 * The failure `func/raise` makes: its message is the value, a string as it
 * is and any other value as JSON, and `func/catch` gives back the value.
 */
export const raised = (value: unknown) => {
  const error = new LogicError({
    message: typeof value === "string" ? value : show(value),
  });
  RAISED.set(error, value);
  return error;
};

/**
 * Whether a failure is one a program can catch: a failure Lion or a program
 * raised, not a call that waits for a value or another failure that steers
 * evaluation, and not a defect.
 */
export const isCatchable = (error: unknown): error is Error =>
  error instanceof Error &&
  !(error instanceof WaitingError) &&
  !STEERING.has(error);

/**
 * A failure as data, as `func/catch` gives it to its handler: its kind, its
 * message as it was raised, and, for one `func/raise` made, the value.
 */
export const failureRecord = (error: Error) =>
  RAISED.has(error)
    ? { failure: "raised", message: raisedAs(error), value: RAISED.get(error) }
    : {
        failure: (error as { readonly _tag?: string })._tag ?? error.name,
        message: raisedAs(error),
      };

/** A failure's message as it was raised, before any call added to it. */
export const raisedAs = (error: Error) =>
  TRAILS.get(error)?.message ?? error.message;

/**
 * The failure as it leaves the body of the function named `name`: the same
 * kind of failure, whose message ends with the named functions it has left,
 * innermost first, as `(in "next", called from "label")`. A failure that
 * steers evaluation, such as a call that waits, passes as it is.
 */
export const leaving = <E>(error: E, name: string): E => {
  if (
    !(error instanceof Error) ||
    error instanceof WaitingError ||
    STEERING.has(error)
  ) {
    return error;
  }
  const known = TRAILS.get(error);
  const message = known?.message ?? error.message;
  const names = [...(known?.names ?? []), name];
  const copy = Object.create(
    Object.getPrototypeOf(error),
    Object.getOwnPropertyDescriptors(error)
  ) as E & Error;
  Object.defineProperty(copy, "message", {
    configurable: true,
    value: `${message} (in ${names.map((each) => JSON.stringify(each)).join(", called from ")})`,
    writable: true,
  });
  TRAILS.set(copy, { message, names });
  if (RAISED.has(error)) {
    RAISED.set(copy, RAISED.get(error));
  }
  return copy;
};

/**
 * Raised when a record does not have a key a function needs: `object/get`
 * given no value to use instead, or a key `object/get-path` follows.
 */
export class KeyNotFoundError extends Schema.TaggedError<KeyNotFoundError>()(
  "KeyNotFoundError",
  { key: Schema.String, record: Schema.optional(Schema.Unknown) }
) {
  override get message() {
    const where = this.record === undefined ? "" : ` in ${show(this.record)}`;
    return `There is no key "${this.key}"${where}.`;
  }
}

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

/**
 * Raised when a sandboxed evaluation exceeds a configured resource limit
 * (`maxSteps`, `maxDurationMs`, or `maxFacts`). Marked uncatchable via `steers`.
 */
export class ResourceLimitError extends Schema.TaggedError<ResourceLimitError>()(
  "ResourceLimitError",
  {
    actual: Schema.Number,
    limit: Schema.Literals(["steps", "duration", "facts"]),
    limitValue: Schema.Number,
    message: Schema.String,
  }
) {}

/**
 * Raised when a sandboxed evaluation attempts a database mutation forbidden by
 * its `DatabasePermissions`. Marked uncatchable via `steers`.
 */
export class PermissionError extends Schema.TaggedError<PermissionError>()(
  "PermissionError",
  {
    action: Schema.String,
    message: Schema.String,
    target: Schema.optional(Schema.String),
  }
) {}

/**
 * Raised when an optimistic-concurrency transaction targets a stale database
 * revision.
 */
export class ConflictError extends Schema.TaggedError<ConflictError>()(
  "ConflictError",
  {
    actual: Schema.Number,
    expected: Schema.Number,
    message: Schema.String,
  }
) {}

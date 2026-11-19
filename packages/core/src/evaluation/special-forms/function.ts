import { Effect } from "effect";
import {
  InvalidFunctionCallError,
  logicError,
  WaitingError,
} from "@/errors/evaluation";
import { answer, isWriting } from "@/evaluation/asking";
import {
  andThen,
  type Compiled,
  Pending,
  returned,
  runAll,
  toEffect,
} from "@/evaluation/compiled";
import type { Environment, Scope } from "@/evaluation/environment";
import { compileAll } from "@/evaluation/evaluate.ts";
import {
  enter,
  lambdaOf,
  suspendArguments,
} from "@/evaluation/special-forms/lambda";
import { mentioned } from "@/logic/strata";
import {
  DeferredCall,
  isData,
  isForm,
  isLogicFunction,
  isQuestion,
  isWaiting,
  isWaitingForm,
  type LionFunction,
  LogicValue,
  lambdaInfo,
  relationOf,
  show,
  termVariables,
} from "@/logic/terms";
import type { FunctionCallFormSchema } from "@/schemas/evaluation";
import type { EvaluateResult, EvaluationError } from "@/types/evaluation";

/** An argument that may keep a function from running right away. */
const isSpecial = (arg: unknown) =>
  typeof arg === "function" || arg instanceof LogicValue;

/** True for an argument a goal can hold as it is: a logic value, or data. */
const isHeld = (arg: unknown) => arg instanceof LogicValue || isData(arg);

/** True for an argument that mentions a logic variable or a relation. */
const isLive = (arg: unknown) =>
  termVariables(arg).length > 0 || mentioned(arg).length > 0;

/**
 * True for an argument that asks a question before it has a value: a find,
 * a `cond`, `match`, or record that waits, or a call on one of those or on
 * a goal.
 */
const asks = (arg: unknown): boolean =>
  isForm(arg, "find") ||
  (arg instanceof DeferredCall &&
    (isWaitingForm(arg) ||
      arg.parts.some((part) => isQuestion(part) || asks(part))));

/**
 * The call that runs later. It holds the function as well as its arguments
 * closed: a function that another one built can hold lambdas too.
 */
const later = ([closed, ...rest]: readonly unknown[], callee: unknown) =>
  new DeferredCall(closed, callee, rest);

/** A call that waits, with the function and its arguments closed. */
const waiting = (fn: unknown, args: readonly unknown[], callee: unknown) =>
  Effect.map(suspendArguments([fn, ...args]), (closed) =>
    later(closed, callee)
  );

/**
 * Runs a function on its arguments: a compiled Lion function in direct
 * style when compiled code calls it from `depth`, and any other as itself.
 */
const ran = (
  fn: unknown,
  args: readonly unknown[],
  environment: Environment | undefined,
  depth?: number
) => {
  const lambda = depth === undefined ? undefined : lambdaOf(fn);
  return lambda === undefined
    ? returned((fn as LionFunction)(...args), environment)
    : enter(lambda, args, depth as number);
};

/**
 * Calls a function with arguments that are already evaluated.
 *
 * Relations, aggregates, algorithms, and lambdas take every argument as it
 * is, so a lambda's body runs right away and can build goals. One kind of
 * argument is the exception for a lambda: an argument that asks a question
 * has to be answered first, as it is in plain code, so that call waits.
 *
 * Any other function needs values, so the call waits, and becomes a term
 * that runs later, when
 * - an argument waits for a logic variable,
 * - a rule, query, or find is being written, since what it holds runs when
 *   it does, or
 * - the function calls back into Lion and gets a value that is not known yet.
 *
 * Otherwise the questions among the arguments are asked, and the function
 * runs on their answers.
 *
 * Compiled code calls with the scope it runs in and how deep it is, and a
 * Lion function's body then runs in direct style. Host code calls without
 * them, and gets a Lion function's body as an Effect that runs it.
 */
export const applyIn = (
  fn: unknown,
  args: readonly unknown[],
  callee: unknown,
  environment: Environment | undefined,
  depth: number | undefined
): unknown => {
  if (typeof fn !== "function") {
    return new Pending(
      isWaiting(fn)
        ? waiting(fn, args, callee)
        : logicError(`${show(fn)} is not a function, so it cannot be called.`)
    );
  }
  if (isLogicFunction(fn)) {
    // The lambda waits with its arguments, closed over what it names now.
    if (args.some(asks) && lambdaInfo(fn) !== undefined) {
      return new Pending(waiting(fn, args, callee));
    }
    // An argument of a relation call that is not data is a schema for its
    // column. The goal holds it closed, like the arguments of any call that
    // waits, so a variable it was made from is one the goal waits for.
    return relationOf(fn) === undefined || args.every(isHeld)
      ? ran(fn, args, environment, depth)
      : new Pending(
          Effect.flatMap(suspendArguments(args), (closed) =>
            toEffect(ran(fn, closed, environment))
          )
        );
  }
  // What a rule holds runs when the rule runs. A call on known values is
  // computed ahead of time when that works, which changes only when a side
  // effect happens: a call that fails waits to fail when the rule runs.
  if (!args.some(isSpecial)) {
    const result = ran(fn, args, environment);
    return result instanceof Pending
      ? new Pending(
          Effect.catch(result.effect, (error) =>
            Effect.flatMap(isWriting, (writing) =>
              writing ? waiting(fn, args, callee) : Effect.fail(error)
            )
          )
        )
      : result;
  }
  if (args.some(isWaiting)) {
    return new Pending(waiting(fn, args, callee));
  }
  const wait = () => waiting(fn, args, callee);
  return new Pending(
    Effect.gen(function* () {
      if (!(yield* isWriting)) {
        const values = yield* Effect.forEach(args, answer);
        return yield* toEffect(ran(fn, values, environment)).pipe(
          Effect.catchTag("WaitingError", wait)
        );
      }
      const closed = yield* suspendArguments([fn, ...args]);
      return closed.slice(1).some(isLive)
        ? later(closed, callee)
        : yield* toEffect(ran(fn, args, environment)).pipe(Effect.catch(wait));
    })
  );
};

/**
 * Calls a function with arguments that are already evaluated, as host code
 * does: see `applyIn`.
 */
export const apply = (
  fn: unknown,
  args: readonly unknown[],
  callee?: unknown
): EvaluateResult => toEffect(applyIn(fn, args, callee, undefined, undefined));

/**
 * The value of what a Lion function returned to host code. A question is
 * asked. A value that is not known yet fails with a WaitingError, and the
 * call the host function is part of waits instead.
 */
const known = (value: unknown): EvaluateResult => {
  if (!(value instanceof LogicValue)) {
    return Effect.succeed(value);
  }
  return isQuestion(value)
    ? answer(value)
    : Effect.fail(new WaitingError({ value }));
};

/**
 * Calls a Lion function from host code, and gives its value. What the
 * function needs to run is the caller's to provide.
 */
export const call = (fn: unknown, ...args: readonly unknown[]) =>
  Effect.flatMap(apply(fn, args), known) as Effect.Effect<
    unknown,
    EvaluationError
  >;

/** Evaluates the function and its arguments, then calls it. */
export const compileFunctionCall = (
  expression: typeof FunctionCallFormSchema.Type,
  scope: Scope | undefined
): Compiled => {
  const [head, ...rest] = compileAll(expression, scope) as [
    Compiled,
    ...Compiled[],
  ];
  const callee = expression[0];
  const callWith = (
    fn: unknown,
    args: unknown,
    environment: Environment,
    depth: number
  ) =>
    typeof fn === "function" || isWaiting(fn)
      ? applyIn(fn, args as readonly unknown[], callee, environment, depth)
      : new Pending(Effect.fail(new InvalidFunctionCallError({ expression })));
  return (environment, depth) => {
    const fn = head(environment, depth);
    if (fn instanceof Pending) {
      return andThen(fn, depth, (made, now) =>
        andThen(runAll(rest, environment, now), now, (args, at) =>
          callWith(made, args, environment, at)
        )
      );
    }
    const args = runAll(rest, environment, depth);
    return args instanceof Pending
      ? andThen(args, depth, (made, now) =>
          callWith(fn, made, environment, now)
        )
      : callWith(fn, args, environment, depth);
  };
};

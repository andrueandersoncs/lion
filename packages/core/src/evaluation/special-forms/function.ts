import { Effect } from "effect";
import {
  InvalidFunctionCallError,
  logicError,
  WaitingError,
} from "@/errors/evaluation";
import { answer, isWriting } from "@/evaluation/asking";
import { evaluate } from "@/evaluation/evaluate.ts";
import { suspendArguments } from "@/evaluation/special-forms/lambda";
import { mentioned } from "@/logic/strata";
import {
  DeferredCall,
  invoke,
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
 */
export const apply = (
  fn: unknown,
  args: readonly unknown[],
  callee?: unknown
): EvaluateResult => {
  // The call that runs later holds the function as well as its arguments
  // closed: a function that another one built can hold lambdas too.
  const later = ([closed, ...rest]: readonly unknown[]) =>
    new DeferredCall(closed, callee, rest);
  const wait = () => Effect.map(suspendArguments([fn, ...args]), later);
  if (typeof fn !== "function") {
    return isWaiting(fn)
      ? wait()
      : logicError(`${show(fn)} is not a function, so it cannot be called.`);
  }
  const run = (values: readonly unknown[]) =>
    invoke(fn as LionFunction, values) as EvaluateResult;
  if (isLogicFunction(fn)) {
    // The lambda waits with its arguments, closed over what it names now.
    if (args.some(asks) && lambdaInfo(fn) !== undefined) {
      return wait();
    }
    // An argument of a relation call that is not data is a schema for its
    // column. The goal holds it closed, like the arguments of any call that
    // waits, so a variable it was made from is one the goal waits for.
    return args.every(isHeld) || relationOf(fn) === undefined
      ? run(args)
      : Effect.flatMap(suspendArguments(args), run);
  }
  // What a rule holds runs when the rule runs. A call on known values is
  // computed ahead of time when that works, which changes only when a side
  // effect happens: a call that fails waits to fail when the rule runs.
  const unlessWriting = (error: EvaluationError) =>
    Effect.flatMap(isWriting, (writing) =>
      writing ? wait() : Effect.fail(error)
    );
  if (!args.some(isSpecial)) {
    return run(args).pipe(Effect.catch(unlessWriting));
  }
  if (args.some(isWaiting)) {
    return wait();
  }
  return Effect.gen(function* () {
    if (!(yield* isWriting)) {
      const values = yield* Effect.forEach(args, answer);
      return yield* run(values).pipe(Effect.catchTag("WaitingError", wait));
    }
    const closed = yield* suspendArguments([fn, ...args]);
    return closed.slice(1).some(isLive)
      ? later(closed)
      : yield* run(args).pipe(Effect.catch(wait));
  });
};

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
export const evaluateFunctionCall = (
  expression: typeof FunctionCallFormSchema.Type
) =>
  Effect.gen(function* () {
    const [head, ...tail] = yield* Effect.all(expression.map(evaluate));
    if (!(typeof head === "function" || isWaiting(head))) {
      return yield* new InvalidFunctionCallError({ expression });
    }
    return yield* apply(head, tail, expression[0]);
  });

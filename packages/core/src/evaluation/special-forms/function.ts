import { Effect } from "effect";
import { InvalidFunctionCallError } from "@/errors/evaluation";
import { isSymbolic } from "@/evaluation/environment";
import { evaluate } from "@/evaluation/evaluate.ts";
import { suspendArguments } from "@/evaluation/special-forms/lambda";
import {
  call,
  DeferredCall,
  isLogicFunction,
  isWaiting,
  type LionFunction,
  termVariables,
} from "@/logic/terms";
import type { FunctionCallFormSchema } from "@/schemas/evaluation";
import type { EvaluateResult } from "@/types/evaluation";

/**
 * The arguments a call waits with, or undefined when it can run now. A call
 * waits when an argument is a logic term, or a lambda that mentions a logic
 * variable.
 */
const waitingArguments = (args: readonly unknown[]) =>
  Effect.gen(function* () {
    const waits = args.some(isWaiting);
    if (!(waits || args.some(isSymbolic))) {
      return;
    }
    const closed = yield* suspendArguments(args);
    return waits || closed.some((arg) => termVariables(arg).length > 0)
      ? closed
      : undefined;
  });

/**
 * Calls a function with its evaluated arguments. A call that needs the value
 * of a logic variable waits instead: it becomes a term that runs once the
 * variable is bound. Relations, aggregates, algorithms, and lambdas take
 * logic variables as they are, so they always run.
 */
export const evaluateFunctionCall = (
  expression: typeof FunctionCallFormSchema.Type
) =>
  Effect.gen(function* () {
    const [head, ...tail] = yield* Effect.all(expression.map(evaluate));
    if (isWaiting(head)) {
      return new DeferredCall(
        head,
        expression[0],
        yield* suspendArguments(tail)
      );
    }
    if (typeof head !== "function") {
      return yield* new InvalidFunctionCallError({ expression });
    }
    const waiting = isLogicFunction(head)
      ? undefined
      : yield* waitingArguments(tail);
    if (waiting !== undefined) {
      return new DeferredCall(head, expression[0], waiting);
    }
    return yield* call(head as LionFunction, ...tail) as EvaluateResult;
  });

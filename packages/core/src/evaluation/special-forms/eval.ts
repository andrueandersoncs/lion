import { Effect } from "effect";
import { answer, isWriting } from "@/evaluation/asking";
import {
  andThen,
  type Compiled,
  Pending,
  returned,
  toEffect,
} from "@/evaluation/compiled";
import {
  asWritten,
  bodyOf,
  type Environment,
  predeclare,
  type Scope,
  topOf,
} from "@/evaluation/environment";
import { compile } from "@/evaluation/evaluate.ts";
import { declaredIn, definedIn } from "@/evaluation/hoisting";
import {
  DeferredCall,
  isWaiting,
  LogicValue,
  nameFunctions,
} from "@/logic/terms";
import type { EvalFormSchema } from "@/schemas/evaluation";
import {
  decodeExpression,
  type LionExpressionType,
} from "@/schemas/lion-expression";

const decode = decodeExpression;

/**
 * Checks code, then compiles and runs it in a scope. The code is written as
 * it runs, so it is compiled in the scope it runs in, as a program is: a
 * string means what the scope declares at that moment, together with the
 * names the code defines, which bind in the body the scope is in, and the
 * relations and schemas it declares.
 */
const runCode = (
  code: unknown,
  environment: Environment,
  depth: number
): unknown =>
  andThen(returned(decode(code), undefined), depth, (checked, now) => {
    const program = checked as LionExpressionType;
    const scope = asWritten(environment);
    predeclare(bodyOf(environment).bindings, definedIn(program, scope));
    predeclare(topOf(environment).bindings, declaredIn(program, scope));
    return compile(program, asWritten(environment))(environment, now);
  });

/**
 * Evaluates its argument, then evaluates the result as code, in the scope
 * the form was written in. Code that is not known yet waits.
 */
export const compileEval = (
  [_, expression]: typeof EvalFormSchema.Type,
  scope: Scope | undefined
): Compiled => {
  const code = compile(expression, scope);
  return (environment, depth) =>
    andThen(code(environment, depth), depth, (made, now) => {
      if (!(made instanceof LogicValue)) {
        return runCode(made, environment, now);
      }
      const run = (later: unknown) =>
        Effect.suspend(() => toEffect(runCode(later, environment, 0)));
      const wait = () => {
        nameFunctions({ eval: run });
        return new DeferredCall(run, "eval", [made]);
      };
      if (isWaiting(made)) {
        return wait();
      }
      return new Pending(
        Effect.flatMap(isWriting, (writing) =>
          writing ? Effect.succeed(wait()) : Effect.flatMap(answer(made), run)
        )
      );
    });
};

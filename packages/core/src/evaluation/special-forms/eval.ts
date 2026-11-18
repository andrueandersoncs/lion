import { Effect, Schema } from "effect";
import { answer, isWriting } from "@/evaluation/asking";
import {
  andThen,
  type Compiled,
  Pending,
  returned,
  toEffect,
} from "@/evaluation/compiled";
import type { Environment } from "@/evaluation/environment";
import { compile } from "@/evaluation/evaluate.ts";
import {
  DeferredCall,
  isWaiting,
  LogicValue,
  nameFunctions,
} from "@/logic/terms";
import type { EvalFormSchema } from "@/schemas/evaluation";
import { LionExpressionSchema } from "@/schemas/lion-expression";

const decode = Schema.decodeUnknownEffect(LionExpressionSchema);

/** Checks code, then compiles and runs it in a scope. */
const runCode = (
  code: unknown,
  environment: Environment,
  depth: number
): unknown =>
  andThen(returned(decode(code), undefined), depth, (checked, now) =>
    compile(checked as never)(environment, now)
  );

/**
 * Evaluates its argument, then evaluates the result as code, in the scope
 * the form was written in. Code that is not known yet waits.
 */
export const compileEval = ([
  _,
  expression,
]: typeof EvalFormSchema.Type): Compiled => {
  const code = compile(expression);
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

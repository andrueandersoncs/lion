import { Effect } from "effect";
import { isWriting } from "@/evaluation/asking";
import {
  andThen,
  type Compiled,
  Pending,
  runAll,
  toEffect,
} from "@/evaluation/compiled";
import {
  declares,
  type Environment,
  type Scope,
} from "@/evaluation/environment";
import { compile } from "@/evaluation/evaluate";
import { suspend } from "@/evaluation/special-forms/lambda";
import { isWaiting, LogicValue } from "@/logic/terms";
import type { BeginFormSchema } from "@/schemas/evaluation";
import type { LionExpressionType } from "@/schemas/lion-expression";

type BeginForm = typeof BeginFormSchema.Type;

/** True for an expression that is a `begin` in the scope it is written in. */
export const isBegin = (
  expression: LionExpressionType,
  scope: Scope | undefined
): expression is BeginForm =>
  Array.isArray(expression) &&
  expression[0] === "begin" &&
  !declares(scope, "begin");

/**
 * Evaluates its expressions in order and gives the last one's value, or an
 * empty list when it has none. The last runs in the place of the form, so
 * a call there is in tail position.
 *
 * Every expression before the last runs first, so the form waits for one
 * as `cond` waits for a condition: one that waits for a logic variable has
 * not run yet, and a question, while a rule, query, or find is written,
 * holds parts that run when it is asked. The whole form waits then, and
 * runs every expression when it runs. A question it does not need is not
 * asked, as in plain code.
 *
 * A program's own `begin` is `spliced`: its forms run one at a time, as
 * Scheme splices a top-level `begin` into the program, and so does a
 * `begin` among them. A definition there of a value that waits names it,
 * and the forms after it run.
 */
export const compileBegin = (
  form: BeginForm,
  scope: Scope | undefined,
  spliced = false
): Compiled => {
  const [_, ...args] = form;
  const body = args.map((arg) =>
    spliced && isBegin(arg, scope)
      ? compileBegin(arg, scope, true)
      : compile(arg, scope)
  );
  const last = body.pop();
  if (last === undefined) {
    return () => [];
  }
  if (body.length === 0) {
    return last;
  }
  if (spliced) {
    return (environment, depth) =>
      andThen(runAll(body, environment, depth), depth, (_done, now) =>
        last(environment, now)
      );
  }
  const wait = (environment: Environment) =>
    suspend(form, environment, self, scope);
  const after = (
    made: unknown,
    at: number,
    environment: Environment,
    depth: number
  ): unknown => {
    if (!(made instanceof LogicValue)) {
      return from(at + 1, environment, depth);
    }
    if (isWaiting(made)) {
      return new Pending(wait(environment));
    }
    return new Pending(
      Effect.flatMap(isWriting, (writing) =>
        writing ? wait(environment) : toEffect(from(at + 1, environment, 0))
      )
    );
  };
  const from = (
    first: number,
    environment: Environment,
    depth: number
  ): unknown => {
    for (let at = first; at < body.length; at += 1) {
      const value = (body[at] as Compiled)(environment, depth);
      if (value instanceof Pending || value instanceof LogicValue) {
        return andThen(value, depth, (made, now) =>
          after(made, at, environment, now)
        );
      }
    }
    return last(environment, depth);
  };
  const self: Compiled = (environment, depth) => from(0, environment, depth);
  return self;
};

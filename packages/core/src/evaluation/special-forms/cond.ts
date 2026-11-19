import { Effect } from "effect";
import { logicError } from "@/errors/evaluation";
import { answer, isWriting } from "@/evaluation/asking";
import {
  andThen,
  type Compiled,
  Pending,
  toEffect,
} from "@/evaluation/compiled";
import {
  declares,
  type Environment,
  type Scope,
} from "@/evaluation/environment";
import { compile } from "@/evaluation/evaluate";
import { suspend } from "@/evaluation/special-forms/lambda";
import { isWaiting, LogicValue, sameValue, show } from "@/logic/terms";
import type { CondFormSchema } from "@/schemas/evaluation";

/** What a condition that is not true or false is told. */
export const notTruth = (condition: unknown, value: unknown) =>
  sameValue(condition, value)
    ? `A condition must be true or false, but found ${show(value)}.`
    : `A condition must be true or false, but ${show(condition)} is ${show(value)}.`;

/**
 * Returns the result of the first case whose condition holds, or null. A
 * condition is true or false, as a filter is, and any other value is an
 * error; "else", unless a scope declares it, always holds. A condition that
 * is a question, such as a relation call, is asked: it holds when it has a
 * match. When a condition is not known yet, the whole form waits. The
 * result runs in the place of the form, so a call there is in tail
 * position.
 */
export const compileCond = (
  expression: typeof CondFormSchema.Type,
  scope: Scope | undefined
): Compiled => {
  const [_, ...cases] = expression;
  const conditions = cases.map(
    ([condition]): Compiled =>
      condition === "else" && !declares(scope, "else")
        ? () => true
        : compile(condition, scope)
  );
  const results = cases.map(([, result]) => compile(result, scope));
  const truth = (at: number, holds: unknown) =>
    typeof holds === "boolean"
      ? holds
      : new Pending(logicError(notTruth(cases[at]?.[0], holds)));
  const from = (
    first: number,
    environment: Environment,
    depth: number
  ): unknown => {
    for (let at = first; at < conditions.length; at += 1) {
      const holds = (conditions[at] as Compiled)(environment, depth);
      if (holds instanceof Pending || holds instanceof LogicValue) {
        return andThen(holds, depth, (value, now) =>
          decide(value, at, environment, now)
        );
      }
      const decided = truth(at, holds);
      if (decided instanceof Pending) {
        return decided;
      }
      if (decided) {
        return (results[at] as Compiled)(environment, depth);
      }
    }
    return null;
  };
  const decide = (
    holds: unknown,
    at: number,
    environment: Environment,
    depth: number
  ): unknown => {
    if (!(holds instanceof LogicValue)) {
      const decided = truth(at, holds);
      if (decided instanceof Pending) {
        return decided;
      }
      return decided
        ? (results[at] as Compiled)(environment, depth)
        : from(at + 1, environment, depth);
    }
    if (isWaiting(holds)) {
      return new Pending(suspend(expression, environment, self, scope));
    }
    return new Pending(
      Effect.flatMap(isWriting, (writing) =>
        writing
          ? suspend(expression, environment, self, scope)
          : Effect.flatMap(answer(holds), (answered) =>
              toEffect(decide(Boolean(answered), at, environment, 0))
            )
      )
    );
  };
  const self: Compiled = (environment, depth) => from(0, environment, depth);
  return self;
};

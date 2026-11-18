import { Effect } from "effect";
import { answer, isWriting } from "@/evaluation/asking";
import {
  andThen,
  type Compiled,
  Pending,
  toEffect,
} from "@/evaluation/compiled";
import type { Environment } from "@/evaluation/environment";
import { compile } from "@/evaluation/evaluate";
import { suspend } from "@/evaluation/special-forms/lambda";
import { isWaiting, LogicValue } from "@/logic/terms";
import type { CondFormSchema } from "@/schemas/evaluation";

/**
 * Returns the result of the first case whose condition holds, or null. The
 * name "else" is a string, which holds like any other. A condition that is
 * a question, such as a relation call, is asked: it holds when it has a
 * match. When a condition is not known yet, the whole form waits. The
 * result runs in the place of the form, so a call there is in tail
 * position.
 */
export const compileCond = (
  expression: typeof CondFormSchema.Type
): Compiled => {
  const [_, ...cases] = expression;
  const conditions = cases.map(([condition]) => compile(condition));
  const results = cases.map(([, result]) => compile(result));
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
      if (holds) {
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
      return holds
        ? (results[at] as Compiled)(environment, depth)
        : from(at + 1, environment, depth);
    }
    if (isWaiting(holds)) {
      return new Pending(suspend(expression, environment, self));
    }
    return new Pending(
      Effect.flatMap(isWriting, (writing) =>
        writing
          ? suspend(expression, environment, self)
          : Effect.flatMap(answer(holds), (answered) =>
              toEffect(decide(Boolean(answered), at, environment, 0))
            )
      )
    );
  };
  const self: Compiled = (environment, depth) => from(0, environment, depth);
  return self;
};

import { Effect } from "effect";
import { answer, isWriting } from "@/evaluation/asking";
import { evaluate } from "@/evaluation/evaluate";
import { suspend } from "@/evaluation/special-forms/lambda";
import { isWaiting, LogicValue } from "@/logic/terms";
import type { CondFormSchema } from "@/schemas/evaluation";

/**
 * Returns the result of the first case whose condition holds, or null. The
 * name "else" is a string, which holds like any other. A condition that is
 * a question, such as a relation call, is asked: it holds when it has a
 * match. When a condition is not known yet, the whole form waits.
 */
export const evaluateCond = (expression: typeof CondFormSchema.Type) =>
  Effect.gen(function* () {
    const [_, ...cases] = expression;
    for (const [condition, result] of cases) {
      let holds = yield* evaluate(condition);
      if (holds instanceof LogicValue) {
        if (isWaiting(holds) || (yield* isWriting)) {
          return yield* suspend(expression);
        }
        holds = yield* answer(holds);
      }
      if (holds) {
        return yield* evaluate(result);
      }
    }
    return null;
  });

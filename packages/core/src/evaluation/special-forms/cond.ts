import { Effect } from "effect";
import { logicError } from "@/errors/evaluation";
import { evaluate } from "@/evaluation/evaluate";
import { suspend } from "@/evaluation/special-forms/lambda";
import { isGoal, show, termVariables } from "@/logic/terms";
import type { CondFormSchema } from "@/schemas/evaluation";

/**
 * Returns the result of the first case whose condition holds, or null. The
 * name "else" is a string, which holds like any other. When a condition is
 * not known yet, the whole form waits for the logic variables it mentions.
 */
export const evaluateCond = (expression: typeof CondFormSchema.Type) =>
  Effect.gen(function* () {
    const [_, ...cases] = expression;
    for (const [condition, result] of cases) {
      const holds = yield* evaluate(condition);
      if (termVariables(holds).length > 0) {
        return yield* suspend(expression);
      }
      if (isGoal(holds) && typeof holds !== "boolean") {
        return yield* logicError(
          `cond cannot test the goal ${show(holds)}: a relation holds or not only as a goal of a rule or query. Choose between goals with "and", "or", and "not".`
        );
      }
      if (holds) {
        return yield* evaluate(result);
      }
    }
    return null;
  });

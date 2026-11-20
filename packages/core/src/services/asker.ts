import { Context } from "effect";
import type { EvaluateResult } from "@/types/evaluation";

/**
 * Answers the questions that expressions ask: whether a goal has a match, or
 * what a find finds. While a rule, query, or find is being written there is
 * nothing to ask yet, so it has no `answer`, and its questions wait.
 */
export interface Asker {
  readonly answer?: (question: unknown) => EvaluateResult;
  /**
   * When the rule, query, or find began to be written or run, as the scopes
   * count it: a scope made before then is outside it.
   */
  readonly since: number;
}

/**
 * Who answers questions right now. Without one, a question goes to the
 * database of the evaluation.
 */
export class LionAskerService extends Context.Service<
  LionAskerService,
  Asker
>()("LionAskerService") {}

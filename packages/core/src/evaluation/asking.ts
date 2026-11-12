/**
 * Asking: how the code that uses a goal as a value gets its answer.
 *
 * A goal with a relation in it is a question, and so is a find. Outside of
 * rules the database answers a question right away. While a rule, query, or
 * find is being written its questions are part of what is written, so they
 * wait, and the engine answers them when the rule runs.
 */
import { Effect, Option } from "effect";
import { logicError, WaitingError } from "@/errors/evaluation";
import { askDatabase } from "@/logic/database";
import { isQuestion, type LogicValue } from "@/logic/terms";
import { LionAskerService } from "@/services/asker";
import { LionDatabaseService } from "@/services/database";
import type { EvaluateResult } from "@/types/evaluation";

/** The logic database of this evaluation. */
export const database = Effect.serviceOption(LionDatabaseService).pipe(
  Effect.flatMap(
    Option.match({
      onNone: () =>
        logicError(
          "No logic database is available. Evaluate with run(), or provide LionDatabaseService."
        ),
      onSome: Effect.succeed,
    })
  )
);

/**
 * Evaluates the parts of a rule, query, or find. The questions among them
 * stay questions: they are asked when the rule or query runs.
 */
export const writing = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provideService(LionAskerService, {}));

/** True while a rule, query, or find is being written. */
export const isWriting = Effect.map(
  Effect.serviceOption(LionAskerService),
  (asker) => Option.isSome(asker) && asker.value.answer === undefined
);

/**
 * The value of a question for code that uses it: true or false for a goal,
 * and a list for a find. Any other value is itself. Fails with a
 * WaitingError while a rule is being written.
 */
export const answer = (value: unknown): EvaluateResult => {
  if (!isQuestion(value)) {
    return Effect.succeed(value);
  }
  return Effect.gen(function* () {
    const asker = yield* Effect.serviceOption(LionAskerService);
    if (Option.isNone(asker)) {
      return yield* askDatabase(yield* database, value as LogicValue);
    }
    const ask = asker.value.answer;
    return ask === undefined
      ? yield* new WaitingError({ value })
      : yield* ask(value);
  });
};

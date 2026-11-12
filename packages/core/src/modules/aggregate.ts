import { Effect } from "effect";
import {
  ArithmeticError,
  type LogicError,
  logicError,
} from "@/errors/evaluation";
import { AGGREGATORS, aggregator } from "@/logic/aggregates";
import {
  DeferredCall,
  logicFunction,
  nameFunctions,
  show,
} from "@/logic/terms";

/** Combines a list right away, as an aggregate combines a rule's matches. */
const combine =
  (kind: string) =>
  (list: unknown): Effect.Effect<unknown, LogicError | ArithmeticError> => {
    if (!Array.isArray(list)) {
      return logicError(
        `aggregate/${kind} expects a list, but found ${show(list)}. An aggregate combines a rule's matches only as a whole argument of the rule's head.`
      );
    }
    const { check, fold } = aggregator(kind);
    const problem = check(list);
    if (problem !== undefined) {
      return logicError(`aggregate/${kind} ${problem}.`);
    }
    const result = fold(list);
    // Sums of large numbers can overflow; JSON holds only finite ones.
    return typeof result === "number" && !Number.isFinite(result)
      ? Effect.fail(
          new ArithmeticError({
            message: `aggregate/${kind}: the result is not a finite number.`,
          })
        )
      : Effect.succeed(result);
  };

/**
 * Called on a list, `["aggregate/sum", list]` combines it right away. Called
 * on anything else, it waits: as a whole argument of a rule head it combines
 * the values of its argument across the rule's matches, and anywhere else it
 * combines the list its argument turns out to be.
 */
const aggregate = (kind: string) => {
  const onList = combine(kind);
  // A waiting call is written under the name that builds it again.
  nameFunctions({ [`aggregate/${kind}`]: onList });
  return logicFunction((values: unknown, ...extra: unknown[]) => {
    if (extra.length > 0) {
      return logicError(
        `aggregate/${kind} takes one argument but got ${extra.length + 1}.`
      );
    }
    return Array.isArray(values)
      ? onList(values)
      : Effect.succeed(
          new DeferredCall(onList, `aggregate/${kind}`, [values], kind)
        );
  });
};

export const module = {
  symbol: Symbol("aggregate"),
  ...Object.fromEntries(
    Object.keys(AGGREGATORS).map((kind) => [kind, aggregate(kind)])
  ),
};

import { Effect } from "effect";
import {
  ArithmeticError,
  type LogicError,
  logicError,
} from "@/errors/evaluation";
import { AGGREGATORS, aggregator } from "@/logic/aggregates";
import {
  DeferredCall,
  isForm,
  logicFunction,
  nameFunctions,
  readsOnlyArguments,
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
 * An aggregate combines a list. Called on a list it combines it right away,
 * and called on anything else it waits for the list its argument turns out
 * to be: a find's list is what the find found. Only as a whole argument of
 * a rule head, and not on a find, its argument stands for one value from
 * each of the rule's matches, and it combines those.
 */
const aggregate = (kind: string) => {
  const onList = combine(kind);
  const name = `aggregate/${kind}`;
  // A waiting call is written under the name that builds it again.
  nameFunctions({ [name]: onList });
  readsOnlyArguments({ onList });
  return logicFunction((values: unknown, ...extra: unknown[]) => {
    if (extra.length > 0) {
      return logicError(
        `${name} takes one argument but got ${extra.length + 1}.`
      );
    }
    if (Array.isArray(values)) {
      return onList(values);
    }
    return Effect.succeed(
      isForm(values, "find")
        ? new DeferredCall(onList, name, [values])
        : new DeferredCall(onList, name, [values], kind)
    );
  });
};

export const module = {
  symbol: Symbol("aggregate"),
  ...Object.fromEntries(
    Object.keys(AGGREGATORS).map((kind) => [kind, aggregate(kind)])
  ),
};

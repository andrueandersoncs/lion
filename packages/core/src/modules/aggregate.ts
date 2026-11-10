import { Effect, Schema } from "effect";
import { LogicError } from "@/errors/evaluation";
import { AGGREGATORS, aggregator } from "@/logic/aggregates";
import { Aggregate, isLogicTerm } from "@/logic/terms";
import { decode } from "@/modules/lib/shared";

/**
 * In a rule head, `["aggregate/sum", "?amount"]` becomes an aggregate over the
 * rule's matches. Called on a plain list, it combines the list right away.
 */
const aggregate =
  (kind: string) =>
  (values: unknown, ...extra: unknown[]) => {
    if (extra.length > 0) {
      return Effect.fail(
        new LogicError({
          message: `aggregate/${kind} takes one argument but got ${extra.length + 1}.`,
        })
      );
    }
    if (isLogicTerm(values)) {
      return Effect.succeed(new Aggregate(kind, values));
    }
    const { check, fold } = aggregator(kind);
    return decode(Schema.Array(Schema.Any))(values).pipe(
      Effect.flatMap((list) => {
        const problem = check(list);
        return problem === undefined
          ? Effect.succeed(fold(list))
          : Effect.fail(
              new LogicError({ message: `aggregate/${kind} ${problem}.` })
            );
      })
    );
  };

export const module = {
  symbol: Symbol("aggregate"),
  ...Object.fromEntries(
    Object.keys(AGGREGATORS).map((kind) => [kind, aggregate(kind)])
  ),
};

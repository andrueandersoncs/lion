import { Effect, Schema } from "effect";
import { ArithmeticError, LogicError } from "@/errors/evaluation";
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
      Effect.flatMap(
        (list): Effect.Effect<unknown, LogicError | ArithmeticError> => {
          const problem = check(list);
          if (problem !== undefined) {
            return Effect.fail(
              new LogicError({ message: `aggregate/${kind} ${problem}.` })
            );
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
        }
      )
    );
  };

export const module = {
  symbol: Symbol("aggregate"),
  ...Object.fromEntries(
    Object.keys(AGGREGATORS).map((kind) => [kind, aggregate(kind)])
  ),
};

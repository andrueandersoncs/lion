/**
 * Whether one schema includes another: every value the first allows fits
 * the second. A schema that lists its values is checked value by value, as
 * a schema check binds a value to each; any other stands for its values
 * symbolically, and the solver decides whether some value of its shape
 * fails the second schema. Anything the solver cannot decide is refused by
 * name, so every answer is exact.
 */
import { Effect } from "effect";
import { LogicError } from "@/errors/evaluation";
import { fits } from "@/logic/fit";
import { candidatesOf, unlisted } from "@/logic/listing";
import { type Constraint, type Sort, satisfiable } from "@/logic/solver";
import { type Context, fitsOf, shapeFor } from "@/logic/symbolic";
import { and, not } from "@/logic/symbols";
import { show } from "@/logic/terms";

const failure = (error: unknown) =>
  error instanceof LogicError
    ? error
    : new LogicError({
        message: error instanceof Error ? error.message : String(error),
      });

/** Whether a value fits a schema, as schema/fits? says. */
const fitting = (schema: unknown, value: unknown) =>
  Effect.map(
    fits(schema, value) as unknown as Effect.Effect<unknown, Error>,
    (fit) => fit === true
  );

const sortsOf = (
  constraints: readonly Constraint[],
  sorts: ReadonlyMap<string, Sort>
) =>
  new Map(
    constraints
      .flatMap((c) => [...c.linear.coefficients.keys()])
      .map((name) => [name, sorts.get(name) ?? "real"] as const)
  );

/** Whether every value `inner` allows fits `outer`. */
export const includes = (
  inner: unknown,
  outer: unknown
): Effect.Effect<boolean, LogicError> =>
  Effect.gen(function* () {
    if (unlisted(inner) === undefined) {
      const values = yield* Effect.try({
        try: () => candidatesOf(inner),
        catch: failure,
      });
      for (const value of values) {
        if ((yield* fitting(inner, value)) && !(yield* fitting(outer, value))) {
          return false;
        }
      }
      return true;
    }
    const sorts = new Map<string, Sort>();
    const context: Context = {
      evaluate: (part) =>
        Effect.fail(
          new LogicError({ message: `${show(part)} has no value here.` })
        ),
      sorts,
      symbols: new Map(),
    };
    const { cases } = yield* shapeFor("value", inner, context);
    for (const { sym, when } of cases) {
      const fit = yield* fitsOf(sym, outer, context, 0);
      for (const constraints of and(when, not(fit))) {
        if (satisfiable(constraints, sortsOf(constraints, sorts))) {
          return false;
        }
      }
    }
    return true;
  }).pipe(
    Effect.mapError(
      (error) =>
        new LogicError({
          message: `schema/includes? cannot say whether every value ${show(inner)} allows fits ${show(outer)}: ${failure(error).message}`,
        })
    ),
    Effect.catchDefect((defect) =>
      Effect.fail(
        new LogicError({
          message: `schema/includes? cannot say whether every value ${show(inner)} allows fits ${show(outer)}: ${failure(defect).message}`,
        })
      )
    )
  );

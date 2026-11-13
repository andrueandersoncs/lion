import { Effect } from "effect";
import { logicError } from "@/errors/evaluation";
import { builders, checking, fitsValue, misfit, problemsOf } from "@/logic/fit";

/**
 * Schemas: what a value must be. Anything is a schema. A function is a
 * predicate, a record or list fits part by part, and any other value fits a
 * value equal to it. These functions check values and build schemas out of
 * others; `["schema", name, shape]` gives one a name.
 */
export const module = {
  symbol: Symbol("schema"),

  /** Whether a value fits a schema. */
  "fits?": fitsValue,

  /**
   * Every place where a value does not fit a schema, as a list of records
   * with a `path` and what was `expected` or `found` there; an empty list
   * when the value fits.
   */
  problems: checking((value, schema) => problemsOf(schema, value)),

  /** The value when it fits the schema; fails, and says where, when not. */
  assert: checking((value, schema) =>
    Effect.flatMap(misfit(schema, value), (message) =>
      message === undefined ? Effect.succeed(value) : logicError(message)
    )
  ),

  ...builders,
};

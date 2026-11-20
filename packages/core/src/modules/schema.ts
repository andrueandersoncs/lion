import { Effect } from "effect";
import { logicError, takes } from "@/errors/evaluation";
import { checkContractsWith } from "@/evaluation/special-forms/lambda";
import { builders, checking, fitsValue, misfit, problemsOf } from "@/logic/fit";
import { includes } from "@/logic/inclusion";

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

  /**
   * Whether every value the first schema allows fits the second: decided
   * exactly, by listing the first schema's values or by the solver, and
   * refused by name when neither can.
   */
  "includes?": takes(2, includes, "a schema and a schema"),

  ...builders,
};

// A lambda's contract checks an argument as schema/assert does.
checkContractsWith(module.assert);

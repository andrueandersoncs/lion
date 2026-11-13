import { Effect } from "effect";
import { logicError } from "@/errors/evaluation";
import { builders, fitsValue, misfit, problemsOf } from "@/logic/fit";

/** The value and the schema of a call, which takes exactly those two. */
const pair = (name: string, args: readonly unknown[]) =>
  args.length === 2
    ? Effect.succeed(args as readonly [unknown, unknown])
    : logicError(
        `schema/${name} takes 2 arguments, a value and a schema, but got ${args.length}.`
      );

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
  problems: (...args: unknown[]) =>
    Effect.flatMap(pair("problems", args), ([value, schema]) =>
      problemsOf(schema, value)
    ),

  /** The value when it fits the schema; fails, and says where, when not. */
  assert: (...args: unknown[]) =>
    Effect.gen(function* () {
      const [value, schema] = yield* pair("assert", args);
      const message = yield* misfit(schema, value);
      return message === undefined ? value : yield* logicError(message);
    }),

  ...builders,
};

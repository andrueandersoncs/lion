import { Effect } from "effect";
import { takes } from "@/errors/evaluation";
import { allowsOnly, Unknown } from "@/logic/terms";

/** A predicate on one value. */
const is = (test: (a: unknown) => boolean) =>
  takes(1, (a: unknown) => Effect.succeed(test(a)));

export const module = {
  symbol: Symbol("value"),

  "function?": is((a) => typeof a === "function"),

  "number?": is((a) => typeof a === "number"),

  /** A whole number. */
  "integer?": is(Number.isInteger),

  "string?": is((a) => typeof a === "string"),

  /** As a schema, it stands for each of false and true. */
  "boolean?": allowsOnly(
    is((a) => typeof a === "boolean"),
    [false, true]
  ),

  /** A record or other object, but not a list, as JSON tells them apart. */
  "object?": is(
    (a) =>
      typeof a === "object" &&
      a !== null &&
      !Array.isArray(a) &&
      !(a instanceof Unknown)
  ),

  /**
   * A value that exists but nobody has given, such as one a rule whose head
   * says `exists` invents: `["some", "?m", ["mother", "ben", "?m"]]`.
   */
  "unknown?": is((a) => a instanceof Unknown),

  "array?": is(Array.isArray),

  /** As a schema, it stands for null. */
  "null?": allowsOnly(
    is((a) => a === null),
    [null]
  ),

  "undefined?": is((a) => a === undefined),

  "symbol?": is((a) => typeof a === "symbol"),

  /** True for every value: the schema that anything fits. */
  "any?": is(() => true),

  identity: takes(1, (x: unknown) => Effect.succeed(x)),
};

import { Effect } from "effect";

export const module = {
  symbol: Symbol("value"),

  "function?": (a: unknown) => Effect.succeed(typeof a === "function"),

  "number?": (a: unknown) => Effect.succeed(typeof a === "number"),

  "string?": (a: unknown) => Effect.succeed(typeof a === "string"),

  "boolean?": (a: unknown) => Effect.succeed(typeof a === "boolean"),

  /** A record or other object, but not a list, as JSON tells them apart. */
  "object?": (a: unknown) =>
    Effect.succeed(typeof a === "object" && a !== null && !Array.isArray(a)),

  "array?": (a: unknown) => Effect.succeed(Array.isArray(a)),

  "null?": (a: unknown) => Effect.succeed(a === null),

  "undefined?": (a: unknown) => Effect.succeed(a === undefined),

  "symbol?": (a: unknown) => Effect.succeed(typeof a === "symbol"),

  identity: (x: unknown) => Effect.succeed(x),
};

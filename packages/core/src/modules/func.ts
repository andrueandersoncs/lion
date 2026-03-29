import { Effect } from "effect";

export const func = {
  identity: (x: unknown) => Effect.succeed(x),
  "js-bind": (
    fn: (...args: unknown[]) => unknown,
    obj: unknown,
    ...args: unknown[]
  ) => Effect.succeed(fn.bind(obj, ...args)),
};

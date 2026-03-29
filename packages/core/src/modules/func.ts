import { Effect } from "effect";

export const func = {
  identity: (x: unknown) => Effect.succeed(x),
  bind: (
    fn: (...args: unknown[]) => unknown,
    obj: unknown,
    ...args: unknown[]
  ) => Effect.succeed(fn.bind(obj, ...args)),
  callback:
    (fn: unknown) =>
    (...args: unknown[]) => {
      if (typeof fn !== "function") {
        return fn;
      }

      const result = fn(...args);

      if (Effect.isEffect(result)) {
        return Effect.runPromise(
          result as Effect.Effect<unknown, unknown, never>
        );
      }

      return result;
    },
};

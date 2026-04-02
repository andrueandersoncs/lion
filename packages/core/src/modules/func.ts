import { Effect } from "effect";

export const module = {
  symbol: Symbol("func"),

  bind: (
    fn: (...args: unknown[]) => unknown,
    obj: unknown,
    ...args: unknown[]
  ) => Effect.succeed(fn.bind(obj, ...args)),

  callback: (fn: unknown) =>
    Effect.succeed((...args: unknown[]) => {
      if (typeof fn !== "function") {
        return fn;
      }

      const result = fn(...args);

      if (Effect.isEffect(result)) {
        return Effect.runPromise(
          result as Effect.Effect<unknown, unknown, never>
        ).catch((e) => console.error(e));
      }

      return result;
    }),
};

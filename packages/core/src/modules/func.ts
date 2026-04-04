import { Effect } from "effect";
import { getService, LionEnvironmentService } from "@/services/evaluation";

export const module = {
  symbol: Symbol("func"),

  bind: (
    fn: (...args: unknown[]) => unknown,
    obj: unknown,
    ...args: unknown[]
  ) => Effect.succeed(fn.bind(obj, ...args)),

  callback: (fn: unknown) =>
    Effect.gen(function* () {
      const environmentRef = yield* getService(LionEnvironmentService);
      return (...args: unknown[]) => {
        if (typeof fn !== "function") {
          return fn;
        }

        const result = fn(...args);

        if (Effect.isEffect(result)) {
          return Effect.runPromise(
            result.pipe(
              Effect.provideService(LionEnvironmentService, environmentRef)
            ) as Effect.Effect<unknown, unknown, never>
          ).catch((e) => console.error(e));
        }

        return result;
      };
    }),

  partial: (fn: unknown, ...args: unknown[]) =>
    Effect.succeed((...moreArgs: unknown[]) => {
      if (typeof fn !== "function") {
        return fn;
      }

      return fn(...args, ...moreArgs);
    }),
};

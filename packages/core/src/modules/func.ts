import { Context, Effect, Match, Option, pipe } from "effect";
import { LionEnvironmentService } from "@/services/evaluation";

export const module = {
  symbol: Symbol("func"),

  bind: (
    fn: (...args: unknown[]) => unknown,
    obj: unknown,
    ...args: unknown[]
  ) => Effect.succeed(fn.bind(obj, ...args)),

  callback: (fn: unknown) =>
    pipe(
      Effect.context<never>(),
      Effect.map((context) =>
        Context.getOption(context, LionEnvironmentService)
      ),
      Effect.map((environmentRef) => (...args: unknown[]) => {
        if (typeof fn !== "function") {
          return fn;
        }

        const result = fn(...args);

        if (Effect.isEffect(result)) {
          const callbackEffect = pipe(
            Match.value(environmentRef),
            Match.when(
              Option.isSome,
              ({ value }) =>
                result.pipe(
                  Effect.provideService(LionEnvironmentService, value)
                ) as Effect.Effect<unknown, unknown, never>
            ),
            Match.when(Option.isNone, () => result),
            Match.exhaustive
          );

          return Effect.runPromise(
            callbackEffect as Effect.Effect<unknown, unknown, never>
          ).catch((e) => console.error(e));
        }

        return result;
      })
    ),

  partial: (fn: unknown, ...args: unknown[]) =>
    Effect.succeed((...moreArgs: unknown[]) => {
      if (typeof fn !== "function") {
        return fn;
      }

      return fn(...args, ...moreArgs);
    }),
};

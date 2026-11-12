import { Context, Effect, Match, Option, pipe } from "effect";
import { isLogicFunction, logicFunction } from "@/logic/terms";
import { LionDatabaseService } from "@/services/database";
import { LionEnvironmentService } from "@/services/evaluation";

export const module = {
  symbol: Symbol("func"),

  bind: (
    fn: (...args: unknown[]) => unknown,
    obj: unknown,
    ...args: unknown[]
  ) => Effect.succeed(fn.bind(obj, ...args)),

  /**
   * Calls a function with `obj` as `this`. A Lion function returns an Effect,
   * which runs, so the result is what calling the function directly returns.
   */
  apply: (
    fn: (...args: unknown[]) => unknown,
    obj: unknown,
    ...args: unknown[]
  ) =>
    Effect.suspend(() => {
      const result = fn.apply(obj, args);
      return Effect.isEffect(result)
        ? (result as Effect.Effect<unknown, unknown>)
        : Effect.succeed(result);
    }),

  callback: (fn: unknown) =>
    pipe(
      Effect.context<never>(),
      Effect.map((context) => ({
        environmentRef: Context.getOption(context, LionEnvironmentService),
        database: Context.getOption(context, LionDatabaseService),
      })),
      Effect.map(({ environmentRef, database }) => (...args: unknown[]) => {
        if (typeof fn !== "function") {
          return fn;
        }

        const called = fn(...args);

        if (Effect.isEffect(called)) {
          // Keep relations and rules visible when host code calls back in.
          const result = Option.isSome(database)
            ? called.pipe(
                Effect.provideService(LionDatabaseService, database.value)
              )
            : called;
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
          ).catch((e) => {
            console.error(e);
            throw e;
          });
        }

        return called;
      })
    ),

  /**
   * A function with its first arguments filled in. Like the function it
   * wraps, it either waits for logic variables or takes them as they are.
   */
  partial: (fn: unknown, ...args: unknown[]) => {
    const partial = (...moreArgs: unknown[]) =>
      typeof fn === "function" ? fn(...args, ...moreArgs) : fn;
    return Effect.succeed(
      isLogicFunction(fn) ? logicFunction(partial) : partial
    );
  },
};

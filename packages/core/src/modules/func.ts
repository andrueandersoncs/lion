import { Effect } from "effect";
import { atLeast, counted, countOf, takes } from "@/errors/evaluation";
import { apply } from "@/evaluation/special-forms/function";
import { builtBy, type LionFunction, logicFunction } from "@/logic/terms";

/**
 * A function with its first arguments filled in, which takes what the
 * function it wraps takes, less those. Calling it is calling the function it
 * wraps with those arguments first, so like that function
 * it either waits for logic variables or takes them as they are. It
 * remembers the call that built it, so it is written as that call.
 */
const partial: LionFunction = logicFunction(
  takes(atLeast(1), (fn: unknown, ...args: unknown[]) => {
    const made = builtBy(
      logicFunction((...more: unknown[]) => apply(fn, [...args, ...more])),
      partial,
      [fn, ...args]
    );
    // It takes what the function it wraps takes, less the arguments given.
    const count = countOf(fn);
    return Effect.succeed(
      count === undefined
        ? made
        : counted(made, [
            Math.max(0, count[0] - args.length),
            Math.max(0, count[1] - args.length),
          ])
    );
  })
);

export const module = {
  symbol: Symbol("func"),

  bind: takes(
    atLeast(2),
    (fn: (...args: unknown[]) => unknown, obj: unknown, ...args: unknown[]) =>
      Effect.succeed(fn.bind(obj, ...args))
  ),

  /**
   * Calls a function with `obj` as `this`. A Lion function returns an Effect,
   * which runs, so the result is what calling the function directly returns.
   */
  apply: takes(
    atLeast(2),
    (fn: (...args: unknown[]) => unknown, obj: unknown, ...args: unknown[]) =>
      Effect.suspend(() => {
        const result = fn.apply(obj, args);
        return Effect.isEffect(result)
          ? (result as Effect.Effect<unknown, unknown>)
          : Effect.succeed(result);
      })
  ),

  /**
   * A function host code can call later: it calls `fn` with as many of the
   * host's arguments as `fn` takes, since host code such as
   * `Array.prototype.map` passes more than a Lion function can name, and
   * when that is a Lion function, runs it with what the evaluation that
   * made the callback had, so its scope, relations, and rules stay visible.
   */
  callback: takes(1, (fn: unknown) =>
    Effect.map(Effect.context<never>(), (context) => (...given: unknown[]) => {
      const most = countOf(fn)?.[1] ?? given.length;
      const args = given.slice(0, most);
      const called = typeof fn === "function" ? fn(...args) : fn;
      return Effect.isEffect(called)
        ? Effect.runPromise(
            Effect.provideContext(called as Effect.Effect<unknown>, context)
          ).catch((error) => {
            console.error(error);
            throw error;
          })
        : called;
    })
  ),

  partial,
};

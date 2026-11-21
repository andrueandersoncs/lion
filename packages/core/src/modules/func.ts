import { Effect } from "effect";
import {
  atLeast,
  counted,
  countOf,
  failureRecord,
  isCatchable,
  raised,
  takes,
  wrongArgument,
} from "@/errors/evaluation";
import { apply, call } from "@/evaluation/special-forms/function";
import { builtBy, type LionFunction, logicFunction } from "@/logic/terms";
import { reset, shift } from "@/modules/lib/continuations";

/**
 * A function with its first arguments filled in, which takes what the
 * function it wraps takes, less those. Calling it is calling the function it
 * wraps with those arguments first, so like that function
 * it either waits for logic variables or takes them as they are. It
 * remembers the call that built it, so it is written as that call.
 */
/**
 * Calls a function with `obj` as `this`, and with the arguments given and
 * then the items of the last, a list, as Scheme's `apply` and JavaScript's
 * `Function.prototype.apply` spread it: `["func/apply", f, null, 1,
 * ["array/make", 2, 3]]` is `[f, 1, 2, 3]`. A Lion function returns an
 * Effect, which runs, so the result is what calling the function directly
 * returns.
 */
const applying: LionFunction = takes(
  atLeast(3),
  (fn: unknown, obj: unknown, ...args: unknown[]) => {
    const last = args.at(-1);
    if (!Array.isArray(last)) {
      return Effect.fail(
        wrongArgument(applying, args.length + 1, "a list", last)
      );
    }
    return Effect.suspend(() => {
      const result = (fn as (...given: unknown[]) => unknown).apply(obj, [
        ...args.slice(0, -1),
        ...last,
      ]);
      return Effect.isEffect(result)
        ? (result as Effect.Effect<unknown, unknown>)
        : Effect.succeed(result);
    });
  }
);

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

  apply: applying,

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

  /**
   * Calls `thunk`, a function of no arguments, and gives its value; when it
   * fails, calls `handler` with the failure as data and gives that, as
   * Racket's `with-handlers` does: `{"failure": kind, "message": text}`, and
   * for a failure `func/raise` made, `"failure": "raised"` and the `value`.
   * A call that waits for a logic variable is not a failure, so it waits.
   */
  catch: takes(2, (thunk: unknown, handler: unknown) =>
    Effect.catchIf(call(thunk), isCatchable, (error) =>
      call(handler, failureRecord(error))
    )
  ),

  /**
   * Runs `thunk`, a function of no arguments, as the delimited part of a
   * continuation, and gives what it gives, or what the handler of a
   * `func/shift` inside it gives, as Racket's `reset` does.
   */
  reset: takes(1, reset),

  /**
   * Stops the delimited part where it stands: its `func/reset` gives what
   * `handler` gives for `k`, the rest of the delimited part, which a call
   * with a value resumes once, as Racket's `shift` does.
   */
  shift: takes(1, shift),

  /**
   * Fails with a value, as Racket's `raise` does: its message is the value,
   * a string as it is, and `func/catch` gives back the value.
   */
  raise: takes(1, (value: unknown) => Effect.fail(raised(value))),
};

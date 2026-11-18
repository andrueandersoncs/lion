/**
 * Compiled code: what an expression becomes, once, before it runs.
 *
 * An expression compiles to a JavaScript function of the scope it runs in.
 * The function runs in direct style and returns the expression's value. A
 * node that needs Effect returns a Pending instead: a host function that
 * returns an Effect that is not done yet, a question to the logic database,
 * a call that waits for a logic variable, or an error. The nodes around it
 * then go on inside that Effect, and every node after it is compiled code
 * again. So Effect runs where a node needs it, and nowhere else.
 *
 * Calls between Lion functions use the JavaScript stack. Each passes on how
 * deep it is, and a call deeper than `DEEPEST` becomes a Pending that makes
 * the call from the bottom of the stack, in Effect's run loop: the frames
 * above unwind, and what they still had to do is kept on the heap. A call
 * in tail position has nothing left to do, so a loop of tail calls unwinds
 * to the run loop without keeping anything.
 */
import { Effect, Exit } from "effect";
import type { Environment } from "@/evaluation/environment";
import { LionEnvironmentService } from "@/services/evaluation";
import type { EvaluateResult } from "@/types/evaluation";

/** An expression compiled to a function of the scope it runs in. */
export type Compiled = (environment: Environment, depth: number) => unknown;

/** The rest of an evaluation, as an Effect that makes its value. */
export class Pending {
  readonly effect: EvaluateResult;

  constructor(effect: EvaluateResult) {
    this.effect = effect;
  }
}

/**
 * How many calls deep compiled code goes on the JavaScript stack before a
 * call starts again at the bottom of it.
 */
export const DEEPEST = 100;

/** What compiled code gave, as an Effect. */
export const toEffect = (result: unknown): EvaluateResult =>
  result instanceof Pending ? result.effect : Effect.succeed(result);

/**
 * Goes on with what compiled code gave: now, at the same depth, or once the
 * Effect has made it, at the bottom of a fresh stack.
 */
export const andThen = (
  result: unknown,
  depth: number,
  next: (value: unknown, depth: number) => unknown
): unknown =>
  result instanceof Pending
    ? new Pending(
        Effect.flatMap(result.effect, (value) => toEffect(next(value, 0)))
      )
    : next(result, depth);

/**
 * What a called function returned, for compiled code: a value, or an
 * Effect. A finished Effect gives its value or its error right away. Any
 * other runs in the scope of the call, as it would if the caller were an
 * Effect too.
 */
export const returned = (
  result: unknown,
  environment: Environment | undefined
): unknown => {
  if (!Effect.isEffect(result)) {
    return result;
  }
  const effect = result as EvaluateResult;
  if (Exit.isExit(effect)) {
    return Exit.isSuccess(effect) ? effect.value : new Pending(effect);
  }
  return new Pending(
    environment === undefined
      ? effect
      : Effect.provideService(effect, LionEnvironmentService, environment)
  );
};

/** The values made so far, a part at a time, from the last part back. */
interface Made {
  readonly before: Made | undefined;
  readonly values: readonly unknown[];
}

const joined = (made: Made) => {
  const parts: (readonly unknown[])[] = [];
  for (let at: Made | undefined = made; at !== undefined; at = at.before) {
    parts.push(at.values);
  }
  return parts.reverse().flat();
};

/**
 * Runs compiled nodes in order and gives their values, as a list. Each runs
 * once the one before it has a value, so an error stops the rest. Each time
 * a node needs Effect, the values made before it are kept as they are, so
 * a long list of such nodes takes time in proportion to its length.
 */
export const runAll = (
  nodes: readonly Compiled[],
  environment: Environment,
  depth: number,
  from = 0,
  before?: Made
): unknown[] | Pending => {
  const values: unknown[] = [];
  for (let at = from; at < nodes.length; at += 1) {
    const value = (nodes[at] as Compiled)(environment, depth);
    if (value instanceof Pending) {
      const done: Made = { values, before };
      return new Pending(
        Effect.flatMap(value.effect, (made) =>
          toEffect(
            runAll(nodes, environment, 0, at + 1, {
              values: [made],
              before: done,
            })
          )
        )
      );
    }
    values.push(value);
  }
  return before === undefined ? values : joined({ values, before });
};

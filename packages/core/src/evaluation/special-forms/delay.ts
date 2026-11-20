import { Effect } from "effect";
import { LogicError } from "@/errors/evaluation";
import { type Compiled, toEffect } from "@/evaluation/compiled";
import type { Scope } from "@/evaluation/environment";
import { compile } from "@/evaluation/evaluate";
import type { DelayFormSchema } from "@/schemas/evaluation";
import type { EvaluateResult } from "@/types/evaluation";

/**
 * A promise: an expression `delay` keeps, with the scope it was written in,
 * to run the first time `value/force` asks for its value, which it then
 * keeps, as Racket's promises do.
 */
export class Delayed {
  /** What it gave, once forced. */
  private given: { readonly value: unknown } | undefined;
  /** Whether it is being forced now, so forcing it again would never end. */
  private running = false;
  private readonly run: () => unknown;

  constructor(run: () => unknown) {
    this.run = run;
  }

  /** Whether `value/force` has made its value. */
  get forced() {
    return this.given !== undefined;
  }

  /**
   * Its value: made once, the first time, and kept. A failure keeps
   * nothing, so the next force runs the expression again.
   */
  force(): EvaluateResult {
    if (this.given !== undefined) {
      return Effect.succeed(this.given.value);
    }
    if (this.running) {
      return Effect.fail(
        new LogicError({
          message:
            "A promise was forced while it was being forced, so forcing it would never end.",
        })
      );
    }
    this.running = true;
    return Effect.suspend(() => toEffect(this.run())).pipe(
      Effect.tap((value) =>
        Effect.sync(() => {
          this.given = { value };
        })
      ),
      Effect.ensuring(
        Effect.sync(() => {
          this.running = false;
        })
      )
    );
  }
}

/**
 * Makes a promise of an expression, written in the scope the form is in, as
 * Racket's `delay` does. Nothing runs until `value/force` asks.
 */
export const compileDelay = (
  [_, expression]: typeof DelayFormSchema.Type,
  scope: Scope | undefined
): Compiled => {
  const compiled = compile(expression, scope);
  return (environment) => new Delayed(() => compiled(environment, 0));
};

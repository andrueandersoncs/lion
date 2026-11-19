import { Effect } from "effect";
import { unboundSet } from "@/errors/evaluation";
import { andThen, type Compiled, Pending } from "@/evaluation/compiled";
import { assign, declares, type Scope } from "@/evaluation/environment";
import { compile } from "@/evaluation/evaluate";
import type { SetFormSchema } from "@/schemas/evaluation";

/**
 * Changes the value of the nearest binding of a name, in the scopes the form
 * is written in, and gives the value, as `set!` does in Scheme. A name no
 * scope declares has no binding to change, so the form fails.
 */
export const compileSet = (
  [_, id, expression]: typeof SetFormSchema.Type,
  scope: Scope | undefined
): Compiled => {
  if (!declares(scope, id)) {
    const error = unboundSet(id);
    return () => new Pending(Effect.fail(error));
  }
  const value = compile(expression, scope);
  return (environment, depth) =>
    andThen(value(environment, depth), depth, (made) => {
      assign(environment, id, made);
      return made;
    });
};

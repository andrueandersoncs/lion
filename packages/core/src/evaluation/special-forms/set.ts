import { Context, Effect, Fiber, Option } from "effect";
import { LogicError, unboundSet } from "@/errors/evaluation";
import { andThen, type Compiled, Pending } from "@/evaluation/compiled";
import {
  assign,
  declares,
  type Environment,
  type Scope,
  scopeOf,
} from "@/evaluation/environment";
import { compile } from "@/evaluation/evaluate";
import type { SetFormSchema } from "@/schemas/evaluation";
import { LionAskerService } from "@/services/asker";

/**
 * When the rule, query, or find being written or run began, if one is: then
 * the engine chooses when and how often its parts run.
 */
const orderedSince = () => {
  const fiber = Fiber.getCurrent();
  const asker =
    fiber === undefined
      ? Option.none()
      : Context.getOption(fiber.context, LionAskerService);
  return Option.isSome(asker) ? asker.value.since : undefined;
};

/**
 * Why `set!` cannot change a name here, if it cannot: a rule, query, or
 * find runs its parts in the order the engine chooses, as often as it
 * chooses, so a change to a binding made outside it would not happen once
 * for each answer, as a rule body runs once when it is written. A binding
 * the evaluation made for itself, such as a counter in a helper it calls,
 * is its own to change.
 */
export const refusedSet = (environment: Environment, id: string) => {
  const since = orderedSince();
  const scope = since === undefined ? undefined : scopeOf(environment, id);
  return scope === undefined || since === undefined || (scope.made ?? 0) > since
    ? undefined
    : new LogicError({
        message: `set! cannot change "${id}" while a rule, query, or find runs: the engine chooses when and how often its parts run, so a change to a binding made outside it would not happen once for each answer. Change it outside, or derive the value with a rule or an aggregate.`,
      });
};

/**
 * Changes the value of the nearest binding of a name, in the scopes the form
 * is written in, and gives the value, as `set!` does in Scheme. A name no
 * scope declares has no binding to change, so the form fails, and so does a
 * change where the engine chooses the order, to a binding made before.
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
      const refused = refusedSet(environment, id);
      if (refused !== undefined) {
        return new Pending(Effect.fail(refused));
      }
      assign(environment, id, made);
      return made;
    });
};

import { Effect, Match, Option, pipe, String as Str } from "effect";
import { UnboundNameError } from "@/errors/evaluation";
import { boundNames, getBinding } from "@/evaluation/environment";
import {
  isLogicVariableName,
  isNamespacedName,
  LogicVariable,
} from "@/logic/terms";
import type { Environment } from "@/schemas/environment";
import type { JsonPrimitiveType } from "@/schemas/json-primitive";
import { LionEnvironmentService } from "@/services/evaluation.ts";

export const evaluatePrimitive = (expression: JsonPrimitiveType) =>
  pipe(
    Match.value(expression),
    Match.when(Str.isString, evaluateReference),
    Match.orElse(Effect.succeed)
  );

/** How many single-letter edits turn one name into another, up to `limit`. */
const distance = (a: string, b: string, limit: number) => {
  if (Math.abs(a.length - b.length) > limit) {
    return limit + 1;
  }
  let row = Array.from({ length: b.length + 1 }, (_, at) => at);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const swap = (row[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      next.push(Math.min(swap, (row[j] ?? 0) + 1, (next[j - 1] ?? 0) + 1));
    }
    row = next;
  }
  return row[b.length] ?? limit + 1;
};

const MAX_EDITS = 2;

/**
 * What an unbound string of the form `module/name` is. It is a misspelled
 * name, and so an error, when it can only have been meant as a name: other
 * names of its module are bound, or a bound name is a letter or two away,
 * which the error suggests. Any other such string is data, like "n/a".
 */
export const nameOrString = (environment: Environment, name: string) =>
  Effect.flatMap(
    boundNames(environment),
    (names): Effect.Effect<string, UnboundNameError> => {
      const module = name.slice(0, name.indexOf("/") + 1);
      let inModule = false;
      let nearest: string | null = null;
      let fewest = MAX_EDITS + 1;
      // Only a name of the same form can be what was meant.
      for (const candidate of [...names].filter(isNamespacedName).sort()) {
        inModule ||= candidate.startsWith(module);
        const edits = distance(name, candidate, MAX_EDITS);
        if (edits < fewest) {
          fewest = edits;
          nearest = candidate;
        }
      }
      return inModule || nearest !== null
        ? Effect.fail(new UnboundNameError({ name, nearest }))
        : Effect.succeed(name);
    }
  );

/**
 * Bound names evaluate to their value. An unbound `?name` evaluates to a
 * logic variable, and an unbound `module/name` that reads as a misspelled
 * name is an error. Any other unbound string evaluates to itself.
 */
export const evaluateReference = (name: string) =>
  Effect.flatMap(Effect.service(LionEnvironmentService), (environment) =>
    Effect.flatMap(
      getBinding(environment, name),
      (binding): Effect.Effect<unknown, UnboundNameError> => {
        if (Option.isSome(binding)) {
          return Effect.succeed(binding.value);
        }
        if (isLogicVariableName(name)) {
          return Effect.succeed(new LogicVariable(name.slice(1)));
        }
        return isNamespacedName(name)
          ? nameOrString(environment, name)
          : Effect.succeed(name);
      }
    )
  );

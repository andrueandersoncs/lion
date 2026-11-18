import { Exit } from "effect";
import { UnboundNameError } from "@/errors/evaluation";
import { type Compiled, Pending } from "@/evaluation/compiled";
import {
  boundNames,
  type Environment,
  lookup,
  UNBOUND,
} from "@/evaluation/environment";
import {
  isLogicVariableName,
  isNamespacedName,
  LogicVariable,
} from "@/logic/terms";
import type { JsonPrimitiveType } from "@/schemas/json-primitive";

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
export const nameOrString = (
  environment: Environment,
  name: string
): Exit.Exit<string, UnboundNameError> => {
  const names = boundNames(environment);
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
    ? Exit.fail(new UnboundNameError({ nearest, unbound: name }))
    : Exit.succeed(name);
};

/**
 * Bound names evaluate to their value. An unbound `?name` evaluates to a
 * logic variable, and an unbound `module/name` that reads as a misspelled
 * name is an error. Any other unbound string evaluates to itself.
 */
export const compileReference = (name: string): Compiled => {
  const variable = isLogicVariableName(name) ? name.slice(1) : undefined;
  const namespaced = isNamespacedName(name);
  return (environment) => {
    const value = lookup(environment, name);
    if (value !== UNBOUND) {
      return value;
    }
    if (variable !== undefined) {
      return new LogicVariable(variable);
    }
    if (!namespaced) {
      return name;
    }
    const meant = nameOrString(environment, name);
    return Exit.isSuccess(meant) ? name : new Pending(meant);
  };
};

/** A string is a name; any other primitive is itself. */
export const compilePrimitive = (expression: JsonPrimitiveType): Compiled =>
  typeof expression === "string"
    ? compileReference(expression)
    : () => expression;

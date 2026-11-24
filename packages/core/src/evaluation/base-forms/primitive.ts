import { Effect, Exit } from "effect";
import { UnboundNameError, UndefinedYetError } from "@/errors/evaluation";
import { type Compiled, Pending } from "@/evaluation/compiled";
import {
  boundNames,
  declares,
  lookup,
  type Scope,
  UNASSIGNED,
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

/** The closest name in `candidates` within `maxEdits`, or null if none is close. */
export const nearestName = (
  name: string,
  candidates: Iterable<string>,
  maxEdits = MAX_EDITS
): string | null => {
  let nearest: string | null = null;
  let fewest = maxEdits + 1;
  for (const candidate of [...candidates].sort()) {
    const edits = distance(name, candidate, maxEdits);
    if (edits < fewest) {
      fewest = edits;
      nearest = candidate;
    }
  }
  return nearest;
};

/**
 * What an unbound string of the form `module/name` is. It is a misspelled
 * name, and so an error, when it can only have been meant as a name: other
 * names of its module are bound, or a bound name is a letter or two away,
 * which the error suggests. Any other such string is data, like "n/a".
 */
export const nameOrString = (
  scope: Scope,
  name: string
): Exit.Exit<string, UnboundNameError> => {
  const names = [...boundNames(scope)].filter(isNamespacedName);
  const module = name.slice(0, name.indexOf("/") + 1);
  const inModule = names.some((candidate) => candidate.startsWith(module));
  const nearest = nearestName(name, names, MAX_EDITS);
  return inModule || nearest !== null
    ? Exit.fail(new UnboundNameError({ nearest, unbound: name }))
    : Exit.succeed(name);
};

/**
 * True when a string is read as a name where it is written: a `?name`
 * wherever it stands, or a name a scope around it declares.
 */
export const readsAsName = (scope: Scope | undefined, name: string) =>
  isLogicVariableName(name) || declares(scope, name);

/**
 * What a string means, by the scopes it is written in. A string a scope
 * declares is a name, and evaluates to its value; reading it before its
 * `define` has run is an error. A `?name` evaluates to the value bound to
 * it, or to a logic variable. Any other string is data and evaluates to
 * itself, except a `module/name` that reads as a misspelled name, which is
 * an error. A later binding never changes what a string means.
 */
export const compileReference = (
  name: string,
  scope: Scope | undefined
): Compiled => {
  if (isLogicVariableName(name)) {
    const variable = new LogicVariable(name.slice(1));
    return (environment) => {
      const value = lookup(environment, name);
      return value === UNBOUND ? variable : read(name, value);
    };
  }
  if (declares(scope, name)) {
    return (environment) => read(name, lookup(environment, name));
  }
  if (isNamespacedName(name) && scope !== undefined) {
    const meant = nameOrString(scope, name);
    if (Exit.isFailure(meant)) {
      return () => new Pending(meant);
    }
  }
  return () => name;
};

/**
 * The string at the head of a call. The first element of an array names
 * what the array does, so a string there is a name, never data: a name a
 * scope declares is read as any name is, and any other is looked up where
 * the call runs, among the bindings the run has by then, such as the
 * relations that code `eval` ran declared. A string elsewhere means what
 * its scopes declare.
 */
export const compileHead = (
  name: string,
  scope: Scope | undefined
): Compiled => {
  const reference = compileReference(name, scope);
  if (readsAsName(scope, name)) {
    return reference;
  }
  return (environment, depth) => {
    const value = lookup(environment, name);
    return value === UNBOUND
      ? reference(environment, depth)
      : read(name, value);
  };
};

/** The value of a name, or the error of reading one before it is defined. */
const read = (name: string, value: unknown) =>
  value === UNASSIGNED
    ? new Pending(Effect.fail(new UndefinedYetError({ unassigned: name })))
    : value;

/** A string is a name or data, by its scope; any other primitive is itself. */
export const compilePrimitive = (
  expression: JsonPrimitiveType,
  scope: Scope | undefined
): Compiled =>
  typeof expression === "string"
    ? compileReference(expression, scope)
    : () => expression;

/**
 * The names a body declares before it runs. A `define` binds its name in the
 * body it stands in, a lambda's or the program's, and the name means that
 * definition everywhere in the body, also before the `define` has run. A
 * `relation` or `schema` form binds its names for the whole run.
 *
 * The forms are found as `compile` finds them: an array whose first element
 * is a form's name that no scope around it declares. What is inside `quote`
 * is data, and a lambda inside the body is a body of its own.
 */

import { Schema } from "effect";
import { declares, type Scope, scopeWith } from "@/evaluation/environment";
import { parameterNames, ValidIdentifierSchema } from "@/schemas/evaluation";

/** A name a relation or schema can have: never a special form's. */
const isIdentifier = Schema.is(ValidIdentifierSchema);

const isFormHead = (
  form: readonly unknown[],
  name: string,
  scope: Scope | undefined
) => form[0] === name && !declares(scope, name);

/** Whether a lambda form's parameters are well formed: a list, or one name. */
const parametersOf = (written: unknown) =>
  typeof written === "string" ||
  (Array.isArray(written) &&
    written.every(
      (parameter) =>
        typeof parameter === "string" ||
        (Array.isArray(parameter) &&
          parameter.length === 2 &&
          typeof parameter[0] === "string")
    ));

/** The parameters and body of a lambda form, when an array is one. */
const lambdaParts = (form: readonly unknown[], scope: Scope | undefined) =>
  isFormHead(form, "lambda", scope) &&
  form.length === 3 &&
  parametersOf(form[1])
    ? {
        body: form[2],
        parameters: parameterNames(form[1] as readonly unknown[] | string),
      }
    : undefined;

const DEFINED = new WeakMap<object, readonly string[]>();

const unshadowed = (scope: Scope | undefined) =>
  !(
    declares(scope, "define") ||
    declares(scope, "lambda") ||
    declares(scope, "quote")
  );

/**
 * The names the `define` forms of a body bind, in the order they are
 * written, leaving out those of the lambdas inside it.
 */
export const definedIn = (
  body: unknown,
  scope: Scope | undefined
): readonly string[] => {
  const names: string[] = [];
  const walk = (form: unknown) => {
    if (typeof form !== "object" || form === null) {
      return;
    }
    if (!Array.isArray(form)) {
      for (const value of Object.values(form)) {
        walk(value);
      }
      return;
    }
    if (isFormHead(form, "quote", scope) || lambdaParts(form, scope)) {
      return;
    }
    if (
      isFormHead(form, "define", scope) &&
      (form.length === 3 || form.length === 4) &&
      typeof form[1] === "string"
    ) {
      names.push(form[1]);
    }
    for (const item of form) {
      walk(item);
    }
  };
  walk(body);
  return [...new Set(names)];
};

const cachedDefined = (body: unknown, scope: Scope | undefined) => {
  if (typeof body !== "object" || body === null || !unshadowed(scope)) {
    return definedIn(body, scope);
  }
  const known = DEFINED.get(body);
  if (known !== undefined) {
    return known;
  }
  const found = definedIn(body, scope);
  DEFINED.set(body, found);
  return found;
};

/**
 * The names a lambda's body declares: its parameters and what its body
 * defines. Only the body's own `define`s are cached (never its parameters),
 * so reusing one body AST under another parameter list never leaks names.
 */
export const bodyNames = (
  parameters: readonly string[],
  body: unknown,
  scope: Scope | undefined
): readonly string[] => [
  ...new Set([
    ...parameters,
    ...cachedDefined(body, scopeWith(parameters, scope)),
  ]),
];

/** The names a `relation` or `schema` form binds, when an array is one. */
const declaredBy = (
  form: readonly unknown[],
  scope: Scope | undefined
): string[] => {
  if (isFormHead(form, "relation", scope)) {
    return isIdentifier(form[1]) ? [form[1]] : [];
  }
  return isFormHead(form, "schema", scope)
    ? form.filter(
        (name, at): name is string => at % 2 === 1 && isIdentifier(name)
      )
    : [];
};

/**
 * The names the `relation` and `schema` forms of a program bind, wherever
 * they stand outside `quote`: a relation or schema is bound for the whole
 * run.
 */
export const declaredIn = (
  program: unknown,
  scope: Scope | undefined
): readonly string[] => {
  const names: string[] = [];
  const walk = (form: unknown, around: Scope | undefined) => {
    if (typeof form !== "object" || form === null) {
      return;
    }
    if (!Array.isArray(form)) {
      for (const value of Object.values(form)) {
        walk(value, around);
      }
      return;
    }
    if (isFormHead(form, "quote", around)) {
      return;
    }
    const lambda = lambdaParts(form, around);
    if (lambda !== undefined) {
      walk(
        lambda.body,
        scopeWith(bodyNames(lambda.parameters, lambda.body, around), around)
      );
      return;
    }
    names.push(...declaredBy(form, around));
    for (const item of form) {
      walk(item, around);
    }
  };
  walk(program, scope);
  return [...new Set(names)];
};

/**
 * The scopes names are looked up in. A scope holds its own bindings and
 * the scope around it, if any: the top scope of a run, a lambda's
 * parameters, the names a `schema` form declares. Looking a name up and
 * binding one happen right away, so compiled code reads names in direct
 * style.
 */
export interface Environment {
  readonly bindings: Map<string, unknown>;
  readonly parent: Environment | undefined;
}

/** A scope of the given bindings, inside `parent` when there is one. */
export const makeEnvironment = (
  bindings: Readonly<Record<string, unknown>> | Map<string, unknown>,
  parent?: Environment
): Environment => ({
  bindings:
    bindings instanceof Map
      ? bindings
      : new Map<string, unknown>(Object.entries(bindings)),
  parent,
});

/** What `lookup` gives for a name that nothing is bound to. */
export const UNBOUND: unique symbol = Symbol("unbound");

/** The value of a name in the nearest scope that binds it. */
export const lookup = (
  environment: Environment,
  name: string
): unknown | typeof UNBOUND => {
  for (
    let scope: Environment | undefined = environment;
    scope !== undefined;
    scope = scope.parent
  ) {
    const value = scope.bindings.get(name);
    if (value !== undefined || scope.bindings.has(name)) {
      return value;
    }
  }
  return UNBOUND;
};

/** True when a scope, or one around it, binds the name. */
export const isBound = (environment: Environment, name: string) =>
  lookup(environment, name) !== UNBOUND;

/** Binds a name in the outermost scope, where `define` puts it. */
export const setGlobalBinding = (
  environment: Environment,
  name: string,
  value: unknown
): void => {
  let scope = environment;
  while (scope.parent !== undefined) {
    scope = scope.parent;
  }
  scope.bindings.set(name, value);
};

/** Every name bound in the environment or its parents. */
export const boundNames = (environment: Environment): ReadonlySet<string> => {
  const names = new Set<string>();
  for (
    let scope: Environment | undefined = environment;
    scope !== undefined;
    scope = scope.parent
  ) {
    for (const name of scope.bindings.keys()) {
      names.add(name);
    }
  }
  return names;
};

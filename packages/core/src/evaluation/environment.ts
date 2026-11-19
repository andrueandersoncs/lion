/**
 * The scopes names are looked up in. A scope holds its own bindings and
 * the scope around it, if any: the top scope of a run, a lambda's
 * parameters, the names a `schema` form declares. Looking a name up and
 * binding one happen right away, so compiled code reads names in direct
 * style.
 *
 * What a string means is settled by the scopes it is written in, before it
 * runs: a string that a scope around it declares is a name, and any other
 * is data. A scope declares its bindings, and the names its `define` forms
 * bind, from its start: the top scope of a run declares the names the
 * environment and the database bind and those the program defines, and a
 * lambda's scope its parameters and the names its body defines.
 */
export interface Environment {
  readonly bindings: Map<string, unknown>;
  /** True for the scope `define` binds in: a run's top scope, or a call's. */
  readonly body?: boolean;
  readonly parent: Environment | undefined;
}

/**
 * The names a scope declares, when code is compiled: an environment, or the
 * scope of a lambda's body before it is called. A string a scope declares is
 * a name; any other is data, whatever is bound later.
 */
export interface Scope {
  readonly bindings: { has(name: string): boolean; keys(): Iterable<string> };
  readonly parent: Scope | undefined;
}

/** A scope of the given bindings, inside `parent` when there is one. */
export const makeEnvironment = (
  bindings: Readonly<Record<string, unknown>> | Map<string, unknown>,
  parent?: Environment,
  body = false
): Environment => ({
  bindings:
    bindings instanceof Map
      ? bindings
      : new Map<string, unknown>(Object.entries(bindings)),
  ...(body ? { body } : {}),
  parent,
});

/** What `lookup` gives for a name that nothing is bound to. */
export const UNBOUND: unique symbol = Symbol("unbound");

/**
 * The value of a name a scope declares before its `define` has run. Reading
 * it is an error: the name means its definition, which has no value yet.
 */
export const UNASSIGNED: unique symbol = Symbol("unassigned");

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

/** True when a scope, or one around it, declares the name. */
export const declares = (scope: Scope | undefined, name: string): boolean => {
  for (let at = scope; at !== undefined; at = at.parent) {
    if (at.bindings.has(name)) {
      return true;
    }
  }
  return false;
};

/** True when a scope, or one around it, binds the name. */
export const isBound = (environment: Environment, name: string) =>
  lookup(environment, name) !== UNBOUND;

/** A scope inside `parent` that declares `names`, for compiling a body. */
export const scopeWith = (
  names: Iterable<string>,
  parent: Scope | undefined
): Scope => ({ bindings: new Set(names), parent });

/**
 * Declares names in a scope that does not bind them yet, so they mean their
 * definitions from the start of the scope.
 */
export const predeclare = (
  bindings: Map<string, unknown>,
  names: Iterable<string>
) => {
  for (const name of names) {
    if (!bindings.has(name)) {
      bindings.set(name, UNASSIGNED);
    }
  }
};

/** The scope `define` binds in: the nearest call's scope, or the run's. */
export const bodyOf = (environment: Environment): Environment => {
  let scope = environment;
  while (scope.body !== true && scope.parent !== undefined) {
    scope = scope.parent;
  }
  return scope;
};

/** The outermost scope, where a relation or schema is bound. */
export const topOf = (environment: Environment): Environment => {
  let scope = environment;
  while (scope.parent !== undefined) {
    scope = scope.parent;
  }
  return scope;
};

/**
 * Binds a name in the scope `define` binds in: the nearest call's scope, or
 * the top scope of the run.
 */
export const setLocalBinding = (
  environment: Environment,
  name: string,
  value: unknown
): void => {
  bodyOf(environment).bindings.set(name, value);
};

/** Binds a name in the outermost scope, where a relation or schema is bound. */
export const setGlobalBinding = (
  environment: Environment,
  name: string,
  value: unknown
): void => {
  topOf(environment).bindings.set(name, value);
};

/**
 * The names a scope binds now, which bindings that are added later, by code
 * `eval` runs, are not among. Bindings are never taken away, so those are
 * the ones past the number the scope had.
 */
const bindingsNow = (bindings: Map<string, unknown>): Scope["bindings"] => {
  const size = bindings.size;
  let later = new Set<string>();
  let seen = size;
  const isLater = (name: string) => {
    if (bindings.size === size) {
      return false;
    }
    if (seen !== bindings.size) {
      later = new Set([...bindings.keys()].slice(size));
      seen = bindings.size;
    }
    return later.has(name);
  };
  return {
    has: (name) => bindings.has(name) && !isLater(name),
    *keys() {
      let at = 0;
      for (const name of bindings.keys()) {
        if (at === size) {
          return;
        }
        at += 1;
        yield name;
      }
    },
  };
};

/**
 * The scope an environment declares now, to compile code in: a string the
 * code reads means what it means now, also when the compiled code asks what
 * its scope declares while it runs, after code `eval` ran has bound more.
 */
export const asWritten = (environment: Environment): Scope => ({
  bindings: bindingsNow(environment.bindings),
  parent:
    environment.parent === undefined
      ? undefined
      : asWritten(environment.parent),
});

/**
 * Changes the value of the nearest binding of a name, and says whether there
 * was one.
 */
export const assign = (
  environment: Environment,
  name: string,
  value: unknown
): boolean => {
  for (
    let scope: Environment | undefined = environment;
    scope !== undefined;
    scope = scope.parent
  ) {
    if (scope.bindings.has(name)) {
      scope.bindings.set(name, value);
      return true;
    }
  }
  return false;
};

/** Every name a scope or a scope around it declares. */
export const boundNames = (scope: Scope): ReadonlySet<string> => {
  const names = new Set<string>();
  for (let at: Scope | undefined = scope; at !== undefined; at = at.parent) {
    for (const name of at.bindings.keys()) {
      names.add(name);
    }
  }
  return names;
};

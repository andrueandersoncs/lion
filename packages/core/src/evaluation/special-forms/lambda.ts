import { Effect } from "effect";
import {
  atLeast,
  counted,
  leaving,
  type UnboundNameError,
  wrongCount,
} from "@/errors/evaluation";
import { nameOrString, readsAsName } from "@/evaluation/base-forms/primitive";
import {
  andThen,
  type Compiled,
  DEEPEST,
  Pending,
  runAll,
  toEffect,
} from "@/evaluation/compiled";
import {
  asWritten,
  type Environment,
  lookup,
  makingScope,
  predeclare,
  type Scope,
  scopeWith,
  UNBOUND,
} from "@/evaluation/environment";
import { compile } from "@/evaluation/evaluate";
import { bodyNames } from "@/evaluation/hoisting";
import { applyIn } from "@/evaluation/special-forms/function";
import {
  buildOf,
  DeferredCall,
  isLogicVariableName,
  isNamespacedName,
  isPlainObject,
  type LambdaInfo,
  LogicValue,
  LogicVariable,
  lambdaInfo,
  listMaker,
  nameFunctions,
  nameOf,
  readsOnlyArguments,
  recordMaker,
  registerLambda,
  sameValue,
} from "@/logic/terms";
import {
  isSpecialFormName,
  type LambdaFormSchema,
  parameterNames,
  parameterSchemas,
} from "@/schemas/evaluation";
import type { LionExpressionType } from "@/schemas/lion-expression";

/** The strings a form mentions; true for those only ever inside `quote`. */
type References = Map<string, boolean>;

const REFERENCES = new WeakMap<object, References>();

const collect = (form: unknown, quoted: boolean, into: References) => {
  if (typeof form === "string") {
    into.set(form, quoted && (into.get(form) ?? true));
  }
  if (typeof form !== "object" || form === null) {
    return;
  }
  const [head, parameters, body] = Array.isArray(form) ? form : [];
  if (
    !quoted &&
    head === "lambda" &&
    (Array.isArray(parameters) || typeof parameters === "string")
  ) {
    // A lambda's parameters shadow the names around it in its body; the
    // schemas of its contracts are read where the lambda is written.
    const names = parameterNames(parameters);
    for (const schema of parameterSchemas(parameters)) {
      collect(schema, false, into);
    }
    for (const [name, isQuoted] of references(body)) {
      if (!names.includes(name)) {
        collect(name, isQuoted, into);
      }
    }
    return;
  }
  for (const item of Object.values(form)) {
    collect(item, quoted || head === "quote", into);
  }
};

const references = (form: unknown): References => {
  const known =
    typeof form === "object" && form !== null && REFERENCES.get(form);
  if (known) {
    return known;
  }
  const found: References = new Map();
  collect(form, false, found);
  if (typeof form === "object" && form !== null) {
    REFERENCES.set(form, found);
  }
  return found;
};

/**
 * A Lion function as compiled code calls it. Its body is compiled the first
 * time it is called, and kept for every call after.
 */
interface Lambda {
  readonly body: LionExpressionType;
  compiled: Compiled | undefined;
  /** Its contracts: the parameters as written, and each one's schema. */
  readonly contract: Contract | undefined;
  /** The names its body defines, which a call declares from its start. */
  readonly defined: readonly string[];
  readonly environment: Environment | undefined;
  /** The name the `define` that bound it gave it, for its failures. */
  name: string | undefined;
  readonly parameters: readonly string[];
  /** Whether its one parameter is bound to the list of every argument. */
  readonly rest: boolean;
  /** The scope its form is written in, which settles what its strings mean. */
  readonly scope: Scope | undefined;
}

/**
 * What a lambda's parameters must fit: the parameters as written, names
 * and names with schemas, and the value of each one's schema, where it has
 * one, made where the lambda is.
 */
interface Contract {
  readonly checks: readonly unknown[];
  readonly written: readonly unknown[];
}

const LAMBDAS = new WeakMap<object, Lambda>();

/** How a contract checks an argument: `schema/assert`, which its module gives. */
let assertFit: unknown;

/** Sets the function a contract checks an argument with. */
export const checkContractsWith = (assert: unknown) => {
  assertFit = assert;
};

/**
 * The arguments of a call, each that a contract covers checked as
 * `schema/assert` checks it, where the call is made: a misfit fails before
 * the body runs, so the failure leaves the caller first. A check of a value
 * that waits for a logic variable waits too, as any call does.
 */
const checked = (
  lambda: Lambda,
  contract: Contract,
  args: readonly unknown[],
  depth: number
): unknown => {
  const values = [...args];
  const from = (start: number, now: number): unknown => {
    for (let at = start; at < values.length; at += 1) {
      const schema = contract.checks[at];
      if (schema !== undefined) {
        const result = applyIn(
          assertFit,
          [values[at], schema],
          "schema/assert",
          lambda.environment,
          now
        );
        if (result instanceof Pending) {
          return andThen(result, now, (value, later) => {
            values[at] = value;
            return from(at + 1, later);
          });
        }
        values[at] = result;
      }
    }
    return values;
  };
  return from(0, depth);
};

/** The compiled form of a Lion function, when a value is one. */
export const lambdaOf = (value: unknown): Lambda | undefined =>
  typeof value === "function" ? LAMBDAS.get(value) : undefined;

/**
 * Names a Lion function that has no name yet, as the `define` that binds it
 * does, so a failure that leaves its body says it did.
 */
export const nameLambda = (value: unknown, name: string) => {
  const lambda = lambdaOf(value);
  if (lambda !== undefined && lambda.name === undefined) {
    lambda.name = name;
  }
};

/**
 * What a call gave that needs Effect. A body that gives it back as it is
 * made the call in tail position, so its own frame is gone, as in Scheme:
 * it adds nothing to the call, not even its name to a failure.
 */
class Called extends Pending {}

/**
 * The failure of a call that gives a Lion function a number of arguments
 * other than its parameters, as a library function's says: by the name a
 * `define` gave it, or else as it is written.
 */
const refused = (lambda: Lambda, got: number) => {
  const count = lambda.parameters.length;
  return wrongCount(
    JSON.stringify(
      lambda.name ?? [
        "lambda",
        lambda.contract?.written ?? lambda.parameters,
        lambda.body,
      ]
    ),
    [count, count],
    got
  );
};

/**
 * Calls a Lion function from compiled code that is `depth` calls deep. Its
 * body runs right away, in a scope of its parameters inside the scope it
 * closes over, when the call gives it one argument for each parameter, as
 * every function takes as many as it says. A call too deep for the stack
 * starts again at the bottom of it.
 */
export const enter = (
  lambda: Lambda,
  args: readonly unknown[],
  depth: number
): unknown => {
  if (depth >= DEEPEST) {
    return new Called(Effect.suspend(() => toEffect(enter(lambda, args, 0))));
  }
  const { contract, parameters, rest } = lambda;
  if (!rest && args.length !== parameters.length) {
    return new Pending(Effect.fail(refused(lambda, args.length)));
  }
  if (contract !== undefined) {
    return andThen(
      checked(lambda, contract, args, depth),
      depth,
      (values, now) => run(lambda, values as readonly unknown[], now)
    );
  }
  return run(lambda, args, depth);
};

/**
 * Runs a Lion function's body on arguments it takes. A lambda with one name
 * for its parameters runs it on the list of them, once that list is made.
 */
const run = (
  lambda: Lambda,
  args: readonly unknown[],
  depth: number
): unknown =>
  lambda.rest
    ? andThen(argumentList(args), depth, (list, now) =>
        runBody(lambda, [list], now)
      )
    : runBody(lambda, args, depth);

/** Runs a Lion function's body with its parameters bound to the values given. */
const runBody = (
  lambda: Lambda,
  args: readonly unknown[],
  depth: number
): unknown => {
  const { parameters } = lambda;
  const bindings = new Map<string, unknown>();
  for (const [at, parameter] of parameters.entries()) {
    bindings.set(parameter, args[at]);
  }
  predeclare(bindings, lambda.defined);
  const scope: Environment = {
    bindings,
    body: true,
    made: makingScope(),
    parent: lambda.environment,
  };
  lambda.compiled ??= compile(lambda.body, asWritten(scope));
  const result = lambda.compiled(scope, depth + 1);
  if (!(result instanceof Pending) || result instanceof Called) {
    return result;
  }
  const { name } = lambda;
  return new Called(
    name === undefined
      ? result.effect
      : Effect.mapError(result.effect, (error) => leaving(error, name))
  );
};

/**
 * A Lion function over `body`. Without an environment it closes over nothing:
 * its body sees only its parameters. Host code that calls it gets an Effect,
 * which runs the body when it runs. `scope` is the scope the lambda form is
 * written in, which the environment declares unless code `eval` ran has
 * bound more since. With `rest`, its one parameter is bound to the list of
 * every argument, so it takes any number of them.
 */
export const makeLambda = (
  parameters: readonly string[],
  body: LionExpressionType,
  environment?: Environment,
  compiled?: Compiled,
  scope: Scope | undefined = environment,
  contract?: Contract,
  rest = false,
  scoped = false
) => {
  const defined = bodyNames(parameters, body, scope).filter(
    (name) => !parameters.includes(name)
  );
  const lambda: Lambda = {
    body,
    compiled,
    defined,
    contract,
    environment,
    name: undefined,
    parameters,
    rest,
    scope,
  };
  const fn = registerLambda(
    (...args: unknown[]) =>
      Effect.suspend(() => toEffect(enter(lambda, args, 0))),
    {
      parameters,
      body,
      environment,
      ...(scoped ? { scoped: true as const } : {}),
      ...(rest ? { written: parameters[0] as string } : {}),
      ...(contract === undefined ? {} : { written: contract.written }),
    }
  );
  LAMBDAS.set(fn, lambda);
  return counted(fn, rest ? atLeast(0) : parameters.length);
};

/**
 * Makes a lambda that closes over the scope it is made in. Its body is
 * compiled in a scope of its own, which declares its parameters and the
 * names its body defines, inside the scope the form is written in.
 */
export const compileLambda = (
  [_, parameters, body]: typeof LambdaFormSchema.Type,
  scope: Scope | undefined
): Compiled => {
  const names = parameterNames(parameters);
  const compiled = compile(
    body,
    scopeWith(bodyNames(names, body, scope), scope)
  );
  if (typeof parameters === "string") {
    return (environment) =>
      makeLambda(names, body, environment, compiled, scope, undefined, true);
  }
  const schemas = parameterSchemas(parameters);
  if (schemas.every((schema) => schema === undefined)) {
    return (environment) =>
      makeLambda(names, body, environment, compiled, scope);
  }
  // The schemas of the contracts are made where the lambda is, once.
  const made = schemas.map(
    (schema): Compiled =>
      schema === undefined
        ? () => undefined
        : compile(schema as LionExpressionType, scope)
  );
  return (environment, depth) =>
    andThen(runAll(made, environment, depth), depth, (checks) =>
      makeLambda(names, body, environment, compiled, scope, {
        checks: checks as readonly unknown[],
        written: parameters,
      })
    );
};

/** Makes a list of its arguments, as `array/make` does. */
const makeList = listMaker((...items: unknown[]) => items);

// A list that waits is written as the call that makes it again.
nameFunctions({ "array/make": makeList });
readsOnlyArguments({ makeList });

/**
 * The list of a call's arguments, which a lambda with one name for its
 * parameters is given: what `array/make` gives with them, as a list written
 * with the arguments would be. A goal among them is asked, and when one
 * waits for a logic variable, the list is the call of `array/make` that
 * makes it once the variable is bound.
 */
export const argumentList = (args: readonly unknown[]): unknown =>
  applyIn(makeList, args, "array/make", undefined, undefined);

/**
 * A value that holds lambdas, with those lambdas closed: the parts of a list
 * or record, or the arguments of the call that built a function. When a part
 * changed, the value becomes a call that makes it again from the closed
 * parts, so what a rule holds can always be written. So does a function
 * that was built from a logic value, as `func/partial` builds one from a
 * variable: the call that makes it again waits for the variable, where the
 * function would hide it. Data, and anything else that holds no lambda, is
 * kept as it is.
 */
const closeHolder = (value: unknown, closed: Map<unknown, unknown>) => {
  const built = buildOf(value);
  const record = isPlainObject(value) ? value : undefined;
  const parts =
    built?.args ??
    (Array.isArray(value) ? (value as readonly unknown[]) : undefined) ??
    (record === undefined ? undefined : Object.values(record));
  if (parts === undefined) {
    return Effect.succeed(value);
  }
  return Effect.map(
    Effect.forEach(parts, (part) => close(part, closed)),
    (copies): unknown => {
      const waits = built?.args.some((part) => part instanceof LogicValue);
      if (!waits && copies.every((copy, at) => copy === parts[at])) {
        return value;
      }
      if (built !== undefined) {
        return new DeferredCall(built.by, undefined, copies);
      }
      return record === undefined
        ? new DeferredCall(makeList, "array/make", copies)
        : new DeferredCall(recordMaker(Object.keys(record)), undefined, copies);
    }
  );
};

const lambdaFormOf = (info: LambdaInfo): LionExpressionType =>
  ["lambda", info.written ?? info.parameters, info.body] as LionExpressionType;

/** Direct sub-values of a compound holder that may carry a lambda. */
const holderParts = (value: unknown): readonly unknown[] | undefined => {
  const built = buildOf(value);
  if (built !== undefined) {
    return built.args;
  }
  if (Array.isArray(value)) {
    return value;
  }
  return isPlainObject(value) ? Object.values(value) : undefined;
};

/** Collects lambdas with live scopes reachable from `value` without entering them. */
const directLambdas = (
  value: unknown,
  into: Set<unknown>,
  seen: Set<unknown>
) => {
  const info = lambdaInfo(value);
  if (info !== undefined) {
    if (info.environment !== undefined) {
      into.add(value);
    }
    return;
  }
  if (
    (typeof value !== "function" &&
      (typeof value !== "object" || value === null)) ||
    seen.has(value)
  ) {
    return;
  }
  seen.add(value);
  for (const part of holderParts(value) ?? []) {
    directLambdas(part, into, seen);
  }
};

/** Whether `value` contains any member of `targets` through lists, records, or built functions. */
const containsAny = (
  value: unknown,
  targets: ReadonlySet<unknown>,
  seen: Set<unknown>
): boolean => {
  if (targets.has(value)) {
    return true;
  }
  if (
    (typeof value !== "function" &&
      (typeof value !== "object" || value === null)) ||
    seen.has(value)
  ) {
    return false;
  }
  seen.add(value);
  return (holderParts(value) ?? []).some((part) =>
    containsAny(part, targets, seen)
  );
};

interface FreeEntry {
  readonly isQuoted: boolean;
  readonly name: string;
  readonly value: unknown;
}

const freeEntries = (fn: unknown): readonly FreeEntry[] => {
  const info = lambdaInfo(fn) as LambdaInfo;
  const env = info.environment as Environment;
  const scope = lambdaOf(fn)?.scope ?? env;
  return [...references(lambdaFormOf(info))].map(([name, isQuoted]) => ({
    isQuoted,
    name,
    value: valueIn(env, scope, name),
  }));
};

const buildLambdaGraph = (root: unknown) => {
  const edges = new Map<unknown, Set<unknown>>();
  const rev = new Map<unknown, Set<unknown>>();
  const queue: unknown[] = [root];
  for (const node of queue) {
    if (edges.has(node)) {
      continue;
    }
    const next = new Set<unknown>();
    const seen = new Set<unknown>();
    for (const { value } of freeEntries(node)) {
      if (value !== UNBOUND) {
        directLambdas(value, next, seen);
      }
    }
    edges.set(node, next);
    for (const target of next) {
      const back = rev.get(target) ?? new Set<unknown>();
      back.add(node);
      rev.set(target, back);
      if (!edges.has(target)) {
        queue.push(target);
      }
    }
  }
  return { edges, rev };
};

const reverseReachable = (
  root: unknown,
  rev: ReadonlyMap<unknown, ReadonlySet<unknown>>
) => {
  const canReach = new Set<unknown>();
  const backQueue = [...(rev.get(root) ?? [])];
  for (const node of backQueue) {
    if (canReach.has(node)) {
      continue;
    }
    canReach.add(node);
    for (const prev of rev.get(node) ?? []) {
      if (!canReach.has(prev)) {
        backQueue.push(prev);
      }
    }
  }
  return canReach;
};

/**
 * The strongly connected cycle of lambdas containing `root` (starting with
 * `root`), or undefined when `root` cannot reach itself.
 */
const cycleOf = (root: unknown): readonly unknown[] | undefined => {
  const { edges, rev } = buildLambdaGraph(root);
  const canReach = reverseReachable(root, rev);
  return canReach.has(root)
    ? [...edges.keys()].filter((node) => canReach.has(node))
    : undefined;
};

const isReservedSyntax = (name: string) =>
  isSpecialFormName(name) || name === "else";

const freshName = (prefix: string, forbidden: ReadonlySet<string>): string => {
  let index = 0;
  while (forbidden.has(`${prefix}#${index}`)) {
    index += 1;
  }
  return `${prefix}#${index}`;
};

const canReuseName = (
  preferred: string | undefined,
  used: ReadonlySet<string>
): preferred is string =>
  preferred !== undefined &&
  preferred.length > 0 &&
  preferred !== "__proto__" &&
  !isReservedSyntax(preferred) &&
  !isLogicVariableName(preferred) &&
  !preferred.includes("/") &&
  !used.has(preferred);

const pickOwnerName = (
  member: unknown,
  used: ReadonlySet<string>,
  ambiguous: ReadonlySet<string>,
  owner: ReadonlyMap<string, unknown>
): string | undefined => {
  for (const [name, target] of owner) {
    if (target === member && canReuseName(name, used) && !ambiguous.has(name)) {
      return name;
    }
  }
  return undefined;
};

/** Chooses unique lexical `define` names for every lambda in a cycle. */
const pickBinders = (
  cycle: readonly unknown[],
  inCycle: ReadonlySet<unknown>,
  byMember: ReadonlyMap<unknown, readonly FreeEntry[]>
) => {
  const allRefNames = new Set<string>();
  const ambiguous = new Set<string>();
  const owner = new Map<string, unknown>();
  for (const entries of byMember.values()) {
    for (const { name, value } of entries) {
      allRefNames.add(name);
      const isMember = value !== UNBOUND && inCycle.has(value);
      if (!isMember || (owner.has(name) && owner.get(name) !== value)) {
        ambiguous.add(name);
      } else {
        owner.set(name, value);
      }
    }
  }
  const usedBinders = new Set<string>();
  const binder = new Map<unknown, string>();
  for (const member of cycle) {
    const chosen =
      pickOwnerName(member, usedBinders, ambiguous, owner) ??
      freshName("rec", new Set([...usedBinders, ...allRefNames]));
    binder.set(member, chosen);
    usedBinders.add(chosen);
  }
  return { allRefNames, binder, usedBinders };
};

interface CycleState {
  readonly allocateOuter: (preferred: string, closedValue: unknown) => string;
  readonly allRefNames: ReadonlySet<string>;
  readonly binder: ReadonlyMap<unknown, string>;
  readonly closed: Map<unknown, unknown>;
  readonly compoundDefines: LionExpressionType[];
  readonly compoundNames: Set<string>;
  readonly inCycle: ReadonlySet<unknown>;
  readonly outerNames: string[];
  readonly usedBinders: ReadonlySet<string>;
}

/** Rebuilds a compound value that contains a cycle member as a Lion expression. */
const reifyCyclic = (
  value: unknown,
  state: CycleState
): Effect.Effect<LionExpressionType, UnboundNameError> =>
  Effect.gen(function* () {
    if (state.inCycle.has(value)) {
      return state.binder.get(value) as string;
    }
    if (!containsAny(value, state.inCycle, new Set())) {
      const closedVal = yield* close(value, state.closed);
      const pref =
        (typeof value === "function" ? nameOf(value) : undefined) ?? "val";
      return state.allocateOuter(pref, closedVal);
    }
    const built = buildOf(value);
    if (built !== undefined) {
      const byParam = state.allocateOuter(nameOf(built.by) ?? "fn", built.by);
      const args = yield* Effect.forEach(built.args, (arg) =>
        reifyCyclic(arg, state)
      );
      return [byParam, ...args] as LionExpressionType;
    }
    if (Array.isArray(value)) {
      const listParam = state.allocateOuter("array/make", makeList);
      const items = yield* Effect.forEach(value, (item) =>
        reifyCyclic(item, state)
      );
      return [listParam, ...items] as LionExpressionType;
    }
    if (isPlainObject(value)) {
      const entries = yield* Effect.forEach(
        Object.entries(value),
        ([key, item]) =>
          Effect.map(reifyCyclic(item, state), (expr) => [key, expr] as const)
      );
      return Object.fromEntries(entries) as LionExpressionType;
    }
    return state.allocateOuter("val", yield* close(value, state.closed));
  });

const wrapRenames = (
  renames: readonly (readonly [string, string])[],
  body: LionExpressionType
): LionExpressionType =>
  renames.length === 0
    ? body
    : ([
        ["lambda", renames.map(([k]) => k), body],
        ...renames.map(([, v]) => v),
      ] as LionExpressionType);

const recordRename = (
  renames: [string, string][],
  name: string,
  target: string
) => {
  if (target !== name) {
    renames.push([name, target]);
  }
};

const bindCompoundEntry = (
  name: string,
  value: unknown,
  state: CycleState,
  innerRenames: [string, string][]
): Effect.Effect<void, UnboundNameError> =>
  Effect.map(reifyCyclic(value, state), (expr) => {
    const taken = new Set([
      ...state.usedBinders,
      ...state.outerNames,
      ...state.compoundNames,
    ]);
    const valName = canReuseName(name, taken)
      ? name
      : freshName("val", new Set([...taken, ...state.allRefNames]));
    state.compoundNames.add(valName);
    state.compoundDefines.push(["define", valName, expr]);
    recordRename(innerRenames, name, valName);
  });

const bindFreeEntry = (
  entry: FreeEntry,
  info: LambdaInfo,
  state: CycleState,
  outerRenames: [string, string][],
  innerRenames: [string, string][]
): Effect.Effect<void, UnboundNameError> => {
  const { name, isQuoted, value } = entry;
  if (value === UNBOUND) {
    if (!isQuoted && isLogicVariableName(name)) {
      const param = state.allocateOuter(name, new LogicVariable(name.slice(1)));
      recordRename(outerRenames, name, param);
      return Effect.void;
    }
    return !isQuoted && isNamespacedName(name)
      ? Effect.asVoid(nameOrString(info.environment as Environment, name))
      : Effect.void;
  }
  if (state.inCycle.has(value)) {
    recordRename(innerRenames, name, state.binder.get(value) as string);
    return Effect.void;
  }
  if (containsAny(value, state.inCycle, new Set())) {
    return bindCompoundEntry(name, value, state, innerRenames);
  }
  return Effect.map(close(value, state.closed), (closedVal) => {
    recordRename(outerRenames, name, state.allocateOuter(name, closedVal));
  });
};

/** Builds the `["define", name, lambda]` form for one lambda in a cycle. */
const defineMember = (
  member: unknown,
  entries: readonly FreeEntry[],
  state: CycleState
): Effect.Effect<LionExpressionType, UnboundNameError> =>
  Effect.gen(function* () {
    const info = lambdaInfo(member) as LambdaInfo;
    const outerRenames: [string, string][] = [];
    const innerRenames: [string, string][] = [];
    for (const entry of entries) {
      yield* bindFreeEntry(entry, info, state, outerRenames, innerRenames);
    }
    const bodyExpr = wrapRenames(innerRenames, info.body as LionExpressionType);
    const lambdaExpr = [
      "lambda",
      info.written ?? info.parameters,
      bodyExpr,
    ] as LionExpressionType;
    return [
      "define",
      state.binder.get(member) as string,
      wrapRenames(outerRenames, lambdaExpr),
    ] as LionExpressionType;
  });

/**
 * Closes a recursive or mutually recursive cycle of lambdas into one
 * self-contained waiting block: `[["lambda", outerNames, ["begin", ["define",
 * f, ...], ..., f]], ...outerValues]`. Each lambda's `define` is lexically
 * scoped inside the block, so snapshots, rule keys, and retraction all work.
 */
const closeCycle = (
  cycle: readonly unknown[],
  closed: Map<unknown, unknown>
): Effect.Effect<unknown, UnboundNameError> =>
  Effect.gen(function* () {
    const inCycle = new Set(cycle);
    const byMember = new Map(
      cycle.map((member) => [member, freeEntries(member)])
    );
    const { allRefNames, binder, usedBinders } = pickBinders(
      cycle,
      inCycle,
      byMember
    );
    const outerNames: string[] = [];
    const outerValues: unknown[] = [];
    const allocateOuter = (preferred: string, closedValue: unknown): string => {
      const at = outerNames.indexOf(preferred);
      if (at >= 0 && sameValue(outerValues[at], closedValue)) {
        return preferred;
      }
      if (
        at < 0 &&
        preferred.length > 0 &&
        preferred !== "__proto__" &&
        !usedBinders.has(preferred) &&
        !isReservedSyntax(preferred)
      ) {
        outerNames.push(preferred);
        outerValues.push(closedValue);
        return preferred;
      }
      const chosen = freshName(
        "env",
        new Set([...usedBinders, ...allRefNames, ...outerNames])
      );
      outerNames.push(chosen);
      outerValues.push(closedValue);
      return chosen;
    };
    const state: CycleState = {
      allRefNames,
      allocateOuter,
      binder,
      closed,
      compoundDefines: [],
      compoundNames: new Set(),
      inCycle,
      outerNames,
      usedBinders,
    };
    const memberDefines = yield* Effect.forEach(cycle, (member) =>
      defineMember(member, byMember.get(member) ?? [], state)
    );
    const block = [
      "begin",
      ...memberDefines,
      ...state.compoundDefines,
      binder.get(cycle[0]) as string,
    ] as LionExpressionType;
    const result = new DeferredCall(
      makeLambda(
        outerNames,
        block,
        undefined,
        undefined,
        undefined,
        undefined,
        false,
        true
      ),
      "lambda",
      outerValues
    );
    closed.set(cycle[0], result);
    return result;
  });

/**
 * A lambda that closes over a scope becomes a waiting copy of itself, closed
 * over the values its names have now, and so does a lambda inside a value
 * that holds it. Recursive and mutually recursive lambdas close together as a
 * self-contained lexically scoped `begin` block.
 */
const close = (
  value: unknown,
  closed: Map<unknown, unknown>
): Effect.Effect<unknown, UnboundNameError> => {
  if (closed.has(value)) {
    return Effect.succeed(closed.get(value));
  }
  const info = lambdaInfo(value);
  if (info === undefined) {
    return closeHolder(value, closed);
  }
  if (info.environment === undefined) {
    return Effect.succeed(value);
  }
  const cycle = cycleOf(value);
  if (cycle !== undefined) {
    return closeCycle(cycle, closed);
  }
  closed.set(value, value);
  const lambda = lambdaOf(value);
  return suspendIn(
    lambdaFormOf(info),
    info.environment,
    closed,
    (environment) =>
      makeLambda(
        info.parameters,
        info.body as LionExpressionType,
        environment,
        lambda?.compiled,
        environment,
        lambda?.contract,
        // One name written for the parameters takes every argument.
        typeof info.written === "string"
      ),
    lambda?.scope
  ).pipe(Effect.tap((copy) => Effect.sync(() => closed.set(value, copy))));
};

/**
 * The value of a name a form reads where it is written, as its compiled
 * code reads it: a `?name`'s value wherever the form is written, as when a
 * form that waited runs with the variable bound and waits again, and any
 * other name's value when the scope the form is written in declares it.
 */
const valueIn = (
  environment: Environment,
  scope: Scope | undefined,
  name: string
) =>
  scope === undefined || readsAsName(scope, name)
    ? lookup(environment, name)
    : UNBOUND;

const suspendIn = (
  form: LionExpressionType,
  environment: Environment,
  closed: Map<unknown, unknown>,
  compiled?: Compiled,
  scope: Scope | undefined = environment
) =>
  Effect.gen(function* () {
    const names: string[] = [];
    const values: unknown[] = [];
    for (const [name, quoted] of references(form)) {
      const binding = valueIn(environment, scope, name);
      if (binding !== UNBOUND) {
        names.push(name);
        values.push(yield* close(binding, closed));
      } else if (!quoted && isLogicVariableName(name)) {
        names.push(name);
        values.push(new LogicVariable(name.slice(1)));
      } else if (!quoted && isNamespacedName(name)) {
        // The form would fail on the name when it runs, where less is in
        // reach to say what it might have meant.
        yield* nameOrString(environment, name);
      }
    }
    return new DeferredCall(
      makeLambda(names, form, undefined, compiled),
      "lambda",
      values
    );
  });

/**
 * The strings a form uses as data: those it mentions outside `quote` that
 * nothing is bound to, and that are not logic variables or the names of
 * special forms.
 */
export const dataStrings = (
  form: LionExpressionType,
  environment: Environment,
  scope: Scope | undefined = environment
) => {
  const strings: string[] = [];
  for (const [name, quoted] of references(form)) {
    const isName =
      quoted || isLogicVariableName(name) || isSpecialFormName(name);
    if (!isName && valueIn(environment, scope, name) === UNBOUND) {
      strings.push(name);
    }
  }
  return strings;
};

/**
 * Makes a form wait for the logic variables it mentions. The result is a
 * call to a lambda that holds the form and takes the value of every name the
 * form mentions that `scope`, the scope it is written in, declares, so the
 * form runs later as it would run now, once the engine has bound those
 * variables. `compiled` is the form compiled, when the caller has it.
 */
export const suspend = (
  form: LionExpressionType,
  environment: Environment,
  compiled?: Compiled,
  scope: Scope | undefined = environment
) => suspendIn(form, environment, new Map(), compiled, scope);

/** The arguments of a call that waits: lambdas among them become copies. */
export const suspendArguments = (args: readonly unknown[]) => {
  const closed = new Map<unknown, unknown>();
  return Effect.forEach(args, (arg) => close(arg, closed));
};

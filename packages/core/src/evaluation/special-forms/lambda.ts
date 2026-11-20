import { Effect } from "effect";
import {
  counted,
  leaving,
  type UnboundNameError,
  wrongCount,
} from "@/errors/evaluation";
import { nameOrString, readsAsName } from "@/evaluation/base-forms/primitive";
import {
  type Compiled,
  DEEPEST,
  Pending,
  toEffect,
} from "@/evaluation/compiled";
import {
  asWritten,
  type Environment,
  lookup,
  predeclare,
  type Scope,
  scopeWith,
  UNBOUND,
} from "@/evaluation/environment";
import { compile } from "@/evaluation/evaluate";
import { bodyNames } from "@/evaluation/hoisting";
import {
  buildOf,
  DeferredCall,
  isLogicVariableName,
  isNamespacedName,
  isPlainObject,
  LogicValue,
  LogicVariable,
  lambdaInfo,
  listMaker,
  nameFunctions,
  readsOnlyArguments,
  recordMaker,
  registerLambda,
} from "@/logic/terms";
import { isSpecialFormName, type LambdaFormSchema } from "@/schemas/evaluation";
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
  if (!quoted && head === "lambda" && Array.isArray(parameters)) {
    // A lambda's parameters shadow the names around it.
    for (const [name, isQuoted] of references(body)) {
      if (!parameters.includes(name)) {
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
  /** The names its body defines, which a call declares from its start. */
  readonly defined: readonly string[];
  readonly environment: Environment | undefined;
  /** The name the `define` that bound it gave it, for its failures. */
  name: string | undefined;
  readonly parameters: readonly string[];
  /** The scope its form is written in, which settles what its strings mean. */
  readonly scope: Scope | undefined;
}

const LAMBDAS = new WeakMap<object, Lambda>();

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
    JSON.stringify(lambda.name ?? ["lambda", lambda.parameters, lambda.body]),
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
  const { parameters } = lambda;
  if (args.length !== parameters.length) {
    return new Pending(Effect.fail(refused(lambda, args.length)));
  }
  const bindings = new Map<string, unknown>();
  for (const [at, parameter] of parameters.entries()) {
    bindings.set(parameter, args[at]);
  }
  predeclare(bindings, lambda.defined);
  const scope: Environment = {
    bindings,
    body: true,
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
 * bound more since.
 */
export const makeLambda = (
  parameters: readonly string[],
  body: LionExpressionType,
  environment?: Environment,
  compiled?: Compiled,
  scope: Scope | undefined = environment
) => {
  const defined = bodyNames(parameters, body, scope).filter(
    (name) => !parameters.includes(name)
  );
  const lambda: Lambda = {
    body,
    compiled,
    defined,
    environment,
    name: undefined,
    parameters,
    scope,
  };
  const fn = registerLambda(
    (...args: unknown[]) =>
      Effect.suspend(() => toEffect(enter(lambda, args, 0))),
    { parameters, body, environment }
  );
  LAMBDAS.set(fn, lambda);
  return counted(fn, parameters.length);
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
  const compiled = compile(
    body,
    scopeWith(bodyNames(parameters, body, scope), scope)
  );
  return (environment) =>
    makeLambda(parameters, body, environment, compiled, scope);
};

/** Makes a list of its arguments, as `array/make` does. */
const makeList = listMaker((...items: unknown[]) => items);

// A list that waits is written as the call that makes it again.
nameFunctions({ "array/make": makeList });
readsOnlyArguments({ makeList });

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

/**
 * A lambda that closes over a scope becomes a waiting copy of itself, closed
 * over the values its names have now, and so does a lambda inside a value
 * that holds it. `closed` holds the copies made so far; a lambda that
 * reaches itself again is kept as it is.
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
  closed.set(value, value);
  const lambda = lambdaOf(value);
  return suspendIn(
    ["lambda", info.parameters, info.body] as LionExpressionType,
    info.environment,
    closed,
    (environment) =>
      makeLambda(
        info.parameters,
        info.body as LionExpressionType,
        environment,
        lambda?.compiled
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

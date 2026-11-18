import { Effect } from "effect";
import {
  ArgumentMismatchError,
  type UnboundNameError,
} from "@/errors/evaluation";
import { nameOrString } from "@/evaluation/base-forms/primitive";
import {
  type Compiled,
  DEEPEST,
  Pending,
  toEffect,
} from "@/evaluation/compiled";
import { type Environment, lookup, UNBOUND } from "@/evaluation/environment";
import { compile } from "@/evaluation/evaluate";
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
  readonly environment: Environment | undefined;
  readonly parameters: readonly string[];
}

const LAMBDAS = new WeakMap<object, Lambda>();

/** The compiled form of a Lion function, when a value is one. */
export const lambdaOf = (value: unknown): Lambda | undefined =>
  typeof value === "function" ? LAMBDAS.get(value) : undefined;

/**
 * Calls a Lion function from compiled code that is `depth` calls deep. Its
 * body runs right away, in a scope of its parameters inside the scope it
 * closes over. A call too deep for the stack starts again at the bottom of
 * it.
 */
export const enter = (
  lambda: Lambda,
  args: readonly unknown[],
  depth: number
): unknown => {
  if (depth >= DEEPEST) {
    return new Pending(Effect.suspend(() => toEffect(enter(lambda, args, 0))));
  }
  const { parameters } = lambda;
  if (args.length < parameters.length) {
    return new Pending(Effect.fail(new ArgumentMismatchError()));
  }
  const bindings = new Map<string, unknown>();
  for (const [at, parameter] of parameters.entries()) {
    bindings.set(parameter, args[at]);
  }
  lambda.compiled ??= compile(lambda.body);
  return lambda.compiled({ bindings, parent: lambda.environment }, depth + 1);
};

/**
 * A Lion function over `body`. Without an environment it closes over nothing:
 * its body sees only its parameters. Host code that calls it gets an Effect,
 * which runs the body when it runs.
 */
export const makeLambda = (
  parameters: readonly string[],
  body: LionExpressionType,
  environment?: Environment,
  compiled?: Compiled
) => {
  const lambda: Lambda = { body, compiled, environment, parameters };
  const fn = registerLambda(
    (...args: unknown[]) =>
      Effect.suspend(() => toEffect(enter(lambda, args, 0))),
    { parameters, body, environment }
  );
  LAMBDAS.set(fn, lambda);
  return fn;
};

/** Makes a lambda that closes over the scope it is made in. */
export const compileLambda = ([
  _,
  parameters,
  body,
]: typeof LambdaFormSchema.Type): Compiled => {
  const compiled = compile(body);
  return (environment) => makeLambda(parameters, body, environment, compiled);
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
  const body = lambdaOf(value)?.compiled;
  return suspendIn(
    ["lambda", info.parameters, info.body] as LionExpressionType,
    info.environment,
    closed,
    (environment) =>
      makeLambda(
        info.parameters,
        info.body as LionExpressionType,
        environment,
        body
      )
  ).pipe(Effect.tap((copy) => Effect.sync(() => closed.set(value, copy))));
};

const suspendIn = (
  form: LionExpressionType,
  environment: Environment,
  closed: Map<unknown, unknown>,
  compiled?: Compiled
) =>
  Effect.gen(function* () {
    const names: string[] = [];
    const values: unknown[] = [];
    for (const [name, quoted] of references(form)) {
      const binding = lookup(environment, name);
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
  environment: Environment
) => {
  const strings: string[] = [];
  for (const [name, quoted] of references(form)) {
    const isName =
      quoted || isLogicVariableName(name) || isSpecialFormName(name);
    if (!isName && lookup(environment, name) === UNBOUND) {
      strings.push(name);
    }
  }
  return strings;
};

/**
 * Makes a form wait for the logic variables it mentions. The result is a
 * call to a lambda that holds the form and takes the value of every name the
 * form mentions in `environment`, so the form runs later as it would run
 * now, once the engine has bound those variables. `compiled` is the form
 * compiled, when the caller has it.
 */
export const suspend = (
  form: LionExpressionType,
  environment: Environment,
  compiled?: Compiled
) => suspendIn(form, environment, new Map(), compiled);

/** The arguments of a call that waits: lambdas among them become copies. */
export const suspendArguments = (args: readonly unknown[]) => {
  const closed = new Map<unknown, unknown>();
  return Effect.forEach(args, (arg) => close(arg, closed));
};

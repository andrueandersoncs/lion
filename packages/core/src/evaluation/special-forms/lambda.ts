import { Array as Arr, Effect, Option, Record } from "effect";
import {
  ArgumentMismatchError,
  type UnboundNameError,
} from "@/errors/evaluation";
import { nameOrString } from "@/evaluation/base-forms/primitive";
import { getBinding, makeEnvironment } from "@/evaluation/environment";
import { evaluate } from "@/evaluation/evaluate";
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
import type { Environment } from "@/schemas/environment";
import { isSpecialFormName, type LambdaFormSchema } from "@/schemas/evaluation";
import type { LionExpressionType } from "@/schemas/lion-expression";
import { LionEnvironmentService } from "@/services/evaluation";

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
 * A Lion function over `body`. Without an environment it closes over nothing:
 * its body sees only its parameters.
 */
export const makeLambda = (
  parameters: readonly string[],
  body: LionExpressionType,
  environment?: Environment
) =>
  registerLambda(
    Effect.fn(function* (...args: unknown[]) {
      if (args.length < parameters.length) {
        return yield* new ArgumentMismatchError();
      }
      const frame = Record.fromEntries(Arr.zip(parameters, args));
      const scope = yield* environment === undefined
        ? makeEnvironment(frame)
        : makeEnvironment(frame, environment);
      return yield* evaluate(body).pipe(
        Effect.provideService(LionEnvironmentService, scope)
      );
    }),
    { parameters, body, environment }
  );

export const evaluateLambda = ([
  _,
  parameters,
  bodyExpression,
]: typeof LambdaFormSchema.Type) =>
  Effect.map(LionEnvironmentService, (environment) =>
    makeLambda(parameters, bodyExpression, environment)
  );

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
  return suspendIn(
    ["lambda", info.parameters, info.body] as LionExpressionType,
    info.environment,
    closed
  ).pipe(Effect.tap((copy) => Effect.sync(() => closed.set(value, copy))));
};

const suspendIn = (
  form: LionExpressionType,
  environment: Environment,
  closed: Map<unknown, unknown>
) =>
  Effect.gen(function* () {
    const names: string[] = [];
    const values: unknown[] = [];
    for (const [name, quoted] of references(form)) {
      const binding = yield* getBinding(environment, name);
      if (Option.isSome(binding)) {
        names.push(name);
        values.push(yield* close(binding.value, closed));
      } else if (!quoted && isLogicVariableName(name)) {
        names.push(name);
        values.push(new LogicVariable(name.slice(1)));
      } else if (!quoted && isNamespacedName(name)) {
        // The form would fail on the name when it runs, where less is in
        // reach to say what it might have meant.
        yield* nameOrString(environment, name);
      }
    }
    return new DeferredCall(makeLambda(names, form), "lambda", values);
  });

/**
 * The strings a form uses as data: those it mentions outside `quote` that
 * nothing is bound to, and that are not logic variables or the names of
 * special forms.
 */
export const dataStrings = (form: LionExpressionType) =>
  Effect.gen(function* () {
    const environment = yield* LionEnvironmentService;
    const strings: string[] = [];
    for (const [name, quoted] of references(form)) {
      const isName =
        quoted || isLogicVariableName(name) || isSpecialFormName(name);
      if (!isName && Option.isNone(yield* getBinding(environment, name))) {
        strings.push(name);
      }
    }
    return strings;
  });

/**
 * Makes a form wait for the logic variables it mentions. The result is a
 * call to a lambda that holds the form and takes the value of every name the
 * form mentions, so the form runs later as it would run now, once the engine
 * has bound those variables.
 */
export const suspend = (form: LionExpressionType) =>
  Effect.flatMap(LionEnvironmentService, (environment) =>
    suspendIn(form, environment, new Map())
  );

/** The arguments of a call that waits: lambdas among them become copies. */
export const suspendArguments = (args: readonly unknown[]) => {
  const closed = new Map<unknown, unknown>();
  return Effect.forEach(args, (arg) => close(arg, closed));
};

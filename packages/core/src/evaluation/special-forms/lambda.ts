import { Array as Arr, Effect, Option, Record } from "effect";
import { ArgumentMismatchError } from "@/errors/evaluation";
import { getBinding, makeEnvironment } from "@/evaluation/environment";
import { evaluate } from "@/evaluation/evaluate";
import {
  DeferredCall,
  isLogicVariableName,
  LogicVariable,
  lambdaInfo,
  registerLambda,
} from "@/logic/terms";
import type { Environment } from "@/schemas/environment";
import type { LambdaFormSchema } from "@/schemas/evaluation";
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

/**
 * A lambda that closes over a scope becomes a waiting copy of itself, closed
 * over the values its names have now. `closed` holds the copies made so far;
 * a lambda that reaches itself again is kept as it is.
 */
const close = (
  value: unknown,
  closed: Map<unknown, unknown>
): Effect.Effect<unknown> => {
  const info = lambdaInfo(value);
  if (info?.environment === undefined || closed.has(value)) {
    return Effect.succeed(closed.get(value) ?? value);
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
      }
    }
    return new DeferredCall(makeLambda(names, form), "lambda", values);
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

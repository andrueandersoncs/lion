import { Effect, Option, pipe, Record, Ref } from "effect";
import { isWaiting, lambdaInfo } from "@/logic/terms";
import type {
  Environment,
  InnerEnvironment,
  ToplevelEnvironment,
} from "@/schemas/environment";

const isInnerEnvironment = (
  environment: Environment
): environment is InnerEnvironment => "parent" in environment;

/** Scopes that have bound a value that can produce a logic term. */
const SYMBOLIC = new WeakSet<Environment>();

const closesOverLogic = (environment: Environment): boolean =>
  SYMBOLIC.has(environment) ||
  (isInnerEnvironment(environment) && closesOverLogic(environment.parent));

/**
 * True for a value that can produce a logic term: a logic term itself, or a
 * lambda that names a logic variable or closes over a scope that holds one.
 */
export const isSymbolic = (value: unknown): boolean => {
  const info = lambdaInfo(value);
  if (info === undefined) {
    return isWaiting(value);
  }
  return (
    info.symbolic ||
    (info.environment !== undefined && closesOverLogic(info.environment))
  );
};

export function makeEnvironment(
  bindings: Record<string, unknown>
): Effect.Effect<ToplevelEnvironment>;

export function makeEnvironment(
  bindings: Record<string, unknown>,
  parent: Environment
): Effect.Effect<InnerEnvironment>;

export function makeEnvironment(
  bindings: Record<string, unknown>,
  parent?: Environment
) {
  return Ref.make(bindings).pipe(
    Effect.map((bindingsRef) => {
      const environment: Environment =
        typeof parent === "undefined"
          ? { bindingsRef }
          : { bindingsRef, parent };
      if (Object.values(bindings).some(isSymbolic)) {
        SYMBOLIC.add(environment);
      }
      return environment;
    })
  );
}

export const getBinding = (
  environment: Environment,
  name: string
): Effect.Effect<Option.Option<unknown>> =>
  Effect.gen(function* () {
    const binding = yield* pipe(
      Ref.get(environment.bindingsRef),
      Effect.map(Record.get(name))
    );
    if (Option.isSome(binding)) {
      return binding;
    }
    return isInnerEnvironment(environment)
      ? yield* getBinding(environment.parent, name)
      : Option.none();
  });

export const setLocalBinding = (
  environment: Environment,
  name: string,
  value: unknown
): Effect.Effect<Environment> =>
  pipe(
    environment.bindingsRef,
    Ref.update(Record.set(name, value)),
    Effect.as(environment)
  );

export const setGlobalBinding = (
  environment: Environment,
  name: string,
  value: unknown
): Effect.Effect<Environment> => {
  if (isInnerEnvironment(environment)) {
    return setGlobalBinding(environment.parent, name, value).pipe(
      Effect.as(environment)
    );
  }
  if (isSymbolic(value)) {
    SYMBOLIC.add(environment);
  }
  return Ref.update(environment.bindingsRef, Record.set(name, value)).pipe(
    Effect.as(environment)
  );
};

/** Every name bound in the environment or its parents. */
export const boundNames = (
  environment: Environment
): Effect.Effect<ReadonlySet<string>> =>
  Effect.gen(function* () {
    const names = new Set(Object.keys(yield* Ref.get(environment.bindingsRef)));
    if (isInnerEnvironment(environment)) {
      for (const name of yield* boundNames(environment.parent)) {
        names.add(name);
      }
    }
    return names;
  });

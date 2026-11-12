import { Effect, Option, pipe, Record, Ref } from "effect";
import type {
  Environment,
  InnerEnvironment,
  ToplevelEnvironment,
} from "@/schemas/environment";

const isInnerEnvironment = (
  environment: Environment
): environment is InnerEnvironment => "parent" in environment;

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
    Effect.map(
      (bindingsRef): Environment =>
        typeof parent === "undefined"
          ? { bindingsRef }
          : { bindingsRef, parent }
    )
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
): Effect.Effect<Environment> =>
  isInnerEnvironment(environment)
    ? setGlobalBinding(environment.parent, name, value).pipe(
        Effect.as(environment)
      )
    : Ref.update(environment.bindingsRef, Record.set(name, value)).pipe(
        Effect.as(environment)
      );

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

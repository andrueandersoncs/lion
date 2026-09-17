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
    Effect.map((bindingsRef) =>
      typeof parent === "undefined"
        ? ({ bindingsRef } as ToplevelEnvironment)
        : ({ bindingsRef, parent } as InnerEnvironment)
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
): Effect.Effect<Environment> => {
  const update = isInnerEnvironment(environment)
    ? setGlobalBinding(environment.parent, name, value)
    : Ref.update(environment.bindingsRef, Record.set(name, value));
  return update.pipe(Effect.as(environment));
};

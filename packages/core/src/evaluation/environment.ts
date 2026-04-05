import { Effect, Option, Record, Ref, Schema } from "effect";
import {
  type Environment,
  type InnerEnvironment,
  InnerEnvironmentSchema,
  type ToplevelEnvironment,
} from "@/schemas/environment";

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
    const bindings = yield* Ref.get(environment.bindingsRef);
    const binding = Record.get(bindings, name);

    if (
      Option.isSome(binding) ||
      !Schema.is(InnerEnvironmentSchema)(environment)
    ) {
      return binding;
    }

    return yield* getBinding(environment.parent, name);
  });

export const setLocalBinding = (
  environment: Environment,
  name: string,
  value: unknown
): Effect.Effect<Environment> =>
  Ref.update(environment.bindingsRef, (bindings) => ({
    ...bindings,
    [name]: value,
  })).pipe(Effect.as(environment));

export const setGlobalBinding = (
  environment: Environment,
  name: string,
  value: unknown
): Effect.Effect<Environment> =>
  Effect.gen(function* () {
    if (Schema.is(InnerEnvironmentSchema)(environment)) {
      yield* setGlobalBinding(environment.parent, name, value);
      return environment;
    }

    yield* Ref.update(environment.bindingsRef, (bindings) => ({
      ...bindings,
      [name]: value,
    }));
    return environment;
  });

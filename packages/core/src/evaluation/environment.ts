import { Effect, Match, Option, pipe, Record, Ref, Schema } from "effect";
import {
  type Environment,
  type InnerEnvironment,
  InnerEnvironmentSchema,
  type ToplevelEnvironment,
  ToplevelEnvironmentSchema,
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
  pipe(
    Match.value(environment),
    Match.when(Schema.is(InnerEnvironmentSchema), ({ bindingsRef, parent }) =>
      pipe(
        Ref.get(bindingsRef),
        Effect.map(Record.get(name)),
        Effect.flatMap(
          Option.match({
            onSome: (binding) => Effect.succeed(Option.some(binding)),
            onNone: () => getBinding(parent, name),
          })
        )
      )
    ),
    Match.when(Schema.is(ToplevelEnvironmentSchema), ({ bindingsRef }) =>
      pipe(Ref.get(bindingsRef), Effect.map(Record.get(name)))
    ),
    Match.exhaustive
  );

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
  pipe(
    Match.value(environment),
    Match.when(Schema.is(InnerEnvironmentSchema), ({ parent }) =>
      setGlobalBinding(parent, name, value)
    ),
    Match.when(Schema.is(ToplevelEnvironmentSchema), ({ bindingsRef }) =>
      Ref.update(bindingsRef, Record.set(name, value))
    ),
    Match.exhaustive,
    Effect.map(() => environment)
  );

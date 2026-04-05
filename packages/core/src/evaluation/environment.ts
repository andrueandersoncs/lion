import { Match, Option, pipe, Record, Schema } from "effect";
import {
  type Environment,
  type InnerEnvironment,
  InnerEnvironmentSchema,
  type ToplevelEnvironment,
  ToplevelEnvironmentSchema,
} from "@/schemas/environment";

export function makeEnvironment(
  bindings: Record<string, unknown>
): typeof ToplevelEnvironmentSchema.Type;

export function makeEnvironment(
  bindings: Record<string, unknown>,
  parent: Environment
): typeof InnerEnvironmentSchema.Type;

export function makeEnvironment(
  bindings: Record<string, unknown>,
  parent?: Environment
) {
  return typeof parent === "undefined"
    ? ({ bindings } as ToplevelEnvironment)
    : ({ bindings, parent } as InnerEnvironment);
}

export const getBinding = (
  environment: Environment,
  name: string
): Option.Option<unknown> =>
  pipe(
    Record.get(environment.bindings, name),
    Option.orElse(() =>
      pipe(
        Match.value(environment),
        Match.when(Schema.is(InnerEnvironmentSchema), ({ parent }) =>
          getBinding(parent, name)
        ),
        Match.when(Schema.is(ToplevelEnvironmentSchema), () => Option.none()),
        Match.exhaustive
      )
    )
  );

export const setLocalBinding = (
  environment: Environment,
  name: string,
  value: unknown
): Environment =>
  pipe(
    Match.value(environment),
    Match.when(Schema.is(InnerEnvironmentSchema), ({ bindings, parent }) =>
      makeEnvironment({ ...bindings, [name]: value }, parent)
    ),
    Match.when(Schema.is(ToplevelEnvironmentSchema), ({ bindings }) =>
      makeEnvironment({ ...bindings, [name]: value })
    ),
    Match.exhaustive
  );

export const setGlobalBinding = (
  environment: Environment,
  name: string,
  value: unknown
): Environment =>
  pipe(
    Match.value(environment),
    Match.when(Schema.is(InnerEnvironmentSchema), ({ bindings, parent }) =>
      makeEnvironment(bindings, setGlobalBinding(parent, name, value))
    ),
    Match.when(Schema.is(ToplevelEnvironmentSchema), ({ bindings }) =>
      makeEnvironment({ ...bindings, [name]: value })
    ),
    Match.exhaustive
  );

export const getGlobalEnvironment = (
  environment: Environment
): ToplevelEnvironment =>
  pipe(
    Match.value(environment),
    Match.when(Schema.is(InnerEnvironmentSchema), ({ parent }) =>
      getGlobalEnvironment(parent)
    ),
    Match.when(
      Schema.is(ToplevelEnvironmentSchema),
      (environment) => environment
    ),
    Match.exhaustive
  );

export const replaceGlobalEnvironment = (
  environment: Environment,
  globalEnvironment: ToplevelEnvironment
): Environment =>
  pipe(
    Match.value(environment),
    Match.when(Schema.is(InnerEnvironmentSchema), ({ bindings, parent }) =>
      makeEnvironment(
        bindings,
        replaceGlobalEnvironment(parent, globalEnvironment)
      )
    ),
    Match.when(Schema.is(ToplevelEnvironmentSchema), () => globalEnvironment),
    Match.exhaustive
  );

import { Schema } from "effect";

export const ToplevelEnvironmentSchema = Schema.Struct({
  bindings: Schema.Record({
    key: Schema.String,
    value: Schema.Unknown,
  }),
});

export type ToplevelEnvironment = typeof ToplevelEnvironmentSchema.Type;

export interface InnerEnvironment {
  readonly bindings: Record<string, unknown>;
  readonly parent: Environment;
}

export type Environment = ToplevelEnvironment | InnerEnvironment;

export const EnvironmentSchema = Schema.Union(
  ToplevelEnvironmentSchema,
  Schema.suspend((): Schema.Schema<InnerEnvironment> => InnerEnvironmentSchema)
);

export const InnerEnvironmentSchema = Schema.Struct({
  bindings: Schema.Record({
    key: Schema.String,
    value: Schema.Unknown,
  }),
  parent: EnvironmentSchema,
});

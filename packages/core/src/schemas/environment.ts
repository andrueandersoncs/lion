import { Ref, Schema } from "effect";

type BindingsRef = Ref.Ref<Record<string, unknown>>;

const isBindingsRef = (input: unknown): input is BindingsRef =>
  typeof input === "object" && input !== null && Ref.RefTypeId in input;

const BindingsSchema: Schema.Schema<BindingsRef> =
  Schema.declare<BindingsRef>(isBindingsRef);

export interface InnerEnvironment {
  readonly bindingsRef: BindingsRef;
  readonly parent: Environment;
}

export type Environment = typeof EnvironmentSchema.Type;

export type ToplevelEnvironment = typeof ToplevelEnvironmentSchema.Type;

export const ToplevelEnvironmentSchema = Schema.Struct({
  bindingsRef: BindingsSchema,
});

export const EnvironmentSchema = Schema.Union(
  ToplevelEnvironmentSchema,
  Schema.suspend((): Schema.Schema<InnerEnvironment> => InnerEnvironmentSchema)
);

export const InnerEnvironmentSchema = Schema.Struct({
  bindingsRef: BindingsSchema,
  parent: EnvironmentSchema,
});

import { Effect, Schema } from "effect";
import { JsonPrimitiveSchema, type JsonPrimitiveType } from "./json-primitive";
import type { LionEnvironment } from "../evaluate";

type AssumedValueType =
  | JsonPrimitiveType
  | ReadonlyArray<AssumedValueType>
  | { readonly [key: string]: AssumedValueType }
  | LionFunctionValueType;

export type LionFunctionValueType = (
  ...args: unknown[]
) => Effect.Effect<unknown, Error, LionEnvironment>;

export const LionFunctionValueSchema = Schema.declare((input: unknown): input is LionFunctionValueType => {
  return typeof input === "function";
});

export const LionArrayValueSchema = Schema.Array(
  Schema.suspend((): Schema.Schema<AssumedValueType> => LionValueSchema)
);

export type LionArrayValueType = typeof LionArrayValueSchema.Type;

export const LionRecordValueSchema = Schema.Record({
  key: Schema.String,
  value: Schema.suspend((): Schema.Schema<AssumedValueType> => LionValueSchema),
});

export type LionRecordValueType = typeof LionRecordValueSchema.Type;

export const LionValueSchema = Schema.Union(
  JsonPrimitiveSchema,
  LionArrayValueSchema,
  LionRecordValueSchema,
  LionFunctionValueSchema
);

export type LionValueType = typeof LionValueSchema.Type;

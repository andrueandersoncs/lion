import { Schema } from "effect";
import { JsonPrimitiveSchema, type JsonPrimitiveType } from "./json-primitive";

type AssumedValueType =
  | JsonPrimitiveType
  | ReadonlyArray<AssumedValueType>
  | { [key: string]: AssumedValueType }
  | ((...args: unknown[]) => unknown);

const LionFunctionSchema = Schema.declare((input: unknown): input is (...args: unknown[]) => unknown => {
  return typeof input === "function";
});

export const LionValueSchema = Schema.Union(
  JsonPrimitiveSchema,
  Schema.Array(Schema.suspend((): Schema.Schema<AssumedValueType> => LionValueSchema)),
  Schema.Record({ key: Schema.String, value: Schema.suspend((): Schema.Schema<AssumedValueType> => LionValueSchema) }),
  LionFunctionSchema
);

export type LionValueType = typeof LionValueSchema.Type;

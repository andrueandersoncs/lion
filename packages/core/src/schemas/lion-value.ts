import { Schema } from "effect";
import { JsonPrimitiveSchema, type JsonPrimitiveType } from "./json-primitive";

type AssumedValueType =
  | JsonPrimitiveType
  | ReadonlyArray<AssumedValueType>
  | { [key: string]: AssumedValueType }
  | ((...args: AssumedValueType[]) => AssumedValueType);

const LionFunctionValueSchema = Schema.declare(
  (input: unknown): input is (...args: AssumedValueType[]) => AssumedValueType => {
    return typeof input === "function";
  }
);

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

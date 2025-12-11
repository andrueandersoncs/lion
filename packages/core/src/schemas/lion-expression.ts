import { Schema } from "effect";
import { JsonPrimitiveSchema, type JsonPrimitiveType } from "./json-primitive";

type AssumedExpressionType =
  | JsonPrimitiveType
  | ReadonlyArray<AssumedExpressionType>
  | { [key: string]: AssumedExpressionType };

export const LionArraySchema = Schema.Array(
  Schema.suspend((): Schema.Schema<AssumedExpressionType> => LionExpressionSchema)
);

export type LionArrayType = typeof LionArraySchema.Type;

export const LionRecordSchema = Schema.Record({
  key: Schema.String,
  value: Schema.suspend((): Schema.Schema<AssumedExpressionType> => LionExpressionSchema),
});

export type LionRecordType = typeof LionRecordSchema.Type;

export const LionExpressionSchema = Schema.Union(JsonPrimitiveSchema, LionArraySchema, LionRecordSchema);

export type LionExpressionType = typeof LionExpressionSchema.Type;

import { Schema } from "effect";
import { JsonPrimitiveSchema, type JsonPrimitiveType } from "./json-primitive";

type AssumedExpressionType =
  | JsonPrimitiveType
  | ReadonlyArray<AssumedExpressionType>
  | { [key: string]: AssumedExpressionType };

export const LionArrayExpressionSchema = Schema.Array(
  Schema.suspend((): Schema.Schema<AssumedExpressionType> => LionExpressionSchema)
);

export type LionArrayExpressionType = typeof LionArrayExpressionSchema.Type;

export const LionRecordExpressionSchema = Schema.Record({
  key: Schema.String,
  value: Schema.suspend((): Schema.Schema<AssumedExpressionType> => LionExpressionSchema),
});

export type LionRecordExpressionType = typeof LionRecordExpressionSchema.Type;

export const LionExpressionSchema = Schema.Union(
  JsonPrimitiveSchema,
  LionArrayExpressionSchema,
  LionRecordExpressionSchema
);

export type LionExpressionType = typeof LionExpressionSchema.Type;

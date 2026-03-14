import { Schema } from "effect";
import {
  JsonPrimitiveSchema,
  type JsonPrimitiveType,
} from "./json-primitive.ts";

// array
export type AssumedExpressionType =
  | JsonPrimitiveType
  | ReadonlyArray<AssumedExpressionType>
  | { readonly [key: string]: AssumedExpressionType };

export const LionArrayExpressionSchema = Schema.Array(
  Schema.suspend(
    (): Schema.Schema<AssumedExpressionType> => LionExpressionSchema
  )
);

export type LionArrayExpressionType = typeof LionArrayExpressionSchema.Type;

// record
export const LionRecordExpressionSchema = Schema.Record({
  key: Schema.String,
  value: Schema.suspend(
    (): Schema.Schema<AssumedExpressionType> => LionExpressionSchema
  ),
});

export type LionRecordExpressionType = typeof LionRecordExpressionSchema.Type;

// expression
export const LionExpressionSchema = Schema.Union(
  JsonPrimitiveSchema,
  LionArrayExpressionSchema,
  LionRecordExpressionSchema
);

export type LionExpressionType = typeof LionExpressionSchema.Type;

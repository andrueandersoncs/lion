import { Array as Arr, Schema } from "effect";
import {
  JsonPrimitiveSchema,
  type JsonPrimitiveType,
} from "@/schemas/json-primitive.ts";

// array
export type AssumedExpressionType =
  | JsonPrimitiveType
  | readonly AssumedExpressionType[]
  | { readonly [key: string]: AssumedExpressionType };

export const LionArrayExpressionSchema = Schema.Array(
  Schema.suspend(
    (): Schema.Codec<AssumedExpressionType> => LionExpressionSchema
  )
);

export type LionArrayExpressionType = typeof LionArrayExpressionSchema.Type;

const DISALLOWED_KEYS = ["__proto__"] as const;

/** A key a record can hold: any JSON allows, the empty key among them, but __proto__. */
export const RecordKeySchema = Schema.String.pipe(
  Schema.check(Schema.makeFilter((key) => !Arr.contains(DISALLOWED_KEYS, key)))
);

export const LionRecordExpressionSchema = Schema.Record(
  RecordKeySchema,
  Schema.suspend(
    (): Schema.Codec<AssumedExpressionType> => LionExpressionSchema
  )
);

export type LionRecordExpressionType = typeof LionRecordExpressionSchema.Type;

// expression
export const LionExpressionSchema = Schema.Union([
  JsonPrimitiveSchema,
  LionArrayExpressionSchema,
  LionRecordExpressionSchema,
]);

export type LionExpressionType = typeof LionExpressionSchema.Type;

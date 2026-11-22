import { Array as Arr, Effect, Schema } from "effect";
import type { Exact } from "@/numbers/exact";
import {
  JsonPrimitiveSchema,
  type JsonPrimitiveType,
} from "@/schemas/json-primitive.ts";
import { ExactSchema } from "@/schemas/number";

// array
export type AssumedExpressionType =
  | JsonPrimitiveType
  | Exact
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

/**
 * An expression that may hold a number no JavaScript number writes, as the
 * reader gives 2^53 + 1 and arithmetic gives 1/3.
 */
export const ExactExpressionSchema: Schema.Codec<AssumedExpressionType> =
  Schema.Union([
    JsonPrimitiveSchema,
    ExactSchema,
    Schema.Array(Schema.suspend(() => ExactExpressionSchema)),
    Schema.Record(
      RecordKeySchema,
      Schema.suspend(() => ExactExpressionSchema)
    ),
  ]);

const decodePlain = Schema.decodeUnknownEffect(LionExpressionSchema);
const decodeExact = Schema.decodeUnknownEffect(ExactExpressionSchema);

/**
 * Checks that a value is an expression. Most hold no exact number, so they
 * are checked without one, and only a value that fails is checked again
 * with one, so exact numbers cost nothing where there are none.
 */
export const decodeExpression = (value: unknown) =>
  Effect.catch(decodePlain(value), () => decodeExact(value)) as Effect.Effect<
    LionExpressionType,
    Schema.SchemaError
  >;

export type LionExpressionType = typeof LionExpressionSchema.Type | Exact;

import { Schema } from "effect";

export const JsonPrimitiveSchema = Schema.Union(Schema.String, Schema.Number, Schema.Boolean, Schema.Null);

export type JsonPrimitiveType = typeof JsonPrimitiveSchema.Type;

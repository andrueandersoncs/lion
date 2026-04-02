import { Schema } from "effect";

export const decode = <A, B, C>(s: Schema.Schema<A, B, C>) =>
  (u: unknown) => Schema.decodeUnknown(s)(u);

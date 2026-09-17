import { Schema } from "effect";

export const decode =
  <A>(schema: Schema.Decoder<A>) =>
  (input: unknown) =>
    Schema.decodeUnknownEffect(schema)(input);

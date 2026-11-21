import { Schema, SchemaGetter } from "effect";
import { describedAs } from "@/modules/lib/expected";
import { guarded } from "@/modules/lib/guard";
import { Exact, isNumber, ratio } from "@/numbers/exact";

/**
 * A number no JavaScript number writes, such as 1/3. Values for properties
 * are thirds of whole numbers that 3 does not divide, which no decimal
 * writes.
 */
export const ExactSchema = Schema.declare(
  (input: unknown): input is Exact => input instanceof Exact,
  {
    expected: "number",
    toCodecArbitrary: () =>
      Schema.link<Exact>()(Schema.Int, {
        decode: SchemaGetter.transform((n: number) =>
          Exact.of(ratio(3n * BigInt(n) + 1n, 3n))
        ),
        encode: SchemaGetter.forbiddenEncoding,
      }),
  }
);

/** A Lion number: a finite JavaScript number, or an `Exact`. */
export const NumberSchema = describedAs(
  guarded(Schema.Union([Schema.Finite, ExactSchema]), isNumber),
  "a number",
  "numbers"
);

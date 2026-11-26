import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Exit, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import {
  decodeWire,
  encodeWire,
  parseWire,
  stringifyWire,
} from "@/evaluation/wire";
import { sameValue } from "@/logic/terms";
import { safeStdlib } from "@/modules";
import { fromRational, ratio } from "@/numbers/exact";

const numerator = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: -10_000, maximum: 10_000 }))
);
const denominator = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000 }))
);
const bigOffset = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100_000 }))
);
const simpleText = Arbitrary.schema(
  Schema.String.check(Schema.isMaxLength(20))
);

describe("wire JSON codec for exact Lion values", () => {
  it.effect.prop(
    "round-trips every rational fraction losslessly through JSON text",
    { d: denominator, n: numerator },
    ({ d, n }) =>
      Effect.gen(function* () {
        const value = fromRational(ratio(BigInt(n), BigInt(d)));
        const text = stringifyWire(value);
        // Must always be valid standard JSON.
        expect(() => JSON.parse(text)).not.toThrow();
        const decoded = yield* parseWire(text);
        expect(sameValue(decoded, value)).toBe(true);

        // Exact equality holds inside Lion evaluation too.
        const eq = yield* run(
          ["number/equals?", decoded, ["number/divide", n, d]],
          safeStdlib
        );
        expect(eq).toBe(true);
      })
  );

  it.effect.prop(
    "round-trips integers beyond 2^53 without precision loss",
    { offset: bigOffset },
    ({ offset }) =>
      Effect.gen(function* () {
        const huge = fromRational(
          ratio(9_007_199_254_740_992n + BigInt(offset))
        );
        const text = stringifyWire({ id: huge, nested: [huge] });
        const decoded = (yield* parseWire(text)) as {
          readonly id: unknown;
          readonly nested: readonly unknown[];
        };
        expect(sameValue(decoded.id, huge)).toBe(true);
        expect(sameValue(decoded.nested[0], huge)).toBe(true);
      })
  );

  it.effect.prop(
    "preserves user records that happen to contain wire tag keys",
    {
      d: denominator,
      n: numerator,
      text: simpleText,
    },
    ({ d, n, text }) =>
      Effect.gen(function* () {
        const exact = fromRational(ratio(BigInt(n), BigInt(d)));
        const original = {
          escapedCollision: { "$lion/escaped": { inner: text } },
          normal: [1, true, null, text, exact],
          rationalCollision: { "$lion/rational": ["not", "decoded"] },
          wrappedTwice: { "$lion/escaped": { "$lion/rational": [exact] } },
        };
        const viaPlainJson = JSON.parse(JSON.stringify(encodeWire(original)));
        const restored = yield* decodeWire(viaPlainJson);
        expect(sameValue(restored, original)).toBe(true);
      })
  );

  it.effect.prop(
    "rejects zero denominators and malformed rational pairs",
    { n: numerator },
    ({ n }) =>
      Effect.gen(function* () {
        const zeroDen = yield* Effect.exit(
          decodeWire({ "$lion/rational": [String(n), "0"] })
        );
        expect(Exit.isFailure(zeroDen)).toBe(true);

        const badPair = yield* Effect.exit(
          decodeWire({ "$lion/rational": [n, 1] })
        );
        expect(Exit.isFailure(badPair)).toBe(true);

        const badEscape = yield* Effect.exit(
          decodeWire({ "$lion/escaped": [n] })
        );
        expect(Exit.isFailure(badEscape)).toBe(true);
      })
  );
});

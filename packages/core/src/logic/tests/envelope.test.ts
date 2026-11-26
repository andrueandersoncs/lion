import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { LogicDatabase } from "@/logic/database";
import {
  createProofEnvelope,
  generateSigningKeyPair,
  verifyProofEnvelope,
} from "@/logic/envelope";
import { safeStdlib } from "@/modules";

const smallPos = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 }))
);

describe("signed ProofEnvelope and offline verification", () => {
  it.effect.prop(
    "verifies authentic signed proof envelopes and rejects tampered payloads, wrong keys, and forged proofs",
    { bound: smallPos },
    ({ bound }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        const goal = [
          "not",
          [
            "exists",
            ["?x"],
            [
              "and",
              ["schema/fits?", "?x", "value/integer?"],
              ["number/greaterThanOrEqualTo", "?x", bound],
              ["number/lessThan", "?x", bound],
            ],
          ],
        ];
        const proofResult = yield* run(["proof/prove", goal], safeStdlib, {
          database,
        });
        const keyPair = yield* generateSigningKeyPair();
        const otherKeyPair = yield* generateSigningKeyPair();

        const envelope = yield* createProofEnvelope({
          database,
          issuer: "lion-test-issuer",
          keyPair,
          proof: proofResult,
          query: ["proof/prove", goal],
          result: proofResult,
        });

        // Valid signature + valid kernel proof passes.
        const ok = yield* verifyProofEnvelope(envelope, keyPair.publicKeyJwk);
        expect(ok.valid).toBe(true);
        expect(ok.hashValid).toBe(true);
        expect(ok.signatureValid).toBe(true);
        expect(ok.proofValid).toBe(true);

        // Wrong trusted public key fails signature verification.
        const wrongKey = yield* verifyProofEnvelope(
          envelope,
          otherKeyPair.publicKeyJwk
        );
        expect(wrongKey.valid).toBe(false);
        expect(wrongKey.signatureValid).toBe(false);

        // Tampered payload fails hash check.
        const tampered = {
          ...envelope,
          payload: { ...envelope.payload, issuer: "mallory" },
        };
        const tamperedCheck = yield* verifyProofEnvelope(
          tampered,
          keyPair.publicKeyJwk
        );
        expect(tamperedCheck.valid).toBe(false);
        expect(tamperedCheck.hashValid).toBe(false);

        // Forged proof certificate fails kernel check even with a valid signature!
        const forged = yield* createProofEnvelope({
          database,
          issuer: "lion-test-issuer",
          keyPair,
          proof: { check: true, proved: true },
          query: ["proof/prove", goal],
          result: { proved: true },
        });
        const forgedCheck = yield* verifyProofEnvelope(
          forged,
          keyPair.publicKeyJwk
        );
        expect(forgedCheck.valid).toBe(false);
        expect(forgedCheck.signatureValid).toBe(true);
        expect(forgedCheck.proofValid).toBe(false);
      }),
    { arbitrary: { runs: 20 } }
  );
});

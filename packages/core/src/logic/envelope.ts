/**
 * Portable, cryptographically signed Proof & Audit Envelopes for Lion.
 *
 * Uses Web Crypto (`crypto.subtle` SHA-256 + Ed25519 — zero external
 * dependencies, runs in Node, Bun, Cloudflare Workers, and browsers) combined
 * with Lion's small trusted proof kernel (`verifyProof`) so auditors,
 * regulators, or downstream agents can independently verify both:
 * 1. Cryptographic authenticity & tamper-evidence of `{ modelHash, query, result, proof, claim }`, and
 * 2. Mathematical soundness of any attached proof certificate or `why` derivation
 *    without re-running the solver.
 */
import { Effect } from "effect";
import { LogicError } from "@/errors/evaluation";
import { decodeWire, encodeWire } from "@/evaluation/wire";
import type { LogicDatabase } from "@/logic/database";
import { verifyProof } from "@/logic/proof";
import { saveDatabase } from "@/logic/snapshot";

/** Canonical JSON serialization with recursively sorted object keys. */
export const canonicalJson = (value: unknown): string => {
  const encoded = encodeWire(value === undefined ? null : value);
  const sortValue = (item: unknown): unknown => {
    if (Array.isArray(item)) {
      return item.map(sortValue);
    }
    if (typeof item === "object" && item !== null) {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(item).sort()) {
        sorted[key] = sortValue((item as Record<string, unknown>)[key]);
      }
      return sorted;
    }
    return item;
  };
  return JSON.stringify(sortValue(encoded));
};

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const TRAILING_EQUALS = /=+$/;

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(TRAILING_EQUALS, "");
};

const base64UrlToBytes = (text: string): Uint8Array => {
  const padded = text
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(text.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

/** Computes the lowercase hex SHA-256 digest of a UTF-8 string via Web Crypto. */
export const sha256Hex = (text: string): Effect.Effect<string, LogicError> =>
  Effect.tryPromise({
    catch: (error) =>
      new LogicError({
        message: `SHA-256 hashing failed: ${error instanceof Error ? error.message : String(error)}`,
      }),
    try: async () => {
      const digest = await globalThis.crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(text)
      );
      return bytesToHex(new Uint8Array(digest));
    },
  });

/** Portable JSON Web Key representation for an Ed25519 public key. */
export type PublicKeyJwk = Readonly<Record<string, unknown>>;

export interface SigningKeyPair {
  readonly privateKey: CryptoKey;
  readonly publicKey: CryptoKey;
  readonly publicKeyJwk: PublicKeyJwk;
}

/** Generates an Ed25519 key pair for signing Lion proof envelopes. */
export const generateSigningKeyPair = (): Effect.Effect<
  SigningKeyPair,
  LogicError
> =>
  Effect.tryPromise({
    catch: (error) =>
      new LogicError({
        message: `Ed25519 key generation failed: ${error instanceof Error ? error.message : String(error)}`,
      }),
    try: async () => {
      const pair = (await globalThis.crypto.subtle.generateKey(
        { name: "Ed25519" },
        true,
        ["sign", "verify"]
      )) as unknown as CryptoKeyPair;
      const publicKeyJwk = (await globalThis.crypto.subtle.exportKey(
        "jwk",
        pair.publicKey
      )) as unknown as PublicKeyJwk;
      return {
        privateKey: pair.privateKey,
        publicKey: pair.publicKey,
        publicKeyJwk,
      };
    },
  });

export interface EnvelopePayload {
  readonly claim?: unknown;
  readonly issuer?: string;
  readonly meta?: Readonly<Record<string, unknown>>;
  /** SHA-256 hex digest of the canonical snapshot of the database at evaluation time. */
  readonly modelHash: string;
  /** Optional wire-encoded proof certificate, `proof/prove` result, or `why` tree. */
  readonly proof?: unknown;
  readonly query: unknown;
  readonly result: unknown;
  readonly timestampMs: number;
}

export interface ProofEnvelope {
  readonly algorithm: "Ed25519" | "unsigned";
  readonly payload: EnvelopePayload;
  readonly payloadHash: string;
  readonly publicKeyJwk?: PublicKeyJwk;
  readonly signature?: string;
  readonly version: 1;
}

export interface CreateEnvelopeOptions {
  readonly claim?: unknown;
  readonly database: LogicDatabase;
  readonly issuer?: string;
  readonly keyPair?: SigningKeyPair;
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly proof?: unknown;
  readonly query: unknown;
  readonly result: unknown;
  readonly timestampMs?: number;
}

/**
 * Builds (and optionally Ed25519-signs) a tamper-evident `ProofEnvelope`
 * binding the database model hash, query, verdict/result, and proof certificate.
 */
export const createProofEnvelope = (
  options: CreateEnvelopeOptions
): Effect.Effect<ProofEnvelope, LogicError> =>
  Effect.gen(function* () {
    const snapshot = yield* saveDatabase(options.database);
    const modelHash = yield* sha256Hex(canonicalJson(snapshot));
    const payload: EnvelopePayload = {
      ...(options.claim === undefined
        ? {}
        : { claim: encodeWire(options.claim) }),
      ...(options.issuer === undefined ? {} : { issuer: options.issuer }),
      ...(options.meta === undefined ? {} : { meta: options.meta }),
      modelHash,
      ...(options.proof === undefined
        ? {}
        : { proof: encodeWire(options.proof) }),
      query: encodeWire(options.query),
      result: encodeWire(options.result),
      timestampMs: options.timestampMs ?? Date.now(),
    };
    const payloadHash = yield* sha256Hex(canonicalJson(payload));
    const { keyPair } = options;
    if (keyPair === undefined) {
      return {
        algorithm: "unsigned",
        payload,
        payloadHash,
        version: 1,
      };
    }
    const signature = yield* Effect.tryPromise({
      catch: (error) =>
        new LogicError({
          message: `Envelope signing failed: ${error instanceof Error ? error.message : String(error)}`,
        }),
      try: async () => {
        const sig = await globalThis.crypto.subtle.sign(
          "Ed25519",
          keyPair.privateKey,
          new TextEncoder().encode(payloadHash)
        );
        return bytesToBase64Url(new Uint8Array(sig));
      },
    });
    return {
      algorithm: "Ed25519",
      payload,
      payloadHash,
      publicKeyJwk: keyPair.publicKeyJwk,
      signature,
      version: 1,
    };
  });

export interface EnvelopeVerification {
  readonly hashValid: boolean;
  readonly payloadHash: string;
  readonly proofValid: boolean | null;
  readonly reason?: string;
  readonly signatureValid: boolean | null;
  readonly valid: boolean;
}

const verifyEd25519Signature = (
  jwk: PublicKeyJwk | undefined,
  signature: string | undefined,
  payloadHash: string
): Effect.Effect<boolean, LogicError> => {
  if (jwk === undefined || signature === undefined) {
    return Effect.succeed(false);
  }
  return Effect.tryPromise({
    catch: () => new LogicError({ message: "Signature verification failed." }),
    try: async () => {
      try {
        const key = await globalThis.crypto.subtle.importKey(
          "jwk",
          jwk as never,
          { name: "Ed25519" },
          false,
          ["verify"]
        );
        const sigBytes = base64UrlToBytes(signature);
        return await globalThis.crypto.subtle.verify(
          "Ed25519",
          key,
          sigBytes.buffer.slice(
            sigBytes.byteOffset,
            sigBytes.byteOffset + sigBytes.byteLength
          ) as ArrayBuffer,
          new TextEncoder().encode(payloadHash)
        );
      } catch {
        return false;
      }
    },
  });
};

const verificationReason = (
  hashValid: boolean,
  signatureValid: boolean | null,
  proofValid: boolean | null
): string | undefined => {
  if (!hashValid) {
    return "Payload hash mismatch (envelope was modified).";
  }
  if (signatureValid === false) {
    return "Invalid or untrusted Ed25519 signature.";
  }
  if (proofValid === false) {
    return "Attached proof failed trusted kernel verification.";
  }
  return undefined;
};

/**
 * Independently verifies a `ProofEnvelope` offline:
 * 1. Recomputes and checks `payloadHash` against canonicalized payload.
 * 2. Verifies the Ed25519 signature against `trustedPublicKeyJwk` (or the
 *    embedded key if no pinned key is given).
 * 3. Runs Lion's trusted proof kernel (`verifyProof`) on any attached proof.
 */
export const verifyProofEnvelope = (
  envelope: ProofEnvelope,
  trustedPublicKeyJwk?: PublicKeyJwk
): Effect.Effect<EnvelopeVerification, LogicError> =>
  Effect.gen(function* () {
    const recomputedHash = yield* sha256Hex(canonicalJson(envelope.payload));
    const hashValid = recomputedHash === envelope.payloadHash;

    let signatureValid: boolean | null = null;
    if (envelope.algorithm === "Ed25519") {
      signatureValid = yield* verifyEd25519Signature(
        trustedPublicKeyJwk ?? envelope.publicKeyJwk,
        envelope.signature,
        envelope.payloadHash
      );
    } else if (trustedPublicKeyJwk !== undefined) {
      signatureValid = false;
    }

    let proofValid: boolean | null = null;
    if (envelope.payload.proof !== undefined) {
      const decodedProof = yield* decodeWire(envelope.payload.proof);
      const decodedClaim =
        envelope.payload.claim === undefined
          ? undefined
          : yield* decodeWire(envelope.payload.claim);
      proofValid = verifyProof(decodedProof, decodedClaim);
    }

    const valid =
      hashValid &&
      (signatureValid === null || signatureValid) &&
      (proofValid === null || proofValid);
    const reason = verificationReason(hashValid, signatureValid, proofValid);

    return {
      hashValid,
      payloadHash: recomputedHash,
      proofValid,
      ...(reason === undefined ? {} : { reason }),
      signatureValid,
      valid,
    };
  });

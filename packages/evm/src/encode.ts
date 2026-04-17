import { isEvmValue } from "@lionlang/core/modules/evm";
import type { LionExpressionType } from "@lionlang/core/schemas/lion-expression";
import { TAG } from "./tags.ts";

/**
 * Encode a Lion expression (or a Lion expression containing `evm/*`
 * tagged values) into the TLV bytes consumed by the LionVM contract.
 *
 * Encoding rules:
 *
 *   number    → INT (must be a safe integer; for full int256 use evm/int256)
 *   boolean   → BOOL
 *   string    → SYM  (Lion strings are variable references by default)
 *   null      → NIL
 *   array     → LIST of recursively-encoded children
 *   record    → encoded as (record k1 v1 k2 v2 ...) — record support is
 *               not yet wired through the contract; reserved for future use.
 *
 *   evm/int256, evm/uint256 → INT
 *   evm/bool                → BOOL
 *   evm/string              → BYTES (utf-8)
 *   evm/bytes               → BYTES (hex-decoded)
 *   evm/address             → BYTES (20 raw bytes)
 *   evm/sym                 → SYM
 *   evm/nil                 → NIL
 */
export const encode = (expr: unknown): Uint8Array => {
	const out: number[] = [];
	writeExpr(out, expr);
	return Uint8Array.from(out);
};

// ─────────────── internal: writer over a number[] sink ───────────────

const writeExpr = (out: number[], expr: unknown): void => {
	if (isEvmValue(expr)) {
		writeEvmValue(out, expr);
		return;
	}
	if (expr === null) {
		out.push(TAG.NIL);
		return;
	}
	switch (typeof expr) {
		case "boolean":
			out.push(TAG.BOOL, expr ? 1 : 0);
			return;
		case "number": {
			if (!Number.isInteger(expr)) {
				throw new TypeError(
					`Lion EVM encoder: non-integer number ${expr}; use evm/int256 for arbitrary-precision integers.`,
				);
			}
			writeInt256(out, BigInt(expr));
			return;
		}
		case "string": {
			out.push(TAG.SYM);
			writeLengthPrefixedUtf8(out, expr);
			return;
		}
	}
	if (Array.isArray(expr)) {
		writeList(out, expr as readonly LionExpressionType[]);
		return;
	}
	if (typeof expr === "object") {
		// Plain JSON record — encode as a list whose head is the literal
		// symbol "record" followed by alternating key/value pairs. The
		// contract does not interpret this today but the bytes round-trip.
		const entries = Object.entries(expr as Record<string, unknown>);
		const items: unknown[] = ["record"];
		for (const [k, v] of entries) {
			items.push(k);
			items.push(v);
		}
		writeList(out, items);
		return;
	}
	throw new TypeError(
		`Lion EVM encoder: unsupported value of type ${typeof expr}`,
	);
};

const writeList = (out: number[], items: readonly unknown[]): void => {
	if (items.length > 0xffff) {
		throw new RangeError(`Lion EVM encoder: list too long (${items.length})`);
	}
	out.push(TAG.LIST);
	writeU16(out, items.length);
	for (const item of items) writeExpr(out, item);
};

const writeEvmValue = (out: number[], value: ReturnType<typeof asEvm>): void => {
	switch (value.$evm) {
		case "int256":
		case "uint256":
			writeInt256(out, BigInt(value.value));
			return;
		case "bool":
			out.push(TAG.BOOL, value.value ? 1 : 0);
			return;
		case "string":
			out.push(TAG.BYTES);
			writeLengthPrefixedUtf8(out, value.value);
			return;
		case "bytes": {
			const raw = hexToBytes(value.value);
			out.push(TAG.BYTES);
			writeU16(out, raw.length);
			for (const b of raw) out.push(b);
			return;
		}
		case "address": {
			const raw = hexToBytes(value.value);
			if (raw.length !== 20) {
				throw new RangeError(`evm/address must be 20 bytes (got ${raw.length})`);
			}
			out.push(TAG.BYTES);
			writeU16(out, 20);
			for (const b of raw) out.push(b);
			return;
		}
		case "sym":
			out.push(TAG.SYM);
			writeLengthPrefixedUtf8(out, value.value);
			return;
		case "nil":
			out.push(TAG.NIL);
			return;
	}
};

// `isEvmValue` already narrows; this re-import-free alias keeps types tidy.
type EvmAny = Parameters<typeof writeEvmValueRaw>[0];
const writeEvmValueRaw = writeEvmValue;
const asEvm = (v: unknown): EvmAny => v as EvmAny;

// ─────────────── primitive writers ───────────────

const writeU16 = (out: number[], n: number): void => {
	out.push((n >>> 8) & 0xff, n & 0xff);
};

const writeLengthPrefixedUtf8 = (out: number[], s: string): void => {
	const enc = new TextEncoder().encode(s);
	if (enc.length > 0xffff) {
		throw new RangeError(`Lion EVM encoder: string too long (${enc.length})`);
	}
	writeU16(out, enc.length);
	for (const b of enc) out.push(b);
};

const INT256_MIN = -(2n ** 255n);
const INT256_MAX = 2n ** 255n - 1n;
const UINT256_MAX = 2n ** 256n - 1n;
const TWO_POW_256 = 2n ** 256n;

const writeInt256 = (out: number[], n: bigint): void => {
	// Allow any value representable in 256 bits, signed or unsigned. We
	// reduce uint256 values into the int256 two's-complement range so the
	// contract's `int256` slot decodes them identically.
	let v = n;
	if (v > INT256_MAX) {
		if (v > UINT256_MAX) {
			throw new RangeError(`int256 overflow: ${n}`);
		}
		v -= TWO_POW_256; // reinterpret unsigned-high as signed-negative
	}
	if (v < INT256_MIN) {
		throw new RangeError(`int256 underflow: ${n}`);
	}
	const unsigned = v < 0n ? v + TWO_POW_256 : v;
	out.push(TAG.INT);
	for (let i = 31; i >= 0; i--) {
		out.push(Number((unsigned >> BigInt(i * 8)) & 0xffn));
	}
};

const hexToBytes = (hex: string): Uint8Array => {
	if (!hex.startsWith("0x")) {
		throw new TypeError(`hex value must start with 0x (got "${hex}")`);
	}
	const body = hex.slice(2);
	if (body.length % 2 !== 0) {
		throw new TypeError(`hex value must have even length (got "${hex}")`);
	}
	const out = new Uint8Array(body.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = Number.parseInt(body.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
};

/** Convenience: encode and return as a 0x-prefixed hex string for calldata. */
export const encodeHex = (expr: unknown): `0x${string}` => {
	const bytes = encode(expr);
	let hex = "0x";
	for (const b of bytes) hex += b.toString(16).padStart(2, "0");
	return hex as `0x${string}`;
};

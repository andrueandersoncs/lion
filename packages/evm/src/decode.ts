import { TAG } from "./tags.ts";

/**
 * Decoded runtime value returned by the LionVM. Mirrors the on-chain TLV
 * but uses friendly JS types. INT is bigint, BYTES is Uint8Array, SYM is
 * string with a marker so callers can distinguish from string literals.
 */
export type DecodedValue =
	| { kind: "int"; value: bigint }
	| { kind: "bool"; value: boolean }
	| { kind: "sym"; name: string }
	| { kind: "bytes"; value: Uint8Array }
	| { kind: "list"; items: DecodedValue[] }
	| { kind: "nil" }
	| { kind: "lambda"; raw: Uint8Array };

export const decode = (input: Uint8Array | `0x${string}`): DecodedValue => {
	const buf = typeof input === "string" ? hexToBytes(input) : input;
	const [v, end] = readExpr(buf, 0);
	if (end !== buf.length) {
		throw new Error(
			`Lion EVM decoder: trailing bytes (consumed ${end} of ${buf.length})`,
		);
	}
	return v;
};

const readExpr = (buf: Uint8Array, p: number): [DecodedValue, number] => {
	if (p >= buf.length) throw new Error("decoder: unexpected end of input");
	const tag = buf[p];
	switch (tag) {
		case TAG.INT: {
			if (p + 33 > buf.length) throw new Error("decoder: truncated int");
			let unsigned = 0n;
			for (let i = 0; i < 32; i++) {
				unsigned = (unsigned << 8n) | BigInt(buf[p + 1 + i]!);
			}
			const TWO_POW_255 = 1n << 255n;
			const TWO_POW_256 = 1n << 256n;
			const value = unsigned >= TWO_POW_255 ? unsigned - TWO_POW_256 : unsigned;
			return [{ kind: "int", value }, p + 33];
		}
		case TAG.BOOL: {
			if (p + 2 > buf.length) throw new Error("decoder: truncated bool");
			return [{ kind: "bool", value: buf[p + 1] !== 0 }, p + 2];
		}
		case TAG.SYM: {
			const len = readU16(buf, p + 1);
			const start = p + 3;
			const end = start + len;
			if (end > buf.length) throw new Error("decoder: truncated sym");
			return [{ kind: "sym", name: utf8(buf.slice(start, end)) }, end];
		}
		case TAG.BYTES: {
			const len = readU16(buf, p + 1);
			const start = p + 3;
			const end = start + len;
			if (end > buf.length) throw new Error("decoder: truncated bytes");
			return [{ kind: "bytes", value: buf.slice(start, end) }, end];
		}
		case TAG.LIST: {
			const n = readU16(buf, p + 1);
			let q = p + 3;
			const items: DecodedValue[] = [];
			for (let i = 0; i < n; i++) {
				const [child, next] = readExpr(buf, q);
				items.push(child);
				q = next;
			}
			return [{ kind: "list", items }, q];
		}
		case TAG.NIL:
			return [{ kind: "nil" }, p + 1];
		case TAG.LAMBDA: {
			// We don't fully introspect lambdas in the decoder; we just
			// record the raw bytes so callers can pass them back.
			const start = p;
			const nParams = readU16(buf, p + 1);
			let q = p + 3;
			for (let i = 0; i < nParams; i++) {
				const plen = readU16(buf, q);
				q += 2 + plen;
			}
			const bodyLen = readU16(buf, q);
			q += 2 + bodyLen + 4; // body + envId
			return [{ kind: "lambda", raw: buf.slice(start, q) }, q];
		}
	}
	throw new Error(`decoder: unknown tag 0x${tag!.toString(16)}`);
};

const readU16 = (buf: Uint8Array, p: number): number => {
	if (p + 2 > buf.length) throw new Error("decoder: truncated u16");
	return ((buf[p]! << 8) | buf[p + 1]!) >>> 0;
};

const utf8 = (b: Uint8Array): string => new TextDecoder().decode(b);

const hexToBytes = (hex: string): Uint8Array => {
	const body = hex.startsWith("0x") ? hex.slice(2) : hex;
	if (body.length % 2 !== 0) throw new Error("decoder: odd-length hex");
	const out = new Uint8Array(body.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = Number.parseInt(body.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
};

import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { module as evm } from "@lionlang/core/modules/evm";
import { decode, encode, encodeHex, TAG } from "@/index";

const run = <A>(eff: Effect.Effect<A, unknown, never>) =>
	Effect.runSync(eff as Effect.Effect<A, unknown, never>);

describe("evm encoder", () => {
	it("encodes integers as 33-byte INT records", () => {
		const out = encode(42);
		expect(out[0]).toBe(TAG.INT);
		expect(out.length).toBe(33);
		expect(out[32]).toBe(42);
	});

	it("encodes bare strings as SYM (variable references)", () => {
		const out = encode("foo");
		expect(out[0]).toBe(TAG.SYM);
		expect(out[1]).toBe(0);
		expect(out[2]).toBe(3);
		expect(new TextDecoder().decode(out.slice(3))).toBe("foo");
	});

	it("encodes evm/string as BYTES (string literal)", () => {
		const lit = run(evm.string("foo"));
		const out = encode(lit);
		expect(out[0]).toBe(TAG.BYTES);
		expect(new TextDecoder().decode(out.slice(3))).toBe("foo");
	});

	it("encodes booleans", () => {
		expect(Array.from(encode(true))).toEqual([TAG.BOOL, 1]);
		expect(Array.from(encode(false))).toEqual([TAG.BOOL, 0]);
	});

	it("encodes nested lists", () => {
		const out = encode(["+", 1, 2]);
		// LIST(3) + SYM("+") + INT(1) + INT(2)
		expect(out[0]).toBe(TAG.LIST);
		expect(out[1]).toBe(0);
		expect(out[2]).toBe(3);
		expect(out[3]).toBe(TAG.SYM);
	});

	it("encodes evm/int256 negative values via two's complement", () => {
		const v = run(evm.int256(-1));
		const out = encode(v);
		expect(out[0]).toBe(TAG.INT);
		// All 32 payload bytes should be 0xff for -1
		for (let i = 1; i < 33; i++) expect(out[i]).toBe(0xff);
	});

	it("encodes evm/uint256 max", () => {
		const v = run(evm.uint256("115792089237316195423570985008687907853269984665640564039457584007913129639935"));
		const out = encode(v);
		expect(out[0]).toBe(TAG.INT);
		for (let i = 1; i < 33; i++) expect(out[i]).toBe(0xff);
	});

	it("encodes evm/address as 20 raw bytes", () => {
		const a = run(evm.address("0x000000000000000000000000000000000000dEaD"));
		const out = encode(a);
		expect(out[0]).toBe(TAG.BYTES);
		expect(out[1]).toBe(0);
		expect(out[2]).toBe(20);
		expect(out[out.length - 1]).toBe(0xad);
	});

	it("encodes evm/nil as a single byte", () => {
		const n = run(evm.nil());
		expect(Array.from(encode(n))).toEqual([TAG.NIL]);
	});

	it("encodeHex prefixes with 0x and lowercases", () => {
		expect(encodeHex(true)).toBe("0x0201");
	});

	it("rejects non-integer numbers (must use evm/int256)", () => {
		expect(() => encode(1.5)).toThrow(/non-integer/);
	});
});

describe("evm decoder", () => {
	it("decodes integers", () => {
		const v = decode(encode(42));
		expect(v).toEqual({ kind: "int", value: 42n });
	});

	it("decodes negative integers", () => {
		const v = decode(encode(run(evm.int256(-7))));
		expect(v).toEqual({ kind: "int", value: -7n });
	});

	it("decodes booleans", () => {
		expect(decode(encode(true))).toEqual({ kind: "bool", value: true });
		expect(decode(encode(false))).toEqual({ kind: "bool", value: false });
	});

	it("decodes symbols", () => {
		expect(decode(encode("foo"))).toEqual({ kind: "sym", name: "foo" });
	});

	it("decodes byte literals", () => {
		const v = decode(encode(run(evm.string("hi"))));
		expect(v.kind).toBe("bytes");
		if (v.kind === "bytes")
			expect(new TextDecoder().decode(v.value)).toBe("hi");
	});

	it("round-trips lists", () => {
		const expr = ["+", 1, 2, ["-", 5, 3]];
		const v = decode(encode(expr));
		expect(v.kind).toBe("list");
		if (v.kind === "list") {
			expect(v.items.length).toBe(4);
			expect(v.items[0]).toEqual({ kind: "sym", name: "+" });
			expect(v.items[3].kind).toBe("list");
		}
	});

	it("decodes nil", () => {
		expect(decode(encode(run(evm.nil())))).toEqual({ kind: "nil" });
	});

	it("decodes hex strings", () => {
		const v = decode("0x0201");
		expect(v).toEqual({ kind: "bool", value: true });
	});
});

describe("evm stdlib (range checks)", () => {
	it("rejects int256 overflow", () => {
		expect(() => run(evm.int256("57896044618658097711785492504343953926634992332820282019728792003956564819968")))
			.toThrow(/out of range/);
	});

	it("rejects uint256 negative", () => {
		expect(() => run(evm.uint256(-1))).toThrow(/out of range/);
	});

	it("rejects malformed addresses", () => {
		expect(() => run(evm.address("0xdead"))).toThrow();
	});
});

describe("realistic Lion programs", () => {
	it("encodes a staticcall + bytes->int program", () => {
		const counter = run(evm.address("0x" + "11".repeat(20))) as { value: string };
		const program = [
			"bytes->int",
			[
				"staticcall",
				counter,
				["selector", run(evm.string("get()"))],
			],
		];
		const out = encode(program);
		// Sanity: starts with LIST tag
		expect(out[0]).toBe(TAG.LIST);
		// Round-trip
		const back = decode(out);
		expect(back.kind).toBe("list");
	});
});

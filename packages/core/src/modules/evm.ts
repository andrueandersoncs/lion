import { Effect, flow, Schema } from "effect";
import { decode } from "./lib/shared.ts";

/**
 * EVM interop module.
 *
 * Lion programs that target the EVM need a way to disambiguate values that
 * the JSON-only AST cannot express on its own. JSON has no integers (only
 * IEEE-754 doubles), no fixed-width numerics, no byte strings, no
 * distinction between "string-as-symbol" (variable reference) and
 * "string-as-literal".
 *
 * The constructors below tag a value with an `$evm` discriminant so:
 *
 *   - the EVM encoder package can emit the right TLV tag, and
 *   - the in-process Lion interpreter can still evaluate programs that
 *     reference these forms (returning the tagged record verbatim).
 *
 * All values in this module are pure — they do not perform side effects.
 * The actual on-chain effects (`call`, `staticcall`, `log`, …) are
 * performed by the LionVM Solidity runtime; in the TS evaluator they can
 * be supplied by the host as mock bindings.
 */

export const EvmTag = "$evm" as const;

// ─────────────── Schemas for individual EVM-typed values ───────────────

const HexStringSchema = Schema.String.pipe(
	Schema.pattern(/^0x[0-9a-fA-F]*$/, {
		message: () => 'EVM hex value must start with "0x"',
	}),
);

const AddressStringSchema = Schema.String.pipe(
	Schema.pattern(/^0x[0-9a-fA-F]{40}$/, {
		message: () => 'EVM address must be a 0x-prefixed 20-byte hex string',
	}),
);

const IntegerCoercibleSchema = Schema.Union(
	Schema.Number.pipe(
		Schema.filter((n) => Number.isInteger(n), {
			message: () => "EVM integer must be a whole number",
		}),
	),
	Schema.String.pipe(
		Schema.pattern(/^-?\d+$/, {
			message: () => "EVM integer string must be base-10 digits",
		}),
	),
	Schema.BigIntFromSelf,
);

const toBigInt = (raw: number | string | bigint): bigint =>
	typeof raw === "bigint" ? raw : BigInt(raw);

// Range guards. We intentionally validate at construction time so encoder
// doesn't have to re-check.
const INT256_MIN = -(2n ** 255n);
const INT256_MAX = 2n ** 255n - 1n;
const UINT256_MAX = 2n ** 256n - 1n;

const checkInt256 = (n: bigint) =>
	n >= INT256_MIN && n <= INT256_MAX
		? Effect.succeed(n)
		: Effect.fail(new RangeError(`int256 out of range: ${n}`));

const checkUint256 = (n: bigint) =>
	n >= 0n && n <= UINT256_MAX
		? Effect.succeed(n)
		: Effect.fail(new RangeError(`uint256 out of range: ${n}`));

// ─────────────── Branded value records (runtime representation) ───────────────

export type EvmInt256 = { readonly [EvmTag]: "int256"; readonly value: string };
export type EvmUint256 = {
	readonly [EvmTag]: "uint256";
	readonly value: string;
};
export type EvmBool = { readonly [EvmTag]: "bool"; readonly value: boolean };
export type EvmBytes = { readonly [EvmTag]: "bytes"; readonly value: string };
export type EvmAddress = {
	readonly [EvmTag]: "address";
	readonly value: string;
};
export type EvmString = { readonly [EvmTag]: "string"; readonly value: string };
export type EvmSym = { readonly [EvmTag]: "sym"; readonly value: string };
export type EvmNil = { readonly [EvmTag]: "nil" };

export type EvmValue =
	| EvmInt256
	| EvmUint256
	| EvmBool
	| EvmBytes
	| EvmAddress
	| EvmString
	| EvmSym
	| EvmNil;

const tagged = <K extends EvmValue["$evm"], V extends Omit<Extract<EvmValue, { $evm: K }>, "$evm">>(
	kind: K,
	rest: V,
) => ({ [EvmTag]: kind, ...rest });

// ─────────────── Module ───────────────

export const module = {
	symbol: Symbol("evm"),

	int256: flow(
		decode(IntegerCoercibleSchema),
		Effect.map(toBigInt),
		Effect.flatMap(checkInt256),
		Effect.map((n): EvmInt256 => tagged("int256", { value: n.toString() })),
	),

	uint256: flow(
		decode(IntegerCoercibleSchema),
		Effect.map(toBigInt),
		Effect.flatMap(checkUint256),
		Effect.map((n): EvmUint256 => tagged("uint256", { value: n.toString() })),
	),

	bool: flow(
		decode(Schema.Boolean),
		Effect.map((b): EvmBool => tagged("bool", { value: b })),
	),

	bytes: flow(
		decode(HexStringSchema),
		Effect.map((hex): EvmBytes => tagged("bytes", { value: hex })),
	),

	address: flow(
		decode(AddressStringSchema),
		Effect.map((hex): EvmAddress => tagged("address", { value: hex })),
	),

	/**
	 * UTF-8 string literal. Distinct from a bare Lion string, which is a
	 * variable reference. Encodes to the EVM bytes tag.
	 */
	string: flow(
		decode(Schema.String),
		Effect.map((s): EvmString => tagged("string", { value: s })),
	),

	/**
	 * Explicit symbol (variable reference). Lion strings are already
	 * references by default, but `evm/sym` lets a program build a symbol
	 * at runtime — useful for macros and code-as-data.
	 */
	sym: flow(
		decode(Schema.String),
		Effect.map((s): EvmSym => tagged("sym", { value: s })),
	),

	nil: () => Effect.succeed<EvmNil>(tagged("nil", {})),
};

// ─────────────── Type guards (used by encoder package) ───────────────

const isRec = (u: unknown): u is Record<string, unknown> =>
	typeof u === "object" && u !== null && !Array.isArray(u);

export const isEvmValue = (u: unknown): u is EvmValue =>
	isRec(u) && typeof (u as Record<string, unknown>)[EvmTag] === "string";

export const evmKind = (u: EvmValue): EvmValue["$evm"] => u[EvmTag];

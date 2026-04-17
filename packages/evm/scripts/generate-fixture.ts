/**
 * Generates Lion programs from TS, encodes them with @lionlang/evm, and
 * writes the raw TLV bytes to a JSON fixture consumed by the LionVM
 * Foundry test (`test/Wire.t.sol`). This proves the TS encoder's output
 * is byte-compatible with the on-chain interpreter.
 */

import { writeFileSync } from "node:fs";
import { Effect } from "effect";
import { module as evm } from "@lionlang/core/modules/evm";
import { encodeHex } from "../src/index.ts";

const run = <A>(eff: Effect.Effect<A, unknown, never>) =>
	Effect.runSync(eff as Effect.Effect<A, unknown, never>);

// Same composed program as test_ComposedProgram in Solidity, but built
// here from TS-side helpers and the new evm/* stdlib.
const counterAddress = process.argv[2] ?? "0x0000000000000000000000000000000000000001";

const program = [
	"begin",
	["define", "C", run(evm.address(counterAddress))],
	[
		"call",
		"C",
		[
			"concat",
			["selector", run(evm.string("add(uint256)"))],
			["pad32", run(evm.int256(100))],
		],
		0,
	],
	[
		"bytes->int",
		[
			"staticcall",
			"C",
			["selector", run(evm.string("get()"))],
		],
	],
];

const programs = {
	arithmetic: ["+", 1, 2, 3], // → 6
	factorial6: [
		"begin",
		[
			"define",
			"fact",
			[
				"lambda",
				["n"],
				[
					"if",
					["<=", "n", 1],
					1,
					["*", "n", ["fact", ["-", "n", 1]]],
				],
			],
		],
		["fact", 6], // → 720
	],
	closure: [
		"begin",
		[
			"define",
			"make-adder",
			["lambda", ["n"], ["lambda", ["x"], ["+", "x", "n"]]],
		],
		["define", "add5", ["make-adder", 5]],
		["add5", 10], // → 15
	],
	composed: program,
};

const fixture = Object.fromEntries(
	Object.entries(programs).map(([k, v]) => [k, encodeHex(v)]),
);

const path = process.argv[3] ?? "./fixtures/programs.json";
writeFileSync(path, JSON.stringify(fixture, null, 2) + "\n");
console.log(`wrote ${path}:`);
console.log(JSON.stringify(fixture, null, 2));

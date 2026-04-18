import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { run } from "../../evaluation/evaluate.ts";
import { stdlib } from "../index.ts";

describe("ui module", () => {
	it("creates a text node", () =>
		Effect.gen(function* () {
			const result = yield* run(["ui/text", "Hello World"], stdlib);
			expect(result).toEqual({
				$ui: "text",
				props: {},
				children: ["Hello World"],
			});
		}));

	it("creates a heading with level prop", () =>
		Effect.gen(function* () {
			const result = yield* run(
				["ui/heading", { level: 2 }, "Dashboard"],
				stdlib,
			);
			expect(result).toEqual({
				$ui: "heading",
				props: { level: 2 },
				children: ["Dashboard"],
			});
		}));

	it("creates a button with variant prop", () =>
		Effect.gen(function* () {
			const result = yield* run(
				["ui/button", { variant: "outline" }, "Click Me"],
				stdlib,
			);
			expect(result).toEqual({
				$ui: "button",
				props: { variant: "outline" },
				children: ["Click Me"],
			});
		}));

	it("creates a nested card with stack layout", () =>
		Effect.gen(function* () {
			const result = yield* run(
				[
					"ui/card",
					{ title: "Portfolio" },
					["ui/stack", ["ui/text", "ETH: $3,200"], ["ui/text", "BTC: $65,000"]],
				],
				stdlib,
			);
			expect(result).toEqual({
				$ui: "card",
				props: { title: "Portfolio" },
				children: [
					{
						$ui: "stack",
						props: {},
						children: [
							{ $ui: "text", props: {}, children: ["ETH: $3,200"] },
							{ $ui: "text", props: {}, children: ["BTC: $65,000"] },
						],
					},
				],
			});
		}));

	it("creates a row with badge children", () =>
		Effect.gen(function* () {
			const result = yield* run(
				[
					"ui/row",
					["ui/badge", "Active"],
					["ui/badge", { variant: "destructive" }, "High Risk"],
				],
				stdlib,
			);
			expect(result).toEqual({
				$ui: "row",
				props: {},
				children: [
					{ $ui: "badge", props: {}, children: ["Active"] },
					{
						$ui: "badge",
						props: { variant: "destructive" },
						children: ["High Risk"],
					},
				],
			});
		}));

	it("creates a progress bar with value", () =>
		Effect.gen(function* () {
			const result = yield* run(["ui/progress", { value: 75 }], stdlib);
			expect(result).toEqual({
				$ui: "progress",
				props: { value: 75 },
				children: [],
			});
		}));

	it("creates separator with no args", () =>
		Effect.gen(function* () {
			const result = yield* run(["ui/separator"], stdlib);
			expect(result).toEqual({
				$ui: "separator",
				props: {},
				children: [],
			});
		}));

	it("creates a complex dashboard layout", () =>
		Effect.gen(function* () {
			const result = yield* run(
				[
					"ui/stack",
					["ui/heading", "DeFi Dashboard"],
					[
						"ui/row",
						[
							"ui/card",
							{ title: "Balances" },
							["ui/text", "Total: $100,000"],
						],
						[
							"ui/card",
							{ title: "Activity" },
							["ui/text", "24 transactions"],
						],
					],
				],
				stdlib,
			);
			const r = result as any;
			expect(r.$ui).toBe("stack");
			expect(r.children).toHaveLength(2);
			expect(r.children[0].$ui).toBe("heading");
			expect(r.children[1].$ui).toBe("row");
			expect(r.children[1].children).toHaveLength(2);
		}));
});

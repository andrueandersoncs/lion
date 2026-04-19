/**
 * Simulates an AI agent streaming a UI program to the client.
 *
 * Two demos:
 *   - simulateAgentStream: bindings-patch driven. Source stays mostly stable;
 *     live values update via JSON Patch.
 *   - simulateAgentUiStream: source-patch driven. The tree itself is reshaped
 *     over time — nodes added, replaced, removed.
 *
 * Source now uses real React components directly by name (`Card`, `Button`,
 * `Alert`, etc.) — no bespoke `ui/*` wrappers.
 */

import type { Message } from "./use-ui-source.ts";

// ─────────── data-stream demo ───────────

const tokenCard = [
	"lambda",
	["name", "price", "change"],
	[
		"Card",
		{ className: "w-full" },
		["CardHeader", ["CardTitle", "name"]],
		[
			"CardContent",
			[
				"div",
				{ className: "flex flex-col gap-3" },
				["p", { className: "text-2xl font-bold" }, ["format/usd", "price"]],
				["Badge", ["format/percent", "change"]],
			],
		],
	],
];

const dashboard = [
	"begin",
	["define", "token-card", tokenCard],
	[
		"div",
		{ className: "flex flex-col gap-6" },
		["h1", { className: "text-3xl font-bold tracking-tight" }, "DeFi Portfolio"],
		[
			"div",
			{ className: "flex flex-row flex-wrap items-center gap-4" },
			["token-card", "ETH", "eth-price", "eth-change"],
			["token-card", "USDC", "usdc-price", "usdc-change"],
			["token-card", "AAVE", "aave-price", "aave-change"],
		],
		["Separator"],
		[
			"Alert",
			["AlertTitle", "Health Factor"],
			["AlertDescription", "health-factor-msg"],
		],
	],
];

const initialBindings = {
	"eth-price": 3250,
	"eth-change": 0.052,
	"usdc-price": 1,
	"usdc-change": 0,
	"aave-price": 85,
	"aave-change": -0.021,
	"health-factor-msg": "Health factor: 1.42 (safe)",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const jitter = (base: number, pct: number) =>
	base * (1 + (Math.random() - 0.5) * pct);

export const simulateAgentStream = async (
	dispatch: (msg: Message) => void,
	onDone?: () => void,
): Promise<() => void> => {
	dispatch({ kind: "reset", source: dashboard, bindings: initialBindings });

	await sleep(400);

	dispatch({
		kind: "bindings-patch",
		ops: [
			{ op: "replace", path: "/eth-price", value: 3275 },
			{ op: "replace", path: "/eth-change", value: 0.061 },
		],
	});

	await sleep(600);

	dispatch({
		kind: "bindings-patch",
		ops: [
			{ op: "replace", path: "/aave-price", value: 83.4 },
			{ op: "replace", path: "/aave-change", value: -0.039 },
			{
				op: "replace",
				path: "/health-factor-msg",
				value: "Health factor: 1.31 (caution)",
			},
		],
	});

	await sleep(600);

	// Append a new card to the row.
	// source = ["begin", define, stack]
	// stack is at /2; children start at /2/2; the row is /2/3; cards start at /2/3/2.
	dispatch({
		kind: "source-patch",
		ops: [
			{
				op: "add",
				path: "/2/3/-",
				value: ["token-card", "WBTC", "wbtc-price", "wbtc-change"],
			},
		],
	});
	dispatch({
		kind: "bindings-patch",
		ops: [
			{ op: "add", path: "/wbtc-price", value: 67_400 },
			{ op: "add", path: "/wbtc-change", value: 0.018 },
		],
	});

	await sleep(400);

	const tickers = ["eth-price", "aave-price", "wbtc-price"] as const;
	const baselines: Record<string, number> = {
		"eth-price": 3275,
		"aave-price": 83.4,
		"wbtc-price": 67_400,
	};

	let stopped = false;
	const interval = setInterval(() => {
		if (stopped) return;
		const ticker =
			tickers[Math.floor(Math.random() * tickers.length)] ?? "eth-price";
		const next = jitter(baselines[ticker] ?? 0, 0.01);
		dispatch({
			kind: "bindings-patch",
			ops: [
				{ op: "replace", path: `/${ticker}`, value: Number(next.toFixed(2)) },
			],
		});
	}, 700);

	const stop = () => {
		if (stopped) return;
		stopped = true;
		clearInterval(interval);
		onDone?.();
	};

	setTimeout(stop, 12_000);

	return stop;
};

// ─────────── structural simulation: source-patches reshape the tree ───────────

/**
 * Root shape at every step:
 *   ["div", <props>, child0, child1, ...]
 * so children start at index 2. Use "-" to append.
 */
export const simulateAgentUiStream = async (
	dispatch: (msg: Message) => void,
	onDone?: () => void,
): Promise<() => void> => {
	let cancelled = false;
	const step = async (ms: number, msg: Message) => {
		await sleep(ms);
		if (cancelled) return;
		dispatch(msg);
	};

	// T0: analyzing shell with skeleton placeholder.
	dispatch({
		kind: "reset",
		source: [
			"div",
			{ className: "flex flex-col gap-4" },
			[
				"h2",
				{ className: "text-2xl font-semibold tracking-tight" },
				"🔍 Analyzing wallet 0x7a2…4f9c",
			],
			["Skeleton", { className: "h-24 w-full" }],
		],
		bindings: {},
	});

	// T1: replace skeleton with loading group (text + progress bar).
	await step(700, {
		kind: "source-patch",
		ops: [
			{
				op: "replace",
				path: "/3",
				value: [
					"div",
					{ className: "flex flex-col gap-2" },
					["p", { className: "text-sm" }, "Fetching on-chain data…"],
					["Progress", { value: 30 }],
				],
			},
		],
	});

	// T2: bump progress — deep patch into nested props.
	// /3 is loading-group; children at /3/2..; Progress is at /3/3; props at /3/3/1.
	await step(500, {
		kind: "source-patch",
		ops: [{ op: "replace", path: "/3/3/1", value: { value: 72 } }],
	});

	// T3: swap heading, replace loader with Overview card.
	await step(500, {
		kind: "source-patch",
		ops: [
			{
				op: "replace",
				path: "/2",
				value: [
					"h2",
					{ className: "text-2xl font-semibold tracking-tight" },
					"Wallet Analysis",
				],
			},
			{
				op: "replace",
				path: "/3",
				value: [
					"Card",
					["CardHeader", ["CardTitle", "Overview"]],
					[
						"CardContent",
						[
							"div",
							{ className: "flex flex-col gap-3" },
							[
								"div",
								{
									className:
										"flex flex-row flex-wrap items-center gap-3",
								},
								[
									"p",
									{ className: "text-2xl font-bold" },
									["format/usd", "portfolio-value"],
								],
								["Badge", { variant: "secondary" }, "12 tokens"],
								["Badge", ["format/percent", "day-change"]],
							],
							["p", { className: "text-sm" }, "portfolio-summary"],
						],
					],
				],
			},
		],
	});
	dispatch({
		kind: "bindings-patch",
		ops: [
			{ op: "add", path: "/portfolio-value", value: 49_125 },
			{ op: "add", path: "/day-change", value: 0.031 },
			{
				op: "add",
				path: "/portfolio-summary",
				value: "Active since 2021 · 847 transactions · 3 chains",
			},
		],
	});

	// T4: neutral risk alert.
	await step(800, {
		kind: "source-patch",
		ops: [
			{
				op: "add",
				path: "/-",
				value: [
					"Alert",
					["AlertTitle", "Risk Assessment"],
					["AlertDescription", "Evaluating position concentration…"],
				],
			},
		],
	});

	// T5: morph into destructive variant.
	await step(900, {
		kind: "source-patch",
		ops: [
			{
				op: "replace",
				path: "/4",
				value: [
					"Alert",
					{ variant: "destructive" },
					["AlertTitle", "⚠️ High concentration risk"],
					[
						"AlertDescription",
						[
							"div",
							{ className: "flex flex-col gap-2" },
							["p", "78% of portfolio value sits in a single asset (ETH)."],
							["p", { className: "text-xs" }, "Consider diversifying."],
						],
					],
				],
			},
		],
	});

	// T6: append a positions table (composed, not prop-driven).
	await step(700, {
		kind: "source-patch",
		ops: [
			{
				op: "add",
				path: "/-",
				value: [
					"Card",
					["CardHeader", ["CardTitle", "Top positions"]],
					[
						"CardContent",
						[
							"Table",
							[
								"TableHeader",
								[
									"TableRow",
									["TableHead", "Token"],
									["TableHead", "Balance"],
									["TableHead", "Value"],
								],
							],
							[
								"TableBody",
								[
									"TableRow",
									["TableCell", "ETH"],
									["TableCell", "11.80"],
									["TableCell", "$38,350"],
								],
								[
									"TableRow",
									["TableCell", "USDC"],
									["TableCell", "6,420"],
									["TableCell", "$6,420"],
								],
								[
									"TableRow",
									["TableCell", "AAVE"],
									["TableCell", "28.5"],
									["TableCell", "$2,422"],
								],
								[
									"TableRow",
									["TableCell", "LINK"],
									["TableCell", "145"],
									["TableCell", "$1,933"],
								],
							],
						],
					],
				],
			},
		],
	});

	// T7: append an actions row.
	await step(700, {
		kind: "source-patch",
		ops: [
			{
				op: "add",
				path: "/-",
				value: [
					"div",
					{ className: "flex flex-row items-center gap-2" },
					["Button", "View full report"],
					["Button", { variant: "outline" }, "Export CSV"],
					["Button", { variant: "ghost" }, "Share"],
				],
			},
		],
	});

	// T8: remove the risk alert (indices shift afterward).
	await step(900, {
		kind: "source-patch",
		ops: [{ op: "remove", path: "/4" }],
	});

	// T9: success alert.
	await step(400, {
		kind: "source-patch",
		ops: [
			{
				op: "add",
				path: "/-",
				value: [
					"Alert",
					["AlertTitle", "✓ Analysis complete"],
					["AlertDescription", "All safety checks passed. Report ready."],
				],
			},
		],
	});

	if (!cancelled) onDone?.();

	return () => {
		cancelled = true;
	};
};

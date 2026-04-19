/**
 * Simulates an AI agent streaming a UI program to the client.
 *
 * Source-only architecture: there's just one document — the Lion expression
 * tree. Live values live inside the tree at concrete paths; updates are
 * JSON-Patch ops that mutate those paths directly.
 *
 * Two demos:
 *   - simulateAgentStream: "data-style" updates. Source defines a token-card
 *     lambda and calls it with literal price/change values. A ticker patches
 *     those literal values in place at their call-site paths.
 *   - simulateAgentUiStream: "UI-style" updates. The tree itself reshapes
 *     over time — nodes added, replaced, removed.
 */

import type { Message } from "./use-ui-source.ts";

// ─────────── data-stream demo ───────────
//
// Source structure for path reasoning:
//   /0 = "begin"
//   /1 = ["define", "token-card", lambda]
//   /2 = dashboard stack = ["div", props, h1, row, sep, alert]
//       /2/3 = row = ["div", props, card0, card1, card2, (card3?)]
//         /2/3/2 = first card: ["token-card", "ETH", 3250, 0.052]
//           /2/3/2/0 = "token-card" (head)
//           /2/3/2/1 = "ETH" (name arg)
//           /2/3/2/2 = price arg
//           /2/3/2/3 = change arg
//       /2/5 = alert = ["Alert", [AlertTitle], [AlertDescription, "text"]]
//         /2/5/2/1 = alert description text

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
			["token-card", "ETH", 3250, 0.052],
			["token-card", "USDC", 1, 0],
			["token-card", "AAVE", 85, -0.021],
		],
		["Separator"],
		[
			"Alert",
			["AlertTitle", "Health Factor"],
			["AlertDescription", "Health factor: 1.42 (safe)"],
		],
	],
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const jitter = (base: number, pct: number) =>
	base * (1 + (Math.random() - 0.5) * pct);

export const simulateAgentStream = async (
	dispatch: (msg: Message) => void,
	onDone?: () => void,
): Promise<() => void> => {
	dispatch({ kind: "reset", source: dashboard });

	await sleep(400);

	// Update ETH price + change at their call-site paths.
	dispatch({
		kind: "patch",
		ops: [
			{ op: "replace", path: "/2/3/2/2", value: 3275 },
			{ op: "replace", path: "/2/3/2/3", value: 0.061 },
		],
	});

	await sleep(600);

	// Update AAVE price + change, and the alert description.
	dispatch({
		kind: "patch",
		ops: [
			{ op: "replace", path: "/2/3/4/2", value: 83.4 },
			{ op: "replace", path: "/2/3/4/3", value: -0.039 },
			{
				op: "replace",
				path: "/2/5/2/1",
				value: "Health factor: 1.31 (caution)",
			},
		],
	});

	await sleep(600);

	// Append a new WBTC card to the row.
	dispatch({
		kind: "patch",
		ops: [
			{
				op: "add",
				path: "/2/3/-",
				value: ["token-card", "WBTC", 67_400, 0.018],
			},
		],
	});

	await sleep(400);

	// Live price feed — jitter values directly in the source.
	// After the WBTC append, cards live at /2/3/2 (ETH), /2/3/4 (AAVE), /2/3/5 (WBTC).
	// Price sits at index 2 of each card tuple (head=0, name=1, price=2, change=3).
	const tickers: Array<{ path: string; base: number }> = [
		{ path: "/2/3/2/2", base: 3275 }, // ETH price
		{ path: "/2/3/4/2", base: 83.4 }, // AAVE price
		{ path: "/2/3/5/2", base: 67_400 }, // WBTC price
	];

	let stopped = false;
	const interval = setInterval(() => {
		if (stopped) return;
		const ticker = tickers[Math.floor(Math.random() * tickers.length)];
		if (!ticker) return;
		const next = jitter(ticker.base, 0.01);
		dispatch({
			kind: "patch",
			ops: [
				{ op: "replace", path: ticker.path, value: Number(next.toFixed(2)) },
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

// ─────────── structural simulation: tree reshapes over time ───────────
//
// Root shape at every step:
//   ["div", <props>, child0, child1, ...]
// so children start at index 2. Use "-" to append.

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

	// T0: analyzing shell with skeleton.
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
	});

	// T1: replace skeleton with loading group (text + progress bar).
	await step(700, {
		kind: "patch",
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
	await step(500, {
		kind: "patch",
		ops: [{ op: "replace", path: "/3/3/1", value: { value: 72 } }],
	});

	// T3: swap heading, replace loader with Overview card (values inline).
	await step(500, {
		kind: "patch",
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
									["format/usd", 49_125],
								],
								["Badge", { variant: "secondary" }, "12 tokens"],
								["Badge", ["format/percent", 0.031]],
							],
							[
								"p",
								{ className: "text-sm" },
								"Active since 2021 · 847 transactions · 3 chains",
							],
						],
					],
				],
			},
		],
	});

	// T4: neutral risk alert.
	await step(800, {
		kind: "patch",
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
		kind: "patch",
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

	// T6: append a positions table.
	await step(700, {
		kind: "patch",
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
		kind: "patch",
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
		kind: "patch",
		ops: [{ op: "remove", path: "/4" }],
	});

	// T9: success alert.
	await step(400, {
		kind: "patch",
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

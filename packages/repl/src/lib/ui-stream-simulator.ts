// Simulates an AI agent streaming UI updates with realistic delays
// Each phase represents a "thought" from the agent, progressively building a dashboard

import type { UIStreamMessage } from "./use-ui-stream";

type MessageCallback = (msg: UIStreamMessage) => void;

function msg(
	op: UIStreamMessage["op"],
	value: UIStreamMessage["value"],
	path?: string,
): UIStreamMessage {
	return { op, path, value, timestamp: Date.now() };
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function simulateAgentStream(
	onMessage: MessageCallback,
	onComplete: () => void,
): Promise<void> {
	// Phase 1: Loading skeletons (agent is "thinking")
	onMessage(
		msg("replace", {
			$ui: "stack",
			props: {},
			children: [
				{
					$ui: "skeleton",
					props: { height: "2rem", width: "200px" },
					children: [],
				},
				{
					$ui: "row",
					props: {},
					children: [
						{
							$ui: "skeleton",
							props: { height: "8rem", width: "100%" },
							children: [],
						},
						{
							$ui: "skeleton",
							props: { height: "8rem", width: "100%" },
							children: [],
						},
						{
							$ui: "skeleton",
							props: { height: "8rem", width: "100%" },
							children: [],
						},
					],
				},
			],
		}),
	);

	await delay(800);

	// Phase 2: Replace with actual header
	onMessage(
		msg("replace", {
			$ui: "stack",
			props: {},
			children: [
				{
					$ui: "heading",
					props: { level: 1 },
					children: ["DeFi Portfolio Dashboard"],
				},
				{
					$ui: "row",
					props: {},
					children: [
						{ $ui: "badge", props: {}, children: ["● Live"] },
						{
							$ui: "badge",
							props: { variant: "secondary" },
							children: ["Ethereum Mainnet"],
						},
						{
							$ui: "badge",
							props: { variant: "outline" },
							children: ["Block: 19,847,231"],
						},
					],
				},
				{ $ui: "separator", props: {}, children: [] },
			],
		}),
	);

	await delay(600);

	// Phase 3: Append portfolio cards one by one
	onMessage(
		msg("append", {
			$ui: "heading",
			props: { level: 3 },
			children: ["Token Balances"],
		}),
	);

	await delay(200);

	onMessage(
		msg("append", {
			$ui: "row",
			props: { className: "items-stretch" },
			children: [],
		}),
	);

	await delay(300);

	const tokens = [
		{
			name: "ETH",
			balance: "32.5 ETH",
			value: "$104,000",
			change: "+5.2%",
			positive: true,
		},
		{
			name: "USDC",
			balance: "50,000 USDC",
			value: "$50,000",
			change: "0.0%",
			positive: true,
		},
		{
			name: "AAVE",
			balance: "150 AAVE",
			value: "$12,750",
			change: "-2.1%",
			positive: false,
		},
	];

	for (const token of tokens) {
		onMessage(
			msg(
				"append",
				{
					$ui: "card",
					props: {
						title: token.name,
						description: token.balance,
					},
					children: [
						{
							$ui: "stack",
							props: {},
							children: [
								{
									$ui: "text",
									props: { className: "text-2xl font-bold" },
									children: [token.value],
								},
								{
									$ui: "badge",
									props: {
										variant: token.positive
											? "default"
											: "destructive",
									},
									children: [token.change],
								},
							],
						},
					],
				},
				// Target the row we just appended (children/3 is the row)
				"children/3",
			),
		);
		await delay(500);
	}

	await delay(400);

	// Phase 4: Transaction table
	onMessage(
		msg("append", {
			$ui: "separator",
			props: {},
			children: [],
		}),
	);

	await delay(200);

	onMessage(
		msg("append", {
			$ui: "card",
			props: {
				title: "Recent Transactions",
				description: "Last 24 hours",
			},
			children: [
				{
					$ui: "table",
					props: {
						headers: ["Type", "Token", "Amount", "Status"],
						rows: [
							["Swap", "ETH → USDC", "2.5 ETH", "✅ Confirmed"],
							["Stake", "ETH → stETH", "10.0 ETH", "✅ Confirmed"],
							[
								"Borrow",
								"USDC",
								"5,000 USDC",
								"⏳ Pending",
							],
							["Supply", "AAVE → Pool", "50 AAVE", "✅ Confirmed"],
						],
					},
					children: [],
				},
			],
		}),
	);

	await delay(500);

	// Phase 5: Health factor section
	onMessage(
		msg("append", {
			$ui: "separator",
			props: {},
			children: [],
		}),
	);

	await delay(200);

	onMessage(
		msg("append", {
			$ui: "stack",
			props: {},
			children: [
				{
					$ui: "heading",
					props: { level: 3 },
					children: ["Health Factor"],
				},
				{
					$ui: "progress",
					props: { value: 78 },
					children: [],
				},
				{
					$ui: "alert",
					props: { title: "⚠ Position Health: 1.85" },
					children: [
						"Your health factor is above the liquidation threshold of 1.0. Consider adding collateral to improve your safety margin.",
					],
				},
			],
		}),
	);

	await delay(400);

	// Phase 6: Action buttons
	onMessage(
		msg("append", {
			$ui: "separator",
			props: {},
			children: [],
		}),
	);

	await delay(200);

	onMessage(
		msg("append", {
			$ui: "row",
			props: {},
			children: [
				{
					$ui: "button",
					props: {},
					children: ["Swap Tokens"],
				},
				{
					$ui: "button",
					props: { variant: "outline" },
					children: ["Add Collateral"],
				},
				{
					$ui: "button",
					props: { variant: "secondary" },
					children: ["View All Positions"],
				},
				{
					$ui: "button",
					props: { variant: "ghost" },
					children: ["Export Report"],
				},
			],
		}),
	);

	await delay(200);
	onComplete();
}

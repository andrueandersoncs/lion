# Dynamic UI Streaming Prototype — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Enable an AI agent to stream UI components (as Lion expressions) to a React frontend that renders them in real-time using shadcn/ui.

**Architecture:** Lion core gets a `ui` module that produces `$ui`-tagged records (same pattern as the existing `evm` module). The REPL gets a React renderer that maps these tagged records to shadcn components, plus an SSE transport layer for streaming. A demo page shows an AI agent progressively building a dashboard.

**Tech Stack:** Effect.js (Schema, Stream), React 19, TanStack Router, shadcn/ui, SSE (Server-Sent Events), Vite

---

## Task 1: Create UI Schema definitions in core

**Objective:** Define Effect Schemas for `$ui` tagged records that represent UI components.

**Files:**
- Create: `packages/core/src/schemas/ui.ts`

**Code:**

```typescript
import { Schema } from "effect";

// Base UI node — every UI element has this shape
export const UINodeTypeSchema = Schema.Literal(
	"text",
	"heading",
	"button",
	"card",
	"stack",
	"row",
	"badge",
	"separator",
	"alert",
	"skeleton",
	"progress",
	"code",
	"table",
	"input",
	"image",
);

export type UINodeType = typeof UINodeTypeSchema.Type;

export interface UINode {
	readonly $ui: UINodeType;
	readonly props?: Record<string, unknown>;
	readonly children?: ReadonlyArray<UINode | string | number | boolean>;
}

export const UINodeSchema: Schema.Schema<UINode> = Schema.suspend(() =>
	Schema.Struct({
		$ui: UINodeTypeSchema,
		props: Schema.optional(
			Schema.Record({ key: Schema.String, value: Schema.Unknown }),
		),
		children: Schema.optional(
			Schema.Array(
				Schema.Union(
					UINodeSchema,
					Schema.String,
					Schema.Number,
					Schema.Boolean,
				),
			),
		),
	}),
);

// Stream message types for incremental updates
export const UIStreamOperationSchema = Schema.Literal(
	"replace", // Replace the entire UI tree
	"append", // Append children to a target node
	"update", // Update props of a target node
	"clear", // Clear the UI
);

export type UIStreamOperation = typeof UIStreamOperationSchema.Type;

export interface UIStreamMessage {
	readonly op: UIStreamOperation;
	readonly path?: string; // JSON pointer to target node (e.g., "/children/0")
	readonly value: UINode | string | number | boolean | null;
	readonly timestamp: number;
}

export const UIStreamMessageSchema: Schema.Schema<UIStreamMessage> =
	Schema.Struct({
		op: UIStreamOperationSchema,
		path: Schema.optional(Schema.String),
		value: Schema.Union(UINodeSchema, Schema.String, Schema.Number, Schema.Boolean, Schema.Null),
		timestamp: Schema.Number,
	});
```

**Verify:** `turbo typecheck --filter=@lionlang/core`

---

## Task 2: Create UI module with component constructor functions

**Objective:** Add Lion-callable functions for building UI trees: `ui/text`, `ui/heading`, `ui/button`, `ui/card`, `ui/stack`, `ui/row`, `ui/badge`, `ui/separator`, `ui/alert`, `ui/code`, `ui/progress`, `ui/table`, `ui/image`.

**Files:**
- Create: `packages/core/src/modules/ui.ts`
- Modify: `packages/core/src/modules/index.ts` (add ui to stdlib)

**Code for `modules/ui.ts`:**

```typescript
import { Effect, Schema } from "effect";
import type { UINode } from "../schemas/ui.js";

// Helper: normalize children from Lion call args
const normalizeChildren = (
	args: ReadonlyArray<unknown>,
): ReadonlyArray<UINode | string | number | boolean> =>
	args.map((arg) => {
		if (typeof arg === "string" || typeof arg === "number" || typeof arg === "boolean") {
			return arg;
		}
		// Assume it's already a UINode (has $ui field)
		return arg as UINode;
	});

// Helper: make a component constructor
const makeComponent =
	(type: UINode["$ui"]) =>
	(...args: unknown[]) => {
		// If the first arg is a plain object without $ui, treat it as props
		const firstArg = args[0];
		const hasProps =
			firstArg !== null &&
			typeof firstArg === "object" &&
			!Array.isArray(firstArg) &&
			!("$ui" in (firstArg as Record<string, unknown>));

		const props = hasProps ? (firstArg as Record<string, unknown>) : undefined;
		const childArgs = hasProps ? args.slice(1) : args;
		const children =
			childArgs.length > 0 ? normalizeChildren(childArgs) : undefined;

		const node: UINode = {
			$ui: type,
			...(props !== undefined ? { props } : {}),
			...(children !== undefined ? { children } : {}),
		};

		return Effect.succeed(node);
	};

// --- Component constructors ---

export const text = makeComponent("text");
export const heading = makeComponent("heading");
export const button = makeComponent("button");
export const card = makeComponent("card");
export const stack = makeComponent("stack");
export const row = makeComponent("row");
export const badge = makeComponent("badge");
export const separator = makeComponent("separator");
export const alert = makeComponent("alert");
export const skeleton = makeComponent("skeleton");
export const progress = makeComponent("progress");
export const code = makeComponent("code");
export const table = makeComponent("table");
export const input = makeComponent("input");
export const image = makeComponent("image");

// Special: ui/fragment — groups children without a wrapper
export const fragment = (...args: unknown[]) => {
	const children = normalizeChildren(args);
	return Effect.succeed({ $ui: "stack" as const, props: { fragment: true }, children });
};

// Special: ui/render — identity, marks a tree as "ready to render"
export const render = (...args: unknown[]) => {
	const node = args[0];
	return Effect.succeed(node);
};
```

**Modification to `modules/index.ts`:** Add:

```typescript
import * as ui from "./ui.js";

// In the record where stdlib entries are assembled:
...namespaceEntries("ui", ui),
```

**Verify:** `turbo typecheck --filter=@lionlang/core`

---

## Task 3: Write tests for UI module

**Objective:** Test that Lion programs can construct UI trees using the ui module.

**Files:**
- Create: `packages/core/src/modules/tests/ui.test.ts`

**Code:**

```typescript
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { run } from "../../evaluation/evaluate.js";
import { stdlib } from "../index.js";

describe("ui module", () => {
	it("creates a text node", () =>
		Effect.gen(function* () {
			const result = yield* run(["ui/text", "Hello World"], stdlib);
			expect(result).toEqual({
				$ui: "text",
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

	it("creates a button with onClick prop", () =>
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
						children: [
							{ $ui: "text", children: ["ETH: $3,200"] },
							{ $ui: "text", children: ["BTC: $65,000"] },
						],
					},
				],
			});
		}));

	it("creates a row with badge children", () =>
		Effect.gen(function* () {
			const result = yield* run(
				["ui/row", ["ui/badge", "Active"], ["ui/badge", { variant: "destructive" }, "High Risk"]],
				stdlib,
			);
			expect(result).toEqual({
				$ui: "row",
				children: [
					{ $ui: "badge", children: ["Active"] },
					{ $ui: "badge", props: { variant: "destructive" }, children: ["High Risk"] },
				],
			});
		}));

	it("creates a progress bar with value", () =>
		Effect.gen(function* () {
			const result = yield* run(
				["ui/progress", { value: 75 }],
				stdlib,
			);
			expect(result).toEqual({
				$ui: "progress",
				props: { value: 75 },
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
```

**Verify:** `turbo test --filter=@lionlang/core`

---

## Task 4: Create the React UI renderer component

**Objective:** Build a React component that recursively renders `$ui` tagged records into shadcn/ui components.

**Files:**
- Create: `packages/repl/src/components/ui-renderer.tsx`

**Code:**

```tsx
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// A $ui node from Lion
interface UINode {
	readonly $ui: string;
	readonly props?: Record<string, unknown>;
	readonly children?: ReadonlyArray<UINode | string | number | boolean>;
}

function isUINode(value: unknown): value is UINode {
	return (
		value !== null &&
		typeof value === "object" &&
		"$ui" in (value as Record<string, unknown>)
	);
}

function renderChild(
	child: UINode | string | number | boolean,
	index: number,
): React.ReactNode {
	if (isUINode(child)) {
		return <UIRenderer key={index} node={child} />;
	}
	return <span key={index}>{String(child)}</span>;
}

function renderChildren(
	children?: ReadonlyArray<UINode | string | number | boolean>,
): React.ReactNode {
	if (!children || children.length === 0) return null;
	return children.map((child, i) => renderChild(child, i));
}

// Component map
const renderers: Record<
	string,
	(props: Record<string, unknown>, children: React.ReactNode) => React.ReactNode
> = {
	text: (_props, children) => (
		<p className={cn("text-sm", _props.className as string)}>{children}</p>
	),

	heading: (props, children) => {
		const level = (props.level as number) ?? 1;
		const Tag = `h${Math.min(Math.max(level, 1), 6)}` as keyof JSX.IntrinsicElements;
		const sizes: Record<number, string> = {
			1: "text-3xl font-bold",
			2: "text-2xl font-semibold",
			3: "text-xl font-semibold",
			4: "text-lg font-medium",
		};
		return <Tag className={cn(sizes[level] ?? "text-lg font-medium", "tracking-tight")}>{children}</Tag>;
	},

	button: (props, children) => (
		<Button
			variant={(props.variant as "default" | "outline" | "destructive" | "ghost" | "secondary") ?? "default"}
			size={(props.size as "default" | "sm" | "lg" | "icon") ?? "default"}
			disabled={props.disabled as boolean}
		>
			{children}
		</Button>
	),

	card: (props, children) => (
		<Card className="w-full">
			{(props.title || props.description) && (
				<CardHeader>
					{props.title && <CardTitle>{props.title as string}</CardTitle>}
					{props.description && (
						<CardDescription>{props.description as string}</CardDescription>
					)}
				</CardHeader>
			)}
			<CardContent>{children}</CardContent>
		</Card>
	),

	stack: (props, children) => (
		<div
			className={cn(
				"flex flex-col",
				props.gap ? `gap-${props.gap}` : "gap-3",
				props.fragment && "contents",
				props.className as string,
			)}
		>
			{children}
		</div>
	),

	row: (props, children) => (
		<div
			className={cn(
				"flex flex-row items-center",
				props.gap ? `gap-${props.gap}` : "gap-3",
				props.wrap && "flex-wrap",
				props.className as string,
			)}
		>
			{children}
		</div>
	),

	badge: (props, children) => (
		<Badge
			variant={
				(props.variant as "default" | "secondary" | "destructive" | "outline") ?? "default"
			}
		>
			{children}
		</Badge>
	),

	separator: () => <Separator />,

	alert: (props, children) => (
		<Alert variant={(props.variant as "default" | "destructive") ?? "default"}>
			{props.title && <AlertTitle>{props.title as string}</AlertTitle>}
			<AlertDescription>{children}</AlertDescription>
		</Alert>
	),

	skeleton: (props) => (
		<Skeleton
			className={cn(
				props.width ? `w-[${props.width}]` : "w-full",
				props.height ? `h-[${props.height}]` : "h-4",
			)}
		/>
	),

	progress: (props) => <Progress value={(props.value as number) ?? 0} />,

	code: (props, children) => (
		<pre
			className={cn(
				"rounded-md bg-muted p-4 font-mono text-sm overflow-x-auto",
				props.className as string,
			)}
		>
			<code>{children}</code>
		</pre>
	),

	table: (props, children) => {
		const headers = (props.headers as string[]) ?? [];
		const rows = (props.rows as unknown[][]) ?? [];
		return (
			<Table>
				{headers.length > 0 && (
					<TableHeader>
						<TableRow>
							{headers.map((h: string, i: number) => (
								<TableHead key={i}>{h}</TableHead>
							))}
						</TableRow>
					</TableHeader>
				)}
				<TableBody>
					{rows.length > 0
						? rows.map((row: unknown[], ri: number) => (
								<TableRow key={ri}>
									{(row as string[]).map((cell: string, ci: number) => (
										<TableCell key={ci}>{cell}</TableCell>
									))}
								</TableRow>
							))
						: children}
				</TableBody>
			</Table>
		);
	},

	input: (props) => (
		<Input
			type={(props.type as string) ?? "text"}
			placeholder={(props.placeholder as string) ?? ""}
			disabled={props.disabled as boolean}
		/>
	),

	image: (props) => (
		<img
			src={props.src as string}
			alt={(props.alt as string) ?? ""}
			className={cn("rounded-md max-w-full", props.className as string)}
		/>
	),
};

export function UIRenderer({ node }: { node: UINode }) {
	const renderer = renderers[node.$ui];

	if (!renderer) {
		return (
			<div className="rounded border border-destructive p-2 text-destructive text-sm">
				Unknown UI component: {node.$ui}
			</div>
		);
	}

	const props = node.props ?? {};
	const children = renderChildren(node.children);

	return <>{renderer(props, children)}</>;
}

// Entry point: render any value, detecting $ui nodes
export function DynamicUI({ value }: { value: unknown }) {
	if (isUINode(value)) {
		return <UIRenderer node={value} />;
	}
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return <span>{String(value)}</span>;
	}
	return (
		<pre className="text-xs text-muted-foreground">
			{JSON.stringify(value, null, 2)}
		</pre>
	);
}
```

**Verify:** `turbo typecheck --filter=@lionlang/repl`

---

## Task 5: Create SSE streaming hook and server route

**Objective:** Build the transport layer — an SSE endpoint that streams UI messages and a React hook that consumes them.

**Files:**
- Create: `packages/repl/src/lib/use-ui-stream.ts` (React hook)
- Create: `packages/repl/src/lib/ui-stream-simulator.ts` (simulated AI agent for demo)

**Code for `use-ui-stream.ts`:**

```typescript
import { useCallback, useRef, useState } from "react";

interface UINode {
	readonly $ui: string;
	readonly props?: Record<string, unknown>;
	readonly children?: ReadonlyArray<UINode | string | number | boolean>;
}

interface UIStreamMessage {
	readonly op: "replace" | "append" | "update" | "clear";
	readonly path?: string;
	readonly value: UINode | string | number | boolean | null;
	readonly timestamp: number;
}

interface UseUIStreamOptions {
	onMessage?: (message: UIStreamMessage) => void;
}

export function useUIStream(options?: UseUIStreamOptions) {
	const [ui, setUI] = useState<UINode | null>(null);
	const [isStreaming, setIsStreaming] = useState(false);
	const [messages, setMessages] = useState<UIStreamMessage[]>([]);
	const eventSourceRef = useRef<EventSource | null>(null);

	const applyMessage = useCallback(
		(msg: UIStreamMessage) => {
			setMessages((prev) => [...prev, msg]);
			options?.onMessage?.(msg);

			switch (msg.op) {
				case "replace":
					setUI(msg.value as UINode);
					break;
				case "append":
					setUI((prev) => {
						if (!prev) return msg.value as UINode;
						// Deep clone and append to target path
						const next = JSON.parse(JSON.stringify(prev)) as UINode;
						if (msg.path) {
							const target = navigatePath(next, msg.path);
							if (target && Array.isArray(target.children)) {
								(target.children as unknown[]).push(msg.value);
							} else if (target) {
								(target as { children: unknown[] }).children = [msg.value];
							}
						} else {
							// Append to root children
							if (Array.isArray(next.children)) {
								(next.children as unknown[]).push(msg.value);
							} else {
								(next as { children: unknown[] }).children = [msg.value];
							}
						}
						return next;
					});
					break;
				case "update":
					setUI((prev) => {
						if (!prev) return prev;
						const next = JSON.parse(JSON.stringify(prev)) as UINode;
						if (msg.path) {
							const target = navigatePath(next, msg.path);
							if (target && typeof msg.value === "object" && msg.value !== null) {
								(target as { props: Record<string, unknown> }).props = {
									...(target.props ?? {}),
									...((msg.value as Record<string, unknown>).props ?? {}),
								};
							}
						}
						return next;
					});
					break;
				case "clear":
					setUI(null);
					break;
			}
		},
		[options],
	);

	// Connect to an SSE endpoint
	const connectSSE = useCallback(
		(url: string) => {
			eventSourceRef.current?.close();
			setIsStreaming(true);
			setMessages([]);

			const es = new EventSource(url);
			eventSourceRef.current = es;

			es.onmessage = (event) => {
				try {
					const msg = JSON.parse(event.data) as UIStreamMessage;
					applyMessage(msg);
				} catch {
					// ignore parse errors
				}
			};

			es.onerror = () => {
				setIsStreaming(false);
				es.close();
			};

			es.addEventListener("done", () => {
				setIsStreaming(false);
				es.close();
			});
		},
		[applyMessage],
	);

	// Process messages directly (for local simulation)
	const pushMessage = useCallback(
		(msg: UIStreamMessage) => {
			applyMessage(msg);
		},
		[applyMessage],
	);

	const disconnect = useCallback(() => {
		eventSourceRef.current?.close();
		setIsStreaming(false);
	}, []);

	const reset = useCallback(() => {
		disconnect();
		setUI(null);
		setMessages([]);
	}, [disconnect]);

	return {
		ui,
		isStreaming,
		messages,
		connectSSE,
		pushMessage,
		disconnect,
		reset,
	};
}

// Navigate a UINode tree by JSON pointer-like path
function navigatePath(root: UINode, path: string): UINode | null {
	const segments = path.split("/").filter(Boolean);
	let current: unknown = root;

	for (const segment of segments) {
		if (current === null || typeof current !== "object") return null;

		if (segment === "children") {
			current = (current as UINode).children;
		} else if (Array.isArray(current)) {
			const index = Number.parseInt(segment, 10);
			if (Number.isNaN(index)) return null;
			current = current[index];
		} else {
			current = (current as Record<string, unknown>)[segment];
		}
	}

	return current as UINode | null;
}
```

**Code for `ui-stream-simulator.ts`:**

```typescript
// Simulates an AI agent streaming UI updates with realistic delays

interface UINode {
	readonly $ui: string;
	readonly props?: Record<string, unknown>;
	readonly children?: ReadonlyArray<UINode | string | number | boolean>;
}

interface UIStreamMessage {
	readonly op: "replace" | "append" | "update" | "clear";
	readonly path?: string;
	readonly value: UINode | string | number | boolean | null;
	readonly timestamp: number;
}

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

export async function simulateAgentStream(onMessage: MessageCallback): Promise<void> {
	// Phase 1: Agent starts with a loading skeleton
	onMessage(
		msg("replace", {
			$ui: "stack",
			props: { className: "p-6 max-w-4xl mx-auto" },
			children: [
				{ $ui: "skeleton", props: { height: "2rem", width: "200px" } },
				{
					$ui: "row",
					children: [
						{ $ui: "skeleton", props: { height: "8rem", width: "100%" } },
						{ $ui: "skeleton", props: { height: "8rem", width: "100%" } },
						{ $ui: "skeleton", props: { height: "8rem", width: "100%" } },
					],
				},
			],
		}),
	);

	await delay(800);

	// Phase 2: Replace with actual heading
	onMessage(
		msg("replace", {
			$ui: "stack",
			props: { className: "p-6 max-w-4xl mx-auto" },
			children: [
				{
					$ui: "heading",
					props: { level: 1 },
					children: ["DeFi Portfolio Dashboard"],
				},
				{
					$ui: "row",
					props: { className: "items-stretch" },
					children: [
						{ $ui: "badge", children: ["Live"] },
						{ $ui: "badge", props: { variant: "secondary" }, children: ["Ethereum Mainnet"] },
					],
				},
			],
		}),
	);

	await delay(600);

	// Phase 3: Append portfolio cards one by one
	onMessage(
		msg("append", {
			$ui: "row",
			props: { className: "items-stretch w-full" },
		}),
	);

	await delay(400);

	const tokens = [
		{ name: "ETH", balance: "32.5", value: "$104,000", change: "+5.2%" },
		{ name: "USDC", balance: "50,000", value: "$50,000", change: "0.0%" },
		{ name: "AAVE", balance: "150", value: "$12,750", change: "-2.1%" },
	];

	for (const token of tokens) {
		onMessage(
			msg(
				"append",
				{
					$ui: "card",
					props: { title: token.name, description: `Balance: ${token.balance}` },
					children: [
						{
							$ui: "stack",
							children: [
								{ $ui: "text", props: { className: "text-2xl font-bold" }, children: [token.value] },
								{
									$ui: "badge",
									props: {
										variant: token.change.startsWith("-") ? "destructive" : "default",
									},
									children: [token.change],
								},
							],
						},
					],
				},
				"/children/2",
			),
		);
		await delay(500);
	}

	await delay(300);

	// Phase 4: Add a transaction table
	onMessage(
		msg("append", {
			$ui: "card",
			props: { title: "Recent Transactions", description: "Last 24 hours" },
			children: [
				{
					$ui: "table",
					props: {
						headers: ["Type", "Token", "Amount", "Status"],
						rows: [
							["Swap", "ETH → USDC", "2.5 ETH", "✅ Confirmed"],
							["Stake", "ETH", "10.0 ETH", "✅ Confirmed"],
							["Borrow", "USDC", "5,000 USDC", "⏳ Pending"],
							["Supply", "AAVE", "50 AAVE", "✅ Confirmed"],
						],
					},
				},
			],
		}),
	);

	await delay(400);

	// Phase 5: Add health/risk section
	onMessage(
		msg("append", {
			$ui: "stack",
			children: [
				{ $ui: "heading", props: { level: 3 }, children: ["Health Factor"] },
				{ $ui: "progress", props: { value: 78 } },
				{
					$ui: "row",
					children: [
						{
							$ui: "alert",
							props: { title: "Position Health" },
							children: ["Your health factor is 1.85 — above the liquidation threshold of 1.0. Consider adding collateral to improve safety margin."],
						},
					],
				},
			],
		}),
	);

	await delay(300);

	// Phase 6: Add action buttons
	onMessage(
		msg("append", {
			$ui: "row",
			props: { className: "pt-4" },
			children: [
				{ $ui: "button", children: ["Swap Tokens"] },
				{ $ui: "button", props: { variant: "outline" }, children: ["Add Collateral"] },
				{ $ui: "button", props: { variant: "secondary" }, children: ["View All Positions"] },
				{ $ui: "button", props: { variant: "ghost" }, children: ["Export Report"] },
			],
		}),
	);
}
```

**Verify:** `turbo typecheck --filter=@lionlang/repl`

---

## Task 6: Create the demo page route

**Objective:** Add a `/stream` route in the REPL that demonstrates the AI-streamed UI.

**Files:**
- Create: `packages/repl/src/routes/stream.tsx`
- Modify: `packages/repl/src/routes/__root.tsx` (add nav link if needed)

**Code for `routes/stream.tsx`:**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { DynamicUI } from "../components/ui-renderer";
import { useUIStream } from "../lib/use-ui-stream";
import { simulateAgentStream } from "../lib/ui-stream-simulator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/stream")({
	component: StreamDemo,
});

function StreamDemo() {
	const { ui, isStreaming, messages, pushMessage, reset } = useUIStream();
	const [showMessages, setShowMessages] = useState(false);

	const startDemo = useCallback(async () => {
		reset();
		await simulateAgentStream(pushMessage);
	}, [pushMessage, reset]);

	return (
		<div className="min-h-screen bg-background">
			{/* Header */}
			<div className="border-b">
				<div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<h1 className="text-xl font-semibold tracking-tight">
							Lion UI Stream
						</h1>
						<Badge variant={isStreaming ? "default" : "secondary"}>
							{isStreaming ? "● Streaming" : "○ Idle"}
						</Badge>
					</div>
					<div className="flex items-center gap-2">
						<Button onClick={startDemo} disabled={isStreaming}>
							{isStreaming ? "Streaming..." : "▶ Run Agent Demo"}
						</Button>
						<Button variant="outline" onClick={reset}>
							Reset
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setShowMessages((s) => !s)}
						>
							{showMessages ? "Hide" : "Show"} Messages ({messages.length})
						</Button>
					</div>
				</div>
			</div>

			<div className="max-w-6xl mx-auto px-6 py-6">
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					{/* Main render area */}
					<div className={showMessages ? "lg:col-span-2" : "lg:col-span-3"}>
						<Card>
							<CardHeader>
								<CardTitle className="text-sm font-medium text-muted-foreground">
									Rendered UI
								</CardTitle>
								<CardDescription>
									Components streamed from the AI agent appear here in real-time
								</CardDescription>
							</CardHeader>
							<CardContent>
								{ui ? (
									<DynamicUI value={ui} />
								) : (
									<div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
										<p className="text-lg">No UI rendered yet</p>
										<p className="text-sm mt-1">
											Click "Run Agent Demo" to start streaming
										</p>
									</div>
								)}
							</CardContent>
						</Card>
					</div>

					{/* Message log sidebar */}
					{showMessages && (
						<div className="lg:col-span-1">
							<Card>
								<CardHeader>
									<CardTitle className="text-sm font-medium text-muted-foreground">
										Stream Messages
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="space-y-2 max-h-[70vh] overflow-y-auto">
										{messages.map((msg, i) => (
											<div
												key={i}
												className="rounded-md bg-muted p-2 text-xs font-mono"
											>
												<div className="flex items-center gap-2 mb-1">
													<Badge variant="outline" className="text-[10px]">
														{msg.op}
													</Badge>
													{msg.path && (
														<span className="text-muted-foreground">
															{msg.path}
														</span>
													)}
												</div>
												<pre className="whitespace-pre-wrap break-all text-[10px]">
													{JSON.stringify(msg.value, null, 2).slice(0, 200)}
													{JSON.stringify(msg.value, null, 2).length > 200 && "..."}
												</pre>
											</div>
										))}
										{messages.length === 0 && (
											<p className="text-muted-foreground text-sm text-center py-4">
												No messages yet
											</p>
										)}
									</div>
								</CardContent>
							</Card>
						</div>
					)}
				</div>

				{/* Info section */}
				<div className="mt-8">
					<Separator />
					<div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
						<Card>
							<CardHeader>
								<CardTitle className="text-sm">How It Works</CardTitle>
							</CardHeader>
							<CardContent className="text-sm text-muted-foreground">
								<p>
									An AI agent evaluates Lion expressions that produce{" "}
									<code className="text-foreground">$ui</code> tagged records.
									These are streamed as JSON messages and rendered into React
									components in real-time.
								</p>
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle className="text-sm">Lion Expression</CardTitle>
							</CardHeader>
							<CardContent>
								<pre className="text-xs font-mono bg-muted p-2 rounded-md">
{`["ui/card",
  {"title": "Balance"},
  ["ui/text", "$3,200"]]`}
								</pre>
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle className="text-sm">Stream Protocol</CardTitle>
							</CardHeader>
							<CardContent className="text-sm text-muted-foreground">
								<p>
									Messages use 4 operations:{" "}
									<code className="text-foreground">replace</code>,{" "}
									<code className="text-foreground">append</code>,{" "}
									<code className="text-foreground">update</code>,{" "}
									<code className="text-foreground">clear</code>
									— with JSON pointer paths for targeting specific nodes.
								</p>
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		</div>
	);
}
```

**Verify:** `turbo dev --filter=@lionlang/repl` then visit `http://localhost:3000/stream`

---

## Task 7: Export UI schemas from core package

**Objective:** Make sure the ui schemas and module are properly exported from the core package.

**Files:**
- Modify: `packages/core/src/index.ts`

**Changes:** Add the UI schema and type exports:

```typescript
// Add to existing exports:
export type { UINode, UINodeType, UIStreamMessage, UIStreamOperation } from "./schemas/ui.js";
export { UINodeSchema, UIStreamMessageSchema } from "./schemas/ui.js";
```

**Verify:** `turbo build --filter=@lionlang/core`

---

## Task 8: End-to-end verification

**Objective:** Build everything, run all tests, start the dev server and verify the demo works.

**Steps:**
1. `bun install` (pick up any changes)
2. `turbo build` (full build)
3. `turbo test --filter=@lionlang/core` (core tests pass including ui)
4. `turbo dev --filter=@lionlang/repl` (start dev server)
5. Visit `http://localhost:3000/stream`
6. Click "Run Agent Demo" — verify streaming UI renders progressively
7. Click "Show Messages" — verify message log shows operations
8. Click "Reset" — verify UI clears

---

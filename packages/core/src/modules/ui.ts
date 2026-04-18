import { Effect } from "effect";

/**
 * UI component constructor module.
 *
 * Provides pure constructor functions that build tagged records with a `$ui`
 * discriminant. Each constructor creates a node of the form:
 *
 *   { $ui: "typeName", props: { ... }, children: [ ... ] }
 *
 * The first argument may optionally be a plain props object (detected by the
 * absence of a `$ui` field). All remaining arguments are treated as children.
 *
 * These records are inert data — rendering is performed by the host.
 */

export const UiTag = "$ui" as const;

// ─────────────── Types ───────────────

export type UiNode = {
	readonly [UiTag]: string;
	readonly props: Record<string, unknown>;
	readonly children: readonly unknown[];
};

// ─────────────── Helpers ───────────────

const isRecord = (u: unknown): u is Record<string, unknown> =>
	typeof u === "object" && u !== null && !Array.isArray(u);

const isPropsObject = (u: unknown): u is Record<string, unknown> =>
	isRecord(u) && !(UiTag in u);

const makeComponent =
	(type: string) =>
	(...args: unknown[]): Effect.Effect<UiNode> => {
		let props: Record<string, unknown> = {};
		let children: unknown[];

		if (args.length > 0 && isPropsObject(args[0])) {
			props = args[0] as Record<string, unknown>;
			children = args.slice(1);
		} else {
			children = args;
		}

		return Effect.succeed({
			[UiTag]: type,
			props,
			children,
		} as UiNode);
	};

// ─────────────── Module ───────────────

export const module: Record<string, (...args: unknown[]) => Effect.Effect<UiNode>> = {
	text: makeComponent("text"),
	heading: makeComponent("heading"),
	button: makeComponent("button"),
	card: makeComponent("card"),
	stack: makeComponent("stack"),
	row: makeComponent("row"),
	badge: makeComponent("badge"),
	separator: makeComponent("separator"),
	alert: makeComponent("alert"),
	skeleton: makeComponent("skeleton"),
	progress: makeComponent("progress"),
	code: makeComponent("code"),
	table: makeComponent("table"),
	input: makeComponent("input"),
	image: makeComponent("image"),
	fragment: makeComponent("fragment"),
	render: makeComponent("render"),
};

// ─────────────── Type guards ───────────────

export const isUiNode = (u: unknown): u is UiNode =>
	isRecord(u) && typeof (u as Record<string, unknown>)[UiTag] === "string";

export const uiKind = (u: UiNode): string => u[UiTag];

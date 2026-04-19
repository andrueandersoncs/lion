/**
 * UI environment for Lion.
 *
 * Every binding is a React component (or HTML tag name) wrapped with
 * `asComponent`, which turns it into a Lion-callable that does
 * `createElement(C, props, ...children)`.
 *
 * Lion source like `["Card", {className: "w-full"}, ["CardContent", "hi"]]`
 * evaluates to a real React element tree — no $ui intermediate, no bespoke
 * per-component wrappers.
 *
 * Calling convention: first arg may be a plain props object (record without
 * a React `$$typeof` marker); remaining args are children.
 */

import {
	Fragment,
	type ComponentType,
	type ReactElement,
	type ReactNode,
	createElement,
	isValidElement,
} from "react";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@/components/ui/alert";
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

type Props = Record<string, unknown>;

const isPlainObject = (u: unknown): u is Props =>
	u !== null &&
	typeof u === "object" &&
	!Array.isArray(u) &&
	!isValidElement(u);

const toReactNode = (value: unknown): ReactNode => {
	if (value === null || value === undefined) return null;
	if (typeof value === "boolean") return null;
	if (typeof value === "string" || typeof value === "number") return value;
	if (isValidElement(value)) return value;
	if (Array.isArray(value)) return value.map(toReactNode);
	return JSON.stringify(value);
};

const splitArgs = (args: unknown[]): { props: Props; children: ReactNode[] } => {
	const [first, ...rest] = args;
	const hasProps = isPlainObject(first);
	const props = hasProps ? (first as Props) : {};
	const childArgs = hasProps ? rest : args;
	return { props, children: childArgs.map(toReactNode) };
};

const withKeys = (children: ReactNode[]): ReactNode[] =>
	children.map((child, i) =>
		isValidElement(child) && child.key !== null
			? child
			: createElement(Fragment, { key: i }, child),
	);

// Universal wrapper: `C` can be a React component or an HTML tag name.
// Lion calls this with (maybeProps?, ...children); we forward to createElement.
const asComponent =
	<P,>(C: ComponentType<P> | string) =>
	(...args: unknown[]): ReactElement =>
		createElement(
			C as ComponentType<Props>,
			splitArgs(args).props,
			...withKeys(splitArgs(args).children),
		);

const wrapAll = (
	components: Record<string, ComponentType<unknown> | string>,
): Record<string, (...args: unknown[]) => ReactElement> =>
	Object.fromEntries(
		Object.entries(components).map(([name, C]) => [name, asComponent(C)]),
	);

const fmt =
	<A,>(fn: (input: A) => string) =>
	(input: unknown): string =>
		fn(input as A);

export const makeUiEnv = (
	userBindings: Record<string, unknown> = {},
): Record<string, unknown> => ({
	// ShadCN components — called by name from Lion source.
	...wrapAll({
		Alert,
		AlertDescription,
		AlertTitle,
		Badge,
		Button,
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle,
		Input,
		Progress,
		Separator,
		Skeleton,
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow,
	} as Record<string, ComponentType<unknown>>),

	// HTML intrinsics for layout + text.
	...wrapAll({
		div: "div",
		span: "span",
		p: "p",
		h1: "h1",
		h2: "h2",
		h3: "h3",
		h4: "h4",
		h5: "h5",
		h6: "h6",
		pre: "pre",
		code: "code",
		img: "img",
		Fragment: Fragment as unknown as string,
	}),

	// Formatters (pure string transforms).
	"format/usd": fmt<number>(
		(n) =>
			`$${n.toLocaleString("en-US", {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			})}`,
	),

	"format/percent": fmt<number>((n) => {
		const sign = n > 0 ? "+" : "";
		return `${sign}${(n * 100).toFixed(1)}%`;
	}),

	"format/compact": fmt<number>((n) => {
		const abs = Math.abs(n);
		if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
		if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
		if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
		return n.toString();
	}),

	"format/address": fmt<string>(
		(addr) => `${addr.slice(0, 6)}…${addr.slice(-4)}`,
	),

	...userBindings,
});

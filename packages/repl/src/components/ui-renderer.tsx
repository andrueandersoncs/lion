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

// A $ui node from Lion evaluation
interface UINode {
	readonly $ui: string;
	readonly props: Record<string, unknown>;
	readonly children: readonly (UINode | string | number | boolean)[];
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
	children: readonly (UINode | string | number | boolean)[],
): React.ReactNode {
	if (children.length === 0) return null;
	return children.map((child, i) => renderChild(child, i));
}

// Component renderers — maps $ui type to React element
const renderers: Record<
	string,
	(
		props: Record<string, unknown>,
		children: React.ReactNode,
	) => React.ReactNode
> = {
	text: (p, children) => (
		<p className={cn("text-sm", p.className as string)}>{children}</p>
	),

	heading: (p, children) => {
		const level = (p.level as number) ?? 1;
		const Tag = `h${Math.min(Math.max(level, 1), 6)}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
		const sizes: Record<number, string> = {
			1: "text-3xl font-bold",
			2: "text-2xl font-semibold",
			3: "text-xl font-semibold",
			4: "text-lg font-medium",
			5: "text-base font-medium",
			6: "text-sm font-medium",
		};
		return (
			<Tag className={cn(sizes[level] ?? "text-lg font-medium", "tracking-tight")}>
				{children}
			</Tag>
		);
	},

	button: (p, children) => (
		<Button
			variant={
				(p.variant as
					| "default"
					| "outline"
					| "destructive"
					| "ghost"
					| "secondary") ?? "default"
			}
			size={(p.size as "default" | "sm" | "lg" | "icon") ?? "default"}
			disabled={p.disabled as boolean}
		>
			{children}
		</Button>
	),

	card: (p, children) => (
		<Card className="w-full">
			{(p.title || p.description) && (
				<CardHeader>
					{p.title && <CardTitle>{p.title as string}</CardTitle>}
					{p.description && (
						<CardDescription>{p.description as string}</CardDescription>
					)}
				</CardHeader>
			)}
			<CardContent>{children}</CardContent>
		</Card>
	),

	stack: (p, children) => (
		<div
			className={cn(
				"flex flex-col gap-3",
				p.fragment && "contents",
				p.className as string,
			)}
		>
			{children}
		</div>
	),

	row: (p, children) => (
		<div
			className={cn(
				"flex flex-row items-center gap-3",
				p.wrap && "flex-wrap",
				p.className as string,
			)}
		>
			{children}
		</div>
	),

	badge: (p, children) => (
		<Badge
			variant={
				(p.variant as
					| "default"
					| "secondary"
					| "destructive"
					| "outline") ?? "default"
			}
		>
			{children}
		</Badge>
	),

	separator: () => <Separator />,

	alert: (p, children) => (
		<Alert
			variant={(p.variant as "default" | "destructive") ?? "default"}
		>
			{p.title && <AlertTitle>{p.title as string}</AlertTitle>}
			<AlertDescription>{children}</AlertDescription>
		</Alert>
	),

	skeleton: (p) => (
		<Skeleton
			className={cn(
				p.width ? `w-[${p.width}]` : "w-full",
				p.height ? `h-[${p.height}]` : "h-4",
			)}
		/>
	),

	progress: (p) => <Progress value={(p.value as number) ?? 0} />,

	code: (p, children) => (
		<pre
			className={cn(
				"rounded-md bg-muted p-4 font-mono text-sm overflow-x-auto",
				p.className as string,
			)}
		>
			<code>{children}</code>
		</pre>
	),

	table: (p) => {
		const headers = (p.headers as string[]) ?? [];
		const rows = (p.rows as string[][]) ?? [];
		return (
			<Table>
				{headers.length > 0 && (
					<TableHeader>
						<TableRow>
							{headers.map((h, i) => (
								<TableHead key={i}>{h}</TableHead>
							))}
						</TableRow>
					</TableHeader>
				)}
				<TableBody>
					{rows.map((row, ri) => (
						<TableRow key={ri}>
							{row.map((cell, ci) => (
								<TableCell key={ci}>{cell}</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</Table>
		);
	},

	input: (p) => (
		<Input
			type={(p.type as string) ?? "text"}
			placeholder={(p.placeholder as string) ?? ""}
			disabled={p.disabled as boolean}
		/>
	),

	image: (p) => (
		<img
			src={p.src as string}
			alt={(p.alt as string) ?? ""}
			className={cn("rounded-md max-w-full", p.className as string)}
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
	const children = renderChildren(node.children ?? []);

	return <>{renderer(props, children)}</>;
}

// Entry point: render any value, auto-detecting $ui nodes
export function DynamicUI({ value }: { value: unknown }) {
	if (isUINode(value)) {
		return <UIRenderer node={value} />;
	}
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return <span>{String(value)}</span>;
	}
	return (
		<pre className="text-xs text-muted-foreground">
			{JSON.stringify(value, null, 2)}
		</pre>
	);
}

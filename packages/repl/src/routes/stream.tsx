import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { makeUiEnv } from "../lib/ui-env.ts";
import {
	simulateAgentStream,
	simulateAgentUiStream,
} from "../lib/ui-stream-simulator.ts";
import { useUiSource } from "../lib/use-ui-source.ts";

export const Route = createFileRoute("/stream")({
	component: StreamDemo,
});

function StreamDemo() {
	// baseEnv is stable across renders.
	const baseEnv = useMemo(() => makeUiEnv(), []);
	const { rendered, error, source, messages, dispatch, clear } =
		useUiSource(baseEnv);
	const [showLog, setShowLog] = useState(false);
	const [isStreaming, setIsStreaming] = useState(false);
	const stopRef = useRef<(() => void) | null>(null);

	const startDemo = useCallback(async () => {
		stopRef.current?.();
		clear();
		setIsStreaming(true);
		stopRef.current = await simulateAgentStream(dispatch, () =>
			setIsStreaming(false),
		);
	}, [clear, dispatch]);

	const startUiDemo = useCallback(async () => {
		stopRef.current?.();
		clear();
		setIsStreaming(true);
		stopRef.current = await simulateAgentUiStream(dispatch, () =>
			setIsStreaming(false),
		);
	}, [clear, dispatch]);

	const reset = useCallback(() => {
		stopRef.current?.();
		setIsStreaming(false);
		clear();
	}, [clear]);

	return (
		<div className="min-h-screen bg-background text-foreground">
			<div className="border-b border-border">
				<div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<h1 className="text-xl font-semibold tracking-tight">
							🦁 Lion UI Stream
						</h1>
						<Badge variant={isStreaming ? "default" : "secondary"}>
							{isStreaming ? "● Streaming" : "○ Idle"}
						</Badge>
						{messages.length > 0 && (
							<span className="text-xs text-muted-foreground">
								{messages.length} messages
							</span>
						)}
					</div>
					<div className="flex items-center gap-2">
						<Button onClick={startDemo} disabled={isStreaming}>
							{isStreaming ? "Streaming..." : "▶ Data Stream"}
						</Button>
						<Button
							onClick={startUiDemo}
							disabled={isStreaming}
							variant="secondary"
						>
							{isStreaming ? "Streaming..." : "▶ UI Stream"}
						</Button>
						<Button variant="outline" onClick={reset}>
							Reset
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setShowLog((s) => !s)}
						>
							{showLog ? "Hide Log" : "Show Log"}
						</Button>
					</div>
				</div>
			</div>

			<div className="max-w-6xl mx-auto px-6 py-6">
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					<div className={showLog ? "lg:col-span-2" : "lg:col-span-3"}>
						<Card>
							<CardHeader>
								<CardTitle className="text-sm font-medium text-muted-foreground">
									Rendered UI
								</CardTitle>
								<CardDescription>
									Lion source evaluates against a React-populated environment.
									JSON Patch ops mutate the source tree; the UI re-renders.
								</CardDescription>
							</CardHeader>
							<CardContent>
								{error ? (
									<div className="rounded border border-destructive p-3 text-destructive text-sm font-mono">
										{error}
									</div>
								) : rendered ? (
									<>{rendered}</>
								) : (
									<div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
										<p className="text-lg">No UI rendered yet</p>
										<p className="text-sm mt-1">
											Click &quot;Run Agent Demo&quot; to start streaming
										</p>
									</div>
								)}
							</CardContent>
						</Card>
					</div>

					{showLog && (
						<div className="lg:col-span-1 space-y-4">
							<Card>
								<CardHeader>
									<CardTitle className="text-sm font-medium text-muted-foreground">
										Source
									</CardTitle>
								</CardHeader>
								<CardContent>
									<pre className="text-xs font-mono bg-muted p-2 rounded max-h-64 overflow-auto">
										{source ? JSON.stringify(source, null, 2) : "(none)"}
									</pre>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle className="text-sm font-medium text-muted-foreground">
										Messages
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="space-y-2 max-h-[40vh] overflow-y-auto">
										{messages.map((msg, i) => (
											<div
												// biome-ignore lint/suspicious/noArrayIndexKey: log entries are append-only
												key={i}
												className="rounded-md bg-muted p-2 text-xs font-mono"
											>
												<Badge variant="outline" className="text-[10px]">
													{msg.kind}
												</Badge>
												<pre className="whitespace-pre-wrap break-all text-[10px] mt-1 max-h-24 overflow-hidden">
													{JSON.stringify(msg, null, 2).slice(0, 280)}
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

				<div className="mt-8">
					<Separator />
					<div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
						<Card>
							<CardHeader>
								<CardTitle className="text-sm">How It Works</CardTitle>
							</CardHeader>
							<CardContent className="text-sm text-muted-foreground">
								<p>
									Lion source ships over the wire as JSON. The client evaluates
									it against a React-populated environment; the result IS the
									React tree. No <code>$ui</code> intermediate.
								</p>
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle className="text-sm">Lion Expression</CardTitle>
							</CardHeader>
							<CardContent>
								<pre className="text-xs font-mono bg-muted p-3 rounded-md">
									{`["Card",
  ["CardHeader", ["CardTitle", "ETH"]],
  ["CardContent",
    ["p", ["format/usd", 3275]]]]`}
								</pre>
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle className="text-sm">Stream Protocol</CardTitle>
							</CardHeader>
							<CardContent className="text-sm text-muted-foreground">
								<p>
									RFC 6902 JSON Patch against a single{" "}
									<code className="bg-muted px-1 rounded text-foreground">
										source
									</code>{" "}
									document. Live values live inline in the tree.
								</p>
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		</div>
	);
}

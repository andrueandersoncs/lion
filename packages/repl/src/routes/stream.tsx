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
import { DynamicUI } from "../components/ui-renderer";
import { simulateAgentStream } from "../lib/ui-stream-simulator";
import { useUIStream } from "../lib/use-ui-stream";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";

export const Route = createFileRoute("/stream")({
	component: StreamDemo,
});

function StreamDemo() {
	const { ui, isStreaming, messages, setIsStreaming, pushMessage, reset } =
		useUIStream();
	const [showMessages, setShowMessages] = useState(false);

	const startDemo = useCallback(async () => {
		reset();
		setIsStreaming(true);
		await simulateAgentStream(pushMessage, () => setIsStreaming(false));
	}, [pushMessage, reset, setIsStreaming]);

	return (
		<div className="min-h-screen bg-background text-foreground">
			{/* Header bar */}
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
						<Button
							onClick={startDemo}
							disabled={isStreaming}
						>
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
							{showMessages ? "Hide Log" : "Show Log"}
						</Button>
					</div>
				</div>
			</div>

			<div className="max-w-6xl mx-auto px-6 py-6">
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					{/* Main render area */}
					<div
						className={
							showMessages ? "lg:col-span-2" : "lg:col-span-3"
						}
					>
						<Card>
							<CardHeader>
								<CardTitle className="text-sm font-medium text-muted-foreground">
									Rendered UI
								</CardTitle>
								<CardDescription>
									Components streamed from the AI agent
									appear here in real-time
								</CardDescription>
							</CardHeader>
							<CardContent>
								{ui ? (
									<DynamicUI value={ui} />
								) : (
									<div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
										<p className="text-lg">
											No UI rendered yet
										</p>
										<p className="text-sm mt-1">
											Click &quot;Run Agent Demo&quot; to
											start streaming
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
									<CardDescription>
										Raw protocol messages from the agent
									</CardDescription>
								</CardHeader>
								<CardContent>
									<div className="space-y-2 max-h-[70vh] overflow-y-auto">
										{messages.map((msg, i) => (
											<div
												key={i}
												className="rounded-md bg-muted p-2 text-xs font-mono"
											>
												<div className="flex items-center gap-2 mb-1">
													<Badge
														variant="outline"
														className="text-[10px]"
													>
														{msg.op}
													</Badge>
													{msg.path && (
														<span className="text-muted-foreground">
															{msg.path}
														</span>
													)}
												</div>
												<pre className="whitespace-pre-wrap break-all text-[10px] max-h-24 overflow-hidden">
													{JSON.stringify(
														msg.value,
														null,
														2,
													).slice(0, 300)}
													{JSON.stringify(
														msg.value,
														null,
														2,
													).length > 300
														? "..."
														: ""}
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
								<CardTitle className="text-sm">
									How It Works
								</CardTitle>
							</CardHeader>
							<CardContent className="text-sm text-muted-foreground">
								<p>
									An AI agent evaluates Lion expressions that
									produce{" "}
									<code className="bg-muted px-1 rounded text-foreground">
										$ui
									</code>{" "}
									tagged records. These are streamed as JSON
									messages and rendered into React components
									in real-time.
								</p>
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle className="text-sm">
									Lion Expression
								</CardTitle>
							</CardHeader>
							<CardContent>
								<pre className="text-xs font-mono bg-muted p-3 rounded-md">
									{`["ui/card",
  {"title": "Balance"},
  ["ui/text", "$3,200"]]`}
								</pre>
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle className="text-sm">
									Stream Protocol
								</CardTitle>
							</CardHeader>
							<CardContent className="text-sm text-muted-foreground">
								<p>
									Messages use 4 operations:{" "}
									<code className="bg-muted px-1 rounded text-foreground">
										replace
									</code>
									,{" "}
									<code className="bg-muted px-1 rounded text-foreground">
										append
									</code>
									,{" "}
									<code className="bg-muted px-1 rounded text-foreground">
										update
									</code>
									,{" "}
									<code className="bg-muted px-1 rounded text-foreground">
										clear
									</code>{" "}
									— with path targeting for specific nodes.
								</p>
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		</div>
	);
}

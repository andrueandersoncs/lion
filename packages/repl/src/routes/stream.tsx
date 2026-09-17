import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
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
      setIsStreaming(false)
    );
  }, [clear, dispatch]);

  const startUiDemo = useCallback(async () => {
    stopRef.current?.();
    clear();
    setIsStreaming(true);
    stopRef.current = await simulateAgentUiStream(dispatch, () =>
      setIsStreaming(false)
    );
  }, [clear, dispatch]);

  const reset = useCallback(() => {
    stopRef.current?.();
    setIsStreaming(false);
    clear();
  }, [clear]);
  let renderedState: ReactNode = (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>No UI rendered yet</EmptyTitle>
        <EmptyDescription>
          Choose Data Stream or UI Stream to start streaming.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  if (rendered !== null) {
    renderedState = rendered;
  }

  if (error) {
    renderedState = (
      <Alert variant="destructive">
        <AlertTitle>Unable to render the stream</AlertTitle>
        <AlertDescription className="break-words font-mono">
          {error}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-border border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <h1 className="font-semibold text-xl tracking-tight">
              🦁 Lion UI Stream
            </h1>
            <Badge variant={isStreaming ? "default" : "secondary"}>
              {isStreaming ? "● Streaming" : "○ Idle"}
            </Badge>
            {messages.length > 0 && (
              <span className="text-muted-foreground text-xs">
                {messages.length} messages
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button disabled={isStreaming} onClick={startDemo}>
              {isStreaming ? "Streaming..." : "▶ Data Stream"}
            </Button>
            <Button
              disabled={isStreaming}
              onClick={startUiDemo}
              variant="secondary"
            >
              {isStreaming ? "Streaming..." : "▶ UI Stream"}
            </Button>
            <Button onClick={reset} variant="outline">
              Reset
            </Button>
            <Button
              onClick={() => setShowLog((s) => !s)}
              size="sm"
              variant="ghost"
            >
              {showLog ? "Hide Log" : "Show Log"}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className={showLog ? "lg:col-span-2" : "lg:col-span-3"}>
            <Card>
              <CardHeader>
                <CardTitle className="font-medium text-muted-foreground text-sm">
                  Rendered UI
                </CardTitle>
                <CardDescription>
                  Lion source evaluates against a React-populated environment.
                  JSON Patch ops mutate the source tree; the UI re-renders.
                </CardDescription>
              </CardHeader>
              <CardContent>{renderedState}</CardContent>
            </Card>
          </div>

          {showLog && (
            <div className="space-y-4 lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle className="font-medium text-muted-foreground text-sm">
                    Source
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-64 overflow-auto rounded bg-muted p-2 font-mono text-xs">
                    {source ? JSON.stringify(source, null, 2) : "(none)"}
                  </pre>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-medium text-muted-foreground text-sm">
                    Messages
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[40vh] space-y-2 overflow-y-auto">
                    {messages.map((msg, i) => (
                      <div
                        className="rounded-md bg-muted p-2 font-mono text-xs"
                        // biome-ignore lint/suspicious/noArrayIndexKey: log entries are append-only
                        key={i}
                      >
                        <Badge className="text-[10px]" variant="outline">
                          {msg.kind}
                        </Badge>
                        <pre className="mt-1 max-h-24 overflow-hidden whitespace-pre-wrap break-all text-[10px]">
                          {JSON.stringify(msg, null, 2).slice(0, 280)}
                        </pre>
                      </div>
                    ))}
                    {messages.length === 0 && (
                      <p className="py-4 text-center text-muted-foreground text-sm">
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
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">How It Works</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
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
                <pre className="rounded-md bg-muted p-3 font-mono text-xs">
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
              <CardContent className="text-muted-foreground text-sm">
                <p>
                  RFC 6902 JSON Patch against a single{" "}
                  <code className="rounded bg-muted px-1 text-foreground">
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

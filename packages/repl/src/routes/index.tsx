import { run } from "@lion/core/evaluation/evaluate";
import { stdlib } from "@lion/core/modules";
import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { useCallback, useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/")({ component: App });

interface HistoryEntry {
  id: number;
  input: string;
  isError: boolean;
  output: string;
}

function App() {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const idCounter = useRef(0);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  const evalExpression = useCallback(
    async (
      expressionStr: string
    ): Promise<{ result: string; isError: boolean }> => {
      try {
        const parsed: unknown = JSON.parse(expressionStr);
        const result = await Effect.runPromise(run(parsed, stdlib));
        return { result: JSON.stringify(result, null, 2), isError: false };
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        return { result: errorMessage, isError: true };
      }
    },
    []
  );

  const handleSubmit = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }

    const { result, isError } = await evalExpression(trimmed);

    setHistory((prev) => [
      ...prev,
      {
        id: idCounter.current++,
        input: trimmed,
        output: result,
        isError,
      },
    ]);

    setCommandHistory((prev) => [...prev, trimmed]);
    setHistoryIndex(-1);
    setInput("");
  }, [input, evalExpression]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (commandHistory.length === 0) {
          return;
        }

        const newIndex =
          historyIndex === -1
            ? commandHistory.length - 1
            : Math.max(0, historyIndex - 1);

        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex]);
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (historyIndex === -1) {
          return;
        }

        const newIndex = historyIndex + 1;
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1);
          setInput("");
        } else {
          setHistoryIndex(newIndex);
          setInput(commandHistory[newIndex]);
        }
      }
    },
    [handleSubmit, commandHistory, historyIndex]
  );

  return (
    <div
      className="flex flex-col font-mono"
      style={{
        height: "100vh",
        background:
          "linear-gradient(180deg, #0a0f16 0%, #0d1117 50%, #161b22 100%)",
      }}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-[#30363d] border-b bg-[#161b22]/80 px-4 py-3 backdrop-blur-sm">
        <div className="flex gap-1.5">
          <div className="h-3 w-3 rounded-full bg-[#ff5f56] shadow-[0_0_8px_#ff5f56aa]" />
          <div className="h-3 w-3 rounded-full bg-[#ffbd2e] shadow-[0_0_8px_#ffbd2eaa]" />
          <div className="h-3 w-3 rounded-full bg-[#27c93f] shadow-[0_0_8px_#27c93faa]" />
        </div>
        <span className="font-semibold text-[#f0f6fc] text-sm tracking-wide">
          Lion REPL
        </span>
        <span className="ml-auto text-[#8b949e] text-xs">
          Enter to eval • ↑↓ history • Shift+Enter newline
        </span>
      </div>

      {/* Output Area */}
      <div
        className="flex-1 overflow-y-auto p-4"
        ref={scrollRef}
        style={{ minHeight: 0 }}
      >
        {history.length === 0 ? (
          <div className="flex flex-col gap-4 text-[#8b949e]">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🦁</span>
              <span className="font-semibold text-[#58a6ff] text-lg">
                Welcome to the Lion REPL
              </span>
            </div>
            <p className="text-sm">
              Lion is a Lisp-like language using JSON syntax. Try these:
            </p>
            <div className="grid gap-2 rounded-lg border border-[#30363d] bg-[#0d1117]/60 p-4">
              <code className="text-sm">
                <span className="text-[#7ee787]">["math/+", 1, 2, 3]</span>
                <span className="text-[#8b949e]"> → 6</span>
              </code>
              <code className="text-sm">
                <span className="text-[#7ee787]">["math/*", 4, 5]</span>
                <span className="text-[#8b949e]"> → 20</span>
              </code>
              <code className="text-sm">
                <span className="text-[#7ee787]">
                  ["logic/if", true, "yes", "no"]
                </span>
                <span className="text-[#8b949e]"> → "yes"</span>
              </code>
              <code className="text-sm">
                <span className="text-[#7ee787]">["list/list", 1, 2, 3]</span>
                <span className="text-[#8b949e]"> → [1, 2, 3]</span>
              </code>
              <code className="text-sm">
                <span className="text-[#7ee787]">["list/head", [1, 2, 3]]</span>
                <span className="text-[#8b949e]"> → 1</span>
              </code>
              <code className="text-sm">
                <span className="text-[#7ee787]">
                  ["quote", ["math/+", 1, 2]]
                </span>
                <span className="text-[#8b949e]"> → ["math/+", 1, 2]</span>
              </code>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {history.map((entry) => (
              <div className="flex flex-col gap-1" key={entry.id}>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-[#58a6ff]">❯</span>
                  <pre className="flex-1 whitespace-pre-wrap break-all text-[#f0f6fc]">
                    {entry.input}
                  </pre>
                </div>
                <div className="flex items-start gap-2 pl-4">
                  <span
                    className={
                      entry.isError ? "text-[#f85149]" : "text-[#7ee787]"
                    }
                  >
                    {entry.isError ? "✗" : "→"}
                  </span>
                  <pre
                    className={`flex-1 whitespace-pre-wrap break-all ${
                      entry.isError ? "text-[#f85149]" : "text-[#7ee787]"
                    }`}
                  >
                    {entry.output}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="shrink-0 border-[#30363d] border-t bg-[#161b22]/80 p-4 backdrop-blur-sm">
        <div className="flex items-start gap-2">
          <span className="mt-2 font-bold text-[#58a6ff]">❯</span>
          <textarea
            autoFocus
            className="min-h-[40px] flex-1 resize-none rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-[#f0f6fc] placeholder:text-[#484f58] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff]"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='["math/+", 1, 2]'
            ref={textareaRef}
            rows={1}
            value={input}
          />
        </div>
        <p className="mt-2 text-[#8b949e] text-xs">
          <span className="text-[#58a6ff]">stdlib:</span> + - * / = &lt; &gt;
          and or not if list head tail length concat quote identity get keys
          values
        </p>
      </div>
    </div>
  );
}

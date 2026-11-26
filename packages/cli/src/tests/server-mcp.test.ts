import { describe, expect, it } from "@effect/vitest";
import { parseWire } from "@lionlang/core/evaluation/wire";
import { sameValue } from "@lionlang/core/logic/terms";
import { fromRational, ratio } from "@lionlang/core/numbers/exact";
import { Arbitrary, Effect, Schema } from "effect";
import { handleMcpRequest, LionRuntimeSession } from "../mcp.ts";
import { startLionServer } from "../server.ts";

const smallInt = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: -50, maximum: 50 }))
);
const posDenom = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 }))
);

describe("MCP JSON-RPC handler", () => {
  it.effect.prop(
    "supports initialize, tools/list, check+autofix, commit with OCC, eval, inspect, and branching",
    { a: smallInt, b: smallInt },
    ({ a, b }) =>
      Effect.gen(function* () {
        const session = yield* LionRuntimeSession.create({
          limits: { maxFacts: 20, maxSteps: 5000 },
        });

        const init = yield* handleMcpRequest(session, {
          id: 1,
          jsonrpc: "2.0",
          method: "initialize",
        });
        expect(init?.result).toBeDefined();

        const listed = yield* handleMcpRequest(session, {
          id: 2,
          jsonrpc: "2.0",
          method: "tools/list",
        });
        const tools = (
          listed?.result as { readonly tools: readonly { name: string }[] }
        ).tools;
        expect(tools.map((t) => t.name)).toContain("lion_commit");

        // Auto-fix misspelled stdlib name via lion_check.
        const checked = yield* handleMcpRequest(session, {
          id: 3,
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            arguments: { applyFixes: true, program: ["number/ad", a, b] },
            name: "lion_check",
          },
        });
        const checkContent = (
          checked?.result as {
            readonly structuredContent: {
              readonly ok: boolean;
              readonly patched: unknown;
            };
          }
        ).structuredContent;
        expect(checkContent.ok).toBe(false);
        expect(checkContent.patched).toEqual(["number/add", a, b]);

        // Commit relation + fact.
        const committed = yield* handleMcpRequest(session, {
          id: 4,
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            arguments: {
              expectedRevision: 0,
              program: [
                "begin",
                ["relation", "item", ["v"]],
                ["fact", ["item", a]],
              ],
            },
            name: "lion_commit",
          },
        });
        expect(
          (committed?.result as { readonly isError: boolean }).isError
        ).toBe(false);

        // Fork, commit on branch, merge back.
        yield* handleMcpRequest(session, {
          id: 5,
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            arguments: { action: "fork", name: "exp" },
            name: "lion_branch",
          },
        });
        yield* handleMcpRequest(session, {
          id: 6,
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            arguments: { branch: "exp", program: ["fact", ["item", b]] },
            name: "lion_commit",
          },
        });
        yield* handleMcpRequest(session, {
          id: 7,
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            arguments: { action: "merge", name: "exp" },
            name: "lion_branch",
          },
        });

        const queried = yield* handleMcpRequest(session, {
          id: 8,
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            arguments: { program: ["find", "?v", ["item", "?v"]] },
            name: "lion_eval",
          },
        });
        const expected = [...new Set([a, b])].sort((x, y) => x - y);
        expect(
          (
            queried?.result as {
              readonly structuredContent: { readonly value: unknown };
            }
          ).structuredContent.value
        ).toEqual(expected);
      })
  );
});

describe("HTTP + SSE Lion server", () => {
  it.effect.prop(
    "round-trips exact rationals, maps OCC/limit errors to 409/429, and streams SSE watch deltas",
    { d: posDenom, n: smallInt },
    ({ d, n }) =>
      Effect.promise(async () => {
        const running = await startLionServer({
          limits: { maxFacts: 10, maxSteps: 5000 },
          port: 0,
        });
        try {
          // 1. Exact rational over HTTP wire format.
          const evalRes = await fetch(`${running.url}/v1/eval`, {
            body: JSON.stringify({ program: ["number/divide", n, d] }),
            method: "POST",
          });
          expect(evalRes.status).toBe(200);
          const evalBody = (await Effect.runPromise(
            parseWire(await evalRes.text())
          )) as { readonly value: unknown };
          expect(
            sameValue(evalBody.value, fromRational(ratio(BigInt(n), BigInt(d))))
          ).toBe(true);

          // 2. Commit with OCC: matching revision -> 200, stale -> 409.
          const c1 = await fetch(`${running.url}/v1/commit`, {
            body: JSON.stringify({
              expectedRevision: 0,
              program: ["relation", "obs", ["v"]],
            }),
            method: "POST",
          });
          expect(c1.status).toBe(200);

          const stale = await fetch(`${running.url}/v1/commit`, {
            body: JSON.stringify({
              expectedRevision: 0,
              program: ["fact", ["obs", n]],
            }),
            method: "POST",
          });
          expect(stale.status).toBe(409);

          // 3. Open SSE watch stream, commit a fact, verify initial + delta events arrive.
          const controller = new AbortController();
          const watchRes = await fetch(`${running.url}/v1/watch`, {
            body: JSON.stringify({ query: ["find", "?v", ["obs", "?v"]] }),
            method: "POST",
            signal: controller.signal,
          });
          expect(watchRes.status).toBe(200);
          expect(watchRes.body).not.toBeNull();
          const reader = watchRes.body?.getReader();
          if (reader === undefined) {
            throw new Error("Expected SSE response body reader");
          }
          const decoder = new TextDecoder();

          const firstChunk = await reader.read();
          const initialText = decoder.decode(firstChunk.value);
          expect(initialText).toContain("event: initial");

          await fetch(`${running.url}/v1/commit`, {
            body: JSON.stringify({ program: ["fact", ["obs", n]] }),
            method: "POST",
          });

          const secondChunk = await reader.read();
          const deltaText = decoder.decode(secondChunk.value);
          expect(deltaText).toContain("event: delta");
          expect(deltaText).toContain(`"added":[${n}]`);
          controller.abort();
        } finally {
          await running.close();
        }
      }),
    { arbitrary: { runs: 15 } }
  );
});

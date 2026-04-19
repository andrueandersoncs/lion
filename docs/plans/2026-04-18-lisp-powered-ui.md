# Lisp-Powered UI — Revised Plan

> Supersedes the previous five-step plan. The core insight: Lion is already a Lisp that produces data. React is already a host that consumes data. A UI system is just an environment that binds tag names to React components, plus a transport. Everything else in the old plan was ceremony around those two facts.

## Thesis

The current prototype ships pre-evaluated `$ui`-tagged JSON records from agent to client. The client then walks those records with a custom renderer that re-implements tag dispatch. This is a double translation: Lion source → `$ui` records → React. There is no reason for the middle step.

Under the revised design:

- Lion core has no UI module, no `$ui` schema, no renderer-facing types.
- The REPL package constructs an environment that binds tag strings (`"ui/card"`, `"ui/text"`, ...) to functions that return React elements.
- Lion source is the wire format. The client holds the source, runs it against the React-populated environment, and the return value IS the React element tree.
- Streaming uses RFC 6902 JSON Patch against two documents: the source tree and a separate bindings document. No custom stream protocol.
- Lion semantics are unchanged. `quote` and `eval` remain the escape hatches when literal-vs-reference disambiguation is needed at a specific site.

What falls out: homoiconicity becomes "the program is JSON, patch it with the JSON standard, re-eval it." Macros become ordinary `lambda` + `define`. Tree transforms become ordinary `array/map` and `match` on source. The plan's previous steps 1–5 collapse into one architectural change.

---

## Step 1 — Remove the `$ui` indirection

**Goal:** Delete the core-side UI scaffolding. The `$ui` tagged record representation has no consumer under the new design.

**Files:**
- Delete: `packages/core/src/modules/ui.ts`
- Delete: `packages/core/src/modules/tests/ui.test.ts`
- Modify: `packages/core/src/modules/index.ts` — remove the `ui` namespace entry.
- Delete: `packages/core/src/schemas/ui.ts` (both `UINodeSchema` and `UIStreamMessageSchema`; the latter is replaced by JSON Patch).

**Verify:** `turbo typecheck --filter=@lionlang/core` and `turbo test --filter=@lionlang/core` pass without the removed files.

---

## Step 2 — React-populated environment in the REPL

**Goal:** Define a function that builds a Lion environment whose bindings are React component factories. Tag-to-component mapping lives in one file, repl-side only. Lion core never imports React.

**Files:**
- Create: `packages/repl/src/lib/ui-env.ts`

**Shape:**

```ts
import type { ReactNode } from "react";
import { Effect } from "effect";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
// ... other shadcn imports

type Renderer = (...args: unknown[]) => Effect.Effect<ReactNode>;

// Each binding is a Lion-callable function returning a React element.
// The function signature mirrors the existing makeComponent convention:
// first arg may be a props object (record without $ui), remaining are children.
const makeRenderer =
  (render: (props: Record<string, unknown>, children: unknown[]) => ReactNode): Renderer =>
  (...args) => {
    const [first, ...rest] = args;
    const isProps =
      first !== null && typeof first === "object" && !Array.isArray(first);
    const props = isProps ? (first as Record<string, unknown>) : {};
    const children = isProps ? rest : args;
    return Effect.succeed(render(props, children));
  };

export const makeUiEnv = (userBindings: Record<string, unknown> = {}) => ({
  "ui/text":    makeRenderer((props, children) => <p {...props}>{children as ReactNode[]}</p>),
  "ui/heading": makeRenderer((props, children) => <h2 {...props}>{children as ReactNode[]}</h2>),
  "ui/card":    makeRenderer((props, children) => (
    <Card>
      {props.title ? <CardHeader><CardTitle>{String(props.title)}</CardTitle></CardHeader> : null}
      <CardContent>{children as ReactNode[]}</CardContent>
    </Card>
  )),
  "ui/button":  makeRenderer((props, children) => <Button {...props}>{children as ReactNode[]}</Button>),
  // ... one entry per tag the old ui-renderer handled
  ...userBindings,
});
```

**Notes:**
- Keys need to be synthesized for list children. Simplest rule: the renderer for `stack`/`row`/container tags iterates children with array index as key. This is fine for append-only streaming UIs; when we need stable keys, add a `key` prop convention.
- Children arriving as primitives (string/number/boolean) render as text. `isValidElement` check at the boundary keeps things sane.

**Verify:** Unit test that `run(["ui/card", {title: "Hello"}, ["ui/text", "body"]], makeUiEnv())` returns something React considers a valid element tree. Use `@testing-library/react` render + snapshot.

---

## Step 3 — Source-as-state + JSON Patch transport

**Goal:** Replace the custom `replace`/`append`/`update`/`clear` stream ops with RFC 6902 JSON Patch. The client holds the Lion source tree as state; patches mutate it; a `useMemo` re-evaluates against the current environment.

**Files:**
- Delete: `packages/repl/src/lib/use-ui-stream.ts` (current implementation)
- Create: `packages/repl/src/lib/use-ui-source.ts`
- Modify: `packages/repl/src/routes/stream.tsx`
- Add dep: `fast-json-patch`

**Shape:**

```ts
import { applyPatch, type Operation } from "fast-json-patch";
import { useMemo, useReducer } from "react";
import { Effect } from "effect";
import { run } from "@lionlang/core";

type State = {
  source: unknown;        // the Lion expression tree
  bindings: Record<string, unknown>;
};

type Message =
  | { kind: "source-patch"; ops: Operation[] }
  | { kind: "bindings-patch"; ops: Operation[] }
  | { kind: "reset"; source: unknown; bindings: Record<string, unknown> };

const reducer = (state: State, msg: Message): State => {
  switch (msg.kind) {
    case "source-patch":
      return { ...state, source: applyPatch(structuredClone(state.source), msg.ops).newDocument };
    case "bindings-patch":
      return { ...state, bindings: applyPatch(structuredClone(state.bindings), msg.ops).newDocument };
    case "reset":
      return msg;
  }
};

export const useUiSource = (baseEnv: Record<string, unknown>) => {
  const [state, dispatch] = useReducer(reducer, { source: null, bindings: {} });

  const rendered = useMemo(() => {
    if (state.source === null) return null;
    return Effect.runSync(run(state.source, { ...baseEnv, ...state.bindings }));
  }, [state.source, state.bindings, baseEnv]);

  return { rendered, dispatch };
};
```

**Protocol on the wire:** SSE events carry JSON-encoded `Message` values above. `fast-json-patch`'s `Operation` type is RFC 6902.

**Why two documents:** Structural changes (adding a card, reordering a row) patch `source`. Live value changes (new price, new block number) patch `bindings`. Bindings paths are flat (`/eth-price`), so they never shift; source paths can shift on insert but that's the agent's problem to track, which is tractable for structural edits that are typically append-at-end or replace-subtree.

**Verify:** Integration test that emits a sequence of patches and asserts the rendered output at each step.

---

## Step 4 — Rewrite the simulator

**Goal:** Replace the 308-line imperative `$ui` builder with a small module that emits Lion source plus a sequence of JSON patches.

**Files:**
- Rewrite: `packages/repl/src/lib/ui-stream-simulator.ts`

**Shape:**

```ts
// Initial source — the dashboard template. References bindings by bare string.
const initialSource = ["begin",
  ["define", "token-card",
    ["lambda", ["name", "price", "change"],
      ["ui/card", {"title": "name"},
        ["ui/stack",
          ["ui/text", ["format/usd", "price"]],
          ["ui/badge", ["format/percent", "change"]]]]]],
  ["ui/stack",
    ["ui/heading", "DeFi Portfolio"],
    ["ui/row",
      ["token-card", "ETH", "eth-price", "eth-change"],
      ["token-card", "USDC", "usdc-price", "usdc-change"]]]];

const initialBindings = {
  "eth-price": 3250, "eth-change": 0.052,
  "usdc-price": 1, "usdc-change": 0,
  // format/usd and format/percent come from the base env, not bindings
};

// Emit: reset → bindings-patches over time to simulate a live price feed.
```

`format/usd` / `format/percent` are ordinary Lion-callable functions added to the base env alongside the `ui/*` renderers. They live next to `makeUiEnv` in the repl package.

**Verify:** `stream.tsx` route renders the dashboard, price values tick on a timer, no tree-path patches required for value updates.

---

## Sequencing

1. Step 1 — deletions, no new behavior. Everything breaks. ~30 minutes.
2. Step 2 — new env, new renderer-via-evaluator. Covers the static case. ~1 day.
3. Step 3 — transport. Make the stream route work again end-to-end. ~1 day.
4. Step 4 — rewrite simulator, demo live updates. ~half day.

Total: ~3 days, roughly 800 LOC changed (most of it deletions). The previous plan estimated 1,500+ new LOC; this one is net-negative.

## Non-goals for this plan

- No language-level changes to Lion (no `ref`, no `call`, no change to string-lookup semantics). If the silent string-fallback becomes a source of real bugs during use, revisit as a separate proposal with a dev-mode warning first, language change last.
- No in-browser Lion editor (step 5 of the old plan). Source-as-state makes this trivial to add later — it's just another dispatch source for `source-patch` messages — but it's not required to prove the design.
- No tree-walking `ui/*` utilities. Source is JSON; `array/map`, `match`, and ordinary `lambda` cover the "programs that rewrite UI programs" story without a dedicated module.

## What this design buys

- One translation: source → React. No `$ui` intermediate.
- Standard transport: RFC 6902. Any tool speaks it.
- Homoiconicity in the real sense: the program you ship is the program you patch is the program you eval.
- Portability: swap the env to get a different target (terminal, HTML string for email, React Native). Core never knew.
- Smaller surface area: one file of tag→component mappings, one reducer, one `useMemo`.

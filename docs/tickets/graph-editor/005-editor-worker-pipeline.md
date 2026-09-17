# LION-EDITOR-005 — Move analysis and layout behind a worker protocol

**Status:** Blocked  
**Priority:** P0  
**Depends on:** LION-EDITOR-002, LION-EDITOR-004

## Outcome

Keep parsing, Lion semantic projection, indexing, and graph layout from blocking input on large documents.

## Scope

- Define a typed, revisioned Web Worker request/response protocol.
- Parse strict JSON and call the public core analysis API in the worker.
- Build searchable path, symbol, and source-range indexes per valid revision.
- Reserve a layout request channel that can return incremental visible-subgraph positions.
- Cancel or ignore superseded work; only the latest matching revision may update editor state.
- Return structured parse/analysis failures instead of throwing across the worker boundary.
- Provide a deterministic in-thread adapter for tests and unsupported worker contexts.

## Acceptance criteria

- Typing remains responsive while a 1,000-node document reparses.
- Responses carry their source revision and stale responses are discarded.
- Worker crashes surface a recoverable editor error and can be restarted without losing source text.
- Source ranges and structural paths refer to the exact revision that produced them.
- The protocol contains serializable data only and does not expose graph-library or React types.

## Verification

- Exercise rapid consecutive edits and prove an older analysis result cannot overwrite a newer revision.
- Exercise worker failure and recovery with the source document preserved.
- Run a browser smoke test with the 1,000-node fixture and record input responsiveness.

## Non-goals

Final layout quality, runtime evaluation, persistent caching, or rendering thousands of DOM nodes.

# LION-EDITOR-002 — Add a public Lion semantic-analysis API

**Status:** Complete
**Priority:** P0  
**Depends on:** LION-EDITOR-001

## Outcome

Expose one pure, total core API that classifies Lion expressions for tools without duplicating evaluator rules in the REPL.

## Scope

- Add an analysis module under `packages/core/src/` and export it through `packages/core/package.json`.
- Classify primitives, records, empty arrays, every supported special form, function calls, and structurally invalid calls.
- Return stable structural paths and ordered child relationships suitable for a graph projection.
- Represent strings as string/reference candidates; never statically claim literal or reference when environment lookup decides at runtime.
- Distinguish structural relationships from optional semantic definition/reference relationships.
- Keep the API independent of React, layout, editor state, and browser types.

## Acceptance criteria

- All evaluator-recognized forms are classified from the same schemas or shared definitions the evaluator uses.
- Unknown or malformed arrays return an analysis result instead of throwing.
- Records preserve source key order and reject the same forbidden keys as runtime decoding.
- Quoted subtrees are identified without pretending their children execute.
- Consumers can traverse a complete source document without importing evaluator internals.
- Adding a new special form has one authoritative classification change, not parallel REPL logic.

## Verification

- Add behavioral tests for each special form, empty arrays, nested records, malformed calls, quote boundaries, and ambiguous strings.
- Run `turbo typecheck --filter=@lionlang/core` and `turbo test --filter=@lionlang/core`.
- Use a throwaway script to analyze a real README example and print its ordered semantic tree.

## Non-goals

Runtime tracing, type inference, environment execution, graph layout, or editor node styling.

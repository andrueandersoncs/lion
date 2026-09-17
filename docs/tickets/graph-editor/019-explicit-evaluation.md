# LION-EDITOR-019 — Add explicit evaluation and result diagnostics

**Status:** Complete
**Priority:** P0  
**Depends on:** LION-EDITOR-004, LION-EDITOR-006, LION-EDITOR-009

## Outcome

Run the current valid Lion program against `stdlib` on demand and present its final result or failure without blocking editing.

## Scope

- Add a revisioned evaluation service using `@lionlang/core` and `stdlib`.
- Run only the current valid document revision.
- Present running, succeeded, failed, and canceled states in the result drawer.
- Render structured JSON-like results safely with copy and source-independent expand/collapse.
- Normalize schema and runtime errors into user-facing diagnostics while retaining technical details.
- Associate each result with its source revision and mark it stale after subsequent edits.
- Capture console-module output in an editor-owned transcript instead of leaking only to browser DevTools.

## Acceptance criteria

- Run evaluates the exact revision shown when execution starts.
- Editing after a result marks it stale without deleting it.
- Invalid source disables Run and links to the blocking diagnostic.
- Runtime failures do not crash or replace the editor document.
- Large or cyclic host results cannot lock rendering; unsupported values receive a truthful representation.
- Console output and final result are distinguishable and copyable.

## Verification

- Run successful README examples plus divide/error, missing callable, definitions, lambdas, console output, and large results.
- Edit during evaluation and prove the older result cannot present as current.
- Exercise the actual result drawer in the browser and retain tests for result-state transitions.

## Non-goals

Per-expression tracing, custom environments, persistent run history, remote execution, or sandboxing untrusted host functions.

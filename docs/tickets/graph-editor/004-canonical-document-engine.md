# LION-EDITOR-004 — Build the canonical document engine

**Status:** Blocked  
**Priority:** P0  
**Depends on:** LION-EDITOR-001, LION-EDITOR-003

## Outcome

Provide one editor-owned document model where source text, revision, history, parsed state, and dirty state cannot diverge.

## Scope

- Treat the CodeMirror document as the canonical `sourceText` value even when the source pane is hidden.
- Define revisioned document state, last-saved revision, selection anchor, and parse status.
- Define graph `EditIntent` values for replace, insert, remove, and reorder without binding them to graph-library events.
- Convert edit intents into minimal source-text edits against a validated revision.
- Reject or rebase stale intents rather than applying them to a newer document.
- Keep object-key order and untouched formatting stable.
- Expose events/selectors needed by source, graph, file, and evaluator surfaces without adding a general-purpose global state framework.

## Acceptance criteria

- Every document change increments a monotonic revision.
- Dirty state derives from the saved revision and returns to clean after undoing back to it.
- A stale graph edit cannot mutate a different source revision.
- Minimal edits preserve all untouched source bytes.
- Insert, replace, remove, and reorder work for array and object locations where structurally valid.
- Consumers cannot update parsed or graph state independently of a source revision.

## Verification

- Add focused behavioral tests for revision checks, dirty-state transitions, minimal edits, and cross-origin undo ordering.
- Use a throwaway script to apply edit intents to nested formatted JSON and compare untouched ranges byte-for-byte.
- Run `turbo typecheck --filter=@lionlang/repl` and the specific editor model tests.

## Non-goals

File-system APIs, worker transport, graph-library adapters, UI components, or Lion evaluation.

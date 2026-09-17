# LION-EDITOR-001 — Validate the round-trip editing architecture

**Status:** Ready  
**Priority:** P0  
**Depends on:** None

## Outcome

Prove the riskiest invariant before product construction: JSON text remains canonical while a semantic graph edit can change the same document through a minimal text edit and participate in one undo/redo sequence.

## Scope

- Build a throwaway vertical slice using CodeMirror 6, a strict JSON parse tree, one derived graph expression, and one graph-originated edit.
- Preserve untouched whitespace and object-key order.
- Demonstrate text edit → graph update and graph edit → text update.
- Demonstrate chronological undo/redo across both edit origins.
- Measure parse and update behavior with representative 1,000-node and 5,000-node fixtures.
- Record the chosen libraries and transaction boundary in this ticket before deleting the throwaway UI.

## Acceptance criteria

- Editing a primitive in source updates the derived semantic node.
- Editing the same primitive from the graph changes only its source range.
- Undo reverses graph and source edits in the order performed; redo restores them.
- Invalid intermediate JSON does not destroy the last valid graph projection.
- The spike identifies a viable strict-JSON parser/edit API and documents any fidelity limitation.
- No spike-only route, component, or dependency remains after the decision is recorded.

## Verification

- Exercise the slice in a browser with formatted JSON containing arrays, nested records, and reordered keys.
- Capture before/after source proving untouched regions remain byte-identical.
- Run the 1,000-node and 5,000-node fixtures and record timings as baseline evidence, not release guarantees.

## Non-goals

Production styling, complete graph editing, final worker architecture, or permanent tests for the throwaway UI.

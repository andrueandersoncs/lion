# LION-EDITOR-001 — Validate the round-trip editing architecture

**Status:** Complete
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


## Recorded decision

- **Editor:** CodeMirror 6 with the JSON language package.
- **Parse and edit API:** `jsonc-parser` configured for strict JSON (`allowTrailingComma: false`, comments rejected). Its syntax tree supplies source ranges; `modify` and `applyEdits` produce bounded graph-originated text edits.
- **Graph:** React Flow for interaction and bounded rendering, with ELK layered layout in a module worker.
- **Transaction boundary:** one `CanonicalDocument` source snapshot and monotonic revision per accepted source or graph change. Undo and redo restore exact source snapshots regardless of edit origin.
- **Projection rule:** semantic analysis is derived asynchronously from source. Revision checks reject obsolete worker responses and stale graph intents. Invalid JSON retains the last valid projection without accepting graph mutation or evaluation.
- **Fidelity:** untouched text and object-key order stay byte-identical. Reorder and cross-parent move preserve exact subtree bytes. The deliberate limitation is strict JSON: comments and trailing commas are diagnostics, not silently normalized.

The spike was promoted into the production editor, so no spike-only route, component, or dependency remains.

## Baseline evidence

Five warm parse/analyze samples were run on the project workstation (Apple M3 Max, Bun 1.4.2); values are medians and are local engineering evidence, not product guarantees.

| Fixture | Nodes | Shape | Source bytes | Median parse/analyze |
| --- | ---: | --- | ---: | ---: |
| `wide1000` | 1,000 | wide | 19,873 | 10.67 ms |
| `deep1000` | 1,000 | 100-level deep | 70,948 | 11.68 ms |
| `wide5000` | 5,000 | wide | 103,872 | 119.10 ms |
| `deep5000` | 5,000 | 100-level deep | 344,346 | 57.04 ms |

`document.test.ts` proves exact undo restoration, stale-revision rejection, minimal replacement, exact-byte reorder, and exact-byte cross-parent move. The desktop and narrow Chromium workflows prove source edits, graph mutation, invalid-source recovery, and shared undo in the actual editor.
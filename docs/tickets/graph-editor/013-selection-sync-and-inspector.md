# LION-EDITOR-013 — Synchronize selection and build the inspector

**Status:** Complete
**Priority:** P0  
**Depends on:** LION-EDITOR-010, LION-EDITOR-011

## Outcome

Make graph and source feel like two views of one document by keeping selection, reveal, and structural facts synchronized.

## Scope

- Define one revisioned selection model carrying structural path, source range, and focus origin.
- Graph selection highlights and reveals the exact source range.
- Source cursor movement selects the smallest meaningful semantic node containing the cursor.
- Remap selection through text transactions where possible; otherwise fall back to the nearest surviving ancestor.
- Build an inspector showing expression kind, JSON Pointer, source range, parent role, child order, quote state, and statically known semantic relationships.
- Avoid mirroring editable values in the inspector when source or node editing already owns them.

## Acceptance criteria

- Selection round-trips graph → source → graph without oscillation.
- Cursor movement within whitespace or punctuation resolves predictably.
- Deleting the selected node selects its nearest surviving parent.
- Inspector facts always refer to the current revision.
- Stale graph state prevents misleading current-source inspection.
- Focus remains in the user's active surface unless they explicitly request reveal-and-focus.

## Verification

- Exercise selection across primitives, nested arrays, object keys/values, quotes, and invalid-source transitions.
- Test selection remapping through insert, delete, reorder, undo, and redo.
- Verify inspector output against source paths in the real browser surface.

## Non-goals

Search, graph mutation controls, runtime values, or editable environment bindings.

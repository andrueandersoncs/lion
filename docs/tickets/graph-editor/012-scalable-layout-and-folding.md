# LION-EDITOR-012 — Scale graph layout through folding and culling

**Status:** Blocked  
**Priority:** P0  
**Depends on:** LION-EDITOR-011

## Outcome

Keep large programs navigable by laying out and mounting only the semantic detail users currently need.

## Scope

- Define collapsed, expanded, pinned-open, and reveal-path states outside Lion source.
- Generate the visible subgraph from the full semantic index.
- Run hierarchical ELK layout through the worker protocol.
- Preserve unaffected node positions when a local branch expands, collapses, or changes.
- Cull off-screen nodes and edges where the graph library does not already do so reliably.
- Provide expand one level, expand subtree, collapse subtree, and collapse to selection commands.
- Keep a bounded mounted-node count even when the document contains thousands of nodes.

## Acceptance criteria

- A 1,000-node document opens in a useful folded state instead of mounting every control.
- Expanding a local branch does not relayout unrelated regions without need.
- Reveal operations expand only the path required to show the target.
- Collapsing never loses source, selection identity, or unsaved changes.
- Layout responses from stale revisions are ignored.
- Pan and zoom remain responsive with the acceptance fixture.

## Verification

- Exercise repeated expand/collapse and revision changes with 1,000-node and 5,000-node fixtures.
- Record mounted node/edge counts and interaction responsiveness.
- Confirm a selected deep node remains recoverable after ancestor folding.

## Non-goals

Persistent manual layout, freeform diagramming, semantic edits, or overview rendering.

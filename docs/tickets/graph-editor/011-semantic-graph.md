# LION-EDITOR-011 — Render the semantic graph

**Status:** Complete
**Priority:** P0  
**Depends on:** LION-EDITOR-002, LION-EDITOR-005, LION-EDITOR-009

## Outcome

Render every valid Lion document as a truthful, readable semantic graph without introducing an editor-only program representation.

## Scope

- Adapt core analysis output into graph-library nodes and edges.
- Provide node presentations for primitives, records, empty arrays, special forms, function calls, and invalid calls.
- Render canonical structural edges separately from optional semantic relationships.
- Show quote boundaries and ambiguous string/reference candidates honestly.
- Display source-order and argument roles without requiring users to inspect raw JSON.
- Keep React Flow identifiers ephemeral and mapped back to revisioned source paths/ranges.
- Implement selection, pan, zoom, fit view, and read-only node focus.

## Acceptance criteria

- README examples produce graphs that preserve every source value and child order.
- No node or edge implies runtime behavior that static analysis cannot know.
- Quotes visually contain non-evaluated structure.
- Empty arrays, empty objects, primitive roots, and invalid-call arrays remain representable.
- Selecting a node emits its structural path and source range.
- Graph rendering does not mutate or normalize source.

## Verification

- Open fixtures covering every expression kind and compare graph structure with source.
- Exercise selection, pan, zoom, and fit view in the browser.
- Add durable projection tests only for semantic distinctions that could regress.

## Non-goals

Graph mutation, final layout scalability, runtime values, or full visual-system polish.

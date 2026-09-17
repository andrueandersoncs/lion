# LION-EDITOR-023 — Meet large-program performance targets

**Status:** Blocked  
**Priority:** P0  
**Depends on:** LION-EDITOR-005, LION-EDITOR-012, LION-EDITOR-014, LION-EDITOR-019

## Outcome

Prove the editor remains responsive with the program sizes promised by the product instead of relying on optimistic component behavior.

## Scope

- Add deterministic synthetic fixtures for 100, 1,000, and 5,000 total semantic nodes, including deep and wide shapes.
- Define budgets for open/parse/analyze, first useful graph, keystroke-to-diagnostic, local expand/collapse, search, pan/zoom, and explicit Run.
- Instrument development builds without shipping telemetry.
- Bound mounted nodes/edges and verify culling behavior.
- Profile worker serialization, layout, React renders, source decorations, overview drawing, and large result rendering.
- Remove avoidable cloning, allocations, and whole-document recomputation.
- Document accepted limits and any browser-specific degradation honestly.

## Acceptance criteria

- The 1,000-node fixture meets the agreed interaction budgets on the project workstation and remains fully editable.
- The 5,000-node fixture opens and navigates in a folded state without browser hangs or unbounded DOM growth.
- Typing and selection do not wait for obsolete worker responses.
- Expanding one branch does not recompute or rerender the entire document unnecessarily.
- Performance evidence reports total nodes, visible nodes, mounted nodes, timings, and hardware/browser context.
- No optimization weakens source fidelity, accessibility, or correctness.

## Verification

- Run the actual app against every fixture and record the defined measurements.
- Capture a browser performance trace for the slowest accepted path.
- Repeat the acceptance fixture after a production build to avoid dev-mode-only conclusions.

## Non-goals

A public benchmark claim, support for unlimited graphs, server-side computation, or WebGL added without measured need.

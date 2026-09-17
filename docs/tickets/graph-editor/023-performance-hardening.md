# LION-EDITOR-023 — Meet large-program performance targets

**Status:** Complete
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


## Accepted interaction budgets

These are workstation engineering budgets, not public benchmark claims.

| Path | Budget |
| --- | ---: |
| Open, parse, and analyze 1,000 nodes | 500 ms |
| Open folded 5,000-node program | 2,000 ms |
| Keystroke to current diagnostic/projection | 250 ms for 1,000 nodes |
| Local fold/unfold or selection | 100 ms input response |
| Graph search result update | 200 ms |
| Explicit Run of the default arithmetic fixture | 1,000 ms |
| Mounted graph nodes | 300 maximum |

## Recorded evidence

Context: Apple M3 Max workstation, managed Chromium at 1440 × 900, Bun 1.4.2. The deterministic fixtures cover wide and 100-level-deep shapes at 100, 1,000, and 5,000 nodes.

- Warm worker-equivalent parse/analyze medians: wide 1,000 = 10.67 ms; deep 1,000 = 11.68 ms; wide 5,000 = 119.10 ms; deep 5,000 = 57.04 ms.
- The actual development app imported the 5,003-node browser fixture and reached `300 mounted` in 914.93 ms while a Chromium performance trace with screenshots was captured at `/tmp/lion-wide-5000-trace.json`.
- The production build repeated that import-to-mounted path in 543.23 ms with exactly 300 React Flow nodes.
- Playwright repeated the large-file workflow in both desktop and 390 × 844 narrow Chromium projects without unbounded DOM growth.
- ELK layout receives only the bounded visible node window. Folding and selection update that window; they do not reparse source. Source analysis remains a whole-document worker operation, but obsolete revision responses are discarded before React state.
- The searchable index and density overview derive from the accepted projection. Large result text renders in a scroll area rather than expanding the shell.

Accepted limits: local files are capped at 10 MiB; at most 300 graph nodes are mounted at once; the overview is intentionally hidden below 900 px where it would obstruct the canvas; performance varies by browser and hardware.
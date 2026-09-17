# LION-EDITOR-024 — Prove complete product workflows

**Status:** Complete
**Priority:** P0  
**Depends on:** LION-EDITOR-008, LION-EDITOR-017, LION-EDITOR-020, LION-EDITOR-022, LION-EDITOR-023

## Outcome

Verify the assembled product through user-visible workflows that cross file, source, graph, evaluation, history, and recovery boundaries.

## Scope

- Add stable browser fixtures covering small valid, invalid, 1,000-node, and runtime-failing programs.
- Prove New → graph build → Run → Save As.
- Prove Open → source edit → graph edit → undo/redo → Save.
- Prove invalid source → stale graph → repair → current graph → Run.
- Prove search/reveal → unfold → reorder/reconnect → source synchronization.
- Prove Live on → rapid edits → cancellation → latest result.
- Prove permission failure, download fallback, dirty navigation, and external-change handling where supported.
- Prove keyboard-only and narrow-layout variants of the primary workflow.

## Acceptance criteria

- Each workflow asserts observable source, graph, result, dirty, and file outcomes rather than internal wiring.
- Failures preserve user text and expose a recovery action.
- Tests are deterministic, isolated, and runnable in the package suite.
- Browser automation does not replace the required manual direct-file and accessibility checks.
- Desktop and narrow screenshots show the finished surface in representative dense and error states.
- No known P0 or P1 product defect remains open at the release gate.

## Verification

- Run the specific end-to-end workflow suite against a production preview.
- Manually exercise direct file access on a supporting browser and fallback import/download on a non-supporting path.
- Review captured screenshots against the approved One-Sheet Fold Map direction.

## Non-goals

Testing implementation details, exhaustive browser permutations, collaboration, cloud workflows, or per-node runtime traces.

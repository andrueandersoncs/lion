# LION-EDITOR-020 — Add live evaluation and cancellation

**Status:** Blocked  
**Priority:** P1  
**Depends on:** LION-EDITOR-019

## Outcome

Provide opt-in live feedback without making edits noisy, racing results, or consuming work for invalid intermediate revisions.

## Scope

- Add a Live toggle that defaults off and is scoped to the current browser preference.
- Debounce evaluation after a valid, settled document revision.
- Interrupt or supersede an in-flight run when a newer revision becomes eligible.
- Pause automatically while source is invalid and resume after it becomes valid.
- Surface paused, scheduled, running, canceled, current, and stale states without toast spam.
- Prevent duplicate evaluation when an explicit Run already covers the same revision.
- Stop scheduling when the tab is hidden if no user-visible result can be produced.

## Acceptance criteria

- Rapid edits produce at most one result for the latest settled valid revision.
- An older run cannot overwrite a newer result.
- Invalid source pauses Live with a clear reason and no repeated errors.
- Turning Live off cancels pending work and leaves the last result visible as appropriate.
- Explicit Run evaluates immediately and does not create a duplicate scheduled run.
- The editor remains responsive during evaluation.

## Verification

- Exercise rapid typing, graph edits, invalid/valid transitions, explicit Run during debounce, toggle-off cancellation, and slow evaluation.
- Prove result revision ordering under intentionally delayed runs.
- Verify status feedback in the actual command strip and result drawer.

## Non-goals

Background execution when the editor is closed, run history, remote workers, or per-node live values.

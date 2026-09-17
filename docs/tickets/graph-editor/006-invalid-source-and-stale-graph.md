# LION-EDITOR-006 — Handle invalid source and stale graph state

**Status:** Complete
**Priority:** P0  
**Depends on:** LION-EDITOR-004, LION-EDITOR-005

## Outcome

Let developers continue editing malformed intermediate text without losing the last understandable graph or receiving misleading evaluation results.

## Scope

- Model valid JSON, invalid JSON, and JSON rejected by `LionExpressionSchema` as distinct states.
- Preserve the last valid semantic projection while the current text is invalid.
- Mark the graph stale with the revision it represents; disable graph mutations until source becomes valid again.
- Map parser and schema diagnostics to source ranges where possible.
- Keep saving available for invalid text while clearly labeling the file as invalid Lion.
- Disable Run and pause live evaluation until the current revision is valid.
- Cover forbidden or empty object keys and malformed function-call arrays.

## Acceptance criteria

- A transient syntax error does not blank or replace the graph.
- The stale graph cannot emit edits against invalid or newer source.
- Fixing the source automatically replaces the stale graph with the current projection.
- Diagnostics distinguish JSON syntax, Lion schema, and semantically invalid call structure.
- Save remains available and writes exactly the current text.
- Evaluation controls explain why they are unavailable.

## Verification

- In the running editor, break and repair arrays, object keys, strings, and nesting while observing graph and diagnostics behavior.
- Add durable tests for valid → invalid → valid transitions and blocked stale edits.
- Run the focused REPL tests and typecheck.

## Non-goals

Automatic repair, formatting invalid JSON, or runtime error handling.

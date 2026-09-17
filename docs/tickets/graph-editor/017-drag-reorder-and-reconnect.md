# LION-EDITOR-017 — Add validated drag, reorder, and reconnect

**Status:** Blocked  
**Priority:** P1  
**Depends on:** LION-EDITOR-012, LION-EDITOR-016

## Outcome

Make direct manipulation efficient without allowing gestures to produce ambiguous or malformed Lion source.

## Scope

- Add typed structural ports for array positions, record values, and form-specific roles.
- Support argument and branch reordering with explicit insertion indicators.
- Support moving a subtree between compatible structural locations.
- Support reconnecting a child only when the target role accepts it.
- Distinguish viewport node movement from semantic movement; temporary manual positioning must never alter source.
- Provide keyboard-equivalent move and reorder commands.
- Cancel gestures cleanly when the source revision changes mid-drag.

## Acceptance criteria

- Every committed gesture results in one source transaction and one undo step.
- Incompatible targets cannot accept a drop and explain the constraint.
- Reordering preserves exact subtree text rather than reparsing and reprinting it.
- Moving object values does not silently rename keys.
- A stale drag cannot edit a newer source revision.
- Keyboard operations can perform the same semantic changes as pointer gestures.

## Verification

- Exercise reorder and reconnect for function arguments, `begin`, `cond`, `match`, records, and nested subtrees.
- Verify cancellation, stale revision, undo, redo, and keyboard parity.
- Compare moved subtree bytes before and after the operation.

## Non-goals

Multi-node bulk edits, arbitrary cycles, persistent manual coordinates, or freeform diagram edges.

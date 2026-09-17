# LION-EDITOR-016 — Implement graph mutation commands

**Status:** Blocked  
**Priority:** P0  
**Depends on:** LION-EDITOR-004, LION-EDITOR-010, LION-EDITOR-011, LION-EDITOR-015

## Outcome

Allow complete structural editing from the graph while preserving canonical JSON and shared history.

## Scope

- Add context-aware commands to replace a value, insert before/after, append a child, add/remove an object entry, wrap an expression, and delete a subtree.
- Offer valid templates for Lion primitives, records, calls, and supported special forms.
- Compile every command into a revision-checked `EditIntent` and minimal source transaction.
- Preview the exact affected source range before destructive subtree deletion.
- Validate object keys, array positions, required form slots, and root replacement.
- Move selection to the inserted/replacement node after the worker confirms the new revision.
- Make every operation available without drag and drop.

## Acceptance criteria

- A user can construct and edit every supported Lion expression kind without typing JSON.
- Commands never write editor metadata into source.
- Invalid operations are unavailable with a concrete reason, not attempted and rolled back.
- Delete confirmation appears only for subtree loss, not single primitive replacement.
- Source, graph, dirty state, selection, and undo history update as one transaction.
- Undo and redo preserve exact previous source formatting.

## Verification

- Build representative programs from `null` using graph commands alone.
- Exercise root replacement, nested insertion, object-key validation, subtree deletion, undo, and redo.
- Keep behavioral tests for edit intents whose incorrect output could corrupt source.

## Non-goals

Freeform node positioning, drag-based reordering, refactoring/rename, or multi-selection edits.

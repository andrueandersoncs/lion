# LION-EDITOR-010 — Build the JSON workbench and shared history

**Status:** Complete
**Priority:** P0  
**Depends on:** LION-EDITOR-004, LION-EDITOR-006, LION-EDITOR-009

## Outcome

Make raw Lion JSON a first-class editing surface while keeping the same history and selection model used by graph edits.

## Scope

- Integrate CodeMirror 6 with strict JSON language support, syntax highlighting, bracket matching, folding, search, and source diagnostics.
- Keep its document mounted as canonical state even when the pane is hidden.
- Route graph-originated transactions through CodeMirror history annotations.
- Implement shared Undo/Redo commands and accurate availability state.
- Expose source ranges for graph selection and scroll-to-reveal.
- Avoid automatic whole-document formatting during edits or saves.
- Add an explicit Format Document command whose full-source rewrite is visible in history.

## Acceptance criteria

- Source typing, graph edit transactions, formatting, undo, and redo share one chronological history.
- Hidden or tabbed source mode does not discard document, selection, or history.
- Diagnostics point to the relevant source range and remain usable with multiple errors.
- Search and source folding work on large documents without changing source.
- Format Document is user-invoked, undoable, and never runs implicitly.
- Source selection can be set and revealed by a graph path/range request.

## Verification

- Perform alternating source and synthetic graph edits, then walk backward and forward through the full history.
- Verify that saving does not normalize untouched formatting.
- Exercise source search, folding, diagnostics, and format undo in the actual editor.

## Non-goals

Semantic graph rendering, multi-file tabs, custom themes outside the chosen product world, or JSON-with-comments input.

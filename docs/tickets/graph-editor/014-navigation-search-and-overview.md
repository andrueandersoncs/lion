# LION-EDITOR-014 — Add graph navigation and overview tools

**Status:** Blocked  
**Priority:** P0  
**Depends on:** LION-EDITOR-012, LION-EDITOR-013

## Outcome

Let developers reach any expression in a large program without manually panning across an infinite canvas.

## Scope

- Add indexed search across function names, binding names, object keys, primitive values, and structural paths.
- Add breadcrumbs from root to current selection with sibling navigation.
- Add next/previous match and reveal in graph/source actions.
- Build a density overview that represents the whole document without rendering miniature controls.
- Show current viewport, selection, parse-error locations, and search matches in the overview using non-color cues.
- Add back/forward selection history distinct from undo/redo.
- Keep navigation indexes revisioned and worker-produced.

## Acceptance criteria

- Search reaches nodes inside collapsed branches and expands only their ancestor path.
- Breadcrumbs preserve source order and allow direct ancestor selection.
- Overview navigation lands near the requested region and does not change source.
- Selection history returns through prior locations without reverting edits.
- Empty and no-match states explain the available search syntax.
- Navigation remains usable with at least 1,000 nodes.

## Verification

- Exercise searches by name, value, path, and object key across folded branches.
- Navigate via overview, breadcrumbs, result stepping, and selection history.
- Confirm all operations reveal the same target in graph and source.

## Non-goals

Project-wide search, fuzzy symbol renaming, persistent bookmarks, or runtime trace navigation.

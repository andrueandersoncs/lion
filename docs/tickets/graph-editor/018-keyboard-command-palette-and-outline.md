# LION-EDITOR-018 — Add command palette, keyboard control, and outline

**Status:** Blocked  
**Priority:** P0  
**Depends on:** LION-EDITOR-014, LION-EDITOR-016, LION-EDITOR-017

## Outcome

Make the full editor operable without precise pointer use and provide a non-spatial representation of the graph.

## Scope

- Build a command registry shared by toolbar buttons, context menus, shortcuts, and the existing `cmdk` palette.
- Add keyboard navigation by parent, child, previous/next sibling, source order, and search result.
- Implement an accessible semantic outline/tree synchronized with graph and source selection.
- Expose insert, replace, delete, move, reorder, unfold, refold, reveal, Run, Save, and pane commands.
- Show platform-appropriate shortcuts and resolve conflicts with CodeMirror.
- Use roving focus or `aria-activedescendant` deliberately; do not create thousands of tab stops.
- Persist user shortcut discovery, not custom shortcut remapping, in v1.

## Acceptance criteria

- Every graph mutation and navigation action has a keyboard path.
- Palette command availability and disabled reasons match toolbar and context menu state.
- The outline exposes hierarchy, expanded state, semantic kind, and current selection to assistive technology.
- Focus returns predictably after dialogs, palette use, pane changes, and mutations.
- Graph and CodeMirror shortcuts do not steal each other's text-editing commands.
- A keyboard-only user can complete the core open-edit-run-save workflow.

## Verification

- Complete the primary workflow without a pointer.
- Inspect the accessibility tree for outline roles, names, levels, expansion, and selection.
- Exercise shortcuts on macOS and a non-macOS key mapping in automated browser coverage where practical.

## Non-goals

User-defined keymaps, Vim/Emacs emulation, voice control, or project-wide commands.

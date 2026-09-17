# LION-EDITOR-009 — Build the editor shell and pane topology

**Status:** Blocked  
**Priority:** P0  
**Depends on:** LION-EDITOR-003

## Outcome

Provide a stable workspace for file commands, graph, source, inspector, and results before individual tools become feature-complete.

## Scope

- Build the top command strip with document identity, dirty state, Open, Save, Undo, Redo, Run, Live, and command-palette entry.
- Create resizable desktop regions for the graph field, source/inspector workbench, and result drawer.
- Persist pane sizes locally without persisting program semantics or graph positions.
- Convert Graph, Source, and Result into full-height tabs at narrow widths.
- Preserve selection, focus intent, scroll, and open drawers while changing layout modes.
- Define loading, empty, disabled, and recoverable error slots for each region.

## Acceptance criteria

- Desktop panes resize without collapsing controls or losing editor state.
- Narrow layouts show one primary workspace at a time with explicit tabs.
- Keyboard focus does not jump to the document root after pane toggles or resizing.
- The command strip reflects document, history, evaluation, and file capabilities from state rather than local component guesses.
- The shell contains no inert controls when its dependency lands; unavailable actions are disabled with a reason.

## Verification

- Inspect the running shell at desktop, tablet, and phone-width viewports.
- Resize panes, toggle regions, and cross responsive breakpoints while preserving selection and source state.
- Run a browser smoke test and capture desktop and narrow screenshots.

## Non-goals

Final One-Sheet styling, graph behavior, source-editor features, or result rendering.

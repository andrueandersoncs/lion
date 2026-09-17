# LION-EDITOR-003 — Establish the editor route and dependencies

**Status:** Complete
**Priority:** P0  
**Depends on:** LION-EDITOR-001

## Outcome

Create the production route boundary and install only the libraries validated by the architecture spike.

## Scope

- Make the graph editor the primary `/` product route.
- Add the selected graph, source-editor, strict JSON edit, and layout dependencies to `packages/repl/package.json`.
- Create a cohesive `packages/repl/src/editor/` feature boundary for editor model, workers, and UI.
- Keep route code thin; it should compose the editor surface rather than own document behavior.
- Add lazy loading where it materially reduces initial non-editor work without fragmenting editor state.
- Preserve the existing evaluator integration until explicit evaluation is replaced by ticket 019.

## Acceptance criteria

- `/` loads the editor route without the old terminal REPL UI.
- New dependencies match the spike decision and no competing parser, graph, or state library is added.
- The editor feature has a single public composition entry used by the route.
- Build and type resolution work from the monorepo root.
- Old REPL code is not copied into the new feature; final deletion is tracked by ticket 025.

## Verification

- Run `turbo typecheck --filter=@lionlang/repl` and `turbo build --filter=@lionlang/repl`.
- Launch the actual route and verify it loads without runtime or console errors.

## Non-goals

Finished panes, graph rendering, file handling, visual polish, or removal of the `/stream` prototype.

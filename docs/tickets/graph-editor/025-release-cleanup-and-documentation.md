# LION-EDITOR-025 — Document, clean up, and release the editor

**Status:** Complete
**Priority:** P0  
**Depends on:** LION-EDITOR-024

## Outcome

Ship one coherent product, remove superseded prototypes, and leave accurate operating and design documentation for future maintainers.

## Scope

- Remove the old terminal REPL route implementation after the graph editor owns `/`.
- Remove the `/stream` prototype and UI-streaming simulator/library code unless another documented product surface still consumes it.
- Delete obsolete dependencies, demo assets, comments, tests, and generated routes after the clean cutover.
- Update root and REPL documentation with setup, supported browsers, file behavior, editor workflow, shortcuts, limitations, and architecture boundaries.
- Record the shipped visual system in `DESIGN.md` through the Impeccable documentation pass.
- Record the graph editor surface brief and its target route.
- Run the design detector, finish review, asset provenance checks where applicable, and resolve material findings.
- Produce a release checklist and changelog entry appropriate to the repository's current release practice.

## Acceptance criteria

- The default app contains no navigation or dependency on superseded prototype surfaces.
- Documentation matches observed behavior and makes no unsupported compatibility or performance claims.
- `PRODUCT.md`, `DESIGN.md`, and the surface brief describe the shipped product without duplicating contradictory authority.
- Build output retains the required direction contract when implementation adds it.
- All affected package checks, tests, builds, and product smoke scenarios pass.
- The finish reviewer returns `ship`, or every unresolved finding is explicitly accepted by the user.

## Verification

- Run `bun run check`, `bun test`, and `bun run build` from the repository root.
- Launch the production preview and complete the open-edit-run-save smoke scenario.
- Search the built product for obsolete route links and verify documented shortcuts and browser fallback behavior.

## Non-goals

New product features, cloud deployment infrastructure, marketing copy, pricing, or claims unsupported by repository evidence.

## Completion evidence

- Removed the terminal REPL route, `/stream` prototype, UI-streaming simulator, obsolete demo assets, generated route entries, and unused prototype dependencies.
- Documented setup, browser/file behavior, workflow, shortcuts, limitations, architecture boundaries, changelog, the One-Sheet Fold Map system, and the `/` route surface in `README.md`, `packages/repl/README.md`, `packages/repl/PRODUCT.md`, `packages/repl/DESIGN.md`, and `packages/repl/.impeccable/surfaces/route.md`.
- Recorded IBM Plex Sans Condensed licensing and retrieval provenance beside the self-hosted font assets.
- The design detector returned no findings. The finish reviewer returned `ship` after the overview, typography, and current-revision evidence findings were resolved.
- `bun run check`, `bun run test`, and `bun run build` pass from the repository root. Core reports 98 passing tests; REPL reports 13 passing tests.
- `bun run --filter=@lionlang/repl test:e2e` passes all 12 desktop and narrow Chromium workflows, including keyboard access, serious Axe checks, fallback download, stale graph recovery, and the 5,000-node fixture.
- The production build completed an open-import-edit-run-download smoke workflow: `["number/multiply", 6, 7]` evaluated to `42`, the downloaded bytes matched the editor exactly, and the successful fallback save cleared dirty state without claiming the original file was overwritten.
- The built page retains the `lion:direction-contract` metadata with seed `LION-FOLD-MAP-021`; source and dependency searches find no obsolete route or prototype references.

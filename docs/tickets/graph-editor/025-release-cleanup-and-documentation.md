# LION-EDITOR-025 — Document, clean up, and release the editor

**Status:** Blocked  
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

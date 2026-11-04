# Changelog

## Unreleased

### Added

- Every example card on lionlang.dev is now a live editor. Programs run on the real `@lionlang/core` in a Web Worker (`@lionlang/site-runtime`, bundled into `docs/lion-worker.js`) and re-run as you type. Each card shows the result, error, and `console/log` output, and stops runaway programs after 1.5 seconds.

### Changed

- Redesigned lionlang.dev: an interactive expression-graph background that follows the cursor and ripples on clicks and evaluations, a self-typing hero that cycles through verified Lion programs, and new Graph Editor and Packages sections covering `@lionlang/cli`, `@lionlang/typesafe-ai`, and Effect 4.1. Buttons stay put under the cursor.

## 2026-11-03 — @lionlang/core 0.2.0, @lionlang/cli 0.1.0, @lionlang/typesafe-ai 0.1.0

### Added

- Lion Fold Map local-first graph editor at `/` with synchronized semantic graph, exact JSON source, inspector, outline, search, and result views.
- Added the `@lionlang/typesafe-ai` package, exposing Jev Noul, Choice, Score, System One evaluation, and model listing to Lion expressions.
- Shared source/graph transaction history, revision-safe worker analysis, ELK layout, folding, bounded graph rendering, and 100/1,000/5,000-node performance fixtures.
- Explicit and debounced live evaluation against the Lion standard library, including result, console transcript, error, canceled, and stale states.
- File System Access open/save workflows with permission and external-change handling, plus import/download fallback.
- Desktop and narrow-screen keyboard workflows, reduced-motion and forced-colors support, and automated WCAG checks for the primary workflow.

### Changed

- Replaced the former REPL and `/stream` prototype with the graph editor.
- Updated the Lion and REPL operating documentation and removed superseded demo assets and dependencies.
- Upgraded Effect to 4.1.2 across all packages (`effect`, `@effect/platform-node`, `@effect/platform-node-shared`, `@effect/vitest`) and `@effect/language-service` to 0.87.5; the CLI now imports from the stable `effect/cli` module.

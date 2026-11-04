# Changelog

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

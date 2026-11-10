# Changelog

## Unreleased

### Added

- Aggregates in rule heads. `["rule", ["spend", "?c", ["aggregate/sum", "?amount"]], ["order", "?_", "?c", "?amount"]]` groups matches by the head's other columns and combines each group. The new `aggregate` module has `count`, `countUnique`, `sum`, `mean`, `min`, `max`, `collect`, and `unique`; called on a plain list, each combines the list right away. Aggregation is stratified like negation, and `why` lists the matches behind an aggregated fact. lionlang.dev has a live Aggregates card.

### Fixed

- lionlang.dev loads its scripts, stylesheet, highlighter, and evaluator worker with a `?v=` hash of the site's assets. Before, a visitor whose browser had cached the previous release's worker saw the new logic examples fail with `InvalidFunctionCallError`. `bun run --cwd packages/site-runtime stamp` updates the hash (the site-runtime build runs it), and CI checks it.

## 2026-11-10 — @lionlang/core 0.3.0, @lionlang/cli 0.2.0

### Added

- A Datalog-style logic layer in `@lionlang/core`. New special forms `relation`, `fact`, `retract`, `rule`, `query`, `why`, `not`, `and`, `or`, and `=`; unbound `"?name"` strings evaluate to logic variables; and pure stdlib functions called on logic variables become filters or computed values. Rules use stratified negation and semi-naive evaluation, are checked for safety when added, and every answer can be explained with `why`. See `packages/examples/logic.json`.
- lionlang.dev has a Logic programming section with four live examples (recursive rules, negation, filters and computed values, and `why` explanations). Code on the site highlights logic forms and `?variables`, and the live-editor worker is rebuilt with the logic layer.
- The Fold Map graph editor recognizes the logic forms and gives them their own node color.
- `@lionlang/cli` 0.2.0 bundles `@lionlang/core` 0.3.0, so `lion program.json` runs logic programs, and `lion repl` serves the updated graph editor.
- Every example card on lionlang.dev is now a live editor. Programs run on the real `@lionlang/core` in a Web Worker (`@lionlang/site-runtime`, bundled into `docs/lion-worker.js`) and re-run as you type. Each card shows the result, error, and `console/log` output, and stops runaway programs after 1.5 seconds.

### Changed

- Long results in the lionlang.dev live examples keep short arrays and records on one line, and functions nested inside results print as `<function>`.
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

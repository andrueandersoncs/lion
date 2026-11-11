# Changelog

## 2026-11-11 — @lionlang/core 0.5.0, @lionlang/cli 0.4.0

### Added

- Invariants. `["invariant", goal, {"assert": "none"}]` keeps a query assertion in the logic database: the goal must have no answers, or with `"some"` at least one, now and after every later change. Every `fact`, `retract`, and `rule` form is checked against every invariant once it has made all of its changes, and a form that breaks one fails and leaves the database exactly as it was, facts in the same order. Invariants are answered the way queries are, saved in snapshots after the rules, and enforced by `lion --database`. The Fold Map editor and the site highlighter recognize the form.
- [lionlang.dev/docs.html](https://lionlang.dev/docs.html): 35 documents organized by the Diátaxis framework into tutorials, how-to guides, reference, and explanation, covering every form, function, command, and semantic of Lion. Its 110 live examples run on the evaluator, and the page's build writes each example's real result and fails on an unexpected error or a broken link, so the docs cannot drift from Lion.
- `ArithmeticError`, raised when arithmetic has no finite result.

### Changed

- `string/startsWith`, `string/endsWith`, `string/includes`, and `string/indexOf` take the text first, as the README documented and as the rest of the library does; they read their arguments the other way around before. `string/indexOf` returns a number, or `-1`.
- Arithmetic whose result is not a finite number, such as division by zero or an overflow, fails with `ArithmeticError` instead of returning `Infinity` or `NaN`, which JSON cannot hold. This covers `number/add`, `number/subtract`, `number/multiply`, and `number/divide`, and `aggregate/sum` and `aggregate/mean` on a list.
- `value/object?` is true for records and other objects, but no longer for lists.
- `object/get` returns `null` for a missing key instead of `undefined`.
- `object/get-method`, `object/get-method-path`, and `object/call-method-path` work on any value except `null`, as `object/call-method` does.
- `in`, `snapshot`, and `invariant` are reserved names, like the other special forms.
- `@lionlang/cli` 0.4.0 bundles `@lionlang/core` 0.5.0, so `lion --database` keeps invariants and one copy of each rule, and its errors say what went wrong.

### Fixed

- Running a setup again against a saved database added each rule a second time, so aggregates counted every match twice. Adding a rule or invariant the database already holds, one a snapshot would write the same way, now changes nothing.
- A `retract` with one invalid fact still removed the facts listed before it. Every form that changes the database is now all or nothing.
- `array/head` and `array/tail` crashed on an empty list; they return `null` and `[]`.
- `func/apply` returned an Effect that never ran instead of the function's result.
- `string/indexOf` returned an Effect `Option` instead of a number.
- `object/call-method` on `null` crashed with a `TypeError`; it fails with `NotAnObjectError`.
- Errors from the `object` module had no message, so the CLI printed only "An error occurred". Each now says what went wrong, such as `There is no key "email".`

## 2026-11-10 — @lionlang/core 0.4.0, @lionlang/cli 0.3.0

### Added

- Aggregates in rule heads. `["rule", ["spend", "?c", ["aggregate/sum", "?amount"]], ["order", "?_", "?c", "?amount"]]` groups matches by the head's other columns and combines each group. The new `aggregate` module has `count`, `countUnique`, `sum`, `mean`, `min`, `max`, `collect`, and `unique`; called on a plain list, each combines the list right away. Aggregation is stratified like negation, and `why` lists the matches behind an aggregated fact. lionlang.dev has a live Aggregates card.
- Recursion through lattice aggregates. `aggregate/min`, `aggregate/max`, and the new `aggregate/shortest` and `aggregate/union` only move one way, so a recursive rule can aggregate with them and compute the aggregated value, which makes minimum distances and shortest paths expressible. Each group keeps its best value until none improves, every relation in such a cycle must aggregate, and a cycle still improving after 10,000 rounds (such as a negative-weight cycle) fails with an error. lionlang.dev has a live Shortest distances card.
- Query options. `["query", goal, {"order": ["-points", "player"], "offset": 10, "limit": 5, "assert": "some"}]` sorts answers by one or more variables (a leading `-` for descending), pages them, and can assert that a query has some answers or none. Values sort in a fixed order across types, and unknown options or variables are reported. lionlang.dev has a live Order and limit card.
- `["in", element, list]` binds a variable to each item of a list, or tests membership once the element is bound, so rules can use list values stored in facts or computed from other variables. Without logic variables it is plain membership. New `array/range` makes a list of whole numbers. The Fold Map editor and the site highlighter recognize `in`. lionlang.dev has a live Lists with in card.
- Graph algorithms as goals. The new `graph` module has `shortestPath` (Dijkstra, with optional weights), `pageRank`, `components`, `stronglyConnected`, and `topologicalOrder`. `["graph/pageRank", "edge", "?node", "?rank"]` builds a goal over a computed relation that runs once its input relation is complete, so its rows work in queries, rules, `not`, and aggregates, and `why` marks them as computed. Hosts can add their own with `defineAlgorithm` from `@lionlang/core/logic/algorithms`. lionlang.dev has a live Graph algorithms card.
- Goal-directed queries. A query that gives a rule-defined relation a known argument, such as `["path", "a", "?to"]`, now runs a magic-sets rewrite of the rules, so evaluation derives only the facts the query can reach instead of every fact the program implies. A query along a 3,000-node chain that would otherwise derive about 4.5 million paths returns in milliseconds. Aggregated, computed, and negated relations are still computed in full, answers match full evaluation, and `new LogicDatabase({ goalDirected: false })` turns the rewrite off. lionlang.dev has a live Goal-directed queries card.
- Recursive rules run faster: each semi-naive round starts its join from the tuples that are new, relation indexes are kept up to date instead of rebuilt after every new tuple, and `in` tests membership with a lookup. A 3,000-step chain query went from about 9 seconds to about 100 ms. `why` explanations keep their premises in rule order.
- Keyed relations. `["relation", "order", ["id", "status"], {"key": ["id"]}]` holds at most one row per key: a fact whose key is already present replaces the old row, keys can span several columns, and rules that derive two rows for one key fail with an error that names both rows. Redeclaring a relation must repeat its key. The Fold Map editor labels keyed relations. lionlang.dev has a live Keys and upserts card.
- Snapshots. `["snapshot"]` returns a Lion program of `relation`, `fact`, and `rule` forms that rebuilds the current database, quoting strings that would load as something else. `saveDatabase` and `loadDatabase` in `@lionlang/core/logic/snapshot` do the same from TypeScript, and a database passed to `run` now binds its relations by name, so later runs can query them without declaring them again. The Fold Map editor and the site highlighter recognize `snapshot`. lionlang.dev has a live Snapshots card.
- `lion program.json --database store.json` loads a logic database from a snapshot file, runs the program against it, and saves it back, one form and one fact per line.

### Fixed

- The live examples on lionlang.dev spent most of a long evaluation idle: the evaluator yielded to the browser scheduler every few thousand steps, and each yield waited on a clamped `setTimeout`. The site worker no longer yields, since the page already stops runaway programs, so a 3,000-answer logic query in the browser went from about 1.8 s (past the 1.5 s limit) to about 150 ms.
- A goal-directed query whose argument was not JSON data, such as a relation name that evaluates to the relation itself, failed with "not JSON data" instead of finding no answers. Found by comparing goal-directed and full evaluation on 2,000 generated programs.
- A recursive rule could compute a new head value through `=` or `in`, such as `["rule", ["c", "?m"], ["c", "?n"], ["=", "?m", ["number/add", "?n", 1]]]`, and evaluation never finished despite the documented guarantee. Such rules are now rejected when added, with a hint to compute the value in a non-recursive rule or aggregate it with a lattice aggregate.
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

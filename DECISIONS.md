<!-- Written by `bun run history write` from the project record in history/. Change the record, not this file. -->

# Decisions

Why Lion is the way it is. Every decision is a question that Lion's commits and its decision records answered; a record adds the context, the alternatives, and what the decision asserts, and each assertion is checked against Lion as it is now. 200 questions have been decided, 88 records explain them, and of what the records assert, 625 hold when Lion is run, 5 are broken, 344 are stated but not checked by running Lion, and 22 were replaced by a later word. A decision is written as claims in `history/notes/`, and this page is written from them.

| Decided | Question | Now | Record |
| --- | --- | --- | --- |
| 2025-12-03 | [`program-representation`](#program-representation) | `json-value` | [A Lion program is a JSON value, evaluated as it is, with no parser of its own](#json-programs) |
| 2025-12-11 | [`evaluation-error-representation`](#evaluation-error-representation) | `tagged-errors` | [The evaluator is written with Effect, and evaluating a program gives an Effect](#evaluate-with-effect) |
| 2025-12-11 | [`evaluation-library`](#evaluation-library) | `effect` | [The evaluator is written with Effect, and evaluating a program gives an Effect](#evaluate-with-effect) |
| 2025-12-11 | [`evaluator-design`](#evaluator-design) | `compile-to-direct-style` | [Lion compiles an expression to a function that runs in direct style, and enters Effect only where a node needs it](#compiled-evaluation), [The evaluator is written with Effect, and evaluating a program gives an Effect](#evaluate-with-effect) |
| 2025-12-11 | [`host-entry-point`](#host-entry-point) | `run` | [The evaluator is written with Effect, and evaluating a program gives an Effect](#evaluate-with-effect) |
| 2025-12-19 | [`repl-surface`](#repl-surface) | `graph-editor` | [The REPL is a semantic graph editor over the program's JSON, and the source view and the `/stream` prototype are gone](#graph-editor-is-the-repl) |
| 2025-12-20 | [`library-function-arity`](#library-function-arity) | `strict` | [A call gives a function as many arguments as it takes, and any other number fails with one form of message](#arity-rule) |
| 2025-12-26 | [`evaluate-result-type`](#evaluate-result-type) | `unknown` |  |
| 2025-12-26 | [`test-runner`](#test-runner) | `vitest` |  |
| 2025-12-28 | [`evaluator-structure`](#evaluator-structure) | `unit-per-form` |  |
| 2025-12-29 | [`special-form-dispatch`](#special-form-dispatch) | `form-schemas` |  |
| 2025-12-31 | [`object-get-missing-key`](#object-get-missing-key) | `null` | [Lion's values are JSON, so the standard library never gives `undefined`, `NaN`, or `Infinity`](#values-are-json) |
| 2026-01-01 | [`test-location`](#test-location) | `tests-folder` |  |
| 2026-03-20 | [`evaluation-runtime`](#evaluation-runtime) | `run-to-completion` | [Evaluation runs to its end in one pass, and does not pause at host calls to resume from a log](#no-resumable-evaluation) |
| 2026-03-20 | [`host-operation-effectfulness`](#host-operation-effectfulness) | `effectful-by-default` |  |
| 2026-03-20 | [`library-function-names`](#library-function-names) | `module-slash-name` | [Library functions are named `module/name`, with modules named for the kind of value they work on, such as `number/add`](#library-names-module-slash-name) |
| 2026-03-20 | [`library-module-organization`](#library-module-organization) | `value-kind-modules` | [Library functions are named `module/name`, with modules named for the kind of value they work on, such as `number/add`](#library-names-module-slash-name) |
| 2026-03-20 | [`lint-format-tool`](#lint-format-tool) | `ultracite` | [Every commit runs the tests and the formatter, and CI checks every pull request and push to `main`](#quality-gates) |
| 2026-03-20 | [`package-manager`](#package-manager) | `bun` |  |
| 2026-03-20 | [`quality-gates`](#quality-gates) | `pre-commit-hook-and-ci` | [Every commit runs the tests and the formatter, and CI checks every pull request and push to `main`](#quality-gates) |
| 2026-03-20 | [`test-command`](#test-command) | `bun-run-test` | [Every commit runs the tests and the formatter, and CI checks every pull request and push to `main`](#quality-gates) |
| 2026-03-26 | [`evaluation-pause-signal`](#evaluation-pause-signal) | `error` |  |
| 2026-03-26 | [`test-style`](#test-style) | `property-based` | [Lion's tests are property-based, checked against a model, a round trip, or an equivalence](#property-based-tests) |
| 2026-03-27 | [`effect-code-style`](#effect-code-style) | `pipe` |  |
| 2026-03-27 | [`core-package-visibility`](#core-package-visibility) | `public` |  |
| 2026-03-29 | [`agent-program-format`](#agent-program-format) | `json-file` | [The coding agent in `packages/agent` is a Lion program, `agent.json`, run by a small host file](#agent-as-lion-program) |
| 2026-03-29 | [`agent-shorthand-syntax`](#agent-shorthand-syntax) | `define-in-program` | [The coding agent in `packages/agent` is a Lion program, `agent.json`, run by a small host file](#agent-as-lion-program) |
| 2026-03-30 | [`bind-function-name`](#bind-function-name) | `func/bind` |  |
| 2026-03-30 | [`special-form-prefix`](#special-form-prefix) | `plain` | [Special forms keep plain names, such as `"define"`, with no prefix](#special-forms-plain-names), [Special forms are written with a leading slash, such as `"/define"`](#special-forms-slash-prefix) |
| 2026-03-31 | [`property-access-function`](#property-access-function) | `object/get` |  |
| 2026-03-31 | [`array-without-function-head`](#array-without-function-head) | `error` | [An array is always a special form or a call, never a list that evaluates to itself](#arrays-are-never-data) |
| 2026-04-01 | [`lambda-arity`](#lambda-arity) | `extra-arguments-ignored` | [A call gives a function as many arguments as it takes, and any other number fails with one form of message](#arity-rule) |
| 2026-04-02 | [`record-pattern-keys`](#record-pattern-keys) | `exact` | [A record pattern in `match` fits any record that has the pattern's keys with values that fit](#record-patterns-by-keys), [A record fits only a record with the same keys, and `schema/open` allows more](#records-are-exact), [Anything is a schema, one rule says what fits it, and a schema with logic variables in it is a pattern](#schemas-are-logic) |
| 2026-04-03 | [`library-helpers-location`](#library-helpers-location) | `modules-lib-folder` |  |
| 2026-04-04 | [`closure-environment-implementation`](#closure-environment-implementation) | `shared-mutable-frames` | [Environments form a chain from local to global, and a lambda closes over the environment it is made in](#lexical-closures) |
| 2026-04-04 | [`lambda-closure-environment`](#lambda-closure-environment) | `enclosing-environment` | [Environments form a chain from local to global, and a lambda closes over the environment it is made in](#lexical-closures) |
| 2026-04-06 | [`license`](#license) | `mit` |  |
| 2026-04-06 | [`site-domain`](#site-domain) | `lionlang-dev` |  |
| 2026-04-06 | [`site-examples`](#site-examples) | `list-operations` |  |
| 2026-04-06 | [`core-npm-access`](#core-npm-access) | `public` |  |
| 2026-04-06 | [`package-scope`](#package-scope) | `lionlang` |  |
| 2026-04-06 | [`docs-rebase-conflicts`](#docs-rebase-conflicts) | `resolved` |  |
| 2026-04-06 | [`core-homepage`](#core-homepage) | `lionlang-dev` |  |
| 2026-04-19 | [`core-entry-point`](#core-entry-point) | `subpath-exports` |  |
| 2026-04-19 | [`ui-stream-documents`](#ui-stream-documents) | `single-source` |  |
| 2026-04-19 | [`ui-stream-transport`](#ui-stream-transport) | `json-patch` |  |
| 2026-04-19 | [`ui-streaming-architecture`](#ui-streaming-architecture) | `source-as-state` |  |
| 2026-04-19 | [`unbound-string-semantics`](#unbound-string-semantics) | `settled-by-scope` | [A string means what the scopes it is written in declare, a define binds in its body, a binding can take a form's name, and a condition is true or false](#names-by-scope) |
| 2026-09-17 | [`bun-install-linker`](#bun-install-linker) | `hoisted` |  |
| 2026-09-17 | [`editor-source-pane`](#editor-source-pane) | `no-persistent-text-pane` | [The REPL is a semantic graph editor over the program's JSON, and the source view and the `/stream` prototype are gone](#graph-editor-is-the-repl) |
| 2026-09-17 | [`lint-generated-files`](#lint-generated-files) | `excluded` |  |
| 2026-09-17 | [`cli-effect-cli-module`](#cli-effect-cli-module) | `stable-effect-cli` | [Lion moves from Effect 3 to Effect 4](#effect-v4) |
| 2026-09-17 | [`effect-version`](#effect-version) | `effect-4` | [Lion moves from Effect 3 to Effect 4](#effect-v4) |
| 2026-09-17 | [`editor-graph-library`](#editor-graph-library) | `react-flow-elk` |  |
| 2026-09-17 | [`editor-json-parser`](#editor-json-parser) | `jsonc-parser-strict` |  |
| 2026-09-17 | [`editor-json-strictness`](#editor-json-strictness) | `strict-json` |  |
| 2026-09-17 | [`editor-text-component`](#editor-text-component) | `codemirror-6` |  |
| 2026-09-18 | [`jev-evaluation-trigger`](#jev-evaluation-trigger) | `explicit-run` |  |
| 2026-09-18 | [`graph-value-flow-direction`](#graph-value-flow-direction) | `left-to-right` |  |
| 2026-09-20 | [`editor-workspace-layout`](#editor-workspace-layout) | `full-width-graph` |  |
| 2026-09-21 | [`graph-branch-folding`](#graph-branch-folding) | `always-expanded` |  |
| 2026-09-21 | [`output-dock-collapsing`](#output-dock-collapsing) | `collapsible` |  |
| 2026-09-21 | [`completion-proof-storage`](#completion-proof-storage) | `outside-git` |  |
| 2026-09-21 | [`graph-edge-direction`](#graph-edge-direction) | `value-to-consumer` |  |
| 2026-09-21 | [`cli-packaging`](#cli-packaging) | `bundled-core-and-editor` | [`@lionlang/cli` carries its own copy of `@lionlang/core` and the built graph editor, so it is released with every core release](#cli-bundles-editor) |
| 2026-09-21 | [`cli-install-scope`](#cli-install-scope) | `project-or-global` |  |
| 2026-11-04 | [`site-button-effect`](#site-button-effect) | `still-buttons` |  |
| 2026-11-04 | [`docs-example-results`](#docs-example-results) | `run-real-core` | [Every example on lionlang.dev runs on the real `@lionlang/core`, and the docs build writes each example's real result](#live-examples-run-real-core) |
| 2026-11-04 | [`goal-directed-example-recursion`](#goal-directed-example-recursion) | `left-recursion` | [Every example on lionlang.dev runs on the real `@lionlang/core`, and the docs build writes each example's real result](#live-examples-run-real-core) |
| 2026-11-04 | [`site-asset-caching`](#site-asset-caching) | `hash-versioned-urls` | [Every example on lionlang.dev runs on the real `@lionlang/core`, and the docs build writes each example's real result](#live-examples-run-real-core) |
| 2026-11-04 | [`typecheck-scope`](#typecheck-scope) | `sources-only` |  |
| 2026-11-10 | [`logic-paradigm`](#logic-paradigm) | `datalog` | [Logic programming in Lion is Datalog, built into the Lisp as ordinary forms and values](#datalog-logic-layer) |
| 2026-11-10 | [`logic-syntax`](#logic-syntax) | `ordinary-forms-and-values` | [Logic programming in Lion is Datalog, built into the Lisp as ordinary forms and values](#datalog-logic-layer) |
| 2026-11-10 | [`question-mark-name-precedence`](#question-mark-name-precedence) | `binding-wins` | [Logic programming in Lion is Datalog, built into the Lisp as ordinary forms and values](#datalog-logic-layer) |
| 2026-11-10 | [`termination-check`](#termination-check) | `weak-acyclicity` | [A recursive rule cannot compute new values for its head, so evaluation always ends](#recursion-cannot-compute-values) |
| 2026-11-10 | [`aggregation-through-recursion`](#aggregation-through-recursion) | `lattice-aggregates-only` | [Recursion may aggregate only through lattice aggregates, whose values move one way](#lattice-recursion) |
| 2026-11-10 | [`query-evaluation`](#query-evaluation) | `goal-directed-magic-sets` | [A query with a known argument runs a magic-sets rewrite and gives the answers full evaluation gives](#goal-directed-magic-sets) |
| 2026-11-10 | [`rule-computed-values-in-rewrite`](#rule-computed-values-in-rewrite) | `never-drive` | [A query with a known argument runs a magic-sets rewrite and gives the answers full evaluation gives](#goal-directed-magic-sets) |
| 2026-11-10 | [`keyed-relation-fact-semantics`](#keyed-relation-fact-semantics) | `upsert` | [A keyed relation holds one row per key, and a fact whose key is present replaces the row](#keyed-relations-upsert) |
| 2026-11-10 | [`database-save-format`](#database-save-format) | `lion-program` | [A logic database is saved as a Lion program of forms that rebuild it](#snapshots-are-programs) |
| 2026-11-10 | [`site-worker-scheduler`](#site-worker-scheduler) | `prevent-scheduler-yield` |  |
| 2026-11-11 | [`database-change-atomicity`](#database-change-atomicity) | `all-or-nothing` | [A change to the logic database is all or nothing, keeps every invariant, and adds nothing the database already holds](#all-or-nothing-changes) |
| 2026-11-11 | [`database-change-unit`](#database-change-unit) | `form` | [A change to the logic database is all or nothing, keeps every invariant, and adds nothing the database already holds](#all-or-nothing-changes) |
| 2026-11-11 | [`feature-design-principle`](#feature-design-principle) | `least-astonishment` | [Lion's features and semantics are designed by the principle of least astonishment](#least-astonishment) |
| 2026-11-11 | [`invariant-syntax`](#invariant-syntax) | `query-assert-option` | [A change to the logic database is all or nothing, keeps every invariant, and adds nothing the database already holds](#all-or-nothing-changes), [Lion's features and semantics are designed by the principle of least astonishment](#least-astonishment) |
| 2026-11-11 | [`javascript-json-disagreement`](#javascript-json-disagreement) | `follow-json` | [Lion's values are JSON, so the standard library never gives `undefined`, `NaN`, or `Infinity`](#values-are-json) |
| 2026-11-11 | [`non-finite-arithmetic`](#non-finite-arithmetic) | `arithmetic-error` | [Lion's values are JSON, so the standard library never gives `undefined`, `NaN`, or `Infinity`](#values-are-json) |
| 2026-11-11 | [`string-argument-order`](#string-argument-order) | `text-first` |  |
| 2026-11-11 | [`docs-organization`](#docs-organization) | `diataxis` |  |
| 2026-11-12 | [`aggregate-representation`](#aggregate-representation) | `waiting-call` |  |
| 2026-11-12 | [`and-or-evaluation`](#and-or-evaluation) | `short-circuit` | [Where the behavior of a base form is unclear, Lion does what Scheme does](#scheme-where-unclear) |
| 2026-11-12 | [`combining-function-arity`](#combining-function-arity) | `one-or-more` | [Where the behavior of a base form is unclear, Lion does what Scheme does](#scheme-where-unclear) |
| 2026-11-12 | [`filter-truthiness`](#filter-truthiness) | `strict-boolean` |  |
| 2026-11-12 | [`logic-form-classes`](#logic-form-classes) | `one-logic-form-class` |  |
| 2026-11-12 | [`special-form-table`](#special-form-table) | `entry-calls-evaluator` |  |
| 2026-11-12 | [`unclear-base-form-behavior`](#unclear-base-form-behavior) | `follow-scheme-racket` | [Where the behavior of a base form is unclear, Lion does what Scheme does](#scheme-where-unclear) |
| 2026-11-12 | [`which-functions-wait`](#which-functions-wait) | `every-function` | [Whatever needs a logic variable's value waits until the variable is bound](#waiting-rule) |
| 2026-11-12 | [`engine-derivation`](#engine-derivation) | `on-demand-per-relation` |  |
| 2026-11-12 | [`goal-as-value`](#goal-as-value) | `asked` | [Whatever needs the value of a goal asks it](#asking-rule) |
| 2026-11-12 | [`benchmark-process-isolation`](#benchmark-process-isolation) | `process-per-version` | [Measure every change to core for its code, its semantics, its speed, and how well its tests catch broken code](#measure-every-change) |
| 2026-11-12 | [`core-change-measurement`](#core-change-measurement) | `every-change` | [Measure every change to core for its code, its semantics, its speed, and how well its tests catch broken code](#measure-every-change) |
| 2026-11-12 | [`misspelled-module-names`](#misspelled-module-names) | `error` | [An unbound `module/name` string that reads as a misspelled name is an `UnboundNameError`, and any other unbound string stays a string](#misspelled-names-are-errors) |
| 2026-11-12 | [`relation-call-arguments`](#relation-call-arguments) | `schemas` | [Anything is a schema, one rule says what fits it, and a schema with logic variables in it is a pattern](#schemas-are-logic) |
| 2026-11-12 | [`schema-checking`](#schema-checking) | `one-fitting-rule` | [Anything is a schema, one rule says what fits it, and a schema with logic variables in it is a pattern](#schemas-are-logic) |
| 2026-11-12 | [`unbound-name-error-string-field`](#unbound-name-error-string-field) | `unbound` | [An unbound `module/name` string that reads as a misspelled name is an `UnboundNameError`, and any other unbound string stays a string](#misspelled-names-are-errors) |
| 2026-11-12 | [`measure-speed`](#measure-speed) | `skip` |  |
| 2026-11-12 | [`docs-example-coverage`](#docs-example-coverage) | `build-checked` | [Every feature is used in a docs example with output that was run, and the docs build fails when a special form or library function is in no example](#every-feature-in-docs) |
| 2026-11-13 | [`toc-section-reached`](#toc-section-reached) | `where-link-puts-heading` |  |
| 2026-11-13 | [`arity-checks`](#arity-checks) | `one-takes-function` | [A call gives a function as many arguments as it takes, and any other number fails with one form of message](#arity-rule) |
| 2026-11-13 | [`measure-unchanged-core`](#measure-unchanged-core) | `skip` |  |
| 2026-11-13 | [`research-corroboration-basis`](#research-corroboration-basis) | `first-hand-publishers` | [The research skill counts the publishers who give an answer first-hand, not the sources that state it](#research-counts-publishers) |
| 2026-11-13 | [`record-key-check`](#record-key-check) | `any-json-key-but-proto` |  |
| 2026-11-13 | [`text-built-on-lion`](#text-built-on-lion) | `lion-expressions` | [Text built on Lion is computed by Lion expressions, not filled into a template, and a helper any program would want goes into the standard library](#lion-computes-page-text) |
| 2026-11-13 | [`reasoning-belief-judging`](#reasoning-belief-judging) | `from-formed-version` | [A belief is judged by the evidence of every version from the one it was formed in on, and an explanation by the versions where its problem shows](#beliefs-judged-from-their-version) |
| 2026-11-13 | [`skill-lion-runtime`](#skill-lion-runtime) | `published-cli` | [The skills' scripts run the published `@lionlang/cli`, never the copy of Lion in the project](#skills-use-published-cli) |
| 2026-11-13 | [`reasoning-ambiguous-question`](#reasoning-ambiguous-question) | `ask-user` | [A question only the user may settle is asked, not answered by the agent, and an answer from anyone else is listed as presumed](#user-decides-ambiguity) |
| 2026-11-13 | [`research-figure-recording`](#research-figure-recording) | `as-written` | [The agent copies a figure as its source writes it and the model computes the rest, so every number in a claim must be written in its quote](#engine-computes-model-interprets) |
| 2026-11-13 | [`why-premises`](#why-premises) | `every-goal` | [`why` shows every goal of a rule's body as it held, `=` and `in` among them](#why-shows-every-goal) |
| 2026-11-13 | [`chase-strategy`](#chase-strategy) | `restricted-datalog-first-parallel` |  |
| 2026-11-13 | [`termination-check-scope`](#termination-check-scope) | `recursive-rules-only` |  |
| 2026-11-14 | [`dependency-graph-recompute`](#dependency-graph-recompute) | `only-with-equality-rule` |  |
| 2026-11-14 | [`equality-generating-dependencies`](#equality-generating-dependencies) | `equality-rule-head` |  |
| 2026-11-14 | [`equality-rule-placement`](#equality-rule-placement) | `group-that-invents-what-it-meets` |  |
| 2026-11-14 | [`goal-directed-sharing`](#goal-directed-sharing) | `share-full-relations` | [Goal-directed queries share what is derived in full, and a relation is derived when a goal first reads it](#goal-directed-shares-full-relations) |
| 2026-11-14 | [`magic-guard-placement`](#magic-guard-placement) | `lead-when-lookup` | [Goal-directed queries share what is derived in full, and a relation is derived when a goal first reads it](#goal-directed-shares-full-relations) |
| 2026-11-14 | [`change-release-placement`](#change-release-placement) | `ancestry` | [Keep the changelog and the decisions as a Lion model of the git history](#project-record-in-lion) |
| 2026-11-14 | [`development-model`](#development-model) | `one-record-of-claims` | [Lion's development is one record of claims, and what a decision asserts is checked against Lion](#one-record-of-claims), [Keep a research model of Lion's development that checks the project against itself](#research-model-of-development) |
| 2026-11-14 | [`project-record-form`](#project-record-form) | `lion-model-of-git-history` |  |
| 2026-11-14 | [`project-record-format`](#project-record-format) | `lion-model-of-git` | [Keep the changelog and the decisions as a Lion model of the git history](#project-record-in-lion) |
| 2026-11-14 | [`research-model-storage`](#research-model-storage) | `rebuilt-from-sources` | [Keep a research model of Lion's development that checks the project against itself](#research-model-of-development) |
| 2026-11-14 | [`research-open-findings`](#research-open-findings) | `known-findings-list` | [Keep a research model of Lion's development that checks the project against itself](#research-model-of-development) |
| 2026-11-15 | [`direction-stopping`](#direction-stopping) | `patience-since-last-payoff` | [A direction or a lead is set aside after as many misses in a row as its patience, counted since its last payoff](#patience-since-last-payoff) |
| 2026-11-15 | [`next-experiment-choice`](#next-experiment-choice) | `agent-decides` | [A direction or a lead is set aside after as many misses in a row as its patience, counted since its last payoff](#patience-since-last-payoff) |
| 2026-11-15 | [`research-lead-done`](#research-lead-done) | `corroborated` | [A research lead is done when every question it pursues has an answer two publishers give first-hand](#lead-done-when-confirmed) |
| 2026-11-15 | [`score-direction`](#score-direction) | `rule-per-direction` | [A version improves a score when its worst run beats the best that any earlier version was sure to give](#score-improves-past-noise) |
| 2026-11-15 | [`score-improvement`](#score-improvement) | `worst-run-beats-best-sure` | [A version improves a score when its worst run beats the best that any earlier version was sure to give](#score-improves-past-noise) |
| 2026-11-15 | [`score-requirements`](#score-requirements) | `requires-list` | [A version's runs of a score count only where what the score requires holds](#score-requirements) |
| 2026-11-16 | [`development-page`](#development-page) | `changelog-timeline` | [Lion's development is one record of claims, and what a decision asserts is checked against Lion](#one-record-of-claims) |
| 2026-11-16 | [`failed-feature-probe`](#failed-feature-probe) | `reported` | [A probe can read the repository, run a declared command, and answer for a feature](#probes-observe-the-repository) |
| 2026-11-16 | [`probe-questions`](#probe-questions) | `behaviors-and-features` | [A probe can read the repository, run a declared command, and answer for a feature](#probes-observe-the-repository) |
| 2026-11-16 | [`probe-reach`](#probe-reach) | `lion-and-repository` | [A probe can read the repository, run a declared command, and answer for a feature](#probes-observe-the-repository) |
| 2026-11-16 | [`answers-of-a-rule-body`](#answers-of-a-rule-body) | `batches` | [What a database derived follows a change to its facts](#derived-rows-follow-changes) |
| 2026-11-16 | [`assertion-example-answer`](#assertion-example-answer) | `first-in-sort-order` | [What a database derived follows a change to its facts](#derived-rows-follow-changes) |
| 2026-11-16 | [`derived-rows-on-fact-change`](#derived-rows-on-fact-change) | `follow-the-change` | [What a database derived follows a change to its facts](#derived-rows-follow-changes) |
| 2026-11-16 | [`undoing-a-change-to-facts`](#undoing-a-change-to-facts) | `take-back-each-row` | [What a database derived follows a change to its facts](#derived-rows-follow-changes) |
| 2026-11-17 | [`derived-rows-on-refused-change`](#derived-rows-on-refused-change) | `follow-back` | [Every change is followed, and a relation that cannot be followed is derived again on its own](#every-change-is-followed) |
| 2026-11-17 | [`derived-rows-on-rule-change`](#derived-rows-on-rule-change) | `derive-again-what-changed` | [Every change is followed, and a relation that cannot be followed is derived again on its own](#every-change-is-followed) |
| 2026-11-17 | [`rule-that-invents-on-change`](#rule-that-invents-on-change) | `weighted-rows` | [Every change is followed, and a relation that cannot be followed is derived again on its own](#every-change-is-followed), [A group whose rules invent or make values one follows a change a component of values at a time](#follow-a-component-at-a-time), [Rows carry weights and the time they hold, and every change is a change to candidates](#rows-carry-weights) |
| 2026-11-17 | [`unfollowable-relation-on-change`](#unfollowable-relation-on-change) | `derive-again-and-compare-once-read` | [Every change is followed, and a relation that cannot be followed is derived again on its own](#every-change-is-followed) |
| 2026-11-17 | [`where-mutations-run`](#where-mutations-run) | `copies-of-the-working-tree` | [Every change is followed, and a relation that cannot be followed is derived again on its own](#every-change-is-followed) |
| 2026-11-17 | [`agent-instructions-layout`](#agent-instructions-layout) | `index-with-guidelines` | [AGENTS.md is a short index, and what each practice needs beyond its main rule is a guideline in `guidelines/`](#guidelines-folder) |
| 2026-11-17 | [`package-readme-source`](#package-readme-source) | `written-from-readme` | [The README of `@lionlang/core` is written from the repository's README](#package-readme) |
| 2026-11-17 | [`ci-test-concurrency`](#ci-test-concurrency) | `one-package-at-a-time` | [CI runs one package's tests at a time, and a test has two minutes in every package](#ci-test-concurrency) |
| 2026-11-17 | [`why-fact-not-holding`](#why-fact-not-holding) | `absent-tree` | [`why` tells why a fact does not hold, and marks what is only assumed](#why-tells-absence) |
| 2026-11-17 | [`why-derivation-shown`](#why-derivation-shown) | `found-first-by-new-derivation` | [`why` tells the derivation a new database finds first](#why-tells-first-derivation) |
| 2026-11-17 | [`reasoning-direction-record-across-scores`](#reasoning-direction-record-across-scores) | `carried-list` | [A direction's record says nothing about a score none of its experiments ran with an earlier version to beat](#direction-record-speaks-for-its-scores) |
| 2026-11-17 | [`reasoning-experiment-expectation-judging`](#reasoning-experiment-expectation-judging) | `its-own-version` | [What an experiment was expected to do is a belief that tries its direction, judged in the version it was formed in and no other](#experiment-expectation-in-its-version) |
| 2026-11-18 | [`merge-survivor`](#merge-survivor) | `least-member-fewest-nested-then-first-sorted` | [Values a key or an equality rule makes one are written as their least member](#least-member-survives-a-merge) |
| 2026-11-18 | [`research-layout`](#research-layout) | `one-shared-model` | [Research runs add to one shared Lion model in `research/`, committed with its sources and the programs that prove its conclusions](#research-compounds) |
| 2026-11-18 | [`compiled-code-lifetime`](#compiled-code-lifetime) | `kept-by-lambda` | [Lion compiles an expression to a function that runs in direct style, and enters Effect only where a node needs it](#compiled-evaluation) |
| 2026-11-18 | [`deep-calls`](#deep-calls) | `unwind-to-run-loop` | [Lion compiles an expression to a function that runs in direct style, and enters Effect only where a node needs it](#compiled-evaluation) |
| 2026-11-18 | [`scope-bindings-store`](#scope-bindings-store) | `map` | [Lion compiles an expression to a function that runs in direct style, and enters Effect only where a node needs it](#compiled-evaluation) |
| 2026-11-18 | [`rest-of-a-record`](#rest-of-a-record) | `schema-open-second-argument` | [What a record or list of schemas leaves over is its rest, and `schema/open` takes a schema for it](#rest-of-a-record) |
| 2026-11-18 | [`library-argument-checks`](#library-argument-checks) | `guard-then-decoder` | [A library function passes arguments of the right kinds through a guard compiled from its schemas, and runs the decoder only on the others](#library-argument-guards) |
| 2026-11-18 | [`merging-what-a-key-gets`](#merging-what-a-key-gets) | `any-aggregate-merge` | [A keyed relation can merge what a key gets: each merged column joins its candidates with a lattice aggregate, and facts are candidates too](#merging-what-a-key-gets), [A relation is a key and how its candidates combine: rules that aggregate merge as a declared merge does, a merge takes any aggregate, and retract takes rules and invariants back](#one-relation-model) |
| 2026-11-18 | [`skill-eval-agent-folder`](#skill-eval-agent-folder) | `outside-repository` | [A skill eval's agent works outside the repository, and never sees a transcript](#skill-eval-outside-repository) |
| 2026-11-18 | [`asking-what-would-hold`](#asking-what-would-hold) | `assuming-question` | [`assuming` asks a question of the database as it would be after some changes](#asking-what-would-hold) |
| 2026-11-18 | [`schema-asks-about-another-value`](#schema-asks-about-another-value) | `only-smaller-values` | [A schema that asks about itself gets its least consistent answer, and asks again only about smaller values](#schema-asks-about-itself) |
| 2026-11-18 | [`schema-asks-about-itself`](#schema-asks-about-itself) | `least-consistent-answer-else-no-answer` | [A schema that asks about itself gets its least consistent answer, and asks again only about smaller values](#schema-asks-about-itself) |
| 2026-11-18 | [`assuming-and-invariants`](#assuming-and-invariants) | `invariants-keep-the-database` | [An invariant does not refuse a change that `assuming` only assumes](#assuming-and-invariants) |
| 2026-11-19 | [`following-a-change-to-facts`](#following-a-change-to-facts) | `candidates-by-level` | [Rows carry weights and the time they hold, and every change is a change to candidates](#rows-carry-weights) |
| 2026-11-19 | [`order-a-rule-head-sum-adds-in`](#order-a-rule-head-sum-adds-in) | `sort-order` | [Rows carry weights and the time they hold, and every change is a change to candidates](#rows-carry-weights) |
| 2026-11-19 | [`two-rows-with-one-key-inside-a-group`](#two-rows-with-one-key-inside-a-group) | `read-from-the-level-after` | [A row beside one with its key is read a level later, `why` finds its answer when asked, and a group keeps only what its rules need](#rows-read-when-held) |
| 2026-11-19 | [`what-a-group-keeps-of-its-rows`](#what-a-group-keeps-of-its-rows) | `what-its-rules-need` | [A row beside one with its key is read a level later, `why` finds its answer when asked, and a group keeps only what its rules need](#rows-read-when-held) |
| 2026-11-19 | [`where-why-finds-a-derivation`](#where-why-finds-a-derivation) | `found-when-asked` | [A row beside one with its key is read a level later, `why` finds its answer when asked, and a group keeps only what its rules need](#rows-read-when-held) |
| 2026-11-19 | [`completion-proof-scope`](#completion-proof-scope) | `visible-changes` | [The record's pages hold no trace of the commit they are in, a reworded sentence of the docs leaves the record instead of failing it, and only a change people see is proved by a recording](#process-costs-what-it-earns) |
| 2026-11-19 | [`engine-mechanics-docs`](#engine-mechanics-docs) | `engine-md` | [The record's pages hold no trace of the commit they are in, a reworded sentence of the docs leaves the record instead of failing it, and only a change people see is proved by a recording](#process-costs-what-it-earns) |
| 2026-11-19 | [`record-pages-and-their-commit`](#record-pages-and-their-commit) | `pages-from-the-record-alone` | [The record's pages hold no trace of the commit they are in, a reworded sentence of the docs leaves the record instead of failing it, and only a change people see is proved by a recording](#process-costs-what-it-earns) |
| 2026-11-19 | [`reworded-doc-sentence`](#reworded-doc-sentence) | `claim-left-out` | [The record's pages hold no trace of the commit they are in, a reworded sentence of the docs leaves the record instead of failing it, and only a change people see is proved by a recording](#process-costs-what-it-earns) |
| 2026-11-19 | [`condition-truth`](#condition-truth) | `true-or-false` | [A string means what the scopes it is written in declare, a define binds in its body, a binding can take a form's name, and a condition is true or false](#names-by-scope) |
| 2026-11-19 | [`define-scope`](#define-scope) | `body` | [A string means what the scopes it is written in declare, a define binds in its body, a binding can take a form's name, and a condition is true or false](#names-by-scope) |
| 2026-11-19 | [`form-name-bindings`](#form-name-bindings) | `shadow-in-scope` | [A string means what the scopes it is written in declare, a define binds in its body, a binding can take a form's name, and a condition is true or false](#names-by-scope) |
| 2026-11-19 | [`aggregated-relation-candidates`](#aggregated-relation-candidates) | `merge-from-rules` | [A relation is a key and how its candidates combine: rules that aggregate merge as a declared merge does, a merge takes any aggregate, and retract takes rules and invariants back](#one-relation-model) |
| 2026-11-19 | [`rule-retraction`](#rule-retraction) | `retract-the-form` | [A relation is a key and how its candidates combine: rules that aggregate merge as a declared merge does, a merge takes any aggregate, and retract takes rules and invariants back](#one-relation-model) |
| 2026-11-19 | [`assuming-changes`](#assuming-changes) | `fact-retract-rule` | [`assuming` adds rules and takes rules and invariants back, as the forms it holds do on their own](#assuming-rules) |
| 2026-11-19 | [`held-rule-variables`](#held-rule-variables) | `question-scope` | [`assuming` adds rules and takes rules and invariants back, as the forms it holds do on their own](#assuming-rules) |
| 2026-11-19 | [`analysis-strings`](#analysis-strings) | `read-by-scope` | [The analysis reads every string by the scopes the evaluator reads it by, and the graph editor shows what each one means](#analysis-reads-by-scope) |
| 2026-11-19 | [`call-head-name`](#call-head-name) | `name-looked-up-where-the-call-runs` | [Logic forms, forms that wait, and code that `eval` runs read strings by the scopes they are written in](#logic-forms-read-by-scope) |
| 2026-11-19 | [`eval-code-declarations`](#eval-code-declarations) | `declares-its-definitions` | [Logic forms, forms that wait, and code that `eval` runs read strings by the scopes they are written in](#logic-forms-read-by-scope) |
| 2026-11-19 | [`form-name-definition-in-own-body`](#form-name-definition-in-own-body) | `error-that-says-why` | [A body cannot define the name of a form it uses](#form-name-definition) |
| 2026-11-19 | [`logic-form-strings`](#logic-form-strings) | `written-scope` | [Logic forms, forms that wait, and code that `eval` runs read strings by the scopes they are written in](#logic-forms-read-by-scope) |
| 2026-11-19 | [`sum-rounding`](#sum-rounding) | `nearest-exact-sum` | [A sum is rounded once, so the order of its values never changes it](#exact-sums) |
| 2026-11-19 | [`research-page-engine`](#research-page-engine) | `lion-command-worker` | [A research page runs the Lion of the lion command that checks it](#research-page-runs-checking-lion) |
| 2026-11-19 | [`schema-binds-its-value`](#schema-binds-its-value) | `list-finite-schemas` | [A schema stands for each value it allows: schema/fits? binds the value it checks when its schema can list them](#schemas-list-their-values) |
| 2026-11-19 | [`solve-typed-variables`](#solve-typed-variables) | `exact-linear-decision-in-lion` | [A variable that a schema types and no goal binds is solved for: the filters about it become constraints, decided exactly in Lion](#solve-typed-variables) |
| 2026-11-19 | [`eventually-rules`](#eventually-rules) | `questions-over-run-states` | [Rules about what must eventually happen are questions about the states of every run, which the solver decides for amounts of any size](#eventually-rules) |
| 2026-11-19 | [`command-proofs`](#command-proofs) | `induction-as-a-question` | [A proof that every command keeps a rule is a question to the solver, and the solver's proofs come with certificates anyone can check](#command-proofs) |
| 2026-11-20 | [`snapshot-form-order`](#snapshot-form-order) | `rules-then-one-fact-form` | [A snapshot writes the rules, then every fact in one form, then the invariants](#snapshot-rules-before-facts) |
| 2026-11-20 | [`key-clash-told-from-rows`](#key-clash-told-from-rows) | `rows-there-are` | [Rows that break a key are kept, and the clash is told from the rows there are](#key-clash-told-from-rows) |
| 2026-11-20 | [`begin-waits-as-a-whole`](#begin-waits-as-a-whole) | `whole-form-but-the-program` | [A begin waits as a whole for an expression before its last](#begin-waits-as-a-whole) |

<a id="program-representation"></a>

## program-representation

Now: `json-value`.

- 2025-12-03 `program-representation`: `json-value` over `own-reader`: "A program is a JSON value, and the evaluator takes that value as it is." (`json-programs.json`)

<a id="json-programs"></a>

### A Lion program is a JSON value, evaluated as it is, with no parser of its own

Recorded 2025-12-03 in `history/notes/json-programs.json`.

**Context.** The first commit, in December 2025, began an evaluator for a Lisp written in JSON. A Lisp needs literals, names, and lists of code, and a reader that turns program text into them. JSON already has numbers, booleans, `null`, strings, arrays, and records, and every language can read it.

**Decision.** A program is a JSON value, and the evaluator takes that value as it is. Numbers, booleans, and `null` are themselves. A string is the value bound to it in the environment, and the string itself when nothing is bound to it. An array is a special form, such as `["quote", ["+", 1, 2]]`, or a call: its elements are evaluated, and when the first value is a function it is called with the others. A record keeps its keys and evaluates each of its values. `run(program, environment)` checks any value against the schema of a Lion expression and then evaluates it.

**Consequences.** Lion has no reader and no syntax of its own: `JSON.parse` reads a program, and a program can be loaded from a file, an API, or a database, generated by another program, and compared like any other JSON. Whether a string is a name or text depends on the environment it meets, so `"x"` is `10` where `x` is bound to `10` and the text `"x"` everywhere else. A record such as `{"sum": ["math/+", "x", "y"], "product": ["math/*", "x", "y"]}` computes several results at once and keeps their keys.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `program-representation`: `json-value`. "A program is a JSON value, and the evaluator takes that value as it is."
- Holds when Lion is run: `record-expression-keys` is `preserved`. "A record keeps its keys and evaluates each of its values."
- Stated, not checked by running Lion: `program-reader` is `json-parse`. "Lion has no reader and no syntax of its own: `JSON.parse` reads a program"
- Holds when Lion is run: `run-input-validation` is `lion-expression-schema`. "`run(program, environment)` checks any value against the schema of a Lion expression and then evaluates it."
- Holds when Lion is run: `run` exists. "`run(program, environment)` checks any value against the schema of a Lion expression and then evaluates it."
- Holds when Lion is run: rule `json-programs` holds. "A Lion program is a JSON value, evaluated as it is, with no parser of its own"
- Holds when Lion is run: rule `strings-are-references` holds. "A string is the value bound to it in the environment, and the string itself when nothing is bound to it."
- Holds when Lion is run: `non-string-primitive` is `itself`. "Numbers, booleans, and `null` are themselves."
- Holds when Lion is run: `bound-string` is `bound-value`. "`"x"` is `10` where `x` is bound to `10` and the text `"x"` everywhere else"
- Holds when Lion is run: `unbound-string` is `itself`. "`"x"` is `10` where `x` is bound to `10` and the text `"x"` everywhere else"
- Holds when Lion is run: `array-first-element-function` is `function-call`. "when the first value is a function it is called with the others"
- Holds when Lion is run: `call-argument-evaluation` is `before-call`. "its elements are evaluated, and when the first value is a function it is called with the others"
- Holds when Lion is run: `record-expression` is `values-evaluated`. "A record keeps its keys and evaluates each of its values."

<a id="evaluation-error-representation"></a>

## evaluation-error-representation

Now: `tagged-errors`.

- 2025-12-11 `evaluation-error-representation`: `tagged-errors` over `thrown-exceptions`, was `parse-error`: "Errors are tagged values, such as `InvalidFunctionCallError`, that a host catches by tag." (`1c16813`, `evaluate-with-effect.json`)
- 2025-12-29 `evaluation-error-representation`: `parse-error` over `tagged-errors`: "export type EvaluateResult = Effect.Effect<unknown, ParseError, LionEnvironment>;" (`a77ea71`)

<a id="evaluate-with-effect"></a>

### The evaluator is written with Effect, and evaluating a program gives an Effect

Recorded 2025-12-11 in `history/notes/evaluate-with-effect.json`.

**Context.** The first evaluator, in December 2025, was a plain recursive TypeScript function. It took the environment as a plain object, library functions were plain functions, and it threw `Error("Invalid expression")` when `eval` met a value that was not an expression.

**Decision.** In December 2025 the evaluator was rewritten with Effect. Evaluating an expression returns an `Effect`, and a failure is a value in its error channel instead of a thrown exception. The environment is a service the evaluation reads from its context, holding a `Ref` of the bindings. `Match` dispatches on the kind of expression, and `Schema` says what a Lion expression and a Lion value are. Library functions return Effects too. `run(program, environment)` decodes the program, evaluates it, and provides the environment.

**Consequences.** A host runs a Lion program as it runs any Effect, for example `Effect.runPromise(run(program, stdlib))`, so `@lionlang/core` depends on `effect` and its users meet Effect in its API. Errors are tagged values, such as `InvalidFunctionCallError`, that a host catches by tag. A host function may return a plain value or an Effect, and a call wraps a plain value. In March 2026 the evaluator's `Effect.gen` blocks were rewritten as pipelines of `pipe`, `Match`, and `Effect.flatMap`; later code uses both styles.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `evaluation-library`: `effect`. "In December 2025 the evaluator was rewritten with Effect."
- Holds when Lion is run: `host-function-non-effect-return` is `auto-wrapped`. "A host function may return a plain value or an Effect, and a call wraps a plain value."
- Holds when Lion is run: `host-function-returns-plain-value` is `value`. "A host function may return a plain value or an Effect, and a call wraps a plain value."
- Holds when Lion is run: rule `evaluate-with-effect` holds. "The evaluator is written with Effect, and evaluating a program gives an Effect"
- Holds when Lion is run: `evaluate-result` is `effect`. "Evaluating an expression returns an `Effect`, and a failure is a value in its error channel instead of a thrown exception."
- Stated, not checked by running Lion: decided `evaluation-error-representation`: `tagged-errors`. "Errors are tagged values, such as `InvalidFunctionCallError`, that a host catches by tag."
- Holds when Lion is run: `evaluate-environment` is `effect-service`. "The environment is a service the evaluation reads from its context, holding a `Ref` of the bindings."
- Replaced by a later word: decided `evaluator-design`: `match-dispatch`. "`Match` dispatches on the kind of expression"
- Stated, not checked by running Lion: decided `host-entry-point`: `run`. "`run(program, environment)` decodes the program, evaluates it, and provides the environment."
- Holds when Lion is run: `run` exists. "`run(program, environment)` decodes the program, evaluates it, and provides the environment."
- Holds when Lion is run: `effect` exists. "`@lionlang/core` depends on `effect`"

<a id="evaluation-library"></a>

## evaluation-library

Now: `effect`.

- 2025-12-11 `evaluation-library`: `effect` over `plain-typescript`: "In December 2025 the evaluator was rewritten with Effect." (`57ac08c`, `evaluate-with-effect.json`)

<a id="evaluator-design"></a>

## evaluator-design

Now: `compile-to-direct-style`.

- 2025-12-11 `evaluator-design`: `match-dispatch`: "`Match` dispatches on the kind of expression" (`b1e3f0e`, `evaluate-with-effect.json`)
- 2026-11-18 `evaluator-design`: `compile-to-direct-style` over `match-dispatch`, was `match-dispatch`: "An expression is compiled to a JavaScript function of the scope it runs in, and a special form is told apart when its expression is compiled, not each time it runs." (`compiled-evaluation.json`)

<a id="compiled-evaluation"></a>

### Lion compiles an expression to a function that runs in direct style, and enters Effect only where a node needs it

Recorded 2026-11-18 in `history/notes/compiled-evaluation.json`.

**Context.** Until 0.13.0 the evaluator walked an expression each time it ran and built an Effect for every node: a name was read from a `Ref` through an Effect, a call ran in `Effect.gen` with its parts gathered by `Effect.all`, and each array was checked against the shape of its special form, with its whole subtree, every time it ran. Plain code paid for all of it. On 0.13.0, fib(17) through a recursive lambda took 50 ms, and a loop of 1,000,000 tail calls took 14.4 s and 4.4 GB of memory, since each call kept a frame on the heap. Research into what to improve in Lion found that compiling to closures alone gains 30 to 50 percent (Feeley and Lapalme 1987), that direct style ran 76.2 times as fast as runtime effect handlers on Koka's JavaScript backend (Xie et al. 2020), that continuation-passing style and generators make JavaScript 3 and 2 times slower than direct style (Stopify, Baxter et al. 2018), and that inlining binds at join points keeps tail calls (Xie et al. 2021).

**Decision.** An expression is compiled to a JavaScript function of the scope it runs in, and a special form is told apart when its expression is compiled, not each time it runs. The compiled function runs in direct style and returns the expression's value. Where a node needs Effect, because a host function returns an Effect that is not done yet, a question goes to the logic database, a call waits for a logic variable, or something fails, it returns the rest of the evaluation as an Effect, and the nodes around it go on inside that Effect. A lambda's body is compiled the first time the lambda is called and kept with the lambda; nothing else keeps compiled code, and the forms that read or change the logic database evaluate their parts as they run. A scope holds its bindings in a `Map` that compiled code reads and writes right away. A library function whose arguments check right away gives a finished Effect, whose value compiled code takes without running it. A call between Lion functions uses the JavaScript stack, and a call more than 100 calls deep starts again at the bottom of the stack, in Effect's run loop. `evaluate` and `run` still give Effects, and a Lion function that host code calls still returns one.

**Consequences.** fib(17) takes 3.8 ms instead of 50 ms, and `array/map` and `array/reduce` over 20,000 items about 19 ms instead of 135 ms; rules, aggregates, and questions mostly run 1.1 to 2.4 times as fast, since they evaluate what they hold through the same code, while adding 300 rules one form at a time and finding every path along a chain of 150 ran at 0.8 to 1.1 times their old speed from run to run, where the logic engine does nearly all the work. A call in tail position keeps nothing of the call it is in, so a loop of 1,000,000 tail calls takes 0.5 s and 9 MB, and a call that is not in tail position can still nest as deep as memory allows. A tail position is a lambda's body, and the result of a `cond` case and the last expression of a `begin` that are in one. The core grew by 377 lines of code, 3.2 percent. Host code that read a scope through `Ref.get(environment.bindingsRef)` reads `environment.bindings`, a `Map`, or calls `lookup`; `getBinding` and `setLocalBinding` are gone, `makeEnvironment`, `setGlobalBinding`, and `boundNames` give their result instead of an Effect, and a plain special form's module exports a compiler, such as `compileCond`, in place of an evaluator. The interpreter that the compiler replaced is kept in the tests as the model it is checked against. The logic engine still evaluates what a rule holds as it did: compiling rule bodies waits for the rework of how the engine follows changes.

**Alternatives considered.**

- Compile to closures that each still return an Effect. The cost was binding an Effect at every node, not walking the JSON, and closure compilation alone gained 30 to 50 percent where it was measured.
- Keep every compiled expression in a cache keyed by the expression. A program of 100,000 facts then held 100,000 compiled calls, and its peak memory grew from 68 MB to 180 MB; code that runs again is in a lambda's body, which keeps its own.
- Run calls in continuation-passing style or as generators, to keep the stack short. Both make JavaScript 2 to 3 times slower than direct style, and starting again at the bottom of the stack every 100 calls costs nothing measurable.
- Return an object for each tail call and make the calls in a loop. That makes an object for every tail call; starting again at the bottom of the stack gives tail calls in constant memory without one.
- Resolve each name to a slot of its scope when the expression is compiled. A string is a name only when something is bound to it when it runs, and `define` binds names while a program runs, so a name is looked up when it runs.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `evaluator-design`: `compile-to-direct-style`. "An expression is compiled to a JavaScript function of the scope it runs in, and a special form is told apart when its expression is compiled, not each time it runs."
- Holds when Lion is run: `getBinding` is removed. "`getBinding` and `setLocalBinding` are gone"
- Replaced by a later word: `setLocalBinding` is removed. "`getBinding` and `setLocalBinding` are gone"
- Holds when Lion is run: `compile` exists. "An expression is compiled to a JavaScript function of the scope it runs in"
- Stated, not checked by running Lion: `fib-17-lambda-ms` is 3.8. "fib(17) takes 3.8 ms instead of 50 ms"
- Stated, not checked by running Lion: `map-reduce-20000-ms` is 19. "`array/map` and `array/reduce` over 20,000 items about 19 ms instead of 135 ms"
- Stated, not checked by running Lion: `tail-loop-1000000-seconds` is 14.4. "a loop of 1,000,000 tail calls took 14.4 s and 4.4 GB of memory"
- Stated, not checked by running Lion: `tail-loop-1000000-seconds` is 0.5. "a loop of 1,000,000 tail calls takes 0.5 s and 9 MB"
- Stated, not checked by running Lion: `tail-loop-1000000-megabytes` is 4400. "a loop of 1,000,000 tail calls took 14.4 s and 4.4 GB of memory"
- Stated, not checked by running Lion: `tail-loop-1000000-megabytes` is 9. "a loop of 1,000,000 tail calls takes 0.5 s and 9 MB"
- Stated, not checked by running Lion: `core-code-lines-added` is 377. "The core grew by 377 lines of code, 3.2 percent."
- Stated, not checked by running Lion: decided `scope-bindings-store`: `map`. "A scope holds its bindings in a `Map` that compiled code reads and writes right away."
- Stated, not checked by running Lion: decided `deep-calls`: `unwind-to-run-loop`. "A call between Lion functions uses the JavaScript stack, and a call more than 100 calls deep starts again at the bottom of the stack, in Effect's run loop."
- Stated, not checked by running Lion: decided `compiled-code-lifetime`: `kept-by-lambda`. "A lambda's body is compiled the first time the lambda is called and kept with the lambda; nothing else keeps compiled code, and the forms that read or change the logic database evaluate their parts as they run."
- Holds when Lion is run: rule `tail-calls-keep-nothing` holds. "A call in tail position keeps nothing of the call it is in, so a loop of 1,000,000 tail calls takes 0.5 s and 9 MB, and a call that is not in tail position can still nest as deep as memory allows."
- Holds when Lion is run: `tail-call-loop-memory` is `constant`. "A call in tail position keeps nothing of the call it is in, so a loop of 1,000,000 tail calls takes 0.5 s and 9 MB, and a call that is not in tail position can still nest as deep as memory allows."
- Holds when Lion is run: `deep-call-not-in-tail-position` is `works`. "A call in tail position keeps nothing of the call it is in, so a loop of 1,000,000 tail calls takes 0.5 s and 9 MB, and a call that is not in tail position can still nest as deep as memory allows."
- Holds when Lion is run: `evaluate-result` is `effect`. "`evaluate` and `run` still give Effects, and a Lion function that host code calls still returns one."
- Holds when Lion is run: `environment-bindings-read-by-host` is `map`. "Host code that read a scope through `Ref.get(environment.bindingsRef)` reads `environment.bindings`, a `Map`, or calls `lookup`"

<a id="host-entry-point"></a>

## host-entry-point

Now: `run`.

- 2025-12-11 `host-entry-point`: `run`: "`run(program, environment)` decodes the program, evaluates it, and provides the environment." (`98c3cbc`, `evaluate-with-effect.json`)

<a id="repl-surface"></a>

## repl-surface

Now: `graph-editor`.

- 2025-12-19 `repl-surface`: `terminal-repl` over `file-command`: "yield* terminal.display("Lion REPL v0.0.1\n");" (`12e2409`)
- 2025-12-31 `repl-surface`: `web-app` over `terminal`: "fix: implements repl web app" (`c6c1f39`)
- 2026-09-17 `repl-surface`: `graph-editor` over `stream-prototype`, was `web-app`: "The graph editor, Lion Fold Map, replaced the REPL at `/` on September 17, 2026." (`bdc6d89`, `2026-11-03-core-0.2.0.json`, `graph-editor-is-the-repl.json`)

<a id="graph-editor-is-the-repl"></a>

### The REPL is a semantic graph editor over the program's JSON, and the source view and the `/stream` prototype are gone

Recorded 2026-09-17 in `history/notes/graph-editor-is-the-repl.json`.

**Context.** `packages/repl` had held a web REPL since the end of December 2025. In April 2026 a prototype at `/stream` rendered Lion programs evaluated against an environment of React components and changed them with streams of JSON Patch operations. In September 2026 a product brief, `packages/repl/PRODUCT.md`, and 25 tickets in `docs/tickets/graph-editor/` set out a local-first editor for Lion programs that can exceed 1,000 graph nodes.

**Decision.** The graph editor, Lion Fold Map, replaced the REPL at `/` on September 17, 2026. The program's JSON is canonical, and the semantic graph, outline, inspector, and results are derived from it; a graph edit becomes a minimal text edit that keeps the bytes of everything it does not touch. The old REPL route, `/stream`, and the UI-streaming code were removed in the same commit. Two days later the CodeMirror source view was removed too, so a program is edited through the graph, its nodes, and the inspector, and on September 21 every semantic branch and the output dock stayed open instead of folding away.

**Consequences.** The editor keeps programs local, with no account or backend storage: it opens and saves files through the File System Access API, and downloads the file where a browser lacks it. `@lionlang/core` gained a semantic-analysis API, which the editor runs in a worker beside the layout. Exact JSON is still shown where a node unfolds, but there is no longer a text editor for a whole program.

**Alternatives considered.**

- Keep the `/stream` prototype, which rendered React components from Lion source patched by streams of JSON Patch. No documented product surface used it, and the editor's release ticket called for one coherent product with its superseded prototypes removed.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `repl-surface`: `graph-editor`. "The graph editor, Lion Fold Map, replaced the REPL at `/` on September 17, 2026."
- Stated, not checked by running Lion: `ui-stream-simulator` is removed. "The old REPL route, `/stream`, and the UI-streaming code were removed in the same commit."
- Stated, not checked by running Lion: `editor-source-view` is removed. "Two days later the CodeMirror source view was removed too"
- Holds when Lion is run: `editor-source-text-pane` is `absent`. "there is no longer a text editor for a whole program"
- Stated, not checked by running Lion: `graph-branch-expansion` is `always-expanded`. "on September 21 every semantic branch and the output dock stayed open instead of folding away"
- Holds when Lion is run: `editor-program-storage` is `browser-local`. "The editor keeps programs local, with no account or backend storage"
- Stated, not checked by running Lion: `editor-file-system-access` exists. "it opens and saves files through the File System Access API, and downloads the file where a browser lacks it"
- Stated, not checked by running Lion: `semantic-analysis` exists. "`@lionlang/core` gained a semantic-analysis API, which the editor runs in a worker beside the layout"
- Stated, not checked by running Lion: decided `editor-source-pane`: `no-persistent-text-pane`. "Two days later the CodeMirror source view was removed too, so a program is edited through the graph, its nodes, and the inspector"
- Holds when Lion is run: rule `graph-editor-is-the-repl` holds. "The REPL is a semantic graph editor over the program's JSON"
- Holds when Lion is run: rule `editor-source-canonical` holds. "The program's JSON is canonical, and the semantic graph, outline, inspector, and results are derived from it"
- Holds when Lion is run: `editor-untouched-text` is `byte-identical`. "a graph edit becomes a minimal text edit that keeps the bytes of everything it does not touch"
- Holds when Lion is run: `repl-root-route` is `graph-editor`. "The graph editor, Lion Fold Map, replaced the REPL at `/` on September 17, 2026."
- Holds when Lion is run: `graph-editor` exists. "The graph editor, Lion Fold Map, replaced the REPL at `/` on September 17, 2026."
- Stated, not checked by running Lion: `repl-route` is removed. "The old REPL route, `/stream`, and the UI-streaming code were removed in the same commit."
- Holds when Lion is run: `stream-route` is removed. "The old REPL route, `/stream`, and the UI-streaming code were removed in the same commit."

<a id="library-function-arity"></a>

## library-function-arity

Now: `strict`.

- 2025-12-20 `library-function-arity`: `two-arguments` over `variadic`: "Schema.mutable(Schema.Tuple(Schema.Number, Schema.Number))" (`23f58e5`, `98c3cbc`)
- 2025-12-31 `library-function-arity`: `variadic` over `two-arguments`: "Schema.decodeUnknown(Schema.Array(Schema.Number))," (`c6c1f39`)
- 2026-11-13 `library-function-arity`: `strict` over `lenient`, was `variadic`: "Every function of the standard library takes a set number of arguments, and a call with any other number fails" (`2026-11-13-core-0.8.0.json`, `356e74a`, `arity-rule.json`)

<a id="arity-rule"></a>

### A call gives a function as many arguments as it takes, and any other number fails with one form of message

Recorded 2026-11-13 in `history/notes/arity-rule.json`.

**Context.** Library functions dropped arguments they did not take and passed `undefined` for ones left out: `["number/subtract", 10, 3, 1]` was `7`, and `["object/get", {"a": 1}]` was `null`. Relations, schemas, schema builders, `schema/fits?`, `schema/problems`, `schema/assert`, aggregates, and graph algorithms each checked their arguments on their own, with messages in several forms. It was one of three surprises found while writing Lion programs for the research skill.

**Decision.** Every function of the standard library takes a set number of arguments, and a call with any other number fails: `"number/subtract" takes 2 arguments but got 3.` One function, `takes`, carries the rule for library functions, relations, schemas, aggregates, and graph algorithms, and `over` builds a library function from a schema for each argument. `number/add`, `number/multiply`, `number/min`, `number/max`, `string/concat`, and `array/concat` combine one or more arguments from left to right, as their Scheme counterparts do. A lambda still ignores arguments past its parameters, as in JavaScript, so host code can call it as a callback.

**Consequences.** A call with the wrong number of arguments fails where it runs, also where it waits for a logic variable in a rule, a query, or a `find`, and the failure is a `LogicError`. `func/bind` and `func/apply` need the function and its `this`, and a library function handed to host code that passes extra arguments, as `Array.prototype.map` does through `func/callback`, fails, so a lambda is the way to write a callback. `["number/add", 1, 2, 3]` is `6`, where the `3` used to be dropped. The code grew by 62 lines, since the rule and its two helpers cost more than the seven checks and module helpers they replaced. Every new function declares what it takes, with `takes` or `over`, and has a row in the table of `arity.test.ts`.

**Alternatives considered.**

- Drop extra arguments and pass `undefined` for missing ones, as library functions did before 0.8.0. A wrong call gave a wrong answer instead of an error: `["number/subtract", 10, 3, 1]` was `7`, with the `1` dropped.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `library-function-arity`: `strict`. "Every function of the standard library takes a set number of arguments, and a call with any other number fails"
- Holds when Lion is run: `schema-call-wrong-arity` is `error`. "One function, `takes`, carries the rule for library functions, relations, schemas, aggregates, and graph algorithms"
- Holds when Lion is run: `graph-algorithm-wrong-arity` is `error`. "One function, `takes`, carries the rule for library functions, relations, schemas, aggregates, and graph algorithms"
- Stated, not checked by running Lion: `arity-error-kind` is `logic-error`. "the failure is a `LogicError`"
- Stated, not checked by running Lion: `arity-message-form` is `one-form`. "any other number fails with one form of message"
- Holds when Lion is run: `func-bind-missing-this` is `error`. "`func/bind` and `func/apply` need the function and its `this`"
- Holds when Lion is run: `func-apply-missing-this` is `error`. "`func/bind` and `func/apply` need the function and its `this`"
- Holds when Lion is run: `host-calls-library-function-extra-arguments` is `error`. "a library function handed to host code that passes extra arguments, as `Array.prototype.map` does through `func/callback`, fails"
- Holds when Lion is run: `combining-functions-several-arguments` is `combine-left-to-right`. "`number/add`, `number/multiply`, `number/min`, `number/max`, `string/concat`, and `array/concat` combine one or more arguments from left to right, as their Scheme counterparts do"
- Holds when Lion is run: `add-more-than-two-arguments` is `sum`. "`["number/add", 1, 2, 3]` is `6`, where the `3` used to be dropped"
- Holds when Lion is run: `lambda-extra-arguments` is `ignored`. "A lambda still ignores arguments past its parameters, as in JavaScript, so host code can call it as a callback."
- Stated, not checked by running Lion: decided `arity-checks`: `one-takes-function`. "One function, `takes`, carries the rule for library functions, relations, schemas, aggregates, and graph algorithms"
- Holds when Lion is run: `takes` exists. "One function, `takes`, carries the rule for library functions, relations, schemas, aggregates, and graph algorithms"
- Holds when Lion is run: `over` exists. "`over` builds a library function from a schema for each argument"
- Stated, not checked by running Lion: `core-code-lines-added` is 62. "The code grew by 62 lines"
- Stated, not checked by running Lion: decided `lambda-arity`: `extra-arguments-ignored`. "A lambda still ignores arguments past its parameters, as in JavaScript, so host code can call it as a callback."
- Holds when Lion is run: rule `arity-rule` holds. "A call gives a function as many arguments as it takes, and any other number fails with one form of message"
- Stated, not checked by running Lion: rule `new-functions-declare-arity` holds. "Every new function declares what it takes, with `takes` or `over`, and has a row in the table of `arity.test.ts`."
- Holds when Lion is run: `library-function-extra-arguments` is `error`. "Every function of the standard library takes a set number of arguments, and a call with any other number fails: `"number/subtract" takes 2 arguments but got 3.`"
- Holds when Lion is run: `library-function-missing-arguments` is `error`. "Every function of the standard library takes a set number of arguments, and a call with any other number fails"
- Holds when Lion is run: `arity-error-in-waiting-call` is `error`. "A call with the wrong number of arguments fails where it runs, also where it waits for a logic variable in a rule, a query, or a `find`"
- Holds when Lion is run: `relation-call-wrong-arity` is `error`. "One function, `takes`, carries the rule for library functions, relations, schemas, aggregates, and graph algorithms"

<a id="evaluate-result-type"></a>

## evaluate-result-type

Now: `unknown`.

- 2025-12-26 `evaluate-result-type`: `unknown` over `lion-value-type`: "introduces temporary solution to typing (via unknown)" (`599cff2`)

<a id="test-runner"></a>

## test-runner

Now: `vitest`.

- 2025-12-26 `test-runner`: `vitest`: "The README says what Lion does where the research model found it said otherwise. A `cond` condition counts as false when it is `false`, `null`, `0`, or `""`, as the reference's truthiness rule already said, where the README said every string counts as true. A question in plain code is asked as soon as something needs its value, and a program or `begin` whose value is a goal gives the goal as written, so `["exists", ["?y"], ["=", "?y", 1]]` is `true` as a value, as in `["value/identity", …]`, and not as a program; the reference says the same. The empty array `[]` evaluates to itself. The editor section no longer describes the outline, inspector, and source views it lost, its command is `turbo dev --filter=@lionlang/repl`, and the link to the agent's program no longer points into a local folder. AGENTS.md says `bun run test`, and `packages/examples/CLAUDE.md` says the tests use Vitest, as AGENTS.md does." (`599cff2`, `research-model.json`)

<a id="evaluator-structure"></a>

## evaluator-structure

Now: `unit-per-form`.

- 2025-12-28 `evaluator-structure`: `unit-per-form` over `single-evaluate-module`: "breaks every form case out into its own testable unit" (`4d797ef`)

<a id="special-form-dispatch"></a>

## special-form-dispatch

Now: `form-schemas`.

- 2025-12-29 `special-form-dispatch`: `form-schemas` over `head-name-match`: "export const EvalFormSchema = Schema.Tuple(Schema.Literal("eval"), LionExpressionSchema);" (`a77ea71`)

<a id="object-get-missing-key"></a>

## object-get-missing-key

Now: `null`.

- 2025-12-31 `object-get-missing-key`: `error` over `undefined`: "Effect.flatMap(Option.getOrElse(() => Effect.fail(new Error("Key not found"))))" (`c6c1f39`)
- 2026-03-31 `object-get-missing-key`: `undefined` over `error`: "should return undefined for missing keys" (`c11efe8`)
- 2026-11-11 `object-get-missing-key`: `null` over `undefined`, was `undefined`: "An answer that means nothing is here is `null`, such as a missing key from `object/get` or the first item of an empty list." (`values-are-json.json`)

<a id="values-are-json"></a>

### Lion's values are JSON, so the standard library never gives `undefined`, `NaN`, or `Infinity`

Recorded 2026-11-11 in `history/notes/values-are-json.json`.

**Context.** Lion runs on JavaScript, but its values are JSON, and the two disagree in a few places. The standard library followed JavaScript in some of them: division by zero gave `Infinity`, `object/get` gave `undefined` for a missing key, `array/head` crashed on an empty list, and `value/object?` was true for lists. Such values cannot be printed as JSON, stored as a fact, or saved in a snapshot, and facts and rule results already refused numbers that are not finite.

**Decision.** Where JavaScript and JSON disagree, Lion follows JSON, everywhere the case comes up. Arithmetic whose result is not a finite number, such as division by zero or an overflow, fails with the new `ArithmeticError`; this covers `number/add`, `number/subtract`, `number/multiply`, and `number/divide`, and `aggregate/sum` and `aggregate/mean` on a list. An answer that means nothing is here is `null`, such as a missing key from `object/get` or the first item of an empty list. `value/object?` is true for records and not for lists. Query answers and the rows rules derive must be JSON data, and `["=", 0, -0]` is `true`, since JSON writes both as `0`.

**Consequences.** A Lion value can always be printed, stored as a fact, and saved, and a number that is not finite fails at the function that made it instead of where it is used later. Programs that relied on `Infinity`, `undefined`, or `value/object?` of a list behave differently. A query whose answer binds a variable to a function, which used to leave the variable out, now fails and shows the answer.

**Alternatives considered.**

- Return what JavaScript returns, such as `Infinity`, `NaN`, and `undefined`. JSON cannot hold them, so such a value cannot be printed, stored as a fact, or saved in a snapshot.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `javascript-json-disagreement`: `follow-json`. "Where JavaScript and JSON disagree, Lion follows JSON, everywhere the case comes up."
- Holds when Lion is run: `array-head-empty-list` is `null`. "An answer that means nothing is here is `null`, such as a missing key from `object/get` or the first item of an empty list."
- Holds when Lion is run: `value-object-list` is `false`. "`value/object?` is true for records and not for lists."
- Holds when Lion is run: `query-answer-non-json` is `error`. "Query answers and the rows rules derive must be JSON data"
- Holds when Lion is run: `derived-row-non-json` is `error`. "Query answers and the rows rules derive must be JSON data"
- Holds when Lion is run: `zero-equals-negative-zero` is `true`. "`["=", 0, -0]` is `true`, since JSON writes both as `0`"
- Holds when Lion is run: `non-finite-number-failure-point` is `function-that-made-it`. "a number that is not finite fails at the function that made it instead of where it is used later"
- Holds when Lion is run: `division-by-zero` is `error`. "Programs that relied on `Infinity`, `undefined`, or `value/object?` of a list behave differently."
- Holds when Lion is run: `object-get-missing-key` is `null`. "Programs that relied on `Infinity`, `undefined`, or `value/object?` of a list behave differently."
- Holds when Lion is run: `value-object-list` is `false`. "Programs that relied on `Infinity`, `undefined`, or `value/object?` of a list behave differently."
- Holds when Lion is run: `query-answer-variable-bound-to-function` is `error`. "A query whose answer binds a variable to a function, which used to leave the variable out, now fails and shows the answer."
- Stated, not checked by running Lion: decided `non-finite-arithmetic`: `arithmetic-error`. "Arithmetic whose result is not a finite number, such as division by zero or an overflow, fails with the new `ArithmeticError`"
- Stated, not checked by running Lion: decided `object-get-missing-key`: `null`. "An answer that means nothing is here is `null`, such as a missing key from `object/get` or the first item of an empty list."
- Holds when Lion is run: rule `values-are-json` holds. "Lion's values are JSON, so the standard library never gives `undefined`, `NaN`, or `Infinity`"
- Holds when Lion is run: `division-by-zero` is `error`. "Where JavaScript and JSON disagree, Lion follows JSON, everywhere the case comes up. Arithmetic whose result is not a finite number, such as division by zero or an overflow, fails with the new `ArithmeticError`"
- Holds when Lion is run: `number-overflow` is `error`. "Where JavaScript and JSON disagree, Lion follows JSON, everywhere the case comes up. Arithmetic whose result is not a finite number, such as division by zero or an overflow, fails with the new `ArithmeticError`"
- Holds when Lion is run: `ArithmeticError` exists. "fails with the new `ArithmeticError`"
- Holds when Lion is run: `aggregate-sum-non-finite` is `error`. "this covers `number/add`, `number/subtract`, `number/multiply`, and `number/divide`, and `aggregate/sum` and `aggregate/mean` on a list"
- Holds when Lion is run: `object-get-missing-key` is `null`. "An answer that means nothing is here is `null`, such as a missing key from `object/get` or the first item of an empty list."

<a id="test-location"></a>

## test-location

Now: `tests-folder`.

- 2026-01-01 `test-location`: `tests-folder` over `colocated`: "moved tests into dedicated folders" (`76f3fd4`)

<a id="evaluation-runtime"></a>

## evaluation-runtime

Now: `run-to-completion`.

- 2026-03-20 `evaluation-runtime`: `resumable-oplog`: "Implement a function evaluate() which takes in an oplog (Operation Log)." (`0529eec`)
- 2026-03-27 `evaluation-runtime`: `run-to-completion` over `resumable-oplog`, was `resumable-oplog`: "Evaluation runs to its end in one pass, and does not pause at host calls to resume from a log" (`2ebcfac`, `00f403c`, `no-resumable-evaluation.json`)

<a id="no-resumable-evaluation"></a>

### Evaluation runs to its end in one pass, and does not pause at host calls to resume from a log

Recorded 2026-03-27 in `history/notes/no-resumable-evaluation.json`.

**Context.** In March 2026 a spec, `packages/core/specs/resumable-evaluation.md`, asked for resumable evaluation, and the evaluator was built to it. Evaluation took an operation log. A call to an effectful function, which meant any function outside the standard library, was looked up in the log: with no entry, evaluation added an `operation_started` entry and stopped with `ContinuationNeededError`; with a matching `operation_completed` entry, it used the stored result and did not call the function. To continue, the host passed back a log with the completed entry, and the program was evaluated again from the start, every pure expression again and every effectful one from the log.

**Decision.** Resumability was removed on March 27, 2026. The operation log, its service and schemas, and the errors `ContinuationNeededError` and `OplogMismatchError` were deleted, and a call to a host function calls it. The spec was deleted the same day.

**Consequences.** An evaluation needs only its environment: the evaluator's type lost the log service and the two errors, and tests no longer provide an empty log. A host function is called once, when evaluation reaches it, and its result is not recorded anywhere. Lion has no way to stop a program at a host call and continue it later.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `evaluation-runtime`: `run-to-completion`. "Evaluation runs to its end in one pass, and does not pause at host calls to resume from a log"
- Holds when Lion is run: `host-function-call-count` is `once`. "A host function is called once, when evaluation reaches it, and its result is not recorded anywhere"
- Holds when Lion is run: `host-function-result-recorded` is `never`. "A host function is called once, when evaluation reaches it, and its result is not recorded anywhere"
- Stated, not checked by running Lion: `host-call-pause-and-resume` is `unsupported`. "Lion has no way to stop a program at a host call and continue it later"
- Holds when Lion is run: rule `no-resumable-evaluation` holds. "a call to a host function calls it"
- Holds when Lion is run: `host-function-call-without-oplog-entry` is `called`. "a call to a host function calls it"
- Stated, not checked by running Lion: rule `resumable-evaluation` is withdrawn. "Resumability was removed on March 27, 2026"
- Stated, not checked by running Lion: `resumable-evaluation` is removed. "Resumability was removed on March 27, 2026"
- Holds when Lion is run: `ContinuationNeededError` is removed. "The operation log, its service and schemas, and the errors `ContinuationNeededError` and `OplogMismatchError` were deleted"
- Holds when Lion is run: `OplogMismatchError` is removed. "The operation log, its service and schemas, and the errors `ContinuationNeededError` and `OplogMismatchError` were deleted"
- Stated, not checked by running Lion: rule `one-completion-per-operation` is withdrawn. "The operation log, its service and schemas, and the errors `ContinuationNeededError` and `OplogMismatchError` were deleted"
- Stated, not checked by running Lion: `resumable-evaluation-spec` is removed. "The spec was deleted the same day"

<a id="host-operation-effectfulness"></a>

## host-operation-effectfulness

Now: `effectful-by-default`.

- 2026-03-20 `host-operation-effectfulness`: `effectful-by-default`: "All operations passed into the environment are considered effectful by default." (`0529eec`)

<a id="library-function-names"></a>

## library-function-names

Now: `module-slash-name`.

- 2026-03-20 `library-function-names`: `module-slash-name` over `bare-names`: "Library functions are named `module/name`, with modules named for the kind of value they work on, such as `number/add`" (`6025a41`, `library-names-module-slash-name.json`)

<a id="library-names-module-slash-name"></a>

### Library functions are named `module/name`, with modules named for the kind of value they work on, such as `number/add`

Recorded 2026-03-20 in `history/notes/library-names-module-slash-name.json`.

**Context.** The first standard library, in December 2025, was a flat set of names in the test environment: `+`, `<`, `not`, `if`, `list`, `first`, `get`. The functions were then grouped into modules in their own files, `math`, `logic`, `list`, `object`, and `func`, but each module was spread into the environment under its bare names.

**Decision.** In March 2026 the standard library became one environment in which each function's name is its module's name, a slash, and its own name: `math/+`, `logic/not`, `list/head`. On April 2, 2026, the modules were renamed for the kind of value they work on, and their functions were named in words: `number/add` replaced `math/+`, `boolean/not` replaced `logic/not`, `array/make` replaced `list/list`, and new `string` and `value` modules joined `object`, `func`, and `console`. `logic/if` was not carried over; the `cond` form, added the day before, chooses between branches.

**Consequences.** A name says which module a function comes from, and every module added later follows the same form: `aggregate`, `graph`, and `schema` sit beside the first eight. The rename changed every program written against the old names, `packages/agent/src/agent.json` among them, before the first release, so `@lionlang/core` 0.1.0 shipped with the names Lion still uses. A program that wants shorter names binds them itself, as the agent does with `["define", "[]", "array/make"]`.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `library-function-names`: `module-slash-name`. "Library functions are named `module/name`, with modules named for the kind of value they work on, such as `number/add`"
- Holds when Lion is run: `string` exists. "new `string` and `value` modules joined `object`, `func`, and `console`"
- Holds when Lion is run: `value` exists. "new `string` and `value` modules joined `object`, `func`, and `console`"
- Holds when Lion is run: `logic/if` is removed. "`logic/if` was not carried over; the `cond` form, added the day before, chooses between branches"
- Holds when Lion is run: `aggregate` exists. "`aggregate`, `graph`, and `schema` sit beside the first eight"
- Holds when Lion is run: `graph` exists. "`aggregate`, `graph`, and `schema` sit beside the first eight"
- Holds when Lion is run: `schema-module` exists. "`aggregate`, `graph`, and `schema` sit beside the first eight"
- Holds when Lion is run: `library-function-bound-to-short-name` is `allowed`. "A program that wants shorter names binds them itself, as the agent does with `["define", "[]", "array/make"]`"
- Stated, not checked by running Lion: rule `library-names-module-slash-name` holds. "Library functions are named `module/name`, with modules named for the kind of value they work on, such as `number/add`"
- Stated, not checked by running Lion: decided `library-module-organization`: `value-kind-modules`. "On April 2, 2026, the modules were renamed for the kind of value they work on, and their functions were named in words"
- Holds when Lion is run: `math/+` is removed. "`number/add` replaced `math/+`, `boolean/not` replaced `logic/not`, `array/make` replaced `list/list`"
- Holds when Lion is run: `logic/not` is removed. "`number/add` replaced `math/+`, `boolean/not` replaced `logic/not`, `array/make` replaced `list/list`"
- Replaced by a later word: `list/list` is removed. "`number/add` replaced `math/+`, `boolean/not` replaced `logic/not`, `array/make` replaced `list/list`"
- Holds when Lion is run: `number/add` exists. "`number/add` replaced `math/+`, `boolean/not` replaced `logic/not`, `array/make` replaced `list/list`"
- Holds when Lion is run: `boolean/not` exists. "`number/add` replaced `math/+`, `boolean/not` replaced `logic/not`, `array/make` replaced `list/list`"
- Holds when Lion is run: `array/make` exists. "`number/add` replaced `math/+`, `boolean/not` replaced `logic/not`, `array/make` replaced `list/list`"

<a id="library-module-organization"></a>

## library-module-organization

Now: `value-kind-modules`.

- 2026-03-20 `library-module-organization`: `value-kind-modules` over `math-logic-list-modules`: "On April 2, 2026, the modules were renamed for the kind of value they work on, and their functions were named in words" (`df689c0`, `library-names-module-slash-name.json`, `32b3996`)

<a id="lint-format-tool"></a>

## lint-format-tool

Now: `ultracite`.

- 2026-03-20 `lint-format-tool`: `ultracite` over `per-package-biome`: "the repository adopted Ultracite, a preset of Biome lint and format rules, as `bun run check` and `bun run fix`" (`0529eec`, `quality-gates.json`)

<a id="quality-gates"></a>

### Every commit runs the tests and the formatter, and CI checks every pull request and push to `main`

Recorded 2026-03-20 in `history/notes/quality-gates.json`.

**Context.** Until March 2026 only the REPL package had a formatter configuration, and nothing ran the tests or a formatter before a commit or after a push.

**Decision.** In March 2026 the repository adopted Ultracite, a preset of Biome lint and format rules, as `bun run check` and `bun run fix`, and a Husky pre-commit hook that runs the tests and then formats the staged files and stages them again. In September 2026 the hook moved from `bun test` to `bun run test`, which runs every workspace's tests through Turbo after the builds they depend on, `bun run typecheck` was added, and a GitHub Actions workflow on every pull request and every push to `main` installs with the frozen lockfile and runs `check`, `typecheck`, `test`, and `build`.

**Consequences.** A commit whose tests fail is refused unless the hook is skipped, and every commit's files are formatted by the same rules. A pull request shows whether it lints, typechecks, passes its tests, and builds before it is merged. Later checks join the same workflow, such as the check of the site's asset versions, and `AGENTS.md` tells agents to run `bun run check`, the tests, and the build before committing.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `quality-gates`: `pre-commit-hook-and-ci`. "Every commit runs the tests and the formatter, and CI checks every pull request and push to `main`"
- Holds when Lion is run: `ci-workflow` exists. "a GitHub Actions workflow on every pull request and every push to `main` installs with the frozen lockfile and runs `check`, `typecheck`, `test`, and `build`"
- Holds when Lion is run: `ci-pull-request` is `checked`. "a GitHub Actions workflow on every pull request and every push to `main` installs with the frozen lockfile and runs `check`, `typecheck`, `test`, and `build`"
- Holds when Lion is run: `ci-push-main` is `checked`. "a GitHub Actions workflow on every pull request and every push to `main` installs with the frozen lockfile and runs `check`, `typecheck`, `test`, and `build`"
- Holds when Lion is run: `ci-format-and-lint` is `runs`. "a GitHub Actions workflow on every pull request and every push to `main` installs with the frozen lockfile and runs `check`, `typecheck`, `test`, and `build`"
- Holds when Lion is run: `ci-typecheck` is `runs`. "a GitHub Actions workflow on every pull request and every push to `main` installs with the frozen lockfile and runs `check`, `typecheck`, `test`, and `build`"
- Holds when Lion is run: `ci-tests` is `runs`. "a GitHub Actions workflow on every pull request and every push to `main` installs with the frozen lockfile and runs `check`, `typecheck`, `test`, and `build`"
- Holds when Lion is run: `ci-build` is `runs`. "a GitHub Actions workflow on every pull request and every push to `main` installs with the frozen lockfile and runs `check`, `typecheck`, `test`, and `build`"
- Holds when Lion is run: `ci-install-lockfile` is `frozen`. "a GitHub Actions workflow on every pull request and every push to `main` installs with the frozen lockfile and runs `check`, `typecheck`, `test`, and `build`"
- Stated, not checked by running Lion: `commit-with-failing-tests` is `refused`. "A commit whose tests fail is refused unless the hook is skipped"
- Stated, not checked by running Lion: rule `ci-checks-site-asset-versions` holds. "Later checks join the same workflow, such as the check of the site's asset versions"
- Holds when Lion is run: rule `quality-gates` holds. "Every commit runs the tests and the formatter, and CI checks every pull request and push to `main`"
- Stated, not checked by running Lion: rule `check-test-build-before-commit` holds. "`AGENTS.md` tells agents to run `bun run check`, the tests, and the build before committing"
- Stated, not checked by running Lion: decided `lint-format-tool`: `ultracite`. "the repository adopted Ultracite, a preset of Biome lint and format rules, as `bun run check` and `bun run fix`"
- Holds when Lion is run: `ultracite` exists. "the repository adopted Ultracite, a preset of Biome lint and format rules, as `bun run check` and `bun run fix`"
- Holds when Lion is run: `husky-pre-commit` exists. "a Husky pre-commit hook that runs the tests and then formats the staged files and stages them again"
- Holds when Lion is run: `pre-commit-hook` is `runs-tests`. "a Husky pre-commit hook that runs the tests and then formats the staged files and stages them again"
- Holds when Lion is run: `pre-commit-hook-staged-files` is `formatted`. "a Husky pre-commit hook that runs the tests and then formats the staged files and stages them again"
- Stated, not checked by running Lion: decided `test-command`: `bun-run-test`. "the hook moved from `bun test` to `bun run test`"
- Holds when Lion is run: `bun-run-typecheck` exists. "`bun run typecheck` was added"

<a id="package-manager"></a>

## package-manager

Now: `bun`.

- 2026-03-20 `package-manager`: `bun`: ""packageManager": "bun@1.3.11"" (`0529eec`)

<a id="quality-gates"></a>

## quality-gates

Now: `pre-commit-hook-and-ci`.

- 2026-03-20 `quality-gates`: `pre-commit-hook-and-ci` over `unchecked`: "Every commit runs the tests and the formatter, and CI checks every pull request and push to `main`" (`quality-gates.json`)

<a id="test-command"></a>

## test-command

Now: `bun-run-test`.

- 2026-03-20 `test-command`: `bun-run-test`: "The README says what Lion does where the research model found it said otherwise. A `cond` condition counts as false when it is `false`, `null`, `0`, or `""`, as the reference's truthiness rule already said, where the README said every string counts as true. A question in plain code is asked as soon as something needs its value, and a program or `begin` whose value is a goal gives the goal as written, so `["exists", ["?y"], ["=", "?y", 1]]` is `true` as a value, as in `["value/identity", …]`, and not as a program; the reference says the same. The empty array `[]` evaluates to itself. The editor section no longer describes the outline, inspector, and source views it lost, its command is `turbo dev --filter=@lionlang/repl`, and the link to the agent's program no longer points into a local folder. AGENTS.md says `bun run test`, and `packages/examples/CLAUDE.md` says the tests use Vitest, as AGENTS.md does." (`b60f4a1`, `quality-gates.json`, `research-model.json`, `AGENTS.md`)

<a id="evaluation-pause-signal"></a>

## evaluation-pause-signal

Now: `error`.

- 2026-03-26 `evaluation-pause-signal`: `error` over `result-value`: "export class EvaluationPaused extends Schema.TaggedClass<EvaluationPaused>(" (`6025a41`)

<a id="test-style"></a>

## test-style

Now: `property-based`.

- 2026-03-26 `test-style`: `property-based` over `example-based`: "Lion's tests are property-based, checked against a model, a round trip, or an equivalence" (`b1e3f0e`, `47ea840`, `property-based-tests.json`)

<a id="property-based-tests"></a>

### Lion's tests are property-based, checked against a model, a round trip, or an equivalence

Recorded 2026-11-11 in `history/notes/property-based-tests.json`.

**Context.** Most of Lion's tests, and every test of the logic layer, used fixed example inputs, and the testing guide in AGENTS.md showed tests of the form `it("should perform operation")`. The logic layer's guarantees are claims about every program: goal-directed and full evaluation give the same answers, a snapshot rebuilds its database, and an invariant holds after every change. A bug in goal-directed queries was found only by comparing the two evaluations on 2,000 generated programs.

**Decision.** New behavior gets property-based tests, not tests with fixed example inputs. A property uses `it.prop` or `it.effect.prop` from `@effect/vitest` with Schemas or generators from `effect/Arbitrary`, and checks behavior against something independent of the code under test: a simpler model, a round trip such as save, load, and save again, or an equivalence such as two ways of computing the same answer. A domain's generators live in a module next to its tests, as `packages/core/src/logic/tests/programs.ts` does for logic programs, and each property must be shown to fail when the code it covers is broken. AGENTS.md and the new CLAUDE.md say so.

**Consequences.** Invariants are tested against a model that makes the same change without invariants and then asks each invariant as a query assertion. The fixes that made the standard library follow JSON each have a property written first and confirmed to fail. The waiting rule came with 35 properties that compare each case with plain evaluation with the value in place of the variable, and the asking rule with 17 that compare each use of a question with a model computed from the facts. A property that restates the implementation proves little, so each one states what users expect in terms of something else.

**Alternatives considered.**

- Example-based unit tests with fixed inputs, as AGENTS.md showed before. A fixed input checks one case. A property is checked against many generated inputs, 100 by default, and the runner shrinks a failing input to a small counterexample.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `test-style`: `property-based`. "Lion's tests are property-based, checked against a model, a round trip, or an equivalence"
- Holds when Lion is run: rule `snapshots-are-programs` holds. "a snapshot rebuilds its database"
- Stated, not checked by running Lion: `property-default-runs` is 100. "A property is checked against many generated inputs, 100 by default"
- Stated, not checked by running Lion: rule `property-based-tests` holds. "New behavior gets property-based tests, not tests with fixed example inputs"
- Stated, not checked by running Lion: rule `example-based-tests` is withdrawn. "Example-based unit tests with fixed inputs, as AGENTS.md showed before"
- Stated, not checked by running Lion: rule `effect-vitest-properties` holds. "A property uses `it.prop` or `it.effect.prop` from `@effect/vitest` with Schemas or generators from `effect/Arbitrary`"
- Stated, not checked by running Lion: rule `test-against-independent-model` holds. "checks behavior against something independent of the code under test: a simpler model, a round trip such as save, load, and save again, or an equivalence such as two ways of computing the same answer"
- Stated, not checked by running Lion: rule `shared-generators` holds. "A domain's generators live in a module next to its tests"
- Stated, not checked by running Lion: rule `properties-can-fail` holds. "each property must be shown to fail when the code it covers is broken"
- Stated, not checked by running Lion: rule `bugs-become-properties` holds. "The fixes that made the standard library follow JSON each have a property written first and confirmed to fail"
- Holds when Lion is run: rule `goal-directed-magic-sets` holds. "goal-directed and full evaluation give the same answers"

<a id="effect-code-style"></a>

## effect-code-style

Now: `pipe`.

- 2026-03-27 `effect-code-style`: `pipe` over `effect-gen`: "more functionalization of environment.ts" (`d4226c6`, `b2ea83c`, `35446bc`, `861278b`)

<a id="core-package-visibility"></a>

## core-package-visibility

Now: `public`.

- 2026-03-27 `core-package-visibility`: `public` over `private`: ""license": "MIT"," (`00f403c`)

<a id="agent-program-format"></a>

## agent-program-format

Now: `json-file`.

- 2026-03-29 `agent-program-format`: `json-file` over `inline-typescript`: "Two days later it moved into its own file, `packages/agent/src/agent.json`" (`ca00e8e`, `agent-as-lion-program.json`)

<a id="agent-as-lion-program"></a>

### The coding agent in `packages/agent` is a Lion program, `agent.json`, run by a small host file

Recorded 2026-03-29 in `history/notes/agent-as-lion-program.json`.

**Context.** On March 29, 2026, a proof of concept for a coding agent began in `packages/agent`: a terminal interface built with OpenTUI, written as a Lion program inside a TypeScript file and evaluated with `run`. Lion did not yet have `define` or `lambda`, and its standard library was a few modules of functions.

**Decision.** The agent is a Lion program. Two days later it moved into its own file, `packages/agent/src/agent.json`, and `src/index.ts` became a host that binds what the program uses, the OpenTUI library, the AI SDK, Zod, `fs`, a renderer, and a model, into the environment and runs it. The interface, the message handling, the calls to the model, and the tools to read files, list directories, and edit files are Lion code. When the program needed something Lion lacked, the same commit added it to Lion: `lambda` and `object/new` came with the message box, `func/callback` and the `console` module with the input handler, and more `object` functions with the read-file tool.

**Consequences.** Lion's features met a real host from then on: `define`, `lambda`, host interop, the module renames, and record patterns in `match` each changed the agent in the commit that made them, and the README lists the agent as a real-world Lion program. The program names its own shorthands with `define`, such as `["define", "()", "object/call-method"]` and `["define", "[]", "array/make"]`, rather than the language growing syntax for them. On April 5, 2026, the agent could edit files, and its commit calls that dogfooding.

**What it asserts, checked.**

- Stated, not checked by running Lion: rule `agent-as-lion-program` holds. "The coding agent in `packages/agent` is a Lion program, `agent.json`, run by a small host file"
- Holds when Lion is run: `func/callback` exists. "`func/callback` and the `console` module with the input handler"
- Holds when Lion is run: `console` exists. "`func/callback` and the `console` module with the input handler"
- Stated, not checked by running Lion: `agent-dogfooding` exists. "On April 5, 2026, the agent could edit files, and its commit calls that dogfooding."
- Stated, not checked by running Lion: decided `agent-program-format`: `json-file`. "Two days later it moved into its own file, `packages/agent/src/agent.json`"
- Stated, not checked by running Lion: decided `agent-shorthand-syntax`: `define-in-program`. "The program names its own shorthands with `define`, such as `["define", "()", "object/call-method"]` and `["define", "[]", "array/make"]`, rather than the language growing syntax for them"
- Holds when Lion is run: `agent-json` exists. "Two days later it moved into its own file, `packages/agent/src/agent.json`"
- Holds when Lion is run: `read-file` exists. "the tools to read files, list directories, and edit files are Lion code"
- Holds when Lion is run: `read-directory` exists. "the tools to read files, list directories, and edit files are Lion code"
- Holds when Lion is run: `edit-file` exists. "the tools to read files, list directories, and edit files are Lion code"
- Holds when Lion is run: `lambda` exists. "`lambda` and `object/new` came with the message box"
- Holds when Lion is run: `object/new` exists. "`lambda` and `object/new` came with the message box"

<a id="agent-shorthand-syntax"></a>

## agent-shorthand-syntax

Now: `define-in-program`.

- 2026-03-29 `agent-shorthand-syntax`: `define-in-program` over `language-syntax`: "The program names its own shorthands with `define`, such as `["define", "()", "object/call-method"]` and `["define", "[]", "array/make"]`, rather than the language growing syntax for them" (`agent-as-lion-program.json`)

<a id="bind-function-name"></a>

## bind-function-name

Now: `func/bind`.

- 2026-03-30 `bind-function-name`: `func/bind` over `func/js-bind`: "updates func/js-bind to func/bind" (`b673d05`)

<a id="special-form-prefix"></a>

## special-form-prefix

Now: `plain`.

- 2026-03-30 `special-form-prefix`: `slash` over `plain`: "Every special form took a leading slash" (`b673d05`, `special-forms-slash-prefix.json`)
- 2026-03-31 `special-form-prefix`: `plain` over `slash`, was `slash`: "Special forms went back to plain names" (`c6c3859`, `special-forms-plain-names.json`)

<a id="special-forms-plain-names"></a>

### Special forms keep plain names, such as `"define"`, with no prefix

Recorded 2026-03-31 in `history/notes/special-forms-plain-names.json`.

**Context.** On March 30, 2026, special forms took a leading slash, as in `["/define", "x", 1]`. The next day, while the tests were being fixed after list auto-quoting was removed, that spelling was reconsidered.

**Decision.** Special forms went back to plain names: `quote`, `eval`, `begin`, `define`, and `lambda`, and every form added since, such as `cond` and `match`, has a plain name too. A form is the array whose first element is its name, and `define` and `lambda` refuse a form's name as a name to bind.

**Consequences.** The forms read as their counterparts in Scheme and Racket do, and a slash is left to library names such as `number/add`. The tests written in the slash spelling were rewritten, and `@lionlang/core` 0.1.0 shipped with plain names.

**Alternatives considered.**

- Keep the leading slash, as in `"/define"`. The commit that reverted it says only that its author was not feeling it.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `special-form-prefix`: `plain`. "Special forms went back to plain names"
- Holds when Lion is run: rule `special-forms-plain-names` holds. "Special forms keep plain names, such as `"define"`, with no prefix"
- Stated, not checked by running Lion: rule `special-forms-slash-prefix` is withdrawn. "Special forms went back to plain names"
- Holds when Lion is run: `special-form-without-slash` is `special-form`. "Special forms went back to plain names: `quote`, `eval`, `begin`, `define`, and `lambda`, and every form added since, such as `cond` and `match`, has a plain name too."
- Holds when Lion is run: `special-form-without-slash` is `special-form`. "The forms read as their counterparts in Scheme and Racket do"
- Replaced by a later word: `define-special-form-name` is `rejected`. "`define` and `lambda` refuse a form's name as a name to bind"
- Replaced by a later word: `lambda-special-form-name-parameter` is `rejected`. "`define` and `lambda` refuse a form's name as a name to bind"
- Stated, not checked by running Lion: rule `library-names-module-slash-name` holds. "a slash is left to library names such as `number/add`"

<a id="special-forms-slash-prefix"></a>

### Special forms are written with a leading slash, such as `"/define"`

Recorded 2026-03-30 in `history/notes/special-forms-slash-prefix.json`.

**Context.** Special forms and names share one space of strings: `["define", "x", 1]` is a form because its first element is the string `"define"`, and `define` refused to bind the names `begin`, `define`, `eval`, and `quote`. Library functions already had names of the form `module/name`, such as `math/+`. On March 30, 2026, the commit that added `lambda` also changed how forms are spelled.

**Decision.** Every special form took a leading slash: `"/quote"`, `"/eval"`, `"/begin"`, `"/define"`, and the new `"/lambda"`. The names that `define` and `lambda` refused to bind became `/begin`, `/define`, `/eval`, and `/quote`.

**Consequences.** Every program and test that used a special form changed its spelling, the agent's program in `packages/agent/src/index.ts` among them, as in `["/define", "message-box", ...]`. The prefix lasted one day, and no release used it.

**What it asserts, checked.**

- Replaced by a later word: decided `special-form-prefix`: `slash`. "Every special form took a leading slash"
- Stated, not checked by running Lion: rule `special-forms-slash-prefix` is withdrawn. "The prefix lasted one day, and no release used it."
- Holds when Lion is run: `lambda` exists. "and the new `"/lambda"`"
- Replaced by a later word: `define-special-form-name` is `rejected`. "`define` refused to bind the names `begin`, `define`, `eval`, and `quote`"
- Stated, not checked by running Lion: rule `library-names-module-slash-name` holds. "Library functions already had names of the form `module/name`"

<a id="property-access-function"></a>

## property-access-function

Now: `object/get`.

- 2026-03-31 `property-access-function`: `object/get` over `object/access`: "access: flow(" (`c11efe8`)

<a id="array-without-function-head"></a>

## array-without-function-head

Now: `error`.

- 2026-03-31 `array-without-function-head`: `error` over `list-of-evaluated-elements`: "an array whose first value is not a function fails with `InvalidFunctionCallError`" (`1d1dacf`, `arrays-are-never-data.json`)

<a id="arrays-are-never-data"></a>

### An array is always a special form or a call, never a list that evaluates to itself

Recorded 2026-03-31 in `history/notes/arrays-are-never-data.json`.

**Context.** Until March 31, 2026, an array that was not a special form and whose first value was not a function evaluated to the array of its evaluated elements, so `[1, ["math/+", 2, 3], true]` gave `[1, 5, true]`. The same rule applied to a call of a name bound to nothing: `["math/sum", 1, 2]` gave back `["math/sum", 1, 2]` instead of failing.

**Decision.** The auto-quoting of lists was removed. An array is a special form or a call, and an array whose first value is not a function fails with `InvalidFunctionCallError`. A list that is data is built by a function, `["list/list", 1, 2]` at the time and `["array/make", 1, 2]` since April 2026, or written inside `quote`.

**Consequences.** A call of a misspelled or unbound name fails where it is written, instead of becoming a list that travels on through the program. The property test that every array of primitives evaluates to itself was deleted, and the tests of `begin`, `define`, `eval`, and `lambda` were rewritten to expect the new error. The README at the time said that all JSON is valid Lion code; the README written for 0.1.0 says that arrays are always treated as executable expressions.

**Alternatives considered.**

- Keep auto-quoting: an array whose first value is not a function evaluates to the array of its evaluated elements. The commit that removed it calls it too magical.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `array-without-function-head`: `error`. "an array whose first value is not a function fails with `InvalidFunctionCallError`"
- Replaced by a later word: `list/list` is removed. "A list that is data is built by a function, `["list/list", 1, 2]` at the time and `["array/make", 1, 2]` since April 2026, or written inside `quote`."
- Holds when Lion is run: `array/make` exists. "A list that is data is built by a function, `["list/list", 1, 2]` at the time and `["array/make", 1, 2]` since April 2026, or written inside `quote`."
- Stated, not checked by running Lion: `list-auto-quote` is removed. "The auto-quoting of lists was removed."
- Stated, not checked by running Lion: rule `non-call-arrays-are-lists` is withdrawn. "The auto-quoting of lists was removed."
- Holds when Lion is run: rule `arrays-are-never-data` holds. "An array is always a special form or a call, never a list that evaluates to itself"
- Holds when Lion is run: `array-first-element-not-function` is `error`. "an array whose first value is not a function fails with `InvalidFunctionCallError`"
- Holds when Lion is run: `array-first-element-not-string` is `error`. "an array whose first value is not a function fails with `InvalidFunctionCallError`"
- Holds when Lion is run: `array-first-element-unbound-string` is `error`. "A call of a misspelled or unbound name fails where it is written, instead of becoming a list that travels on through the program."
- Holds when Lion is run: `array-of-primitives` is `error`. "The property test that every array of primitives evaluates to itself was deleted"
- Holds when Lion is run: `InvalidFunctionCallError` exists. "an array whose first value is not a function fails with `InvalidFunctionCallError`"

<a id="lambda-arity"></a>

## lambda-arity

Now: `extra-arguments-ignored`.

- 2026-04-01 `lambda-arity`: `extra-arguments-ignored`: "A lambda still ignores arguments past its parameters, as in JavaScript, so host code can call it as a callback." (`c771be4`, `2026-11-13-core-0.8.0.json`, `356e74a`, `arity-rule.json`, `README.md`)

<a id="record-pattern-keys"></a>

## record-pattern-keys

Now: `exact`.

- 2026-04-02 `record-pattern-keys`: `pattern-keys-only`: "A record pattern in `match` fits any record that has the pattern's keys with values that fit" (`96eed18`, `record-patterns-by-keys.json`)
- 2026-11-12 `record-pattern-keys`: `exact` over `by-keys`, was `pattern-keys-only`: "a record in `match` fits only a record with the same keys" (`fbc25a1`, `records-are-exact.json`, `schemas-are-logic.json`)

<a id="record-patterns-by-keys"></a>

### A record pattern in `match` fits any record that has the pattern's keys with values that fit

Recorded 2026-04-02 in `history/notes/record-patterns-by-keys.json`.

**Context.** `match`, added on April 2, 2026, took a value, pairs of a predicate and a function, and a fallback function, and called the function of the first predicate that returned `true` for the value. The agent told the parts of an AI model's response apart by their `type`, with a lambda for each, such as `["lambda", ["c"], ["string/equals?", [".", "c", "type"], "text"]]`.

**Decision.** A pattern can also be a record whose values are patterns. It fits a value that is a record, has every key of the pattern, and has at each of those keys a value that fits the pattern there; keys the pattern does not name are ignored, and record patterns nest. A predicate that fails or does not return a boolean does not fit. The agent's patterns became records such as `{"type": ["func/partial", "string/equals?", "text"]}`, and `func/partial` was added to build such predicates.

**Consequences.** A pattern names only the keys it cares about, so one pattern fits records of many shapes, such as response parts that carry `text` or `output` beside `type`. A pattern cannot say that a key is absent or that a record has no other keys. `@lionlang/core` 0.1.0 shipped `match` with these record patterns.

**What it asserts, checked.**

- Replaced by a later word: decided `record-pattern-keys`: `pattern-keys-only`. "A record pattern in `match` fits any record that has the pattern's keys with values that fit"
- Holds when Lion is run: `match-predicate-non-boolean-result` is `no-match`. "A predicate that fails or does not return a boolean does not fit"
- Holds when Lion is run: `func/partial` exists. "`func/partial` was added to build such predicates"
- Holds when Lion is run: `match` exists. "`match`, added on April 2, 2026, took a value, pairs of a predicate and a function, and a fallback function"
- Holds when Lion is run: `match-first-matching-pattern` is `applied`. "called the function of the first predicate that returned `true` for the value"
- Replaced by a later word: rule `record-patterns-by-keys` holds. "A record pattern in `match` fits any record that has the pattern's keys with values that fit"
- Stated, not checked by running Lion: `structural-record-patterns` exists. "A pattern can also be a record whose values are patterns"
- Replaced by a later word: `match-record-pattern-extra-keys` is `fit`. "keys the pattern does not name are ignored"
- Holds when Lion is run: `match-record-pattern-non-record` is `no-fit`. "It fits a value that is a record, has every key of the pattern, and has at each of those keys a value that fits the pattern there"
- Holds when Lion is run: `match-record-pattern-missing-key` is `no-fit`. "It fits a value that is a record, has every key of the pattern, and has at each of those keys a value that fits the pattern there"
- Holds when Lion is run: `match-record-pattern-value-mismatch` is `no-fit`. "It fits a value that is a record, has every key of the pattern, and has at each of those keys a value that fits the pattern there"
- Holds when Lion is run: `match-record-pattern-nested` is `fit`. "record patterns nest"
- Holds when Lion is run: `match-predicate-error` is `no-match`. "A predicate that fails or does not return a boolean does not fit"

<a id="records-are-exact"></a>

### A record fits only a record with the same keys, and `schema/open` allows more

Recorded 2026-11-12 in `history/notes/records-are-exact.json`.

**Context.** Before 0.7.0 a record pattern in `match` fit any record that had its keys, whatever others it had. Schemas made one rule for every place that checks a value, and under it data is a schema for itself: a value with no function in it fits exactly the values equal to it. A record that fit every record with its keys would break that, in `match` and in every other place the rule reaches: a pattern, an argument of a relation call, and the schema of a relation's rows.

**Decision.** A record fits a record with the same keys, with values that fit, wherever a value is checked against a schema. `schema/open` makes a record schema fit a record whatever other keys it has, and `schema/optional` lets a key be left out. A branch of `match` that picks by one field of a larger record opens it: `["schema/open", {"type": "refund"}]`.

**Consequences.** It is a breaking change for `match`: a branch whose pattern is the record `{"type": "refund"}` no longer takes a record that has other keys. A record in a pattern takes apart only a record with the same keys, so `["inbox", {"type": "refund", "id": "?id"}]` asks for rows of exactly that shape, and `["inbox", ["schema/open", {"type": "order", "id": "?id"}]]` also for rows with more keys. A relation's row schema names every column, or is a `schema/open` record that names some. `schema/problems` reports a key the schema does not name as a problem with only `found`.

**Alternatives considered.**

- A record pattern fits any record that has its keys, as `match` did before 0.7.0. Data would no longer fit exactly the values equal to it, which is what makes data a schema for itself; `schema/open` keeps that meaning for a pattern that wants it.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `record-pattern-keys`: `exact`. "A record fits only a record with the same keys, and `schema/open` allows more"
- Holds when Lion is run: `relation-call-open-record-pattern-extra-keys` is `fit`. "`["inbox", ["schema/open", {"type": "order", "id": "?id"}]]` also for rows with more keys"
- Holds when Lion is run: `relation-row-schema-names-some-columns` is `no-fit`. "A relation's row schema names every column, or is a `schema/open` record that names some"
- Holds when Lion is run: `schema-problems-extra-key` is `found-only`. "`schema/problems` reports a key the schema does not name as a problem with only `found`"
- Holds when Lion is run: rule `records-are-exact` holds. "A record fits a record with the same keys, with values that fit, wherever a value is checked against a schema"
- Holds when Lion is run: `schema-record-extra-keys` is `no-fit`. "A record fits a record with the same keys, with values that fit, wherever a value is checked against a schema"
- Stated, not checked by running Lion: rule `record-patterns-by-keys` is withdrawn. "Before 0.7.0 a record pattern in `match` fit any record that had its keys, whatever others it had"
- Holds when Lion is run: rule `schemas-are-logic` holds. "Schemas made one rule for every place that checks a value, and under it data is a schema for itself: a value with no function in it fits exactly the values equal to it"
- Holds when Lion is run: `match-record-pattern-extra-keys` is `no-fit`. "It is a breaking change for `match`: a branch whose pattern is the record `{"type": "refund"}` no longer takes a record that has other keys"
- Holds when Lion is run: `schema-open-record-extra-keys` is `fit`. "`schema/open` makes a record schema fit a record whatever other keys it has"
- Holds when Lion is run: `schema-optional-key-missing` is `fit`. "`schema/optional` lets a key be left out"
- Holds when Lion is run: `relation-call-record-pattern-extra-keys` is `no-fit`. "`["inbox", {"type": "refund", "id": "?id"}]` asks for rows of exactly that shape"

<a id="schemas-are-logic"></a>

### Anything is a schema, one rule says what fits it, and a schema with logic variables in it is a pattern

Recorded 2026-11-12 in `history/notes/schemas-are-logic.json`.

**Context.** Lion had no way to say what a value must be. `match` took a predicate or a record of predicates and failed on any other pattern, a relation call compared each argument with its column, so `["reading", "?sensor", "value/number?"]` matched nothing, and a check on the rows of a relation was an invariant written by hand. Schemas would touch all of these places, and the project's rule is to give such places one rule rather than one each.

**Decision.** Anything is a schema, and one rule says what fits it: a function is a predicate, a record fits a record with the same keys and values that fit, a list fits a list of the same length item by item, and any other value fits a value equal to it, so data is a schema for itself. `match`, the `schema` functions such as `schema/fits?`, `schema/problems`, and `schema/anyOf`, the arguments of a relation call, and the relation option `{"schema": "Order"}` all ask through that rule. A logic variable in a schema is its value once bound and takes the value it meets until then, so `schema/fits?`, a relation call, `=`, and `in` bind the variables of a record, a list, or a built schema: `["inbox", ["schema/open", {"type": "order", "id": "?id"}]]`. A schema check is an ordinary call, so it waits for logic variables and works under `not` and in a `find` like any other, and the schema of a relation's rows is the invariant a program could write by hand.

**Consequences.** A predicate, a relation with one column, a named schema, or a variable that holds one can stand as an argument of a relation call, so `["reading", "?sensor", "value/number?"]` asks for the readings that are numbers, and a relation as the schema of a column is a foreign key. `["schema", "Tree", {"value": "value/number?", "children": ["schema/arrayOf", "Tree"]}]` declares a named schema, one form can declare several that name each other, and snapshots write them. Programs break where they relied on the old behavior: a record in `match` fits only a record with the same keys, and a relation with several columns used as a schema is an error where it matched nothing. The change was large: code lines went from 6,035 to 7,798 and messages from 95 to 123, while the grid's cells like plain code went from 336 to 487.

**Alternatives considered.**

- Compare each argument of a relation call with the values in its column, as before 0.7.0. A function there matched nothing, since no row holds a function, so a query such as `["reading", "?sensor", "value/number?"]` had no answers.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `schema-checking`: `one-fitting-rule`. "Anything is a schema, and one rule says what fits it"
- Holds when Lion is run: `relation-call-variable-holding-schema` is `schema`. "A predicate, a relation with one column, a named schema, or a variable that holds one can stand as an argument of a relation call"
- Holds when Lion is run: `relation-as-column-schema` is `foreign-key`. "a relation as the schema of a column is a foreign key"
- Holds when Lion is run: `schema-form-mutual-reference` is `allowed`. "one form can declare several that name each other"
- Holds when Lion is run: `snapshot-named-schema` is `written`. "and snapshots write them"
- Holds when Lion is run: `match-record-pattern-extra-keys` is `no-fit`. "Programs break where they relied on the old behavior: a record in `match` fits only a record with the same keys"
- Holds when Lion is run: `relation-multi-column-as-schema` is `error`. "Programs break where they relied on the old behavior: a record in `match` fits only a record with the same keys, and a relation with several columns used as a schema is an error where it matched nothing."
- Holds when Lion is run: `schema` exists. "`["schema", "Tree", {"value": "value/number?", "children": ["schema/arrayOf", "Tree"]}]` declares a named schema"
- Holds when Lion is run: `schema/fits?` exists. "the `schema` functions such as `schema/fits?`, `schema/problems`, and `schema/anyOf`"
- Holds when Lion is run: `schema/problems` exists. "the `schema` functions such as `schema/fits?`, `schema/problems`, and `schema/anyOf`"
- Holds when Lion is run: `schema/anyOf` exists. "the `schema` functions such as `schema/fits?`, `schema/problems`, and `schema/anyOf`"
- Stated, not checked by running Lion: decided `relation-call-arguments`: `schemas`. "A predicate, a relation with one column, a named schema, or a variable that holds one can stand as an argument of a relation call"
- Stated, not checked by running Lion: `relation-schema-option` exists. "the relation option `{"schema": "Order"}`"
- Stated, not checked by running Lion: `core-code-lines` is 7798. "code lines went from 6,035 to 7,798"
- Stated, not checked by running Lion: `messages` is 123. "messages from 95 to 123"
- Stated, not checked by running Lion: `grid-cells-like-plain-code` is 487. "the grid's cells like plain code went from 336 to 487"
- Stated, not checked by running Lion: decided `record-pattern-keys`: `exact`. "a record in `match` fits only a record with the same keys"
- Holds when Lion is run: rule `schemas-are-logic` holds. "Anything is a schema, and one rule says what fits it: a function is a predicate, a record fits a record with the same keys and values that fit, a list fits a list of the same length item by item, and any other value fits a value equal to it, so data is a schema for itself."
- Holds when Lion is run: rule `schemas-are-logic` holds. "`match`, the `schema` functions such as `schema/fits?`, `schema/problems`, and `schema/anyOf`, the arguments of a relation call, and the relation option `{"schema": "Order"}` all ask through that rule."
- Holds when Lion is run: rule `schemas-are-patterns` holds. "A logic variable in a schema is its value once bound and takes the value it meets until then, so `schema/fits?`, a relation call, `=`, and `in` bind the variables of a record, a list, or a built schema"
- Holds when Lion is run: rule `waiting-rule` holds. "A schema check is an ordinary call, so it waits for logic variables and works under `not` and in a `find` like any other"
- Stated, not checked by running Lion: rule `relation-schema-is-invariant` holds. "the schema of a relation's rows is the invariant a program could write by hand"
- Holds when Lion is run: `relation-call-function-argument` is `schema`. "so `["reading", "?sensor", "value/number?"]` asks for the readings that are numbers"

<a id="library-helpers-location"></a>

## library-helpers-location

Now: `modules-lib-folder`.

- 2026-04-03 `library-helpers-location`: `modules-lib-folder` over `modules-folder`: "move shared lib into lib folder" (`f6737fa`)

<a id="closure-environment-implementation"></a>

## closure-environment-implementation

Now: `shared-mutable-frames`.

- 2026-04-04 `closure-environment-implementation`: `shared-mutable-frames` over `copy-and-sync-global`: "the same morning, each environment's bindings moved into a `Ref` that every closure over it shares" (`c63b79d`, `lexical-closures.json`)

<a id="lexical-closures"></a>

### Environments form a chain from local to global, and a lambda closes over the environment it is made in

Recorded 2026-04-04 in `history/notes/lexical-closures.json`.

**Context.** The first `lambda`, added on March 30, 2026, copied the bindings of the environment it was made in and ran its body in a new copy with its parameters added. A `define` in the body changed only that copy, so a lambda passed to `func/callback` could not set a global name, and a lambda never saw a name defined after it was made, its own among them. A comment in the code recorded that code inside a lambda had no access to the global environment.

**Decision.** Each environment holds its own bindings and points to the environment around it, and the outermost is the global environment. A name is looked up from the innermost environment outward. Calling a lambda makes a new environment of its parameters whose parent is the environment the lambda was made in, not a copy of it. `define` binds in the global environment, also inside a lambda. A first fix copied the environment at each call and wrote the global bindings back when the call ended; the same morning, each environment's bindings moved into a `Ref` that every closure over it shares.

**Consequences.** Closures nest: in `["lambda", ["x"], [["lambda", ["y"], [["lambda", ["z"], {"x": "x", "y": "y", "z": "z"}], 3]], 2]]` the innermost body sees all three parameters. A lambda sees a global defined after it was made, so it can call itself by the name it is defined under, and a callback that host code runs later can still set a global name. A `define` inside a lambda's body does not make a local name, as it would in Scheme: the README says `define` stores its value in the global environment.

**Alternatives considered.**

- A lambda that runs in a copy of the bindings it was made with, as the first `lambda` did. Code in its body could not reach the global environment: a `define` changed only the copy, and names defined later were missing.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `lambda-closure-environment`: `enclosing-environment`. "Environments form a chain from local to global, and a lambda closes over the environment it is made in"
- Holds when Lion is run: `lambda-recursion-by-defined-name` is `allowed`. "so it can call itself by the name it is defined under"
- Replaced by a later word: `host-callback-define` is `global`. "a callback that host code runs later can still set a global name"
- Stated, not checked by running Lion: decided `closure-environment-implementation`: `shared-mutable-frames`. "the same morning, each environment's bindings moved into a `Ref` that every closure over it shares"
- Holds when Lion is run: rule `lexical-closures` holds. "Calling a lambda makes a new environment of its parameters whose parent is the environment the lambda was made in, not a copy of it"
- Holds when Lion is run: `name-lookup-local-miss` is `parent-environment`. "A name is looked up from the innermost environment outward"
- Holds when Lion is run: `lambda-body-global-environment` is `accessible`. "Each environment holds its own bindings and points to the environment around it, and the outermost is the global environment"
- Replaced by a later word: `define-inside-lambda` is `global`. "`define` binds in the global environment, also inside a lambda"
- Broken: Lion does otherwise: rule `scheme-racket-semantics` holds. "A `define` inside a lambda's body does not make a local name, as it would in Scheme"
- Holds when Lion is run: `lambda-free-variable` is `enclosing-scope`. "the innermost body sees all three parameters"
- Holds when Lion is run: `lambda-global-defined-after-creation` is `visible`. "A lambda sees a global defined after it was made"

<a id="lambda-closure-environment"></a>

## lambda-closure-environment

Now: `enclosing-environment`.

- 2026-04-04 `lambda-closure-environment`: `enclosing-environment` over `copy-of-bindings`: "Environments form a chain from local to global, and a lambda closes over the environment it is made in" (`lexical-closures.json`)

<a id="license"></a>

## license

Now: `mit`.

- 2026-04-06 `license`: `mit`: "Released under the MIT License." (`b44276c`)

<a id="site-domain"></a>

## site-domain

Now: `lionlang-dev`.

- 2026-04-06 `site-domain`: `lionlang-dev`: "lionlang.dev" (`80b6db6`)

<a id="site-examples"></a>

## site-examples

Now: `list-operations`.

- 2026-04-06 `site-examples`: `list-operations` over `lambda-example`: "Remove lambda example, add list operations" (`26bc1dc`)

<a id="core-npm-access"></a>

## core-npm-access

Now: `public`.

- 2026-04-06 `core-npm-access`: `public`: ""access": "public"" (`b33ffd1`)

<a id="package-scope"></a>

## package-scope

Now: `lionlang`.

- 2026-04-06 `package-scope`: `lionlang` over `lion`: ""name": "@lionlang/core"," (`b33ffd1`)

<a id="docs-rebase-conflicts"></a>

## docs-rebase-conflicts

Now: `resolved`.

- 2026-04-06 `docs-rebase-conflicts`: `resolved`: "conflicts resolved" (`4be765d`)

<a id="core-homepage"></a>

## core-homepage

Now: `lionlang-dev`.

- 2026-04-06 `core-homepage`: `lionlang-dev`: "The package's README, which documents the expression model, every special form and module, and host interop, and its homepage, lionlang.dev." (`2026-04-06-core-0.1.1.json`, `ca42dc0`)

<a id="core-entry-point"></a>

## core-entry-point

Now: `subpath-exports`.

- 2026-04-19 `core-entry-point`: `subpath-exports` over `barrel`: "Drop empty barrel (src/index.ts); consumers import from subpath exports." (`e16eb12`)

<a id="ui-stream-documents"></a>

## ui-stream-documents

Now: `single-source`.

- 2026-04-19 `ui-stream-documents`: `source-and-bindings` over `single-source`: "Bindings paths are flat (`/eth-price`), so they never shift" (`e16eb12`)
- 2026-04-19 `ui-stream-documents`: `single-source` over `source-and-bindings`, was `source-and-bindings`: "refactor(repl): collapse source+bindings into a single source document" (`425c226`, `ef979f3`)

<a id="ui-stream-transport"></a>

## ui-stream-transport

Now: `json-patch`.

- 2026-04-19 `ui-stream-transport`: `json-patch` over `ui-stream-message-protocol`: "Streaming uses RFC 6902 JSON Patch against two documents: the source tree and a separate bindings document. No custom stream protocol." (`e16eb12`)

<a id="ui-streaming-architecture"></a>

## ui-streaming-architecture

Now: `source-as-state`.

- 2026-04-19 `ui-streaming-architecture`: `source-as-state` over `ui-tagged-records`: "feat(repl): source-as-state UI streaming with direct React component env" (`e16eb12`, `9a1522e`)

<a id="unbound-string-semantics"></a>

## unbound-string-semantics

Now: `settled-by-scope`.

- 2026-04-19 `unbound-string-semantics`: `keep-string-fallback` over `ref-form`, `call-form`: "No language-level changes to Lion (no `ref`, no `call`, no change to string-lookup semantics)." (`e16eb12`)
- 2026-11-19 `unbound-string-semantics`: `settled-by-scope` over `keep-string-fallback`, `ref-form`, `call-form`, was `keep-string-fallback`: "A string is a name when a scope it is written in declares it, and data otherwise, settled before it runs, so a binding made later never turns data into a name." (`names-by-scope.json`)

<a id="names-by-scope"></a>

### A string means what the scopes it is written in declare, a define binds in its body, a binding can take a form's name, and a condition is true or false

Recorded 2026-11-19 in `history/notes/names-by-scope.json`.

**Context.** Lion decided at run time whether a string was a name: in `["define", "f", ["lambda", [], "status"]]` the call gave `"status"` until something defined `status`, and the value after, so the same code gave different values over time, and a binding made anywhere quietly turned data into a name. A `define` inside a lambda wrote a global, so a helper value inside a function leaked out of it; the coding agent's tool did so, overwriting a global of the same name. Twenty-five special forms, `fact`, `in`, `find`, `not`, and `some` among them, could not be parameters or definitions, and every array that named a form but had another shape failed with `["define","x"] is not a call: its first element must be a special form or evaluate to a function.`, for a form that was one. And `cond` used JavaScript truthiness, where `0` and `""` were false and `[]` was true, while a filter and the arguments of `and`, `or`, and `not` took only `true` and `false`.

**Decision.** A string is a name when a scope it is written in declares it, and data otherwise, settled before it runs, so a binding made later never turns data into a name. A scope declares its bindings from its start: a run's top scope declares the names the environment and the database bind, every name the program's top level defines, and every relation and schema the program declares; a lambda's scope declares its parameters and the names its body defines. A `define` binds in the body it stands in, a lambda's or the program's, and a name read before its `define` has run fails with `UndefinedYetError`. A new form, `set!`, changes the nearest binding of a name, as in Scheme. A parameter or a `define` can take a special form's name, and an array that starts with it is a call where the binding is in scope; a relation or schema still cannot, since its name is bound in every run of its database. An array that names a form but does not have the form's shape fails with `MalformedFormError`, which says what the form takes, with an example. A condition of `cond` must be `true` or `false`, as a filter must, and `else` always holds unless a scope declares it.

**Consequences.** The coding agent changes its message list with `set!`, and its file tool's helper values stay in the tool. Every program the docs show gives what it gave before, and the record's own programs run unchanged. Properties in `evaluation/tests/scopes.test.ts` and `special-forms/define.test.ts` check each rule, and the model interpreter the compiled evaluator is checked against reads strings the same way. Measured against main: 14,843 code lines where main has 14,438 (+2.8%), one more special form, two more kinds of error, and 32 more messages, 26 of them the forms' usage texts; the interop grid has three more rows, whose 30 cells all give what plain code gives, and no new exception.

**Alternatives considered.**

- Keep resolving strings when they run. The same code gave different values as names were bound, which no reader of the program could see from its text.
- Write every string that is data inside quote, or mark names with a sigil. Every program and fact would change, for the cases a scope already settles.
- Keep define global and add a local form. Scheme and Racket bind a define in its body; a second form would make Lion's define the one that astonishes.
- Keep refusing a form's name as a binding, with a better message. Words like fact, in, find, and some are common names in the programs agents write, and Scheme lets a binding shadow a keyword.
- Use Scheme's truth, where only false is false. null, which object/get gives for a missing key, would then hold, quietly; a condition that must be true or false fails loudly, as a filter already does.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `unbound-string-semantics`: `settled-by-scope`. "A string is a name when a scope it is written in declares it, and data otherwise, settled before it runs, so a binding made later never turns data into a name."
- Holds when Lion is run: rule `special-forms-plain-names` holds. "A parameter or a `define` can take a special form's name, and an array that starts with it is a call where the binding is in scope; a relation or schema still cannot, since its name is bound in every run of its database."
- Holds when Lion is run: `MalformedFormError` exists. "An array that names a form but does not have the form's shape fails with `MalformedFormError`, which says what the form takes, with an example."
- Holds when Lion is run: `malformed-special-form` is `says-what-the-form-takes`. "An array that names a form but does not have the form's shape fails with `MalformedFormError`, which says what the form takes, with an example."
- Stated, not checked by running Lion: decided `condition-truth`: `true-or-false`. "A condition of `cond` must be `true` or `false`, as a filter must, and `else` always holds unless a scope declares it."
- Holds when Lion is run: `cond-zero-condition` is `error`. "A condition of `cond` must be `true` or `false`, as a filter must, and `else` always holds unless a scope declares it."
- Holds when Lion is run: `cond-empty-string-condition` is `error`. "A condition of `cond` must be `true` or `false`, as a filter must, and `else` always holds unless a scope declares it."
- Holds when Lion is run: `cond-null-condition` is `error`. "A condition of `cond` must be `true` or `false`, as a filter must, and `else` always holds unless a scope declares it."
- Holds when Lion is run: `cond-string-condition` is `error`. "A condition of `cond` must be `true` or `false`, as a filter must, and `else` always holds unless a scope declares it."
- Stated, not checked by running Lion: `cond-else` is `holds-unless-declared`. "A condition of `cond` must be `true` or `false`, as a filter must, and `else` always holds unless a scope declares it."
- Holds when Lion is run: `define-inside-lambda` is `local`. "A `define` binds in the body it stands in, a lambda's or the program's, and a name read before its `define` has run fails with `UndefinedYetError`."
- Holds when Lion is run: rule `strings-settled-by-scope` holds. "A string is a name when a scope it is written in declares it, and data otherwise, settled before it runs, so a binding made later never turns data into a name."
- Holds when Lion is run: `setLocalBinding` exists. "A `define` binds in the body it stands in, a lambda's or the program's, and a name read before its `define` has run fails with `UndefinedYetError`."
- Holds when Lion is run: rule `lexical-closures` holds. "A `define` binds in the body it stands in, a lambda's or the program's, and a name read before its `define` has run fails with `UndefinedYetError`."
- Stated, not checked by running Lion: rule `cond-truthiness` is withdrawn. "A condition of `cond` must be `true` or `false`, as a filter must, and `else` always holds unless a scope declares it."
- Broken: Lion does otherwise: rule `scheme-racket-semantics` holds. "A condition of `cond` must be `true` or `false`, as a filter must, and `else` always holds unless a scope declares it."
- Stated, not checked by running Lion: decided `define-scope`: `body`. "A `define` binds in the body it stands in, a lambda's or the program's, and a name read before its `define` has run fails with `UndefinedYetError`."
- Holds when Lion is run: `host-callback-define` is `local`. "A `define` binds in the body it stands in, a lambda's or the program's, and a name read before its `define` has run fails with `UndefinedYetError`."
- Holds when Lion is run: `UndefinedYetError` exists. "A `define` binds in the body it stands in, a lambda's or the program's, and a name read before its `define` has run fails with `UndefinedYetError`."
- Holds when Lion is run: `set!` exists. "A new form, `set!`, changes the nearest binding of a name, as in Scheme."
- Stated, not checked by running Lion: decided `form-name-bindings`: `shadow-in-scope`. "A parameter or a `define` can take a special form's name, and an array that starts with it is a call where the binding is in scope; a relation or schema still cannot, since its name is bound in every run of its database."
- Holds when Lion is run: `define-special-form-name` is `accepted`. "A parameter or a `define` can take a special form's name, and an array that starts with it is a call where the binding is in scope; a relation or schema still cannot, since its name is bound in every run of its database."
- Holds when Lion is run: `lambda-special-form-name-parameter` is `accepted`. "A parameter or a `define` can take a special form's name, and an array that starts with it is a call where the binding is in scope; a relation or schema still cannot, since its name is bound in every run of its database."

<a id="bun-install-linker"></a>

## bun-install-linker

Now: `hoisted`.

- 2026-09-17 `bun-install-linker`: `hoisted`: "linker = "hoisted"" (`b60f4a1`)

<a id="editor-source-pane"></a>

## editor-source-pane

Now: `no-persistent-text-pane`.

- 2026-09-17 `editor-source-pane`: `no-persistent-text-pane` over `synchronized-source-pane`: "Two days later the CodeMirror source view was removed too, so a program is edited through the graph, its nodes, and the inspector" (`f27e671`, `graph-editor-is-the-repl.json`)

<a id="lint-generated-files"></a>

## lint-generated-files

Now: `excluded`.

- 2026-09-17 `lint-generated-files`: `excluded` over `linted`: "// Generated by TanStack Router and shadcn; validated by their upstream tooling." (`b60f4a1`)

<a id="cli-effect-cli-module"></a>

## cli-effect-cli-module

Now: `stable-effect-cli`.

- 2026-09-17 `cli-effect-cli-module`: `stable-effect-cli` over `unstable-effect-cli`: "the CLI moved from `effect/unstable/cli` to `effect/cli`" (`1b380d9`, `2026-11-03-core-0.2.0.json`, `effect-v4.json`)

<a id="effect-v4"></a>

### Lion moves from Effect 3 to Effect 4

Recorded 2026-09-17 in `history/notes/effect-v4.json`.

**Context.** Lion's evaluator, standard library, tests, and other packages were written with Effect 3, `effect` `^3.21.0`. Effect 4 renamed and reshaped APIs the code used, such as `Schema.decodeUnknown`, `Schema.Tuple`, and `Effect.catchAll`, and in September 2026 it was a release candidate.

**Decision.** On September 17, 2026, every package moved to Effect `4.0.0-rc.115`, with `@effect/vitest` to match, and the code was ported: `Schema.decodeUnknownEffect` for `Schema.decodeUnknown`, `Schema.Tuple([a, b])` for `Schema.Tuple(a, b)`, and `Effect.catch` for `Effect.catchAll`. The release of `@lionlang/core` 0.2.0 on November 3 moved to the stable 4.1.2, and the CLI moved from `effect/unstable/cli` to `effect/cli`.

**Consequences.** `run` returns an Effect 4 `Effect`, so from `@lionlang/core` 0.2.0 on a host runs Lion with Effect 4, and the README says that the evaluator runs on Effect v4. The examples in `AGENTS.md` use the Effect 4 APIs. `@lionlang/cli`, added four days after the move, was built on Effect 4's CLI module from its first commit.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `effect-version`: `effect-4`. "Lion moves from Effect 3 to Effect 4"
- Holds when Lion is run: rule `effect-v4` holds. "Lion moves from Effect 3 to Effect 4"
- Stated, not checked by running Lion: decided `cli-effect-cli-module`: `stable-effect-cli`. "the CLI moved from `effect/unstable/cli` to `effect/cli`"
- Holds when Lion is run: `evaluate-result` is `effect`. "`run` returns an Effect 4 `Effect`"
- Holds when Lion is run: `effect` exists. "every package moved to Effect `4.0.0-rc.115`"
- Holds when Lion is run: `effect-package-version` is `effect-4-1-2`. "moved to the stable 4.1.2"

<a id="effect-version"></a>

## effect-version

Now: `effect-4`.

- 2026-09-17 `effect-version`: `effect-4` over `effect-3`: "Lion moves from Effect 3 to Effect 4" (`cbb11e3`, `1b380d9`, `2026-11-03-core-0.2.0.json`, `effect-v4.json`)

<a id="editor-graph-library"></a>

## editor-graph-library

Now: `react-flow-elk`.

- 2026-09-17 `editor-graph-library`: `react-flow-elk`: "**Graph:** React Flow for interaction and bounded rendering, with ELK layered layout in a module worker." (`bdc6d89`)

<a id="editor-json-parser"></a>

## editor-json-parser

Now: `jsonc-parser-strict`.

- 2026-09-17 `editor-json-parser`: `jsonc-parser-strict`: "`jsonc-parser` configured for strict JSON" (`bdc6d89`)

<a id="editor-json-strictness"></a>

## editor-json-strictness

Now: `strict-json`.

- 2026-09-17 `editor-json-strictness`: `strict-json` over `normalize`: "The deliberate limitation is strict JSON: comments and trailing commas are diagnostics, not silently normalized." (`bdc6d89`)

<a id="editor-text-component"></a>

## editor-text-component

Now: `codemirror-6`.

- 2026-09-17 `editor-text-component`: `codemirror-6`: "**Editor:** CodeMirror 6 with the JSON language package." (`bdc6d89`)

<a id="jev-evaluation-trigger"></a>

## jev-evaluation-trigger

Now: `explicit-run`.

- 2026-09-18 `jev-evaluation-trigger`: `explicit-run` over `live`: "Jev programs are always explicit-run to prevent accidental network requests." (`af779dc`)

<a id="graph-value-flow-direction"></a>

## graph-value-flow-direction

Now: `left-to-right`.

- 2026-09-18 `graph-value-flow-direction`: `left-to-right` over `right-to-left`: "fix(repl): lay out graph flow left to right" (`18e3ae1`, `c2360e9`)

<a id="editor-workspace-layout"></a>

## editor-workspace-layout

Now: `full-width-graph`.

- 2026-09-20 `editor-workspace-layout`: `full-width-graph` over `graph-and-inspector-panes`: "The semantic graph owns the full remaining width: there is no persistent inspector, outline, or result sidebar." (`a564abc`)

<a id="graph-branch-folding"></a>

## graph-branch-folding

Now: `always-expanded`.

- 2026-09-21 `graph-branch-folding`: `always-expanded` over `collapsible-branches`: "Semantic branches remain expanded." (`3567d25`)

<a id="output-dock-collapsing"></a>

## output-dock-collapsing

Now: `collapsible`.

- 2026-09-21 `output-dock-collapsing`: `always-open` over `collapsible`: "The dock remains open and updates in place for subsequent runs." (`3567d25`)
- 2026-09-22 `output-dock-collapsing`: `collapsible` over `always-open`, was `always-open`: "fix(repl): make output drawer collapsible" (`cfd42a9`)

<a id="completion-proof-storage"></a>

## completion-proof-storage

Now: `outside-git`.

- 2026-09-21 `completion-proof-storage`: `outside-git` over `committed`: "Do not commit proof into git." (`a7c2a88`)

<a id="graph-edge-direction"></a>

## graph-edge-direction

Now: `value-to-consumer`.

- 2026-09-21 `graph-edge-direction`: `value-to-consumer` over `parent-to-child`: "Value-to-consumer sumi edges carry role labels and arrowheads so the graph shows evaluation flow" (`907cfd5`)

<a id="cli-packaging"></a>

## cli-packaging

Now: `bundled-core-and-editor`.

- 2026-09-21 `cli-packaging`: `bundled-core-and-editor`: "Its build bundles `@lionlang/core` into the command and copies the editor's build output into the package, so an installed CLI needs neither the monorepo nor a separate editor." (`cli-bundles-editor.json`)

<a id="cli-bundles-editor"></a>

### `@lionlang/cli` carries its own copy of `@lionlang/core` and the built graph editor, so it is released with every core release

Recorded 2026-09-21 in `history/notes/cli-bundles-editor.json`.

**Context.** Until September 2026 a Lion program ran only from TypeScript, through `run`, and the graph editor ran from the monorepo with `bun run dev --filter=@lionlang/repl`. A project could not evaluate a Lion file or open the editor without writing host code or checking out the repository.

**Decision.** `@lionlang/cli`, built on Effect's CLI module, adds the `lion` command. `lion program.json` checks the file as a Lion expression, evaluates it with the standard library, and prints the result as JSON, and `lion repl` serves the production graph editor on `127.0.0.1:3000`, with `--host` and `--port` to change it. Its build bundles `@lionlang/core` into the command and copies the editor's build output into the package, so an installed CLI needs neither the monorepo nor a separate editor.

**Consequences.** A change to the core or to the editor reaches users of the CLI only in a new CLI release. Every release of `@lionlang/core` since 0.2.0 ships a new `@lionlang/cli` beside it, and the changelog says which core each one bundles, such as `@lionlang/cli` 0.2.0 with `@lionlang/core` 0.3.0. The CLI has its own version numbers, starting at 0.1.0 with core 0.2.0.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `cli-packaging`: `bundled-core-and-editor`. "Its build bundles `@lionlang/core` into the command and copies the editor's build output into the package, so an installed CLI needs neither the monorepo nor a separate editor."
- Holds when Lion is run: `cli-input-validation` is `lion-expression-schema`. "`lion program.json` checks the file as a Lion expression, evaluates it with the standard library, and prints the result as JSON"
- Holds when Lion is run: `cli-evaluation-environment` is `stdlib`. "`lion program.json` checks the file as a Lion expression, evaluates it with the standard library, and prints the result as JSON"
- Holds when Lion is run: `cli-core-dependency` is `bundled`. "Its build bundles `@lionlang/core` into the command and copies the editor's build output into the package"
- Holds when Lion is run: `cli-editor` is `bundled`. "Its build bundles `@lionlang/core` into the command and copies the editor's build output into the package"
- Stated, not checked by running Lion: `core-release-ships-cli` is `new-cli-release`. "Every release of `@lionlang/core` since 0.2.0 ships a new `@lionlang/cli` beside it"
- Stated, not checked by running Lion: `cli-0-2-0-bundled-core` is `core-0-3-0`. "such as `@lionlang/cli` 0.2.0 with `@lionlang/core` 0.3.0"
- Stated, not checked by running Lion: `cli-0-1-0-bundled-core` is `core-0-2-0`. "The CLI has its own version numbers, starting at 0.1.0 with core 0.2.0."
- Holds when Lion is run: rule `cli-bundles-editor` holds. "`@lionlang/cli` carries its own copy of `@lionlang/core` and the built graph editor, so it is released with every core release"
- Holds when Lion is run: `@lionlang/cli` exists. "`@lionlang/cli`, built on Effect's CLI module, adds the `lion` command."
- Holds when Lion is run: `lion` exists. "`@lionlang/cli`, built on Effect's CLI module, adds the `lion` command."
- Holds when Lion is run: `lion-repl` exists. "`lion repl` serves the production graph editor on `127.0.0.1:3000`, with `--host` and `--port` to change it"
- Holds when Lion is run: `lion-repl-host` exists. "`lion repl` serves the production graph editor on `127.0.0.1:3000`, with `--host` and `--port` to change it"
- Holds when Lion is run: `lion-repl-port` exists. "`lion repl` serves the production graph editor on `127.0.0.1:3000`, with `--host` and `--port` to change it"
- Holds when Lion is run: `lion-repl-default-host` is `loopback`. "`lion repl` serves the production graph editor on `127.0.0.1:3000`"
- Stated, not checked by running Lion: `lion-repl-default-port` is 3000. "`lion repl` serves the production graph editor on `127.0.0.1:3000`"

<a id="cli-install-scope"></a>

## cli-install-scope

Now: `project-or-global`.

- 2026-09-21 `cli-install-scope`: `project-or-global` over `global-only`: "Install `@lionlang/cli` in a project or globally:" (`2ca94fd`)

<a id="site-button-effect"></a>

## site-button-effect

Now: `still-buttons`.

- 2026-11-04 `site-button-effect`: `still-buttons` over `magnetic-buttons`: "Redesigned lionlang.dev: an interactive expression-graph background that follows the cursor and ripples on clicks and evaluations, a self-typing hero that cycles through verified Lion programs, and new Graph Editor and Packages sections covering `@lionlang/cli`, `@lionlang/typesafe-ai`, and Effect 4.1. Buttons stay put under the cursor." (`2026-11-10-core-0.3.0.json`, `ab082c3`)

<a id="docs-example-results"></a>

## docs-example-results

Now: `run-real-core`.

- 2026-11-04 `docs-example-results`: `run-real-core` over `typed-results`: "Every example on lionlang.dev runs on the real `@lionlang/core`, and the docs build writes each example's real result" (`live-examples-run-real-core.json`)

<a id="live-examples-run-real-core"></a>

### Every example on lionlang.dev runs on the real `@lionlang/core`, and the docs build writes each example's real result

Recorded 2026-11-04 in `history/notes/live-examples-run-real-core.json`.

**Context.** The example cards on lionlang.dev showed code with its result typed in beside it as a `// =>` comment, under a line saying that every snippet runs against the standard library. Nothing ran those results, so a change to Lion could leave a card showing a result Lion no longer gives.

**Decision.** Every example card is an editor. Its program runs on `@lionlang/core` in a Web Worker, which the private `@lionlang/site-runtime` package bundles into `docs/lion-worker.js`, and runs again as the reader types; the card shows the result, a typed error, or `console/log` output, and stops a runaway program after 1.5 seconds. The docs page is built from one fragment per document, and the build runs every example with the evaluator the page uses, writes its real result, and fails on an unexpected error, an example too slow for the browser, or a link to a missing id. The site-runtime tests fail when `docs.html` is not what its fragments build, and the pages load their assets with a `?v=` hash, so a cached worker never runs a new page's examples.

**Consequences.** The docs cannot drift from Lion: an example's result on the page is what Lion gave when the page was built. A change to the core rebuilds `docs/lion-worker.js`, and each logic feature of 0.4.0 shipped with its own live card. The browser's limits became Lion's to meet. A 3,000-answer query hit the 1.5 second limit until the worker stopped yielding to the scheduler, and the goal-directed card was rewritten with left recursion after its first version timed out. A visitor with the 0.2.0 worker cached saw the new logic examples fail with `InvalidFunctionCallError`, which is why the asset URLs carry a version.

**Alternatives considered.**

- Code with its result typed in beside it, as the cards showed before. Nothing checked a typed result against Lion. The docs build writes each result from a run, so the docs cannot drift from Lion.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `docs-example-results`: `run-real-core`. "Every example on lionlang.dev runs on the real `@lionlang/core`, and the docs build writes each example's real result"
- Holds when Lion is run: `site-example-runaway-program` is `terminated`. "stops a runaway program after 1.5 seconds"
- Stated, not checked by running Lion: `site-example-time-limit-seconds` is 1.5. "stops a runaway program after 1.5 seconds"
- Holds when Lion is run: `docs-page-out-of-date` is `tests-fail`. "The site-runtime tests fail when `docs.html` is not what its fragments build"
- Holds when Lion is run: `site-asset-urls` is `hash-versioned`. "the pages load their assets with a `?v=` hash, so a cached worker never runs a new page's examples"
- Stated, not checked by running Lion: decided `site-asset-caching`: `hash-versioned-urls`. "the pages load their assets with a `?v=` hash, so a cached worker never runs a new page's examples"
- Holds when Lion is run: `site-cached-worker-with-new-page` is `never-paired`. "A visitor with the 0.2.0 worker cached saw the new logic examples fail with `InvalidFunctionCallError`, which is why the asset URLs carry a version"
- Stated, not checked by running Lion: rule `rebuild-site-worker-after-core-change` holds. "A change to the core rebuilds `docs/lion-worker.js`"
- Holds when Lion is run: `site-worker-scheduler-yield` is `prevented`. "A 3,000-answer query hit the 1.5 second limit until the worker stopped yielding to the scheduler"
- Stated, not checked by running Lion: `site-goal-directed-example-right-recursive` is `timed-out`. "the goal-directed card was rewritten with left recursion after its first version timed out"
- Stated, not checked by running Lion: decided `goal-directed-example-recursion`: `left-recursion`. "the goal-directed card was rewritten with left recursion after its first version timed out"
- Holds when Lion is run: rule `live-examples-run-real-core` holds. "the build runs every example with the evaluator the page uses, writes its real result, and fails on an unexpected error, an example too slow for the browser, or a link to a missing id"
- Holds when Lion is run: `docs-example-unexpected-error` is `build-fails`. "the build runs every example with the evaluator the page uses, writes its real result, and fails on an unexpected error, an example too slow for the browser, or a link to a missing id"
- Holds when Lion is run: `docs-example-too-slow` is `build-fails`. "the build runs every example with the evaluator the page uses, writes its real result, and fails on an unexpected error, an example too slow for the browser, or a link to a missing id"
- Holds when Lion is run: `docs-link-to-missing-id` is `build-fails`. "the build runs every example with the evaluator the page uses, writes its real result, and fails on an unexpected error, an example too slow for the browser, or a link to a missing id"
- Stated, not checked by running Lion: `site-live-example-editors` exists. "Every example card is an editor"
- Holds when Lion is run: `@lionlang/site-runtime` exists. "the private `@lionlang/site-runtime` package bundles into `docs/lion-worker.js`"
- Holds when Lion is run: `build-docs` exists. "The docs page is built from one fragment per document"
- Holds when Lion is run: `site-example-output` is `result-errors-and-logs`. "the card shows the result, a typed error, or `console/log` output"

<a id="goal-directed-example-recursion"></a>

## goal-directed-example-recursion

Now: `left-recursion`.

- 2026-11-04 `goal-directed-example-recursion`: `left-recursion` over `right-recursion`: "the goal-directed card was rewritten with left recursion after its first version timed out" (`f617c07`, `live-examples-run-real-core.json`)

<a id="site-asset-caching"></a>

## site-asset-caching

Now: `hash-versioned-urls`.

- 2026-11-04 `site-asset-caching`: `hash-versioned-urls` over `plain-urls`: "the pages load their assets with a `?v=` hash, so a cached worker never runs a new page's examples" (`2026-11-10-core-0.4.0.json`, `65ae02d`, `live-examples-run-real-core.json`, `README.md`)

<a id="typecheck-scope"></a>

## typecheck-scope

Now: `sources-only`.

- 2026-11-04 `typecheck-scope`: `sources-only` over `sources-and-dist`: "typecheck sources only and after dependency builds" (`32e81b0`)

<a id="logic-paradigm"></a>

## logic-paradigm

Now: `datalog`.

- 2026-11-10 `logic-paradigm`: `datalog` over `prolog`: "`@lionlang/core` gets a Datalog-style logic layer." (`datalog-logic-layer.json`)

<a id="datalog-logic-layer"></a>

### Logic programming in Lion is Datalog, built into the Lisp as ordinary forms and values

Recorded 2026-11-10 in `history/notes/datalog-logic-layer.json`.

**Context.** Lion was a Lisp whose programs are JSON, and a program had to spell out how to find each answer. Questions about connected data, such as where a path from one node leads, are easier to state as facts, rules that derive more facts, and queries over them. A logic layer had to fit the language: its rules and queries had to be JSON like the rest of Lion, and its answers had to be plain Lion data.

**Decision.** `@lionlang/core` gets a Datalog-style logic layer. `["relation", "edge", ["from", "to"]]` binds `edge` to a relation, and calling it, as in `["edge", "a", "?b"]`, builds a goal, which is a value like any other. `fact`, `retract`, `rule`, `query`, `why`, `not`, `and`, `or`, and `=` are special forms, and an unbound `"?name"` string evaluates to a logic variable, while a bound name still wins. Answers are computed bottom-up with semi-naive evaluation and kept until a fact or rule changes. Rules are checked for safety when they are added, negation is stratified, and `why` explains any derived fact as a tree of rules, facts, checks, and absences.

**Consequences.** Evaluation starts from the facts, and rules only combine values that already exist, so it always stops, and the answer does not depend on the order rules are written in. The price is expressiveness: a recursive rule cannot invent new values. A rule that negates its own head, directly or through others, has no stratum and is rejected when it is added. Each `run` gets its own database, and a host passes `{ database }` as the third argument of `run` to share one across runs. The logic features that came later, such as aggregates, keys, snapshots, invariants, and graph algorithms, are forms of the same database.

**Alternatives considered.**

- Prolog, which answers a question by searching backward from it and trying rules in order. A Prolog query can run forever, and its answer can depend on the order the rules were written in.
- Rules and queries in a syntax of their own, as most logic languages have. In Lion a goal is a value, so it can be stored, passed to a function, built by a lambda, and combined with `and`, `or`, and `not`, and answers come back as ordinary records. That keeps the logic layer inside the language.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `logic-paradigm`: `datalog`. "`@lionlang/core` gets a Datalog-style logic layer."
- Holds when Lion is run: `why` exists. "`fact`, `retract`, `rule`, `query`, `why`, `not`, `and`, `or`, and `=` are special forms"
- Holds when Lion is run: `not` exists. "`fact`, `retract`, `rule`, `query`, `why`, `not`, `and`, `or`, and `=` are special forms"
- Holds when Lion is run: `and` exists. "`fact`, `retract`, `rule`, `query`, `why`, `not`, `and`, `or`, and `=` are special forms"
- Holds when Lion is run: `or` exists. "`fact`, `retract`, `rule`, `query`, `why`, `not`, `and`, `or`, and `=` are special forms"
- Holds when Lion is run: `=` exists. "`fact`, `retract`, `rule`, `query`, `why`, `not`, `and`, `or`, and `=` are special forms"
- Holds when Lion is run: `relation-call` is `goal`. "calling it, as in `["edge", "a", "?b"]`, builds a goal, which is a value like any other"
- Holds when Lion is run: `unbound-question-mark-string` is `logic-variable`. "an unbound `"?name"` string evaluates to a logic variable, while a bound name still wins"
- Holds when Lion is run: `bound-question-mark-string` is `bound-value`. "an unbound `"?name"` string evaluates to a logic variable, while a bound name still wins"
- Stated, not checked by running Lion: `logic-evaluation-strategy` is `semi-naive`. "Answers are computed bottom-up with semi-naive evaluation and kept until a fact or rule changes."
- Holds when Lion is run: `logic-answer-cache` is `until-facts-or-rules-change`. "Answers are computed bottom-up with semi-naive evaluation and kept until a fact or rule changes."
- Stated, not checked by running Lion: decided `logic-syntax`: `ordinary-forms-and-values`. "In Lion a goal is a value, so it can be stored, passed to a function, built by a lambda, and combined with `and`, `or`, and `not`, and answers come back as ordinary records."
- Holds when Lion is run: `rule-safety-check-time` is `when-added`. "Rules are checked for safety when they are added"
- Holds when Lion is run: `why-derived-fact` is `explanation-tree`. "`why` explains any derived fact as a tree of rules, facts, checks, and absences"
- Holds when Lion is run: `negation-through-recursion` is `error`. "A rule that negates its own head, directly or through others, has no stratum and is rejected when it is added."
- Holds when Lion is run: `rule-order-answers` is `independent`. "the answer does not depend on the order rules are written in"
- Holds when Lion is run: `run-logic-database` is `fresh-per-run`. "Each `run` gets its own database"
- Stated, not checked by running Lion: `run-database-option` exists. "a host passes `{ database }` as the third argument of `run` to share one across runs"
- Stated, not checked by running Lion: decided `question-mark-name-precedence`: `binding-wins`. "an unbound `"?name"` string evaluates to a logic variable, while a bound name still wins"
- Holds when Lion is run: rule `datalog-logic-layer` holds. "Logic programming in Lion is Datalog, built into the Lisp as ordinary forms and values"
- Holds when Lion is run: `relation` exists. "`["relation", "edge", ["from", "to"]]` binds `edge` to a relation"
- Holds when Lion is run: `fact` exists. "`fact`, `retract`, `rule`, `query`, `why`, `not`, `and`, `or`, and `=` are special forms"
- Holds when Lion is run: `retract` exists. "`fact`, `retract`, `rule`, `query`, `why`, `not`, `and`, `or`, and `=` are special forms"
- Holds when Lion is run: `rule` exists. "`fact`, `retract`, `rule`, `query`, `why`, `not`, `and`, `or`, and `=` are special forms"
- Holds when Lion is run: `query` exists. "`fact`, `retract`, `rule`, `query`, `why`, `not`, `and`, `or`, and `=` are special forms"

<a id="logic-syntax"></a>

## logic-syntax

Now: `ordinary-forms-and-values`.

- 2026-11-10 `logic-syntax`: `ordinary-forms-and-values` over `own-syntax`: "In Lion a goal is a value, so it can be stored, passed to a function, built by a lambda, and combined with `and`, `or`, and `not`, and answers come back as ordinary records." (`datalog-logic-layer.json`)

<a id="question-mark-name-precedence"></a>

## question-mark-name-precedence

Now: `binding-wins`.

- 2026-11-10 `question-mark-name-precedence`: `binding-wins` over `logic-variable`: "an unbound `"?name"` string evaluates to a logic variable, while a bound name still wins" (`04632de`, `datalog-logic-layer.json`)

<a id="termination-check"></a>

## termination-check

Now: `weak-acyclicity`.

- 2026-11-10 `termination-check`: `no-computed-values-in-recursion` over `head-only-check`: "The head variables of a recursive rule must come from facts: bound by a relation goal, or by `=` or `in` from such variables or from plain values." (`recursion-cannot-compute-values.json`)
- 2026-11-13 `termination-check`: `weak-acyclicity` over `no-computed-values-in-recursion`, was `no-computed-values-in-recursion`: "The check that evaluation finishes is weak acyclicity, one rule for computed and invented values. Values flow from the columns a rule's body reads to the columns of its head, and a rule may make a new value for a column, by computing it or inventing it, as long as that value never flows back, through the rules, into making another. `["rule", ["b", "?x", ["number/add", "?x", 10]], ["a", "?x"]]` with `["rule", ["a", "?x"], ["b", "?x", "?y"]]` used to be refused, since any computed value in a recursive rule's head was, and is now accepted. Every program accepted before is still accepted. A computed value that flows back is refused with the same message as before. An invented one is refused with `Rule [...] invents a value for "?m" in its head while recursing, which may never finish. Invent the value in a rule that does not recurse.`" (`786fdc0`, `existential-rules.json`)

<a id="recursion-cannot-compute-values"></a>

### A recursive rule cannot compute new values for its head, so evaluation always ends

Recorded 2026-11-10 in `history/notes/recursion-cannot-compute-values.json`.

**Context.** Datalog evaluation ends because rules only combine values that already exist. A recursive rule that computes a value, as `["number/add", "?n", 1]` does, can derive a new row every round forever. The logic layer rejected a recursive rule that computed a value in its head, but the same value could come in through `=` or `in`: `["rule", ["c", "?m"], ["c", "?n"], ["=", "?m", ["number/add", "?n", 1]]]` invented values forever, and evaluation never finished despite the documented guarantee.

**Decision.** The head variables of a recursive rule must come from facts: bound by a relation goal, or by `=` or `in` from such variables or from plain values. A rule that breaks this is rejected when it is added, with an error that suggests computing the value in a non-recursive rule or aggregating it with a lattice aggregate, which may compute its value while recursing.

**Consequences.** Evaluation of rules always finishes. Values that come from facts are fine, so `["=", "?m", "?to"]` with `?to` from a relation still works in a recursive rule. The price is expressiveness: a value that grows along a recursion, such as a distance, is computed with a lattice aggregate, and recursion through one stops when no value improves or fails with an error after 10,000 rounds.

**Alternatives considered.**

- Check only the head of a recursive rule, as the logic layer first did. `=` and `in` in the body let a recursive rule invent values anyway, and evaluation never finished.

**What it asserts, checked.**

- Replaced by a later word: decided `termination-check`: `no-computed-values-in-recursion`. "The head variables of a recursive rule must come from facts: bound by a relation goal, or by `=` or `in` from such variables or from plain values."
- Holds when Lion is run: `lattice-recursion-still-improving` is `error`. "recursion through one stops when no value improves or fails with an error after 10,000 rounds"
- Replaced by a later word: rule `recursion-cannot-compute-values` holds. "A recursive rule cannot compute new values for its head, so evaluation always ends"
- Replaced by a later word: `recursive-rule-head-variable-source` is `facts`. "The head variables of a recursive rule must come from facts"
- Holds when Lion is run: `recursive-rule-computed-value-through-unify` is `error`. "A rule that breaks this is rejected when it is added"
- Holds when Lion is run: `recursive-rule-computed-value-through-in` is `error`. "A rule that breaks this is rejected when it is added"
- Stated, not checked by running Lion: `recursive-computed-value-error-hint` is `non-recursive-rule-or-lattice-aggregate`. "with an error that suggests computing the value in a non-recursive rule or aggregating it with a lattice aggregate"
- Holds when Lion is run: `recursive-rule-lattice-aggregate-computed-value` is `allowed`. "aggregating it with a lattice aggregate, which may compute its value while recursing"
- Holds when Lion is run: `recursive-rule-unify-from-fact-value` is `allowed`. "Values that come from facts are fine, so `["=", "?m", "?to"]` with `?to` from a relation still works in a recursive rule."
- Holds when Lion is run: rule `lattice-recursion` holds. "a value that grows along a recursion, such as a distance, is computed with a lattice aggregate"

<a id="aggregation-through-recursion"></a>

## aggregation-through-recursion

Now: `lattice-aggregates-only`.

- 2026-11-10 `aggregation-through-recursion`: `never`: "aggregation is stratified like negation: it cannot go through recursion, every rule for an aggregated relation must aggregate the same way, and aggregated relations cannot also have facts" (`beddbed`)
- 2026-11-10 `aggregation-through-recursion`: `lattice-aggregates-only` over `never`, `any-aggregate`, was `never`: "Recursion may aggregate only through lattice aggregates, whose values move one way" (`000fa16`, `2026-11-10-core-0.4.0.json`, `lattice-recursion.json`)

<a id="lattice-recursion"></a>

### Recursion may aggregate only through lattice aggregates, whose values move one way

Recorded 2026-11-10 in `history/notes/lattice-recursion.json`.

**Context.** Aggregates in rule heads were stratified like negation: a relation could aggregate only relations computed in full before it, never through recursion. So a recursive rule could not keep the smallest distance to each node, and minimum distances and shortest paths could not be written as rules. A sum or a count of a partial result is wrong, but a minimum of one is only not yet final.

**Decision.** `aggregate/min`, `aggregate/max`, and the new `aggregate/shortest` and `aggregate/union` are lattice aggregates: a group's value only moves one way as matches arrive. A recursive rule can aggregate with them and compute the aggregated value, as in `["rule", ["dist", "?to", ["aggregate/min", ["number/add", "?d", "?km"]]], ["dist", "?via", "?d"], ["road", "?via", "?to", "?km"]]`. Each group keeps its best value, and rounds re-run the rules on rows that improved until nothing improves. Every relation in a cycle through an aggregate must aggregate, so a replaced value never strands rows derived from it. Other aggregates still cannot recurse.

**Consequences.** Minimum distances and shortest paths are rules, and `why` explains a minimum with the chain that produced it. A cycle that would improve forever, such as a negative-weight cycle under `min`, fails with an error after 10,000 rounds instead of running forever. `aggregate/shortest` breaks ties by the smaller value, so results never depend on match order. lionlang.dev has a live Shortest distances card.

**Alternatives considered.**

- Keep every aggregate out of recursion, as aggregates in rule heads first shipped. Minimum distances and shortest paths could not be expressed.
- Let any aggregate recurse. A sum or a count over a partial result is wrong, not just unfinished. Only an aggregate whose value moves one way gives a partial result that is never wrong.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `aggregation-through-recursion`: `lattice-aggregates-only`. "Recursion may aggregate only through lattice aggregates, whose values move one way"
- Stated, not checked by running Lion: rule `stratified-aggregation` is withdrawn. "Aggregates in rule heads were stratified like negation: a relation could aggregate only relations computed in full before it, never through recursion"
- Holds when Lion is run: `why-lattice-minimum` is `producing-chain`. "`why` explains a minimum with the chain that produced it"
- Holds when Lion is run: `lattice-recursion-still-improving` is `error`. "A cycle that would improve forever, such as a negative-weight cycle under `min`, fails with an error after 10,000 rounds instead of running forever"
- Stated, not checked by running Lion: `lattice-max-rounds` is 10000. "A cycle that would improve forever, such as a negative-weight cycle under `min`, fails with an error after 10,000 rounds instead of running forever"
- Holds when Lion is run: `aggregate-shortest-tie` is `smaller-value`. "`aggregate/shortest` breaks ties by the smaller value, so results never depend on match order"
- Holds when Lion is run: rule `order-independent-results` holds. "`aggregate/shortest` breaks ties by the smaller value, so results never depend on match order"
- Stated, not checked by running Lion: `site-card-shortest-distances` exists. "lionlang.dev has a live Shortest distances card"
- Holds when Lion is run: rule `lattice-recursion` holds. "`aggregate/min`, `aggregate/max`, and the new `aggregate/shortest` and `aggregate/union` are lattice aggregates: a group's value only moves one way as matches arrive"
- Holds when Lion is run: `aggregate/shortest` exists. "`aggregate/min`, `aggregate/max`, and the new `aggregate/shortest` and `aggregate/union` are lattice aggregates: a group's value only moves one way as matches arrive"
- Holds when Lion is run: `aggregate/union` exists. "`aggregate/min`, `aggregate/max`, and the new `aggregate/shortest` and `aggregate/union` are lattice aggregates: a group's value only moves one way as matches arrive"
- Holds when Lion is run: `recursive-rule-aggregate-min` is `allowed`. "A recursive rule can aggregate with them and compute the aggregated value"
- Holds when Lion is run: `recursive-rule-lattice-aggregate-computed-value` is `allowed`. "A recursive rule can aggregate with them and compute the aggregated value"
- Holds when Lion is run: `lattice-group-value` is `keeps-best`. "Each group keeps its best value, and rounds re-run the rules on rows that improved until nothing improves"
- Holds when Lion is run: `lattice-cycle-non-aggregating-relation` is `error`. "Every relation in a cycle through an aggregate must aggregate, so a replaced value never strands rows derived from it"
- Holds when Lion is run: `recursive-rule-aggregate-sum` is `error`. "Other aggregates still cannot recurse"

<a id="query-evaluation"></a>

## query-evaluation

Now: `goal-directed-magic-sets`.

- 2026-11-10 `query-evaluation`: `goal-directed-magic-sets` over `full-bottom-up`: "Lion rewrites the rules with the magic-sets technique" (`2026-11-10-core-0.4.0.json`, `f4c7c4c`, `goal-directed-magic-sets.json`)

<a id="goal-directed-magic-sets"></a>

### A query with a known argument runs a magic-sets rewrite and gives the answers full evaluation gives

Recorded 2026-11-10 in `history/notes/goal-directed-magic-sets.json`.

**Context.** Bottom-up evaluation derives every fact a program implies, while a query usually needs far less: the paths from one node do not need the paths from every other node. A query for the paths from one node of a 3,000-node chain would derive about 4.5 million paths in full.

**Decision.** When a query gives a rule-defined relation a known argument, such as `"a"` in `["path", "a", "?to"]`, Lion rewrites the rules with the magic-sets technique: each relation gets a copy for that pattern of known arguments, guarded by magic relations that pass the known values down through the rule bodies. Known arguments are values, variables that earlier goals bind, and values computed from them. Inside a rule only values and variables bound from facts count, so a rewritten rule never asks about values without end. Relations that are aggregated, computed by an algorithm, or negated, and what they depend on, are computed in full first. The rewrite changes how much is computed, never what the answers are, and `new LogicDatabase({ goalDirected: false })` turns it off.

**Consequences.** The query along the 3,000-node chain returns in milliseconds. Tests run a corpus of programs both ways and require the same answers. Comparing the two ways on 2,000 generated programs found a query whose argument was not JSON data failing where full evaluation found no answers; such an argument now counts as unknown. Answers can come in a different order, so the `"order"` query option is the way to fix one. How a recursive rule is written matters: with a known start, recursion on the left asks only about that start, while recursion on the right asks about every node the paths pass through.

**Alternatives considered.**

- Let values that functions compute inside a rule drive the rewrite. A rewritten rule could then ask about new values without end. Values computed by functions never drive the rewrite inside a rule, so it still finishes.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `query-evaluation`: `goal-directed-magic-sets`. "Lion rewrites the rules with the magic-sets technique"
- Holds when Lion is run: `goal-directed-option` exists. "`new LogicDatabase({ goalDirected: false })` turns it off"
- Holds when Lion is run: `goal-directed-non-json-argument-known` is `unknown`. "such an argument now counts as unknown"
- Stated, not checked by running Lion: `goal-directed-answer-order` is `may-differ`. "Answers can come in a different order, so the `"order"` query option is the way to fix one."
- Holds when Lion is run: `goal-directed-left-recursion-known-start` is `asks-start-only`. "with a known start, recursion on the left asks only about that start, while recursion on the right asks about every node the paths pass through"
- Holds when Lion is run: `goal-directed-right-recursion-known-start` is `asks-every-node`. "with a known start, recursion on the left asks only about that start, while recursion on the right asks about every node the paths pass through"
- Stated, not checked by running Lion: `chain-3000-full-evaluation-paths-millions` is 4.5. "A query for the paths from one node of a 3,000-node chain would derive about 4.5 million paths in full."
- Stated, not checked by running Lion: `generated-programs-compared` is 2000. "Comparing the two ways on 2,000 generated programs"
- Stated, not checked by running Lion: decided `rule-computed-values-in-rewrite`: `never-drive`. "Values computed by functions never drive the rewrite inside a rule, so it still finishes."
- Holds when Lion is run: rule `goal-directed-magic-sets` holds. "The rewrite changes how much is computed, never what the answers are"
- Stated, not checked by running Lion: rule `goal-directed-full-equivalence-tested` holds. "Tests run a corpus of programs both ways and require the same answers."
- Holds when Lion is run: `goal-directed-vs-full-answers` is `same`. "The rewrite changes how much is computed, never what the answers are"
- Holds when Lion is run: `goal-directed-query-computed-argument` is `known`. "Known arguments are values, variables that earlier goals bind, and values computed from them."
- Holds when Lion is run: `goal-directed-query-argument-bound-by-unify` is `known`. "Known arguments are values, variables that earlier goals bind, and values computed from them."
- Holds when Lion is run: `goal-directed-rule-computed-argument` is `unknown`. "Inside a rule only values and variables bound from facts count, so a rewritten rule never asks about values without end."
- Holds when Lion is run: `goal-directed-aggregated-relation` is `computed-in-full`. "Relations that are aggregated, computed by an algorithm, or negated, and what they depend on, are computed in full first."

<a id="rule-computed-values-in-rewrite"></a>

## rule-computed-values-in-rewrite

Now: `never-drive`.

- 2026-11-10 `rule-computed-values-in-rewrite`: `never-drive` over `drive-rewrite`: "Values computed by functions never drive the rewrite inside a rule, so it still finishes." (`goal-directed-magic-sets.json`)

<a id="keyed-relation-fact-semantics"></a>

## keyed-relation-fact-semantics

Now: `upsert`.

- 2026-11-10 `keyed-relation-fact-semantics`: `upsert` over `add-row-beside`: "A fact whose key is already present replaces the old row, like an upsert" (`2026-11-10-core-0.4.0.json`, `2b64585`, `keyed-relations-upsert.json`)

<a id="keyed-relations-upsert"></a>

### A keyed relation holds one row per key, and a fact whose key is present replaces the row

Recorded 2026-11-10 in `history/notes/keyed-relations-upsert.json`.

**Context.** A relation was a set of rows. A `fact` added a row beside any other row with the same id, and only `retract` removed one. So a row that stands for the current state of something, such as an order and its status, became two rows when the status changed, unless the old row was retracted first.

**Decision.** A record after the columns gives a relation a key: `["relation", "order", ["id", "status"], {"key": ["id"]}]` holds at most one row per key. A fact whose key is already present replaces the old row, like an upsert, and when one `fact` form repeats a key the last row wins. A key can span several columns, and a single column can be written without the list. Rules may derive rows of a keyed relation, but two different rows with one key are an error that names both, in goal-directed queries too.

**Consequences.** Changing an order's status is one `fact` form, as the order desk tutorial shows. `retract` still removes a row only when every column matches. Declaring a relation again, for example in a later run that shares the database, must repeat its columns and key. Relation indexes drop deleted rows in place instead of being rebuilt.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `keyed-relation-fact-semantics`: `upsert`. "A fact whose key is already present replaces the old row, like an upsert"
- Holds when Lion is run: `relation-redeclared-differently` is `error`. "Declaring a relation again, for example in a later run that shares the database, must repeat its columns and key."
- Stated, not checked by running Lion: `relation-index-deletion` is `in-place`. "Relation indexes drop deleted rows in place instead of being rebuilt."
- Holds when Lion is run: rule `keyed-relations-upsert` holds. "A keyed relation holds one row per key, and a fact whose key is present replaces the row"
- Stated, not checked by running Lion: `relation-option-key` exists. "A record after the columns gives a relation a key"
- Holds when Lion is run: `keyed-relation-fact-existing-key` is `replaces`. "A fact whose key is already present replaces the old row, like an upsert"
- Holds when Lion is run: `keyed-relation-repeated-key-in-one-fact-form` is `last-wins`. "when one `fact` form repeats a key the last row wins"
- Holds when Lion is run: `relation-key-several-columns` is `allowed`. "A key can span several columns, and a single column can be written without the list."
- Holds when Lion is run: `relation-key-single-column-without-list` is `allowed`. "A key can span several columns, and a single column can be written without the list."
- Holds when Lion is run: `keyed-relation-rules-derive-conflicting-rows` is `error`. "Rules may derive rows of a keyed relation, but two different rows with one key are an error that names both, in goal-directed queries too."
- Holds when Lion is run: `keyed-relation-retract-partial-match` is `no-change`. "`retract` still removes a row only when every column matches."

<a id="database-save-format"></a>

## database-save-format

Now: `lion-program`.

- 2026-11-10 `database-save-format`: `lion-program`: "`["snapshot"]` returns a Lion program of `relation`, `fact`, and `rule` forms that rebuilds the current database." (`56af8ed`, `snapshots-are-programs.json`)

<a id="snapshots-are-programs"></a>

### A logic database is saved as a Lion program of forms that rebuild it

Recorded 2026-11-10 in `history/notes/snapshots-are-programs.json`.

**Context.** A logic database lived only in memory. Each `run` got its own, and a host could pass `{ database }` to share one across runs, but Lion had no way to save one, so the `lion` command line could not keep facts and rules from one run to the next.

**Decision.** `["snapshot"]` returns a Lion program of `relation`, `fact`, and `rule` forms that rebuilds the current database. Strings that would load as something else, such as relation names, bound names, namespaced names, and `?names`, are written inside `quote`, and so are lists and records. Rules are written from their evaluated goals, so aggregates, `in`, `=`, `not`, `or`, and algorithm goals round-trip. `saveDatabase` and `loadDatabase` in `@lionlang/core/logic/snapshot` do the same from TypeScript, and `lion program.json --database store.json` loads a snapshot file, runs the program, and saves it back, one form and one fact per line.

**Consequences.** A saved database is ordinary Lion that can be read, edited, diffed, and run, and evaluating it into an empty database gives the same answers. A database passed to `run` binds its relations by name, so later runs query them without declaring them again. A program and its snapshot must behave the same, and later changes kept them so: invariants are saved after the rules, a function is written under the name the environment gives it, and a waiting `cond`, record, or lambda is written as its form. A rule or invariant counts as one the database holds when a snapshot would write it the same way.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `database-save-format`: `lion-program`. "`["snapshot"]` returns a Lion program of `relation`, `fact`, and `rule` forms that rebuilds the current database."
- Holds when Lion is run: `snapshot-rule-round-trip` is `round-trips`. "Rules are written from their evaluated goals, so aggregates, `in`, `=`, `not`, `or`, and algorithm goals round-trip."
- Holds when Lion is run: `cli-database-file-format` is `one-form-and-fact-per-line`. "one form and one fact per line"
- Holds when Lion is run: `run-database-relations-bound-by-name` is `bound`. "A database passed to `run` binds its relations by name, so later runs query them without declaring them again."
- Holds when Lion is run: `snapshot-invariants-position` is `after-rules`. "invariants are saved after the rules"
- Holds when Lion is run: `snapshot-rule-holding-function` is `written-by-environment-name`. "a function is written under the name the environment gives it"
- Holds when Lion is run: `snapshot-rule-holding-lambda` is `written-as-form`. "a waiting `cond`, record, or lambda is written as its form"
- Holds when Lion is run: `rule-identity` is `snapshot-form`. "A rule or invariant counts as one the database holds when a snapshot would write it the same way."
- Holds when Lion is run: rule `snapshots-are-programs` holds. "A saved database is ordinary Lion that can be read, edited, diffed, and run, and evaluating it into an empty database gives the same answers."
- Holds when Lion is run: rule `equivalent-programs-equivalent` holds. "A program and its snapshot must behave the same"
- Holds when Lion is run: `snapshot` exists. "`["snapshot"]` returns a Lion program"
- Holds when Lion is run: `saveDatabase` exists. "`saveDatabase` and `loadDatabase` in `@lionlang/core/logic/snapshot` do the same from TypeScript"
- Holds when Lion is run: `loadDatabase` exists. "`saveDatabase` and `loadDatabase` in `@lionlang/core/logic/snapshot` do the same from TypeScript"
- Holds when Lion is run: `cli-database-flag` exists. "`lion program.json --database store.json` loads a snapshot file, runs the program, and saves it back"
- Holds when Lion is run: `snapshot-string-that-loads-as-something-else` is `quoted`. "Strings that would load as something else, such as relation names, bound names, namespaced names, and `?names`, are written inside `quote`"
- Holds when Lion is run: `snapshot-lists-and-records` is `quoted`. "and so are lists and records"

<a id="site-worker-scheduler"></a>

## site-worker-scheduler

Now: `prevent-scheduler-yield`.

- 2026-11-10 `site-worker-scheduler`: `prevent-scheduler-yield` over `yield-to-scheduler`: "The live examples on lionlang.dev spent most of a long evaluation idle: the evaluator yielded to the browser scheduler every few thousand steps, and each yield waited on a clamped `setTimeout`. The site worker no longer yields, since the page already stops runaway programs, so a 3,000-answer logic query in the browser went from about 1.8 s (past the 1.5 s limit) to about 150 ms." (`2026-11-10-core-0.4.0.json`, `59f142e`)

<a id="database-change-atomicity"></a>

## database-change-atomicity

Now: `all-or-nothing`.

- 2026-11-11 `database-change-atomicity`: `all-or-nothing` over `partial`: "A change to the logic database is all or nothing" (`2026-11-11-core-0.5.0.json`, `47ea840`, `all-or-nothing-changes.json`)

<a id="all-or-nothing-changes"></a>

### A change to the logic database is all or nothing, keeps every invariant, and adds nothing the database already holds

Recorded 2026-11-11 in `history/notes/all-or-nothing-changes.json`.

**Context.** A `retract` with one invalid fact still removed the facts listed before it, so a failed form left the database half changed. Running a setup program again against a database saved with `lion --database` added each rule a second time, so aggregates counted every match twice. And a program could check a condition on its data only when it asked: a query with the `"assert"` option checked it once, when the query ran.

**Decision.** `["invariant", goal, {"assert": "none"}]` keeps a query assertion in the database: the goal must have no answers, or with `"some"` at least one, when it is added and after every later change. Every `fact`, `retract`, and `rule` form is checked against every invariant once it has made all of its changes, and a form that fails, whether on a bad fact, a broken invariant, or an error while checking one, leaves the database exactly as it was, facts in the same order. Adding a rule or invariant the database already holds, one a snapshot would write the same way, changes nothing, as adding a fact or declaring a relation the same way already did.

**Consequences.** One rule answers what a failed form leaves behind: nothing. Several facts that only make sense together go in one `fact` form, and each later form is checked against the result. Invariants are answered the way queries are, with goal-directed rewriting, aggregates, and graph algorithms, and they are saved in snapshots after the rules and enforced by `lion --database`. Running a setup again, or loading a snapshot onto the database it came from, keeps one copy of each rule.

**Alternatives considered.**

- A new keyword for invariants. The query option `"assert"` already said that a question must have no answers, or some. An invariant reuses it, compiles its goal like a query, and fails in the same words, so there is no second vocabulary to learn, and anything a query can ask, an invariant can require.
- Make one run, rather than one form, the unit of change. One form keeps the rule simple, lets facts that only make sense together go in a single `fact` form, and checks each later form against the result.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `database-change-atomicity`: `all-or-nothing`. "A change to the logic database is all or nothing"
- Holds when Lion is run: `retract-with-invalid-fact` is `no-change`. "a form that fails, whether on a bad fact, a broken invariant, or an error while checking one, leaves the database exactly as it was"
- Holds when Lion is run: `fact-breaking-invariant` is `no-change`. "a form that fails, whether on a bad fact, a broken invariant, or an error while checking one, leaves the database exactly as it was"
- Holds when Lion is run: `invariant-check-error` is `change-undone`. "a form that fails, whether on a bad fact, a broken invariant, or an error while checking one, leaves the database exactly as it was"
- Holds when Lion is run: `failed-change-fact-order` is `preserved`. "leaves the database exactly as it was, facts in the same order"
- Holds when Lion is run: `re-add-rule` is `no-change`. "Adding a rule or invariant the database already holds, one a snapshot would write the same way, changes nothing"
- Holds when Lion is run: `re-add-invariant` is `no-change`. "Adding a rule or invariant the database already holds, one a snapshot would write the same way, changes nothing"
- Holds when Lion is run: `rule-identity` is `snapshot-form`. "one a snapshot would write the same way"
- Holds when Lion is run: `begin-forms-invariant-check` is `each-separately`. "Several facts that only make sense together go in one `fact` form, and each later form is checked against the result."
- Holds when Lion is run: `invariant-evaluation` is `like-queries`. "Invariants are answered the way queries are, with goal-directed rewriting, aggregates, and graph algorithms"
- Holds when Lion is run: `snapshot-invariants-position` is `after-rules`. "they are saved in snapshots after the rules and enforced by `lion --database`"
- Stated, not checked by running Lion: decided `invariant-syntax`: `query-assert-option`. "An invariant reuses it, compiles its goal like a query, and fails in the same words, so there is no second vocabulary to learn"
- Holds when Lion is run: `cli-database-invariants` is `enforced`. "they are saved in snapshots after the rules and enforced by `lion --database`"
- Holds when Lion is run: `cli-database-rerun-setup` is `one-copy`. "Running a setup again, or loading a snapshot onto the database it came from, keeps one copy of each rule."
- Stated, not checked by running Lion: `invariant-failure-message` is `same-as-query-assertion`. "compiles its goal like a query, and fails in the same words"
- Stated, not checked by running Lion: decided `database-change-unit`: `form`. "One form keeps the rule simple, lets facts that only make sense together go in a single `fact` form, and checks each later form against the result."
- Holds when Lion is run: rule `all-or-nothing-changes` holds. "a form that fails, whether on a bad fact, a broken invariant, or an error while checking one, leaves the database exactly as it was, facts in the same order"
- Holds when Lion is run: rule `idempotent-additions` holds. "Adding a rule or invariant the database already holds, one a snapshot would write the same way, changes nothing, as adding a fact or declaring a relation the same way already did."
- Holds when Lion is run: `invariant` exists. "`["invariant", goal, {"assert": "none"}]` keeps a query assertion in the database"
- Holds when Lion is run: `invariant-not-holding-when-added` is `error`. "the goal must have no answers, or with `"some"` at least one, when it is added and after every later change"
- Holds when Lion is run: `invariant-checked-on-change` is `every-fact-retract-rule-form`. "Every `fact`, `retract`, and `rule` form is checked against every invariant once it has made all of its changes"
- Holds when Lion is run: `invariant-check-timing` is `after-whole-form`. "Every `fact`, `retract`, and `rule` form is checked against every invariant once it has made all of its changes"

<a id="database-change-unit"></a>

## database-change-unit

Now: `form`.

- 2026-11-11 `database-change-unit`: `form` over `run`: "One form keeps the rule simple, lets facts that only make sense together go in a single `fact` form, and checks each later form against the result." (`all-or-nothing-changes.json`)

<a id="feature-design-principle"></a>

## feature-design-principle

Now: `least-astonishment`.

- 2026-11-11 `feature-design-principle`: `least-astonishment`: "Lion's features and semantics are designed by the principle of least astonishment" (`least-astonishment.json`)

<a id="least-astonishment"></a>

### Lion's features and semantics are designed by the principle of least astonishment

Recorded 2026-11-11 in `history/notes/least-astonishment.json`.

**Context.** Lion's value comes from features that compose, so one surprising interaction costs more than a missing feature. Surprises sat where features met: a failed `retract` left partial changes behind, and running a setup again against a saved database counted every aggregate match twice. Nothing written down told a contributor how a new feature should behave beside the others.

**Decision.** Before adding a feature or changing how something behaves, ask what someone who already knows Lion would expect it to do, on its own and combined with every existing feature, and make it do that. Reuse the vocabulary Lion has before inventing more. When a feature needs a rule, follow the rule a similar feature already has, and when that rule falls short, change it for every feature at once. Walk through the combinations, keep equivalent programs equivalent, such as a program and its snapshot or goal-directed and full evaluation, and point out surprising behavior and fix it instead of building on it. AGENTS.md and CLAUDE.md state the principle, and the docs explain the rules features share on a page of their own.

**Consequences.** Invariants reuse the query option `"assert"` and fail in the words of a failed query assertion. Every form that changes the database is all or nothing, and adding what the database already holds changes nothing. The waiting rule and the asking rule each replaced a list of special cases with one rule, and each added to AGENTS.md the pairs it keeps equivalent: an expression over a logic variable and the same expression with the value in its place, and a question asked in a rule and the same question asked in plain code with the rule's variables bound. Where results may differ, such as answer order without the `"order"` option, the docs say so.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `feature-design-principle`: `least-astonishment`. "Lion's features and semantics are designed by the principle of least astonishment"
- Stated, not checked by running Lion: decided `invariant-syntax`: `query-assert-option`. "Invariants reuse the query option `"assert"` and fail in the words of a failed query assertion"
- Holds when Lion is run: rule `all-or-nothing-changes` holds. "Every form that changes the database is all or nothing"
- Holds when Lion is run: rule `idempotent-additions` holds. "adding what the database already holds changes nothing"
- Holds when Lion is run: rule `waiting-rule` holds. "The waiting rule and the asking rule each replaced a list of special cases with one rule"
- Holds when Lion is run: rule `asking-rule` holds. "The waiting rule and the asking rule each replaced a list of special cases with one rule"
- Holds when Lion is run: rule `equivalent-programs-equivalent` holds. "an expression over a logic variable and the same expression with the value in its place, and a question asked in a rule and the same question asked in plain code with the rule's variables bound"
- Holds when Lion is run: rule `equivalent-programs-equivalent` holds. "Where results may differ, such as answer order without the `"order"` option, the docs say so"
- Stated, not checked by running Lion: rule `least-astonishment` holds. "ask what someone who already knows Lion would expect it to do, on its own and combined with every existing feature, and make it do that"
- Stated, not checked by running Lion: rule `reuse-what-exists` holds. "Reuse the vocabulary Lion has before inventing more"
- Holds when Lion is run: rule `one-rule-everywhere` holds. "When a feature needs a rule, follow the rule a similar feature already has, and when that rule falls short, change it for every feature at once"
- Stated, not checked by running Lion: rule `walk-through-combinations` holds. "Walk through the combinations"
- Holds when Lion is run: rule `equivalent-programs-equivalent` holds. "keep equivalent programs equivalent, such as a program and its snapshot or goal-directed and full evaluation"
- Stated, not checked by running Lion: rule `dont-build-on-surprises` holds. "point out surprising behavior and fix it instead of building on it"
- Holds when Lion is run: `docs-consistent-semantics-page` exists. "the docs explain the rules features share on a page of their own"
- Stated, not checked by running Lion: `invariant-failure-message` is `same-as-query-assertion`. "Invariants reuse the query option `"assert"` and fail in the words of a failed query assertion"

<a id="invariant-syntax"></a>

## invariant-syntax

Now: `query-assert-option`.

- 2026-11-11 `invariant-syntax`: `query-assert-option`: "Invariants reuse the query option `"assert"` and fail in the words of a failed query assertion" (`47ea840`, `all-or-nothing-changes.json`, `least-astonishment.json`, `designing-features.md`)

<a id="javascript-json-disagreement"></a>

## javascript-json-disagreement

Now: `follow-json`.

- 2026-11-11 `javascript-json-disagreement`: `follow-json` over `follow-javascript`: "Where JavaScript and JSON disagree, Lion follows JSON, everywhere the case comes up." (`values-are-json.json`)

<a id="non-finite-arithmetic"></a>

## non-finite-arithmetic

Now: `arithmetic-error`.

- 2026-11-11 `non-finite-arithmetic`: `arithmetic-error` over `infinity-or-nan`: "Arithmetic whose result is not a finite number, such as division by zero or an overflow, fails with the new `ArithmeticError`" (`2026-11-11-core-0.5.0.json`, `4efc928`, `values-are-json.json`)

<a id="string-argument-order"></a>

## string-argument-order

Now: `text-first`.

- 2026-11-11 `string-argument-order`: `text-first` over `search-first`: "`string/startsWith`, `string/endsWith`, `string/includes`, and `string/indexOf` take the text first, as the README documented and as the rest of the library does; they read their arguments the other way around before. `string/indexOf` returns a number, or `-1`." (`2026-11-11-core-0.5.0.json`, `4efc928`)

<a id="docs-organization"></a>

## docs-organization

Now: `diataxis`.

- 2026-11-11 `docs-organization`: `diataxis`: "[lionlang.dev/docs.html](https://lionlang.dev/docs.html): 35 documents organized by the Diátaxis framework into tutorials, how-to guides, reference, and explanation, covering every form, function, command, and semantic of Lion. Its 110 live examples run on the evaluator, and the page's build writes each example's real result and fails on an unexpected error or a broken link, so the docs cannot drift from Lion." (`2026-11-11-core-0.5.0.json`, `b5f87d4`, `README.md`)

<a id="aggregate-representation"></a>

## aggregate-representation

Now: `waiting-call`.

- 2026-11-12 `aggregate-representation`: `waiting-call` over `aggregate-class`: "For hosts, `@lionlang/core/logic/terms` changed. `markPure` and `isPureFunction` are removed, since every function waits. The `Negation`, `Conjunction`, `Disjunction`, `Unification`, and `Membership` classes are one `LogicForm` class, tested with `isForm`. The `Aggregate` class is removed: an aggregate is a waiting call. `relationInfo` is now `relationOf`, and `RelationValue`, `isRelationValue`, and `isLogicTerm` are removed." (`2026-11-12-core-0.6.0.json`, `1b2d50b`)

<a id="and-or-evaluation"></a>

## and-or-evaluation

Now: `short-circuit`.

- 2026-11-12 `and-or-evaluation`: `short-circuit` over `evaluate-all`: "`and` and `or` stop at the first argument that decides them, as in Scheme, so `["and", false, ["number/divide", 1, 0]]` is `false`." (`aef67af`, `scheme-where-unclear.json`)

<a id="scheme-where-unclear"></a>

### Where the behavior of a base form is unclear, Lion does what Scheme does

Recorded 2026-11-12 in `history/notes/scheme-where-unclear.json`.

**Context.** Lion is a Lisp, and some of its base forms left open what Scheme and Racket settle. `and` and `or` evaluated every argument, so `["and", false, ["number/divide", 1, 0]]` was an error instead of `false`. Later, when every library function came to say how many arguments it takes, functions such as `number/add` needed an answer to how many that is.

**Decision.** Where a base form's behavior is unclear, Lion follows Scheme and Racket, and AGENTS.md states that Lion's semantics are approximately those of Scheme and Racket, plus the logic layer. `and` and `or` stop at the first argument that decides them, as in Scheme, so `["and", false, ["number/divide", 1, 0]]` is `false`. `number/add`, `number/multiply`, `number/min`, `number/max`, `string/concat`, and `array/concat` combine one or more arguments from left to right, as their Scheme counterparts do. `string/join` takes a string to put before the last item, as `#:before-last` does in Racket.

**Consequences.** `and` and `or` no longer evaluate the arguments after the one that decides them, which changes a program that relied on an error or a side effect there. `["number/add", 1, 2, 3]` is 6. The match is approximate: the logic layer comes on top, so once an argument of `and` or `or` is a goal, they combine goals.

**Alternatives considered.**

- Evaluate every argument of `and` and `or`, as Lion did before 0.6.0. An argument after the one that decides the result could still fail, so `["and", false, ["number/divide", 1, 0]]` was an error instead of `false`.

**What it asserts, checked.**

- Broken: Lion does otherwise: rule `scheme-racket-semantics` holds. "Where a base form's behavior is unclear, Lion follows Scheme and Racket"
- Holds when Lion is run: `combining-functions-several-arguments` is `combine-left-to-right`. "`number/add`, `number/multiply`, `number/min`, `number/max`, `string/concat`, and `array/concat` combine one or more arguments from left to right, as their Scheme counterparts do."
- Holds when Lion is run: `string-join-before-last` is `before-last-string`. "`string/join` takes a string to put before the last item, as `#:before-last` does in Racket."
- Holds when Lion is run: `string/join` exists. "`string/join` takes a string to put before the last item"
- Holds when Lion is run: `goal-in-and` is `kept`. "once an argument of `and` or `or` is a goal, they combine goals"
- Holds when Lion is run: `and-after-false` is `not-evaluated`. "`and` and `or` stop at the first argument that decides them, as in Scheme"
- Holds when Lion is run: `add-more-than-two-arguments` is `sum`. "combine one or more arguments from left to right, as their Scheme counterparts do"
- Stated, not checked by running Lion: decided `unclear-base-form-behavior`: `follow-scheme-racket`. "Where a base form's behavior is unclear, Lion follows Scheme and Racket"
- Stated, not checked by running Lion: decided `and-or-evaluation`: `short-circuit`. "`and` and `or` stop at the first argument that decides them, as in Scheme, so `["and", false, ["number/divide", 1, 0]]` is `false`."
- Stated, not checked by running Lion: decided `combining-function-arity`: `one-or-more`. "combine one or more arguments from left to right, as their Scheme counterparts do"
- Holds when Lion is run: `or-after-true` is `not-evaluated`. "`and` and `or` stop at the first argument that decides them, as in Scheme"
- Holds when Lion is run: `and-after-false` is `not-evaluated`. "`and` and `or` no longer evaluate the arguments after the one that decides them, which changes a program that relied on an error or a side effect there."
- Holds when Lion is run: `or-after-true` is `not-evaluated`. "`and` and `or` no longer evaluate the arguments after the one that decides them, which changes a program that relied on an error or a side effect there."

<a id="combining-function-arity"></a>

## combining-function-arity

Now: `one-or-more`.

- 2026-11-12 `combining-function-arity`: `one-or-more`: "combine one or more arguments from left to right, as their Scheme counterparts do" (`scheme-where-unclear.json`)

<a id="filter-truthiness"></a>

## filter-truthiness

Now: `strict-boolean`.

- 2026-11-12 `filter-truthiness`: `strict-boolean` over `truthy`: "A filter that is not true or false is an error instead of being read as truthy." (`aef67af`)

<a id="logic-form-classes"></a>

## logic-form-classes

Now: `one-logic-form-class`.

- 2026-11-12 `logic-form-classes`: `one-logic-form-class` over `class-per-form`: "For hosts, `@lionlang/core/logic/terms` changed. `markPure` and `isPureFunction` are removed, since every function waits. The `Negation`, `Conjunction`, `Disjunction`, `Unification`, and `Membership` classes are one `LogicForm` class, tested with `isForm`. The `Aggregate` class is removed: an aggregate is a waiting call. `relationInfo` is now `relationOf`, and `RelationValue`, `isRelationValue`, and `isLogicTerm` are removed." (`2026-11-12-core-0.6.0.json`, `c380ce7`)

<a id="special-form-table"></a>

## special-form-table

Now: `entry-calls-evaluator`.

- 2026-11-12 `special-form-table`: `shared-by-evaluator-and-analyzer`: "the evaluator and the analyzer share one table of special forms" (`aef67af`)
- 2026-11-12 `special-form-table`: `entry-calls-evaluator` over `lazy-table`, `table-built-at-load`, was `shared-by-evaluator-and-analyzer`: "Each entry of the table now calls its form's evaluator when a form is evaluated, and holds nothing from another module at load time." (`28ae742`)

<a id="unclear-base-form-behavior"></a>

## unclear-base-form-behavior

Now: `follow-scheme-racket`.

- 2026-11-12 `unclear-base-form-behavior`: `follow-scheme-racket`: "Where a base form's behavior is unclear, Lion follows Scheme and Racket" (`scheme-where-unclear.json`)

<a id="which-functions-wait"></a>

## which-functions-wait

Now: `every-function`.

- 2026-11-12 `which-functions-wait`: `every-function` over `pure-functions-only`: "For hosts, `@lionlang/core/logic/terms` changed. `markPure` and `isPureFunction` are removed, since every function waits. The `Negation`, `Conjunction`, `Disjunction`, `Unification`, and `Membership` classes are one `LogicForm` class, tested with `isForm`. The `Aggregate` class is removed: an aggregate is a waiting call. `relationInfo` is now `relationOf`, and `RelationValue`, `isRelationValue`, and `isLogicTerm` are removed." (`aef67af`, `waiting-rule.json`, `2026-11-12-core-0.6.0.json`, `1b2d50b`)

<a id="waiting-rule"></a>

### Whatever needs a logic variable's value waits until the variable is bound

Recorded 2026-11-12 in `history/notes/waiting-rule.json`.

**Context.** Only functions marked pure waited for a logic variable: the `number`, `string`, `boolean`, `value`, and `array` modules, and a host function marked with `markPure`. Everything else ran at once. A `cond`, `match`, or lambda that branched on a variable ran before the variable had a value, so it took the same branch for every answer: `["cond", [["number/greaterThan", "?x", 10], "big"], ["else", "small"]]` in a rule head gave `"big"` for 1, and a snapshot saved the rule with `"big"` in place of the `cond`. `eval` of a logic variable returned the variable.

**Decision.** One rule covers how evaluation meets logic variables: whatever needs a variable's value waits until it is bound, then computes what it would with the value in its place. Every function waits when it is called with a logic variable: the whole standard library, host functions as they are, and `func/partial` results. `cond`, `match`, `eval`, and records wait the same way, and so do lambdas passed to a waiting call. `logicFunction` marks a host function that takes logic values as they are.

**Consequences.** A rule can hold a `cond` or a record over its variables, such as `{"id": "?x", "twice": ["number/multiply", "?x", 2]}`, and gives for each answer what plain code gives with the value in the variable's place; 35 properties check that equivalence. `markPure` is removed. A filter must be `true` or `false`, where a value such as a number used to pass as true, and a call that fails in a rule or query names itself and its values. An aggregate call combines matches as a whole head argument and a list anywhere else, and an algorithm's input can be a variable that another goal binds. The core has 5% fewer code lines and runs 1.5 to 3 times faster on ten benchmarks.

**Alternatives considered.**

- Let only functions marked pure wait, as the logic layer first did with `markPure`. Everything else ran before its variable had a value, so a `cond`, `match`, or lambda took the same branch for every answer, and a snapshot saved that branch in place of the form.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `which-functions-wait`: `every-function`. "Every function waits when it is called with a logic variable: the whole standard library, host functions as they are, and `func/partial` results."
- Holds when Lion is run: `logic-variable-nested-in-record` is `waits`. "`cond`, `match`, `eval`, and records wait the same way, and so do lambdas passed to a waiting call."
- Holds when Lion is run: `lambda-passed-to-waiting-call` is `waits`. "`cond`, `match`, `eval`, and records wait the same way, and so do lambdas passed to a waiting call."
- Holds when Lion is run: `expression-over-variable-vs-value` is `same`. "gives for each answer what plain code gives with the value in the variable's place"
- Holds when Lion is run: `logicFunction` exists. "`logicFunction` marks a host function that takes logic values as they are."
- Holds when Lion is run: `markPure` is removed. "`markPure` is removed."
- Holds when Lion is run: `filter-non-boolean` is `error`. "A filter must be `true` or `false`, where a value such as a number used to pass as true"
- Stated, not checked by running Lion: `failed-call-in-rule-message` is `names-call-and-values`. "a call that fails in a rule or query names itself and its values"
- Holds when Lion is run: `aggregate-call-whole-head-argument` is `combines-matches`. "An aggregate call combines matches as a whole head argument and a list anywhere else"
- Holds when Lion is run: `aggregate-call-elsewhere` is `combines-list`. "An aggregate call combines matches as a whole head argument and a list anywhere else"
- Holds when Lion is run: `algorithm-input-variable` is `runs-per-binding`. "an algorithm's input can be a variable that another goal binds"
- Holds when Lion is run: rule `waiting-rule` holds. "One rule covers how evaluation meets logic variables: whatever needs a variable's value waits until it is bound, then computes what it would with the value in its place."
- Stated, not checked by running Lion: `core-code-lines-reduction-percent` is 5. "The core has 5% fewer code lines"
- Stated, not checked by running Lion: `speedup-benchmarks-min` is 1.5. "runs 1.5 to 3 times faster on ten benchmarks"
- Stated, not checked by running Lion: `speedup-benchmarks-max` is 3. "runs 1.5 to 3 times faster on ten benchmarks"
- Stated, not checked by running Lion: `waiting-equivalence-properties` is 35. "35 properties check that equivalence"
- Stated, not checked by running Lion: rule `pure-functions-wait` is withdrawn. "Only functions marked pure waited for a logic variable"
- Holds when Lion is run: `host-function-logic-variable-argument` is `waits`. "Every function waits when it is called with a logic variable: the whole standard library, host functions as they are, and `func/partial` results."
- Holds when Lion is run: `pure-function-logic-variable-argument` is `waits`. "Every function waits when it is called with a logic variable: the whole standard library, host functions as they are, and `func/partial` results."
- Holds when Lion is run: `func-partial-logic-variable-argument` is `waits`. "Every function waits when it is called with a logic variable: the whole standard library, host functions as they are, and `func/partial` results."
- Holds when Lion is run: `cond-on-logic-variable` is `waits`. "`cond`, `match`, `eval`, and records wait the same way, and so do lambdas passed to a waiting call."
- Holds when Lion is run: `match-on-logic-variable` is `waits`. "`cond`, `match`, `eval`, and records wait the same way, and so do lambdas passed to a waiting call."
- Holds when Lion is run: `eval-of-logic-variable` is `waits`. "`cond`, `match`, `eval`, and records wait the same way, and so do lambdas passed to a waiting call."

<a id="engine-derivation"></a>

## engine-derivation

Now: `on-demand-per-relation`.

- 2026-11-12 `engine-derivation`: `on-demand-per-relation` over `all-relations`: "It derives a relation's rows the first time something reads them and keeps them until a fact or rule changes, so a query that is not goal-directed derives only the relations it reads." (`c380ce7`)

<a id="goal-as-value"></a>

## goal-as-value

Now: `asked`.

- 2026-11-12 `goal-as-value`: `asked` over `goal-itself`: "Anywhere else it is asked: as a value it is `true` when it has a match and `false` when it has none" (`asking-rule.json`, `c380ce7`)

<a id="asking-rule"></a>

### Whatever needs the value of a goal asks it

Recorded 2026-11-12 in `history/notes/asking-rule.json`.

**Context.** A goal was something a rule or query matched, and little else could use one. A function or record given a relation goal was handed the goal itself, `fact` refused it, and a `cond` whose condition was a relation goal took that case whether or not the goal had a match. A goal under `not` needed every variable bound first, and an aggregate combined a goal's matches only in a rule head, so a count was never 0.

**Decision.** A goal with a relation in it is a question, and any expression can ask it. As a goal of a rule or query it still matches rows and binds variables. Anywhere else it is asked: as a value it is `true` when it has a match and `false` when it has none, in a `cond` condition, as an argument of a function, as an operand of `=` or `in`, as a value of a record, as an argument of `fact`, and as the value `match` looks at. `["find", template, goal]` returns the template's value for every match of the goal as a sorted list. When a question is asked, the variables the rule or query around it has bound are fixed, and every other variable is the question's own.

**Consequences.** A question gives in a rule what it gives in plain code with the rule's variables in place: plain code asks right away, goal-directed, and a rule, query, invariant, or `find` asks for each answer when it runs. `define`, `and`, `or`, `not`, and lambdas keep a goal as it is, so goals can still be named, combined, and passed around. A goal under `not` can join on variables of its own, an aggregate of a `find` can count 0, and a relation is a predicate for `match` and for functions such as `array/map`. The rule against negation through recursion now covers every question. The core grew 4.7% in code lines, and list callbacks run about 10% slower, since they go through the one call rule.

**Alternatives considered.**

- Hand a relation goal to a function or record as the goal itself, as before. A `cond` whose condition was a relation goal took that case whether or not the goal had a match, and `fact` refused the goal.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `goal-as-value`: `asked`. "Anywhere else it is asked: as a value it is `true` when it has a match and `false` when it has none"
- Holds when Lion is run: `relation-goal-as-unify-operand` is `asked`. "in a `cond` condition, as an argument of a function, as an operand of `=` or `in`, as a value of a record, as an argument of `fact`, and as the value `match` looks at"
- Holds when Lion is run: `relation-goal-as-in-operand` is `asked`. "in a `cond` condition, as an argument of a function, as an operand of `=` or `in`, as a value of a record, as an argument of `fact`, and as the value `match` looks at"
- Holds when Lion is run: `relation-goal-as-record-value` is `asked`. "in a `cond` condition, as an argument of a function, as an operand of `=` or `in`, as a value of a record, as an argument of `fact`, and as the value `match` looks at"
- Holds when Lion is run: `relation-goal-as-fact-argument` is `asked`. "in a `cond` condition, as an argument of a function, as an operand of `=` or `in`, as a value of a record, as an argument of `fact`, and as the value `match` looks at"
- Holds when Lion is run: `relation-goal-as-match-value` is `asked`. "in a `cond` condition, as an argument of a function, as an operand of `=` or `in`, as a value of a record, as an argument of `fact`, and as the value `match` looks at"
- Holds when Lion is run: `question-in-rule-vs-plain-code` is `same`. "A question gives in a rule what it gives in plain code with the rule's variables in place"
- Holds when Lion is run: `plain-code-question` is `asked-immediately`. "plain code asks right away, goal-directed"
- Holds when Lion is run: `question-in-rule` is `asked-per-answer`. "a rule, query, invariant, or `find` asks for each answer when it runs"
- Holds when Lion is run: `goal-in-define` is `kept`. "`define`, `and`, `or`, `not`, and lambdas keep a goal as it is, so goals can still be named, combined, and passed around."
- Holds when Lion is run: `goal-in-and` is `kept`. "`define`, `and`, `or`, `not`, and lambdas keep a goal as it is, so goals can still be named, combined, and passed around."
- Holds when Lion is run: rule `asking-rule` holds. "Whatever needs the value of a goal asks it"
- Holds when Lion is run: `goal-in-lambda` is `kept`. "`define`, `and`, `or`, `not`, and lambdas keep a goal as it is, so goals can still be named, combined, and passed around."
- Holds when Lion is run: `not-goal-unbound-variable` is `own-variable`. "A goal under `not` can join on variables of its own"
- Holds when Lion is run: `aggregate-count-of-empty-find` is `zero`. "an aggregate of a `find` can count 0"
- Holds when Lion is run: `relation-as-match-predicate` is `predicate`. "a relation is a predicate for `match` and for functions such as `array/map`"
- Holds when Lion is run: `relation-as-function-argument` is `predicate`. "a relation is a predicate for `match` and for functions such as `array/map`"
- Stated, not checked by running Lion: `core-code-lines-increase-percent` is 4.7. "The core grew 4.7% in code lines"
- Stated, not checked by running Lion: `slowdown-list-callbacks-percent` is 10. "list callbacks run about 10% slower"
- Holds when Lion is run: rule `question-variables-scoped` holds. "When a question is asked, the variables the rule or query around it has bound are fixed, and every other variable is the question's own."
- Holds when Lion is run: rule `stratified-questions` holds. "The rule against negation through recursion now covers every question."
- Holds when Lion is run: `find` exists. "`["find", template, goal]` returns the template's value for every match of the goal as a sorted list."
- Holds when Lion is run: `find-result-order` is `sorted`. "`["find", template, goal]` returns the template's value for every match of the goal as a sorted list."
- Holds when Lion is run: `relation-goal-as-value` is `asked`. "as a value it is `true` when it has a match and `false` when it has none"
- Holds when Lion is run: `cond-relation-goal-condition` is `asked`. "in a `cond` condition, as an argument of a function, as an operand of `=` or `in`, as a value of a record, as an argument of `fact`, and as the value `match` looks at"
- Holds when Lion is run: `relation-goal-as-function-argument` is `asked`. "in a `cond` condition, as an argument of a function, as an operand of `=` or `in`, as a value of a record, as an argument of `fact`, and as the value `match` looks at"

<a id="benchmark-process-isolation"></a>

## benchmark-process-isolation

Now: `process-per-version`.

- 2026-11-12 `benchmark-process-isolation`: `process-per-version` over `one-process`: "`bun run bench` times a set of programs, each version in a process of its own" (`d45c397`, `measure-every-change.json`)

<a id="measure-every-change"></a>

### Measure every change to core for its code, its semantics, its speed, and how well its tests catch broken code

Recorded 2026-11-12 in `history/notes/measure-every-change.json`.

**Context.** Lion's aim is one rule in place of special cases, so that an expression gives in a rule head, a filter, a `find`, or a reloaded snapshot what it gives in plain code. Until 0.6.0 nothing in the repository counted how far Lion fell short of that, or whether a change left the code and the language simpler or harder to know. Speed and the strength of the tests were not measured either.

**Decision.** `@lionlang/metrics`, a private package, measures the working tree beside any earlier commit. `bun run measure` counts the code of `@lionlang/core` without its tests (code lines, functions, paths through functions, nesting-weighted decisions, and `instanceof` tests) and its semantics: special forms, library functions, kinds of error, distinct messages, and the exceptions of the interop grid, which runs every kind of expression in every place one can stand and compares each with plain code. `bun run bench` times a set of programs, each version in a process of its own, `bun run mutate` breaks the code in each listed place and checks that a property fails, and `bun run compare` runs the same programs on two commits. AGENTS.md asks that every change to core be measured before it is done, that the numbers go in the commit message also when they went up, and that a new exception in the grid be fixed rather than added to `KNOWN`.

**Consequences.** The grid counted 209 exceptions for 0.5.0 and 2 for 0.6.0, and every later core commit that measured it found the same 2 documented ones. Each core commit since states its numbers, including the ones that grew: schemas took the code from 6,035 to 7,798 lines, and the arity rule's commit says the rule cost more lines than the checks it replaced. A new exception fails the tests of `packages/metrics`, and a mutation no property catches is reported as `MISSED`, so a change brings a mutation and a property for each behavior it adds. Benchmark times move by a few percent between runs, so `bun run bench` is run twice.

**Alternatives considered.**

- Time both versions of the evaluator in one process. Loading both evaluators into one process slowed the second one down by up to a fifth on code that had not changed.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `core-change-measurement`: `every-change`. "Measure every change to core for its code, its semantics, its speed, and how well its tests catch broken code"
- Holds when Lion is run: rule `same-as-plain-code` holds. "an expression gives in a rule head, a filter, a `find`, or a reloaded snapshot what it gives in plain code"
- Stated, not checked by running Lion: rule `measure-every-change` holds. "AGENTS.md asks that every change to core be measured before it is done"
- Stated, not checked by running Lion: rule `measurements-in-commit-message` holds. "that the numbers go in the commit message also when they went up"
- Stated, not checked by running Lion: rule `report-what-measured` holds. "Each core commit since states its numbers, including the ones that grew"
- Holds when Lion is run: rule `no-new-grid-exceptions` holds. "that a new exception in the grid be fixed rather than added to `KNOWN`"
- Holds when Lion is run: `new-grid-exception` is `tests-fail`. "A new exception fails the tests of `packages/metrics`"
- Holds when Lion is run: `mutation-not-caught` is `reported-missed`. "a mutation no property catches is reported as `MISSED`"
- Stated, not checked by running Lion: rule `mutation-per-behavior` holds. "so a change brings a mutation and a property for each behavior it adds"
- Stated, not checked by running Lion: rule `bench-twice` holds. "Benchmark times move by a few percent between runs, so `bun run bench` is run twice"
- Stated, not checked by running Lion: `grid-exceptions` is 2. "The grid counted 209 exceptions for 0.5.0 and 2 for 0.6.0"
- Holds when Lion is run: `@lionlang/metrics` exists. "`@lionlang/metrics`, a private package, measures the working tree beside any earlier commit"
- Stated, not checked by running Lion: `core-code-lines` is 7798. "schemas took the code from 6,035 to 7,798 lines"
- Holds when Lion is run: `bun-run-measure` exists. "`bun run measure` counts the code of `@lionlang/core` without its tests"
- Holds when Lion is run: `bun-run-bench` exists. "`bun run bench` times a set of programs, each version in a process of its own"
- Holds when Lion is run: `bench-against-commit-process` is `own-process`. "`bun run bench` times a set of programs, each version in a process of its own"
- Stated, not checked by running Lion: decided `benchmark-process-isolation`: `process-per-version`. "`bun run bench` times a set of programs, each version in a process of its own"
- Holds when Lion is run: `bun-run-mutate` exists. "`bun run mutate` breaks the code in each listed place and checks that a property fails"
- Holds when Lion is run: `bun-run-compare` exists. "`bun run compare` runs the same programs on two commits"
- Holds when Lion is run: `interop-grid` exists. "the exceptions of the interop grid, which runs every kind of expression in every place one can stand and compares each with plain code"

<a id="core-change-measurement"></a>

## core-change-measurement

Now: `every-change`.

- 2026-11-12 `core-change-measurement`: `every-change` over `unmeasured`: "Measure every change to core for its code, its semantics, its speed, and how well its tests catch broken code" (`measure-every-change.json`)

<a id="misspelled-module-names"></a>

## misspelled-module-names

Now: `error`.

- 2026-11-12 `misspelled-module-names`: `error` over `string`: "An unbound `module/name` string that reads as a misspelled name is an `UnboundNameError`, and any other unbound string stays a string" (`fbc25a1`, `misspelled-names-are-errors.json`)

<a id="misspelled-names-are-errors"></a>

### An unbound `module/name` string that reads as a misspelled name is an `UnboundNameError`, and any other unbound string stays a string

Recorded 2026-11-12 in `history/notes/misspelled-names-are-errors.json`.

**Context.** In Lion a string is a name before it is a string: a bound name evaluates to its value, and an unbound one to itself. So a misspelled function quietly became a string. Called, as in `["number/ad", 1, 2]`, it failed as a call of something that is not a function, and in a schema a misspelled predicate such as `"value/intger?"` would be a plain value to equal.

**Decision.** An unbound string of the form `module/name` is an `UnboundNameError` when it can only have been meant as a name: other names of its module are bound, as for `"number/ad"`, or a bound name is a letter or two away, as for `"numbr/add"`. The message suggests the name and says how to write the string: `Nothing is bound to "number/ad". Did you mean "number/add"? To mean the string itself, write ["quote", "number/ad"].` Any other string with a slash, such as `"n/a"` or `"text/plain"`, is still itself, and `["quote", "number/ad"]` is always the string. The error holds the string as `unbound` and the suggestion as `nearest`.

**Consequences.** A program that used such a string as data breaks and must quote it. The error is raised wherever the name is evaluated: in plain code, as a predicate, inside a lambda that a schema or `match` calls, and in a form a rule holds. `UnboundNameError` is a new kind of error, and the docs give it and `InvalidFunctionCallError` an example each. The first version kept the string in the error's `name`, so code that shows `name: message`, as the docs site does, showed `number/plus: Nothing is bound to ...`; the string moved to `unbound` the same day.

**Alternatives considered.**

- Let every unbound string evaluate to itself, as before 0.7.0. A misspelled function would quietly become a string.
- Keep the misspelled string in the error's `name` field. `name` is where every Error says what kind it is, so code that shows `name: message` showed the string in place of the kind.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `misspelled-module-names`: `error`. "An unbound `module/name` string that reads as a misspelled name is an `UnboundNameError`, and any other unbound string stays a string"
- Stated, not checked by running Lion: decided `unbound-name-error-string-field`: `unbound`. "The error holds the string as `unbound` and the suggestion as `nearest`"
- Holds when Lion is run: `unbound-misspelled-module-name` is `error`. "A program that used such a string as data breaks and must quote it"
- Holds when Lion is run: `misspelled-name-as-schema` is `error`. "The error is raised wherever the name is evaluated: in plain code, as a predicate, inside a lambda that a schema or `match` calls, and in a form a rule holds"
- Holds when Lion is run: `misspelled-name-in-match-lambda` is `error`. "The error is raised wherever the name is evaluated: in plain code, as a predicate, inside a lambda that a schema or `match` calls, and in a form a rule holds"
- Holds when Lion is run: `misspelled-name-in-rule-form` is `error`. "The error is raised wherever the name is evaluated: in plain code, as a predicate, inside a lambda that a schema or `match` calls, and in a form a rule holds"
- Holds when Lion is run: `UnboundNameError` exists. "`UnboundNameError` is a new kind of error"
- Holds when Lion is run: `docs-invalid-function-call-error-example` is `own-example`. "the docs give it and `InvalidFunctionCallError` an example each"
- Holds when Lion is run: `docs-unbound-name-error-example` is `own-example`. "the docs give it and `InvalidFunctionCallError` an example each"
- Stated, not checked by running Lion: `UnboundNameError-name-field` is `error-kind`. "the string moved to `unbound` the same day"
- Holds when Lion is run: `docs-site-unbound-name-error-label` is `error-kind`. "The first version kept the string in the error's `name`, so code that shows `name: message`, as the docs site does, showed `number/plus: Nothing is bound to ...`; the string moved to `unbound` the same day"
- Holds when Lion is run: rule `strings-are-references` holds. "An unbound `module/name` string that reads as a misspelled name is an `UnboundNameError`, and any other unbound string stays a string"
- Holds when Lion is run: rule `strings-are-references` holds. "In Lion a string is a name before it is a string: a bound name evaluates to its value, and an unbound one to itself"
- Holds when Lion is run: rule `misspelled-names-are-errors` holds. "An unbound string of the form `module/name` is an `UnboundNameError` when it can only have been meant as a name"
- Holds when Lion is run: `unbound-misspelled-module-name` is `error`. "other names of its module are bound, as for `"number/ad"`"
- Holds when Lion is run: `unbound-misspelled-module-prefix` is `error`. "a bound name is a letter or two away, as for `"numbr/add"`"
- Holds when Lion is run: `unbound-slash-string-not-misspelled` is `string`. "Any other string with a slash, such as `"n/a"` or `"text/plain"`, is still itself"
- Holds when Lion is run: `quoted-misspelled-name` is `string`. "`["quote", "number/ad"]` is always the string"
- Stated, not checked by running Lion: `UnboundNameError-fields` is `unbound-and-nearest`. "The error holds the string as `unbound` and the suggestion as `nearest`"

<a id="relation-call-arguments"></a>

## relation-call-arguments

Now: `schemas`.

- 2026-11-12 `relation-call-arguments`: `schemas` over `column-values`: "A predicate, a relation with one column, a named schema, or a variable that holds one can stand as an argument of a relation call" (`schemas-are-logic.json`)

<a id="schema-checking"></a>

## schema-checking

Now: `one-fitting-rule`.

- 2026-11-12 `schema-checking`: `one-fitting-rule` over `rule-per-place`: "Anything is a schema, and one rule says what fits it" (`schemas-are-logic.json`)

<a id="unbound-name-error-string-field"></a>

## unbound-name-error-string-field

Now: `unbound`.

- 2026-11-12 `unbound-name-error-string-field`: `unbound` over `name`: "The error holds the string as `unbound` and the suggestion as `nearest`" (`misspelled-names-are-errors.json`)

<a id="measure-speed"></a>

## measure-speed

Now: `skip`.

- 2026-11-12 `measure-speed`: `skip`: "No benchmark run, since no core code changed." (`ca92729`, `4c8df1b`)

<a id="docs-example-coverage"></a>

## docs-example-coverage

Now: `build-checked`.

- 2026-11-12 `docs-example-coverage`: `build-checked` over `by-hand`: "The docs build fails when a special form or library function appears in no live example" (`every-feature-in-docs.json`)

<a id="every-feature-in-docs"></a>

### Every feature is used in a docs example with output that was run, and the docs build fails when a special form or library function is in no example

Recorded 2026-11-12 in `history/notes/every-feature-in-docs.json`.

**Context.** The docs site's examples are live: the build runs each one with the real evaluator and writes its result. Nothing made a feature have one, so the docs lagged the code. After schemas, a pass by hand gave each of their features a live example, 26 new ones, and `number/toString` was committed with no docs and reached the website's reference only at its release. When the build first checked, it found eight functions in no example: the four the branch had just added and `func/callback`, `object/get-method-path`, `object/new`, and `value/symbol?`.

**Decision.** Every feature a change adds is used in at least one example in the docs, with output that was run, not typed: a core feature in a live `<lion-example>` of `packages/site-runtime/content/` where a reader would look for it, and a skill's new relation, note field, or script in its `SKILL.md` or `references/`. The docs build fails when a special form or library function appears in no live example, beside its checks for failing examples and broken links. A change also corrects every documented result it makes untrue. AGENTS.md has a section on it and CLAUDE.md a summary.

**Consequences.** A missing example fails the build instead of waiting for someone to notice, so `bun run --cwd packages/site-runtime docs` lists what a change still has to document, and `docs/docs.html` is rebuilt and committed with the change. The eight functions it found have examples in their modules' reference, and "Explain a result" shows how a computed figure was worked out. The build checks only special forms and library functions; a skill's examples rest on the rule alone.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `docs-example-coverage`: `build-checked`. "The docs build fails when a special form or library function appears in no live example"
- Stated, not checked by running Lion: `docs-examples-added` is 26. "a pass by hand gave each of their features a live example, 26 new ones"
- Holds when Lion is run: rule `every-feature-in-docs` holds. "Every feature is used in a docs example with output that was run, and the docs build fails when a special form or library function is in no example"
- Holds when Lion is run: rule `live-examples-run-real-core` holds. "the build runs each one with the real evaluator and writes its result"
- Stated, not checked by running Lion: rule `correct-untrue-docs` holds. "A change also corrects every documented result it makes untrue."
- Stated, not checked by running Lion: rule `skill-features-in-docs` holds. "a skill's new relation, note field, or script in its `SKILL.md` or `references/`"
- Stated, not checked by running Lion: `docs-coverage-check` exists. "The docs build fails when a special form or library function appears in no live example"
- Holds when Lion is run: `docs-build-function-without-example` is `fails`. "A missing example fails the build instead of waiting for someone to notice"
- Holds when Lion is run: `docs-functions-without-example` is `none`. "The eight functions it found have examples in their modules' reference"
- Holds when Lion is run: `docs-build-skill-example-check` is `none`. "The build checks only special forms and library functions; a skill's examples rest on the rule alone."

<a id="toc-section-reached"></a>

## toc-section-reached

Now: `where-link-puts-heading`.

- 2026-11-13 `toc-section-reached`: `where-link-puts-heading` over `fixed-140-px`: ""On this page" marks the section a link was followed to. For every one of the page's 273 section links it used to mark the section before, or none for a document's first section: a link puts a heading 168 pixels below the top of the window, the page's scroll padding and the heading's scroll margin together, and a heading counted as reached only above 140. A section now counts as reached where a link puts its heading, read from the stylesheet. At the end of a page the last section is the one being read, where its heading could never get high enough to be marked, as in 29 of the 39 documents in a window 800 pixels tall. A section a link was followed to stays marked for as long as the page stays where the link left it, also when the page is too short to bring its heading up." (`2026-11-13-lionlang-dev.json`, `faed4c4`)

<a id="arity-checks"></a>

## arity-checks

Now: `one-takes-function`.

- 2026-11-13 `arity-checks`: `one-takes-function` over `separate-checks`: "One function, `takes`, carries the rule for library functions, relations, schemas, aggregates, and graph algorithms" (`356e74a`, `arity-rule.json`)

<a id="measure-unchanged-core"></a>

## measure-unchanged-core

Now: `skip`.

- 2026-11-13 `measure-unchanged-core`: `skip`: "@lionlang/core is unchanged, so measure and bench were not run." (`284f00f`)

<a id="research-corroboration-basis"></a>

## research-corroboration-basis

Now: `first-hand-publishers`.

- 2026-11-13 `research-corroboration-basis`: `first-hand-publishers` over `distinct-sources`: "Only a publisher who gives an answer first-hand, in a claim credited to nobody else, counts." (`284f00f`, `research-counts-publishers.json`)

<a id="research-counts-publishers"></a>

### The research skill counts the publishers who give an answer first-hand, not the sources that state it

Recorded 2026-11-13 in `history/notes/research-counts-publishers.json`.

**Context.** The research skill's core program says how well each answer is backed. Its first version followed each claim to the source it was credited to and counted distinct sources. A trial run on the Microsoft 365 outage of 12 November 2026, with 19 sources and 175 claims, called 15 answers corroborated, and 8 of them were not. Two channels of one company counted as two origins in three of them, two articles from one newspaper in one, and in four an origin was a source that was only credited, either unread or saying something else.

**Decision.** Only a publisher who gives an answer first-hand, in a claim credited to nobody else, counts. Every source records its `publisher`, written the same way for each channel that publisher speaks through, so a company's press release, status page, and filing are one voice, and a source that relays another adds nothing. `backing` lists the publishers behind each answer, `corroborated` the answers two or more publishers give first-hand, `single_origin` those that rest on one publisher's word, and `secondhand` those every source credits to someone else.

**Consequences.** On the trial's evidence the new core calls 7 answers corroborated, the 7 the trial's agent reached with stricter rules of its own, and reports 4 misquotes and 26 answers known only second-hand. The rule is strict on purpose: a statement repeated by ten outlets is still one statement. A person quoted by an outlet is a source of their own, credited by the outlet, so a spokesperson quoted in three papers does not read as three voices. Properties check the core against a plain model of provenance for any sources, publishers, claims, and attributions.

**Alternatives considered.**

- Count the distinct sources an answer can be followed back to, as the skill's first version did. On the trial's model it called 15 answers corroborated, and 8 of them had no two publishers behind them first-hand.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `research-corroboration-basis`: `first-hand-publishers`. "Only a publisher who gives an answer first-hand, in a claim credited to nobody else, counts."
- Stated, not checked by running Lion: `research-corroborated` exists. "`corroborated` the answers two or more publishers give first-hand"
- Holds when Lion is run: `research-answer-two-first-hand-publishers` is `corroborated`. "`corroborated` the answers two or more publishers give first-hand"
- Stated, not checked by running Lion: `research-single-origin` exists. "`single_origin` those that rest on one publisher's word"
- Holds when Lion is run: `research-answer-one-first-hand-publisher` is `single-origin`. "`single_origin` those that rest on one publisher's word"
- Stated, not checked by running Lion: `research-secondhand` exists. "`secondhand` those every source credits to someone else"
- Holds when Lion is run: `research-answer-only-credited-to-others` is `second-hand`. "`secondhand` those every source credits to someone else"
- Holds when Lion is run: `research-core-provenance-tested` is `by-property`. "Properties check the core against a plain model of provenance for any sources, publishers, claims, and attributions."
- Stated, not checked by running Lion: `research-trial-sources` is 19. "with 19 sources and 175 claims"
- Stated, not checked by running Lion: `research-trial-claims` is 175. "with 19 sources and 175 claims"
- Stated, not checked by running Lion: `research-trial-false-corroborations` is 8. "called 15 answers corroborated, and 8 of them were not"
- Holds when Lion is run: rule `research-counts-publishers` holds. "The research skill counts the publishers who give an answer first-hand, not the sources that state it"
- Stated, not checked by running Lion: `research-trial-corroborated-answers` is 7. "On the trial's evidence the new core calls 7 answers corroborated"
- Stated, not checked by running Lion: `research-trial-misquotes` is 4. "reports 4 misquotes and 26 answers known only second-hand"
- Stated, not checked by running Lion: `research-trial-second-hand-answers` is 26. "reports 4 misquotes and 26 answers known only second-hand"
- Stated, not checked by running Lion: rule `research-counts-sources` is withdrawn. "Its first version followed each claim to the source it was credited to and counted distinct sources."
- Stated, not checked by running Lion: `research-source-publisher` exists. "Every source records its `publisher`, written the same way for each channel that publisher speaks through"
- Holds when Lion is run: `research-channels-of-one-publisher` is `one-voice`. "so a company's press release, status page, and filing are one voice"
- Holds when Lion is run: `research-answer-relayed-from-one-press-release` is `one-publisher`. "a source that relays another adds nothing"
- Holds when Lion is run: `research-statement-repeated-by-outlets` is `one-statement`. "a statement repeated by ten outlets is still one statement"
- Holds when Lion is run: `research-spokesperson-quoted-in-several-papers` is `one-voice`. "so a spokesperson quoted in three papers does not read as three voices"
- Stated, not checked by running Lion: `research-backing` exists. "`backing` lists the publishers behind each answer"

<a id="record-key-check"></a>

## record-key-check

Now: `any-json-key-but-proto`.

- 2026-11-13 `record-key-check`: `any-json-key-but-proto` over `non-empty-key`: "the record schema's key check required at least one character, and a key that fails it is left out." (`a923daf`)

<a id="text-built-on-lion"></a>

## text-built-on-lion

Now: `lion-expressions`.

- 2026-11-13 `text-built-on-lion`: `lion-expressions` over `typed-text`, `placeholders`: "Text built on Lion is computed by Lion expressions, not filled into a template" (`lion-computes-page-text.json`)

<a id="lion-computes-page-text"></a>

### Text built on Lion is computed by Lion expressions, not filled into a template, and a helper any program would want goes into the standard library

Recorded 2026-11-13 in `history/notes/lion-computes-page-text.json`.

**Context.** The research skill's page plan held the words a reader sees as text the agent typed: the summary and each answer were strings, a figure was a typed `value` or a query, and a lookup's query held `"$source"` where the reader's choice was put in. A sentence with a number in it that no expression produced is a claim the model cannot check, and it stays on the page when the model changes. Writing the words in Lion instead needed functions the standard library lacked, such as joining a list into a sentence and writing a number with separators.

**Decision.** When something built on Lion needs a value, a condition, or text, it is a Lion expression that is evaluated, never a second, smaller language such as a template with slots or a placeholder that gets substituted. The length of Lion JSON is not counted as a cost, and a helper any Lion programmer would want goes into the standard library with its properties. In the research skill, the plan's summary, answers, notes, and figures are Lion expressions evaluated against the model when the page opens, a `cond` on `disputed` or `corroborated` picks the sentence, and a lookup is a Lion function called with what the reader chose. Core 0.9.0 adds `string/join`, `string/split`, `string/padStart`, `string/padEnd`, and a separator for `number/toString`, and `assets/words.json` builds the skill's wording functions from them.

**Consequences.** A page's words follow the model, and the build lists any figure typed into the plan and any typed text that holds a digit. Plans are longer, and are written in full, since nobody reads them. `page-check.json` runs every text of the plan, so its output is the page's wording to read before the reader sees it. The skill needs `@lionlang/cli` 0.8.0, the release that bundles core 0.9.0. Core gained four library functions, from 94 to 98, and 36 code lines.

**Alternatives considered.**

- Typed text in the plan, with a literal `value` or a `query` for each figure, as the skill's first page had. A finding typed into the plan is a claim the model cannot check, and it stays on the page when the model changes.
- A placeholder such as `"$source"` in a lookup's query, where the reader's choice is substituted. It is a second, smaller language beside Lion. A lookup is a Lion function instead, called with each choice as data.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `text-built-on-lion`: `lion-expressions`. "Text built on Lion is computed by Lion expressions, not filled into a template"
- Holds when Lion is run: `string/padStart` exists. "Core 0.9.0 adds `string/join`, `string/split`, `string/padStart`, `string/padEnd`, and a separator for `number/toString`"
- Holds when Lion is run: `string/padEnd` exists. "Core 0.9.0 adds `string/join`, `string/split`, `string/padStart`, `string/padEnd`, and a separator for `number/toString`"
- Holds when Lion is run: `number-to-string-group-separator` is `grouped`. "Core 0.9.0 adds `string/join`, `string/split`, `string/padStart`, `string/padEnd`, and a separator for `number/toString`"
- Holds when Lion is run: `research-words-json` exists. "`assets/words.json` builds the skill's wording functions from them"
- Holds when Lion is run: `research-plan-typed-figure` is `listed`. "the build lists any figure typed into the plan and any typed text that holds a digit"
- Stated, not checked by running Lion: `research-page-check-json` exists. "`page-check.json` runs every text of the plan"
- Stated, not checked by running Lion: `cli-0-8-0-bundled-core` is `core-0-9-0`. "The skill needs `@lionlang/cli` 0.8.0, the release that bundles core 0.9.0"
- Stated, not checked by running Lion: `library-functions` is 98. "Core gained four library functions, from 94 to 98"
- Stated, not checked by running Lion: rule `lion-computes-page-text` holds. "When something built on Lion needs a value, a condition, or text, it is a Lion expression that is evaluated, never a second, smaller language such as a template with slots or a placeholder that gets substituted"
- Stated, not checked by running Lion: rule `json-length-not-a-cost` holds. "The length of Lion JSON is not counted as a cost"
- Stated, not checked by running Lion: rule `extend-stdlib` holds. "a helper any Lion programmer would want goes into the standard library with its properties"
- Stated, not checked by running Lion: rule `research-plan-states-no-facts` holds. "In the research skill, the plan's summary, answers, notes, and figures are Lion expressions evaluated against the model when the page opens"
- Holds when Lion is run: `research-lookup` is `lion-function`. "a lookup is a Lion function called with what the reader chose"
- Stated, not checked by running Lion: `research-lookup-placeholder` is removed. "A lookup is a Lion function instead, called with each choice as data"
- Holds when Lion is run: `string/join` exists. "Core 0.9.0 adds `string/join`, `string/split`, `string/padStart`, `string/padEnd`, and a separator for `number/toString`"
- Holds when Lion is run: `string/split` exists. "Core 0.9.0 adds `string/join`, `string/split`, `string/padStart`, `string/padEnd`, and a separator for `number/toString`"

<a id="reasoning-belief-judging"></a>

## reasoning-belief-judging

Now: `from-formed-version`.

- 2026-11-13 `reasoning-belief-judging`: `from-formed-version` over `present-only`: "A belief is contradicted, borne out, or untested by the evidence of that version and every later one" (`beliefs-judged-from-their-version.json`)

<a id="beliefs-judged-from-their-version"></a>

### A belief is judged by the evidence of every version from the one it was formed in on, and an explanation by the versions where its problem shows

Recorded 2026-11-13 in `history/notes/beliefs-judged-from-their-version.json`.

**Context.** In the reasoning skill each observation speaks for the versions of the project in which the files it depends on hold what they held when it was seen, so the model must say which versions judge a belief. In the skill's first trial, beliefs that explain no problem were judged only against the present, and a belief the agent had disproved on the old code showed as holding again after the fix. An explanation of a bug judged against the present has the opposite fault: once the bug is fixed, the fixed code counts against it.

**Decision.** `record.mjs` stamps each belief with the version it was formed in. A belief is contradicted, borne out, or untested by the evidence of that version and every later one, and once contradicted it stays contradicted, even after the files change again. A belief that explains a problem is judged only in the versions where the problem shows. What a fix will do is a belief of its own, recorded after the change.

**Consequences.** An assumption such as "nothing else calls `total`" is caught by the edit that adds a caller, and a belief disproved before a fix does not come back after it. A fix does not count against the explanation of its bug, so `settled` can name the explanation left when all its predictions are borne out. A prediction about the fixed code inside the explanation could never be checked there, so the problem was never settled, which is why the skill now says to record it separately. Rebuilt with the new core, the trial's own model marks the belief it had disproved as violated.

**Alternatives considered.**

- Judge a belief that explains no problem against the present only, as the skill's first version did. A belief the agent had disproved on the old code showed as holding again after the fix.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `reasoning-belief-judging`: `from-formed-version`. "A belief is contradicted, borne out, or untested by the evidence of that version and every later one"
- Stated, not checked by running Lion: `reasoning-settled` exists. "so `settled` can name the explanation left when all its predictions are borne out"
- Holds when Lion is run: rule `beliefs-judged-from-their-version` holds. "A belief is judged by the evidence of every version from the one it was formed in on, and an explanation by the versions where its problem shows"
- Stated, not checked by running Lion: rule `beliefs-judged-in-present` is withdrawn. "Judge a belief that explains no problem against the present only, as the skill's first version did"
- Holds when Lion is run: `reasoning-non-explaining-belief-judged` is `from-formed-version`. "A belief is contradicted, borne out, or untested by the evidence of that version and every later one"
- Holds when Lion is run: `reasoning-belief-contradicted-in-earlier-version` is `contradicted`. "once contradicted it stays contradicted, even after the files change again"
- Holds when Lion is run: `reasoning-explaining-belief-judged` is `where-problem-shows`. "A belief that explains a problem is judged only in the versions where the problem shows."
- Holds when Lion is run: `reasoning-explanation-after-fix` is `not-contradicted`. "A fix does not count against the explanation of its bug"
- Holds when Lion is run: `reasoning-fix-prediction` is `own-belief`. "What a fix will do is a belief of its own, recorded after the change."
- Holds when Lion is run: `reasoning-record-mjs` exists. "`record.mjs` stamps each belief with the version it was formed in."

<a id="skill-lion-runtime"></a>

## skill-lion-runtime

Now: `published-cli`.

- 2026-11-13 `skill-lion-runtime`: `published-cli` over `project-copy`: "The scripts of both skills run the published Lion CLI through `bunx`, or `npx` without bun, and never a copy of Lion in the project, so changing Lion itself never changes the checker." (`skills-use-published-cli.json`)

<a id="skills-use-published-cli"></a>

### The skills' scripts run the published `@lionlang/cli`, never the copy of Lion in the project

Recorded 2026-11-13 in `history/notes/skills-use-published-cli.json`.

**Context.** The reasoning skill keeps an agent's checked working memory while it works on a project, and Lion itself is one such project: the skill's first trial fixed a bug in Lion's own loading order. A checker that ran the project's copy of Lion would change, or break, with the code under work. The research skill's script `replay.mjs` already ran `bunx @lionlang/cli`, with no way to name another command.

**Decision.** The scripts of both skills run the published Lion CLI through `bunx`, or `npx` without bun, and never a copy of Lion in the project, so changing Lion itself never changes the checker. `LION_CLI` names another command, such as `bun ~/lion/packages/cli/dist/bin.mjs`, for a run that needs a CLI not yet released. The research skill's `replay.mjs` and its eval's `grade.mjs` read `LION_CLI` as the reasoning skill's scripts do.

**Consequences.** A skill can use a library function only once a release has it: the release notes of core 0.9.0 and 0.10.0 say the research skill needs them, and the skill names the CLI version it needs. The first run needs network access, and `bunx` keeps running whatever version it fetched first, so the research skill asks for the newest once before anything else.

**Alternatives considered.**

- Run the copy of Lion in the project being worked on. A project's own copy of Lion, even a broken one, would change the checker, and Lion itself is a project the skills are used on.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `skill-lion-runtime`: `published-cli`. "The scripts of both skills run the published Lion CLI through `bunx`, or `npx` without bun, and never a copy of Lion in the project, so changing Lion itself never changes the checker."
- Holds when Lion is run: rule `skills-use-published-cli` holds. "The skills' scripts run the published `@lionlang/cli`, never the copy of Lion in the project"
- Holds when Lion is run: `skill-script-lion-command` is `published-cli`. "The scripts of both skills run the published Lion CLI through `bunx`, or `npx` without bun"
- Holds when Lion is run: `LION_CLI` exists. "`LION_CLI` names another command, such as `bun ~/lion/packages/cli/dist/bin.mjs`, for a run that needs a CLI not yet released."
- Holds when Lion is run: `research-replay-lion-command` is `lion-cli-env`. "The research skill's `replay.mjs` and its eval's `grade.mjs` read `LION_CLI` as the reasoning skill's scripts do."
- Holds when Lion is run: `research-grade-lion-command` is `lion-cli-env`. "The research skill's `replay.mjs` and its eval's `grade.mjs` read `LION_CLI` as the reasoning skill's scripts do."
- Stated, not checked by running Lion: `skill-library-function-before-release` is `unavailable`. "A skill can use a library function only once a release has it"
- Holds when Lion is run: `research-skill-cli-version-first` is `asks-newest`. "so the research skill asks for the newest once before anything else"

<a id="reasoning-ambiguous-question"></a>

## reasoning-ambiguous-question

Now: `ask-user`.

- 2026-11-13 `reasoning-ambiguous-question`: `ask-user` over `pick-one`: "the agent asks the reader which they mean and records the answer in their words as `decided`" (`52600b2`, `user-decides-ambiguity.json`)

<a id="user-decides-ambiguity"></a>

### A question only the user may settle is asked, not answered by the agent, and an answer from anyone else is listed as presumed

Recorded 2026-11-13 in `history/notes/user-decides-ambiguity.json`.

**Context.** A word in a task can mean two things: revenue as reported or excluding fuel surcharges, a fiscal or a calendar year, the development build or the release build. An agent that picks one and carries on breaks everything built on that choice, and nothing it observes later can contradict a choice, so the mistake never shows as a contradiction. Kepler's agents stop and ask when a word in the task means two things.

**Decision.** In the research skill, the frame declares as a `reading` each key of a question that picks one sense of a word. The core lists in `ambiguous` the questions sources answer in more than one sense, the agent asks the reader which they mean and records the answer in their words as `decided`, and rules that reach a question through `meant` follow it. In the reasoning skill, notes list under `ask` the questions only the user, or the source `of` names, may settle; the core lists in `undecided` those not yet answered, and in `presumed` every answer from anyone else, such as the agent, a file, or a doc. The user's decision holds in every version, since it is about what they want and not about the files.

**Consequences.** A choice made for the user is listed rather than hidden, and the reasoning skill's standing checks ask both `undecided` and `presumed`. Until the reader chooses, research rules use every sense: the Tarnwell example's margin is 26.4% on revenue as reported and 22.5% excluding fuel surcharges, and one choice leaves one margin. If the agent cannot ask, it says that the answer depends on the choice and gives each sense. The research page leads its trust view with what needs the reader's decision.

**Alternatives considered.**

- The agent picks the sense that seems most natural and carries on. One wrong reading early breaks everything built on it, and nothing observed later can contradict a choice.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `reasoning-ambiguous-question`: `ask-user`. "the agent asks the reader which they mean and records the answer in their words as `decided`"
- Holds when Lion is run: `research-page-trust-view-first` is `reader-decisions`. "The research page leads its trust view with what needs the reader's decision."
- Stated, not checked by running Lion: `research-reading` exists. "the frame declares as a `reading` each key of a question that picks one sense of a word"
- Stated, not checked by running Lion: `research-ambiguous` exists. "The core lists in `ambiguous` the questions sources answer in more than one sense"
- Stated, not checked by running Lion: `research-decided` exists. "records the answer in their words as `decided`"
- Stated, not checked by running Lion: `research-meant` exists. "rules that reach a question through `meant` follow it"
- Stated, not checked by running Lion: `reasoning-notes-ask` exists. "notes list under `ask` the questions only the user, or the source `of` names, may settle"
- Stated, not checked by running Lion: `reasoning-undecided` exists. "the core lists in `undecided` those not yet answered"
- Stated, not checked by running Lion: `reasoning-presumed` exists. "in `presumed` every answer from anyone else"
- Holds when Lion is run: rule `user-decides-ambiguity` holds. "A question only the user may settle is asked, not answered by the agent, and an answer from anyone else is listed as presumed"
- Holds when Lion is run: `research-ambiguous-reading` is `asked`. "the agent asks the reader which they mean"
- Holds when Lion is run: `reasoning-asked-question-unanswered` is `undecided`. "the core lists in `undecided` those not yet answered"
- Holds when Lion is run: `reasoning-asked-question-answered-by-other` is `presumed`. "in `presumed` every answer from anyone else, such as the agent, a file, or a doc"
- Holds when Lion is run: `reasoning-user-decision-after-file-change` is `not-stale`. "The user's decision holds in every version, since it is about what they want and not about the files."
- Holds when Lion is run: `research-ambiguous-question-before-choice` is `every-sense`. "Until the reader chooses, research rules use every sense"
- Holds when Lion is run: `research-ambiguity-agent-cannot-ask` is `gives-each-sense`. "If the agent cannot ask, it says that the answer depends on the choice and gives each sense."
- Holds when Lion is run: `reasoning-standing-checks-ambiguity` is `ask-undecided-and-presumed`. "the reasoning skill's standing checks ask both `undecided` and `presumed`"

<a id="research-figure-recording"></a>

## research-figure-recording

Now: `as-written`.

- 2026-11-13 `research-figure-recording`: `as-written` over `converted-to-frame-unit`: "A figure is recorded as the source writes it, in a shape whose key names that unit" (`engine-computes-model-interprets.json`)

<a id="engine-computes-model-interprets"></a>

### The agent copies a figure as its source writes it and the model computes the rest, so every number in a claim must be written in its quote

Recorded 2026-11-13 in `history/notes/engine-computes-model-interprets.json`.

**Context.** The research skill already asked that every figure in a report come from a query, but nothing checked that the numbers in a claim are the ones its quote writes. An agent that converts "$1.2 billion" to 1,200 million as it reads, or mistypes a number, leaves a figure no quote shows, and nothing noticed. The change follows what Kepler learned building verifiable AI for finance: the agent interprets, the engine computes and keeps provenance, and every number traces to the words and line item it came from.

**Decision.** A figure is recorded as the source writes it, in a shape whose key names that unit, such as `{"usd_bn": 1.2}` for "$1.2 billion", and an `answer` rule converts it. The core reads the numbers written in each quote with `string/numbers`, and `unquoted` lists every number at the top of a claim's `says` that its quote does not write; a number taken from where the quote stands, such as a year in a heading, goes in a field the frame declares as `context`. Ratios, margins, and totals are computed by rules, and the page shows a computed figure's evidence "Worked out as" its arithmetic. Core 0.10.0 adds `number/fromString` and `string/numbers` for this.

**Consequences.** A slip in copying or converting shows up at once in `unquoted`, and the report says which figures are not written in their quote. A rounded figure, such as "near $0.41 billion", is a question of its own and never disputes the exact one. The research skill needs `@lionlang/cli` 0.9.0, the release that bundles core 0.10.0. A frozen-corpus eval, `verifies-company-figures`, grades a run by stage, among them whether figures were copied as written and whether the model, not the agent, worked out the margin.

**Alternatives considered.**

- Convert a figure to the frame's unit while recording it, as `{"usd_m": 1200}` for "$1.2 billion". No quote writes the converted number, so a slip in converting could not be told from a correct figure. Converting is a job for the model.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `research-figure-recording`: `as-written`. "A figure is recorded as the source writes it, in a shape whose key names that unit"
- Holds when Lion is run: `research-skill-core-requirement` is `core-0-10-0`. "The research skill needs `@lionlang/cli` 0.9.0, the release that bundles core 0.10.0."
- Stated, not checked by running Lion: `cli-0-9-0-bundled-core` is `core-0-10-0`. "The research skill needs `@lionlang/cli` 0.9.0, the release that bundles core 0.10.0."
- Holds when Lion is run: `verifies-company-figures` exists. "A frozen-corpus eval, `verifies-company-figures`, grades a run by stage"
- Holds when Lion is run: rule `engine-computes-model-interprets` holds. "The agent copies a figure as its source writes it and the model computes the rest, so every number in a claim must be written in its quote"
- Stated, not checked by running Lion: `research-unquoted` exists. "`unquoted` lists every number at the top of a claim's `says` that its quote does not write"
- Holds when Lion is run: `research-claim-number-not-in-quote` is `listed`. "`unquoted` lists every number at the top of a claim's `says` that its quote does not write"
- Holds when Lion is run: `research-number-in-context-field` is `not-listed`. "a number taken from where the quote stands, such as a year in a heading, goes in a field the frame declares as `context`"
- Holds when Lion is run: `research-computed-figure-evidence` is `worked-out-as`. "the page shows a computed figure's evidence "Worked out as" its arithmetic"
- Holds when Lion is run: `number/fromString` exists. "Core 0.10.0 adds `number/fromString` and `string/numbers` for this."
- Holds when Lion is run: `string/numbers` exists. "Core 0.10.0 adds `number/fromString` and `string/numbers` for this."
- Holds when Lion is run: `research-rounded-figure` is `own-question`. "A rounded figure, such as "near $0.41 billion", is a question of its own and never disputes the exact one."

<a id="why-premises"></a>

## why-premises

Now: `every-goal`.

- 2026-11-13 `why-premises`: `every-goal` over `relation-goals-and-filters`: "One rule replaces the case that left `=` and `in` out." (`2026-11-13-core-0.10.0.json`, `41477b1`, `why-shows-every-goal.json`)

<a id="why-shows-every-goal"></a>

### `why` shows every goal of a rule's body as it held, `=` and `in` among them

Recorded 2026-11-13 in `history/notes/why-shows-every-goal.json`.

**Context.** `why` explained a derived fact by the rows its relation goals matched and the tests that held, but it left out `=` and `in`. A goal that computed a value, such as `["=", "?ratio", ["number/divide", "?a", "?b"]]`, did not show, so a figure a rule worked out had no arithmetic in its explanation. The research skill needed every computed figure to trace to the line items it came from.

**Decision.** Under `because`, `why` shows each row a relation goal matched, explained in turn, a `not` as `absent`, and every other goal as `check`, with the answer's values in place of its variables. So `["=", "?ratio", ["number/divide", "?a", "?b"]]` shows as `{"check": ["=", 0.25, ["number/divide", 1, 4]]}`. One rule replaces the case that left `=` and `in` out.

**Consequences.** Each check, evaluated as it stands, is `true`, so anyone can work the arithmetic again. The research page shows a computed figure's evidence "Worked out as" its arithmetic, and the docs' "Explain a result" shows how a computed figure was worked out.

**Alternatives considered.**

- Leave `=` and `in` out of `why`, as before 0.10.0. A figure a rule computed showed the rows it rested on but not the arithmetic that made it.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `why-premises`: `every-goal`. "One rule replaces the case that left `=` and `in` out."
- Holds when Lion is run: rule `why-shows-every-goal` holds. "`why` shows every goal of a rule's body as it held, `=` and `in` among them"
- Holds when Lion is run: `why-in-goal` is `shown`. "`why` shows every goal of a rule's body as it held, `=` and `in` among them"
- Holds when Lion is run: `why-equals-goal` is `shown`. "So `["=", "?ratio", ["number/divide", "?a", "?b"]]` shows as `{"check": ["=", 0.25, ["number/divide", 1, 4]]}`."
- Holds when Lion is run: `why-not-goal` is `absent`. "a `not` as `absent`"
- Holds when Lion is run: `why-derived-fact` is `explanation-tree`. "Under `because`, `why` shows each row a relation goal matched, explained in turn"
- Holds when Lion is run: `why-check-variables` is `answer-values`. "with the answer's values in place of its variables"
- Holds when Lion is run: `why-check-evaluated` is `true`. "Each check, evaluated as it stands, is `true`, so anyone can work the arithmetic again."
- Holds when Lion is run: `research-page-computed-figure` is `worked-out-as-arithmetic`. "The research page shows a computed figure's evidence "Worked out as" its arithmetic"

<a id="chase-strategy"></a>

## chase-strategy

Now: `restricted-datalog-first-parallel`.

- 2026-11-13 `chase-strategy`: `restricted-datalog-first-parallel`: "`exists` in a rule head says the head holds for values nobody has given, and the rule invents them: `["rule", ["exists", ["?m"], ["mother", "?c", "?m"]], ["person", "?c"]]` gives every person a mother. A rule invents only for an answer whose head does not hold already, so with `["mother", "ada", "eve"]` it invents nothing for ada. Rules that invent wait until every rule that invents nothing has finished; then every rule that invents, and whose head does not hold, invents, all at once; the other rules run on what was invented; and so on until nothing more is invented. So the result does not depend on the order rules or facts were added in. A rule that invents cannot aggregate: `... both aggregates and lists variables in "exists". A rule that invents values cannot aggregate.`" (`786fdc0`, `existential-rules.json`)

<a id="termination-check-scope"></a>

## termination-check-scope

Now: `recursive-rules-only`.

- 2026-11-13 `termination-check-scope`: `recursive-rules-only` over `every-rule`: "the check now follows only rules that recurse, and isForm no longer allocates a list per call, which brought it back to main's time." (`786fdc0`)

<a id="dependency-graph-recompute"></a>

## dependency-graph-recompute

Now: `only-with-equality-rule`.

- 2026-11-14 `dependency-graph-recompute`: `only-with-equality-rule` over `every-rule-form`: "A first version recomputed the dependency graph for every rule form, which made "300 rules added one form at a time" 0.86x; it now does so only when the program has an equality rule, and is at 1.01x." (`b030d8a`)

<a id="equality-generating-dependencies"></a>

## equality-generating-dependencies

Now: `equality-rule-head`.

- 2026-11-14 `equality-generating-dependencies`: `equality-rule-head` over `keys-only`: "Keys were the only equality Lion had; this gives the general form, built from what Lion already has rather than beside it:" (`b030d8a`)

<a id="equality-rule-placement"></a>

## equality-rule-placement

Now: `group-that-invents-what-it-meets`.

- 2026-11-14 `equality-rule-placement`: `prefer-inventing-group`: "It runs with a relation its body reads that rules derive, one no other of them depends on, preferring one whose rules invent, so everything else it reads is complete first; its body cannot ask a question about that group." (`b030d8a`)
- 2026-11-14 `equality-rule-placement`: `group-that-invents-what-it-meets` over `prefer-inventing-group`, was `prefer-inventing-group`: "`equalityHome` loses its "prefer a group that invents" rule: an equality rule runs with the group that invents what it can meet, and with none it only holds as its invariant." (`1d5800a`)

<a id="goal-directed-sharing"></a>

## goal-directed-sharing

Now: `share-full-relations`.

- 2026-11-14 `goal-directed-sharing`: `share-full-relations` over `full-evaluation-workaround`, `growing-model`, `copy-for-lookup-arguments-only`: "any other goal reads the relation itself, which the database derives once and keeps for every later query" (`goal-directed-shares-full-relations.json`)

<a id="goal-directed-shares-full-relations"></a>

### Goal-directed queries share what is derived in full, and a relation is derived when a goal first reads it

Recorded 2026-11-14 in `history/notes/goal-directed-shares-full-relations.json`.

**Context.** A goal-directed query rewrote the rules with magic sets into a model of its own, and every rule-defined goal it reached became a copy for the arguments it knew, even a goal that knew none, whose copy holds every row of the relation. Nothing was shared between queries, so a page that asks a model many different questions derived the same relations once per question. A copy also always led with the guard that holds the values asked about, so when a rule could only test a known value, inside a record pattern or a `schema/open`, it scanned its relation once for each value asked about: on the research model of Lion's own development, one copy took 2 seconds where deriving the whole relation took 15 milliseconds. The page's 37 questions took 36.6 seconds goal-directed and 0.12 seconds in full, so the page and the research build switched to full evaluation, and every host with such a model would have had to know to do the same.

**Decision.** A relation goal gets a copy only when it knows an argument and the database has not derived the relation in full; any other goal reads the relation itself, which the database derives once and keeps for every later query. A copy's guard leads only when a relation goal of the rule can look rows up by what it binds, a variable that stands whole as an argument or a record or list made of such; otherwise the guard is a test where the rule's own plan has bound what it holds, so a copy never does more than the rule. In both strategies a relation is derived the first time a goal reads it with an answer to extend, rather than before the rules that read it run, and a goal-directed query's rewritten bodies are kept with the model they run on.

**Consequences.** Goal-directed evaluation is the default that works on large, rule-heavy models: the research page's questions take 0.11 seconds, as full evaluation takes, and a question asked on a database that has derived nothing yet costs at most about what full evaluation costs, and often far less, since it derives only what its answers reach. A query may now derive a whole relation where it used to derive a copy of it, when it knows nothing about it; the database keeps that relation, so the cost is paid once. Neither strategy fails on a relation that no answer reaches, as goal-directed queries already did not fail on rows they never derive; a program that failed on such a relation now answers. What the database has derived for earlier queries still never changes an answer.

**Alternatives considered.**

- Keep full evaluation in the research page and build, as a workaround. Every host would have to learn that the default is unusable on its model, and a single question on a model nobody has asked yet is faster goal-directed, since it derives only what it reaches.
- One goal-directed model per database that grows as queries add demand. It needs groups of relations that already finished to run again when new demand arrives, which is more machinery than sharing what is derived in full, and on these workloads sharing already makes goal-directed as fast as full evaluation.
- Give a relation a copy only for arguments its rules can look rows up by, and derive it in full otherwise. A known argument that a rule can only test still keeps a join from being built in full: with `["pair", "?x", "?y"]` defined by `in` over two ranges, asking about one `?x` gives one row per `?y`, where deriving `pair` in full gives the whole cross product.
- Always lead a copy with its guard, as the textbook rewrite does. It assumes every known value narrows a lookup. In Lion a known value can sit inside a pattern or a schema, where it only tests rows, and then leading scans the relation once per value asked about, without bound.

**What it asserts, checked.**

- Stated, not checked by running Lion: rule `goal-directed-shares-full-relations` holds. "A relation goal gets a copy only when it knows an argument and the database has not derived the relation in full; any other goal reads the relation itself, which the database derives once and keeps for every later query"
- Stated, not checked by running Lion: `research-page-goal-directed-seconds` is 0.11. "the research page's questions take 0.11 seconds, as full evaluation takes"
- Holds when Lion is run: rule `relations-derived-when-read` holds. "In both strategies a relation is derived the first time a goal reads it with an answer to extend"
- Stated, not checked by running Lion: decided `goal-directed-sharing`: `share-full-relations`. "any other goal reads the relation itself, which the database derives once and keeps for every later query"
- Stated, not checked by running Lion: decided `magic-guard-placement`: `lead-when-lookup`. "A copy's guard leads only when a relation goal of the rule can look rows up by what it binds"
- Holds when Lion is run: `relation-no-answer-reaches` is `not-derived`. "Neither strategy fails on a relation that no answer reaches"
- Holds when Lion is run: `goal-directed-goal-without-known-argument` is `reads-full-relation`. "A query may now derive a whole relation where it used to derive a copy of it, when it knows nothing about it"
- Holds when Lion is run: `derived-rows-present-vs-absent-answers` is `same`. "What the database has derived for earlier queries still never changes an answer."
- Stated, not checked by running Lion: `research-page-goal-directed-seconds-before-fix` is 36.6. "The page's 37 questions took 36.6 seconds goal-directed and 0.12 seconds in full"
- Stated, not checked by running Lion: `research-page-full-evaluation-seconds` is 0.12. "The page's 37 questions took 36.6 seconds goal-directed and 0.12 seconds in full"

<a id="magic-guard-placement"></a>

## magic-guard-placement

Now: `lead-when-lookup`.

- 2026-11-14 `magic-guard-placement`: `lead-when-lookup` over `always-lead`: "A copy's guard leads only when a relation goal of the rule can look rows up by what it binds" (`goal-directed-shares-full-relations.json`)

<a id="change-release-placement"></a>

## change-release-placement

Now: `ancestry`.

- 2026-11-14 `change-release-placement`: `ancestry` over `written-release`: "so nobody writes down which release a change is in" (`project-record-in-lion.json`)

<a id="project-record-in-lion"></a>

### Keep the changelog and the decisions as a Lion model of the git history

Recorded 2026-11-14 in `history/notes/project-record-in-lion.json`.

**Context.** `CHANGELOG.md` was prose written by hand at each release, and the reasons behind Lion's design lived only in commit messages and in notes outside the repository. Nothing checked that every feature or fix had an entry, that a release's section listed what that release shipped, or that a changelog entry and the decision behind it agreed. Lion is a language for exactly this: facts, rules that derive the rest, invariants, and `why` for every conclusion.

**Decision.** The project record lives in `history/`. Decisions, changes, and releases are plain JSON files, one decision or one piece of work per file, and git is read in as facts: every commit with its parents, time, and message, every tag, and the commit that added each file of the record. A file renamed with nothing else changed keeps the commit that added it; git's renames by likeness are not followed, since two entries share most of their lines, and a new entry would take an old one's commit. Rules in `history/core.json` derive the rest. A change is made by the commits it names, or else by the commit that added its file, and it shipped in the first release whose commit has all of those commits behind it, so nobody writes down which release a change is in. Checks list every `feat` or `fix` commit that no entry records, every quote that is not in the commit message it cites, every breaking change that follows from no decision, and every release whose versions do not rise or whose tag points elsewhere. `CHANGELOG.md` and `DECISIONS.md` are computed by the Lion expressions in `history/outputs.json`, and the record's tests fail when either file is not what the record writes.

**Consequences.** `CHANGELOG.md` is no longer edited by hand: a change is recorded in `history/changes/`, and `bun run history write` writes the page. A commit that adds a feature or a fix without an entry fails the check from the next commit on, and in CI, which now fetches the whole history. The record runs on the workspace's own `@lionlang/core`, so a change to Lion that breaks the record's rules fails the tests: the project uses its own language every day. Importing the old changelog showed that its sections already matched what git says each release contained, and the first check found four tags that were never made, for three releases.

**Alternatives considered.**

- Markdown decision records beside a hand-written changelog, as most projects keep them. Nothing would check them against git or against each other, which is the problem the record solves.
- A changesets tool that collects entries and writes the changelog at release time. It writes text but knows nothing a rule could check, such as ancestry, decisions, or commits that have no entry, and it is another language beside Lion.
- Keep the record as a saved Lion database, the file `lion --database` reads and writes. The facts from git change with every commit, and a file in a commit cannot hold that commit's own hash. Plain entry files merge cleanly, and git itself stays the source of what was committed when.
- Write down the release each change belongs to. Ancestry decides it. While the history was backfilled, a fix first placed in 0.1.0 turned out to have reached `main` only after 0.1.1, which a written release would have hidden.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `project-record-format`: `lion-model-of-git`. "Keep the changelog and the decisions as a Lion model of the git history"
- Holds when Lion is run: `bun-run-history-write` exists. "a change is recorded in `history/changes/`, and `bun run history write` writes the page"
- Holds when Lion is run: `feat-commit-without-entry` is `check-fails`. "A commit that adds a feature or a fix without an entry fails the check from the next commit on, and in CI, which now fetches the whole history"
- Holds when Lion is run: `ci-git-history-depth` is `full`. "A commit that adds a feature or a fix without an entry fails the check from the next commit on, and in CI, which now fetches the whole history"
- Holds when Lion is run: `record-quote-not-in-commit-message` is `listed`. "Checks list every `feat` or `fix` commit that no entry records, every quote that is not in the commit message it cites, every breaking change that follows from no decision, and every release whose versions do not rise or whose tag points elsewhere"
- Holds when Lion is run: `record-breaking-change-without-decision` is `listed`. "Checks list every `feat` or `fix` commit that no entry records, every quote that is not in the commit message it cites, every breaking change that follows from no decision, and every release whose versions do not rise or whose tag points elsewhere"
- Holds when Lion is run: `record-release-versions-not-rising` is `listed`. "Checks list every `feat` or `fix` commit that no entry records, every quote that is not in the commit message it cites, every breaking change that follows from no decision, and every release whose versions do not rise or whose tag points elsewhere"
- Holds when Lion is run: `record-core-version` is `workspace`. "The record runs on the workspace's own `@lionlang/core`, so a change to Lion that breaks the record's rules fails the tests"
- Stated, not checked by running Lion: `missing-release-tags` is 4. "the first check found four tags that were never made, for three releases"
- Stated, not checked by running Lion: decided `change-release-placement`: `ancestry`. "so nobody writes down which release a change is in"
- Stated, not checked by running Lion: rule `changes-ship-by-ancestry` holds. "it shipped in the first release whose commit has all of those commits behind it"
- Holds when Lion is run: `record-file-renamed-unchanged` is `keeps-adding-commit`. "A file renamed with nothing else changed keeps the commit that added it"
- Holds when Lion is run: `record-rename-by-likeness` is `not-followed`. "git's renames by likeness are not followed"
- Holds when Lion is run: `history-core-json` exists. "Rules in `history/core.json` derive the rest"
- Holds when Lion is run: `history-outputs-json` exists. "`CHANGELOG.md` and `DECISIONS.md` are computed by the Lion expressions in `history/outputs.json`, and the record's tests fail when either file is not what the record writes"
- Holds when Lion is run: `changelog-not-what-record-writes` is `tests-fail`. "`CHANGELOG.md` and `DECISIONS.md` are computed by the Lion expressions in `history/outputs.json`, and the record's tests fail when either file is not what the record writes"
- Holds when Lion is run: rule `changelog-written-by-record` holds. "`CHANGELOG.md` is no longer edited by hand"

<a id="development-model"></a>

## development-model

Now: `one-record-of-claims`.

- 2026-11-14 `development-model`: `separate-research-model` over `review-by-hand`: "`history/research/` holds a model of Lion's development built with the lion-research skill." (`research-model-of-development.json`)
- 2026-11-16 `development-model`: `one-record-of-claims` over `separate-research-model`, was `separate-research-model`: "Every record of Lion's development is a claim, in `history/notes/`" (`one-record-of-claims.json`)

<a id="one-record-of-claims"></a>

### Lion's development is one record of claims, and what a decision asserts is checked against Lion

Recorded 2026-11-16 in `history/notes/one-record-of-claims.json`.

**Context.** The project kept its history twice. Hand-written change entries and decision files said what changed and why, and a research model read every commit into claims: a source's words and what they say. The two overlapped almost entirely, since most entries and decisions came from commits the research had read, yet the pages showed them side by side, the website's changelog listed changes beside what its commits said, and decision files were prose that nothing checked. What the record is for is a mechanically verifiable alternative to architectural decision records.

**Decision.** Every record of Lion's development is a claim, in `history/notes/`. A change is claims in the words the changelog shows; a decision is a notes file with its context, its alternatives, and claims for what it decides and what it asserts; the readers' notes on older commits are claims of the same kind. A claim is made by the commits it names, else by the commit it quotes, else by the commit that added its file, and ships in the oldest release that has all of them. Every page is written from items: a question with an answer, shown once, under the release that first shipped a claim giving it, in the latest claim's words, with every claim that gives it as a source. What a decision record asserts is checked against Lion at HEAD where a probe runs the case, and otherwise against what the repository says now. The website's changelog timeline is the one page that shows all of it. `history/changes/` and `history/decisions/` are gone, and so is `supersedes`: deciding a question again differently is a reversal the model derives.

**Consequences.** A change, the decision behind it, and every commit that says the same are one item with several sources, so nothing is listed twice. A decision says what it commits Lion to, and DECISIONS.md shows for each assertion whether it holds when Lion is run, is broken, is only stated, or was replaced by a later word. The old entries and decision files became claims written by agents from their own words, reusing the ids the commits' claims use, so a converted statement that disagrees with the commits or with Lion is a finding like any other. CHANGELOG.md lists every item but figures, so it is longer, and its bullets are claims' words.

**Alternatives considered.**

- Keep change entries and decision files beside the research's claims, and link them. That is what this replaces: one history kept twice, and a decision's prose that nothing checks.
- Give every claim one shape, a question and an answer, with alternatives making it a decision. The kinds of claim already say what each one answers, and a decision is clearer as a claim of its own beside the behavior it asserts.
- Make commit messages the only record. A commit message cannot be corrected later, and a decision's context and alternatives do not fit in one.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `development-model`: `one-record-of-claims`. "Every record of Lion's development is a claim, in `history/notes/`"
- Stated, not checked by running Lion: decided `development-page`: `changelog-timeline`. "The website's changelog timeline is the one page that shows all of it"
- Stated, not checked by running Lion: rule `items-shown-once` holds. "a question with an answer, shown once, under the release that first shipped a claim giving it, in the latest claim's words, with every claim that gives it as a source"
- Stated, not checked by running Lion: rule `decision-assertions-checked` holds. "What a decision record asserts is checked against Lion at HEAD where a probe runs the case, and otherwise against what the repository says now"
- Holds when Lion is run: `history-changes-and-decisions-folders` is removed. "`history/changes/` and `history/decisions/` are gone"
- Holds when Lion is run: `decision-supersedes-field` is removed. "and so is `supersedes`"
- Holds when Lion is run: `decision-reversal` is `derived`. "deciding a question again differently is a reversal the model derives"

<a id="research-model-of-development"></a>

### Keep a research model of Lion's development that checks the project against itself

Recorded 2026-11-14 in `history/notes/research-model-of-development.json`.

**Context.** The project record says what changed, when it shipped, and which decisions it follows, but not whether the project agrees with itself. Rules were stated in commit messages, the README, and AGENTS.md, and later commits changed behavior the rules still predicted without saying so; decisions were made, reversed, and made again; figures in commit messages were reported against baselines that did not chain. Nothing read the history as a whole, and nothing could be asked before a new decision whether it contradicts an old one.

**Decision.** `history/research/` holds a model of Lion's development built with the lion-research skill. Readers record what each commit states as quoted claims in five kinds: a feature, a behavior, a rule with the behavior it predicts and the cases it leaves out, a decision, and a figure. The README, AGENTS.md, and CLAUDE.md as they stand, each decision of the record, and probes that run a program on Lion at HEAD are sources too. A publisher's latest word counts. The frame states assumptions about the project, each with a rule that finds evidence against it, and every finding is either listed in `known.json`, waiting for a decision, or accepted with a reason in `accepted.json`. `bun run history research` builds the model and the page `docs/research.html`, and fails on a finding in neither list and on a listed finding the model no longer finds.

**Consequences.** Inconsistencies in the project's history are listed where everyone can see them, on the website and in the check, and a new one fails the record's tests until someone decides about it. A decision can say in the research's terms what it settles, with `"claims"` quoted from its own words, so it is checked against every rule and behavior as soon as it is written. The model is rebuilt from git, the notes, the decisions, and Lion itself, so only the notes, the probes, the lists of findings, and the page are kept in git. A commit nobody has read yet is listed but does not fail the check.

**Alternatives considered.**

- Review decisions by hand against the decision record. Nobody can hold every rule and every behavior in mind, and the inconsistencies the model found had gone unnoticed by every commit that made them.
- Keep `model.json` and the steps in git. The documents and decisions are dated by the commit that holds them, so the model changes with every commit and would always be out of date in the commit that writes it.
- Fail the check on every open finding. The history cannot be changed, so a finding in an old commit would fail every build until someone accepted it without deciding anything. A list of known findings, like the interop grid's, keeps them visible while it waits for a decision, and fails only on what is new.

**What it asserts, checked.**

- Holds when Lion is run: `research-model` exists. "`bun run history research` builds the model and the page `docs/research.html`, and fails on a finding in neither list and on a listed finding the model no longer finds"
- Holds when Lion is run: `research-unread-commit` is `listed-without-failing`. "A commit nobody has read yet is listed but does not fail the check."
- Stated, not checked by running Lion: `decision-claims` exists. "A decision can say in the research's terms what it settles, with `"claims"` quoted from its own words, so it is checked against every rule and behavior as soon as it is written."
- Holds when Lion is run: `research-probes` exists. "probes that run a program on Lion at HEAD are sources too"
- Stated, not checked by running Lion: rule `findings-wait-for-decision` holds. "every finding is either listed in `known.json`, waiting for a decision, or accepted with a reason in `accepted.json`"
- Replaced by a later word: decided `development-model`: `separate-research-model`. "`history/research/` holds a model of Lion's development built with the lion-research skill."
- Stated, not checked by running Lion: decided `research-model-storage`: `rebuilt-from-sources`. "The model is rebuilt from git, the notes, the decisions, and Lion itself, so only the notes, the probes, the lists of findings, and the page are kept in git."
- Stated, not checked by running Lion: decided `research-open-findings`: `known-findings-list`. "A list of known findings, like the interop grid's, keeps them visible while it waits for a decision, and fails only on what is new."
- Replaced by a later word: `research-page` exists. "`bun run history research` builds the model and the page `docs/research.html`"
- Stated, not checked by running Lion: rule `research-later-word-replaces-earlier` holds. "A publisher's latest word counts."
- Holds when Lion is run: `research-new-finding` is `fails-check`. "a new one fails the record's tests until someone decides about it"
- Holds when Lion is run: `research-listed-finding-no-longer-found` is `fails-check`. "and on a listed finding the model no longer finds"

<a id="project-record-form"></a>

## project-record-form

Now: `lion-model-of-git-history`.

- 2026-11-14 `project-record-form`: `lion-model-of-git-history`: "The project record. `history/` keeps Lion's changes, releases, and design decisions as a Lion model of the git history. Entries are plain JSON files; every commit, parent, and tag, and the commit that added each file, are facts; and rules derive the rest, such as the release that shipped each change, which is the oldest release whose commit reaches every commit that made it. `CHANGELOG.md` and the new `DECISIONS.md` are written from the record by Lion expressions, with `bun run history write`. `bun run history check` fails on a `feat` or `fix` commit that no entry records, a quote that is not in the commit message it cites, a breaking change that follows from no decision, a version that does not rise, a tag on the wrong commit, or a page that is not what the record writes, and the tests and CI run it. `bun run history ask` asks the record anything." (`project-record.json`)

<a id="project-record-format"></a>

## project-record-format

Now: `lion-model-of-git`.

- 2026-11-14 `project-record-format`: `lion-model-of-git` over `markdown-records`, `changesets`, `saved-database`: "Keep the changelog and the decisions as a Lion model of the git history" (`project-record-in-lion.json`)

<a id="research-model-storage"></a>

## research-model-storage

Now: `rebuilt-from-sources`.

- 2026-11-14 `research-model-storage`: `rebuilt-from-sources` over `model-in-git`: "The model is rebuilt from git, the notes, the decisions, and Lion itself, so only the notes, the probes, the lists of findings, and the page are kept in git." (`research-model-of-development.json`)

<a id="research-open-findings"></a>

## research-open-findings

Now: `known-findings-list`.

- 2026-11-14 `research-open-findings`: `known-findings-list` over `fail-on-every-finding`: "A list of known findings, like the interop grid's, keeps them visible while it waits for a decision, and fails only on what is new." (`research-model-of-development.json`)

<a id="direction-stopping"></a>

## direction-stopping

Now: `patience-since-last-payoff`.

- 2026-11-15 `direction-stopping`: `patience-since-last-payoff` over `every-miss`, `fixed-budget`: "A direction or a lead is set aside after as many misses in a row as its patience, counted since its last payoff" (`patience-since-last-payoff.json`)

<a id="patience-since-last-payoff"></a>

### A direction or a lead is set aside after as many misses in a row as its patience, counted since its last payoff

Recorded 2026-11-15 in `history/notes/patience-since-last-payoff.json`.

**Context.** Taylor's map-driven autoresearch keeps a map of ideas, runs experiments on some, and moves effort from the ideas that stall to the ones that pay. The reasoning skill's directions (ideas for improving a score) and the research skill's leads (lines of inquiry) both need a rule for when to stop spending on one. A direction's experiment pays off when its version improves a score; a lead's source pays off when it says something first-hand the lead covers.

**Decision.** Each direction and lead has a patience, 3 unless it says. Its misses are the experiments, or the sources read for it, that paid nothing and came after its last payoff; when they reach its patience it is set aside, and it stays in the model with why. A payoff starts the count again, as patience does in early stopping. Both skills use the one rule and the same names: `paid_off`, `miss`, `exhausted`, `live`, `progress`. The research recorder numbers the sources read for leads in the order their notes are recorded, so "in a row" has a meaning there too.

**Consequences.** A direction that keeps paying off keeps its budget, and one that never pays is dropped after its patience. The list of where to try next puts the live directions that paid off most first, then those tried least; it is advice, and the agent says why when it goes against it. A direction or lead can also wait: on a question it `needs` that only the user may answer (reasoning), or on the reader's choice of a sense of a question it pursues (research), and an answer otherwise rules a direction out.

**Alternatives considered.**

- Count every miss, not only those since the last payoff. The most productive direction also misses most often in absolute terms, so it would be the first set aside.
- A fixed number of experiments or sources for each, whatever they find. It spends as much on an idea that has stopped paying as on one that pays every time, which is what reallocating effort is meant to avoid.
- Let the model choose the next experiment. Which idea to try next weighs things the model does not hold, such as cost and how promising an untried idea looks; the model says what the evidence shows and the agent decides.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `direction-stopping`: `patience-since-last-payoff`. "A direction or a lead is set aside after as many misses in a row as its patience, counted since its last payoff"
- Stated, not checked by running Lion: `reasoning-progress` exists. "Both skills use the one rule and the same names: `paid_off`, `miss`, `exhausted`, `live`, `progress`"
- Stated, not checked by running Lion: `research-paid-off` exists. "Both skills use the one rule and the same names: `paid_off`, `miss`, `exhausted`, `live`, `progress`"
- Stated, not checked by running Lion: `research-miss` exists. "Both skills use the one rule and the same names: `paid_off`, `miss`, `exhausted`, `live`, `progress`"
- Stated, not checked by running Lion: `research-exhausted` exists. "Both skills use the one rule and the same names: `paid_off`, `miss`, `exhausted`, `live`, `progress`"
- Stated, not checked by running Lion: `research-live` exists. "Both skills use the one rule and the same names: `paid_off`, `miss`, `exhausted`, `live`, `progress`"
- Stated, not checked by running Lion: `research-progress` exists. "Both skills use the one rule and the same names: `paid_off`, `miss`, `exhausted`, `live`, `progress`"
- Holds when Lion is run: `research-lead-source-order` is `recording-order`. "The research recorder numbers the sources read for leads in the order their notes are recorded"
- Holds when Lion is run: `reasoning-next-direction-order` is `most-paid-off-first`. "The list of where to try next puts the live directions that paid off most first, then those tried least"
- Stated, not checked by running Lion: decided `next-experiment-choice`: `agent-decides`. "it is advice, and the agent says why when it goes against it"
- Holds when Lion is run: `reasoning-direction-needing-user-answer` is `waits`. "A direction or lead can also wait: on a question it `needs` that only the user may answer (reasoning), or on the reader's choice of a sense of a question it pursues (research)"
- Holds when Lion is run: rule `patience-since-last-payoff` holds. "Its misses are the experiments, or the sources read for it, that paid nothing and came after its last payoff; when they reach its patience it is set aside, and it stays in the model with why"
- Holds when Lion is run: `research-lead-ambiguous-question` is `waits`. "A direction or lead can also wait: on a question it `needs` that only the user may answer (reasoning), or on the reader's choice of a sense of a question it pursues (research)"
- Holds when Lion is run: `reasoning-direction-answered-otherwise` is `ruled-out`. "an answer otherwise rules a direction out"
- Stated, not checked by running Lion: `default-patience` is 3. "Each direction and lead has a patience, 3 unless it says"
- Holds when Lion is run: `direction-miss-count-after-payoff` is `reset`. "A payoff starts the count again, as patience does in early stopping"
- Holds when Lion is run: `exhausted-direction-in-model` is `kept-with-why`. "it stays in the model with why"
- Stated, not checked by running Lion: `reasoning-paid-off` exists. "Both skills use the one rule and the same names: `paid_off`, `miss`, `exhausted`, `live`, `progress`"
- Stated, not checked by running Lion: `reasoning-miss` exists. "Both skills use the one rule and the same names: `paid_off`, `miss`, `exhausted`, `live`, `progress`"
- Stated, not checked by running Lion: `reasoning-exhausted` exists. "Both skills use the one rule and the same names: `paid_off`, `miss`, `exhausted`, `live`, `progress`"
- Stated, not checked by running Lion: `reasoning-live` exists. "Both skills use the one rule and the same names: `paid_off`, `miss`, `exhausted`, `live`, `progress`"

<a id="next-experiment-choice"></a>

## next-experiment-choice

Now: `agent-decides`.

- 2026-11-15 `next-experiment-choice`: `agent-decides` over `model-chooses`: "it is advice, and the agent says why when it goes against it" (`patience-since-last-payoff.json`)

<a id="research-lead-done"></a>

## research-lead-done

Now: `corroborated`.

- 2026-11-15 `research-lead-done`: `corroborated` over `undisputed`, `any-answer`: "A research lead is done when every question it pursues has an answer two publishers give first-hand" (`lead-done-when-confirmed.json`)

<a id="lead-done-when-confirmed"></a>

### A research lead is done when every question it pursues has an answer two publishers give first-hand

Recorded 2026-11-15 in `history/notes/lead-done-when-confirmed.json`.

**Context.** The research skill's leads record what each line of inquiry set out to find. A lead needs an end besides running out of patience, and the core already says what confirmation is: an answer two publishers give first-hand, with relays not counted.

**Decision.** A lead pursues questions written as patterns: a record covers every answered question that has its keys and values, so `{"warehouses": "tarnwell"}` covers the count on every date. Senses the reader set aside are not covered. The lead is done when every pattern covers an answer that is `corroborated`. Disputes do not hold a lead open; `disputed` reports them as before.

**Consequences.** In the Tarnwell corpus, the lead for an outside count of warehouses is done once the licensing registry says 37 first-hand, though Cargo Ledger's 39 is still a dispute. A question only one publisher can answer never finishes its lead, which then runs out of patience, and the report says that nobody independent gives it.

**Alternatives considered.**

- Done only when the covered questions are also undisputed. One outlier source would keep a lead open for as long as anyone kept reading, and the dispute is already a finding of its own.
- Done when any source answers the question. One publisher's word repeated by ten outlets would finish it, which is the mistake the research core exists to catch.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `research-lead-done`: `corroborated`. "A research lead is done when every question it pursues has an answer two publishers give first-hand"
- Holds when Lion is run: rule `research-counts-publishers` holds. "an answer two publishers give first-hand, with relays not counted"
- Holds when Lion is run: rule `lead-done-when-confirmed` holds. "The lead is done when every pattern covers an answer that is `corroborated`"
- Holds when Lion is run: `research-lead-pattern-coverage` is `matching-keys-and-values`. "a record covers every answered question that has its keys and values"
- Holds when Lion is run: `research-lead-set-aside-sense` is `not-covered`. "Senses the reader set aside are not covered"
- Holds when Lion is run: `research-lead-disputed-answer` is `done`. "Disputes do not hold a lead open"
- Holds when Lion is run: `research-lead-single-publisher-question` is `never-done`. "A question only one publisher can answer never finishes its lead"

<a id="score-direction"></a>

## score-direction

Now: `rule-per-direction`.

- 2026-11-15 `score-direction`: `rule-per-direction` over `negate-lower-is-better`: "one rule each for lower and higher, where negating lower-is-better scores would have saved three rules and shown `-62 > -117`" (`score-improves-past-noise.json`)

<a id="score-improves-past-noise"></a>

### A version improves a score when its worst run beats the best that any earlier version was sure to give

Recorded 2026-11-15 in `history/notes/score-improves-past-noise.json`.

**Context.** The reasoning skill now keeps the record of an experiment loop, after Karpathy's autoresearch and Mike Taylor's map-driven version of it: change the files, run a score, keep the change if the score got better, revert it otherwise. A benchmark's time or an agent eval's grade moves from run to run, so a loop that compares one run with one run keeps changes that only got lucky, and an agent that may run again when a result disappoints can stop once it is ahead.

**Decision.** A score's runs in a version are its range, and what the version is sure to give is its worst run. The best a score has been is the best of those across versions. A version improves a score when its worst run beats the best that the versions which appeared before it were sure to give; which came before is the order the files first held each state. With one run each this is beating the best so far. Runs of a score that differ are its spread, so `disputed` leaves scores out. The files as they are now have regressed when every run on them is worse than the best.

**Consequences.** Best, improvement, and regression rest on the one notion of what a version is sure to give, so a lucky run counts on neither side. Another run of the new version can only lower what it is sure to give, and another run of an earlier version can only raise what came before, which takes an improvement back: the verdicts follow the evidence, not the order it came in. In the first trial an agent's dropped change ran 11, 11, and 22 ms; a rule that took the best from any single run named it the best on its 11, and under this rule the best is 13, the worst run of the version the agent kept. The skill asks for the same number of runs on each version, since a version run once has only the one run to be sure of. `why` on an improvement ends in the runs it compared and a check such as `["number/lessThan", 62, 117]`, because the rules compare the values as recorded: one rule each for lower and higher, where negating lower-is-better scores would have saved three rules and shown `-62 > -117`.

**Alternatives considered.**

- Every run of the version beats every run of every earlier version. A score with a ceiling can never improve once any run reaches it. In the loop over the research skill, the baseline's two runs passed 17 and 23 of 23 checks; the next versions were sure to give 22 and then 23, and this rule called both changes misses because of the baseline's one lucky 23.
- Compare the mean of each version's runs. With the few runs an agent makes, a mean moves with every run, so an improvement inside the noise gets claimed, and stopping once the mean is ahead is the easiest way to claim one.
- An improvement must clear a margin the score declares. A margin is a number the agent picks, and a wrong one either hides real improvements or admits noise; the runs themselves show how far a score moves.
- Compare one run with one run, as autoresearch does. It is the same rule when each version has one run, and ignores the others when a version has more.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `score-improvement`: `worst-run-beats-best-sure`. "A version improves a score when its worst run beats the best that the versions which appeared before it were sure to give"
- Holds when Lion is run: `reasoning-why-improvement` is `runs-and-check`. "`why` on an improvement ends in the runs it compared and a check such as `["number/lessThan", 62, 117]`"
- Stated, not checked by running Lion: decided `score-direction`: `rule-per-direction`. "one rule each for lower and higher, where negating lower-is-better scores would have saved three rules and shown `-62 > -117`"
- Stated, not checked by running Lion: `reasoning-experiment-loop` exists. "The reasoning skill now keeps the record of an experiment loop"
- Broken: Lion does otherwise: rule `score-improves-past-noise` holds. "A version improves a score when its worst run beats the best that any earlier version was sure to give"
- Holds when Lion is run: `reasoning-score-sure-to-give` is `worst-run`. "what the version is sure to give is its worst run"
- Holds when Lion is run: `reasoning-score-best` is `best-sure-to-give-across-versions`. "The best a score has been is the best of those across versions."
- Holds when Lion is run: `reasoning-score-one-run-each` is `beats-best-so-far`. "With one run each this is beating the best so far."
- Holds when Lion is run: `reasoning-score-runs-differ` is `spread-not-dispute`. "Runs of a score that differ are its spread, so `disputed` leaves scores out."
- Holds when Lion is run: `reasoning-current-runs-all-worse-than-best` is `regressed`. "The files as they are now have regressed when every run on them is worse than the best."
- Broken: Lion does otherwise: `reasoning-improvement-after-better-earlier-run` is `taken-back`. "another run of an earlier version can only raise what came before, which takes an improvement back"
- Holds when Lion is run: `reasoning-runs-per-version` is `same-number`. "The skill asks for the same number of runs on each version"

<a id="score-improvement"></a>

## score-improvement

Now: `worst-run-beats-best-sure`.

- 2026-11-15 `score-improvement`: `worst-run-beats-best-sure` over `every-run-beats-every-run`, `mean-of-runs`, `declared-margin`, `one-run-against-one-run`: "A version improves a score when its worst run beats the best that the versions which appeared before it were sure to give" (`score-improves-past-noise.json`)

<a id="score-requirements"></a>

## score-requirements

Now: `requires-list`.

- 2026-11-15 `score-requirements`: `requires-list` over `requirement-as-belief`, `agent-discards-broken-versions`: "A score can list `requires`: questions and the answers a version must have, such as no failing tests." (`score-requirements.json`)

<a id="score-requirements"></a>

### A version's runs of a score count only where what the score requires holds

Recorded 2026-11-15 in `history/notes/score-requirements.json`.

**Context.** An experiment loop that keeps whatever scores best keeps the change that makes a benchmark fast by breaking what it measures. In the skill's own trial, an early exit cut a sort's comparisons from 117 to 27 and failed a test. The reasoning skill already had beliefs, but a belief is judged from the version it was formed in on and stays contradicted once contradicted, which is the wrong rule for a condition each version must meet on its own.

**Decision.** A score can list `requires`: questions and the answers a version must have, such as no failing tests. Where one is unanswered, or answered otherwise in any run, the version has no score: no range, no best, no improvement. `unmet(version, score, question, needed)` lists such versions.

**Consequences.** A requirement has to be run on each version, as the score is, so a change is not kept until both have run on it. The skill tells the agent to fix or drop such a change and never to relax the requirement to let a score count.

**Alternatives considered.**

- Record the requirement as a belief. A belief contradicted in one version stays contradicted, so one broken experiment would mark every later version.
- Leave it to the agent to discard broken versions. An unwritten check is the one that gets skipped, and the record would still call the broken version the best.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `score-requirements`: `requires-list`. "A score can list `requires`: questions and the answers a version must have, such as no failing tests."
- Holds when Lion is run: rule `score-requirements` holds. "A version's runs of a score count only where what the score requires holds"
- Holds when Lion is run: `reasoning-score-requirement-unmet` is `no-score`. "Where one is unanswered, or answered otherwise in any run, the version has no score: no range, no best, no improvement."
- Stated, not checked by running Lion: `reasoning-score-requires` exists. "A score can list `requires`"
- Stated, not checked by running Lion: `reasoning-unmet` exists. "`unmet(version, score, question, needed)` lists such versions."
- Holds when Lion is run: `reasoning-change-before-requirement-run` is `not-kept`. "a change is not kept until both have run on it"
- Holds when Lion is run: `reasoning-change-failing-requirement` is `fixed-or-dropped`. "The skill tells the agent to fix or drop such a change and never to relax the requirement to let a score count."
- Holds when Lion is run: rule `beliefs-judged-from-their-version` holds. "a belief is judged from the version it was formed in on and stays contradicted once contradicted"

<a id="development-page"></a>

## development-page

Now: `changelog-timeline`.

- 2026-11-16 `development-page`: `changelog-timeline` over `research-explorer`: "The website's changelog timeline is the one page that shows all of it" (`one-record-of-claims.json`)

<a id="failed-feature-probe"></a>

## failed-feature-probe

Now: `reported`.

- 2026-11-16 `failed-feature-probe`: `reported` over `answers-false`: "A feature's probe that gives neither has answered nothing, and the build reports it" (`probes-observe-the-repository.json`)

<a id="probes-observe-the-repository"></a>

### A probe can read the repository, run a declared command, and answer for a feature

Recorded 2026-11-16 in `history/notes/probes-observe-the-repository.json`.

**Context.** A decision record's assertions are checked against Lion at HEAD where a probe runs the case, and are only stated otherwise. A probe was a Lion program run with the standard library alone, and Lion's library reads no file and runs no command, so a probe could show how Lion evaluates and nothing else. Most of what the project decides is not about evaluation: which version of Effect it uses, what the pre-commit hook and CI run, whether every library function has an example in the docs. Those assertions could never hold or be broken, however wrong they became.

**Decision.** The host that runs the probes gives each probe's program functions beside the standard library. `["repo/files", path]` gives the paths of the files under a folder of the repository, `["repo/read", path]` gives the text of a file of the repository, `["repo/json", path]` gives a JSON file as a value, and `["repo/run", name]` runs a command that `history/research/commands.json` declares and gives its exit code and what it wrote, as `{"exit", "output"}`. `["lion/special-form?", name]` says whether Lion has a special form of that name, since a special form is not a value a program can ask about. A path that leads out of the repository, a path that names no file, and a command the file does not declare each fail, and a probe that fails is the behavior `error`, as before; `repo/files` gives no paths for a path that names nothing, so a probe can say that a file is gone. A declared command is the words of one command line, with no shell between them, and it runs once in a build, however many probes ask for it. A command that needs more than a line is a script in `packages/history/commands/` that the line runs. A probe answers one question, as a claim does: a behavior's probe gives the word for its case, and a feature's probe gives true when the feature is there and false when it is not. A feature's probe that gives neither has answered nothing, and the build reports it, with any question two probes answer. What a probe sees is recorded as a claim of Lion at HEAD, like any other observation, so the rules that check an assertion did not change.

**Consequences.** A decision about how the project is set up is checked the way a decision about Lion's behavior is. With probes for three records, on Effect 4, on the quality gates, and on examples in the docs, thirteen assertions that were only stated held when the repository was read. With probes of features, 101 more hold in 34 records: that a library function, a special form, a module, a package, a command, an option, a file, a page, an error, or a tool is there, or is gone. With probes of behaviors, 183 more hold in 42 records, 153 behaviors and 30 rules, and every record has an assertion that is checked. The probes also showed where the record was wrong. A claim that a recursive rule's head variables come from facts had been replaced by weak acyclicity and now reads as replaced; a sentence about what another run of an earlier version does to an improvement is not what the reasoning skill's rules give, and waits for a decision among the known findings; and a comment that described how beliefs used to be judged was corrected. Lion still evaluates in memory: the functions belong to the host of the probes, not to the library, and a Lion program run anywhere else does not have them. Adding a command a probe may run is a change to one file that lists every such command. Many probes search a file's text for the words that declare a thing, so a thing declared in other words reads as missing, and a step of the hook or of CI moved into a script the file calls does too. A build runs each declared command, so a slow command makes every `bun run history check` slower; the one declared now, the check of the docs, takes under a second.

**Alternatives considered.**

- Add functions that read files and run commands to the standard library. A Lion program must be able to be evaluated entirely in memory, and a library function is in every program. A host function is in the programs of the host that gives it.
- Let a probe run any shell command. A record of decisions would then run whatever its newest entry says, on every check and in CI. Declared commands keep what may run in one file, as command lines no shell reads.
- Call the functions inside the model's rules instead of recording what a probe saw. A rule that reads a file gives a different answer when the file changes, so the saved model would no longer be what `bun run history ask` answers from, and `why` could not show what was seen.
- Keep such assertions as stated. That leaves most decisions unchecked: 526 of 707 assertions were only stated.
- Give a failed probe of a feature the answer false. A probe with a mistake in it would then say that the feature is gone, and a record that asserts it is gone would hold for the wrong reason. A probe of a behavior that fails gives `error`, a word no record asserts by accident.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `probe-reach`: `lion-and-repository`. "The host that runs the probes gives each probe's program functions beside the standard library"
- Holds when Lion is run: `probe-lists-missing-path` is `none`. "`repo/files` gives no paths for a path that names nothing"
- Holds when Lion is run: `probe-asks-special-form` is `told`. "`["lion/special-form?", name]` says whether Lion has a special form of that name"
- Stated, not checked by running Lion: decided `probe-questions`: `behaviors-and-features`. "a feature's probe gives true when the feature is there and false when it is not"
- Stated, not checked by running Lion: decided `failed-feature-probe`: `reported`. "A feature's probe that gives neither has answered nothing, and the build reports it"
- Stated, not checked by running Lion: `probe-command-scripts` exists. "A command that needs more than a line is a script in `packages/history/commands/` that the line runs"
- Holds when Lion is run: rule `probes-observe-repository` holds. "A decision about how the project is set up is checked the way a decision about Lion's behavior is"
- Holds when Lion is run: `probe-reads-repository-file` is `text`. "`["repo/read", path]` gives the text of a file of the repository"
- Holds when Lion is run: `probe-reads-json-file` is `value`. "`["repo/json", path]` gives a JSON file as a value"
- Holds when Lion is run: `probe-runs-declared-command` is `exit-and-output`. "runs a command that `history/research/commands.json` declares and gives its exit code and what it wrote"
- Holds when Lion is run: `probe-path-outside-repository` is `error`. "A path that leads out of the repository, a path that names no file, and a command the file does not declare each fail"
- Holds when Lion is run: `probe-runs-undeclared-command` is `error`. "A path that leads out of the repository, a path that names no file, and a command the file does not declare each fail"
- Stated, not checked by running Lion: rule `in-memory-evaluation` holds. "the functions belong to the host of the probes, not to the library"
- Holds when Lion is run: `probe-lists-repository-files` is `paths`. "`["repo/files", path]` gives the paths of the files under a folder of the repository"

<a id="probe-questions"></a>

## probe-questions

Now: `behaviors-and-features`.

- 2026-11-16 `probe-questions`: `behaviors-and-features` over `behaviors-only`: "a feature's probe gives true when the feature is there and false when it is not" (`probes-observe-the-repository.json`)

<a id="probe-reach"></a>

## probe-reach

Now: `lion-and-repository`.

- 2026-11-16 `probe-reach`: `lion-and-repository` over `lion-only`, `any-shell-command`, `library-functions`: "The host that runs the probes gives each probe's program functions beside the standard library" (`probes-observe-the-repository.json`)

<a id="answers-of-a-rule-body"></a>

## answers-of-a-rule-body

Now: `batches`.

- 2026-11-16 `answers-of-a-rule-body`: `batches` over `every-answer-at-once`, `one-answer-at-a-time`: "A rule body hands its answers on a batch at a time" (`derived-rows-follow-changes.json`)

<a id="derived-rows-follow-changes"></a>

### What a database derived follows a change to its facts

Recorded 2026-11-16 in `history/notes/derived-rows-follow-changes.json`.

**Context.** Every change to facts forgot everything the database had derived, so the next query derived it again from nothing. On a database of one million facts, adding one fact and asking every group's total again took 1.6 seconds, each time, and asking which rows a rule with `not` gives took 1.1 seconds; an agent that keeps a model of its work, or a research model that grows by one source at a time, paid for the whole model on every step. A `fact` or `retract` form also copied every relation it wrote to whenever the database held an invariant, a relation's `schema` among them, so that it could be undone: loading 100,000 facts one form at a time into a relation with a schema did not finish in a minute, where it takes half a second without the schema. And a rule body built the list of every answer of each goal before the next goal ran, so deriving 4.5 million paths held 9.2 gigabytes at its peak. The benchmarks time one size, 20,000 facts at most, and showed none of it.

**Decision.** A database keeps what it derived when facts change, and follows the change through it, a group of relations at a time in the order they depend on each other. A changed row reaches every row that an answer using it gave or would give; the rows it reaches are taken out and derived again from the facts as they now are, and new rows go through the rules in rounds. An answer uses a row that one of its relation goals matched, and a row that a relation goal under `not` matches; an aggregated row is reached through its group, which is combined again from its matches. A relation whose rules ask about a changed relation any other way, in a `find` or as a value, that rules invent rows of, whose aggregate recurses, or whose rules hold a function from the host, is forgotten with every relation that reads it and derived again when something next reads it. A change is undone by taking back each row it added or removed, in place, instead of copying the relation first. A rule body hands its answers on a batch at a time, so it holds a few batches however many answers it has, and a row a rule derives joins its relation once the body has run. A model keeps the answer that derived each row as a list of the values of the rule's variables. A failed assertion shows as its example the first answer in sort order.

**Consequences.** A change costs what it reaches, not what the database holds: at one million facts, adding a fact and asking every group's total again takes 23 milliseconds instead of 1.6 seconds, and loading facts one form at a time into a relation with a schema grows as the facts do. Deriving 4.5 million paths holds 2.1 gigabytes at its peak instead of 9.2. What the database has derived still never changes an answer, but it changes the order answers are found in: rows a change derives again come after the rows that stayed, so answer order now depends on the changes a database has seen, and `"order"` is the way to fix it. The example in an assertion's message would have depended on that order, which is why it is now the first answer in sort order. `why` explains a row by an answer that gives it from rows that hold; which answer that is can differ from the one a database that derived nothing before would show, when several give the row. A change an invariant refuses forgets what was derived, so the query after a refused change derives again. The first time a relation is read it is still derived in full. The engine is 832 lines larger, 8.6 percent: 10,472 lines of code where it had 9,640.

**Alternatives considered.**

- Forget only the relations that read what changed. The relation that read the changed row is still derived again in full, so a change to a large relation still costs the whole relation: it helps only a change to facts that no large rule reads.
- Count the answers that give each row, and remove a row when its count reaches zero. Counts cannot tell a row that recursion supports through itself from one that still holds, and a count for every row is more memory where memory is what limits a database.
- Keep every group's matches, to change an aggregate by one match. It keeps every match of every aggregate for as long as the database lives. Combining a reached group again from its matches reads only that group, through an index, and keeps nothing.
- Undo the upkeep when an invariant refuses a change. It needs a log of every row and every derivation the upkeep touched. A refused change is the rare case, and forgetting what was derived is always right.
- Keep rows on disk, or stream facts through without holding them. A Lion program is evaluated entirely in memory. Recursion needs the rows it has derived to know when to stop, an aggregate needs its group, and `not` needs every row of what it asks about, so only what a rule body holds while it runs can be streamed, and that is what batches do.
- Hand on one answer at a time. Each answer would pay for the machinery that runs a goal, which a batch pays once. Batches hold as little as matters, and keep the order answers are found in.

**What it asserts, checked.**

- Holds when Lion is run: rule `derived-rows-follow-fact-changes` holds. "A database keeps what it derived when facts change, and follows the change through it"
- Replaced by a later word: `derived-rows-after-refused-change` is `derived-again`. "A change an invariant refuses forgets what was derived"
- Stated, not checked by running Lion: `million-facts-change-then-every-group-total-ms` is 23. "adding a fact and asking every group's total again takes 23 milliseconds instead of 1.6 seconds"
- Stated, not checked by running Lion: `million-nodes-every-path-peak-mb` is 2146. "Deriving 4.5 million paths holds 2.1 gigabytes at its peak instead of 9.2"
- Stated, not checked by running Lion: `core-code-lines` is 10472. "The engine is 832 lines larger, 8.6 percent: 10,472 lines of code where it had 9,640"
- Stated, not checked by running Lion: decided `derived-rows-on-fact-change`: `follow-the-change`. "A database keeps what it derived when facts change, and follows the change through it"
- Holds when Lion is run: `derived-rows-after-fact-change` is `followed`. "A changed row reaches every row that an answer using it gave or would give"
- Stated, not checked by running Lion: decided `undoing-a-change-to-facts`: `take-back-each-row`. "A change is undone by taking back each row it added or removed, in place, instead of copying the relation first"
- Stated, not checked by running Lion: decided `answers-of-a-rule-body`: `batches`. "A rule body hands its answers on a batch at a time"
- Stated, not checked by running Lion: decided `assertion-example-answer`: `first-in-sort-order`. "A failed assertion shows as its example the first answer in sort order"
- Stated, not checked by running Lion: `assertion-example-answer` is `first-in-sort-order`. "A failed assertion shows as its example the first answer in sort order"
- Stated, not checked by running Lion: `answer-order-after-fact-changes` is `depends-on-changes`. "so answer order now depends on the changes a database has seen"
- Holds when Lion is run: `derived-rows-present-vs-absent-answers` is `same`. "What the database has derived still never changes an answer"

<a id="assertion-example-answer"></a>

## assertion-example-answer

Now: `first-in-sort-order`.

- 2026-11-16 `assertion-example-answer`: `first-in-sort-order` over `first-found`: "A failed assertion shows as its example the first answer in sort order" (`derived-rows-follow-changes.json`)

<a id="derived-rows-on-fact-change"></a>

## derived-rows-on-fact-change

Now: `follow-the-change`.

- 2026-11-16 `derived-rows-on-fact-change`: `follow-the-change` over `forget-everything`, `forget-readers-of-what-changed`, `count-answers-per-row`: "A database keeps what it derived when facts change, and follows the change through it" (`derived-rows-follow-changes.json`)

<a id="undoing-a-change-to-facts"></a>

## undoing-a-change-to-facts

Now: `take-back-each-row`.

- 2026-11-16 `undoing-a-change-to-facts`: `take-back-each-row` over `copy-the-relation`: "A change is undone by taking back each row it added or removed, in place, instead of copying the relation first" (`derived-rows-follow-changes.json`)

<a id="derived-rows-on-refused-change"></a>

## derived-rows-on-refused-change

Now: `follow-back`.

- 2026-11-17 `derived-rows-on-refused-change`: `follow-back` over `forget-everything`, `log-the-upkeep`: "A change an invariant refuses is followed back" (`every-change-is-followed.json`)

<a id="every-change-is-followed"></a>

### Every change is followed, and a relation that cannot be followed is derived again on its own

Recorded 2026-11-17 in `history/notes/every-change-is-followed.json`.

**Context.** A change to facts was followed through relation goals, goals under `not`, and aggregates. Everything else fell back to forgetting. A relation whose rule asked about a changed relation in a `find` or as a value, a relation that rules invent rows of, an aggregate that recurses, and a relation whose rule holds a function from the host were forgotten with every relation that read them. So was everything the database had derived after a `rule` form, after a change an invariant refused, and for every goal-directed query. With one million facts, adding a fact and asking a count that can be zero, the documented way to count with a `find`, took 0.26 seconds each time, and a fact an invariant refused cost 2.7 seconds, to derive again what the refusal had not changed; with 100,000 roads, adding a road and asking every shortest distance took 0.7 seconds. The mutation check rewrote the working tree while its tests ran, so nothing could be edited during it.

**Decision.** A relation goal is followed wherever it stands in a rule: in its body, under `not`, in a `find`, in a goal used as a value, or in its head. A changed row is matched against the goal with the rest of the rule's body beside it, without the tests that ask a question, so every answer the row is part of is found. A row is named by the head values that ask nothing, so a row whose other values a `find` or an aggregate gave is reached through those. An aggregate that recurses goes on from the row a group has, since its value moves one way, and only a group a lost row reached starts over. A rule that invents is followed where it invents alone, into a relation with no key: a fact of its relation is then a row its answers use. A relation that cannot be followed is derived again and compared with what it was, when something has read it since the last change; then the relations that read it are followed. One nobody has read since is forgotten until something reads it. A `rule` form derives again the relations whose rules changed and keeps the rows of every other. A change an invariant refuses is followed back. A goal-directed query keeps what it derived and follows changes, for up to 32 queries. The mutation check breaks copies of the working tree, four at a time.

**Consequences.** At one million facts, adding a fact and asking a count that can be zero takes 13 milliseconds instead of 0.26 seconds, and a fact an invariant refused costs 0.23 seconds instead of 2.7, which is the time to give the 490,000 answers asked for afterwards. With 100,000 roads, adding a road and asking every shortest distance takes 15 milliseconds instead of 0.7 seconds, and with 100,000 facts, adding a fact and asking a rule that invents takes 70 milliseconds instead of a second. A relation that cannot be followed is one that rules invent rows of into a relation with a key or beside other rules, one whose rule holds a function from the host, or one whose rule reads a changed relation through a schema; it costs its own derivation at each change that touches it, once it was read, and nothing when nobody reads between changes. The message of a refused change is made from the answers that use a new row, which are all the invariant has. Deriving again happens when the change is made, so a rule that fails on the new facts fails then; what was derived is then forgotten, and the next reader is the one it fails, as before. The engine is 706 lines larger: 11,178 lines of code where it had 10,472.

**Alternatives considered.**

- Forget what cannot be followed, with everything that reads it. It is what the database did. One rule with a `find` or a host function made every relation that read it start over at each change.
- Always derive again what cannot be followed. Loading facts one form at a time would derive such a relation again for each form, though nobody reads it between them. Deriving it again only once it was read costs at most one derivation nobody asked for.
- Follow a rule that invents in every case. What a rule invents depends on what holds when it runs: rules invent all at once, round by round, and a key can make an unknown one with a value. Where a rule invents beside other rules or into a keyed relation, the rows a change would give depend on the order things were invented in, and only deriving again gives the rows a database that derived nothing would give.
- Run mutations in the working tree, and stop editing while they run. A change to the engine has a hundred mutations to run, and nothing could be done meanwhile. A copy for each job also lets several run at once.

**What it asserts, checked.**

- Stated, not checked by running Lion: `find-over-changed-relation-after-change` is `followed`. "A relation goal is followed wherever it stands in a rule: in its body, under `not`, in a `find`, in a goal used as a value, or in its head"
- Stated, not checked by running Lion: `goal-directed-rows-after-fact-change` is `followed`. "A goal-directed query keeps what it derived and follows changes, for up to 32 queries"
- Stated, not checked by running Lion: decided `where-mutations-run`: `copies-of-the-working-tree`. "The mutation check breaks copies of the working tree, four at a time"
- Stated, not checked by running Lion: `core-code-lines` is 11178. "The engine is 706 lines larger: 11,178 lines of code where it had 10,472"
- Stated, not checked by running Lion: `million-facts-change-then-count-with-zeros-ms` is 13. "adding a fact and asking a count that can be zero takes 13 milliseconds instead of 0.26 seconds"
- Stated, not checked by running Lion: `hundred-thousand-roads-change-then-distances-ms` is 15. "adding a road and asking every shortest distance takes 15 milliseconds instead of 0.7 seconds"
- Stated, not checked by running Lion: `million-facts-refused-change-then-every-row-ms` is 230. "a fact an invariant refused costs 0.23 seconds instead of 2.7"
- Stated, not checked by running Lion: `recursive-aggregate-after-fact-change` is `followed`. "An aggregate that recurses goes on from the row a group has"
- Replaced by a later word: decided `rule-that-invents-on-change`: `follow-where-it-invents-alone`. "A rule that invents is followed where it invents alone, into a relation with no key"
- Holds when Lion is run: rule `unfollowed-relations-derived-again` holds. "A relation that cannot be followed is derived again and compared with what it was, when something has read it since the last change; then the relations that read it are followed"
- Stated, not checked by running Lion: decided `unfollowable-relation-on-change`: `derive-again-and-compare-once-read`. "A relation that cannot be followed is derived again and compared with what it was, when something has read it since the last change; then the relations that read it are followed"
- Stated, not checked by running Lion: decided `derived-rows-on-rule-change`: `derive-again-what-changed`. "A `rule` form derives again the relations whose rules changed and keeps the rows of every other"
- Stated, not checked by running Lion: `derived-rows-after-rule-change` is `kept-where-rules-did-not-change`. "A `rule` form derives again the relations whose rules changed and keeps the rows of every other"
- Stated, not checked by running Lion: decided `derived-rows-on-refused-change`: `follow-back`. "A change an invariant refuses is followed back"
- Stated, not checked by running Lion: `derived-rows-after-refused-change` is `kept`. "A change an invariant refuses is followed back"

<a id="derived-rows-on-rule-change"></a>

## derived-rows-on-rule-change

Now: `derive-again-what-changed`.

- 2026-11-17 `derived-rows-on-rule-change`: `derive-again-what-changed` over `forget-everything`: "A `rule` form derives again the relations whose rules changed and keeps the rows of every other" (`every-change-is-followed.json`)

<a id="rule-that-invents-on-change"></a>

## rule-that-invents-on-change

Now: `weighted-rows`.

- 2026-11-17 `rule-that-invents-on-change`: `follow-where-it-invents-alone` over `follow-every-case`, `derive-again-every-case`: "A rule that invents is followed where it invents alone, into a relation with no key" (`every-change-is-followed.json`)
- 2026-11-18 `rule-that-invents-on-change`: `follow-a-component-at-a-time` over `follow-where-it-invents-alone`, `derive-again-every-case`, `track-rounds-per-row`, `skolem-for-keyed-relations`, `weighted-rows`: "A group whose rules invent into a relation with a key or beside other rules, or make values one, is followed a component of values at a time" (`follow-a-component-at-a-time.json`)
- 2026-11-19 `rule-that-invents-on-change`: `weighted-rows` over `follow-a-component-at-a-time`, `derive-again-every-case`, `skolem-for-keyed-relations`, was `follow-where-it-invents-alone`: "The answers of a rule that invents are rows of a relation of their own, and each is asked at the end of the stage it is first held in whether a row held by then gives its head." (`rows-carry-weights.json`)

<a id="follow-a-component-at-a-time"></a>

### A group whose rules invent or make values one follows a change a component of values at a time

Recorded 2026-11-18 in `history/notes/follow-a-component-at-a-time.json`.

**Context.** A change to facts was followed row by row through every relation except a few, which were derived again in full and compared. Among them was a relation that rules invent rows of when it has a key or other rules beside them, and a group with an equality rule: there, the rows a change gives seemed to depend on the order things were invented in and made one, so the decision every-change-is-followed derived such a group again. That cost grew with the whole group: giving one more person a mother in a program where a key makes twins share one took 34 milliseconds with 1,000 people and 622 with 16,000. Since 91f41a5, the value a class of values made one keeps depends only on the class, so a group's rows no longer depend on the order its values were made one.

**Decision.** A group whose rules invent into a relation with a key or beside other rules, or make values one, is followed a component of values at a time when each argument of its rules' relation goals is a variable or a value, the goals of each rule share variables, and nothing else in their bodies asks a question. A change reaches the values its rows hold, and every value a row of the group, or a row its goals read, joins to them. That component is derived again beside the model, from its own rows alone, by the same rounds the group is derived in, and its rows replace the ones it had. A group whose rules join rows some other way is still derived again and compared.

**Consequences.** An answer of such a rule combines only rows that share values, and so do the checks of rules that invent, keys, and equality rules, so the group's rows are what each component derives on its own: a database that followed a change answers as one that derived nothing. Giving one more person a mother where a key makes twins share one takes under a millisecond whatever the number of people. The first change builds an index of each relation by the columns its goals join through, once, which costs a look at every row. A rule with a pattern, a computed value, or a question in its body, or with goals that share no variable, still makes its group derived again.

**Alternatives considered.**

- Keep deriving such a group again in full. A change costs the whole group, which is what following changes is for avoiding.
- Keep, for every row, the round of inventions it first held in, and follow a change round by round. It keeps more for every row and needs every round followed in order; deriving the one component the change touched gives the same rows with what Lion already has.
- Invent for every answer, even where the head holds, and let keys make the extra unknowns one. It changes which unknown names a class of values in some programs, which a program can see.
- Rewrite how changes are followed around rows that carry counts, as DBSP does. It reverses derived-rows-follow-changes, which chose not to keep a count for every row, and it would replace the engine before it removed a single special case.

**What it asserts, checked.**

- Replaced by a later word: decided `rule-that-invents-on-change`: `follow-a-component-at-a-time`. "A group whose rules invent into a relation with a key or beside other rules, or make values one, is followed a component of values at a time"
- Stated, not checked by running Lion: `keyed-invention-after-fact-change` is `followed`. "A group whose rules invent into a relation with a key or beside other rules, or make values one, is followed a component of values at a time"
- Stated, not checked by running Lion: `equality-rule-group-after-fact-change` is `followed`. "A group whose rules invent into a relation with a key or beside other rules, or make values one, is followed a component of values at a time"
- Holds when Lion is run: rule `unfollowed-relations-derived-again` holds. "A group whose rules join rows some other way is still derived again and compared."

<a id="rows-carry-weights"></a>

### Rows carry weights and the time they hold, and every change is a change to candidates

Recorded 2026-11-19 in `history/notes/rows-carry-weights.json`.

**Context.** A change to facts was followed by taking out every row that an answer using a changed row gave, and deriving those rows again. An aggregated row was combined again from all its matches, a rule that invents alone had a way of its own, and a group whose rules invent into a keyed relation or make values one was followed a component of values at a time, and only where its rules join rows through shared variables. Any other such group was derived again in full. Deriving from nothing was a procedure of its own, with one pass for rows, one for aggregates, and one for rules that invent. The research into what to improve next proposed one algebra instead: rows with integer weights, where a change adds and takes away candidates. It left one part open, since no source showed it for rules that invent. Two decisions had not taken it. derived-rows-follow-changes said counts cannot tell a row that recursion supports through itself from one that still holds. follow-a-component-at-a-time said weighted rows would replace the engine before they removed a special case.

**Decision.** Every derived row has a weight: the number of its candidates, each a fact or an answer of a rule's body that gives the row, and the row holds while its weight is above zero. Time is a column of the same rows: a candidate has a level, one above the highest level of the rows of its own group that its answer used, and a row is held from the least level one of its candidates has. A change to facts takes away the candidates that used a row a relation lost and adds the ones that use a row a relation gained, and the levels are settled lowest first. Deriving a group from nothing is the same work, for a change that adds every fact. The answers of a rule that invents are rows of a relation of their own, and each is asked at the end of the stage it is first held in whether a row held by then gives its head. Two values a key or an equality rule makes one are a pair, which is a row with candidates too, and a row that holds a value its class no longer writes ends at the level the pair is held from, is kept beside the rows that hold, and gives the row it became a candidate. An aggregate keeps the values of its candidates counted, and where it recurses a better value ends the row before it. A sum or a mean of numbers that are not all whole is added up in sort order. A fact that holds an unknown is followed through every group that invents, and every invariant is asked after it.

**Consequences.** Every group of relations is followed row by row, whatever its rules look like, except the two kinds whose reads are not known: one whose rule holds a function from the host, and one whose rule reads a changed relation through a schema. A group whose rules invent or make values one is no longer derived again, a component at a time or in full. With 100,000 people, giving one more pair of twins a mother a key makes one takes 9 milliseconds for 20 changes where it took 77, and no longer grows with the people. Adding a fact and asking one group's total takes 5 milliseconds for 20 changes where it took 17. Whether a row holds has many solutions when rows give each other, and the level it is held from has one, so a database that followed changes keeps for every row the very level and weights a database that derived nothing yet works out, which a property now checks. Deriving from nothing is slower: every path on a chain of 150 runs at 0.8 times the speed, shortest distances by an aggregate that recurses at 0.6, and 2,500 pairs of twins whose mothers a key makes one at 0.7. A rule that asks about a relation that changed is counted as things were and as they are, so asking a count that can be zero after a change runs at 0.7 times the speed. Building the model of this repository's history takes 31 seconds where it took 26. A database keeps more: for each derived row its candidates by level, and in a group that makes values one the rows that ended. After deriving every path among 100,000 nodes it holds 360 megabytes where it held 237, and after the twins 704 where it held 133. The engine is 832 lines larger, 6.3 percent: 14,083 lines of code where it had 13,251, with 47 more functions. The nine ways of deriving and following became one, and it is longer than the nine. A sum of numbers that are not whole can differ in its last digits from what it was, and no longer depends on the order facts were added in. A change that adds a fact which holds an unknown is refused where an equality rule would be broken, as a database that held the fact from the start refuses the rule.

**Alternatives considered.**

- Keep taking out what a change reaches and deriving it again. It takes out rows that still hold wherever rules recurse, needs a way of its own for each kind of rule, and could follow a group that invents only where its rules join rows through shared variables.
- Weights alone, with no level. Two rows that give each other keep each other's weight above zero when the fact under them goes.
- Keep every round's changes in a trace beside the rows, as DBSP does. The round is one number on a row and a count for each level, which is aggregate/min over a column, kept by counted candidates as every min is. A trace is a second store for what the rows can hold.
- Derive the component a change touches again. It is right only where an answer combines rows that share values, so a pattern, a computed value, a question, or goals that share no variable made the whole group derived again.
- Invent for every answer, and let keys make the extra unknowns one. It changes which unknown names a class of values in some programs, which a program can see.
- Add up a sum in the order its matches are found. The order depends on the order facts were added in and on the changes a database has seen, and counted candidates have no order.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `following-a-change-to-facts`: `candidates-by-level`. "Every derived row has a weight: the number of its candidates, each a fact or an answer of a rule's body that gives the row, and the row holds while its weight is above zero."
- Holds when Lion is run: `fact-holding-unknown-after-change` is `followed`. "A fact that holds an unknown is followed through every group that invents, and every invariant is asked after it."
- Stated, not checked by running Lion: `hundred-thousand-people-twenty-twins-then-mother-ms` is 9. "With 100,000 people, giving one more pair of twins a mother a key makes one takes 9 milliseconds for 20 changes where it took 77"
- Stated, not checked by running Lion: `hundred-thousand-facts-twenty-changes-then-one-total-ms` is 5. "Adding a fact and asking one group's total takes 5 milliseconds for 20 changes where it took 17"
- Stated, not checked by running Lion: `history-model-build-s` is 31. "Building the model of this repository's history takes 31 seconds where it took 26"
- Stated, not checked by running Lion: decided `rule-that-invents-on-change`: `weighted-rows`. "The answers of a rule that invents are rows of a relation of their own, and each is asked at the end of the stage it is first held in whether a row held by then gives its head."
- Stated, not checked by running Lion: decided `order-a-rule-head-sum-adds-in`: `sort-order`. "A sum or a mean of numbers that are not all whole is added up in sort order."
- Stated, not checked by running Lion: `keyed-invention-after-fact-change` is `followed`. "Every group of relations is followed row by row, whatever its rules look like, except the two kinds whose reads are not known: one whose rule holds a function from the host, and one whose rule reads a changed relation through a schema."
- Stated, not checked by running Lion: `equality-rule-group-after-fact-change` is `followed`. "Every group of relations is followed row by row, whatever its rules look like, except the two kinds whose reads are not known: one whose rule holds a function from the host, and one whose rule reads a changed relation through a schema."
- Stated, not checked by running Lion: `invention-joined-otherwise-after-fact-change` is `followed`. "Every group of relations is followed row by row, whatever its rules look like, except the two kinds whose reads are not known: one whose rule holds a function from the host, and one whose rule reads a changed relation through a schema."
- Holds when Lion is run: rule `unfollowed-relations-derived-again` holds. "Every group of relations is followed row by row, whatever its rules look like, except the two kinds whose reads are not known: one whose rule holds a function from the host, and one whose rule reads a changed relation through a schema."
- Holds when Lion is run: `merged-unknowns-after-retract` is `apart-again`. "Two values a key or an equality rule makes one are a pair, which is a row with candidates too, and a row that holds a value its class no longer writes ends at the level the pair is held from, is kept beside the rows that hold, and gives the row it became a candidate."
- Holds when Lion is run: `rule-head-sum-of-fractions` is `added-in-sort-order`. "A sum or a mean of numbers that are not all whole is added up in sort order."

<a id="unfollowable-relation-on-change"></a>

## unfollowable-relation-on-change

Now: `derive-again-and-compare-once-read`.

- 2026-11-17 `unfollowable-relation-on-change`: `derive-again-and-compare-once-read` over `forget-with-readers`, `always-derive-again`: "A relation that cannot be followed is derived again and compared with what it was, when something has read it since the last change; then the relations that read it are followed" (`every-change-is-followed.json`)

<a id="where-mutations-run"></a>

## where-mutations-run

Now: `copies-of-the-working-tree`.

- 2026-11-17 `where-mutations-run`: `copies-of-the-working-tree` over `the-working-tree`: "The mutation check breaks copies of the working tree, four at a time" (`every-change-is-followed.json`)

<a id="agent-instructions-layout"></a>

## agent-instructions-layout

Now: `index-with-guidelines`.

- 2026-11-17 `agent-instructions-layout`: `index-with-guidelines` over `one-file`, `imported-guidelines`: "`AGENTS.md` names every one with its main rule and when to read it" (`guidelines-folder.json`)

<a id="guidelines-folder"></a>

### AGENTS.md is a short index, and what each practice needs beyond its main rule is a guideline in `guidelines/`

Recorded 2026-11-17 in `history/notes/guidelines-folder.json`.

**Context.** `AGENTS.md` had grown to 533 lines, 510 of them before the documentation procedure was written into it: the goals, how to design a feature, the documentation procedure, the project record, the measuring tools, the testing rules, and code style with its Effect and React patterns. `CLAUDE.md` imports it, so an agent read all of it at the start of every task, whatever the task was, and a rule that mattered for the work at hand stood among hundreds of lines that did not.

**Decision.** `AGENTS.md` and `CLAUDE.md` stay under 200 lines each. `AGENTS.md` holds what every task needs: what Lion is, the goals of every change, the commands, the steps before a commit, and the completion proof. Each practice has a guideline in `guidelines/`, and `AGENTS.md` names every one with its main rule and when to read it. An agent reads a guideline in full before the work it covers.

**Consequences.** `AGENTS.md` went from 533 lines to 127. Its sections moved word for word into `guidelines/designing-features.md`, `documentation.md`, `recording-changes.md`, `measuring.md`, `testing.md`, `code-style.md`, and `patterns.md`, and `CLAUDE.md` names those files where it named sections of `AGENTS.md`. Each guideline is a source of the project record, so the 85 claims that quoted `AGENTS.md` quote the file their sentence is in now, and `bun run compare main --docs` runs the programs the guidelines show. A new practice gets a guideline and a line in `AGENTS.md`.

**Alternatives considered.**

- Keep every guideline in `AGENTS.md`. Every task pays for reading all of it, and a file that long is read less closely the longer it gets.
- Import each guideline into `CLAUDE.md` with `@`. An imported file is loaded with `CLAUDE.md`, so the agent would read as much as before.
- Put the guidelines under `docs/`. `docs/` is the published website, and the guidelines are for whoever works on Lion, not for its users.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `agent-instructions-layout`: `index-with-guidelines`. "`AGENTS.md` names every one with its main rule and when to read it"
- Holds when Lion is run: rule `agent-instructions-under-200-lines` holds. "`AGENTS.md` and `CLAUDE.md` stay under 200 lines each."
- Holds when Lion is run: rule `every-guideline-named-in-agents-md` holds. "Each practice has a guideline in `guidelines/`, and `AGENTS.md` names every one with its main rule and when to read it."
- Holds when Lion is run: `guidelines-folder` exists. "Each guideline is a source of the project record, so the 85 claims that quoted `AGENTS.md` quote the file their sentence is in now"

<a id="package-readme-source"></a>

## package-readme-source

Now: `written-from-readme`.

- 2026-11-17 `package-readme-source`: `written-from-readme` over `kept-by-hand`, `pointer-to-repository`: "The docs build, `bun run --cwd packages/site-runtime docs`, writes `packages/core/README.md` from `README.md`" (`package-readme.json`)

<a id="package-readme"></a>

### The README of `@lionlang/core` is written from the repository's README

Recorded 2026-11-17 in `history/notes/package-readme.json`.

**Context.** `packages/core/README.md` is the page npm shows for `@lionlang/core`. It was a copy of the repository's README kept by hand, and it had drifted: 78 lines of the sections the two share differed. It still said that every array is an expression and that every function takes a set number of arguments, it had no word of `number/fromString`, `string/join`, `string/split`, `string/slice`, `string/numbers`, `object/set`, `object/remove`, or of what `why` shows for a computed value, its list of packages named three of nine, and one of its links led to a folder on the author's machine.

**Decision.** The docs build, `bun run --cwd packages/site-runtime docs`, writes `packages/core/README.md` from `README.md`: its opening and the sections that describe the language, from Basic Usage to Host Interop, word for word. A link to a file of the repository, or to a section the page leaves out, is written as a full address, and what a fenced block or a code span holds is not touched. The page ends with a list of the sections it leaves out, each a link into the repository. The site-runtime tests fail when the file is not what the README gives.

**Consequences.** The package's page says what the README says, and a change to a language section is made once. The page no longer has its own Packages and Development sections, which were about the repository and out of date: it links to the repository's. The documentation procedure no longer asks for every edit to be made in both files. A property checks the page against a model of a README whose parts are known, and seven mutations of the writer are caught.

**Alternatives considered.**

- Keep the copy by hand and correct it now. It drifted while the procedure said to edit both files, so it would drift again.
- Make the package's page a short pointer to the repository's README. The page npm shows is where someone deciding whether to install the package reads what the language is.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `package-readme-source`: `written-from-readme`. "The docs build, `bun run --cwd packages/site-runtime docs`, writes `packages/core/README.md` from `README.md`"
- Holds when Lion is run: rule `package-readme-written-from-readme` holds. "The site-runtime tests fail when the file is not what the README gives."
- Holds when Lion is run: `package-readme-writer` exists. "its opening and the sections that describe the language, from Basic Usage to Host Interop, word for word"
- Stated, not checked by running Lion: rule `edit-both-readmes` is withdrawn. "The documentation procedure no longer asks for every edit to be made in both files."

<a id="ci-test-concurrency"></a>

## ci-test-concurrency

Now: `one-package-at-a-time`.

- 2026-11-17 `ci-test-concurrency`: `one-package-at-a-time` over `every-package-at-once`: "CI runs the tests with `bun run test --concurrency=1`, one package at a time, so a suite has the runner's cores to itself." (`ci-test-concurrency.json`)

<a id="ci-test-concurrency"></a>

### CI runs one package's tests at a time, and a test has two minutes in every package

Recorded 2026-11-17 in `history/notes/ci-test-concurrency.json`.

**Context.** Every CI run on `main` from the release of core 0.9.0 on 2026-11-13 to the release of core 0.12.0 on 2026-11-17 failed, five in a row, each on tests that timed out and none on a wrong result: properties of the skills in `packages/metrics`, then `why` on a computed figure and lattice aggregates in core, then existential rules, and two properties of the record at their own limit of 120 seconds. CI ran `turbo test`, which runs every package's suite at once, on a runner with four cores, and each suite starts a worker for every core. Core's suite, which takes 22 seconds on a developer's machine, took 315 seconds there, and a test that takes half a second passed its limit of five.

**Decision.** CI runs the tests with `bun run test --concurrency=1`, one package at a time, so a suite has the runner's cores to itself. Every package's `vitest.config.ts` gives a test 120 seconds, as the record's already did: a property runs generated inputs, so how long it takes depends on the machine, and a limit a slower machine passes says nothing about Lion.

**Consequences.** A test fails in CI for what it checks, not for how busy the runner is. A test that hangs is stopped after two minutes instead of five seconds. On a developer's machine `bun run test` still runs every package at once.

**Alternatives considered.**

- Give each test that timed out a longer limit of its own. A different test timed out on each run, so the next one would be a test nobody had raised yet.
- Run fewer inputs for each property in CI. The runs are what make a property catch the breaks `bun run mutate` lists, and CI is where a missed one is found.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `ci-test-concurrency`: `one-package-at-a-time`. "CI runs the tests with `bun run test --concurrency=1`, one package at a time, so a suite has the runner's cores to itself."
- Holds when Lion is run: rule `ci-tests-one-package-at-a-time` holds. "CI runs the tests with `bun run test --concurrency=1`, one package at a time"
- Holds when Lion is run: rule `test-time-limit-two-minutes` holds. "Every package's `vitest.config.ts` gives a test 120 seconds"

<a id="why-fact-not-holding"></a>

## why-fact-not-holding

Now: `absent-tree`.

- 2026-11-17 `why-fact-not-holding`: `absent-tree` over `null`: "`why` tells how a goal holds or why it does not, by one rule in which `not` changes sides." (`why-tells-absence.json`)

<a id="why-tells-absence"></a>

### `why` tells why a fact does not hold, and marks what is only assumed

Recorded 2026-11-17 in `history/notes/why-tells-absence.json`.

**Context.** `why` explained a fact that holds and returned `null` for one that does not, so the question asked most often of a rule, why a row is missing, had no answer. A goal under `not` showed as `absent` with nothing under it. Lion is closed-world, so a `not` over an unknown holds: ben's unknown mother is not known to be eve, and a rule that asks so derives a row from a guess. Nothing told such a row from one that holds whatever the unknown is. Independence-friendly logic gives one account of both: a proof is the verifier's strategy, a refutation is the falsifier's, `not` swaps the two, and a sentence neither player can win is not determined.

**Decision.** `why` tells how a goal holds or why it does not, by one rule in which `not` changes sides. A fact that does not hold is `{"absent": fact, "because": [way, ...]}`. A way is a rule whose head can give the fact, told once for each answer of its first goals that the next goal stops: the goals that held under `because`, and under `but` the goal that did not. A `not` stops a rule because what it denies holds, so its `but` is that fact or check. When a rule's whole body holds, its `but` is the row the rule gave instead. An absent relation call is explained in turn, once in a tree, and an `absent` premise of a fact that holds is explained the same way. `"assumed": true` marks what could change once an unknown is known: an absent goal that could come to hold, a check that computes with an unknown, and a row that combines matches when its rule's body reads one.

**Consequences.** It is a breaking change: `why` no longer returns `null` for a fact that does not hold, so a program that tested the result for `null` reads `absent` instead. Every `absent`, asked as it stands, is `false`, as every `check` is `true`. `["why", ["mother", "ben", "eve"]]` is marked `assumed` when ben's mother is unknown, and `["why", ["mother", "ada", "fay"]]` is not when ada's mother is eve. The mark is safe, not exact: a goal that is not marked cannot change, and one that is marked may still not. Where several rows fit a goal with a variable of its own, the row shown is the one that sorts first, and the answers a goal stops are sorted, so the ways of an absent fact do not depend on the order facts were added in. An unknown in a premise is written as its `some` form, which evaluates to the unknown; it was written as a quoted list. Known answers of rules that ask no question stay answers once the unknowns are known, which a property now tests.

**Alternatives considered.**

- Keep `null`, and add a second form for facts that do not hold. Two forms would split one question, and neither would explain the `absent` premise of a fact that holds.
- Refuse or warn about a `not` that reads a column an unknown can reach, when the rule is added. Most such rules give answers that hold whatever the unknown is. The mark says which answers do not, one at a time.
- A third truth value, so that a goal over an unknown is neither true nor false. It would undo the closed world a `not` rests on everywhere else, and every form that takes a boolean would need a third case.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `why-fact-not-holding`: `absent-tree`. "`why` tells how a goal holds or why it does not, by one rule in which `not` changes sides."
- Holds when Lion is run: `why-absence-reads-no-unknown` is `not-assumed`. "`["why", ["mother", "ada", "fay"]]` is not when ada's mother is eve"
- Holds when Lion is run: `why-matched-row-of-several` is `sorts-first`. "Where several rows fit a goal with a variable of its own, the row shown is the one that sorts first"
- Holds when Lion is run: `why-check-with-unknown-evaluated` is `true`. "An unknown in a premise is written as its `some` form, which evaluates to the unknown; it was written as a quoted list."
- Holds when Lion is run: rule `why-tells-both-sides` holds. "`why` tells how a goal holds or why it does not, by one rule in which `not` changes sides."
- Holds when Lion is run: `why-goal-not-holding` is `absent-tree`. "It is a breaking change: `why` no longer returns `null` for a fact that does not hold"
- Holds when Lion is run: `why-absent-evaluated` is `false`. "Every `absent`, asked as it stands, is `false`, as every `check` is `true`."
- Holds when Lion is run: `why-stopped-by-not` is `what-it-denies`. "A `not` stops a rule because what it denies holds, so its `but` is that fact or check."
- Holds when Lion is run: `why-rule-gave-another-row` is `row-explained`. "When a rule's whole body holds, its `but` is the row the rule gave instead."
- Holds when Lion is run: `why-absent-goal-repeated` is `told-once`. "An absent relation call is explained in turn, once in a tree"
- Holds when Lion is run: rule `why-marks-assumptions` holds. "`"assumed": true` marks what could change once an unknown is known"
- Holds when Lion is run: `why-absence-reads-unknown` is `assumed`. "`["why", ["mother", "ben", "eve"]]` is marked `assumed` when ben's mother is unknown"

<a id="why-derivation-shown"></a>

## why-derivation-shown

Now: `found-first-by-new-derivation`.

- 2026-11-17 `why-derivation-shown`: `found-first-by-new-derivation` over `first-kept`: "A row that several answers give is explained the way a database that derives it from the facts as they now are finds it first." (`why-tells-first-derivation.json`)

<a id="why-tells-first-derivation"></a>

### `why` tells the derivation a new database finds first

Recorded 2026-11-17 in `history/notes/why-tells-first-derivation.json`.

**Context.** A row that several answers give holds once, and `why` explained it by the answer the model kept: the first that gave it. Which answer came first depended on the order facts were added in, and on whether the database had followed a change to its facts through rows it derived before, or derived them from the facts as they now are. After `["fact", ["link", 0, 4]]`, a database that had already derived `["path", 0, 4]` through `["path", 0, 1]` kept explaining it that way, while a new database with the same three facts explained it by the new link. The guidelines ask that a database which followed changes and one which derives from the facts as they now are behave the same, so the properties compared `why` across histories only without what each goal rests on.

**Decision.** A row that several answers give is explained the way a database that derives it from the facts as they now are finds it first. Rules run in the order they were added, round after round from the facts up, and of the answers of the first rule that gives the row, the least explains it, comparing the values its body binds in the order it binds them. An aggregated row tells its matches in that order, and `min`, `max`, and `shortest` explain the least of the matches that give their value. A group of relations that a change to facts was followed through forgets how its rows came about, and the first `why` that needs them derives the group again beside the model.

**Consequences.** `why` gives the same tree, down to what each goal rests on, whatever order the facts were added in, and in a database that followed changes to its facts as in one that derived from the facts as they now are. A path is explained by its shortest chain of edges, the one that takes the least node at each step: once `["edge", "a", "c"]` is added, `["why", ["path", "a", "c"]]` rests on that edge. The matches of an aggregated row are listed in the order of their answers, not the order they were found in. Following a change through derived rows no longer keeps their derivations up to date, so the first `why` after such a change derives the group it asks about once more. The properties compare whole trees, and the helper that left out what goals rest on is gone.

**Alternatives considered.**

- Keep the first answer the model happened to find. Which answer that is depends on the order facts were added in and on what the database derived before a change, so two databases with the same facts and rules explain one row two ways.
- Keep every answer that gives a row, and show them all. A recursive row can rest on more ways than there are rows, and a reader follows one way down to the facts.
- Keep the chosen derivation up to date as each change is followed. A change that gives a row a shorter way changes the way of every row derived through it, which takes the rounds of a new derivation again. Every change would pay for what only `why` reads.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `why-derivation-shown`: `found-first-by-new-derivation`. "A row that several answers give is explained the way a database that derives it from the facts as they now are finds it first."
- Holds when Lion is run: rule `why-tells-derivation-found-first` holds. "A row that several answers give is explained the way a database that derives it from the facts as they now are finds it first. Rules run in the order they were added, round after round from the facts up, and of the answers of the first rule that gives the row, the least explains it, comparing the values its body binds in the order it binds them."
- Holds when Lion is run: `why-row-after-shorter-way` is `shorter-way`. "A path is explained by its shortest chain of edges, the one that takes the least node at each step: once `["edge", "a", "c"]` is added, `["why", ["path", "a", "c"]]` rests on that edge."
- Holds when Lion is run: `why-row-of-tied-answers` is `least-answer`. "Rules run in the order they were added, round after round from the facts up, and of the answers of the first rule that gives the row, the least explains it, comparing the values its body binds in the order it binds them."
- Holds when Lion is run: `why-aggregated-matches-order` is `answer-order`. "The matches of an aggregated row are listed in the order of their answers, not the order they were found in."
- Stated, not checked by running Lion: `why-derives-followed-group-again` exists. "A group of relations that a change to facts was followed through forgets how its rows came about, and the first `why` that needs them derives the group again beside the model."

<a id="reasoning-direction-record-across-scores"></a>

## reasoning-direction-record-across-scores

Now: `carried-list`.

- 2026-11-17 `reasoning-direction-record-across-scores`: `carried-list` over `patience-per-score`, `setting-field`: "`carried` lists each direction that has experiments, with each score that none of them ran in a version with an earlier version to beat." (`direction-record-speaks-for-its-scores.json`)

<a id="direction-record-speaks-for-its-scores"></a>

### A direction's record says nothing about a score none of its experiments ran with an earlier version to beat

Recorded 2026-11-17 in `history/notes/direction-record-speaks-for-its-scores.json`.

**Context.** The same study continued a loop after the model or the benchmark changed, and found that a harness tuned under one model can start below the untouched one under another, so what paid off before has to be judged again. In the reasoning skill a score's question already holds what makes two runs comparable, so a new model or benchmark is another score, and its runs are never compared with the old ones. A direction's payoffs, misses, and patience were counted over every score together, so nothing told a direction that had been judged on a score from one whose record came only from another.

**Decision.** `carried` lists each direction that has experiments, with each score that none of them ran in a version with an earlier version to beat. A new model, benchmark, machine, or budget stays what it was, another score, and takes no word of its own. A carried direction is judged on the new score by running that score on the version before its experiment and on the experiment's version, since a run speaks for the version whose files it ran on, whenever it was made. Patience is counted as before, over every score.

**Consequences.** The standing questions list the directions whose record is only carried over to a score, with their record. After the score is run on the earlier versions, `improved` and `paid_off` say whether each change helps there, and the direction is carried no longer. A direction set aside under the old score stays set aside; when it is carried, its misses were all on another score, which the agent can take as a reason to try it once more. A version whose files cannot be put back cannot be run again, so the skill says to commit each experiment.

**Alternatives considered.**

- Count patience for each score apart, so a direction set aside under one model is live again under another. Directions and the research skill's leads share one rule for when to stop, and patience is a budget on the idea; the carried list tells the agent the same thing without a second way of counting.
- A setting field on scores or observations, naming the model and the benchmark. The score's question already holds what makes two runs comparable; a second place for it could disagree with the first.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `reasoning-direction-record-across-scores`: `carried-list`. "`carried` lists each direction that has experiments, with each score that none of them ran in a version with an earlier version to beat."
- Holds when Lion is run: rule `direction-record-speaks-for-its-scores` holds. "`carried` lists each direction that has experiments, with each score that none of them ran in a version with an earlier version to beat."
- Holds when Lion is run: `reasoning-direction-on-unrun-score` is `carried`. "`carried` lists each direction that has experiments, with each score that none of them ran in a version with an earlier version to beat."
- Holds when Lion is run: `reasoning-carried-direction-after-earlier-run` is `judged`. "After the score is run on the earlier versions, `improved` and `paid_off` say whether each change helps there, and the direction is carried no longer."
- Holds when Lion is run: `reasoning-patience-across-scores` is `counted-over-every-score`. "Patience is counted as before, over every score."
- Stated, not checked by running Lion: `reasoning-carried` exists. "`carried` lists each direction that has experiments"

<a id="reasoning-experiment-expectation-judging"></a>

## reasoning-experiment-expectation-judging

Now: `its-own-version`.

- 2026-11-17 `reasoning-experiment-expectation-judging`: `its-own-version` over `from-its-version-on`, `attempt-notes`, `predictions-on-the-direction`: "it is judged in the version it was formed in and no other" (`experiment-expectation-in-its-version.json`)

<a id="experiment-expectation-in-its-version"></a>

### What an experiment was expected to do is a belief that tries its direction, judged in the version it was formed in and no other

Recorded 2026-11-17 in `history/notes/experiment-expectation-in-its-version.json`.

**Context.** A study of agents that improve their own harness (Self-Improvement Memory, arXiv 2611.18856) found that carrying a record of each problem, the edits tried for it, what each edit was predicted to fix, and what it did fix lets a later run improve further than carrying the harness alone, and that carrying the diagnoses without their evidence does not reliably help. The reasoning skill held the parts of such a record, problems, beliefs that predict, directions, and experiments, with nothing joining them: a direction did not say which problem it was for, and an experiment recorded its score and not what it was expected to do. An expectation written as a plain belief was also judged by every version from its own on, so putting the files back after an experiment contradicted an expectation that the experiment itself had borne out.

**Decision.** A belief may say which direction it `tries`, as an observation does. Such a belief is what one experiment of the direction was expected to do, and it is judged in the version it was formed in and no other. Where it predicts a problem's question otherwise than the problem shows, that experiment `targets` the problem; the problem is `fixed` there when the version answers as predicted, and `unfixed` when it answers otherwise. A direction `addresses` the problems its notes list and the problems its experiments target. Every other belief is judged as before.

**Consequences.** What an attempt was predicted to fix and what it fixed are derived from a belief's predictions, with no second kind of note, so `contradicted`, `borne_out`, `untested`, and `why` apply to them unchanged. The standing questions list what each experiment was expected to fix and whether it did, and the problems that still show though every direction addressing them is set aside. An expectation recorded before the change is judged in the unchanged project, where every fix it predicts comes out not fixed, so the skill says to make the change, then record the belief, then run.

**Alternatives considered.**

- A note of its own for an attempt, with lists of the tasks predicted, fixed, and missed, as the study's record has. An expectation about a change is already a belief with predictions; a second shape for it would need its own rules for which versions judge it, and `why` and the standing questions about beliefs would not see it.
- Predictions on the direction itself. A direction is recorded once and tried many times, so a prediction added later would judge the experiments made before it, after the fact.
- Keep judging it by every version from its own on. Putting the files back after a miss, or making the next experiment, contradicted an expectation the experiment had borne out.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `reasoning-experiment-expectation-judging`: `its-own-version`. "it is judged in the version it was formed in and no other"
- Stated, not checked by running Lion: `reasoning-fixed` exists. "the problem is `fixed` there when the version answers as predicted"
- Stated, not checked by running Lion: `reasoning-unfixed` exists. "`unfixed` when it answers otherwise"
- Holds when Lion is run: rule `experiment-expectation-in-its-version` holds. "Such a belief is what one experiment of the direction was expected to do, and it is judged in the version it was formed in and no other. Where it predicts a problem's question otherwise than the problem shows, that experiment `targets` the problem; the problem is `fixed` there when the version answers as predicted, and `unfixed` when it answers otherwise."
- Holds when Lion is run: rule `beliefs-judged-from-their-version` holds. "Every other belief is judged as before."
- Holds when Lion is run: `reasoning-expectation-after-files-put-back` is `still-borne-out`. "putting the files back after an experiment contradicted an expectation that the experiment itself had borne out"
- Holds when Lion is run: `reasoning-experiment-predicted-fixes` is `fixed-or-unfixed-by-its-version`. "the problem is `fixed` there when the version answers as predicted, and `unfixed` when it answers otherwise"
- Holds when Lion is run: `reasoning-direction-addresses` is `listed-and-targeted`. "A direction `addresses` the problems its notes list and the problems its experiments target."
- Stated, not checked by running Lion: `reasoning-belief-tries` exists. "A belief may say which direction it `tries`, as an observation does."
- Stated, not checked by running Lion: `reasoning-direction-addresses` exists. "A direction `addresses` the problems its notes list and the problems its experiments target."
- Stated, not checked by running Lion: `reasoning-targets` exists. "that experiment `targets` the problem"

<a id="merge-survivor"></a>

## merge-survivor

Now: `least-member-fewest-nested-then-first-sorted`.

- 2026-11-18 `merge-survivor`: `least-member-fewest-nested-then-first-sorted` over `pairwise-describes-then-first-sorted`, `first-sorted-alone`: "Each class of values a key or an equality rule makes one is written as its least member, by one order" (`least-member-survives-a-merge.json`)

<a id="least-member-survives-a-merge"></a>

### Values a key or an equality rule makes one are written as their least member

Recorded 2026-11-18 in `history/notes/least-member-survives-a-merge.json`.

**Context.** When a key or an equality rule made two values one, Lion kept one of them by a rule applied to each pair as the pair was found: a given value stayed, else the unknown the other describes, else the one that sorts first. That rule is not transitive. Of the mothers of ben and cy, and an unknown that describes cy's mother and sorts before both, cy's mother beats the unknown that describes her, the unknown beats ben's mother by sorting first, and ben's mother beats cy's by sorting first. So which value a class kept depended on the order its pairs were found, and one program with its two equality rules swapped gave different answers, although the documentation said the result does not depend on the order rules or facts were added in. Following changes to facts one row at a time, rather than deriving a group again, also needs which value is kept to depend only on the values made one.

**Decision.** Each class of values a key or an equality rule makes one is written as its least member, by one order: a value the group did not invent, else the unknown that nests the fewest unknowns, else the one that sorts first. An unknown nests fewer unknowns than any unknown that describes it, so no unknown takes a value that describes it, without an exception to the order.

**Consequences.** Which value a class keeps depends only on the class, so it does not depend on the order rules or facts were added in, the order equality rules are written in, or the order pairs are found in. A program whose classes hold unknowns at different depths may keep another unknown than before, with the same rows and the same values shared: of 342 random programs that make unknowns one, 14 named a class with another unknown. Twins whose mothers are both invented still share the mother that sorts first.

**Alternatives considered.**

- Keep the pairwise rule, and apply pairs in a fixed order. The kept value would still depend on that order, which a database that follows its changes cannot keep, since changes come in any order.
- Order unknowns by how they sort alone, with no exception for one that describes another. An unknown could then take a value that describes it, which is a value that holds itself.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `merge-survivor`: `least-member-fewest-nested-then-first-sorted`. "Each class of values a key or an equality rule makes one is written as its least member, by one order"
- Holds when Lion is run: rule `least-member-survives-a-merge` holds. "a value the group did not invent, else the unknown that nests the fewest unknowns, else the one that sorts first"
- Holds when Lion is run: `equality-rule-two-invented-unknowns` is `fewest-nested-then-first-sorted`. "a value the group did not invent, else the unknown that nests the fewest unknowns, else the one that sorts first"
- Holds when Lion is run: `equality-rules-order` is `independent`. "Which value a class keeps depends only on the class, so it does not depend on the order rules or facts were added in, the order equality rules are written in, or the order pairs are found in"

<a id="research-layout"></a>

## research-layout

Now: `one-shared-model`.

- 2026-11-18 `research-layout`: `one-shared-model` over `folder-per-run`, `ignored-out-folder`: "Every research run adds to one Lion model in `research/`." (`research-compounds.json`)

<a id="research-compounds"></a>

### Research runs add to one shared Lion model in `research/`, committed with its sources and the programs that prove its conclusions

Recorded 2026-11-18 in `history/notes/research-compounds.json`.

**Context.** Research runs with the lion-research skill kept each run in its own folder under the git-ignored `out/`. The run on what Lion should improve next (2026-11-17) and the run on separation logic (2026-11-18) each recorded what Lion has, from its docs and from programs run on it, under names of their own. The second run could not query the first, and neither was kept: a removed worktree takes `out/` with it. The programs that checked an inference, such as the model of a record split run over every small case, lived beside the model and were lost with it.

**Decision.** Every research run adds to one Lion model in `research/`. Its steps, notes, sources, probes, standing checks, and each run's report and page plan are committed. A run starts from what the model holds, reuses its names for features, techniques, sources, and candidates, and gives its own ids a prefix. What Lion does is a claim quoting a sentence of its docs or the output of a program in `research/probes/`, saved as a source by `research/probes/run.mjs`, and each conclusion is derived by a rule. When Lion changes, the probes run again under a new source id, and the publisher's latest word replaces its earlier one.

**Consequences.** The separation-logic run is the first run in `research/`. Its frame was split into the shared frame `steps/01-frame.src.json`, which holds the kinds of statement and the rules that judge an idea for Lion, and its own step `02-sl-frame.json`, which holds its assumptions. Its claim, lead, and assumption ids start with `sl-`. `guidelines/researching.md` states the practice, `AGENTS.md` and `CLAUDE.md` name it, and the skill's `SKILL.md` says to add a run to a model the project already keeps. `model.json` and each run's built page are not committed: the replay builds them.

**Alternatives considered.**

- A folder per run, each its own model. Runs cannot ask one another, name the same feature differently, and keep two copies of what Lion does that drift apart.
- Keep research under the git-ignored out/. The evidence and the programs behind a conclusion are lost with the worktree, and the next run starts from nothing.
- Commit model.json beside the steps. It is built from the steps, as the project record's model is, and a copy would go stale the first time a step changed.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `research-layout`: `one-shared-model`. "Every research run adds to one Lion model in `research/`."
- Holds when Lion is run: rule `research-runs-extend-shared-model` holds. "A run starts from what the model holds, reuses its names for features, techniques, sources, and candidates, and gives its own ids a prefix."
- Holds when Lion is run: `research-probes-runner` exists. "What Lion does is a claim quoting a sentence of its docs or the output of a program in `research/probes/`, saved as a source by `research/probes/run.mjs`, and each conclusion is derived by a rule."
- Holds when Lion is run: `researching-guideline` exists. "`guidelines/researching.md` states the practice, `AGENTS.md` and `CLAUDE.md` name it, and the skill's `SKILL.md` says to add a run to a model the project already keeps."
- Holds when Lion is run: `research-extends-existing-model` is `true`. "`guidelines/researching.md` states the practice, `AGENTS.md` and `CLAUDE.md` name it, and the skill's `SKILL.md` says to add a run to a model the project already keeps."
- Holds when Lion is run: `separation-logic-research` exists. "The separation-logic run is the first run in `research/`."

<a id="compiled-code-lifetime"></a>

## compiled-code-lifetime

Now: `kept-by-lambda`.

- 2026-11-18 `compiled-code-lifetime`: `kept-by-lambda` over `cache-by-expression`: "A lambda's body is compiled the first time the lambda is called and kept with the lambda; nothing else keeps compiled code, and the forms that read or change the logic database evaluate their parts as they run." (`compiled-evaluation.json`)

<a id="deep-calls"></a>

## deep-calls

Now: `unwind-to-run-loop`.

- 2026-11-18 `deep-calls`: `unwind-to-run-loop` over `continuation-passing`, `generators`, `trampoline-per-tail-call`: "A call between Lion functions uses the JavaScript stack, and a call more than 100 calls deep starts again at the bottom of the stack, in Effect's run loop." (`compiled-evaluation.json`)

<a id="scope-bindings-store"></a>

## scope-bindings-store

Now: `map`.

- 2026-11-18 `scope-bindings-store`: `map` over `ref`: "A scope holds its bindings in a `Map` that compiled code reads and writes right away." (`compiled-evaluation.json`)

<a id="rest-of-a-record"></a>

## rest-of-a-record

Now: `schema-open-second-argument`.

- 2026-11-18 `rest-of-a-record`: `schema-open-second-argument` over `reserved-key`, `open-by-default`, `allof-skips-keys`: "On its own, a record or list of schemas leaves nothing; `["schema/open", record]` leaves anything; `["schema/open", record, rest]` leaves what fits `rest`." (`rest-of-a-record.json`)

<a id="rest-of-a-record"></a>

### What a record or list of schemas leaves over is its rest, and `schema/open` takes a schema for it

Recorded 2026-11-18 in `history/notes/rest-of-a-record.json`.

**Context.** A record schema was exact and `schema/open` let other keys be, with nothing between: a pattern could not bind the keys it did not name, a list pattern could not take the items after its first ones, and two exact record schemas could not be combined, since `schema/allOf` asks a record to have only the keys of each at once. The research run on separation logic (`research/runs/separation-logic/`) found the same split in its separating conjunction, where a heap is a finite map and P ∗ Q splits it into disjoint parts, and in Racket's `hash` pattern, closed by default, with `#:open` and `#:rest`. JSON Schema met the composition problem and added `unevaluatedProperties` in draft 2019-09. Lion's own lion-research core computed a record's rest by hand with `object/remove`.

**Decision.** A record of schemas names some keys of a value, and a list of schemas its first items. What it leaves over is the rest: the record of the other keys, or the list of the items after. On its own, a record or list of schemas leaves nothing; `["schema/open", record]` leaves anything; `["schema/open", record, rest]` leaves what fits `rest`. A key the record names is never part of the rest, so `["schema/open", a, b]` of two records of schemas with no key in common is the one exact schema with the keys of both, and a variable as the rest binds the rest in a pattern.

**Consequences.** `schema/open` takes one or two arguments, and a list of schemas as well as a record. `fit.ts` checks a record and a list by one rule, the rest's schema in place of the flag that said whether a record was open. A problem in the rest is shown where it stands in the value, and the rest as a whole that does not fit is the value not fitting the `schema/open` schema. A call of `schema/open` around a known record and a variable for the rest is a pattern, so it binds in a relation call and in `schema/fits?`, in rules and goal-directed queries alike. The model of schemas in `logic/tests/shapes.ts` generates rests for records and lists, so every property of schemas and patterns covers them.

**Alternatives considered.**

- A new form, such as `schema/rest` or a reserved key like `"..."` in a record. A reserved key takes a string that JSON data may use, and a new name adds a word for what `schema/open` already means: the keys a record leaves to something else.
- Make records open by default, as Elixir's map patterns and JSON Schema's objects are. Lion's records were made exact so that what a pattern binds does not depend on goal order, and Racket's `hash` pattern is exact by default too.
- Fix `schema/allOf` to let each record skip the keys of the others. `schema/allOf` means that a value fits every schema on its own, everywhere else; changing it for records alone would be a special case, which `unevaluatedProperties` shows JSON Schema needed a new keyword to avoid.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `rest-of-a-record`: `schema-open-second-argument`. "On its own, a record or list of schemas leaves nothing; `["schema/open", record]` leaves anything; `["schema/open", record, rest]` leaves what fits `rest`."
- Holds when Lion is run: rule `rest-of-a-record-or-list` holds. "A record of schemas names some keys of a value, and a list of schemas its first items. What it leaves over is the rest: the record of the other keys, or the list of the items after."
- Holds when Lion is run: `schema-open-rest` exists. "`schema/open` takes one or two arguments, and a list of schemas as well as a record."
- Holds when Lion is run: `schema-open-composes-exact-schemas` is `fits`. "A key the record names is never part of the rest, so `["schema/open", a, b]` of two records of schemas with no key in common is the one exact schema with the keys of both, and a variable as the rest binds the rest in a pattern."
- Holds when Lion is run: `schema-open-rest-binds` is `the-other-keys`. "A key the record names is never part of the rest, so `["schema/open", a, b]` of two records of schemas with no key in common is the one exact schema with the keys of both, and a variable as the rest binds the rest in a pattern."
- Holds when Lion is run: `schema-open-list-rest` is `the-other-items`. "What it leaves over is the rest: the record of the other keys, or the list of the items after."

<a id="library-argument-checks"></a>

## library-argument-checks

Now: `guard-then-decoder`.

- 2026-11-18 `library-argument-checks`: `guard-then-decoder` over `decoder-every-call`, `effect-jit-compiler`, `hand-written-checks`: "Each schema a library function checks its arguments with is compiled, once, into a guard: a plain JavaScript test that is true for exactly the values the schema's decoder accepts." (`library-argument-guards.json`)

<a id="library-argument-guards"></a>

### A library function passes arguments of the right kinds through a guard compiled from its schemas, and runs the decoder only on the others

Recorded 2026-11-18 in `history/notes/library-argument-guards.json`.

**Context.** Once Lion compiled expressions to direct-style closures, checking the arguments of library functions was most of what plain arithmetic cost. Each call of `number/add`, `number/subtract`, or `number/lessThan` ran Effect Schema's decoder over its list of arguments, which goes through the parser's general machinery and builds a new list even when every argument is a number. On fib(24) through a recursive lambda, the parser was about a quarter of the time, and the same program took about 45 ms with unchecked JavaScript arithmetic and 75 ms with the library.

**Decision.** Each schema a library function checks its arguments with is compiled, once, into a guard: a plain JavaScript test that is true for exactly the values the schema's decoder accepts. A schema gets a guard when its decoder gives back the value it was given: strings, numbers, booleans, anything, and lists of those, each with any checks of its own, and nothing that transforms. Arguments the guard accepts go to the function as they are, and any others go through the decoder, so every error and every message is the decoder's, as before. A check that throws makes the guard say no, and the decoder reports what it threw. A schema with no guard, such as a record, which the decoder copies key by key, or a schema that transforms, is decoded on every call, as before. `over` also takes the fewest arguments a call may give, so the functions whose last argument may be left out, `array/slice`, `string/slice`, `string/join`, `string/numbers`, `number/toString`, and `number/fromString`, are built with it like the rest.

**Consequences.** fib(17) through a recursive lambda takes 2.2 ms instead of 3.8 ms, and fib(24) about 54 ms instead of 75 ms, where unchecked arithmetic takes about 45 ms. `array/map` and `array/reduce` over 20,000 items run 1.1 to 1.2 times as fast, and rules, aggregates, and questions that call library functions up to 1.3 times; benchmarks that call none moved by no more than the noise between runs. A list whose items may be anything, which every `array` function takes, is checked without looking at its items, where the decoder copied it. No result, error, or message changed: the 89 programs the docs show and 40 calls with arguments of right and wrong kinds give what they gave before. The core grew by 67 lines of code, 0.6 percent: the guard is 67 lines, and building the six functions whose last argument may be left out on `over` paid for the rest. `decode(schema)` still gives the decoded value, and takes `then` to go on from it.

**Alternatives considered.**

- Turn on Effect's own schema compiler, `effect/schema/SchemaJITCompiler`. It switches compiled parsing on for every schema in the host's process, it is marked unstable, it writes code with `new Function`, which a page's content security policy may forbid, and fib(24) took 63 ms with it, against 54 ms with the guard.
- Check with `Schema.is`. It runs the same parser and then runs its result with `Effect.runSyncExit`, so it costs as much as decoding.
- Write each library function's check by hand, such as `typeof a === "number"`. What a function takes would be written twice, in its schema and in its check, and the two could drift apart; a guard compiled from the schema cannot.
- Let the guard give a finished Effect of the value, and leave `over` as it was. That made an Exit and bound it on every call, and fib(24) took 55 ms where going on from the guard directly took 50 ms.
- Give records a guard too. The decoder rebuilds a record key by key, and a struct drops the keys it does not declare, so a record's guard would need rules of its own to give the same value, and no record function is in a hot loop.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `library-argument-checks`: `guard-then-decoder`. "Each schema a library function checks its arguments with is compiled, once, into a guard: a plain JavaScript test that is true for exactly the values the schema's decoder accepts."
- Holds when Lion is run: rule `library-argument-errors-are-the-decoders` holds. "Arguments the guard accepts go to the function as they are, and any others go through the decoder, so every error and every message is the decoder's, as before."
- Holds when Lion is run: `guardOf` exists. "Each schema a library function checks its arguments with is compiled, once, into a guard"
- Stated, not checked by running Lion: `fib-17-lambda-ms` is 2.2. "fib(17) through a recursive lambda takes 2.2 ms instead of 3.8 ms"
- Stated, not checked by running Lion: `fib-24-lambda-ms` is 54. "fib(24) about 54 ms instead of 75 ms, where unchecked arithmetic takes about 45 ms"
- Stated, not checked by running Lion: `core-code-lines-added` is 67. "The core grew by 67 lines of code, 0.6 percent"

<a id="merging-what-a-key-gets"></a>

## merging-what-a-key-gets

Now: `any-aggregate-merge`.

- 2026-11-18 `merging-what-a-key-gets`: `lattice-merge-option` over `facts-for-every-aggregate`, `written-merge-function`, `merge-on-write`: "A keyed relation can declare `"merge"`: for columns outside the key, the lattice aggregate that joins the values a key gets, `aggregate/min`, `aggregate/max`, `aggregate/shortest`, or `aggregate/union`." (`merging-what-a-key-gets.json`)
- 2026-11-19 `merging-what-a-key-gets`: `any-aggregate-merge` over `lattice-merge-option`, `written-merge-function`, `merge-on-write`, was `lattice-merge-option`: "A merge takes any aggregate, `aggregate/sum` and `aggregate/count` among them; only a lattice aggregate can go through recursion." (`one-relation-model.json`)

<a id="merging-what-a-key-gets"></a>

### A keyed relation can merge what a key gets: each merged column joins its candidates with a lattice aggregate, and facts are candidates too

Recorded 2026-11-18 in `history/notes/merging-what-a-key-gets.json`.

**Context.** A keyed relation held one row per key by agreement alone: a fact replaced the row its key had, and two different rows that rules gave one key were an error. Combining the values a key gets took a second relation and a rule that aggregated into it, and that relation could not have facts, so a value known as a fact and values derived by rules could not meet in one place. The research run on separation logic (`research/runs/separation-logic/`) found the same split in Iris's resource algebras: values that combine, a check of which combinations are valid, and a unit. Lion's keyed rules are the agreement algebra, where equal values combine and different ones are invalid, and its lattice aggregates are algebras where every combination is valid. Lion's earlier design for incremental maintenance (`shared-algebra.md`, 2026-11-18) planned to make a key's columns folds over its candidates, with facts as candidates.

**Decision.** A keyed relation can declare `"merge"`: for columns outside the key, the lattice aggregate that joins the values a key gets, `aggregate/min`, `aggregate/max`, `aggregate/shortest`, or `aggregate/union`. Every row a key gets is then a candidate, from a fact or a rule alike, and the key holds one row whose merged columns join the candidates' values. A column the merge does not name must agree, as for any key. A fact of such a relation never replaces another, and `retract` takes it back. A rule's head gives a merged column plainly, and the relation joins it, so a relation that merges is an aggregated relation whose facts are candidates too.

**Consequences.** The relation form takes the option `"merge"`, written in snapshots beside the key. The relation's declaration adds a rule that reads its facts as candidates, under the name the goal-directed rewrite already uses for a relation's own facts; a snapshot writes the declaration, not the rule, and `why` tells a fact that won as given, with the declaration as its rule. Two rows of a keyed aggregated relation that differ in a column that does not merge are now an error, as two rows rules give one key always were. `aggregate/sum`, `aggregate/count`, and the other aggregates that add up a rule's matches do not merge, since a fact is not a match: a relation that aggregates with them still cannot have facts.

**Alternatives considered.**

- Let any aggregated relation take facts as candidates. A sum or count adds up a rule's matches, and a fact is not one: with facts kept as a set, two equal facts would count once. A lattice join gives the same result whatever is repeated.
- A merge function the program writes, as egglog's `:merge`. Lion could not check that a written function is associative, commutative, and idempotent, and without that the row a key holds would depend on the order candidates come in, against the guarantee that a program has one answer.
- Combine facts when they are written, as an upsert that keeps the better value. The candidates would be lost: `retract` could not take one back, and the rows rules give could not meet the facts.

**What it asserts, checked.**

- Replaced by a later word: decided `merging-what-a-key-gets`: `lattice-merge-option`. "A keyed relation can declare `"merge"`: for columns outside the key, the lattice aggregate that joins the values a key gets, `aggregate/min`, `aggregate/max`, `aggregate/shortest`, or `aggregate/union`."
- Holds when Lion is run: rule `a-key-holds-the-join-of-its-candidates` holds. "Every row a key gets is then a candidate, from a fact or a rule alike, and the key holds one row whose merged columns join the candidates' values. A column the merge does not name must agree, as for any key."
- Holds when Lion is run: `relation-merge-option` exists. "A keyed relation can declare `"merge"`: for columns outside the key, the lattice aggregate that joins the values a key gets, `aggregate/min`, `aggregate/max`, `aggregate/shortest`, or `aggregate/union`."
- Holds when Lion is run: `merge-joins-facts-and-rules` is `join`. "Every row a key gets is then a candidate, from a fact or a rule alike, and the key holds one row whose merged columns join the candidates' values."
- Holds when Lion is run: `merge-fact-retract` is `candidate-removed`. "A fact of such a relation never replaces another, and `retract` takes it back."
- Holds when Lion is run: `keyed-aggregated-rows-differ` is `error`. "Two rows of a keyed aggregated relation that differ in a column that does not merge are now an error, as two rows rules give one key always were."

<a id="one-relation-model"></a>

### A relation is a key and how its candidates combine: rules that aggregate merge as a declared merge does, a merge takes any aggregate, and retract takes rules and invariants back

Recorded 2026-11-19 in `history/notes/one-relation-model.json`.

**Context.** A key meant different things by where rows came from: a fact replaced the fact with its key, two rule rows with one key were an error, a declared merge joined candidates, and rules that aggregate grouped matches by the other columns of their head. A relation that rules aggregated into could not have facts (`"total" is computed by aggregate rules, so it cannot have facts.`), one with facts could not take an aggregating rule, and a rule with a plain head beside an aggregating one failed (`Every rule for "total" must aggregate the same columns in the same way`). A merge took only lattice aggregates, since a fact is not a match to add up. And no rule or invariant could be taken back. Since rows carry weights, the engine counts every candidate of a row once, a fact or a rule's match, so an aggregate of a key's candidates no longer depends on the order or the source they come in.

**Decision.** A relation whose rules aggregate merges what each key gets with those aggregates, as one that declares a merge does: the other columns of the head are the key, and every fact of the relation and every rule with a plain head for it gives a candidate, whatever order they come in. Every rule that aggregates into a relation must still aggregate the same columns in the same way. A merge takes any aggregate, `aggregate/sum` and `aggregate/count` among them; only a lattice aggregate can go through recursion. A `rule` or `invariant` form inside `retract`, written as it was added, takes that rule or invariant back, and the relations whose rules changed are derived again.

**Consequences.** Two restrictions and their messages are gone, and the rule that every rule for an aggregated relation aggregates alike now concerns only rules that aggregate. A fact of a relation whose rules aggregate is one candidate, as a match is, so two equal facts are one fact, as two equal matches are one match. Whether a fact replaces the fact its key has is still the relation's declaration's to say, so what a fact form keeps never depends on the rules there are when it comes; the property that found this in a first version checks it in every order. `why not` leaves a relation's facts out of the ways a row could be derived, also where a merge reads them. Properties in `logic/tests/candidates.test.ts` check the candidates against a plain model in every order, with and without a declared merge, through a snapshot, and that taking a rule or invariant back leaves what never adding it gives. Measured against main, with the names change before it: 15,054 code lines where main has 14,438, of which this change adds 211, and 182 messages where the names change left 183. Every workload of `bun run scale` grows as it did, at most as the facts do; at 100,000 facts the times read 0.83 to 1.08 of main's while another process loaded the machine.

**Alternatives considered.**

- Keep facts out of relations that rules aggregate into. It made a relation's rules decide whether it can have facts, and the order rules and facts came in decide which one failed; the weights engine now counts each candidate, so nothing needs the restriction.
- Make every key a function with a merge function, as egglog does, and unknowns its union-find. Lion already holds the pieces as keys, merges, and least-member classes; the engine's one model of weighted rows carries them, and a written merge function could not be checked to be order-independent.
- Take a rule back by a name. Rules have no names; the form a snapshot writes already identifies a rule, as adding one twice shows.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `aggregated-relation-candidates`: `merge-from-rules`. "A relation whose rules aggregate merges what each key gets with those aggregates, as one that declares a merge does: the other columns of the head are the key, and every fact of the relation and every rule with a plain head for it gives a candidate, whatever order they come in."
- Holds when Lion is run: `aggregated-relation-facts` is `candidate`. "A relation whose rules aggregate merges what each key gets with those aggregates, as one that declares a merge does: the other columns of the head are the key, and every fact of the relation and every rule with a plain head for it gives a candidate, whatever order they come in."
- Holds when Lion is run: `aggregated-relation-plain-rule` is `candidate`. "A relation whose rules aggregate merges what each key gets with those aggregates, as one that declares a merge does: the other columns of the head are the key, and every fact of the relation and every rule with a plain head for it gives a candidate, whatever order they come in."
- Holds when Lion is run: rule `a-key-holds-the-join-of-its-candidates` holds. "A relation whose rules aggregate merges what each key gets with those aggregates, as one that declares a merge does: the other columns of the head are the key, and every fact of the relation and every rule with a plain head for it gives a candidate, whatever order they come in."
- Stated, not checked by running Lion: decided `merging-what-a-key-gets`: `any-aggregate-merge`. "A merge takes any aggregate, `aggregate/sum` and `aggregate/count` among them; only a lattice aggregate can go through recursion."
- Holds when Lion is run: `merge-with-sum` is `sum`. "A merge takes any aggregate, `aggregate/sum` and `aggregate/count` among them; only a lattice aggregate can go through recursion."
- Stated, not checked by running Lion: decided `rule-retraction`: `retract-the-form`. "A `rule` or `invariant` form inside `retract`, written as it was added, takes that rule or invariant back, and the relations whose rules changed are derived again."
- Holds when Lion is run: `rule-removal` is `possible`. "A `rule` or `invariant` form inside `retract`, written as it was added, takes that rule or invariant back, and the relations whose rules changed are derived again."
- Holds when Lion is run: `invariant-removal` is `possible`. "A `rule` or `invariant` form inside `retract`, written as it was added, takes that rule or invariant back, and the relations whose rules changed are derived again."

<a id="skill-eval-agent-folder"></a>

## skill-eval-agent-folder

Now: `outside-repository`.

- 2026-11-18 `skill-eval-agent-folder`: `outside-repository` over `inside-repository`: "Each agent works in a folder of its own outside the repository, inside a folder that cannot be listed, and its prompts and transcripts are written straight to `out/skill-eval/<run>/`, which it never sees." (`skill-eval-outside-repository.json`)

<a id="skill-eval-outside-repository"></a>

### A skill eval's agent works outside the repository, and never sees a transcript

Recorded 2026-11-18 in `history/notes/skill-eval-outside-repository.json`.

**Context.** `bun run skill-eval` ran each agent in a folder under `out/skill-eval/`, inside the repository. A headless agent there loads the repository's `CLAUDE.md` and the index of the memory Claude Code keeps for the repository, so every run of the research skill's eval worked with Lion's developer instructions and the maintainer's notes about the skill in context. A trial of the reasoning skill found a second leak: it kept each run's transcripts in the folder the agent worked in, and a later session read the earlier one's transcript instead of the record the trial meant to test.

**Decision.** Each agent works in a folder of its own outside the repository, inside a folder that cannot be listed, and its prompts and transcripts are written straight to `out/skill-eval/<run>/`, which it never sees. When its sessions end, its folder is copied there and graded.

**Consequences.** No run reads the repository's instructions, the maintainer's memory, another run's work, or a transcript. Scores of the research skill's eval recorded before this change were taken with the repository's instructions and memory in context, so they are not comparable with later ones. A run's folder is in the system's temporary folder while its sessions run, so a reboot during a run loses that run.

**Alternatives considered.**

- Keep the agents under `out/skill-eval/` and turn the instructions off with settings. Claude Code loads `CLAUDE.md` from the folder it runs in and every folder above it, and keys its memory by the repository. No setting the runner passes stops both, and a new version could start loading something else.
- Keep each run's transcripts beside its agent's folder. An agent lists the folder above its own. One did, and read the earlier session's transcript.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `skill-eval-agent-folder`: `outside-repository`. "Each agent works in a folder of its own outside the repository, inside a folder that cannot be listed, and its prompts and transcripts are written straight to `out/skill-eval/<run>/`, which it never sees."
- Holds when Lion is run: rule `skill-eval-isolated-runs` holds. "Each agent works in a folder of its own outside the repository, inside a folder that cannot be listed, and its prompts and transcripts are written straight to `out/skill-eval/<run>/`, which it never sees."
- Holds when Lion is run: `skill-eval-agent-folder` is `outside-repository`. "Each agent works in a folder of its own outside the repository, inside a folder that cannot be listed, and its prompts and transcripts are written straight to `out/skill-eval/<run>/`, which it never sees."

<a id="asking-what-would-hold"></a>

## asking-what-would-hold

Now: `assuming-question`.

- 2026-11-18 `asking-what-would-hold`: `assuming-question` over `binding-assumption`, `additions-only`, `copy-outside`: "`["assuming", change, ..., expression]` gives what the expression gives in the database as it would be after the changes, each a `fact` or `retract` form made in order as that form makes it, with keys, merges, and invariants, and leaves the database as it is." (`asking-what-would-hold.json`)

<a id="asking-what-would-hold"></a>

### `assuming` asks a question of the database as it would be after some changes

Recorded 2026-11-18 in `history/notes/asking-what-would-hold.json`.

**Context.** A program that wanted to know what would follow from a change had to make the change and undo it, or copy the database, as the lion-research skill's "What if" pattern did with a copy of the model on disk. A rule could not ask it at all. The research run on separation logic (`research/runs/separation-logic/`) found this in the magic wand, P −∗ Q: what holds once the state is extended with a part where P holds. Over facts, which can be used again, that is hypothetical reasoning: Bonner's embedded implications in Datalog, and the implication goals of λProlog and Lolli. Bonner showed that hypothetical additions raise the data complexity of Datalog from PTIME to PSPACE, and keep the fixpoint independent of how it is stratified.

**Decision.** `["assuming", change, ..., expression]` gives what the expression gives in the database as it would be after the changes, each a `fact` or `retract` form made in order as that form makes it, with keys, merges, and invariants, and leaves the database as it is. It is a question, as `find` is: in plain code it is asked right away, and in a rule, query, or `find` it is asked for each answer, with the values the answer bound in place. What a change states must be known then, and every other variable of the expression is its own.

**Consequences.** The engine asks an `assuming` by making a database of its own that shares the declarations, rules, invariants, and every fact it does not change, making the changes there, and asking the expression of it. The question rules carry over unchanged: a rule cannot ask, through `assuming`, about a relation that depends on its own head, and `why` shows an `assuming` that held as a check. The interop grid has two new rows, and both give in every place what plain code gives. Each `assuming` in a rule costs a derivation per answer, which the docs say.

**Alternatives considered.**

- Let `assuming` bind the variables of its goal, as a relation call does. Every other question, `not`, `exists`, and a goal used as a value, binds nothing outside it, and `find` gives what it matches; an `assuming` around a `find` gives the values without a second rule for questions.
- Additions only, as in Bonner's hypothetical Datalog. `retract` is the other half of what a change is in Lion, and Sáenz-Pérez added hypothetical deletion for the same reason; a question that could add but not take away would be a special case of the change forms.
- Keep making a copy of the database outside the program. A rule cannot ask a copy, and a copy made by hand is a second database whose answers the program cannot check.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `asking-what-would-hold`: `assuming-question`. "`["assuming", change, ..., expression]` gives what the expression gives in the database as it would be after the changes, each a `fact` or `retract` form made in order as that form makes it, with keys, merges, and invariants, and leaves the database as it is."
- Holds when Lion is run: `assuming` exists. "`["assuming", change, ..., expression]` gives what the expression gives in the database as it would be after the changes, each a `fact` or `retract` form made in order as that form makes it, with keys, merges, and invariants, and leaves the database as it is."
- Holds when Lion is run: rule `assuming-is-a-question` holds. "It is a question, as `find` is: in plain code it is asked right away, and in a rule, query, or `find` it is asked for each answer, with the values the answer bound in place."
- Holds when Lion is run: `assuming-leaves-database` is `unchanged`. "`["assuming", change, ..., expression]` gives what the expression gives in the database as it would be after the changes, each a `fact` or `retract` form made in order as that form makes it, with keys, merges, and invariants, and leaves the database as it is."
- Holds when Lion is run: `assuming-in-rule` is `asked-per-answer`. "It is a question, as `find` is: in plain code it is asked right away, and in a rule, query, or `find` it is asked for each answer, with the values the answer bound in place."

<a id="schema-asks-about-another-value"></a>

## schema-asks-about-another-value

Now: `only-smaller-values`.

- 2026-11-18 `schema-asks-about-another-value`: `only-smaller-values` over `any-value-but-an-equal-one`: "Asked about again for a smaller value, one that holds fewer values, counting each character of a string, it is checked as any schema is. Asked about again for any other value, the check is refused." (`schema-asks-about-itself.json`)

<a id="schema-asks-about-itself"></a>

### A schema that asks about itself gets its least consistent answer, and asks again only about smaller values

Recorded 2026-11-18 in `history/notes/schema-asks-about-itself.json`.

**Context.** A schema already did not fit when its shape came back to it without going into the value, so ['schema', 'Loop', ['schema/anyOf', 'Loop', 1]] fits only 1. But a lambda in a shape that asked about its own schema started a new check, which did not know of the one under way. So ['schema', 'Same', ['lambda', ['v'], ['schema/fits?', 'v', 'Same']]] asked the same question forever, and Lion ran out of memory instead of answering, as did a schema that asked about a larger value each time. The research run on CIRT, the calculus of inductive refinement types (arXiv 2611.20867), found this. It also found that a type defined through its own negation has no consistent meaning (Liquid Haskell rejects such types), while one that refers to itself only at a strictly smaller index is well-founded (CIRT, Liquid Haskell's stratified types, Tores).

**Decision.** A named schema being checked is known to every check its shape starts, through a predicate too. Asked about again for the same value, it answers what the check under way assumes, which is first that the value does not fit. If the shape then says the value fits, it is checked again assuming that it fits, and if that disagrees too, whether the value fits has no answer, and the check fails. Asked about again for a smaller value, one that holds fewer values, counting each character of a string, it is checked as any schema is. Asked about again for any other value, the check is refused. A schema whose shape cannot ask about a schema, since it holds no lambda, relation, or other function that runs Lion code, is checked as before, at no cost.

**Consequences.** Every check of a schema whose lambdas ask about schemas ends: with an answer, with no answer, or refused, and never by running out of memory. The least answer that agrees with itself is the least fixed point the docs promised, 'finitely many steps', so a schema that only asks the same question again does not fit, and a loop through its shape gives the same answer as before. A lambda may recurse through not on a smaller part of the value, as stratified types do. A lambda that recursed on a number, such as asking about the next one, or on a value of the same size, is refused, even when it would have ended: a plain function can do that work. A failure inside another schema's lambda makes that schema not fit, as any failing lambda does.

**Alternatives considered.**

- Fail with an error whenever a lambda asks about its own schema for the same value. A schema that only asks the same question again has a consistent answer, that the value does not fit, and the docs promise it.
- Answer that the value does not fit, as a loop through a shape does. A schema that fits exactly the values that do not fit it would then fit, which contradicts its own definition.
- A third answer, 'unknown', for a schema with no consistent answer, as three-valued semantics of logic programs give. not, cond, find, and every schema function work with true and false, and a third value would change all of them.
- Refuse only a value equal to the one being checked. A lambda that asks about a larger value each time would still run out of memory.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `schema-asks-about-itself`: `least-consistent-answer-else-no-answer`. "Asked about again for the same value, it answers what the check under way assumes, which is first that the value does not fit."
- Stated, not checked by running Lion: decided `schema-asks-about-another-value`: `only-smaller-values`. "Asked about again for a smaller value, one that holds fewer values, counting each character of a string, it is checked as any schema is. Asked about again for any other value, the check is refused."
- Holds when Lion is run: rule `schema-asks-about-itself` holds. "A named schema being checked is known to every check its shape starts, through a predicate too."

<a id="schema-asks-about-itself"></a>

## schema-asks-about-itself

Now: `least-consistent-answer-else-no-answer`.

- 2026-11-18 `schema-asks-about-itself`: `least-consistent-answer-else-no-answer` over `always-error`, `does-not-fit`, `third-truth-value`: "Asked about again for the same value, it answers what the check under way assumes, which is first that the value does not fit." (`schema-asks-about-itself.json`)

<a id="assuming-and-invariants"></a>

## assuming-and-invariants

Now: `invariants-keep-the-database`.

- 2026-11-18 `assuming-and-invariants`: `invariants-keep-the-database` over `checked-like-fact`, `skipped-inside-invariants`: "`assuming` makes its changes with keys and merges, and no invariant refuses them: an invariant keeps the database, and a change that is only assumed does not change the database." (`assuming-and-invariants.json`)

<a id="assuming-and-invariants"></a>

### An invariant does not refuse a change that `assuming` only assumes

Recorded 2026-11-18 in `history/notes/assuming-and-invariants.json`.

**Context.** Core 0.14.0 made each change of an `assuming` as its `fact` or `retract` form would make it, with keys, merges, and invariants. CI then found an invariant whose filter asks with `assuming` that held of different facts in different orders: declared after the facts n(-4) and n(-2) it held, and with the invariant declared first, adding n(-2) was refused. An invariant applied to the worlds its own filter assumes only once it had been declared, and in the world n(-2)'s filter assumed, the invariant failed for n(-4). An invariant whose `assuming` adds a new fact for each answer, such as n(x + 1), never finished: each assumed world checked the invariant again, which assumed again.

**Decision.** `assuming` makes its changes with keys and merges, and no invariant refuses them: an invariant keeps the database, and a change that is only assumed does not change the database. This holds of every invariant: one written with `invariant`, the one a relation's `schema` option stands for, and the one an equality rule holds as.

**Consequences.** With `["invariant", ["shift", "?p", "sun"], {"assert": "none"}]`, adding `["fact", ["shift", "cy", "sun"]]` fails, while `["assuming", ["fact", ["shift", "cy", "sun"]], ["find", "?p", ["shift", "?p", "sun"]]]` is `["cy"]`. An invariant can ask with `assuming` what a change would do, holds of the same facts whatever order they and the invariant came in, and never asks itself again. An `assuming` can ask about a world the database would refuse, such as one where a row does not fit its relation's schema; its expression is answered there as the facts and rules give it. A change that fails for another reason, such as a relation call with the wrong number of arguments, still fails the question in the same words. The part of the decision `asking-what-would-hold` that made changes with invariants is decided again here.

**Alternatives considered.**

- Keep checking invariants in an assumed world, declare an invariant before checking it, and stop the recursion. An invariant that asks with `assuming` would then hold only if it held in every world its own filter assumes, and in every world those assume. Ending that regress needs a rule of its own, as the least consistent answer is for schemas, for a question no program has needed.
- Check invariants in an assumed world, except while an invariant is being checked. The same `assuming` would answer differently in plain code and in an invariant's goal, where an expression gives what it gives in plain code.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `assuming-and-invariants`: `invariants-keep-the-database`. "`assuming` makes its changes with keys and merges, and no invariant refuses them: an invariant keeps the database, and a change that is only assumed does not change the database."
- Holds when Lion is run: `assuming-change-an-invariant-refuses` is `assumed`. "With `["invariant", ["shift", "?p", "sun"], {"assert": "none"}]`, adding `["fact", ["shift", "cy", "sun"]]` fails, while `["assuming", ["fact", ["shift", "cy", "sun"]], ["find", "?p", ["shift", "?p", "sun"]]]` is `["cy"]`."
- Holds when Lion is run: `invariant-asking-assuming-order` is `independent`. "An invariant can ask with `assuming` what a change would do, holds of the same facts whatever order they and the invariant came in, and never asks itself again."
- Holds when Lion is run: `invariant-assuming-a-new-fact-each-answer` is `ends`. "An invariant can ask with `assuming` what a change would do, holds of the same facts whatever order they and the invariant came in, and never asks itself again."

<a id="following-a-change-to-facts"></a>

## following-a-change-to-facts

Now: `candidates-by-level`.

- 2026-11-19 `following-a-change-to-facts`: `candidates-by-level` over `take-out-and-derive-again`, `weights-alone`, `rounds-in-a-trace`: "Every derived row has a weight: the number of its candidates, each a fact or an answer of a rule's body that gives the row, and the row holds while its weight is above zero." (`rows-carry-weights.json`)

<a id="order-a-rule-head-sum-adds-in"></a>

## order-a-rule-head-sum-adds-in

Now: `sort-order`.

- 2026-11-19 `order-a-rule-head-sum-adds-in`: `sort-order` over `order-found`: "A sum or a mean of numbers that are not all whole is added up in sort order." (`rows-carry-weights.json`)

<a id="two-rows-with-one-key-inside-a-group"></a>

## two-rows-with-one-key-inside-a-group

Now: `read-from-the-level-after`.

- 2026-11-19 `two-rows-with-one-key-inside-a-group`: `read-from-the-level-after` over `both-for-a-level`, `pair-from-the-same-level`: "A row that comes while another row with its key is held is read from the level after: by then the pair that makes the two one holds, and the row that holds the value its class no longer writes has ended, so no answer finds two rows with one key." (`rows-read-when-held.json`)

<a id="rows-read-when-held"></a>

### A row beside one with its key is read a level later, `why` finds its answer when asked, and a group keeps only what its rules need

Recorded 2026-11-19 in `history/notes/rows-read-when-held.json`.

**Context.** rows-carry-weights left four gaps. Inside the group that derives a keyed relation, a row a rule derived beside a row with its key joined at its level, and the pair that made the two one held from the next, so for one level a rule of that group could find both rows: an answer the engine before it did not give. `why` after a change derived the group again, though each row's level was kept. One break, taking out the rule that an answer's rows must all have been held at one level, changed a followed database and a fresh one the same way, so no property caught it, and neither did one that made `why` tell an invented row by the first answer found. And a database kept much more: after the twins workload 704 megabytes where main kept 133, and after every path among 100,000 nodes 360 where it kept 233.

**Decision.** A row that comes while another row with its key is held is read from the level after: by then the pair that makes the two one holds, and the row that holds the value its class no longer writes has ended, so no answer finds two rows with one key. A row that is never held is read from the level it is held from. `why` finds how a row came about when it is asked: of the answers that give the row at the level it is held from, the least of the first rule that has one, worked out from the rows there are. Where a key or an equality rule made values one, the group's answers are worked out again once after a change, to tell its rows through the values made one. A group whose rules read nothing of its own keeps a weight for each row in its table and nothing else, and any other group keeps a row's candidates and time on the row itself.

**Consequences.** No rule finds two rows with one key, not even a rule of the group that derives them, and a change keeps no explanations and works none out. After the twins workload a database keeps 400 megabytes where it kept 704 and main keeps 133; after every path among 100,000 nodes it keeps 238 where it kept 360 and main keeps 233; after asking a rule that invents it keeps 186 where it kept 444 and main keeps 121. Shortest distances by an aggregate that recurses still keep 143 megabytes where main keeps 32. Deriving 2,500 pairs of twins whose mothers a key makes one runs at 1.25 times the speed of main where it ran at 0.72, every path on a chain of 150 at 0.78 to 0.88 where it ran at 0.8, and lattice recursion still at about 0.6. The engine is 355 lines larger than after rows-carry-weights: 14,438 lines of code where main has 13,251, with 1,650 functions. Five properties now check what no comparison of two databases could, each shown to fail on the break it is for, and `bun run mutate` stops a mutation's tests after ten minutes and counts the break caught.

**Alternatives considered.**

- Hold the pair that makes two rows one from the level the second row comes in. A row and the row it became then held each other up, so taking away the fact behind the merge left it in place.
- Let a rule of the group see both rows for one level. It gives an answer that a database deriving the rows from nothing in the engine before rows-carry-weights never gave, to any rule that combines two rows of one key.
- Keep each row's derivation as the row is derived. It costs memory for every row and work for every change, for an answer the levels the rows keep already give.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `two-rows-with-one-key-inside-a-group`: `read-from-the-level-after`. "A row that comes while another row with its key is held is read from the level after: by then the pair that makes the two one holds, and the row that holds the value its class no longer writes has ended, so no answer finds two rows with one key."
- Holds when Lion is run: `rule-reading-two-rows-with-one-key-in-its-group` is `never-both`. "A row that comes while another row with its key is held is read from the level after: by then the pair that makes the two one holds, and the row that holds the value its class no longer writes has ended, so no answer finds two rows with one key."
- Stated, not checked by running Lion: decided `where-why-finds-a-derivation`: `found-when-asked`. "`why` finds how a row came about when it is asked: of the answers that give the row at the level it is held from, the least of the first rule that has one, worked out from the rows there are."
- Holds when Lion is run: `why-of-a-row-several-answers-give` is `least-at-its-level`. "`why` finds how a row came about when it is asked: of the answers that give the row at the level it is held from, the least of the first rule that has one, worked out from the rows there are."
- Stated, not checked by running Lion: decided `what-a-group-keeps-of-its-rows`: `what-its-rules-need`. "A group whose rules read nothing of its own keeps a weight for each row in its table and nothing else, and any other group keeps a row's candidates and time on the row itself."
- Stated, not checked by running Lion: `twins-kept-mb` is 400. "After the twins workload a database keeps 400 megabytes where it kept 704 and main keeps 133"
- Stated, not checked by running Lion: `hundred-thousand-paths-kept-mb` is 238. "after every path among 100,000 nodes it keeps 238 where it kept 360 and main keeps 233"
- Stated, not checked by running Lion: `rule-that-invents-kept-mb` is 186. "after asking a rule that invents it keeps 186 where it kept 444 and main keeps 121"
- Stated, not checked by running Lion: `twins-from-nothing-speed-vs-main` is 1.25. "Deriving 2,500 pairs of twins whose mothers a key makes one runs at 1.25 times the speed of main where it ran at 0.72"

<a id="what-a-group-keeps-of-its-rows"></a>

## what-a-group-keeps-of-its-rows

Now: `what-its-rules-need`.

- 2026-11-19 `what-a-group-keeps-of-its-rows`: `what-its-rules-need` over `an-entry-for-every-row`: "A group whose rules read nothing of its own keeps a weight for each row in its table and nothing else, and any other group keeps a row's candidates and time on the row itself." (`rows-read-when-held.json`)

<a id="where-why-finds-a-derivation"></a>

## where-why-finds-a-derivation

Now: `found-when-asked`.

- 2026-11-19 `where-why-finds-a-derivation`: `found-when-asked` over `kept-with-each-row`, `derived-again-after-a-change`: "`why` finds how a row came about when it is asked: of the answers that give the row at the level it is held from, the least of the first rule that has one, worked out from the rows there are." (`rows-read-when-held.json`)

<a id="completion-proof-scope"></a>

## completion-proof-scope

Now: `visible-changes`.

- 2026-11-19 `completion-proof-scope`: `visible-changes` over `every-change`: "A screen recording is the proof of a change people see, such as the graph editor or the website; a change to the language, the CLI, the tools, or the docs' text is proved by its properties, `bun run compare`, and its measurements." (`process-costs-what-it-earns.json`)

<a id="process-costs-what-it-earns"></a>

### The record's pages hold no trace of the commit they are in, a reworded sentence of the docs leaves the record instead of failing it, and only a change people see is proved by a recording

Recorded 2026-11-19 in `history/notes/process-costs-what-it-earns.json`.

**Context.** Of the 81 commits from November 16 to 19, 37 were `docs: write the project record's pages for <hash>`. The timeline counted every commit and listed a source by its date, so a commit could not hold its own pages: after it, `bun run history check` failed until a second commit wrote them again and an amend settled that one. `history/notes/16-docs-head.json` pins 654 sentences of the docs, so rewording one failed the check until its claim quoted the new words. AGENTS.md asked for a screen recording after every change, also when the change was to the language and its proof was its properties and what `bun run compare` printed. And the README's guarantees described the engine's weights, levels, and stages, so every rewrite of the engine was a rewrite of the reader's reference too.

**Decision.** The timeline no longer counts commits, and lists the sources of an item in the order its commits and notes were made, then the documents, then what Lion does today, so the pages a working tree gives are the pages its commit holds. A claim that quotes a document in words the document no longer holds is left out of the model, and `bun run history check` lists it as a note instead of failing. A screen recording is the proof of a change people see, such as the graph editor or the website; a change to the language, the CLI, the tools, or the docs' text is proved by its properties, `bun run compare`, and its measurements. How the engine follows a change moved from the README to `packages/core/src/logic/ENGINE.md`.

**Consequences.** A change is one commit again: `bun run history write` before it gives the pages it holds, and the property that the pages of a commit are the pages its working tree gave checks that on generated histories, and fails on the timeline as it was. A reworded sentence's claim waits, listed, until someone reads the new words, so the record checks fewer of the docs' sentences as they change; the docs' programs are still run by `bun run compare main --docs`. The README's guarantees now say what a program can observe.

**Alternatives considered.**

- Build the pages in CI and stop committing them. The website is served from `docs/` on `main`, and readers look for `CHANGELOG.md` and `DECISIONS.md` in the repository, so the pages are committed; once they no longer depend on their commit, committing them costs nothing.
- Keep failing the check on a reworded sentence. It made every improvement to the docs a change to the record as well, for sentences whose programs are already checked by running them.
- Keep a recording for every change. A recording of a terminal printing test results shows less than the results themselves.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `record-pages-and-their-commit`: `pages-from-the-record-alone`. "The timeline no longer counts commits, and lists the sources of an item in the order its commits and notes were made, then the documents, then what Lion does today, so the pages a working tree gives are the pages its commit holds."
- Holds when Lion is run: `changelog-commit-count` is removed. "The timeline no longer counts commits, and lists the sources of an item in the order its commits and notes were made, then the documents, then what Lion does today, so the pages a working tree gives are the pages its commit holds."
- Stated, not checked by running Lion: rule `pages-from-the-record-alone` holds. "The timeline no longer counts commits, and lists the sources of an item in the order its commits and notes were made, then the documents, then what Lion does today, so the pages a working tree gives are the pages its commit holds."
- Stated, not checked by running Lion: decided `reworded-doc-sentence`: `claim-left-out`. "A claim that quotes a document in words the document no longer holds is left out of the model, and `bun run history check` lists it as a note instead of failing."
- Stated, not checked by running Lion: `history-check-on-reworded-doc-sentence` is `note`. "A claim that quotes a document in words the document no longer holds is left out of the model, and `bun run history check` lists it as a note instead of failing."
- Stated, not checked by running Lion: decided `completion-proof-scope`: `visible-changes`. "A screen recording is the proof of a change people see, such as the graph editor or the website; a change to the language, the CLI, the tools, or the docs' text is proved by its properties, `bun run compare`, and its measurements."
- Stated, not checked by running Lion: rule `completion-proof-recording` holds. "A screen recording is the proof of a change people see, such as the graph editor or the website; a change to the language, the CLI, the tools, or the docs' text is proved by its properties, `bun run compare`, and its measurements."
- Stated, not checked by running Lion: decided `engine-mechanics-docs`: `engine-md`. "How the engine follows a change moved from the README to `packages/core/src/logic/ENGINE.md`."
- Holds when Lion is run: `engine-md` exists. "How the engine follows a change moved from the README to `packages/core/src/logic/ENGINE.md`."

<a id="engine-mechanics-docs"></a>

## engine-mechanics-docs

Now: `engine-md`.

- 2026-11-19 `engine-mechanics-docs`: `engine-md` over `readme-guarantees`: "How the engine follows a change moved from the README to `packages/core/src/logic/ENGINE.md`." (`process-costs-what-it-earns.json`)

<a id="record-pages-and-their-commit"></a>

## record-pages-and-their-commit

Now: `pages-from-the-record-alone`.

- 2026-11-19 `record-pages-and-their-commit`: `pages-from-the-record-alone` over `second-pages-commit`, `pages-built-in-ci`: "The timeline no longer counts commits, and lists the sources of an item in the order its commits and notes were made, then the documents, then what Lion does today, so the pages a working tree gives are the pages its commit holds." (`process-costs-what-it-earns.json`)

<a id="reworded-doc-sentence"></a>

## reworded-doc-sentence

Now: `claim-left-out`.

- 2026-11-19 `reworded-doc-sentence`: `claim-left-out` over `check-fails`: "A claim that quotes a document in words the document no longer holds is left out of the model, and `bun run history check` lists it as a note instead of failing." (`process-costs-what-it-earns.json`)

<a id="condition-truth"></a>

## condition-truth

Now: `true-or-false`.

- 2026-11-19 `condition-truth`: `true-or-false` over `javascript-truthiness`, `scheme-truth`: "A condition of `cond` must be `true` or `false`, as a filter must, and `else` always holds unless a scope declares it." (`names-by-scope.json`)

<a id="define-scope"></a>

## define-scope

Now: `body`.

- 2026-11-19 `define-scope`: `body` over `global`: "A `define` binds in the body it stands in, a lambda's or the program's, and a name read before its `define` has run fails with `UndefinedYetError`." (`names-by-scope.json`)

<a id="form-name-bindings"></a>

## form-name-bindings

Now: `shadow-in-scope`.

- 2026-11-19 `form-name-bindings`: `shadow-in-scope` over `refused`: "A parameter or a `define` can take a special form's name, and an array that starts with it is a call where the binding is in scope; a relation or schema still cannot, since its name is bound in every run of its database." (`names-by-scope.json`)

<a id="aggregated-relation-candidates"></a>

## aggregated-relation-candidates

Now: `merge-from-rules`.

- 2026-11-19 `aggregated-relation-candidates`: `merge-from-rules` over `facts-refused`: "A relation whose rules aggregate merges what each key gets with those aggregates, as one that declares a merge does: the other columns of the head are the key, and every fact of the relation and every rule with a plain head for it gives a candidate, whatever order they come in." (`one-relation-model.json`)

<a id="rule-retraction"></a>

## rule-retraction

Now: `retract-the-form`.

- 2026-11-19 `rule-retraction`: `retract-the-form` over `impossible`, `by-name`: "A `rule` or `invariant` form inside `retract`, written as it was added, takes that rule or invariant back, and the relations whose rules changed are derived again." (`one-relation-model.json`)

<a id="assuming-changes"></a>

## assuming-changes

Now: `fact-retract-rule`.

- 2026-11-19 `assuming-changes`: `fact-retract-rule` over `fact-retract-only`, `invariant-changes`: "A change of `assuming` is a `fact`, `retract`, or `rule` form, made as that form makes it on its own: `["assuming", ["rule", head, ...body], expression]` adds the rule, and a `retract` takes back the rules and invariants it names as well as facts, so `["assuming", ["retract", ["rule", head, ...body]], expression]` asks what would hold without the rule." (`assuming-rules.json`)

<a id="assuming-rules"></a>

### `assuming` adds rules and takes rules and invariants back, as the forms it holds do on their own

Recorded 2026-11-19 in `history/notes/assuming-rules.json`.

**Context.** Once `retract` took `rule` and `invariant` forms back, `assuming` still took only `fact` and `retract` forms of relation calls. `["assuming", ["retract", ["rule", head, ...body]], expression]` made the rule form as a real `rule` form, which added the rule to the database, and then refused it: `assuming takes relation calls in its retract forms`. So a program could not ask what would hold without a rule, or with one more, and asking it changed the database. Two older surprises came up on the way. A `retract` that named facts and a rule took the facts away when taking the rule back broke an invariant, though its message said nothing changed. And a rule that asks `assuming` kept a row after a change to the facts its question reads: with `["rule", ["bridges", "?x", "?y"], ["pair", "?x", "?y"], ["assuming", ["fact", ["e", "?x", "?y"]], ["node", "?y"]]]`, retracting `["node", "a"]` left `["bridges", "a", "a"]`, since following a change asks each question as it was before the change, and `assuming` asks the database as it is.

**Decision.** A change of `assuming` is a `fact`, `retract`, or `rule` form, made as that form makes it on its own: `["assuming", ["rule", head, ...body], expression]` adds the rule, and a `retract` takes back the rules and invariants it names as well as facts, so `["assuming", ["retract", ["rule", head, ...body]], expression]` asks what would hold without the rule. A rule or invariant form there is held, never made: its parts are evaluated as the form would evaluate them, and the database does not change, also when the question is refused. No invariant refuses an assumed change, not even the one an assumed rule that says two values are the same holds as, which the same rule in the database does not hold either for an assumed fact. In a rule, the variables of a held rule that the rule around it binds take the answer's values, and every other one is the held rule's own, as for every question. A `retract` of facts and rules is one change, and a rule that asks `assuming` is derived again and compared after a change, as one that holds a function from the host is.

**Consequences.** The database makes every change with one function, which writes facts, gives the database rules and invariants, or both, and undoes all of it when an invariant breaks; `retract` is one function for facts, rules, and invariants, and an assumption makes its changes with the same functions the forms use, on a database of its own whose rules are its own. Properties in `logic/tests/assuming.test.ts` check an assumed retraction against a database that never had the rules, an assumed rule against one that has it, a rule that assumes against plain code with the answer's values in place, a snapshot, and a database that derives anew after changes to the facts, which is what found the stale row; another checks that an assumption never changes the database, and another that an assumed rule that says two values are the same gives what the same rule in the database gives an assumed fact. In `logic/tests/invariants.test.ts`, a retract of facts, rules, and invariants is checked against the change made without invariants, and an invariant that holds a function from the host that reads `q` on its own is checked against a plain model of what the function reads; that property catches the mutation `bun run mutate` had reported MISSED. The interop grid has two new rows, an assumed rule over `?x` and a rule taken back, each like plain code in all 17 places. Measured against the change before it: 15,207 code lines where it had 15,093, 1,727 functions where it had 1,713, and no new special form, library function, kind of error, or message; the grid has 979 cells like plain code where it had 947, and the same 3 exceptions. Over two runs of `bun run bench` every benchmark read 0.87 to 1.24 of the earlier time, and the two that read slowest, every path on a 150 chain and 300 rules added one form at a time, read 0.97 to 1.06 and 0.91 to 1.06 when run alone three times. Every workload of `bun run scale` grows at most as the facts do; retracting facts 100 per form, which a first version of `retract` slowed to 0.87 by working out rules it was not given, reads 0.96 to 0.99 at 100,000 facts. An `assuming` cannot hold `exists` in its changes, which a `fact` or `retract` form can on its own.

**Alternatives considered.**

- Let `assuming` take `invariant` forms too. No invariant refuses a change that is only assumed, so an assumed invariant would change nothing an expression gives; whether a goal would hold is `["assuming", ..., ["not", goal]]`.
- Make every variable of a held rule its own. Every other question fixes the variables the rule around it binds, so a held rule could not depend on the answer, and the same rule asked in plain code with the answer's values in place would give something else.
- Ask `assuming` about the database as it was while a change is followed. The copy would need the rows every relation it reads had before the change, which a followed group holds only while it is followed; deriving the group again and comparing is the rule the engine already has for a rule that may read anything.
- Keep the invariant an assumed rule that says two values are the same holds as. The same rule in the database refuses no assumed fact, since an assumed database keeps no invariants, so where the rule stood would decide what an assumption refuses.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `assuming-changes`: `fact-retract-rule`. "A change of `assuming` is a `fact`, `retract`, or `rule` form, made as that form makes it on its own: `["assuming", ["rule", head, ...body], expression]` adds the rule, and a `retract` takes back the rules and invariants it names as well as facts, so `["assuming", ["retract", ["rule", head, ...body]], expression]` asks what would hold without the rule."
- Holds when Lion is run: `retract-rule-beside-facts-refused` is `no-change`. "A `retract` of facts and rules is one change, and a rule that asks `assuming` is derived again and compared after a change, as one that holds a function from the host is."
- Holds when Lion is run: rule `all-or-nothing-changes` holds. "A `retract` of facts and rules is one change, and a rule that asks `assuming` is derived again and compared after a change, as one that holds a function from the host is."
- Holds when Lion is run: `rule-asking-assuming-after-fact-change` is `up-to-date`. "A `retract` of facts and rules is one change, and a rule that asks `assuming` is derived again and compared after a change, as one that holds a function from the host is."
- Holds when Lion is run: rule `unfollowed-relations-derived-again` holds. "A `retract` of facts and rules is one change, and a rule that asks `assuming` is derived again and compared after a change, as one that holds a function from the host is."
- Stated, not checked by running Lion: `core-code-lines-added` is 114. "Measured against the change before it: 15,207 code lines where it had 15,093, 1,727 functions where it had 1,713, and no new special form, library function, kind of error, or message; the grid has 979 cells like plain code where it had 947, and the same 3 exceptions. Over two runs of `bun run bench` every benchmark read 0.87 to 1.24 of the earlier time, and the two that read slowest, every path on a 150 chain and 300 rules added one form at a time, read 0.97 to 1.06 and 0.91 to 1.06 when run alone three times. Every workload of `bun run scale` grows at most as the facts do; retracting facts 100 per form, which a first version of `retract` slowed to 0.87 by working out rules it was not given, reads 0.96 to 0.99 at 100,000 facts."
- Holds when Lion is run: `assuming-rule-retraction` is `possible`. "A change of `assuming` is a `fact`, `retract`, or `rule` form, made as that form makes it on its own: `["assuming", ["rule", head, ...body], expression]` adds the rule, and a `retract` takes back the rules and invariants it names as well as facts, so `["assuming", ["retract", ["rule", head, ...body]], expression]` asks what would hold without the rule."
- Holds when Lion is run: `assuming-rule-change` is `possible`. "A change of `assuming` is a `fact`, `retract`, or `rule` form, made as that form makes it on its own: `["assuming", ["rule", head, ...body], expression]` adds the rule, and a `retract` takes back the rules and invariants it names as well as facts, so `["assuming", ["retract", ["rule", head, ...body]], expression]` asks what would hold without the rule."
- Holds when Lion is run: `assuming-refused-change-database` is `unchanged`. "A rule or invariant form there is held, never made: its parts are evaluated as the form would evaluate them, and the database does not change, also when the question is refused."
- Holds when Lion is run: rule `assuming-is-a-question` holds. "A rule or invariant form there is held, never made: its parts are evaluated as the form would evaluate them, and the database does not change, also when the question is refused."
- Holds when Lion is run: `assuming-equality-rule-invariant` is `not-kept`. "No invariant refuses an assumed change, not even the one an assumed rule that says two values are the same holds as, which the same rule in the database does not hold either for an assumed fact."
- Stated, not checked by running Lion: decided `held-rule-variables`: `question-scope`. "In a rule, the variables of a held rule that the rule around it binds take the answer's values, and every other one is the held rule's own, as for every question."
- Holds when Lion is run: rule `question-variables-scoped` holds. "In a rule, the variables of a held rule that the rule around it binds take the answer's values, and every other one is the held rule's own, as for every question."
- Holds when Lion is run: `assuming-held-rule-outer-variables` is `bound`. "In a rule, the variables of a held rule that the rule around it binds take the answer's values, and every other one is the held rule's own, as for every question."

<a id="held-rule-variables"></a>

## held-rule-variables

Now: `question-scope`.

- 2026-11-19 `held-rule-variables`: `question-scope` over `held-rule-own`: "In a rule, the variables of a held rule that the rule around it binds take the answer's values, and every other one is the held rule's own, as for every question." (`assuming-rules.json`)

<a id="analysis-strings"></a>

## analysis-strings

Now: `read-by-scope`.

- 2026-11-19 `analysis-strings`: `read-by-scope` over `reference-candidate`, `read-by-running`: "`analyze(expression, environment)` reads a program as a run with that environment reads it, by the same scopes, found by the functions the evaluator finds them by: `definedIn`, `declaredIn`, and `bodyNames`, with `nameOrString` for a misspelled name." (`analysis-reads-by-scope.json`)

<a id="analysis-reads-by-scope"></a>

### The analysis reads every string by the scopes the evaluator reads it by, and the graph editor shows what each one means

Recorded 2026-11-19 in `history/notes/analysis-reads-by-scope.json`.

**Context.** A string's meaning is settled by the scopes it is written in, before it runs (see the decision that a string means what the scopes it is written in declare). The analysis the graph editor is built on predated that rule: it marked every string a `reference-candidate`, a guess, and the editor showed each one as a "symbol reference" that could be "lookup or text". So the editor could not say which strings are names, it called a define's name a "global identifier" though a define binds in its body, and a misspelled `module/name`, or a `set!` of a name nothing binds, was found only by running.

**Decision.** `analyze(expression, environment)` reads a program as a run with that environment reads it, by the same scopes, found by the functions the evaluator finds them by: `definedIn`, `declaredIn`, and `bodyNames`, with `nameOrString` for a misspelled name. Each string has a `meaning`: a `name` or a `binding`, with the binding it means or makes (a `parameter`, a `define` in a lambda's body or at the top, a `relation`, a `schema`, or the `environment`'s, with the pointers of the strings that bind it), a `logic-variable`, `data`, `unbound` where only a name can stand and nothing binds one, a `form`'s name, or the `keyword` `else`. A part that fails when it runs, a malformed form or an unbound name, has a `diagnostic`: the message of the error the run fails with. The parts a form reads as written, a relation's columns and the options of a relation, query, or invariant, are `quoted`, as what is inside `quote` is. The `relationships` field, with its `reference-candidate` and `definition` kinds, is gone. The graph editor analyzes a program with the environment its runs bind and shows under each string what it means there; selecting a name or a binding outlines the binding and every string that means it.

**Consequences.** Properties in `analysis/tests/analyze.test.ts` check the analysis against the evaluator, never against itself: a generated program gives the same after every binding the analysis finds is renamed at every string it says means that binding, and every string it says is data is quoted; a string in a lambda evaluates to the parameter, library value, logic variable, data, or error the analysis says; and every `MalformedFormError` or `UnboundNameError` a run fails with is one the analysis flags with the same message. Ten mutations of the analysis are each caught. The editor's own property checks its reading against runs in the editor's environment. Measured against the commit before it: 15,488 code lines where it has 15,093 (+2.6%), all of it the analysis's reading of scopes, and one message fewer, since `set!` and the model interpreter now build its error in one place; no special form, library function, kind of error, or grid exception changed, and no step of evaluation did either. Two places where the evaluator itself departs from reading by scope were found, and are left to a change of their own: a logic form compiles its parts when it runs, so a name `eval` binds later turns data into a name inside `find` or a rule where plain code keeps it data; and `retract` takes back a `rule` form of any shape, which the analysis flags as malformed.

**Alternatives considered.**

- Keep marking every string a reference candidate, and let the editor guess. A guess cannot say which strings are names, and it shows the same string the same way where the evaluator reads it two ways.
- Learn what each string means by running the program. A run never reaches code that does not run, such as a lambda nobody calls, and a run has effects. The scopes are settled before anything runs, so reading them needs no run.
- Write a scope analysis of the editor's own. Two readings drift apart. The analysis asks the evaluator's own functions what each scope declares, and properties check what it says against runs.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `analysis-strings`: `read-by-scope`. "`analyze(expression, environment)` reads a program as a run with that environment reads it, by the same scopes, found by the functions the evaluator finds them by: `definedIn`, `declaredIn`, and `bodyNames`, with `nameOrString` for a misspelled name."
- Holds when Lion is run: rule `analysis-reads-as-evaluator` holds. "`analyze(expression, environment)` reads a program as a run with that environment reads it, by the same scopes, found by the functions the evaluator finds them by: `definedIn`, `declaredIn`, and `bodyNames`, with `nameOrString` for a misspelled name."
- Holds when Lion is run: `analyze-environment` exists. "`analyze(expression, environment)` reads a program as a run with that environment reads it, by the same scopes, found by the functions the evaluator finds them by: `definedIn`, `declaredIn`, and `bodyNames`, with `nameOrString` for a misspelled name."
- Holds when Lion is run: `analyze-string` is `read-by-scope`. "Each string has a `meaning`: a `name` or a `binding`, with the binding it means or makes (a `parameter`, a `define` in a lambda's body or at the top, a `relation`, a `schema`, or the `environment`'s, with the pointers of the strings that bind it), a `logic-variable`, `data`, `unbound` where only a name can stand and nothing binds one, a `form`'s name, or the `keyword` `else`."
- Holds when Lion is run: `analysis-string-meaning` exists. "Each string has a `meaning`: a `name` or a `binding`, with the binding it means or makes (a `parameter`, a `define` in a lambda's body or at the top, a `relation`, a `schema`, or the `environment`'s, with the pointers of the strings that bind it), a `logic-variable`, `data`, `unbound` where only a name can stand and nothing binds one, a `form`'s name, or the `keyword` `else`."
- Holds when Lion is run: `analysis-relationships` is removed. "The `relationships` field, with its `reference-candidate` and `definition` kinds, is gone."
- Holds when Lion is run: `editor-string-meanings` exists. "The graph editor analyzes a program with the environment its runs bind and shows under each string what it means there; selecting a name or a binding outlines the binding and every string that means it."

<a id="call-head-name"></a>

## call-head-name

Now: `name-looked-up-where-the-call-runs`.

- 2026-11-19 `call-head-name`: `name-looked-up-where-the-call-runs` over `settled-by-scope-as-data`, `database-names-anywhere`: "The first element of an array names what the array does, so a string there is a name and never data: one that no scope declares is looked up where the call runs, among the bindings the run has by then. A relation or function that code `eval` ran has bound is called, in plain code and in a rule, query, or `find` alike: after `["eval", ["quote", ["relation", "visited", ["city"]]]]`, `["find", "?c", ["visited", "?c"]]` asks the relation, while the string `"visited"` anywhere else is data." (`logic-forms-read-by-scope.json`)

<a id="logic-forms-read-by-scope"></a>

### Logic forms, forms that wait, and code that `eval` runs read strings by the scopes they are written in

Recorded 2026-11-19 in `history/notes/logic-forms-read-by-scope.json`.

**Context.** Once a string meant what the scopes it is written in declare, plain code kept data as data, but a logic form did not. After `["eval", ["quote", ["define", "later", 5]]]`, the string `"later"` was `"later"` in plain code and 5 in `["find", "?v", ["=", "?v", "later"]]`, because a logic form compiled its parts when it ran, and a run's scope was the environment itself, which `eval` had bound the name in by then. A cond or match that waits kept every name the environment bound, so a rule saved in a snapshot loaded with another meaning. And code that `eval` runs declared nothing it defined: `["eval", ["quote", ["begin", ["define", "g", ["lambda", [], 1]], ["g"]]]]` failed, since `["g"]` was compiled while `g` was data. The graph editor's session found the first while it checked its reading of strings against runs. Reading logic forms by their scopes then broke a pattern the record's own probes use: code that `eval` runs declares relations, such as a snapshot loaded under new names, and the program asks them by name after it. Those calls had worked only because logic forms read the environment as it was when they ran.

**Decision.** The parts of a logic form are read by the scope the form is written in, as plain code is: a `find`, a `rule`, a `fact`, a `query`, an `assuming`, and every other form that reads or changes the database compiles its parts there, so a string means in them what it means in plain code beside them. A scope keeps the names it declared when code was compiled in it: a name that code `eval` runs binds later is not among them, also when compiled code asks its scope while it runs, as a form that waits does when it keeps the values of the names it reads. Code that `eval` runs is a program: it declares the names it defines, in the body `eval` stands in, and the relations and schemas it declares, from its start. The first element of an array names what the array does, so a string there is a name and never data: one that no scope declares is looked up where the call runs, among the bindings the run has by then. A relation or function that code `eval` ran has bound is called, in plain code and in a rule, query, or `find` alike: after `["eval", ["quote", ["relation", "visited", ["city"]]]]`, `["find", "?c", ["visited", "?c"]]` asks the relation, while the string `"visited"` anywhere else is data.

**Consequences.** `partIn` in `special-forms/logic.ts` compiles a form's parts in its scope, once each; `asWritten` in `environment.ts` is a scope as it was when code was compiled, which counts the bindings each frame had, since bindings are never taken away; `run`, `evaluate`, `eval`, and a lambda compiled when it is first called compile in it; a lambda keeps the scope it is written in, so a waiting form and a lambda a rule holds keep only the names that scope declares. Properties in `evaluation/tests/scopes.test.ts` check that a string gives in a `find`, a rule, a waiting rule after a snapshot, a `fact`, an `assuming`, a lambda, and a `query` what it gives in plain code, with the name bound by `eval` after compiling and with it declared, and that code run by `eval` gives what the same code run as a program gives. The analysis that the graph editor shows reads the head of a call as the evaluator does: a string there that no scope declares is `unbound`, a name nothing binds where it is written, and not data.

**Alternatives considered.**

- Compile every part of a logic form when the form is compiled. Which parts a form evaluates, and how, is the form's to say as it runs: a `retract` holds a rule form and evaluates its parts, and an `assuming` holds its changes. A scope that shows the names as they were written gives every part the same reading whenever it is compiled.
- Copy the names a scope declares each time code is compiled. A run's scope holds every library name, so each `eval` would copy hundreds of names; counting the bindings a frame had reads the same at no cost until something binds more.
- Leave code that `eval` runs without declarations of its own. A program run by `eval` would mean something else than the same program run on its own: its functions could not call each other.
- Let a relation or schema be a name, wherever no scope declares it, from when the database declares it. It would be a second rule for strings, by the kind of value bound, and a relation bound later would turn data into a name. The head of a call is never data, so looking its name up where the call runs changes no program that ran, and needs no rule of its own.
- Keep every string settled by scope, the head of a call too, and have such programs ask in a later run. Code that loads relations with `eval` and asks them would stop working, and a goal over a relation name that became data would wait instead of failing, so some programs would give other answers without an error.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `logic-form-strings`: `written-scope`. "The parts of a logic form are read by the scope the form is written in, as plain code is: a `find`, a `rule`, a `fact`, a `query`, an `assuming`, and every other form that reads or changes the database compiles its parts there, so a string means in them what it means in plain code beside them. A scope keeps the names it declared when code was compiled in it: a name that code `eval` runs binds later is not among them, also when compiled code asks its scope while it runs, as a form that waits does when it keeps the values of the names it reads. Code that `eval` runs is a program: it declares the names it defines, in the body `eval` stands in, and the relations and schemas it declares, from its start. The first element of an array names what the array does, so a string there is a name and never data: one that no scope declares is looked up where the call runs, among the bindings the run has by then. A relation or function that code `eval` ran has bound is called, in plain code and in a rule, query, or `find` alike: after `["eval", ["quote", ["relation", "visited", ["city"]]]]`, `["find", "?c", ["visited", "?c"]]` asks the relation, while the string `"visited"` anywhere else is data."
- Holds when Lion is run: rule `strings-settled-by-scope` holds. "The parts of a logic form are read by the scope the form is written in, as plain code is: a `find`, a `rule`, a `fact`, a `query`, an `assuming`, and every other form that reads or changes the database compiles its parts there, so a string means in them what it means in plain code beside them. A scope keeps the names it declared when code was compiled in it: a name that code `eval` runs binds later is not among them, also when compiled code asks its scope while it runs, as a form that waits does when it keeps the values of the names it reads. Code that `eval` runs is a program: it declares the names it defines, in the body `eval` stands in, and the relations and schemas it declares, from its start. The first element of an array names what the array does, so a string there is a name and never data: one that no scope declares is looked up where the call runs, among the bindings the run has by then. A relation or function that code `eval` ran has bound is called, in plain code and in a rule, query, or `find` alike: after `["eval", ["quote", ["relation", "visited", ["city"]]]]`, `["find", "?c", ["visited", "?c"]]` asks the relation, while the string `"visited"` anywhere else is data."
- Holds when Lion is run: `string-in-find-bound-after-compile` is `data`. "The parts of a logic form are read by the scope the form is written in, as plain code is: a `find`, a `rule`, a `fact`, a `query`, an `assuming`, and every other form that reads or changes the database compiles its parts there, so a string means in them what it means in plain code beside them. A scope keeps the names it declared when code was compiled in it: a name that code `eval` runs binds later is not among them, also when compiled code asks its scope while it runs, as a form that waits does when it keeps the values of the names it reads. Code that `eval` runs is a program: it declares the names it defines, in the body `eval` stands in, and the relations and schemas it declares, from its start. The first element of an array names what the array does, so a string there is a name and never data: one that no scope declares is looked up where the call runs, among the bindings the run has by then. A relation or function that code `eval` ran has bound is called, in plain code and in a rule, query, or `find` alike: after `["eval", ["quote", ["relation", "visited", ["city"]]]]`, `["find", "?c", ["visited", "?c"]]` asks the relation, while the string `"visited"` anywhere else is data."
- Stated, not checked by running Lion: decided `eval-code-declarations`: `declares-its-definitions`. "The parts of a logic form are read by the scope the form is written in, as plain code is: a `find`, a `rule`, a `fact`, a `query`, an `assuming`, and every other form that reads or changes the database compiles its parts there, so a string means in them what it means in plain code beside them. A scope keeps the names it declared when code was compiled in it: a name that code `eval` runs binds later is not among them, also when compiled code asks its scope while it runs, as a form that waits does when it keeps the values of the names it reads. Code that `eval` runs is a program: it declares the names it defines, in the body `eval` stands in, and the relations and schemas it declares, from its start. The first element of an array names what the array does, so a string there is a name and never data: one that no scope declares is looked up where the call runs, among the bindings the run has by then. A relation or function that code `eval` ran has bound is called, in plain code and in a rule, query, or `find` alike: after `["eval", ["quote", ["relation", "visited", ["city"]]]]`, `["find", "?c", ["visited", "?c"]]` asks the relation, while the string `"visited"` anywhere else is data."
- Holds when Lion is run: `eval-code-own-definitions` is `declared`. "The parts of a logic form are read by the scope the form is written in, as plain code is: a `find`, a `rule`, a `fact`, a `query`, an `assuming`, and every other form that reads or changes the database compiles its parts there, so a string means in them what it means in plain code beside them. A scope keeps the names it declared when code was compiled in it: a name that code `eval` runs binds later is not among them, also when compiled code asks its scope while it runs, as a form that waits does when it keeps the values of the names it reads. Code that `eval` runs is a program: it declares the names it defines, in the body `eval` stands in, and the relations and schemas it declares, from its start. The first element of an array names what the array does, so a string there is a name and never data: one that no scope declares is looked up where the call runs, among the bindings the run has by then. A relation or function that code `eval` ran has bound is called, in plain code and in a rule, query, or `find` alike: after `["eval", ["quote", ["relation", "visited", ["city"]]]]`, `["find", "?c", ["visited", "?c"]]` asks the relation, while the string `"visited"` anywhere else is data."
- Stated, not checked by running Lion: decided `call-head-name`: `name-looked-up-where-the-call-runs`. "The first element of an array names what the array does, so a string there is a name and never data: one that no scope declares is looked up where the call runs, among the bindings the run has by then. A relation or function that code `eval` ran has bound is called, in plain code and in a rule, query, or `find` alike: after `["eval", ["quote", ["relation", "visited", ["city"]]]]`, `["find", "?c", ["visited", "?c"]]` asks the relation, while the string `"visited"` anywhere else is data."
- Holds when Lion is run: `eval-declared-relation-asked-later` is `asked`. "The first element of an array names what the array does, so a string there is a name and never data: one that no scope declares is looked up where the call runs, among the bindings the run has by then. A relation or function that code `eval` ran has bound is called, in plain code and in a rule, query, or `find` alike: after `["eval", ["quote", ["relation", "visited", ["city"]]]]`, `["find", "?c", ["visited", "?c"]]` asks the relation, while the string `"visited"` anywhere else is data."

<a id="eval-code-declarations"></a>

## eval-code-declarations

Now: `declares-its-definitions`.

- 2026-11-19 `eval-code-declarations`: `declares-its-definitions` over `compiled-as-is`: "The parts of a logic form are read by the scope the form is written in, as plain code is: a `find`, a `rule`, a `fact`, a `query`, an `assuming`, and every other form that reads or changes the database compiles its parts there, so a string means in them what it means in plain code beside them. A scope keeps the names it declared when code was compiled in it: a name that code `eval` runs binds later is not among them, also when compiled code asks its scope while it runs, as a form that waits does when it keeps the values of the names it reads. Code that `eval` runs is a program: it declares the names it defines, in the body `eval` stands in, and the relations and schemas it declares, from its start. The first element of an array names what the array does, so a string there is a name and never data: one that no scope declares is looked up where the call runs, among the bindings the run has by then. A relation or function that code `eval` ran has bound is called, in plain code and in a rule, query, or `find` alike: after `["eval", ["quote", ["relation", "visited", ["city"]]]]`, `["find", "?c", ["visited", "?c"]]` asks the relation, while the string `"visited"` anywhere else is data." (`logic-forms-read-by-scope.json`)

<a id="form-name-definition-in-own-body"></a>

## form-name-definition-in-own-body

Now: `error-that-says-why`.

- 2026-11-19 `form-name-definition-in-own-body`: `error-that-says-why` over `definition-stays-the-form`: "A body that defines the name of a form it uses fails, as R7RS Scheme makes such a definition an error: `["define", "define", 1]` calls the name it defines, which the body declares from its start and which has no value yet. It fails with `UndefinedYetError`, whose message says that the body defines the form's name, so an array that starts with it calls that definition instead of being the form, and that the definition needs another name." (`form-name-definition.json`)

<a id="form-name-definition"></a>

### A body cannot define the name of a form it uses

Recorded 2026-11-19 in `history/notes/form-name-definition.json`.

**Context.** A body declares what it defines from its start, and a binding of a form's name makes an array that starts with it a call where the binding is in scope. So `["define", "define", 1]` is a call of the name it defines, read before it has a value, and failed with the message for any name read early, which told the reader to define it first or quote it, neither of which helps.

**Decision.** A body that defines the name of a form it uses fails, as R7RS Scheme makes such a definition an error: `["define", "define", 1]` calls the name it defines, which the body declares from its start and which has no value yet. It fails with `UndefinedYetError`, whose message says that the body defines the form's name, so an array that starts with it calls that definition instead of being the form, and that the definition needs another name.

**Consequences.** Only the message changed: `UndefinedYetError` says why when the name is a form's. A property in `evaluation/tests/scopes.test.ts` checks, for every form's name, at the top and in a lambda, that a body that uses the form and then defines its name fails with that message.

**Alternatives considered.**

- Let a definition of a form's name stay that form, as Racket's internal definitions do. The body's other definitions would still turn into calls, so which forms of a body define would depend on their order, which a body that declares its definitions from its start does not.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `form-name-definition-in-own-body`: `error-that-says-why`. "A body that defines the name of a form it uses fails, as R7RS Scheme makes such a definition an error: `["define", "define", 1]` calls the name it defines, which the body declares from its start and which has no value yet. It fails with `UndefinedYetError`, whose message says that the body defines the form's name, so an array that starts with it calls that definition instead of being the form, and that the definition needs another name."
- Holds when Lion is run: `body-defines-define` is `says-why`. "A body that defines the name of a form it uses fails, as R7RS Scheme makes such a definition an error: `["define", "define", 1]` calls the name it defines, which the body declares from its start and which has no value yet. It fails with `UndefinedYetError`, whose message says that the body defines the form's name, so an array that starts with it calls that definition instead of being the form, and that the definition needs another name."

<a id="logic-form-strings"></a>

## logic-form-strings

Now: `written-scope`.

- 2026-11-19 `logic-form-strings`: `written-scope` over `running-scope`: "The parts of a logic form are read by the scope the form is written in, as plain code is: a `find`, a `rule`, a `fact`, a `query`, an `assuming`, and every other form that reads or changes the database compiles its parts there, so a string means in them what it means in plain code beside them. A scope keeps the names it declared when code was compiled in it: a name that code `eval` runs binds later is not among them, also when compiled code asks its scope while it runs, as a form that waits does when it keeps the values of the names it reads. Code that `eval` runs is a program: it declares the names it defines, in the body `eval` stands in, and the relations and schemas it declares, from its start. The first element of an array names what the array does, so a string there is a name and never data: one that no scope declares is looked up where the call runs, among the bindings the run has by then. A relation or function that code `eval` ran has bound is called, in plain code and in a rule, query, or `find` alike: after `["eval", ["quote", ["relation", "visited", ["city"]]]]`, `["find", "?c", ["visited", "?c"]]` asks the relation, while the string `"visited"` anywhere else is data." (`logic-forms-read-by-scope.json`)

<a id="sum-rounding"></a>

## sum-rounding

Now: `nearest-exact-sum`.

- 2026-11-19 `sum-rounding`: `nearest-exact-sum` over `added-as-values-come`, `added-in-sorted-order`: "`aggregate/sum` gives the number nearest the exact sum of its values, rounded once, as Python's `math.fsum` does, so the order the values come in never changes it: `["aggregate/sum", ["array/make", 1e16, 1, -1e16]]` is 1 in any order. `aggregate/mean` divides that sum. A rule that aggregates, a merge of the candidates of a key, and a call on a list give the same sum for the same values. It fails with `ArithmeticError` only when the exact sum is beyond every number, also where adding in order would pass the largest number on the way: `[1e308, 1e308, -1e308]` sums to 1e308." (`exact-sums.json`)

<a id="exact-sums"></a>

### A sum is rounded once, so the order of its values never changes it

Recorded 2026-11-19 in `history/notes/exact-sums.json`.

**Context.** A rule's matches and a key's candidates come in no order the program can see, but `aggregate/sum` added them one at a time, so a sum of numbers that are not whole depended on the order: a rule added its matches sorted, and a merge and a call on a list in the order they came, so the same values could sum to 0.3333333333333333 or 0.33333333333333326. A property that compared a rule's sum with a model that added the facts in order failed now and then for that reason.

**Decision.** `aggregate/sum` gives the number nearest the exact sum of its values, rounded once, as Python's `math.fsum` does, so the order the values come in never changes it: `["aggregate/sum", ["array/make", 1e16, 1, -1e16]]` is 1 in any order. `aggregate/mean` divides that sum. A rule that aggregates, a merge of the candidates of a key, and a call on a list give the same sum for the same values. It fails with `ArithmeticError` only when the exact sum is beyond every number, also where adding in order would pass the largest number on the way: `[1e308, 1e308, -1e308]` sums to 1e308.

**Consequences.** `logic/aggregates.ts` sums with Shewchuk's exact partials and rounds once, half to even; where a partial sum passes the largest number, it adds the values exactly as whole numbers instead. A property in `logic/tests/aggregates.test.ts` checks the sum against a model that adds the values exactly as whole numbers and rounds once, for a list, a rule, and a merge, with the facts in another order; the models of the other properties that sum use it too. Another property puts large numbers first, so adding in order would overflow, and checks the sum against the same model.

**Alternatives considered.**

- Add the values in sorted order. The sum would no longer depend on the order, but would still round at every step, so it would be another number than the exact sum rounded, and only as stable as the sort.
- Leave the sum as the matches come and compare sums with a tolerance in the tests. The tests would pass while Lion's answers still depended on an order the program cannot see.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `sum-rounding`: `nearest-exact-sum`. "`aggregate/sum` gives the number nearest the exact sum of its values, rounded once, as Python's `math.fsum` does, so the order the values come in never changes it: `["aggregate/sum", ["array/make", 1e16, 1, -1e16]]` is 1 in any order. `aggregate/mean` divides that sum. A rule that aggregates, a merge of the candidates of a key, and a call on a list give the same sum for the same values. It fails with `ArithmeticError` only when the exact sum is beyond every number, also where adding in order would pass the largest number on the way: `[1e308, 1e308, -1e308]` sums to 1e308."
- Holds when Lion is run: `sum-exactly-rounded` is `nearest`. "`aggregate/sum` gives the number nearest the exact sum of its values, rounded once, as Python's `math.fsum` does, so the order the values come in never changes it: `["aggregate/sum", ["array/make", 1e16, 1, -1e16]]` is 1 in any order. `aggregate/mean` divides that sum. A rule that aggregates, a merge of the candidates of a key, and a call on a list give the same sum for the same values. It fails with `ArithmeticError` only when the exact sum is beyond every number, also where adding in order would pass the largest number on the way: `[1e308, 1e308, -1e308]` sums to 1e308."

<a id="research-page-engine"></a>

## research-page-engine

Now: `lion-command-worker`.

- 2026-11-19 `research-page-engine`: `lion-command-worker` over `bundled-engine`, `page-check-through-bundle`: "`build-explorer.mjs` asks the lion command the replay runs for it and puts it in the page, so the page, the model, and `page-check.json` run one Lion." (`research-page-runs-checking-lion.json`)

<a id="research-page-runs-checking-lion"></a>

### A research page runs the Lion of the lion command that checks it

Recorded 2026-11-19 in `history/notes/research-page-runs-checking-lion.json`.

**Context.** The research skill's page ran `assets/lion-engine.js`, a bundle of `@lionlang/core` that was rebuilt by hand at a release, while `page-check.json`, the model, and every check ran on the lion command. On 2026-11-19 the two disagreed: a page whose plan defined a name `rule` passed its check and failed in the browser, since the bundle still read `rule` as a form, and the bundle took `cond` conditions that are not true or false, which core now refuses. Outside this repository the published CLI that checks a page and the bundle the skill ships could differ the same way.

**Decision.** The lion command gives its own Lion for a browser: `lion worker` prints a Web Worker script, built with the command from the same core, that loads a saved database as `--database` does and runs programs against it. `build-explorer.mjs` asks the lion command the replay runs for it and puts it in the page, so the page, the model, and `page-check.json` run one Lion. The skill carries no engine of its own: `assets/lion-engine.js` and `scripts/engine.ts` are gone, and nothing needs rebuilding after a change to core.

**Consequences.** Building a page needs a lion command that has `lion worker`, which the CLI has after 0.13.1; until a release has it, a page built outside this repository needs `LION_CLI` to name a built CLI. A property in `packages/cli/src/tests/worker.test.ts` checks that the worker answers every program as the lion command does, against the same saved database, among them a definition named as a form and a condition that is not true or false; run on the old bundle, it fails at once on `["begin", ["define", "rule", 0], "rule"]`. A property of the skill checks that the page carries exactly what its lion command gives for `lion worker`, and that no page is built when the command gives nothing. Run on the lion command's worker, the summary of `research/runs/lion-improvements/page.json` failed, as its check did, since it asked `cond` whether a count was true; the bundle had shown it, so the plan now asks whether the count is greater than 0.

**Alternatives considered.**

- Keep the bundle, and fail a test when it is not built from the core in the tree. Two engines would stay, every change to core would carry a new bundle, and outside this repository the published CLI that checks a page would still differ from the bundle the skill ships.
- Run the page check through the bundle instead of the lion command. The page and its check would agree, but the model would be built and checked by another Lion than the one the page shows, and the bundle would still be rebuilt by hand.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `research-page-engine`: `lion-command-worker`. "`build-explorer.mjs` asks the lion command the replay runs for it and puts it in the page, so the page, the model, and `page-check.json` run one Lion."
- Holds when Lion is run: rule `research-page-runs-checking-lion` holds. "A research page runs the Lion of the lion command that checks it"
- Stated, not checked by running Lion: rule `rebuild-research-engine-after-core-change` is withdrawn. "The skill carries no engine of its own: `assets/lion-engine.js` and `scripts/engine.ts` are gone, and nothing needs rebuilding after a change to core."
- Holds when Lion is run: `research-page-engine` is `lion-worker`. "`build-explorer.mjs` asks the lion command the replay runs for it and puts it in the page, so the page, the model, and `page-check.json` run one Lion."
- Stated, not checked by running Lion: `research-engine-core-version` is `lion-command`. "Building a page needs a lion command that has `lion worker`, which the CLI has after 0.13.1"
- Holds when Lion is run: `lion-worker` exists. "`lion worker` prints a Web Worker script, built with the command from the same core, that loads a saved database as `--database` does and runs programs against it."
- Holds when Lion is run: `research-engine-bundle` is removed. "The skill carries no engine of its own: `assets/lion-engine.js` and `scripts/engine.ts` are gone"

<a id="schema-binds-its-value"></a>

## schema-binds-its-value

Now: `list-finite-schemas`.

- 2026-11-19 `schema-binds-its-value`: `list-finite-schemas` over `schema-values-function`, `size-bounded-listing`, `written-order`: "When nothing else binds the value schema/fits? checks, and its schema can list the values it allows, the goal binds the value to each of them that fits, as in binds its element to each item of a list." (`schemas-list-their-values.json`)

<a id="schemas-list-their-values"></a>

### A schema stands for each value it allows: schema/fits? binds the value it checks when its schema can list them

Recorded 2026-11-19 in `history/notes/schemas-list-their-values.json`.

**Context.** A logic variable in a schema already stood for a value, so ['schema/fits?', value, schema] bound the variables in its schema. But the value it checks had to be bound by something else first: ['find', '?x', ['schema/fits?', '?x', ['schema/anyOf', 1, 2, 3]]] was refused with '?x must first be bound', though the schema allows exactly three values, and ['in', '?x', [1, 2, 3]] binds the same variable to the same values. The research run on formal verification found that this is what Lion lacks for bounded search: its programs could search every sequence of commands up to a bound in plain code, but no schema could give the inputs. The consolidation of every run put it first in the build order, as the half of a solver that lists finite domains, and as the oracle the solver will be checked against.

**Decision.** When nothing else binds the value schema/fits? checks, and its schema can list the values it allows, the goal binds the value to each of them that fits, as in binds its element to each item of a list. Data lists itself, a record or list of schemas every way of choosing its parts, with and without a key whose schema is optional, schema/anyOf what its schemas list, schema/allOf what its first schema that can list lists, a predicate the values it says it accepts, as value/boolean? says false and true and value/null? says null, and a named schema what its shape lists. A named schema met again at the same value adds nothing, as it fits nothing more there when checked. schema/arrayOf takes the most items a list may have as a second argument, and then lists every such list. Every value listed is checked against the schema by the rule every check follows, so the value takes exactly the values that fit. A schema lists its values only where no relation goal, '=', or 'in' can bind the value first, and at most 100,000 of them.

**Consequences.** Bounded search needs no program of its own: ['find', '?run', ['and', ['schema/fits?', '?run', ['schema/arrayOf', 'Move', 2]], test]] tries every run of at most two moves. A value in a rule head can come from a schema, and so can the rows of a rule, under not with exists, in a find, and after a snapshot, with the same answers. No program that worked changes: a body whose relation goals or tests bind a variable binds it the same way, since a schema lists only where nothing else can. A schema that cannot list its values, because it allows infinitely many, as value/integer? and schema/recordOf do, or is a predicate that does not say which it accepts, or names itself inside its values, still leaves the value unbound, and the message now says why. schema/arrayOf takes one or two arguments.

**Alternatives considered.**

- A function, schema/values, that gives the list of values a schema allows, to use with in. schema/fits? is already the goal that binds through a schema, and find already turns a goal's answers into a list, so a second way to say the same thing would add a function and a rule for when to use which.
- List every schema up to a size, integers and strings included. value/integer? allows infinitely many values of every size, so a size does not make it finite, and a listing that silently stops would make not claim that no value exists when only the listed ones were tried. Numbers will be bound by the constraints a question puts on them, which is the solver's half.
- Let a schema check bind its value where it is written, before the relation goals after it. A schema that allows many values would be listed where a relation could bind the value from a few rows, and could exceed the limit; goal order already never matters in Lion.
- A general bound on the size of a value, for any schema. A list's length is what bounded search over commands needs, it is what JSON Schema calls maxItems, and readers do not think of values in counts of their parts.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `schema-binds-its-value`: `list-finite-schemas`. "When nothing else binds the value schema/fits? checks, and its schema can list the values it allows, the goal binds the value to each of them that fits, as in binds its element to each item of a list."
- Holds when Lion is run: `schema-lists-its-values` is `lists`. "When nothing else binds the value schema/fits? checks, and its schema can list the values it allows, the goal binds the value to each of them that fits, as in binds its element to each item of a list."
- Holds when Lion is run: rule `schema-binds-its-value` holds. "When nothing else binds the value schema/fits? checks, and its schema can list the values it allows, the goal binds the value to each of them that fits, as in binds its element to each item of a list."
- Holds when Lion is run: `schema/arrayOf-most` exists. "schema/arrayOf takes the most items a list may have as a second argument, and then lists every such list."
- Holds when Lion is run: `schemas-listing-their-values` exists. "A schema lists its values only where no relation goal, '=', or 'in' can bind the value first, and at most 100,000 of them."

<a id="solve-typed-variables"></a>

## solve-typed-variables

Now: `exact-linear-decision-in-lion`.

- 2026-11-19 `solve-typed-variables`: `exact-linear-decision-in-lion` over `z3-in-webassembly`, `formula-terms`, `bounded-labelling`, `real-relaxation`, `limited-listing`: "The solver is Lion's own, with exact rationals: Fourier and Motzkin's method for numbers that may be any number, Pugh's Omega test for whole numbers." (`solve-typed-variables.json`)

<a id="solve-typed-variables"></a>

### A variable that a schema types and no goal binds is solved for: the filters about it become constraints, decided exactly in Lion

Recorded 2026-11-19 in `history/notes/solve-typed-variables.json`.

**Context.** Lion refused every filter over a variable no goal binds: 'Every variable in a rule head or a filter must first be bound by a relation goal, =, in, or schema/fits?'. So it could check the facts it had, and search every case up to a bound, but never ask about every value: not whether some whole number meets some constraints, nor prove that none does. The research run on formal verification ranked a solver for the values a question leaves open first of ten ideas, since proofs that every command keeps the invariants, invariant inference, proof certificates, and the CIRT run's schema inclusion all build on it. Step 1 let a schema that lists finitely many values bind the value it checks; this is the same rule for schemas whose values cannot be listed. The user allowed the rule change on 2026-11-19: 'you have my permission to change the documented rule that the solver build needs'.

**Decision.** A variable that a schema/fits? types with a schema that says what kind its values are, such as value/integer? or a record of such schemas, and that no relation goal, '=', or 'in' binds, stands for every value the schema allows. Every goal that waits only for such variables joins one step that runs after the goals its other variables need, and the solver decides it: sums of numbers times known numbers, comparisons, equality, and choices between cases, made by running the goals and the lambdas they call on symbolic values. The solver is Lion's own, with exact rationals: Fourier and Motzkin's method for numbers that may be any number, Pugh's Omega test for whole numbers. A goal the solver cannot decide, such as a product of two unknowns, a string function, or a question, waits for values: the step lists the values of the variables it needs from what the solver decides, and runs the goal on each, as plain code does; when they are infinitely many, it fails and names what the solver cannot reason about. The step binds the variables whose values make the answers, to each combination of values they take when those are finitely many, and fails, saying so, when they are infinitely many: every variable of the body in a query and a find, which give one answer or value for every match, and in a rule that aggregates, which combines one value from each; in any other rule, those its head shows. Variables nothing needs only need some values to exist, so exists asks whether one does and not proves that none does, for every value, and why explains a row with an example.

**Consequences.** The documented safety rule changes: a filter may use a variable that a schema types and no goal binds; a variable that nothing binds or types still fails as before. No program that worked changes, since the step runs only where the goals were stuck. A proof that every command keeps the invariants is now one Lion question with not and exists, over records whose fields a schema types, with the command's own lambda run on them. Bounded whole numbers no longer need a schema that lists each: their bounds are constraints, and a goal about them the solver cannot decide runs on each value they take. The solver reasons with exact numbers and plain code with floating-point numbers, which can round where the solver does not. A step gives at most 100,000 answers, splits into at most 4,096 cases, and makes at most 20,000 constraints, so every question ends soon. A number that may be any number and is tied to a whole number nothing needs counts as having infinitely many values when its range is an interval.

**Alternatives considered.**

- Z3 compiled to WebAssembly. It answers 'unknown' for some questions, which breaks one answer to every question, and it needs threads with SharedArrayBuffer, cross-origin headers in a browser, asynchronous calls, and Node rather than Bun, which Lion's tests run on.
- Formulas as values with a solver function, as Formulog does. It gives a subset of what solving the goals themselves gives, and asks programs to build formulas instead of writing the filters they already write.
- Whole numbers in a bounded range only, labelled one by one. It can check every value in a box but never prove a rule for every value, which the command proofs need.
- Treat whole numbers as numbers that may be any number. It can say a value exists where no whole one does: 2·x = 7 has a solution among the reals and none among whole numbers.
- List the answers of a variable with infinitely many values up to a limit. A list that silently stops would make a find look complete when it is not.
- Refuse every goal the solver cannot decide. A bounded question about a product of two unknowns, or about the string of a number, would fail where listing the same values succeeds, so where a filter stands would change its answer.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `solve-typed-variables`: `exact-linear-decision-in-lion`. "The solver is Lion's own, with exact rationals: Fourier and Motzkin's method for numbers that may be any number, Pugh's Omega test for whole numbers."
- Holds when Lion is run: rule `safe-rules` holds. "The documented safety rule changes: a filter may use a variable that a schema types and no goal binds; a variable that nothing binds or types still fails as before."
- Holds when Lion is run: `filter-typed-variable` is `solved`. "A variable that a schema/fits? types with a schema that says what kind its values are, such as value/integer? or a record of such schemas, and that no relation goal, '=', or 'in' binds, stands for every value the schema allows."
- Holds when Lion is run: rule `solved-questions` holds. "Variables nothing needs only need some values to exist, so exists asks whether one does and not proves that none does, for every value, and why explains a row with an example."
- Holds when Lion is run: `solving-typed-variables` exists. "Every goal that waits only for such variables joins one step that runs after the goals its other variables need, and the solver decides it"
- Holds when Lion is run: `solver-waiting-goal` is `solved`. "A goal the solver cannot decide, such as a product of two unknowns, a string function, or a question, waits for values"

<a id="eventually-rules"></a>

## eventually-rules

Now: `questions-over-run-states`.

- 2026-11-19 `eventually-rules`: `questions-over-run-states` over `temporal-forms`, `deferred-invariants`, `bounded-recursive-rules`: "A rule that must always hold is a question that no state of any run breaks it, one that must eventually hold a question that some state of every run meets it, and one checked at the end of every run a question about what array/reduce gives." (`eventually-rules.json`)

<a id="eventually-rules"></a>

### Rules about what must eventually happen are questions about the states of every run, which the solver decides for amounts of any size

Recorded 2026-11-19 in `history/notes/eventually-rules.json`.

**Context.** The formal-verification research ranked rules about what must eventually happen third of its ideas: Alchemy Verify checks one such rule at the end of every sequence of commands it explores. Lion's bounded search is the one schemas that list their values made: ['schema/arrayOf', 'Command', 3] stands for every run of up to three commands, and plain code folds a run with array/reduce. A rule that must eventually hold is about the states a run passes through, not only its last, and Lion had no way to get them. Rules cannot follow the states a step function computes: a rule that computes a new value in its head while recursing is refused, with a bound or without. And a run whose commands carry amounts no goal binds stopped at the solver, which ran no array function, so the amounts had to be listed from a box.

**Decision.** array/reductions gives every value array/reduce passes through, starting with the first, so a step function gives the states of a run; array/some? and array/every? say whether a function holds for some item and for each, stopping at the first that settles it, as Racket's ormap and andmap do. A rule that must always hold is a question that no state of any run breaks it, one that must eventually hold a question that some state of every run meets it, and one checked at the end of every run a question about what array/reduce gives. The solver runs array functions on a list of known length, such as one ['schema/arrayOf', schema, most] stands for, item by item, and in takes each of its items, so a check of every run of commands leaves the amounts the commands carry to the solver and covers every amount. A schema computed where it is written, such as one that holds a lambda or one a function is given, stands for its values as the same schema under a name does: listed when it can list them, solved for otherwise.

**Consequences.** No new form: the rules are questions Lion could already ask, over one new library function and two that any program can use. Which runs have run their course is the model's to say, as a goal about the run. The shortest run that breaks a rule is the least length a rule gives when the length is in its head and the run only in its body, and why shows a run of that length with amounts that break it. A step the solver cannot decide, such as one that multiplies two amounts, waits for listed values, so it needs the amounts bounded. why now explains a row the solver gave with the row's own values.

**Alternatives considered.**

- Temporal forms such as always and eventually. They name what a question over a run's states already says, and would need a meaning in every place a goal can stand.
- An invariant checked only at the end of a sequence of changes, as a deferred constraint is. Lion's database has no end of a sequence: each form is a change, an invariant already checks each form as a whole, and a run explored by the search is not a sequence of database changes.
- Rules that follow the states a step function computes, up to a depth. Lion refuses recursion that computes new values in a head because it may never finish, and a depth written as a filter is not a bound the check can see.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `eventually-rules`: `questions-over-run-states`. "A rule that must always hold is a question that no state of any run breaks it, one that must eventually hold a question that some state of every run meets it, and one checked at the end of every run a question about what array/reduce gives."
- Holds when Lion is run: `array/reductions` exists. "array/reductions gives every value array/reduce passes through, starting with the first, so a step function gives the states of a run"
- Holds when Lion is run: `array/some?` exists. "array/some? and array/every? say whether a function holds for some item and for each, stopping at the first that settles it, as Racket's ormap and andmap do."
- Holds when Lion is run: `array/every?` exists. "array/some? and array/every? say whether a function holds for some item and for each, stopping at the first that settles it, as Racket's ormap and andmap do."
- Holds when Lion is run: `solving-runs-of-commands` exists. "The solver runs array functions on a list of known length, such as one ['schema/arrayOf', schema, most] stands for, item by item, and in takes each of its items, so a check of every run of commands leaves the amounts the commands carry to the solver and covers every amount."
- Holds when Lion is run: `computed-schema-solved-for` is `solved`. "A schema computed where it is written, such as one that holds a lambda or one a function is given, stands for its values as the same schema under a name does: listed when it can list them, solved for otherwise."
- Holds when Lion is run: `why-solved-row-values` is `row-values`. "why now explains a row the solver gave with the row's own values."

<a id="command-proofs"></a>

## command-proofs

Now: `induction-as-a-question`.

- 2026-11-19 `command-proofs`: `induction-as-a-question` over `proof-form`, `database-state-proofs`, `outside-certificates`: "A proof that a command keeps a rule is a not over an exists of a typed state the rule allows, a typed command, and a next state that breaks the rule, with no new form" (`command-proofs.json`)

<a id="command-proofs"></a>

### A proof that every command keeps a rule is a question to the solver, and the solver's proofs come with certificates anyone can check

Recorded 2026-11-19 in `history/notes/command-proofs.json`.

**Context.** The formal-verification research ranked, after the solver, proofs that every command keeps the invariants, deciding when one schema includes another (the CIRT run's open idea), finding the invariants a proof needs, and certificates a small checker rechecks. With the solver working out every value a schema allows, and running a program's own lambdas, a proof by induction is a question Lion can already ask in the value model: is there a state the rule allows, and a command, whose next state breaks it? The solver could not run a lambda written inside a lambda, so a rule over a list of candidate rules failed, and it ran a library call with the wrong number of arguments, which plain code refuses. Its answer that no values exist came with no evidence a reader could check.

**Decision.** A proof that a command keeps a rule is a not over an exists of a typed state the rule allows, a typed command, and a next state that breaks the rule, with no new form; Houdini's search for the largest set of candidate rules that keeps itself is a few lines of Lion over the same question. The solver runs a lambda written where it runs, closed over the values it works out, by its body, and runs a library function only with as many arguments as the library says it takes. ['schema/includes?', a, b] says whether every value a allows fits b, decided exactly, by listing a's values or by the solver, and refused by name otherwise. Where the solver's step stopped a rule, why shows a certificate for each case the solver split the goals into: whole-number sums compared with 0 and steps that add earlier lines multiplied by whole numbers and, over whole numbers, tighten them, down to a false line, so plain arithmetic checks the proof.

**Consequences.** Proofs are about the value model, where a state is a record a schema types; a database's states are sets of facts, which the solver does not stand for, so a command given as changes to facts is checked by the bounded search, not proved. A case that only the Omega test's dark and grey shadows refute gets no certificate, and why shows none for it. schema/includes? refuses to say whether every number is a whole number, and anything about every string, since the solver can say a number is whole but not that it is not, and has no symbolic strings.

**Alternatives considered.**

- A proof form that names a state schema, a step, and invariants. It packages a question Lion can already ask, and would need a meaning wherever forms stand.
- Proofs over a database's facts, changed by assuming. The solver stands for values, not for sets of rows, so every state of a database is out of its reach; the bounded search checks such commands instead.
- Certificates from an outside proof checker, such as DRAT or Alethe. The solver's proofs are linear arithmetic, which Farkas' lemma and Chvátal–Gomory rounding certify in a few lines anyone can recheck, in Lion itself.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `command-proofs`: `induction-as-a-question`. "A proof that a command keeps a rule is a not over an exists of a typed state the rule allows, a typed command, and a next state that breaks the rule, with no new form"
- Holds when Lion is run: `schema/includes?` exists. "['schema/includes?', a, b] says whether every value a allows fits b, decided exactly, by listing a's values or by the solver, and refused by name otherwise."
- Holds when Lion is run: `solver-proof-certificates` exists. "Where the solver's step stopped a rule, why shows a certificate for each case the solver split the goals into"
- Holds when Lion is run: `solver-runs-closures` exists. "The solver runs a lambda written where it runs, closed over the values it works out, by its body"
- Holds when Lion is run: `solver-library-call-wrong-arguments` is `error`. "and runs a library function only with as many arguments as the library says it takes"
- Holds when Lion is run: `schema-includes-integer-in-number` is `included`. "['schema/includes?', a, b] says whether every value a allows fits b"

<a id="snapshot-form-order"></a>

## snapshot-form-order

Now: `rules-then-one-fact-form`.

- 2026-11-20 `snapshot-form-order`: `rules-then-one-fact-form` over `fact-form-per-relation-first`, `fact-form-per-relation-after-rules`, `load-without-checks`: "A snapshot writes the relations and schemas, then every rule, then one fact form with every fact, then the invariants." (`snapshot-rules-before-facts.json`)

<a id="snapshot-rules-before-facts"></a>

### A snapshot writes the rules, then every fact in one form, then the invariants

Recorded 2026-11-20 in `history/notes/snapshot-rules-before-facts.json`.

**Context.** A snapshot wrote each relation's facts in a fact form of its own, then each rule, then the invariants. Each form is a change checked on its own, and an equality rule is checked when it is added, so loading checked it against the facts and only the rules written before it. A database built rules first, such as twins a and b with mothers eve and fay registered for a, which an equality rule and the twins' rules make one only together, was saved and then failed to load with 'Adding this rule breaks an invariant'. The README said that loading checks invariants against the whole database. The weights session found this on 2026-11-20 and the user agreed to the change.

**Decision.** A snapshot writes the relations and schemas, then every rule, then one fact form with every fact, then the invariants. Loading it adds the rules to a database with no facts, then checks every fact once, as one change, against the whole program, and then the invariants, as the database the snapshot was taken of was checked when its facts came.

**Consequences.** A database whose facts hold only beside every rule loads as it was saved, and saving the loaded database gives the same program. A rule whose body holds with no facts, such as one of only not goals, is now added to a database with no facts; it is still checked, and refused only if it breaks a key or an invariant there. Programs that read a snapshot's forms find one fact form, after the rules.

**Alternatives considered.**

- A fact form per relation, before the rules, as before. The rules are then checked against facts without the rules that make them hold, so a valid database fails to load.
- The facts after the rules, in a form per relation. Facts of two relations that hold only together, such as a twin and a registered mother, would still be checked one relation at a time.
- Load a snapshot without checking it. A snapshot is ordinary Lion, and evaluating it as any program is evaluated is what makes it one.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `snapshot-form-order`: `rules-then-one-fact-form`. "A snapshot writes the relations and schemas, then every rule, then one fact form with every fact, then the invariants."

<a id="key-clash-told-from-rows"></a>

## key-clash-told-from-rows

Now: `rows-there-are`.

- 2026-11-20 `key-clash-told-from-rows`: `rows-there-are` over `derive-from-nothing`, `followed-run`, `no-rule`, `counts-by-rule`, `broken-group-again`: "A group whose rows break a key keeps them, exactly as deriving from nothing gives them, and keeps why: a question that reads the group, or a group derived from it, fails with it at once. The clash is told from the rows there are" (`key-clash-told-from-rows.json`)

<a id="key-clash-told-from-rows"></a>

### Rows that break a key are kept, and the clash is told from the rows there are

Recorded 2026-11-20 in `history/notes/key-clash-told-from-rows.json`.

**Context.** A change whose rows break a key, such as a twin of two registered mothers, was refused by an invariant that derived every group from nothing to find the clash again. The message named the rule that gave a row as the run that derived it saw it, and a run that followed a change saw only the rules of the rows that change gave. So telling the clash from the followed run was fast but could name another rule, or none, than a database that derived nothing; naming no rule was the other way to be fast. Refusing such a twin 20 times, and asking a mother after each, took 8.0 s among 10,000 people and over 60 s among 100,000. The user asked for both: fast, and a message that names a rule exactly as a database that derived nothing names it.

**Decision.** A group whose rows break a key keeps them, exactly as deriving from nothing gives them, and keeps why: a question that reads the group, or a group derived from it, fails with it at once. The clash is told from the rows there are: of the pairs of rows that hold with one key, the one whose rows sort first; of its two rows, the one a rule gives now, or the one that sorts later when rules give both; and of the rules that give it, the one whose written form sorts first. Which rules give a row is found when a clash is told, by asking each rule's body with the row's values, as why does, and through the rows that became it when a key or an equality rule made a value in them one with another. A change is followed past the group: a group that reads it is set aside as it was, and every other group is brought up to date. A refused change is followed back through the same model, and a kept one forgets the groups it set aside.

**Consequences.** Refusing a twin of two registered mothers 20 times, and asking a mother after each, takes about 20 ms whatever the number of people. A question about rows that break a key fails at once after the first time, and the next change is followed through them. Where a fact sorts between two rows that rules give with its key, the clash told is the pair whose rows sort first, where it was the pair whose held row sorted first. The rule named is one that gives the row now, where it was one that gave it during the derivation. A lookup that binds every column of a relation reads the row by its key, so asking a rule's body with a row's values builds no index.

**Alternatives considered.**

- Derive every group from nothing to tell the clash, as before. Exact, but a refusal costs a derivation of everything: 8.0 s for 20 refusals among 10,000 people, and over 60 s among 100,000.
- Tell the clash from the run that followed the change. Fast, but a followed run knows only the rules of the rows it gave, so it blamed another rule, or none, than a database that derived nothing.
- Name no rule in the message. Fast and exact, but the message would no longer say which rule to look at.
- Count each row's candidates by rule, kept up to date. Exact and cheap to read, but every row of a keyed relation would carry a count per rule through every change, and a row a merge gave would have to follow the rules of each row that became it. The rows already hold what telling a clash needs.
- Derive only the broken group again, on top of the model set aside. Exact, but the group that breaks a key is usually the large one, so it costs nearly what deriving everything does.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `key-clash-told-from-rows`: `rows-there-are`. "A group whose rows break a key keeps them, exactly as deriving from nothing gives them, and keeps why: a question that reads the group, or a group derived from it, fails with it at once. The clash is told from the rows there are"
- Holds when Lion is run: `key-clash-pair-told` is `rows-that-sort-first`. "of the pairs of rows that hold with one key, the one whose rows sort first"
- Holds when Lion is run: `key-clash-rule-named` is `gives-now`. "of the rules that give it, the one whose written form sorts first. Which rules give a row is found when a clash is told, by asking each rule's body with the row's values"
- Holds when Lion is run: `derived-rows-after-a-change-a-key-refuses` is `followed-back`. "A refused change is followed back through the same model"
- Holds when Lion is run: `derived-rows-after-a-kept-change-whose-rows-break-a-key` is `kept`. "A group whose rows break a key keeps them"

<a id="begin-waits-as-a-whole"></a>

## begin-waits-as-a-whole

Now: `whole-form-but-the-program`.

- 2026-11-20 `begin-waits-as-a-whole`: `whole-form-but-the-program` over `whole-form-everywhere`, `only-while-written`, `definitions-left-out`, `from-the-waiting-expression`: "A `begin` waits for an expression before its last as `cond` waits for a condition" (`begin-waits-as-a-whole.json`)

<a id="begin-waits-as-a-whole"></a>

### A begin waits as a whole for an expression before its last

Recorded 2026-11-20 in `history/notes/begin-waits-as-a-whole.json`.

**Context.** A `begin` in a rule body, a query, or a `find` gave its last expression's value and dropped an earlier one that waited for a logic variable, so that expression never ran. With `pair` defined as `["lambda", ["n"], ["begin", ["schema/assert", "n", "value/number?"], ["array/make", "n", "n"]]]`, the program `["find", ["pair", "?item"], ["in", "?item", ["array/make", 3, "three"]]]` gave `[[3,3],["three","three"]]`, while `["pair", "three"]` fails. A question before the last was dropped too, and with it the calls in its arguments and a `find`'s whole search. But a program is a `begin` as well, and its forms often name a value that waits, such as `["define", "half", ["number/divide", "?n", 2]]`, for a later query to read.

**Decision.** A `begin` waits for an expression before its last as `cond` waits for a condition: one that waits for a logic variable, or a question while a rule, a query, or a `find` is written, makes the whole form wait, and the form runs every expression once the variables are bound, leaving a question it does not need unasked, as plain code does. A program's own `begin`, and a `begin` among its forms, runs its forms one at a time instead, as Scheme splices a top-level `begin` into the program, so a definition there of a value that waits names it and the forms after it run.

**Consequences.** In every place an expression can stand, a `begin` now gives what plain code gives with the variables' values in place, and a function that checks its argument first checks it in a rule, a query, and a `find`. The expressions before the one that waited ran once when the rule was written, and run again for each answer, as a `cond`'s conditions do. A program's forms run as before. In plain code outside any rule, a question before the last is still given up without waiting, so a term built there leaves out the calls in such a question's arguments.

**Alternatives considered.**

- Wait as a whole everywhere, the program's own begin too. A program that names a value that waits, or a logic variable, as `["define", "again", "?x"]`, would wait at that definition and never run its later forms.
- Wait only while a rule, a query, or a find is written. Every place a rule holds would agree with plain code, but a term built in plain code, such as `["define", "pairs", ["pair", "?item"]]`, would leave the check out, and a later `find` that reads `pairs` would skip it, where a `cond` in its place waits.
- Leave out a definition's value, since its name keeps it. A rule's `begin` that defines a name nobody reads would never run the definition: `["begin", ["define", "t", ["number/divide", 1, "?x"]], 3]` would give 3 where plain code fails for 0. And the exception would be kept by the names of two forms.
- Wait only from the expression that waits on. The expressions before it would run once, when the rule is written, where plain code runs them for each answer, and each place the form can wait would need the rest of the form compiled on its own.

**What it asserts, checked.**

- Stated, not checked by running Lion: decided `begin-waits-as-a-whole`: `whole-form-but-the-program`. "A `begin` waits for an expression before its last as `cond` waits for a condition"
- Holds when Lion is run: `program-begin-after-a-definition-that-waits` is `runs-on`. "A program's own `begin`, and a `begin` among its forms, runs its forms one at a time instead, as Scheme splices a top-level `begin` into the program"

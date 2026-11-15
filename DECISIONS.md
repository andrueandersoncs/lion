<!-- Written by `bun run history write` from the project record in history/. Change the record, not this file. -->

# Decisions

Why Lion is the way it is. Each decision says what called for it, what was decided, what follows from it, what else was considered, and the commits it was made in. The record holds 48 decisions, and 46 of them are in force. They are kept in `history/decisions/`, and this page is written from them.

| Decided | Decision | Status |
| --- | --- | --- |
| 2025-12-03 | [A Lion program is a JSON value, evaluated as it is, with no parser of its own](#json-programs) | In force |
| 2025-12-11 | [The evaluator is written with Effect, and evaluating a program gives an Effect](#evaluate-with-effect) | In force |
| 2026-03-20 | [Library functions are named `module/name`, with modules named for the kind of value they work on, such as `number/add`](#library-names-module-slash-name) | In force |
| 2026-03-20 | [Every commit runs the tests and the formatter, and CI checks every pull request and push to `main`](#quality-gates) | In force |
| 2026-03-27 | [Evaluation runs to its end in one pass, and does not pause at host calls to resume from a log](#no-resumable-evaluation) | In force |
| 2026-03-29 | [The coding agent in `packages/agent` is a Lion program, `agent.json`, run by a small host file](#agent-as-lion-program) | In force |
| 2026-03-30 | [Special forms are written with a leading slash, such as `"/define"`](#special-forms-slash-prefix) | Superseded by [Special forms keep plain names, such as `"define"`, with no prefix](#special-forms-plain-names) |
| 2026-03-31 | [An array is always a special form or a call, never a list that evaluates to itself](#arrays-are-never-data) | In force |
| 2026-03-31 | [Special forms keep plain names, such as `"define"`, with no prefix](#special-forms-plain-names) | In force |
| 2026-04-02 | [A record pattern in `match` fits any record that has the pattern's keys with values that fit](#record-patterns-by-keys) | Superseded by [A record fits only a record with the same keys, and `schema/open` allows more](#records-are-exact) |
| 2026-04-04 | [Environments form a chain from local to global, and a lambda closes over the environment it is made in](#lexical-closures) | In force |
| 2026-09-17 | [The REPL is a semantic graph editor over the program's JSON, and the source view and the `/stream` prototype are gone](#graph-editor-is-the-repl) | In force |
| 2026-09-17 | [Lion moves from Effect 3 to Effect 4](#effect-v4) | In force |
| 2026-09-21 | [`@lionlang/cli` carries its own copy of `@lionlang/core` and the built graph editor, so it is released with every core release](#cli-bundles-editor) | In force |
| 2026-11-04 | [Every example on lionlang.dev runs on the real `@lionlang/core`, and the docs build writes each example's real result](#live-examples-run-real-core) | In force |
| 2026-11-10 | [Logic programming in Lion is Datalog, built into the Lisp as ordinary forms and values](#datalog-logic-layer) | In force |
| 2026-11-10 | [A recursive rule cannot compute new values for its head, so evaluation always ends](#recursion-cannot-compute-values) | In force |
| 2026-11-10 | [Recursion may aggregate only through lattice aggregates, whose values move one way](#lattice-recursion) | In force |
| 2026-11-10 | [A query with a known argument runs a magic-sets rewrite and gives the answers full evaluation gives](#goal-directed-magic-sets) | In force |
| 2026-11-10 | [A keyed relation holds one row per key, and a fact whose key is present replaces the row](#keyed-relations-upsert) | In force |
| 2026-11-10 | [A logic database is saved as a Lion program of forms that rebuild it](#snapshots-are-programs) | In force |
| 2026-11-11 | [A change to the logic database is all or nothing, keeps every invariant, and adds nothing the database already holds](#all-or-nothing-changes) | In force |
| 2026-11-11 | [Lion's features and semantics are designed by the principle of least astonishment](#least-astonishment) | In force |
| 2026-11-11 | [Lion's tests are property-based, checked against a model, a round trip, or an equivalence](#property-based-tests) | In force |
| 2026-11-11 | [Lion's values are JSON, so the standard library never gives `undefined`, `NaN`, or `Infinity`](#values-are-json) | In force |
| 2026-11-12 | [Where the behavior of a base form is unclear, Lion does what Scheme does](#scheme-where-unclear) | In force |
| 2026-11-12 | [Whatever needs a logic variable's value waits until the variable is bound](#waiting-rule) | In force |
| 2026-11-12 | [Whatever needs the value of a goal asks it](#asking-rule) | In force |
| 2026-11-12 | [Measure every change to core for its code, its semantics, its speed, and how well its tests catch broken code](#measure-every-change) | In force |
| 2026-11-12 | [An unbound `module/name` string that reads as a misspelled name is an `UnboundNameError`, and any other unbound string stays a string](#misspelled-names-are-errors) | In force |
| 2026-11-12 | [A record fits only a record with the same keys, and `schema/open` allows more](#records-are-exact) | In force |
| 2026-11-12 | [Anything is a schema, one rule says what fits it, and a schema with logic variables in it is a pattern](#schemas-are-logic) | In force |
| 2026-11-12 | [Every feature is used in a docs example with output that was run, and the docs build fails when a special form or library function is in no example](#every-feature-in-docs) | In force |
| 2026-11-13 | [A call gives a function as many arguments as it takes, and any other number fails with one form of message](#arity-rule) | In force |
| 2026-11-13 | [The research skill counts the publishers who give an answer first-hand, not the sources that state it](#research-counts-publishers) | In force |
| 2026-11-13 | [Text built on Lion is computed by Lion expressions, not filled into a template, and a helper any program would want goes into the standard library](#lion-computes-page-text) | In force |
| 2026-11-13 | [A belief is judged by the evidence of every version from the one it was formed in on, and an explanation by the versions where its problem shows](#beliefs-judged-from-their-version) | In force |
| 2026-11-13 | [The skills' scripts run the published `@lionlang/cli`, never the copy of Lion in the project](#skills-use-published-cli) | In force |
| 2026-11-13 | [The agent copies a figure as its source writes it and the model computes the rest, so every number in a claim must be written in its quote](#engine-computes-model-interprets) | In force |
| 2026-11-13 | [A question only the user may settle is asked, not answered by the agent, and an answer from anyone else is listed as presumed](#user-decides-ambiguity) | In force |
| 2026-11-13 | [`why` shows every goal of a rule's body as it held, `=` and `in` among them](#why-shows-every-goal) | In force |
| 2026-11-14 | [Goal-directed queries share what is derived in full, and a relation is derived when a goal first reads it](#goal-directed-shares-full-relations) | In force |
| 2026-11-14 | [Keep the changelog and the decisions as a Lion model of the git history](#project-record-in-lion) | In force |
| 2026-11-14 | [Keep a research model of Lion's development that checks the project against itself](#research-model-of-development) | In force |
| 2026-11-15 | [A research lead is done when every question it pursues has an answer two publishers give first-hand](#lead-done-when-confirmed) | In force |
| 2026-11-15 | [A direction or a lead is set aside after as many misses in a row as its patience, counted since its last payoff](#patience-since-last-payoff) | In force |
| 2026-11-15 | [A version improves a score when its worst run beats the best that any earlier version was sure to give](#score-improves-past-noise) | In force |
| 2026-11-15 | [A version's runs of a score count only where what the score requires holds](#score-requirements) | In force |

<a id="json-programs"></a>

## A Lion program is a JSON value, evaluated as it is, with no parser of its own

Decided 2025-12-03. In force. First released in @lionlang/core 0.1.0.

### Context

The first commit, in December 2025, began an evaluator for a Lisp written in JSON. A Lisp needs literals, names, and lists of code, and a reader that turns program text into them. JSON already has numbers, booleans, `null`, strings, arrays, and records, and every language can read it.

### Decision

A program is a JSON value, and the evaluator takes that value as it is. Numbers, booleans, and `null` are themselves. A string is the value bound to it in the environment, and the string itself when nothing is bound to it. An array is a special form, such as `["quote", ["+", 1, 2]]`, or a call: its elements are evaluated, and when the first value is a function it is called with the others. A record keeps its keys and evaluates each of its values. `run(program, environment)` checks any value against the schema of a Lion expression and then evaluates it.

### Consequences

Lion has no reader and no syntax of its own: `JSON.parse` reads a program, and a program can be loaded from a file, an API, or a database, generated by another program, and compared like any other JSON. Whether a string is a name or text depends on the environment it meets, so `"x"` is `10` where `x` is bound to `10` and the text `"x"` everywhere else. A record such as `{"sum": ["math/+", "x", "y"], "product": ["math/*", "x", "y"]}` computes several results at once and keeps their keys.

### Changes that follow from it

- @lionlang/core 0.1.0: Lion, a Lisp whose programs are JSON. Numbers, booleans, and `null` are themselves; a string is the value its name is bound to, or else the string; an array is a special form or a call; and a record keeps its keys and evaluates its values. `run` from `@lionlang/core/evaluation/evaluate` evaluates a program in an environment, as an Effect.

### Commits

- `49abf02` initial commit
- `e888677` feat: finished simple evaluation and evalation tests
- `98c3cbc` adds README.md, run() simplification

<a id="evaluate-with-effect"></a>

## The evaluator is written with Effect, and evaluating a program gives an Effect

Decided 2025-12-11. In force. First released in @lionlang/core 0.1.0.

### Context

The first evaluator, in December 2025, was a plain recursive TypeScript function. It took the environment as a plain object, library functions were plain functions, and it threw `Error("Invalid expression")` when `eval` met a value that was not an expression.

### Decision

In December 2025 the evaluator was rewritten with Effect. Evaluating an expression returns an `Effect`, and a failure is a value in its error channel instead of a thrown exception. The environment is a service the evaluation reads from its context, holding a `Ref` of the bindings. `Match` dispatches on the kind of expression, and `Schema` says what a Lion expression and a Lion value are. Library functions return Effects too. `run(program, environment)` decodes the program, evaluates it, and provides the environment.

### Consequences

A host runs a Lion program as it runs any Effect, for example `Effect.runPromise(run(program, stdlib))`, so `@lionlang/core` depends on `effect` and its users meet Effect in its API. Errors are tagged values, such as `InvalidFunctionCallError`, that a host catches by tag. A host function may return a plain value or an Effect, and a call wraps a plain value. In March 2026 the evaluator's `Effect.gen` blocks were rewritten as pipelines of `pipe`, `Match`, and `Effect.flatMap`; later code uses both styles.

### Changes that follow from it

- @lionlang/core 0.1.0: Lion, a Lisp whose programs are JSON. Numbers, booleans, and `null` are themselves; a string is the value its name is bound to, or else the string; an array is a special form or a call; and a record keeps its keys and evaluates its values. `run` from `@lionlang/core/evaluation/evaluate` evaluates a program in an environment, as an Effect.

### Commits

- `57ac08c` wip: refactor to effect
- `f0c3573` feat: full effect conversion using matchers: “full effect conversion using matchers”
- `fc4959c` feat: effectify: “effectify”
- `d4226c6` remove effect.gen()s: “remove effect.gen()s”
- `b2ea83c` remove effect.gen() from primitive evaluation: “remove effect.gen() from primitive evaluation”
- `98c3cbc` adds README.md, run() simplification

<a id="library-names-module-slash-name"></a>

## Library functions are named `module/name`, with modules named for the kind of value they work on, such as `number/add`

Decided 2026-03-20. In force. First released in @lionlang/core 0.1.0.

### Context

The first standard library, in December 2025, was a flat set of names in the test environment: `+`, `<`, `not`, `if`, `list`, `first`, `get`. The functions were then grouped into modules in their own files, `math`, `logic`, `list`, `object`, and `func`, but each module was spread into the environment under its bare names.

### Decision

In March 2026 the standard library became one environment in which each function's name is its module's name, a slash, and its own name: `math/+`, `logic/not`, `list/head`. On April 2, 2026, the modules were renamed for the kind of value they work on, and their functions were named in words: `number/add` replaced `math/+`, `boolean/not` replaced `logic/not`, `array/make` replaced `list/list`, and new `string` and `value` modules joined `object`, `func`, and `console`. `logic/if` was not carried over; the `cond` form, added the day before, chooses between branches.

### Consequences

A name says which module a function comes from, and every module added later follows the same form: `aggregate`, `graph`, and `schema` sit beside the first eight. The rename changed every program written against the old names, `packages/agent/src/agent.json` among them, before the first release, so `@lionlang/core` 0.1.0 shipped with the names Lion still uses. A program that wants shorter names binds them itself, as the agent does with `["define", "[]", "array/make"]`.

### Changes that follow from it

- @lionlang/core 0.1.0: The standard library, named `module/function`: the `number`, `boolean`, `array`, `string`, `object`, `func`, `value`, and `console` modules.

### Commits

- `0529eec` adds ultracite, wip resumable evaluation
- `df689c0` adds pattern matching, refactors stdlib: “refactors stdlib”

<a id="quality-gates"></a>

## Every commit runs the tests and the formatter, and CI checks every pull request and push to `main`

Decided 2026-03-20. In force. First released in @lionlang/core 0.1.0.

### Context

Until March 2026 only the REPL package had a formatter configuration, and nothing ran the tests or a formatter before a commit or after a push.

### Decision

In March 2026 the repository adopted Ultracite, a preset of Biome lint and format rules, as `bun run check` and `bun run fix`, and a Husky pre-commit hook that runs the tests and then formats the staged files and stages them again. In September 2026 the hook moved from `bun test` to `bun run test`, which runs every workspace's tests through Turbo after the builds they depend on, `bun run typecheck` was added, and a GitHub Actions workflow on every pull request and every push to `main` installs with the frozen lockfile and runs `check`, `typecheck`, `test`, and `build`.

### Consequences

A commit whose tests fail is refused unless the hook is skipped, and every commit's files are formatted by the same rules. A pull request shows whether it lints, typechecks, passes its tests, and builds before it is merged. Later checks join the same workflow, such as the check of the site's asset versions, and `AGENTS.md` tells agents to run `bun run check`, the tests, and the build before committing.

### Commits

- `0529eec` adds ultracite, wip resumable evaluation: “adds ultracite”
- `b60f4a1` chore: harden project quality gates: “harden project quality gates”

<a id="no-resumable-evaluation"></a>

## Evaluation runs to its end in one pass, and does not pause at host calls to resume from a log

Decided 2026-03-27. In force. First released in @lionlang/core 0.1.0.

### Context

In March 2026 a spec, `packages/core/specs/resumable-evaluation.md`, asked for resumable evaluation, and the evaluator was built to it. Evaluation took an operation log. A call to an effectful function, which meant any function outside the standard library, was looked up in the log: with no entry, evaluation added an `operation_started` entry and stopped with `ContinuationNeededError`; with a matching `operation_completed` entry, it used the stored result and did not call the function. To continue, the host passed back a log with the completed entry, and the program was evaluated again from the start, every pure expression again and every effectful one from the log.

### Decision

Resumability was removed on March 27, 2026. The operation log, its service and schemas, and the errors `ContinuationNeededError` and `OplogMismatchError` were deleted, and a call to a host function calls it. The spec was deleted the same day.

### Consequences

An evaluation needs only its environment: the evaluator's type lost the log service and the two errors, and tests no longer provide an empty log. A host function is called once, when evaluation reaches it, and its result is not recorded anywhere. Lion has no way to stop a program at a host call and continue it later.

### Commits

- `2ebcfac` remove resumability: “remove resumability”
- `00f403c` adds building process, removes old spec

<a id="agent-as-lion-program"></a>

## The coding agent in `packages/agent` is a Lion program, `agent.json`, run by a small host file

Decided 2026-03-29. In force. First released in @lionlang/core 0.1.0.

### Context

On March 29, 2026, a proof of concept for a coding agent began in `packages/agent`: a terminal interface built with OpenTUI, written as a Lion program inside a TypeScript file and evaluated with `run`. Lion did not yet have `define` or `lambda`, and its standard library was a few modules of functions.

### Decision

The agent is a Lion program. Two days later it moved into its own file, `packages/agent/src/agent.json`, and `src/index.ts` became a host that binds what the program uses, the OpenTUI library, the AI SDK, Zod, `fs`, a renderer, and a model, into the environment and runs it. The interface, the message handling, the calls to the model, and the tools to read files, list directories, and edit files are Lion code. When the program needed something Lion lacked, the same commit added it to Lion: `lambda` and `object/new` came with the message box, `func/callback` and the `console` module with the input handler, and more `object` functions with the read-file tool.

### Consequences

Lion's features met a real host from then on: `define`, `lambda`, host interop, the module renames, and record patterns in `match` each changed the agent in the commit that made them, and the README lists the agent as a real-world Lion program. The program names its own shorthands with `define`, such as `["define", "()", "object/call-method"]` and `["define", "[]", "array/make"]`, rather than the language growing syntax for them. On April 5, 2026, the agent could edit files, and its commit calls that dogfooding.

### Changes that follow from it

- @lionlang/core 0.1.0: `packages/agent`, a coding agent written as a Lion program, `agent.json`, that drives a terminal interface and an AI model, with tools to read files and directories.

### Commits

- `ff59f98` initial POC for coding agent: “initial POC for coding agent”
- `ca00e8e` moves agent into .json file, implements basic fizzbuzz example: “moves agent into .json file”
- `1628fa3` implements more stdlib modules, finishes read-file tool in agent.json: “finishes read-file tool in agent.json”
- `9dd7605` adds read-directory tool and implements handling for non-string tool results
- `e5c7188` dogfooding achieved internally: “dogfooding achieved internally”

<a id="special-forms-slash-prefix"></a>

## Special forms are written with a leading slash, such as `"/define"`

Decided 2026-03-30. Superseded by [Special forms keep plain names, such as `"define"`, with no prefix](#special-forms-plain-names). First released in @lionlang/core 0.1.0.

### Context

Special forms and names share one space of strings: `["define", "x", 1]` is a form because its first element is the string `"define"`, and `define` refused to bind the names `begin`, `define`, `eval`, and `quote`. Library functions already had names of the form `module/name`, such as `math/+`. On March 30, 2026, the commit that added `lambda` also changed how forms are spelled.

### Decision

Every special form took a leading slash: `"/quote"`, `"/eval"`, `"/begin"`, `"/define"`, and the new `"/lambda"`. The names that `define` and `lambda` refused to bind became `/begin`, `/define`, `/eval`, and `/quote`.

### Consequences

Every program and test that used a special form changed its spelling, the agent's program in `packages/agent/src/index.ts` among them, as in `["/define", "message-box", ...]`. The prefix lasted one day, and no release used it.

### Commits

- `b673d05` adds lambda, adds object/new, adds slash-prefix to special forms, updates func/js-bind to func/bind, implements functional message appending in messages box in agent: “adds slash-prefix to special forms”

<a id="arrays-are-never-data"></a>

## An array is always a special form or a call, never a list that evaluates to itself

Decided 2026-03-31. In force. First released in @lionlang/core 0.1.0.

### Context

Until March 31, 2026, an array that was not a special form and whose first value was not a function evaluated to the array of its evaluated elements, so `[1, ["math/+", 2, 3], true]` gave `[1, 5, true]`. The same rule applied to a call of a name bound to nothing: `["math/sum", 1, 2]` gave back `["math/sum", 1, 2]` instead of failing.

### Decision

The auto-quoting of lists was removed. An array is a special form or a call, and an array whose first value is not a function fails with `InvalidFunctionCallError`. A list that is data is built by a function, `["list/list", 1, 2]` at the time and `["array/make", 1, 2]` since April 2026, or written inside `quote`.

### Consequences

A call of a misspelled or unbound name fails where it is written, instead of becoming a list that travels on through the program. The property test that every array of primitives evaluates to itself was deleted, and the tests of `begin`, `define`, `eval`, and `lambda` were rewritten to expect the new error. The README at the time said that all JSON is valid Lion code; the README written for 0.1.0 says that arrays are always treated as executable expressions.

### Alternatives considered

- **Keep auto-quoting: an array whose first value is not a function evaluates to the array of its evaluated elements.** The commit that removed it calls it too magical.

### Changes that follow from it

- @lionlang/core 0.1.0: Lion, a Lisp whose programs are JSON. Numbers, booleans, and `null` are themselves; a string is the value its name is bound to, or else the string; an array is a special form or a call; and a record keeps its keys and evaluates its values. `run` from `@lionlang/core/evaluation/evaluate` evaluates a program in an environment, as an Effect.

### Commits

- `1d1dacf` remove list auto-quote functionality, too magical: “remove list auto-quote functionality, too magical”
- `c6c3859` finish fixing tests after removing autoquote, revert keyword format back to no-prefix (not feeling it): “finish fixing tests after removing autoquote”

<a id="special-forms-plain-names"></a>

## Special forms keep plain names, such as `"define"`, with no prefix

Decided 2026-03-31. In force. First released in @lionlang/core 0.1.0.

Supersedes [Special forms are written with a leading slash, such as `"/define"`](#special-forms-slash-prefix).

### Context

On March 30, 2026, special forms took a leading slash, as in `["/define", "x", 1]`. The next day, while the tests were being fixed after list auto-quoting was removed, that spelling was reconsidered.

### Decision

Special forms went back to plain names: `quote`, `eval`, `begin`, `define`, and `lambda`, and every form added since, such as `cond` and `match`, has a plain name too. A form is the array whose first element is its name, and `define` and `lambda` refuse a form's name as a name to bind.

### Consequences

The forms read as their counterparts in Scheme and Racket do, and a slash is left to library names such as `number/add`. The tests written in the slash spelling were rewritten, and `@lionlang/core` 0.1.0 shipped with plain names.

### Alternatives considered

- **Keep the leading slash, as in `"/define"`.** The commit that reverted it says only that its author was not feeling it.

### Changes that follow from it

- @lionlang/core 0.1.0: The special forms `quote`, `eval`, `begin`, `define`, `lambda`, `cond`, and `match`. A lambda closes over the environment it is made in, and `match` takes a value apart with record patterns.

### Commits

- `c6c3859` finish fixing tests after removing autoquote, revert keyword format back to no-prefix (not feeling it): “revert keyword format back to no-prefix (not feeling it)”

<a id="record-patterns-by-keys"></a>

## A record pattern in `match` fits any record that has the pattern's keys with values that fit

Decided 2026-04-02. Superseded by [A record fits only a record with the same keys, and `schema/open` allows more](#records-are-exact). First released in @lionlang/core 0.1.0.

### Context

`match`, added on April 2, 2026, took a value, pairs of a predicate and a function, and a fallback function, and called the function of the first predicate that returned `true` for the value. The agent told the parts of an AI model's response apart by their `type`, with a lambda for each, such as `["lambda", ["c"], ["string/equals?", [".", "c", "type"], "text"]]`.

### Decision

A pattern can also be a record whose values are patterns. It fits a value that is a record, has every key of the pattern, and has at each of those keys a value that fits the pattern there; keys the pattern does not name are ignored, and record patterns nest. A predicate that fails or does not return a boolean does not fit. The agent's patterns became records such as `{"type": ["func/partial", "string/equals?", "text"]}`, and `func/partial` was added to build such predicates.

### Consequences

A pattern names only the keys it cares about, so one pattern fits records of many shapes, such as response parts that carry `text` or `output` beside `type`. A pattern cannot say that a key is absent or that a record has no other keys. `@lionlang/core` 0.1.0 shipped `match` with these record patterns.

### Changes that follow from it

- @lionlang/core 0.1.0: The special forms `quote`, `eval`, `begin`, `define`, `lambda`, `cond`, and `match`. A lambda closes over the environment it is made in, and `match` takes a value apart with record patterns.

### Commits

- `df689c0` adds pattern matching, refactors stdlib: “adds pattern matching”
- `96eed18` implement structural record pattern matching: “implement structural record pattern matching”

<a id="lexical-closures"></a>

## Environments form a chain from local to global, and a lambda closes over the environment it is made in

Decided 2026-04-04. In force. First released in @lionlang/core 0.1.0.

### Context

The first `lambda`, added on March 30, 2026, copied the bindings of the environment it was made in and ran its body in a new copy with its parameters added. A `define` in the body changed only that copy, so a lambda passed to `func/callback` could not set a global name, and a lambda never saw a name defined after it was made, its own among them. A comment in the code recorded that code inside a lambda had no access to the global environment.

### Decision

Each environment holds its own bindings and points to the environment around it, and the outermost is the global environment. A name is looked up from the innermost environment outward. Calling a lambda makes a new environment of its parameters whose parent is the environment the lambda was made in, not a copy of it. `define` binds in the global environment, also inside a lambda. A first fix copied the environment at each call and wrote the global bindings back when the call ended; the same morning, each environment's bindings moved into a `Ref` that every closure over it shares.

### Consequences

Closures nest: in `["lambda", ["x"], [["lambda", ["y"], [["lambda", ["z"], {"x": "x", "y": "y", "z": "z"}], 3]], 2]]` the innermost body sees all three parameters. A lambda sees a global defined after it was made, so it can call itself by the name it is defined under, and a callback that host code runs later can still set a global name. A `define` inside a lambda's body does not make a local name, as it would in Scheme: the README says `define` stores its value in the global environment.

### Alternatives considered

- **A lambda that runs in a copy of the bindings it was made with, as the first `lambda` did.** Code in its body could not reach the global environment: a `define` changed only the copy, and names defined later were missing.

### Changes that follow from it

- @lionlang/core 0.1.0: The special forms `quote`, `eval`, `begin`, `define`, `lambda`, `cond`, and `match`. A lambda closes over the environment it is made in, and `match` takes a value apart with record patterns.

### Commits

- `98ce5dd` implements proper global/local environment distinctions, fixes lambda bug: “implements proper global/local environment distinctions, fixes lambda bug”
- `a51324b` fixes define/lambda closure issue: “fixes define/lambda closure issue”
- `c63b79d` better solution to lambda/closure issue: “better solution to lambda/closure issue”
- `35446bc` implements functional getBinding()
- `861278b` more functionalization of environment.ts

<a id="graph-editor-is-the-repl"></a>

## The REPL is a semantic graph editor over the program's JSON, and the source view and the `/stream` prototype are gone

Decided 2026-09-17. In force. First released in @lionlang/core 0.2.0, @lionlang/cli 0.1.0, @lionlang/typesafe-ai 0.1.0.

### Context

`packages/repl` had held a web REPL since the end of December 2025. In April 2026 a prototype at `/stream` rendered Lion programs evaluated against an environment of React components and changed them with streams of JSON Patch operations. In September 2026 a product brief, `packages/repl/PRODUCT.md`, and 25 tickets in `docs/tickets/graph-editor/` set out a local-first editor for Lion programs that can exceed 1,000 graph nodes.

### Decision

The graph editor, Lion Fold Map, replaced the REPL at `/` on September 17, 2026. The program's JSON is canonical, and the semantic graph, outline, inspector, and results are derived from it; a graph edit becomes a minimal text edit that keeps the bytes of everything it does not touch. The old REPL route, `/stream`, and the UI-streaming code were removed in the same commit. Two days later the CodeMirror source view was removed too, so a program is edited through the graph, its nodes, and the inspector, and on September 21 every semantic branch and the output dock stayed open instead of folding away.

### Consequences

The editor keeps programs local, with no account or backend storage: it opens and saves files through the File System Access API, and downloads the file where a browser lacks it. `@lionlang/core` gained a semantic-analysis API, which the editor runs in a worker beside the layout. Exact JSON is still shown where a node unfolds, but there is no longer a text editor for a whole program.

### Alternatives considered

- **Keep the `/stream` prototype, which rendered React components from Lion source patched by streams of JSON Patch.** No documented product surface used it, and the editor's release ticket called for one coherent product with its superseded prototypes removed.

### Changes that follow from it

- @lionlang/core 0.2.0, @lionlang/cli 0.1.0, @lionlang/typesafe-ai 0.1.0: Lion Fold Map local-first graph editor at `/` with synchronized semantic graph, exact JSON source, inspector, outline, search, and result views.
- @lionlang/core 0.2.0, @lionlang/cli 0.1.0, @lionlang/typesafe-ai 0.1.0: Replaced the former REPL and `/stream` prototype with the graph editor.
- @lionlang/core 0.2.0, @lionlang/cli 0.1.0, @lionlang/typesafe-ai 0.1.0: Updated the Lion and REPL operating documentation and removed superseded demo assets and dependencies.

### Commits

- `b60f4a1` chore: harden project quality gates
- `bdc6d89` feat(repl): ship semantic graph editor: “ship semantic graph editor”
- `f27e671` refactor(repl): remove source editor view: “remove source editor view”
- `3567d25` feat(repl): keep graph editor always open: “keep graph editor always open”

<a id="effect-v4"></a>

## Lion moves from Effect 3 to Effect 4

Decided 2026-09-17. In force. First released in @lionlang/core 0.2.0, @lionlang/cli 0.1.0, @lionlang/typesafe-ai 0.1.0.

### Context

Lion's evaluator, standard library, tests, and other packages were written with Effect 3, `effect` `^3.21.0`. Effect 4 renamed and reshaped APIs the code used, such as `Schema.decodeUnknown`, `Schema.Tuple`, and `Effect.catchAll`, and in September 2026 it was a release candidate.

### Decision

On September 17, 2026, every package moved to Effect `4.0.0-rc.115`, with `@effect/vitest` to match, and the code was ported: `Schema.decodeUnknownEffect` for `Schema.decodeUnknown`, `Schema.Tuple([a, b])` for `Schema.Tuple(a, b)`, and `Effect.catch` for `Effect.catchAll`. The release of `@lionlang/core` 0.2.0 on November 3 moved to the stable 4.1.2, and the CLI moved from `effect/unstable/cli` to `effect/cli`.

### Consequences

`run` returns an Effect 4 `Effect`, so from `@lionlang/core` 0.2.0 on a host runs Lion with Effect 4, and the README says that the evaluator runs on Effect v4. The examples in `AGENTS.md` use the Effect 4 APIs. `@lionlang/cli`, added four days after the move, was built on Effect 4's CLI module from its first commit.

### Changes that follow from it

- @lionlang/core 0.2.0, @lionlang/cli 0.1.0, @lionlang/typesafe-ai 0.1.0: Upgraded Effect to 4.1.2 across all packages (`effect`, `@effect/platform-node`, `@effect/platform-node-shared`, `@effect/vitest`) and `@effect/language-service` to 0.87.5; the CLI now imports from the stable `effect/cli` module.

### Commits

- `cbb11e3` chore: migrate project to Effect v4: “migrate project to Effect v4”
- `1b380d9` chore(release): upgrade Effect to 4.1.2; release core 0.2.0, cli 0.1.0, typesafe-ai 0.1.0: “upgrade Effect to 4.1.2”

<a id="cli-bundles-editor"></a>

## `@lionlang/cli` carries its own copy of `@lionlang/core` and the built graph editor, so it is released with every core release

Decided 2026-09-21. In force. First released in @lionlang/core 0.2.0, @lionlang/cli 0.1.0, @lionlang/typesafe-ai 0.1.0.

### Context

Until September 2026 a Lion program ran only from TypeScript, through `run`, and the graph editor ran from the monorepo with `bun run dev --filter=@lionlang/repl`. A project could not evaluate a Lion file or open the editor without writing host code or checking out the repository.

### Decision

`@lionlang/cli`, built on Effect's CLI module, adds the `lion` command. `lion program.json` checks the file as a Lion expression, evaluates it with the standard library, and prints the result as JSON, and `lion repl` serves the production graph editor on `127.0.0.1:3000`, with `--host` and `--port` to change it. Its build bundles `@lionlang/core` into the command and copies the editor's build output into the package, so an installed CLI needs neither the monorepo nor a separate editor.

### Consequences

A change to the core or to the editor reaches users of the CLI only in a new CLI release. Every release of `@lionlang/core` since 0.2.0 ships a new `@lionlang/cli` beside it, and the changelog says which core each one bundles, such as `@lionlang/cli` 0.2.0 with `@lionlang/core` 0.3.0. The CLI has its own version numbers, starting at 0.1.0 with core 0.2.0.

### Changes that follow from it

- @lionlang/core 0.2.0, @lionlang/cli 0.1.0, @lionlang/typesafe-ai 0.1.0: The `@lionlang/cli` package: `lion program.json` evaluates a Lion program and prints its value, and `lion repl` serves the graph editor, bundled with the command.

### Commits

- `2753a40` feat(cli): add Effect CLI package: “add Effect CLI package”
- `2ca94fd` feat(cli): serve bundled graph editor: “serve bundled graph editor”
- `1b380d9` chore(release): upgrade Effect to 4.1.2; release core 0.2.0, cli 0.1.0, typesafe-ai 0.1.0: “release core 0.2.0, cli 0.1.0, typesafe-ai 0.1.0”

<a id="live-examples-run-real-core"></a>

## Every example on lionlang.dev runs on the real `@lionlang/core`, and the docs build writes each example's real result

Decided 2026-11-04. In force. First released in @lionlang/core 0.3.0, @lionlang/cli 0.2.0.

### Context

The example cards on lionlang.dev showed code with its result typed in beside it as a `// =>` comment, under a line saying that every snippet runs against the standard library. Nothing ran those results, so a change to Lion could leave a card showing a result Lion no longer gives.

### Decision

Every example card is an editor. Its program runs on `@lionlang/core` in a Web Worker, which the private `@lionlang/site-runtime` package bundles into `docs/lion-worker.js`, and runs again as the reader types; the card shows the result, a typed error, or `console/log` output, and stops a runaway program after 1.5 seconds. The docs page is built from one fragment per document, and the build runs every example with the evaluator the page uses, writes its real result, and fails on an unexpected error, an example too slow for the browser, or a link to a missing id. The site-runtime tests fail when `docs.html` is not what its fragments build, and the pages load their assets with a `?v=` hash, so a cached worker never runs a new page's examples.

### Consequences

The docs cannot drift from Lion: an example's result on the page is what Lion gave when the page was built. A change to the core rebuilds `docs/lion-worker.js`, and each logic feature of 0.4.0 shipped with its own live card. The browser's limits became Lion's to meet. A 3,000-answer query hit the 1.5 second limit until the worker stopped yielding to the scheduler, and the goal-directed card was rewritten with left recursion after its first version timed out. A visitor with the 0.2.0 worker cached saw the new logic examples fail with `InvalidFunctionCallError`, which is why the asset URLs carry a version.

### Alternatives considered

- **Code with its result typed in beside it, as the cards showed before.** Nothing checked a typed result against Lion. The docs build writes each result from a run, so the docs cannot drift from Lion.

### Changes that follow from it

- @lionlang/core 0.3.0, @lionlang/cli 0.2.0: lionlang.dev has a Logic programming section with four live examples (recursive rules, negation, filters and computed values, and `why` explanations). Code on the site highlights logic forms and `?variables`, and the live-editor worker is rebuilt with the logic layer.
- @lionlang/core 0.3.0, @lionlang/cli 0.2.0: Every example card on lionlang.dev is now a live editor. Programs run on the real `@lionlang/core` in a Web Worker (`@lionlang/site-runtime`, bundled into `docs/lion-worker.js`) and re-run as you type. Each card shows the result, error, and `console/log` output, and stops runaway programs after 1.5 seconds.
- @lionlang/core 0.4.0, @lionlang/cli 0.3.0: lionlang.dev loads its scripts, stylesheet, highlighter, and evaluator worker with a `?v=` hash of the site's assets. Before, a visitor whose browser had cached the previous release's worker saw the new logic examples fail with `InvalidFunctionCallError`. `bun run --cwd packages/site-runtime stamp` updates the hash (the site-runtime build runs it), and CI checks it.
- @lionlang/core 0.5.0, @lionlang/cli 0.4.0: [lionlang.dev/docs.html](https://lionlang.dev/docs.html): 35 documents organized by the Diátaxis framework into tutorials, how-to guides, reference, and explanation, covering every form, function, command, and semantic of Lion. Its 110 live examples run on the evaluator, and the page's build writes each example's real result and fails on an unexpected error or a broken link, so the docs cannot drift from Lion.

### Commits

- `ab082c3` feat(site): live Lion evaluator in every example card; keep buttons still: “programs run on @lionlang/core in a Web Worker”
- `6d1d662` feat(site): live logic programming examples on lionlang.dev
- `65ae02d` fix(site): version asset URLs so cached workers never pair with new pages: “version asset URLs so cached workers never pair with new pages”
- `b5f87d4` feat(site): add a Diátaxis docs page with live examples: “The build runs every example with the evaluator the page uses and writes its real result”

<a id="datalog-logic-layer"></a>

## Logic programming in Lion is Datalog, built into the Lisp as ordinary forms and values

Decided 2026-11-10. In force. First released in @lionlang/core 0.3.0, @lionlang/cli 0.2.0.

### Context

Lion was a Lisp whose programs are JSON, and a program had to spell out how to find each answer. Questions about connected data, such as where a path from one node leads, are easier to state as facts, rules that derive more facts, and queries over them. A logic layer had to fit the language: its rules and queries had to be JSON like the rest of Lion, and its answers had to be plain Lion data.

### Decision

`@lionlang/core` gets a Datalog-style logic layer. `["relation", "edge", ["from", "to"]]` binds `edge` to a relation, and calling it, as in `["edge", "a", "?b"]`, builds a goal, which is a value like any other. `fact`, `retract`, `rule`, `query`, `why`, `not`, `and`, `or`, and `=` are special forms, and an unbound `"?name"` string evaluates to a logic variable, while a bound name still wins. Answers are computed bottom-up with semi-naive evaluation and kept until a fact or rule changes. Rules are checked for safety when they are added, negation is stratified, and `why` explains any derived fact as a tree of rules, facts, checks, and absences.

### Consequences

Evaluation starts from the facts, and rules only combine values that already exist, so it always stops, and the answer does not depend on the order rules are written in. The price is expressiveness: a recursive rule cannot invent new values. A rule that negates its own head, directly or through others, has no stratum and is rejected when it is added. Each `run` gets its own database, and a host passes `{ database }` as the third argument of `run` to share one across runs. The logic features that came later, such as aggregates, keys, snapshots, invariants, and graph algorithms, are forms of the same database.

### Alternatives considered

- **Prolog, which answers a question by searching backward from it and trying rules in order.** A Prolog query can run forever, and its answer can depend on the order the rules were written in.
- **Rules and queries in a syntax of their own, as most logic languages have.** In Lion a goal is a value, so it can be stored, passed to a function, built by a lambda, and combined with `and`, `or`, and `not`, and answers come back as ordinary records. That keeps the logic layer inside the language.

### Changes that follow from it

- @lionlang/core 0.3.0, @lionlang/cli 0.2.0: A Datalog-style logic layer in `@lionlang/core`. New special forms `relation`, `fact`, `retract`, `rule`, `query`, `why`, `not`, `and`, `or`, and `=`; unbound `"?name"` strings evaluate to logic variables; and pure stdlib functions called on logic variables become filters or computed values. Rules use stratified negation and semi-naive evaluation, are checked for safety when added, and every answer can be explained with `why`. See `packages/examples/logic.json`.
- @lionlang/core 0.4.0, @lionlang/cli 0.3.0: Recursive rules run faster: each semi-naive round starts its join from the tuples that are new, relation indexes are kept up to date instead of rebuilt after every new tuple, and `in` tests membership with a lookup. A 3,000-step chain query went from about 9 seconds to about 100 ms. `why` explanations keep their premises in rule order.
- @lionlang/core 0.6.0, @lionlang/cli 0.5.0: A rule cannot ask about a relation that depends on its own head. This is the rule against negation through recursion, and it now covers every question: a goal under `not`, a `find`, and a goal used as a value.

### Commits

- `04632de` feat(core): add a Datalog-style logic layer: “rules are checked for safety when added, negation is stratified”

<a id="recursion-cannot-compute-values"></a>

## A recursive rule cannot compute new values for its head, so evaluation always ends

Decided 2026-11-10. In force. First released in @lionlang/core 0.3.0, @lionlang/cli 0.2.0.

### Context

Datalog evaluation ends because rules only combine values that already exist. A recursive rule that computes a value, as `["number/add", "?n", 1]` does, can derive a new row every round forever. The logic layer rejected a recursive rule that computed a value in its head, but the same value could come in through `=` or `in`: `["rule", ["c", "?m"], ["c", "?n"], ["=", "?m", ["number/add", "?n", 1]]]` invented values forever, and evaluation never finished despite the documented guarantee.

### Decision

The head variables of a recursive rule must come from facts: bound by a relation goal, or by `=` or `in` from such variables or from plain values. A rule that breaks this is rejected when it is added, with an error that suggests computing the value in a non-recursive rule or aggregating it with a lattice aggregate, which may compute its value while recursing.

### Consequences

Evaluation of rules always finishes. Values that come from facts are fine, so `["=", "?m", "?to"]` with `?to` from a relation still works in a recursive rule. The price is expressiveness: a value that grows along a recursion, such as a distance, is computed with a lattice aggregate, and recursion through one stops when no value improves or fails with an error after 10,000 rounds.

### Alternatives considered

- **Check only the head of a recursive rule, as the logic layer first did.** `=` and `in` in the body let a recursive rule invent values anyway, and evaluation never finished.

### Changes that follow from it

- @lionlang/core 0.4.0, @lionlang/cli 0.3.0: A recursive rule could compute a new head value through `=` or `in`, such as `["rule", ["c", "?m"], ["c", "?n"], ["=", "?m", ["number/add", "?n", 1]]]`, and evaluation never finished despite the documented guarantee. Such rules are now rejected when added, with a hint to compute the value in a non-recursive rule or aggregate it with a lattice aggregate.

### Commits

- `04632de` feat(core): add a Datalog-style logic layer: “recursive rules cannot compute new head values, so evaluation always finishes”
- `05f2834` fix(core): reject recursive head values computed through = or in: “head variables of a recursive rule must now come from facts”

<a id="lattice-recursion"></a>

## Recursion may aggregate only through lattice aggregates, whose values move one way

Decided 2026-11-10. In force. First released in @lionlang/core 0.4.0, @lionlang/cli 0.3.0.

### Context

Aggregates in rule heads were stratified like negation: a relation could aggregate only relations computed in full before it, never through recursion. So a recursive rule could not keep the smallest distance to each node, and minimum distances and shortest paths could not be written as rules. A sum or a count of a partial result is wrong, but a minimum of one is only not yet final.

### Decision

`aggregate/min`, `aggregate/max`, and the new `aggregate/shortest` and `aggregate/union` are lattice aggregates: a group's value only moves one way as matches arrive. A recursive rule can aggregate with them and compute the aggregated value, as in `["rule", ["dist", "?to", ["aggregate/min", ["number/add", "?d", "?km"]]], ["dist", "?via", "?d"], ["road", "?via", "?to", "?km"]]`. Each group keeps its best value, and rounds re-run the rules on rows that improved until nothing improves. Every relation in a cycle through an aggregate must aggregate, so a replaced value never strands rows derived from it. Other aggregates still cannot recurse.

### Consequences

Minimum distances and shortest paths are rules, and `why` explains a minimum with the chain that produced it. A cycle that would improve forever, such as a negative-weight cycle under `min`, fails with an error after 10,000 rounds instead of running forever. `aggregate/shortest` breaks ties by the smaller value, so results never depend on match order. lionlang.dev has a live Shortest distances card.

### Alternatives considered

- **Keep every aggregate out of recursion, as aggregates in rule heads first shipped.** Minimum distances and shortest paths could not be expressed.
- **Let any aggregate recurse.** A sum or a count over a partial result is wrong, not just unfinished. Only an aggregate whose value moves one way gives a partial result that is never wrong.

### Changes that follow from it

- @lionlang/core 0.4.0, @lionlang/cli 0.3.0: Recursion through lattice aggregates. `aggregate/min`, `aggregate/max`, and the new `aggregate/shortest` and `aggregate/union` only move one way, so a recursive rule can aggregate with them and compute the aggregated value, which makes minimum distances and shortest paths expressible. Each group keeps its best value until none improves, every relation in such a cycle must aggregate, and a cycle still improving after 10,000 rounds (such as a negative-weight cycle) fails with an error. lionlang.dev has a live Shortest distances card.

### Commits

- `000fa16` feat(core): recursion through lattice aggregates: “a group's value only moves one way, so a recursive rule can aggregate with them and compute the value, which makes minimum distances and shortest paths expressible”

<a id="goal-directed-magic-sets"></a>

## A query with a known argument runs a magic-sets rewrite and gives the answers full evaluation gives

Decided 2026-11-10. In force. First released in @lionlang/core 0.4.0, @lionlang/cli 0.3.0.

### Context

Bottom-up evaluation derives every fact a program implies, while a query usually needs far less: the paths from one node do not need the paths from every other node. A query for the paths from one node of a 3,000-node chain would derive about 4.5 million paths in full.

### Decision

When a query gives a rule-defined relation a known argument, such as `"a"` in `["path", "a", "?to"]`, Lion rewrites the rules with the magic-sets technique: each relation gets a copy for that pattern of known arguments, guarded by magic relations that pass the known values down through the rule bodies. Known arguments are values, variables that earlier goals bind, and values computed from them. Inside a rule only values and variables bound from facts count, so a rewritten rule never asks about values without end. Relations that are aggregated, computed by an algorithm, or negated, and what they depend on, are computed in full first. The rewrite changes how much is computed, never what the answers are, and `new LogicDatabase({ goalDirected: false })` turns it off.

### Consequences

The query along the 3,000-node chain returns in milliseconds. Tests run a corpus of programs both ways and require the same answers. Comparing the two ways on 2,000 generated programs found a query whose argument was not JSON data failing where full evaluation found no answers; such an argument now counts as unknown. Answers can come in a different order, so the `"order"` query option is the way to fix one. How a recursive rule is written matters: with a known start, recursion on the left asks only about that start, while recursion on the right asks about every node the paths pass through.

### Alternatives considered

- **Let values that functions compute inside a rule drive the rewrite.** A rewritten rule could then ask about new values without end. Values computed by functions never drive the rewrite inside a rule, so it still finishes.

### Changes that follow from it

- @lionlang/core 0.4.0, @lionlang/cli 0.3.0: Goal-directed queries. A query that gives a rule-defined relation a known argument, such as `["path", "a", "?to"]`, now runs a magic-sets rewrite of the rules, so evaluation derives only the facts the query can reach instead of every fact the program implies. A query along a 3,000-node chain that would otherwise derive about 4.5 million paths returns in milliseconds. Aggregated, computed, and negated relations are still computed in full, answers match full evaluation, and `new LogicDatabase({ goalDirected: false })` turns the rewrite off. lionlang.dev has a live Goal-directed queries card.
- @lionlang/core 0.4.0, @lionlang/cli 0.3.0: A goal-directed query whose argument was not JSON data, such as a relation name that evaluates to the relation itself, failed with "not JSON data" instead of finding no answers. Found by comparing goal-directed and full evaluation on 2,000 generated programs.

### Commits

- `f4c7c4c` feat(core): goal-directed queries with a magic-sets rewrite: “answers match full evaluation”
- `76d833f` fix(core): only JSON values seed goal-directed queries: “such arguments now count as unknown and only filter the rewritten relation, so both evaluations agree”
- `f617c07` docs: write the goal-directed example with left recursion: “with recursion on the left the rewrite asks only about the start”
- `aef67af` feat(core): make everything that needs a logic variable's value wait: “Goal-directed queries count arguments bound by = or in, and values computed from bound variables, as known.”

<a id="keyed-relations-upsert"></a>

## A keyed relation holds one row per key, and a fact whose key is present replaces the row

Decided 2026-11-10. In force. First released in @lionlang/core 0.4.0, @lionlang/cli 0.3.0.

### Context

A relation was a set of rows. A `fact` added a row beside any other row with the same id, and only `retract` removed one. So a row that stands for the current state of something, such as an order and its status, became two rows when the status changed, unless the old row was retracted first.

### Decision

A record after the columns gives a relation a key: `["relation", "order", ["id", "status"], {"key": ["id"]}]` holds at most one row per key. A fact whose key is already present replaces the old row, like an upsert, and when one `fact` form repeats a key the last row wins. A key can span several columns, and a single column can be written without the list. Rules may derive rows of a keyed relation, but two different rows with one key are an error that names both, in goal-directed queries too.

### Consequences

Changing an order's status is one `fact` form, as the order desk tutorial shows. `retract` still removes a row only when every column matches. Declaring a relation again, for example in a later run that shares the database, must repeat its columns and key. Relation indexes drop deleted rows in place instead of being rebuilt.

### Changes that follow from it

- @lionlang/core 0.4.0, @lionlang/cli 0.3.0: Keyed relations. `["relation", "order", ["id", "status"], {"key": ["id"]}]` holds at most one row per key: a fact whose key is already present replaces the old row, keys can span several columns, and rules that derive two rows for one key fail with an error that names both rows. Redeclaring a relation must repeat its key. The Fold Map editor labels keyed relations. lionlang.dev has a live Keys and upserts card.

### Commits

- `2b64585` feat(core): keyed relations with upserts: “holds at most one row per key: a fact whose key is already present replaces the old row”

<a id="snapshots-are-programs"></a>

## A logic database is saved as a Lion program of forms that rebuild it

Decided 2026-11-10. In force. First released in @lionlang/core 0.4.0, @lionlang/cli 0.3.0.

### Context

A logic database lived only in memory. Each `run` got its own, and a host could pass `{ database }` to share one across runs, but Lion had no way to save one, so the `lion` command line could not keep facts and rules from one run to the next.

### Decision

`["snapshot"]` returns a Lion program of `relation`, `fact`, and `rule` forms that rebuilds the current database. Strings that would load as something else, such as relation names, bound names, namespaced names, and `?names`, are written inside `quote`, and so are lists and records. Rules are written from their evaluated goals, so aggregates, `in`, `=`, `not`, `or`, and algorithm goals round-trip. `saveDatabase` and `loadDatabase` in `@lionlang/core/logic/snapshot` do the same from TypeScript, and `lion program.json --database store.json` loads a snapshot file, runs the program, and saves it back, one form and one fact per line.

### Consequences

A saved database is ordinary Lion that can be read, edited, diffed, and run, and evaluating it into an empty database gives the same answers. A database passed to `run` binds its relations by name, so later runs query them without declaring them again. A program and its snapshot must behave the same, and later changes kept them so: invariants are saved after the rules, a function is written under the name the environment gives it, and a waiting `cond`, record, or lambda is written as its form. A rule or invariant counts as one the database holds when a snapshot would write it the same way.

### Changes that follow from it

- @lionlang/core 0.4.0, @lionlang/cli 0.3.0: Snapshots. `["snapshot"]` returns a Lion program of `relation`, `fact`, and `rule` forms that rebuilds the current database, quoting strings that would load as something else. `saveDatabase` and `loadDatabase` in `@lionlang/core/logic/snapshot` do the same from TypeScript, and a database passed to `run` now binds its relations by name, so later runs can query them without declaring them again. The Fold Map editor and the site highlighter recognize `snapshot`. lionlang.dev has a live Snapshots card.
- @lionlang/core 0.4.0, @lionlang/cli 0.3.0: `lion program.json --database store.json` loads a logic database from a snapshot file, runs the program against it, and saves it back, one form and one fact per line.
- @lionlang/core 0.6.0, @lionlang/cli 0.5.0: A snapshot wrote a function under the name the program called it by, such as a name bound with `define`, which is not there when the snapshot loads. It now writes the name the environment gives the function.

### Commits

- `56af8ed` feat: save and load logic databases as Lion programs: “returns a Lion program of relation, fact, and rule forms that rebuilds the current database”
- `47ea840` feat(core): invariants, all-or-nothing changes, and idempotent rules: “Snapshots save them after the rules”
- `aef67af` feat(core): make everything that needs a logic variable's value wait: “Snapshots write a function by the name the environment gives it”

<a id="all-or-nothing-changes"></a>

## A change to the logic database is all or nothing, keeps every invariant, and adds nothing the database already holds

Decided 2026-11-11. In force. First released in @lionlang/core 0.5.0, @lionlang/cli 0.4.0.

### Context

A `retract` with one invalid fact still removed the facts listed before it, so a failed form left the database half changed. Running a setup program again against a database saved with `lion --database` added each rule a second time, so aggregates counted every match twice. And a program could check a condition on its data only when it asked: a query with the `"assert"` option checked it once, when the query ran.

### Decision

`["invariant", goal, {"assert": "none"}]` keeps a query assertion in the database: the goal must have no answers, or with `"some"` at least one, when it is added and after every later change. Every `fact`, `retract`, and `rule` form is checked against every invariant once it has made all of its changes, and a form that fails, whether on a bad fact, a broken invariant, or an error while checking one, leaves the database exactly as it was, facts in the same order. Adding a rule or invariant the database already holds, one a snapshot would write the same way, changes nothing, as adding a fact or declaring a relation the same way already did.

### Consequences

One rule answers what a failed form leaves behind: nothing. Several facts that only make sense together go in one `fact` form, and each later form is checked against the result. Invariants are answered the way queries are, with goal-directed rewriting, aggregates, and graph algorithms, and they are saved in snapshots after the rules and enforced by `lion --database`. Running a setup again, or loading a snapshot onto the database it came from, keeps one copy of each rule.

### Alternatives considered

- **A new keyword for invariants.** The query option `"assert"` already said that a question must have no answers, or some. An invariant reuses it, compiles its goal like a query, and fails in the same words, so there is no second vocabulary to learn, and anything a query can ask, an invariant can require.
- **Make one run, rather than one form, the unit of change.** One form keeps the rule simple, lets facts that only make sense together go in a single `fact` form, and checks each later form against the result.

### Changes that follow from it

- @lionlang/core 0.5.0, @lionlang/cli 0.4.0: Invariants. `["invariant", goal, {"assert": "none"}]` keeps a query assertion in the logic database: the goal must have no answers, or with `"some"` at least one, now and after every later change. Every `fact`, `retract`, and `rule` form is checked against every invariant once it has made all of its changes, and a form that breaks one fails and leaves the database exactly as it was, facts in the same order. Invariants are answered the way queries are, saved in snapshots after the rules, and enforced by `lion --database`. The Fold Map editor and the site highlighter recognize the form.
- @lionlang/core 0.5.0, @lionlang/cli 0.4.0: `@lionlang/cli` 0.4.0 bundles `@lionlang/core` 0.5.0, so `lion --database` keeps invariants and one copy of each rule, and its errors say what went wrong.
- @lionlang/core 0.5.0, @lionlang/cli 0.4.0: Running a setup again against a saved database added each rule a second time, so aggregates counted every match twice. Adding a rule or invariant the database already holds, one a snapshot would write the same way, now changes nothing.
- @lionlang/core 0.5.0, @lionlang/cli 0.4.0: A `retract` with one invalid fact still removed the facts listed before it. Every form that changes the database is now all or nothing.

### Commits

- `47ea840` feat(core): invariants, all-or-nothing changes, and idempotent rules: “Every form that changes the database is now all or nothing.”

<a id="least-astonishment"></a>

## Lion's features and semantics are designed by the principle of least astonishment

Decided 2026-11-11. In force. First released in @lionlang/core 0.5.0, @lionlang/cli 0.4.0.

### Context

Lion's value comes from features that compose, so one surprising interaction costs more than a missing feature. Surprises sat where features met: a failed `retract` left partial changes behind, and running a setup again against a saved database counted every aggregate match twice. Nothing written down told a contributor how a new feature should behave beside the others.

### Decision

Before adding a feature or changing how something behaves, ask what someone who already knows Lion would expect it to do, on its own and combined with every existing feature, and make it do that. Reuse the vocabulary Lion has before inventing more. When a feature needs a rule, follow the rule a similar feature already has, and when that rule falls short, change it for every feature at once. Walk through the combinations, keep equivalent programs equivalent, such as a program and its snapshot or goal-directed and full evaluation, and point out surprising behavior and fix it instead of building on it. AGENTS.md and CLAUDE.md state the principle, and the docs explain the rules features share on a page of their own.

### Consequences

Invariants reuse the query option `"assert"` and fail in the words of a failed query assertion. Every form that changes the database is all or nothing, and adding what the database already holds changes nothing. The waiting rule and the asking rule each replaced a list of special cases with one rule, and each added to AGENTS.md the pairs it keeps equivalent: an expression over a logic variable and the same expression with the value in its place, and a question asked in a rule and the same question asked in plain code with the rule's variables bound. Where results may differ, such as answer order without the `"order"` option, the docs say so.

### Commits

- `47ea840` feat(core): invariants, all-or-nothing changes, and idempotent rules: “the principle of least astonishment when designing features and semantics”
- `b5f87d4` feat(site): add a Diátaxis docs page with live examples
- `aef67af` feat(core): make everything that needs a logic variable's value wait
- `c380ce7` feat(core): let any expression ask the database

<a id="property-based-tests"></a>

## Lion's tests are property-based, checked against a model, a round trip, or an equivalence

Decided 2026-11-11. In force. First released in @lionlang/core 0.5.0, @lionlang/cli 0.4.0.

### Context

Most of Lion's tests, and every test of the logic layer, used fixed example inputs, and the testing guide in AGENTS.md showed tests of the form `it("should perform operation")`. The logic layer's guarantees are claims about every program: goal-directed and full evaluation give the same answers, a snapshot rebuilds its database, and an invariant holds after every change. A bug in goal-directed queries was found only by comparing the two evaluations on 2,000 generated programs.

### Decision

New behavior gets property-based tests, not tests with fixed example inputs. A property uses `it.prop` or `it.effect.prop` from `@effect/vitest` with Schemas or generators from `effect/Arbitrary`, and checks behavior against something independent of the code under test: a simpler model, a round trip such as save, load, and save again, or an equivalence such as two ways of computing the same answer. A domain's generators live in a module next to its tests, as `packages/core/src/logic/tests/programs.ts` does for logic programs, and each property must be shown to fail when the code it covers is broken. AGENTS.md and the new CLAUDE.md say so.

### Consequences

Invariants are tested against a model that makes the same change without invariants and then asks each invariant as a query assertion. The fixes that made the standard library follow JSON each have a property written first and confirmed to fail. The waiting rule came with 35 properties that compare each case with plain evaluation with the value in place of the variable, and the asking rule with 17 that compare each use of a question with a model computed from the facts. A property that restates the implementation proves little, so each one states what users expect in terms of something else.

### Alternatives considered

- **Example-based unit tests with fixed inputs, as AGENTS.md showed before.** A fixed input checks one case. A property is checked against many generated inputs, 100 by default, and the runner shrinks a failing input to a small counterexample.

### Commits

- `47ea840` feat(core): invariants, all-or-nothing changes, and idempotent rules: “The new logic tests are property-based, using effect/Arbitrary with it.effect.prop.”
- `4efc928` fix(core): make standard library results follow JSON and the docs: “Each fix has property tests, written first and confirmed to fail.”
- `aef67af` feat(core): make everything that needs a logic variable's value wait: “35 new property tests check each case against plain evaluation with the value in place of the variable.”
- `c380ce7` feat(core): let any expression ask the database: “17 new property tests check each use of a question against a model computed from the facts”

<a id="values-are-json"></a>

## Lion's values are JSON, so the standard library never gives `undefined`, `NaN`, or `Infinity`

Decided 2026-11-11. In force. First released in @lionlang/core 0.5.0, @lionlang/cli 0.4.0.

### Context

Lion runs on JavaScript, but its values are JSON, and the two disagree in a few places. The standard library followed JavaScript in some of them: division by zero gave `Infinity`, `object/get` gave `undefined` for a missing key, `array/head` crashed on an empty list, and `value/object?` was true for lists. Such values cannot be printed as JSON, stored as a fact, or saved in a snapshot, and facts and rule results already refused numbers that are not finite.

### Decision

Where JavaScript and JSON disagree, Lion follows JSON, everywhere the case comes up. Arithmetic whose result is not a finite number, such as division by zero or an overflow, fails with the new `ArithmeticError`; this covers `number/add`, `number/subtract`, `number/multiply`, and `number/divide`, and `aggregate/sum` and `aggregate/mean` on a list. An answer that means nothing is here is `null`, such as a missing key from `object/get` or the first item of an empty list. `value/object?` is true for records and not for lists. Query answers and the rows rules derive must be JSON data, and `["=", 0, -0]` is `true`, since JSON writes both as `0`.

### Consequences

A Lion value can always be printed, stored as a fact, and saved, and a number that is not finite fails at the function that made it instead of where it is used later. Programs that relied on `Infinity`, `undefined`, or `value/object?` of a list behave differently. A query whose answer binds a variable to a function, which used to leave the variable out, now fails and shows the answer.

### Alternatives considered

- **Return what JavaScript returns, such as `Infinity`, `NaN`, and `undefined`.** JSON cannot hold them, so such a value cannot be printed, stored as a fact, or saved in a snapshot.

### Changes that follow from it

- @lionlang/core 0.5.0, @lionlang/cli 0.4.0: `ArithmeticError`, raised when arithmetic has no finite result.
- @lionlang/core 0.5.0, @lionlang/cli 0.4.0: Arithmetic whose result is not a finite number, such as division by zero or an overflow, fails with `ArithmeticError` instead of returning `Infinity` or `NaN`, which JSON cannot hold. This covers `number/add`, `number/subtract`, `number/multiply`, and `number/divide`, and `aggregate/sum` and `aggregate/mean` on a list.
- @lionlang/core 0.5.0, @lionlang/cli 0.4.0: `value/object?` is true for records and other objects, but no longer for lists.
- @lionlang/core 0.5.0, @lionlang/cli 0.4.0: `object/get` returns `null` for a missing key instead of `undefined`.
- @lionlang/core 0.5.0, @lionlang/cli 0.4.0: `array/head` and `array/tail` crashed on an empty list; they return `null` and `[]`.
- @lionlang/core 0.6.0, @lionlang/cli 0.5.0: Query answers must be JSON data. A variable bound to a function used to be left out of the answer; now the query fails and shows the answer.
- @lionlang/core 0.6.0, @lionlang/cli 0.5.0: `["=", 0, -0]` was `false`. JSON writes both as `0`, so they are the same number.

### Commits

- `4efc928` fix(core): make standard library results follow JSON and the docs: “Lion's values are JSON, and the standard library now agrees everywhere JavaScript and JSON differ”
- `aef67af` feat(core): make everything that needs a logic variable's value wait: “Query answers and derived rows must be JSON data.”

<a id="scheme-where-unclear"></a>

## Where the behavior of a base form is unclear, Lion does what Scheme does

Decided 2026-11-12. In force. First released in @lionlang/core 0.6.0, @lionlang/cli 0.5.0.

### Context

Lion is a Lisp, and some of its base forms left open what Scheme and Racket settle. `and` and `or` evaluated every argument, so `["and", false, ["number/divide", 1, 0]]` was an error instead of `false`. Later, when every library function came to say how many arguments it takes, functions such as `number/add` needed an answer to how many that is.

### Decision

Where a base form's behavior is unclear, Lion follows Scheme and Racket, and AGENTS.md states that Lion's semantics are approximately those of Scheme and Racket, plus the logic layer. `and` and `or` stop at the first argument that decides them, as in Scheme, so `["and", false, ["number/divide", 1, 0]]` is `false`. `number/add`, `number/multiply`, `number/min`, `number/max`, `string/concat`, and `array/concat` combine one or more arguments from left to right, as their Scheme counterparts do. `string/join` takes a string to put before the last item, as `#:before-last` does in Racket.

### Consequences

`and` and `or` no longer evaluate the arguments after the one that decides them, which changes a program that relied on an error or a side effect there. `["number/add", 1, 2, 3]` is 6. The match is approximate: the logic layer comes on top, so once an argument of `and` or `or` is a goal, they combine goals.

### Alternatives considered

- **Evaluate every argument of `and` and `or`, as Lion did before 0.6.0.** An argument after the one that decides the result could still fail, so `["and", false, ["number/divide", 1, 0]]` was an error instead of `false`.

### Changes that follow from it

- @lionlang/core 0.6.0, @lionlang/cli 0.5.0: `and` and `or` stop at the first argument that decides them, as in Scheme, so `["and", false, ["number/divide", 1, 0]]` is `false` instead of an error.

### Commits

- `aef67af` feat(core): make everything that needs a logic variable's value wait: “and/or stop at the first argument that decides them, as in Scheme”
- `500bac2` feat(metrics): add tools that measure complexity, speed, and tests
- `356e74a` feat(core): one rule for how many arguments a call gives, text for a number, and a fact message that names the name: “combine one or more arguments from left to right, as their Scheme counterparts do”
- `841b511` feat(core): text from lists and numbers, and research pages whose words Lion computes: “with a string before the last item, as #:before-last in Racket”

<a id="waiting-rule"></a>

## Whatever needs a logic variable's value waits until the variable is bound

Decided 2026-11-12. In force. First released in @lionlang/core 0.6.0, @lionlang/cli 0.5.0.

### Context

Only functions marked pure waited for a logic variable: the `number`, `string`, `boolean`, `value`, and `array` modules, and a host function marked with `markPure`. Everything else ran at once. A `cond`, `match`, or lambda that branched on a variable ran before the variable had a value, so it took the same branch for every answer: `["cond", [["number/greaterThan", "?x", 10], "big"], ["else", "small"]]` in a rule head gave `"big"` for 1, and a snapshot saved the rule with `"big"` in place of the `cond`. `eval` of a logic variable returned the variable.

### Decision

One rule covers how evaluation meets logic variables: whatever needs a variable's value waits until it is bound, then computes what it would with the value in its place. Every function waits when it is called with a logic variable: the whole standard library, host functions as they are, and `func/partial` results. `cond`, `match`, `eval`, and records wait the same way, and so do lambdas passed to a waiting call. `logicFunction` marks a host function that takes logic values as they are.

### Consequences

A rule can hold a `cond` or a record over its variables, such as `{"id": "?x", "twice": ["number/multiply", "?x", 2]}`, and gives for each answer what plain code gives with the value in the variable's place; 35 properties check that equivalence. `markPure` is removed. A filter must be `true` or `false`, where a value such as a number used to pass as true, and a call that fails in a rule or query names itself and its values. An aggregate call combines matches as a whole head argument and a list anywhere else, and an algorithm's input can be a variable that another goal binds. The core has 5% fewer code lines and runs 1.5 to 3 times faster on ten benchmarks.

### Alternatives considered

- **Let only functions marked pure wait, as the logic layer first did with `markPure`.** Everything else ran before its variable had a value, so a `cond`, `match`, or lambda took the same branch for every answer, and a snapshot saved that branch in place of the form.

### Changes that follow from it

- @lionlang/core 0.6.0, @lionlang/cli 0.5.0: Waiting. Every function waits when it is called with a logic variable and runs once the variable is bound: the whole standard library, host functions as they are, and `func/partial` results. `cond`, `match`, `eval`, and records wait the same way, and so do lambdas passed to a waiting call. A rule can hold `["cond", [["number/greaterThan", "?x", 10], "big"], ["else", "small"]]` or the record `{"id": "?x", "twice": ["number/multiply", "?x", 2]}`, and gives for each answer what plain code gives with the value in the variable's place. `logicFunction` from `@lionlang/core/logic/terms` marks a host function that takes logic values as they are.
- @lionlang/core 0.6.0, @lionlang/cli 0.5.0: Aggregates outside rule heads. As a whole argument of a rule head an aggregate still combines one value from each match. Anywhere else it combines a list once the list is known, so `["=", "?total", ["aggregate/sum", "?items"]]` works in a rule body. An aggregate of a `find` combines what the find found, so `["aggregate/count", ["find", "?c", ["parent", "?p", "?c"]]]` can be 0. An aggregate's argument can also be a constant, as in `["aggregate/sum", 1]`.
- @lionlang/core 0.6.0, @lionlang/cli 0.5.0: An algorithm's value input can be a variable that another goal binds: `["and", ["depot", "?s"], ["graph/shortestPath", "road", "?s", "?to", "?km", "?_"]]` runs the algorithm once for each depot.
- @lionlang/core 0.6.0, @lionlang/cli 0.5.0: For hosts: `call` from `@lionlang/core/evaluation/special-forms/function` calls a Lion function from host code and gives its value, asking a goal the function returns. `WaitingError` is what it fails with when the value is not known yet. `@lionlang/core/logic/model` holds the engine, and `LionAskerService` from `@lionlang/core/services/asker` says who answers questions.
- @lionlang/core 0.6.0, @lionlang/cli 0.5.0: A filter must be `true` or `false`. A goal such as `["number/add", "?x", 1]` used to pass as true; now the rule or query fails and shows the value.
- @lionlang/core 0.6.0, @lionlang/cli 0.5.0: For hosts, `@lionlang/core/logic/terms` changed. `markPure` and `isPureFunction` are removed, since every function waits. The `Negation`, `Conjunction`, `Disjunction`, `Unification`, and `Membership` classes are one `LogicForm` class, tested with `isForm`. The `Aggregate` class is removed: an aggregate is a waiting call. `relationInfo` is now `relationOf`, and `RelationValue`, `isRelationValue`, and `isLogicTerm` are removed.
- @lionlang/core 0.6.0, @lionlang/cli 0.5.0: A `cond`, `match`, or lambda that branched on a logic variable ran before the variable had a value, so it took the same branch for every answer: `["cond", [["number/greaterThan", "?x", 10], "big"], ["else", "small"]]` in a rule head gave `"big"` for 1, and a snapshot saved the rule with `"big"` in place of the `cond`. `eval` of a logic variable returned the variable. These forms now wait.

### Commits

- `aef67af` feat(core): make everything that needs a logic variable's value wait: “whatever needs a variable's value waits until it is bound, then computes what it would with the value in its place”

<a id="asking-rule"></a>

## Whatever needs the value of a goal asks it

Decided 2026-11-12. In force. First released in @lionlang/core 0.6.0, @lionlang/cli 0.5.0.

### Context

A goal was something a rule or query matched, and little else could use one. A function or record given a relation goal was handed the goal itself, `fact` refused it, and a `cond` whose condition was a relation goal took that case whether or not the goal had a match. A goal under `not` needed every variable bound first, and an aggregate combined a goal's matches only in a rule head, so a count was never 0.

### Decision

A goal with a relation in it is a question, and any expression can ask it. As a goal of a rule or query it still matches rows and binds variables. Anywhere else it is asked: as a value it is `true` when it has a match and `false` when it has none, in a `cond` condition, as an argument of a function, as an operand of `=` or `in`, as a value of a record, as an argument of `fact`, and as the value `match` looks at. `["find", template, goal]` returns the template's value for every match of the goal as a sorted list. When a question is asked, the variables the rule or query around it has bound are fixed, and every other variable is the question's own.

### Consequences

A question gives in a rule what it gives in plain code with the rule's variables in place: plain code asks right away, goal-directed, and a rule, query, invariant, or `find` asks for each answer when it runs. `define`, `and`, `or`, `not`, and lambdas keep a goal as it is, so goals can still be named, combined, and passed around. A goal under `not` can join on variables of its own, an aggregate of a `find` can count 0, and a relation is a predicate for `match` and for functions such as `array/map`. The rule against negation through recursion now covers every question. The core grew 4.7% in code lines, and list callbacks run about 10% slower, since they go through the one call rule.

### Alternatives considered

- **Hand a relation goal to a function or record as the goal itself, as before.** A `cond` whose condition was a relation goal took that case whether or not the goal had a match, and `fact` refused the goal.

### Changes that follow from it

- @lionlang/core 0.6.0, @lionlang/cli 0.5.0: Asking. A goal with a relation in it is a question that any expression can ask. As a goal of a rule or query it still matches rows and binds variables. As a value it is `true` when it has a match and `false` when it has none: in a `cond` condition, as an argument of a function, as an operand of `=` or `in`, as a value of a record, as an argument of `fact`, and as the value `match` looks at. A relation is a predicate for `match` and for functions that are given it, so `["array/map", ["array/make", "ada", "zed"], "person"]` is `[true, false]`. Plain code asks right away, and goal-directed. A rule, query, invariant, or `find` holds its questions and asks them for each answer when it runs.
- @lionlang/core 0.6.0, @lionlang/cli 0.5.0: `["find", template, goal]` returns the template's value for every match of the goal, as a sorted list: `["find", "?c", ["parent", "ada", "?c"]]` is `["ben", "cy"]`. It works in plain code and inside rules. The Fold Map editor and the site highlighter recognize the form.
- @lionlang/core 0.6.0, @lionlang/cli 0.5.0: Aggregates outside rule heads. As a whole argument of a rule head an aggregate still combines one value from each match. Anywhere else it combines a list once the list is known, so `["=", "?total", ["aggregate/sum", "?items"]]` works in a rule body. An aggregate of a `find` combines what the find found, so `["aggregate/count", ["find", "?c", ["parent", "?p", "?c"]]]` can be 0. An aggregate's argument can also be a constant, as in `["aggregate/sum", 1]`.
- @lionlang/core 0.6.0, @lionlang/cli 0.5.0: Questions have variables of their own. When a question is asked, the variables that the rule or query around it has bound are fixed, and every other variable belongs to the question. So a goal under `not` no longer needs every variable bound first: `["not", ["and", ["parent", "?p", "?c"], ["retired", "?c"]]]` asks whether `?p` has a retired child.
- @lionlang/core 0.6.0, @lionlang/cli 0.5.0: For hosts: `call` from `@lionlang/core/evaluation/special-forms/function` calls a Lion function from host code and gives its value, asking a goal the function returns. `WaitingError` is what it fails with when the value is not known yet. `@lionlang/core/logic/model` holds the engine, and `LionAskerService` from `@lionlang/core/services/asker` says who answers questions.
- @lionlang/core 0.6.0, @lionlang/cli 0.5.0: The docs have a new guide, [Use answers as values](https://lionlang.dev/docs.html#ask-questions), a step in the family tree tutorial that collects answers with `find`, and reference sections for waiting and asking.
- @lionlang/core 0.6.0, @lionlang/cli 0.5.0: A relation goal given to a plain function, a record, `=`, `in`, or `fact` is asked. Before, a function or record was handed the goal itself, and `fact` refused it. `define`, `and`, `or`, `not`, and lambdas keep a goal as it is, so goals can still be named, combined, and passed around.
- @lionlang/core 0.6.0, @lionlang/cli 0.5.0: A rule cannot ask about a relation that depends on its own head. This is the rule against negation through recursion, and it now covers every question: a goal under `not`, a `find`, and a goal used as a value.
- @lionlang/core 0.6.0, @lionlang/cli 0.5.0: For hosts, `@lionlang/core/logic/terms` changed. `markPure` and `isPureFunction` are removed, since every function waits. The `Negation`, `Conjunction`, `Disjunction`, `Unification`, and `Membership` classes are one `LogicForm` class, tested with `isForm`. The `Aggregate` class is removed: an aggregate is a waiting call. `relationInfo` is now `relationOf`, and `RelationValue`, `isRelationValue`, and `isLogicTerm` are removed.
- @lionlang/core 0.6.0, @lionlang/cli 0.5.0: A `cond` whose condition was a relation goal took that case whether or not the goal had a match.

### Commits

- `c380ce7` feat(core): let any expression ask the database: “whatever needs the value of a goal asks it”

<a id="measure-every-change"></a>

## Measure every change to core for its code, its semantics, its speed, and how well its tests catch broken code

Decided 2026-11-12. In force. First released in @lionlang/core 0.7.0, @lionlang/cli 0.6.0.

### Context

Lion's aim is one rule in place of special cases, so that an expression gives in a rule head, a filter, a `find`, or a reloaded snapshot what it gives in plain code. Until 0.6.0 nothing in the repository counted how far Lion fell short of that, or whether a change left the code and the language simpler or harder to know. Speed and the strength of the tests were not measured either.

### Decision

`@lionlang/metrics`, a private package, measures the working tree beside any earlier commit. `bun run measure` counts the code of `@lionlang/core` without its tests (code lines, functions, paths through functions, nesting-weighted decisions, and `instanceof` tests) and its semantics: special forms, library functions, kinds of error, distinct messages, and the exceptions of the interop grid, which runs every kind of expression in every place one can stand and compares each with plain code. `bun run bench` times a set of programs, each version in a process of its own, `bun run mutate` breaks the code in each listed place and checks that a property fails, and `bun run compare` runs the same programs on two commits. AGENTS.md asks that every change to core be measured before it is done, that the numbers go in the commit message also when they went up, and that a new exception in the grid be fixed rather than added to `KNOWN`.

### Consequences

The grid counted 209 exceptions for 0.5.0 and 2 for 0.6.0, and every later core commit that measured it found the same 2 documented ones. Each core commit since states its numbers, including the ones that grew: schemas took the code from 6,035 to 7,798 lines, and the arity rule's commit says the rule cost more lines than the checks it replaced. A new exception fails the tests of `packages/metrics`, and a mutation no property catches is reported as `MISSED`, so a change brings a mutation and a property for each behavior it adds. Benchmark times move by a few percent between runs, so `bun run bench` is run twice.

### Alternatives considered

- **Time both versions of the evaluator in one process.** Loading both evaluators into one process slowed the second one down by up to a fifth on code that had not changed.

### Commits

- `500bac2` feat(metrics): add tools that measure complexity, speed, and tests: “leave Lion simpler in code and in semantics, give every feature and every bug a property, be ambitious, and report what was measured”
- `d45c397` fix(metrics): time each benchmark version in its own process: “Each version is now timed in a process of its own”

<a id="misspelled-names-are-errors"></a>

## An unbound `module/name` string that reads as a misspelled name is an `UnboundNameError`, and any other unbound string stays a string

Decided 2026-11-12. In force. First released in @lionlang/core 0.7.0, @lionlang/cli 0.6.0.

### Context

In Lion a string is a name before it is a string: a bound name evaluates to its value, and an unbound one to itself. So a misspelled function quietly became a string. Called, as in `["number/ad", 1, 2]`, it failed as a call of something that is not a function, and in a schema a misspelled predicate such as `"value/intger?"` would be a plain value to equal.

### Decision

An unbound string of the form `module/name` is an `UnboundNameError` when it can only have been meant as a name: other names of its module are bound, as for `"number/ad"`, or a bound name is a letter or two away, as for `"numbr/add"`. The message suggests the name and says how to write the string: `Nothing is bound to "number/ad". Did you mean "number/add"? To mean the string itself, write ["quote", "number/ad"].` Any other string with a slash, such as `"n/a"` or `"text/plain"`, is still itself, and `["quote", "number/ad"]` is always the string. The error holds the string as `unbound` and the suggestion as `nearest`.

### Consequences

A program that used such a string as data breaks and must quote it. The error is raised wherever the name is evaluated: in plain code, as a predicate, inside a lambda that a schema or `match` calls, and in a form a rule holds. `UnboundNameError` is a new kind of error, and the docs give it and `InvalidFunctionCallError` an example each. The first version kept the string in the error's `name`, so code that shows `name: message`, as the docs site does, showed `number/plus: Nothing is bound to ...`; the string moved to `unbound` the same day.

### Alternatives considered

- **Let every unbound string evaluate to itself, as before 0.7.0.** A misspelled function would quietly become a string.
- **Keep the misspelled string in the error's `name` field.** `name` is where every Error says what kind it is, so code that shows `name: message` showed the string in place of the kind.

### Changes that follow from it

- @lionlang/core 0.7.0, @lionlang/cli 0.6.0: An unbound string of the form `module/name` that reads as a misspelled name is an error, where it used to be the string: one whose module has other names bound, such as `"number/ad"`, or one a letter or two away from a bound name, such as `"numbr/add"`. The error is the new `UnboundNameError`, which suggests the name, and holds the string as `unbound` and the suggestion as `nearest`. Other strings with a slash, such as `"n/a"` or `"text/plain"`, are unchanged, and `["quote", "number/ad"]` is always the string.

### Commits

- `fbc25a1` feat(core): schemas that check data and take it apart: “An unbound `module/name` string that reads as a misspelled name is an `UnboundNameError` that suggests the name.”
- `ca92729` fix(core): keep the kind of an unbound-name error in its name: “The string is now in `unbound`, and `name` is "UnboundNameError" again.”

<a id="records-are-exact"></a>

## A record fits only a record with the same keys, and `schema/open` allows more

Decided 2026-11-12. In force. First released in @lionlang/core 0.7.0, @lionlang/cli 0.6.0.

Supersedes [A record pattern in `match` fits any record that has the pattern's keys with values that fit](#record-patterns-by-keys).

### Context

Before 0.7.0 a record pattern in `match` fit any record that had its keys, whatever others it had. Schemas made one rule for every place that checks a value, and under it data is a schema for itself: a value with no function in it fits exactly the values equal to it. A record that fit every record with its keys would break that, in `match` and in every other place the rule reaches: a pattern, an argument of a relation call, and the schema of a relation's rows.

### Decision

A record fits a record with the same keys, with values that fit, wherever a value is checked against a schema. `schema/open` makes a record schema fit a record whatever other keys it has, and `schema/optional` lets a key be left out. A branch of `match` that picks by one field of a larger record opens it: `["schema/open", {"type": "refund"}]`.

### Consequences

It is a breaking change for `match`: a branch whose pattern is the record `{"type": "refund"}` no longer takes a record that has other keys. A record in a pattern takes apart only a record with the same keys, so `["inbox", {"type": "refund", "id": "?id"}]` asks for rows of exactly that shape, and `["inbox", ["schema/open", {"type": "order", "id": "?id"}]]` also for rows with more keys. A relation's row schema names every column, or is a `schema/open` record that names some. `schema/problems` reports a key the schema does not name as a problem with only `found`.

### Alternatives considered

- **A record pattern fits any record that has its keys, as `match` did before 0.7.0.** Data would no longer fit exactly the values equal to it, which is what makes data a schema for itself; `schema/open` keeps that meaning for a pattern that wants it.

### Changes that follow from it

- @lionlang/core 0.7.0, @lionlang/cli 0.6.0: `match` fits a record against a record with the same keys. A record pattern used to fit any record that had its keys, so a branch that picks by one field of a larger record, such as `[{"type": "refund"}, handler]`, must open the record: `[["schema/open", {"type": "refund"}], handler]`.
- @lionlang/core 0.7.0, @lionlang/cli 0.6.0: Schemas. Anything is a schema. A function is a predicate, so `value/number?`, a lambda, a relation with one column, and a named schema all are. A record fits a record with the same keys and values that fit, a list fits a list of the same length item by item, and any other value fits a value equal to it. So data is a schema for itself.
- @lionlang/core 0.7.0, @lionlang/cli 0.6.0: `schema/anyOf`, `schema/allOf`, `schema/arrayOf`, `schema/recordOf`, `schema/optional`, and `schema/open` build schemas out of others. What they build is a function like any other. `schema/open` fits a record whatever other keys it has.

### Commits

- `fbc25a1` feat(core): schemas that check data and take it apart: “`match` fits a record against a record with the same keys; open the record with `schema/open` to match on some of its keys.”

<a id="schemas-are-logic"></a>

## Anything is a schema, one rule says what fits it, and a schema with logic variables in it is a pattern

Decided 2026-11-12. In force. First released in @lionlang/core 0.7.0, @lionlang/cli 0.6.0.

### Context

Lion had no way to say what a value must be. `match` took a predicate or a record of predicates and failed on any other pattern, a relation call compared each argument with its column, so `["reading", "?sensor", "value/number?"]` matched nothing, and a check on the rows of a relation was an invariant written by hand. Schemas would touch all of these places, and the project's rule is to give such places one rule rather than one each.

### Decision

Anything is a schema, and one rule says what fits it: a function is a predicate, a record fits a record with the same keys and values that fit, a list fits a list of the same length item by item, and any other value fits a value equal to it, so data is a schema for itself. `match`, the `schema` functions such as `schema/fits?`, `schema/problems`, and `schema/anyOf`, the arguments of a relation call, and the relation option `{"schema": "Order"}` all ask through that rule. A logic variable in a schema is its value once bound and takes the value it meets until then, so `schema/fits?`, a relation call, `=`, and `in` bind the variables of a record, a list, or a built schema: `["inbox", ["schema/open", {"type": "order", "id": "?id"}]]`. A schema check is an ordinary call, so it waits for logic variables and works under `not` and in a `find` like any other, and the schema of a relation's rows is the invariant a program could write by hand.

### Consequences

A predicate, a relation with one column, a named schema, or a variable that holds one can stand as an argument of a relation call, so `["reading", "?sensor", "value/number?"]` asks for the readings that are numbers, and a relation as the schema of a column is a foreign key. `["schema", "Tree", {"value": "value/number?", "children": ["schema/arrayOf", "Tree"]}]` declares a named schema, one form can declare several that name each other, and snapshots write them. Programs break where they relied on the old behavior: a record in `match` fits only a record with the same keys, and a relation with several columns used as a schema is an error where it matched nothing. The change was large: code lines went from 6,035 to 7,798 and messages from 95 to 123, while the grid's cells like plain code went from 336 to 487.

### Alternatives considered

- **Compare each argument of a relation call with the values in its column, as before 0.7.0.** A function there matched nothing, since no row holds a function, so a query such as `["reading", "?sensor", "value/number?"]` had no answers.

### Changes that follow from it

- @lionlang/core 0.7.0, @lionlang/cli 0.6.0: A function among the arguments of a relation call is a schema for the column. `["reading", "?sensor", "value/number?"]` used to match nothing, since no row holds a function, and now asks for the readings that are numbers. A relation with more than one column is not the schema of one value, so `["path", "edge", "?to"]` is an error where it matched nothing.
- @lionlang/core 0.7.0, @lionlang/cli 0.6.0: Schemas. Anything is a schema. A function is a predicate, so `value/number?`, a lambda, a relation with one column, and a named schema all are. A record fits a record with the same keys and values that fit, a list fits a list of the same length item by item, and any other value fits a value equal to it. So data is a schema for itself.
- @lionlang/core 0.7.0, @lionlang/cli 0.6.0: `["schema/fits?", value, schema]` says whether a value fits. `["schema/problems", value, schema]` lists every place where it does not, as records with a `path` and what was `expected` or `found` there. `["schema/assert", value, schema]` returns the value or fails and says where.
- @lionlang/core 0.7.0, @lionlang/cli 0.6.0: `schema/anyOf`, `schema/allOf`, `schema/arrayOf`, `schema/recordOf`, `schema/optional`, and `schema/open` build schemas out of others. What they build is a function like any other. `schema/open` fits a record whatever other keys it has.
- @lionlang/core 0.7.0, @lionlang/cli 0.6.0: `["schema", "Order", shape]` declares a named schema in the database and binds the name, as `relation` does for a relation. A shape can name its own schema, and one form can declare several, `["schema", name, shape, name, shape, ...]`, whose shapes name each other. Snapshots write the schemas of one form as one form, and a later run that shares the database finds them under their names.
- @lionlang/core 0.7.0, @lionlang/cli 0.6.0: Patterns. A logic variable in a schema is its value once it is bound, and until then takes the value it meets. `schema/fits?`, the arguments of a relation call, both sides of `=`, and the element of `in` bind the variables of a record, a list, or a schema built by the `schema` functions: `["inbox", ["schema/open", {"type": "order", "id": "?id"}]]`, `["in", {"sku": "?sku", "qty": "?qty"}, "?lines"]`. `?_` fits any value and binds nothing. The goals of a rule give the same answers in any order.
- @lionlang/core 0.7.0, @lionlang/cli 0.6.0: A schema check is an ordinary call, so it waits for logic variables and works as a filter in a rule or query, under `not`, in a `find`, in `cond`, and as a value in a rule head. `["in", "?p", ["schema/problems", "?doc", "Order"]]` turns the problems of a value into rows.
- @lionlang/core 0.7.0, @lionlang/cli 0.6.0: An argument of a relation call is a schema for its column: a value, a variable, a pattern, a predicate, or a variable that holds one of those. A relation as the schema of a column is a foreign key.
- @lionlang/core 0.7.0, @lionlang/cli 0.6.0: The relation option `{"schema": "Order"}` says that every row, as a record of its columns, must fit a declared schema. It stands for the invariant a program could write by hand, so a `fact`, `retract`, or `rule` form that would leave a row that does not fit fails and changes nothing.
- @lionlang/core 0.7.0, @lionlang/cli 0.6.0: When the goal of an invariant or query assertion says an answer fails a schema, the message ends with where the answer does not fit: `{"id":2,"status":"opne"} does not fit "Order": "status" must fit ["schema/anyOf","open","shipped"] but is "opne".`
- @lionlang/core 0.7.0, @lionlang/cli 0.6.0: For hosts: `@lionlang/core/logic/fit` exports `fits`, `problemsOf`, `misfit`, and `matching`, and `@lionlang/core/modules/schema` holds the `schema` module. From `@lionlang/core/logic/terms`, `builtBy` records the call that built a function, so the function is written as that call, and `readsOnlyArguments` marks host functions that read nothing but their arguments.
- @lionlang/core 0.7.0, @lionlang/cli 0.6.0: `match` checks a value against schemas. Besides a predicate or a record of predicates, a pattern can now be a plain value, a list of schemas, or a schema built by the `schema` functions. A pattern that was neither a function nor a record of them used to fail; now it is a value to equal.
- @lionlang/core 0.7.0, @lionlang/cli 0.6.0: An unsafe goal's message names `"schema/fits?"` among the goals that bind a variable.
- @lionlang/core 0.7.0, @lionlang/cli 0.6.0: An unknown relation option is reported with the relation's options, `"key"` and `"schema"`.

### Commits

- `fbc25a1` feat(core): schemas that check data and take it apart: “Anything is a schema, and one rule says what fits it”
- `ca92729` fix(core): keep the kind of an unbound-name error in its name: “Also pins down schema behavior that no property covered”

<a id="every-feature-in-docs"></a>

## Every feature is used in a docs example with output that was run, and the docs build fails when a special form or library function is in no example

Decided 2026-11-12. In force. First released in @lionlang/core 0.7.0, @lionlang/cli 0.6.0.

### Context

The docs site's examples are live: the build runs each one with the real evaluator and writes its result. Nothing made a feature have one, so the docs lagged the code. After schemas, a pass by hand gave each of their features a live example, 26 new ones, and `number/toString` was committed with no docs and reached the website's reference only at its release. When the build first checked, it found eight functions in no example: the four the branch had just added and `func/callback`, `object/get-method-path`, `object/new`, and `value/symbol?`.

### Decision

Every feature a change adds is used in at least one example in the docs, with output that was run, not typed: a core feature in a live `<lion-example>` of `packages/site-runtime/content/` where a reader would look for it, and a skill's new relation, note field, or script in its `SKILL.md` or `references/`. The docs build fails when a special form or library function appears in no live example, beside its checks for failing examples and broken links. A change also corrects every documented result it makes untrue. AGENTS.md has a section on it and CLAUDE.md a summary.

### Consequences

A missing example fails the build instead of waiting for someone to notice, so `bun run --cwd packages/site-runtime docs` lists what a change still has to document, and `docs/docs.html` is rebuilt and committed with the change. The eight functions it found have examples in their modules' reference, and "Explain a result" shows how a computed figure was worked out. The build checks only special forms and library functions; a skill's examples rest on the rule alone.

### Changes that follow from it

- @lionlang/core 0.10.0, @lionlang/cli 0.9.0: Every special form and library function is used in a live example on [lionlang.dev](https://lionlang.dev/docs.html), and the docs build fails when one is not. The new functions are in their modules' examples, `func/callback`, `object/get-method-path`, `object/new`, and `value/symbol?` now have examples too, and "Explain a result" shows how a computed figure was worked out.
- @lionlang/core 0.10.0, @lionlang/cli 0.9.0: AGENTS.md and CLAUDE.md ask that every new feature be used in an example in the docs, with output that was run.

### Commits

- `230ba1c` docs(site): document every schema feature with a live example: “Every feature now has a live example, which the docs build runs with the real evaluator”
- `b903a8a` docs: show every feature in an example, and make the docs build check it: “The docs build now fails when a special form or library function appears in no live example”

<a id="arity-rule"></a>

## A call gives a function as many arguments as it takes, and any other number fails with one form of message

Decided 2026-11-13. In force. First released in @lionlang/core 0.8.0, @lionlang/cli 0.7.0.

### Context

Library functions dropped arguments they did not take and passed `undefined` for ones left out: `["number/subtract", 10, 3, 1]` was `7`, and `["object/get", {"a": 1}]` was `null`. Relations, schemas, schema builders, `schema/fits?`, `schema/problems`, `schema/assert`, aggregates, and graph algorithms each checked their arguments on their own, with messages in several forms. It was one of three surprises found while writing Lion programs for the research skill.

### Decision

Every function of the standard library takes a set number of arguments, and a call with any other number fails: `"number/subtract" takes 2 arguments but got 3.` One function, `takes`, carries the rule for library functions, relations, schemas, aggregates, and graph algorithms, and `over` builds a library function from a schema for each argument. `number/add`, `number/multiply`, `number/min`, `number/max`, `string/concat`, and `array/concat` combine one or more arguments from left to right, as their Scheme counterparts do. A lambda still ignores arguments past its parameters, as in JavaScript, so host code can call it as a callback.

### Consequences

A call with the wrong number of arguments fails where it runs, also where it waits for a logic variable in a rule, a query, or a `find`, and the failure is a `LogicError`. `func/bind` and `func/apply` need the function and its `this`, and a library function handed to host code that passes extra arguments, as `Array.prototype.map` does through `func/callback`, fails, so a lambda is the way to write a callback. `["number/add", 1, 2, 3]` is `6`, where the `3` used to be dropped. The code grew by 62 lines, since the rule and its two helpers cost more than the seven checks and module helpers they replaced. Every new function declares what it takes, with `takes` or `over`, and has a row in the table of `arity.test.ts`.

### Alternatives considered

- **Drop extra arguments and pass `undefined` for missing ones, as library functions did before 0.8.0.** A wrong call gave a wrong answer instead of an error: `["number/subtract", 10, 3, 1]` was `7`, with the `1` dropped.

### Changes that follow from it

- @lionlang/core 0.10.0, @lionlang/cli 0.9.0: Like every library function, each waits for a logic variable and refuses a call with another number of arguments.
- @lionlang/core 0.8.0, @lionlang/cli 0.7.0: Every function of the standard library takes a set number of arguments, and a call with any other number fails and says how many the function takes. `["number/subtract", 10, 3, 1]` used to be `7`, with the `1` dropped, and `["object/get", {"a": 1}]` used to be `null`, with no key given. They now fail with `"number/subtract" takes 2 arguments but got 3.` and `"object/get" takes 2 arguments but got 1.` The call fails the same way where it waits for a logic variable, in a rule, a query, or a `find`. The failure is a `LogicError`; a call with too few arguments used to fail with a `SchemaError`, or pass `undefined` on.
- @lionlang/core 0.8.0, @lionlang/cli 0.7.0: Host code that calls a library function gives it the arguments it takes too. `["func/callback", "value/number?"]` handed to JavaScript's `Array.prototype.map` is called with three arguments, and fails. A lambda still ignores arguments past its parameters, so a lambda remains the way to write a callback.
- @lionlang/core 0.8.0, @lionlang/cli 0.7.0: `func/bind` and `func/apply` take the function and its `this`, then any arguments. `["func/bind", fn]` used to bind `undefined`.
- @lionlang/core 0.8.0, @lionlang/cli 0.7.0: `number/add`, `number/multiply`, `number/min`, `number/max`, `string/concat`, and `array/concat` combine one or more arguments, as `+`, `*`, `min`, `max`, `string-append`, and `append` do in Scheme. `["number/add", 1, 2, 3]` is `6`, where the `3` used to be dropped, and `["string/concat", "lion", "-", "ized", "!"]` is `"lion-ized!"`. They work from left to right, so three arguments give what two nested calls give. With one argument they give it back.
- @lionlang/core 0.8.0, @lionlang/cli 0.7.0: For hosts: `takes` from `@lionlang/core/errors/evaluation` gives a function the same rule, as in `takes(2, fn)` or `takes(atLeast(1), fn)`, and `over` and `combining` from `@lionlang/core/modules/lib/shared` build a library function from schemas for its arguments. `nameOf` from `@lionlang/core/logic/terms` gives the name a function is written with.
- @lionlang/core 0.8.0, @lionlang/cli 0.7.0: Every message about the number of arguments has one form, and names the function as it is written in Lion. `graph/pageRank takes 3 arguments (edges, node, rank) but got 1.` now starts with `"graph/pageRank"`, `Schema "Tree" takes 1 argument, the value to check, but got 2.` is `"Tree" takes 1 argument (the value to check) but got 2.`, and `aggregate/sum takes one argument but got 2.` is `"aggregate/sum" takes 1 argument but got 2.` A relation's message is unchanged.
- @lionlang/core 0.9.0, @lionlang/cli 0.8.0: Like every library function, each waits for a logic variable, so a rule, a query, or a `find` can build text with them, and a call with another number of arguments says how many the function takes.

### Commits

- `356e74a` feat(core): one rule for how many arguments a call gives, text for a number, and a fact message that names the name: “A call gives a function as many arguments as it takes.”

<a id="research-counts-publishers"></a>

## The research skill counts the publishers who give an answer first-hand, not the sources that state it

Decided 2026-11-13. In force. First released in lion-research skill.

### Context

The research skill's core program says how well each answer is backed. Its first version followed each claim to the source it was credited to and counted distinct sources. A trial run on the Microsoft 365 outage of 12 November 2026, with 19 sources and 175 claims, called 15 answers corroborated, and 8 of them were not. Two channels of one company counted as two origins in three of them, two articles from one newspaper in one, and in four an origin was a source that was only credited, either unread or saying something else.

### Decision

Only a publisher who gives an answer first-hand, in a claim credited to nobody else, counts. Every source records its `publisher`, written the same way for each channel that publisher speaks through, so a company's press release, status page, and filing are one voice, and a source that relays another adds nothing. `backing` lists the publishers behind each answer, `corroborated` the answers two or more publishers give first-hand, `single_origin` those that rest on one publisher's word, and `secondhand` those every source credits to someone else.

### Consequences

On the trial's evidence the new core calls 7 answers corroborated, the 7 the trial's agent reached with stricter rules of its own, and reports 4 misquotes and 26 answers known only second-hand. The rule is strict on purpose: a statement repeated by ten outlets is still one statement. A person quoted by an outlet is a source of their own, credited by the outlet, so a spokesperson quoted in three papers does not read as three voices. Properties check the core against a plain model of provenance for any sources, publishers, claims, and attributions.

### Alternatives considered

- **Count the distinct sources an answer can be followed back to, as the skill's first version did.** On the trial's model it called 15 answers corroborated, and 8 of them had no two publishers behind them first-hand.

### Changes that follow from it

- lion-research skill: `assets/core.json`, the program every research model starts from. It says who stands behind each answer: the publishers who give it first-hand, in a claim credited to nobody else. Sources with one publisher are one voice, and a source that relays another adds nothing, so an answer that three articles took from one press release rests on one publisher. It derives which answers independent publishers confirm, which rest on one publisher's word and how many on each, which are known only second-hand, which sources are credited with something they do not say, which questions sources dispute, which credited sources are unread, and which assumptions hold. Its invariants reject a claim without a known source.

### Commits

- `284f00f` feat(skill): add lion-research, a Lion model as the working memory of deep research: “The first version's core counted distinct sources and called 15 answers corroborated on the first trial's model; 8 had no two publishers behind them first-hand.”

<a id="lion-computes-page-text"></a>

## Text built on Lion is computed by Lion expressions, not filled into a template, and a helper any program would want goes into the standard library

Decided 2026-11-13. In force. First released in @lionlang/core 0.9.0, @lionlang/cli 0.8.0.

### Context

The research skill's page plan held the words a reader sees as text the agent typed: the summary and each answer were strings, a figure was a typed `value` or a query, and a lookup's query held `"$source"` where the reader's choice was put in. A sentence with a number in it that no expression produced is a claim the model cannot check, and it stays on the page when the model changes. Writing the words in Lion instead needed functions the standard library lacked, such as joining a list into a sentence and writing a number with separators.

### Decision

When something built on Lion needs a value, a condition, or text, it is a Lion expression that is evaluated, never a second, smaller language such as a template with slots or a placeholder that gets substituted. The length of Lion JSON is not counted as a cost, and a helper any Lion programmer would want goes into the standard library with its properties. In the research skill, the plan's summary, answers, notes, and figures are Lion expressions evaluated against the model when the page opens, a `cond` on `disputed` or `corroborated` picks the sentence, and a lookup is a Lion function called with what the reader chose. Core 0.9.0 adds `string/join`, `string/split`, `string/padStart`, `string/padEnd`, and a separator for `number/toString`, and `assets/words.json` builds the skill's wording functions from them.

### Consequences

A page's words follow the model, and the build lists any figure typed into the plan and any typed text that holds a digit. Plans are longer, and are written in full, since nobody reads them. `page-check.json` runs every text of the plan, so its output is the page's wording to read before the reader sees it. The skill needs `@lionlang/cli` 0.8.0, the release that bundles core 0.9.0. Core gained four library functions, from 94 to 98, and 36 code lines.

### Alternatives considered

- **Typed text in the plan, with a literal `value` or a `query` for each figure, as the skill's first page had.** A finding typed into the plan is a claim the model cannot check, and it stays on the page when the model changes.
- **A placeholder such as `"$source"` in a lookup's query, where the reader's choice is substituted.** It is a second, smaller language beside Lion. A lookup is a Lion function instead, called with each choice as data.

### Changes that follow from it

- @lionlang/core 0.9.0, @lionlang/cli 0.8.0: `["string/join", list, separator]` is a list of strings with the separator between them. With a third string, that one stands before the last item, as `#:before-last` does in Racket: `["string/join", ["array/make", "a", "b", "c"], ", ", " and "]` is `"a, b and c"`.
- @lionlang/core 0.9.0, @lionlang/cli 0.8.0: `["string/split", text, separator]` is the parts of the text between each separator, so joining them with the same separator gives the text back.
- @lionlang/core 0.9.0, @lionlang/cli 0.8.0: `["string/padStart", text, length, fill]` and `["string/padEnd", text, length, fill]` make text as long as asked, as JavaScript does: `["string/padStart", "7", 2, "0"]` is `"07"`.
- @lionlang/core 0.9.0, @lionlang/cli 0.8.0: `number/toString` takes a second argument, a string to write between groups of three digits of the whole part, as `#:group-sep` does in Racket: `["number/toString", 1234567.5, ","]` is `"1,234,567.5"`. With one argument it is unchanged.
- @lionlang/core 0.9.0, @lionlang/cli 0.8.0: Like every library function, each waits for a logic variable, so a rule, a query, or a `find` can build text with them, and a call with another number of arguments says how many the function takes.
- lion-research skill: `scripts/build-explorer.mjs`, which packs a model and the plan of its page into one HTML file with the evaluator inside it. The page is for a reader who does not know Lion, and it has no fixed form: the agent writes a plan, `page.json`, for what this reader wants to know. A plan names the views and fills each with blocks: an answer in plain words with its evidence under it, key figures, a table, a timeline, a comparison grid, a lookup whose answer changes as the reader chooses from lists, how solid the findings are, the sources, and text. The plan states no facts: its summary, answers, notes, and figures are Lion expressions that the page evaluates against the model each time it opens, so the wording follows the model and a `cond` on `disputed` or `corroborated` picks the sentence. A lookup's query is a Lion function, called with what the reader chose as data. `assets/words.json` gives the expressions functions for wording: a list as a sentence lists it, a number with separators, a count with its noun. The trust block is built from the core: what independent publishers confirm, where sources disagree, what rests on one publisher's word, what is second-hand, what was misquoted, and which assumptions held. The query editor and the model's tables are always the last view, for readers who know Lion, where a query can also add facts to ask what would follow. The script also writes every query the plan asks as one Lion record, so they can all be run before the page is opened.
- Unreleased: [lionlang.dev/changelog.html](https://lionlang.dev/changelog.html) shows the changelog as a timeline: every release on a line through time, newest first, with a pause of a month or more drawn as one, what each release shipped by kind, and the decisions it put into effect, each opening to its context, alternatives, and commits. Every change links to the decisions it follows and the commits that made it. A reader can filter by kind and search changes and decisions, and without JavaScript the page shows everything. The project record writes the page with Lion, as it writes `CHANGELOG.md` and `DECISIONS.md`, turning the record's Markdown into HTML itself, and the site's navigation links to it.
- Unreleased: `["string/slice", text, start, end]` and `["array/slice", list, start, end]` cut a part out of text or a list, as JavaScript's `slice` does: a negative position counts from the end, a position past either end stops there, and without `end` the part runs to the end. `["string/slice", "lionlang", 0, 4]` is `"lion"`, and the two parts of a cut at any position join back into the whole. Like every library function, each waits for a logic variable and refuses a call with another number of arguments.

### Commits

- `841b511` feat(core): text from lists and numbers, and research pages whose words Lion computes: “AGENTS.md: let Lion compute it, do not count the length of Lion JSON as a cost, and add to the standard library when it lacks something.”

<a id="beliefs-judged-from-their-version"></a>

## A belief is judged by the evidence of every version from the one it was formed in on, and an explanation by the versions where its problem shows

Decided 2026-11-13. In force. First released in lion-reasoning skill.

### Context

In the reasoning skill each observation speaks for the versions of the project in which the files it depends on hold what they held when it was seen, so the model must say which versions judge a belief. In the skill's first trial, beliefs that explain no problem were judged only against the present, and a belief the agent had disproved on the old code showed as holding again after the fix. An explanation of a bug judged against the present has the opposite fault: once the bug is fixed, the fixed code counts against it.

### Decision

`record.mjs` stamps each belief with the version it was formed in. A belief is contradicted, borne out, or untested by the evidence of that version and every later one, and once contradicted it stays contradicted, even after the files change again. A belief that explains a problem is judged only in the versions where the problem shows. What a fix will do is a belief of its own, recorded after the change.

### Consequences

An assumption such as "nothing else calls `total`" is caught by the edit that adds a caller, and a belief disproved before a fix does not come back after it. A fix does not count against the explanation of its bug, so `settled` can name the explanation left when all its predictions are borne out. A prediction about the fixed code inside the explanation could never be checked there, so the problem was never settled, which is why the skill now says to record it separately. Rebuilt with the new core, the trial's own model marks the belief it had disproved as violated.

### Alternatives considered

- **Judge a belief that explains no problem against the present only, as the skill's first version did.** A belief the agent had disproved on the old code showed as holding again after the fix.

### Changes that follow from it

- lion-reasoning skill: `assets/core.json`, the program every model starts from. Each observation speaks for the versions of the project in which the files it depends on hold what they held when it was seen, so evidence about a changed file is stale and `changed` lists what the work changed. What the agent ran or read overrules what it was told or recalled, and `overruled` lists each time. A belief is contradicted, borne out, or untested by the evidence of every version from the one it was formed in on, and a belief that explains a problem by the versions where the problem shows, so a fix does not count against the explanation of the bug it fixed. For rival explanations, `decisive` names the questions they answer differently, `remaining` the ones still standing, `settled` the one left when all its predictions are borne out, and `unexplained` a problem with none left. `needed` and `open` say what the task must still observe.
- lion-reasoning skill: `scripts/start.mjs`, `see.mjs`, `record.mjs`, `replay.mjs`, and `ask.mjs`. `see.mjs` runs a command and keeps its output and exit status as evidence, with the hash of what it depends on when it ran. `record.mjs` writes a step from plain notes, refuses a quote that is not in the text it came from, and stamps each belief with the version it was formed in. Every version of the project is kept as the changes since the last. The scripts run the published `@lionlang/cli`, so changing Lion itself never changes the checker, and a question runs on a copy of the model.
- lion-reasoning skill: A belief it had disproved on the old code showed as holding again after the fix, because beliefs that explain no problem were judged only against the present. Beliefs are now judged from the version they were formed in on. Rebuilt with the new core, the trial's own model marks that belief as violated.
- lion-reasoning skill: A prediction about the fixed code inside the explanation of the bug could never be checked there, so the problem was never settled. The skill now says to make what a fix will do a belief of its own, recorded after the change.

### Commits

- `4c8df1b` feat(skill): add lion-reasoning, a Lion model as an agent's checked working memory: “a belief is judged from the version it was formed in on; a belief that explains a problem is judged where the problem shows, so a fix does not count against the explanation of its bug”

<a id="skills-use-published-cli"></a>

## The skills' scripts run the published `@lionlang/cli`, never the copy of Lion in the project

Decided 2026-11-13. In force. First released in lion-reasoning skill.

### Context

The reasoning skill keeps an agent's checked working memory while it works on a project, and Lion itself is one such project: the skill's first trial fixed a bug in Lion's own loading order. A checker that ran the project's copy of Lion would change, or break, with the code under work. The research skill's script `replay.mjs` already ran `bunx @lionlang/cli`, with no way to name another command.

### Decision

The scripts of both skills run the published Lion CLI through `bunx`, or `npx` without bun, and never a copy of Lion in the project, so changing Lion itself never changes the checker. `LION_CLI` names another command, such as `bun ~/lion/packages/cli/dist/bin.mjs`, for a run that needs a CLI not yet released. The research skill's `replay.mjs` and its eval's `grade.mjs` read `LION_CLI` as the reasoning skill's scripts do.

### Consequences

A skill can use a library function only once a release has it: the release notes of core 0.9.0 and 0.10.0 say the research skill needs them, and the skill names the CLI version it needs. The first run needs network access, and `bunx` keeps running whatever version it fetched first, so the research skill asks for the newest once before anything else.

### Alternatives considered

- **Run the copy of Lion in the project being worked on.** A project's own copy of Lion, even a broken one, would change the checker, and Lion itself is a project the skills are used on.

### Changes that follow from it

- @lionlang/core 0.10.0, @lionlang/cli 0.9.0: `replay.mjs` runs the Lion command `LION_CLI` names, as the reasoning skill's scripts do.
- lion-reasoning skill: `scripts/start.mjs`, `see.mjs`, `record.mjs`, `replay.mjs`, and `ask.mjs`. `see.mjs` runs a command and keeps its output and exit status as evidence, with the hash of what it depends on when it ran. `record.mjs` writes a step from plain notes, refuses a quote that is not in the text it came from, and stamps each belief with the version it was formed in. Every version of the project is kept as the changes since the last. The scripts run the published `@lionlang/cli`, so changing Lion itself never changes the checker, and a question runs on a copy of the model.

### Commits

- `4c8df1b` feat(skill): add lion-reasoning, a Lion model as an agent's checked working memory: “They run the published @lionlang/cli, so changing Lion itself never changes the checker.”
- `41477b1` feat(core,skill): figures you can check against their sources

<a id="engine-computes-model-interprets"></a>

## The agent copies a figure as its source writes it and the model computes the rest, so every number in a claim must be written in its quote

Decided 2026-11-13. In force. First released in @lionlang/core 0.10.0, @lionlang/cli 0.9.0.

### Context

The research skill already asked that every figure in a report come from a query, but nothing checked that the numbers in a claim are the ones its quote writes. An agent that converts "$1.2 billion" to 1,200 million as it reads, or mistypes a number, leaves a figure no quote shows, and nothing noticed. The change follows what Kepler learned building verifiable AI for finance: the agent interprets, the engine computes and keeps provenance, and every number traces to the words and line item it came from.

### Decision

A figure is recorded as the source writes it, in a shape whose key names that unit, such as `{"usd_bn": 1.2}` for "$1.2 billion", and an `answer` rule converts it. The core reads the numbers written in each quote with `string/numbers`, and `unquoted` lists every number at the top of a claim's `says` that its quote does not write; a number taken from where the quote stands, such as a year in a heading, goes in a field the frame declares as `context`. Ratios, margins, and totals are computed by rules, and the page shows a computed figure's evidence "Worked out as" its arithmetic. Core 0.10.0 adds `number/fromString` and `string/numbers` for this.

### Consequences

A slip in copying or converting shows up at once in `unquoted`, and the report says which figures are not written in their quote. A rounded figure, such as "near $0.41 billion", is a question of its own and never disputes the exact one. The research skill needs `@lionlang/cli` 0.9.0, the release that bundles core 0.10.0. A frozen-corpus eval, `verifies-company-figures`, grades a run by stage, among them whether figures were copied as written and whether the model, not the agent, worked out the margin.

### Alternatives considered

- **Convert a figure to the frame's unit while recording it, as `{"usd_m": 1200}` for "$1.2 billion".** No quote writes the converted number, so a slip in converting could not be told from a correct figure. Converting is a job for the model.

### Changes that follow from it

- @lionlang/core 0.10.0, @lionlang/cli 0.9.0: `["number/fromString", text]` reads text as a number, as `string->number` does in Scheme, and is `null` when the text is not one number. With a second argument, the whole part may be in groups of three digits with that string between them, so it reads back what `number/toString` writes with the same separator: `["number/fromString", "1,234,567.5", ","]` is `1234567.5`.
- @lionlang/core 0.10.0, @lionlang/cli 0.9.0: `["string/numbers", text]` is every number written in the text, in order, each read as `number/fromString` reads it, with the same optional separator. A minus sign counts only where no letter, digit, or point stands before it, so `"fiscal 2023-24"` holds 2023 and 24.
- @lionlang/core 0.10.0, @lionlang/cli 0.9.0: The core program checks that every number in a claim is written in its quote (`unquoted`), takes a publisher's later word over its earlier one (`restated`, `withdrawn`, and `backing`, `disputed`, and `secondhand` without what was withdrawn), lists the questions sources answer in more than one sense of a word the frame declares as a reading (`ambiguous`), records the reader's choice (`decided`), and gives the questions the reader means (`meant`, `set_aside`). A claim can say where in its source it stands (`located`).
- @lionlang/core 0.10.0, @lionlang/cli 0.9.0: The page carries the saved text of each source a claim quotes, and each statement opens in its place there, with the quote marked. A computed figure's evidence shows "Worked out as" its arithmetic. How solid is it gains what needs the reader's decision, figures their publisher changed, figures not written in their quote, and what the reader chose.
- @lionlang/core 0.10.0, @lionlang/cli 0.9.0: A frozen-corpus eval, `verifies-company-figures`, with known answers checked stage by stage by `grade.mjs`, and a reference run that a property replays.

### Commits

- `41477b1` feat(core,skill): figures you can check against their sources: “the agent interprets, the engine computes and keeps provenance, and every number traces to the words and line item it came from.”

<a id="user-decides-ambiguity"></a>

## A question only the user may settle is asked, not answered by the agent, and an answer from anyone else is listed as presumed

Decided 2026-11-13. In force. First released in @lionlang/core 0.10.0, @lionlang/cli 0.9.0.

### Context

A word in a task can mean two things: revenue as reported or excluding fuel surcharges, a fiscal or a calendar year, the development build or the release build. An agent that picks one and carries on breaks everything built on that choice, and nothing it observes later can contradict a choice, so the mistake never shows as a contradiction. Kepler's agents stop and ask when a word in the task means two things.

### Decision

In the research skill, the frame declares as a `reading` each key of a question that picks one sense of a word. The core lists in `ambiguous` the questions sources answer in more than one sense, the agent asks the reader which they mean and records the answer in their words as `decided`, and rules that reach a question through `meant` follow it. In the reasoning skill, notes list under `ask` the questions only the user, or the source `of` names, may settle; the core lists in `undecided` those not yet answered, and in `presumed` every answer from anyone else, such as the agent, a file, or a doc. The user's decision holds in every version, since it is about what they want and not about the files.

### Consequences

A choice made for the user is listed rather than hidden, and the reasoning skill's standing checks ask both `undecided` and `presumed`. Until the reader chooses, research rules use every sense: the Tarnwell example's margin is 26.4% on revenue as reported and 22.5% excluding fuel surcharges, and one choice leaves one margin. If the agent cannot ask, it says that the answer depends on the choice and gives each sense. The research page leads its trust view with what needs the reader's decision.

### Alternatives considered

- **The agent picks the sense that seems most natural and carries on.** One wrong reading early breaks everything built on it, and nothing observed later can contradict a choice.

### Changes that follow from it

- @lionlang/core 0.10.0, @lionlang/cli 0.9.0: The core program checks that every number in a claim is written in its quote (`unquoted`), takes a publisher's later word over its earlier one (`restated`, `withdrawn`, and `backing`, `disputed`, and `secondhand` without what was withdrawn), lists the questions sources answer in more than one sense of a word the frame declares as a reading (`ambiguous`), records the reader's choice (`decided`), and gives the questions the reader means (`meant`, `set_aside`). A claim can say where in its source it stands (`located`).
- @lionlang/core 0.10.0, @lionlang/cli 0.9.0: `page-check.json` also lists questions the plan names that a choice set aside or that have senses nobody chose between. It used to keep only one entry of two blocks with one title; it now keeps both.
- @lionlang/core 0.10.0, @lionlang/cli 0.9.0: Notes can list questions only the user may settle, under `ask`. The core lists the ones the user has not answered (`undecided`) and every answer to them from anyone else (`presumed`), and the standing checks ask both. A decision is the user's word in any version, so it does not go out of date when files change.

### Commits

- `41477b1` feat(core,skill): figures you can check against their sources: “lists questions sources answer in more than one sense (reading, ambiguous), records the reader's choice (decided) and the questions they mean (meant, set_aside)”
- `52600b2` feat(skill): lion-reasoning lists what only the user decides: “notes list under `ask` the questions only one source may settle, the user unless `of` names another.”

<a id="why-shows-every-goal"></a>

## `why` shows every goal of a rule's body as it held, `=` and `in` among them

Decided 2026-11-13. In force. First released in @lionlang/core 0.10.0, @lionlang/cli 0.9.0.

### Context

`why` explained a derived fact by the rows its relation goals matched and the tests that held, but it left out `=` and `in`. A goal that computed a value, such as `["=", "?ratio", ["number/divide", "?a", "?b"]]`, did not show, so a figure a rule worked out had no arithmetic in its explanation. The research skill needed every computed figure to trace to the line items it came from.

### Decision

Under `because`, `why` shows each row a relation goal matched, explained in turn, a `not` as `absent`, and every other goal as `check`, with the answer's values in place of its variables. So `["=", "?ratio", ["number/divide", "?a", "?b"]]` shows as `{"check": ["=", 0.25, ["number/divide", 1, 4]]}`. One rule replaces the case that left `=` and `in` out.

### Consequences

Each check, evaluated as it stands, is `true`, so anyone can work the arithmetic again. The research page shows a computed figure's evidence "Worked out as" its arithmetic, and the docs' "Explain a result" shows how a computed figure was worked out.

### Alternatives considered

- **Leave `=` and `in` out of `why`, as before 0.10.0.** A figure a rule computed showed the rows it rested on but not the arithmetic that made it.

### Changes that follow from it

- @lionlang/core 0.10.0, @lionlang/cli 0.9.0: `why` shows every goal of a rule's body as it held, with the answer's values in place of its variables. A goal that computed a value, such as `["=", "?ratio", ["number/divide", "?a", "?b"]]`, shows as `{"check": ["=", 0.25, ["number/divide", 1, 4]]}`, so a figure's explanation shows its arithmetic. `=` and `in` used to be left out.
- @lionlang/core 0.10.0, @lionlang/cli 0.9.0: The page carries the saved text of each source a claim quotes, and each statement opens in its place there, with the quote marked. A computed figure's evidence shows "Worked out as" its arithmetic. How solid is it gains what needs the reader's decision, figures their publisher changed, figures not written in their quote, and what the reader chose.

### Commits

- `41477b1` feat(core,skill): figures you can check against their sources: “why now shows every goal of a rule body as it held, = and in among them, so a computed figure shows its arithmetic on the values it used; one rule replaces the case that left them out.”

<a id="goal-directed-shares-full-relations"></a>

## Goal-directed queries share what is derived in full, and a relation is derived when a goal first reads it

Decided 2026-11-14. In force. Not released yet.

### Context

A goal-directed query rewrote the rules with magic sets into a model of its own, and every rule-defined goal it reached became a copy for the arguments it knew, even a goal that knew none, whose copy holds every row of the relation. Nothing was shared between queries, so a page that asks a model many different questions derived the same relations once per question. A copy also always led with the guard that holds the values asked about, so when a rule could only test a known value, inside a record pattern or a `schema/open`, it scanned its relation once for each value asked about: on the research model of Lion's own development, one copy took 2 seconds where deriving the whole relation took 15 milliseconds. The page's 37 questions took 36.6 seconds goal-directed and 0.12 seconds in full, so the page and the research build switched to full evaluation, and every host with such a model would have had to know to do the same.

### Decision

A relation goal gets a copy only when it knows an argument and the database has not derived the relation in full; any other goal reads the relation itself, which the database derives once and keeps for every later query. A copy's guard leads only when a relation goal of the rule can look rows up by what it binds, a variable that stands whole as an argument or a record or list made of such; otherwise the guard is a test where the rule's own plan has bound what it holds, so a copy never does more than the rule. In both strategies a relation is derived the first time a goal reads it with an answer to extend, rather than before the rules that read it run, and a goal-directed query's rewritten bodies are kept with the model they run on.

### Consequences

Goal-directed evaluation is the default that works on large, rule-heavy models: the research page's questions take 0.11 seconds, as full evaluation takes, and a question asked on a database that has derived nothing yet costs at most about what full evaluation costs, and often far less, since it derives only what its answers reach. A query may now derive a whole relation where it used to derive a copy of it, when it knows nothing about it; the database keeps that relation, so the cost is paid once. Neither strategy fails on a relation that no answer reaches, as goal-directed queries already did not fail on rows they never derive; a program that failed on such a relation now answers. What the database has derived for earlier queries still never changes an answer.

### Alternatives considered

- **Keep full evaluation in the research page and build, as a workaround.** Every host would have to learn that the default is unusable on its model, and a single question on a model nobody has asked yet is faster goal-directed, since it derives only what it reaches.
- **One goal-directed model per database that grows as queries add demand.** It needs groups of relations that already finished to run again when new demand arrives, which is more machinery than sharing what is derived in full, and on these workloads sharing already makes goal-directed as fast as full evaluation.
- **Give a relation a copy only for arguments its rules can look rows up by, and derive it in full otherwise.** A known argument that a rule can only test still keeps a join from being built in full: with `["pair", "?x", "?y"]` defined by `in` over two ranges, asking about one `?x` gives one row per `?y`, where deriving `pair` in full gives the whole cross product.
- **Always lead a copy with its guard, as the textbook rewrite does.** It assumes every known value narrows a lookup. In Lion a known value can sit inside a pattern or a schema, where it only tests rows, and then leading scans the relation once per value asked about, without bound.

### Changes that follow from it

- Unreleased: Goal-directed queries are no longer hundreds of times slower than full evaluation on a large model asked many questions. A goal that knows none of its arguments now reads the relation itself, which the database derives once and keeps for every later query, instead of each query deriving a copy that holds every row anyway; a query that knows an argument of a relation the database already holds in full looks its rows up there; and a rule whose known argument sits inside a record pattern or a schema, such as `["claim", "?c", ["schema/open", {"topic": "?t"}]]`, runs as written and keeps the rows asked about, instead of scanning `claim` once for each value asked about. On the research model of Lion's own development, the 37 questions of its page took 36.6 seconds goal-directed and 0.12 seconds in full; they now take 0.11 seconds goal-directed. A host no longer needs `new LogicDatabase({ goalDirected: false })` for such a model.
- Unreleased: A relation is derived the first time a goal reads it with an answer to extend, in goal-directed and full evaluation alike, so a query never fails on a relation that no answer reaches. With `["rule", ["report", "?t"], ["audit", "?t"], ["broken", "?t"]]` and no `audit` rows, `["query", ["report", "?t"]]` gives `[]` even when deriving `broken` would fail; it used to derive `broken` before running the rule, and fail.

### Commits

- `330aec0` fix(core): goal-directed queries share what is derived in full

<a id="project-record-in-lion"></a>

## Keep the changelog and the decisions as a Lion model of the git history

Decided 2026-11-14. In force. Not released yet.

### Context

`CHANGELOG.md` was prose written by hand at each release, and the reasons behind Lion's design lived only in commit messages and in notes outside the repository. Nothing checked that every feature or fix had an entry, that a release's section listed what that release shipped, or that a changelog entry and the decision behind it agreed. Lion is a language for exactly this: facts, rules that derive the rest, invariants, and `why` for every conclusion.

### Decision

The project record lives in `history/`. Decisions, changes, and releases are plain JSON files, one decision or one piece of work per file, and git is read in as facts: every commit with its parents, time, and message, every tag, and the commit that added each file of the record. A file renamed with nothing else changed keeps the commit that added it; git's renames by likeness are not followed, since two entries share most of their lines, and a new entry would take an old one's commit. Rules in `history/core.json` derive the rest. A change is made by the commits it names, or else by the commit that added its file, and it shipped in the first release whose commit has all of those commits behind it, so nobody writes down which release a change is in. Checks list every `feat` or `fix` commit that no entry records, every quote that is not in the commit message it cites, every breaking change that follows from no decision, and every release whose versions do not rise or whose tag points elsewhere. `CHANGELOG.md` and `DECISIONS.md` are computed by the Lion expressions in `history/outputs.json`, and the record's tests fail when either file is not what the record writes.

### Consequences

`CHANGELOG.md` is no longer edited by hand: a change is recorded in `history/changes/`, and `bun run history write` writes the page. A commit that adds a feature or a fix without an entry fails the check from the next commit on, and in CI, which now fetches the whole history. The record runs on the workspace's own `@lionlang/core`, so a change to Lion that breaks the record's rules fails the tests: the project uses its own language every day. Importing the old changelog showed that its sections already matched what git says each release contained, and the first check found four tags that were never made, for three releases.

### Alternatives considered

- **Markdown decision records beside a hand-written changelog, as most projects keep them.** Nothing would check them against git or against each other, which is the problem the record solves.
- **A changesets tool that collects entries and writes the changelog at release time.** It writes text but knows nothing a rule could check, such as ancestry, decisions, or commits that have no entry, and it is another language beside Lion.
- **Keep the record as a saved Lion database, the file `lion --database` reads and writes.** The facts from git change with every commit, and a file in a commit cannot hold that commit's own hash. Plain entry files merge cleanly, and git itself stays the source of what was committed when.
- **Write down the release each change belongs to.** Ancestry decides it. While the history was backfilled, a fix first placed in 0.1.0 turned out to have reached `main` only after 0.1.1, which a written release would have hidden.

### Changes that follow from it

- Unreleased: [lionlang.dev/changelog.html](https://lionlang.dev/changelog.html) shows the changelog as a timeline: every release on a line through time, newest first, with a pause of a month or more drawn as one, what each release shipped by kind, and the decisions it put into effect, each opening to its context, alternatives, and commits. Every change links to the decisions it follows and the commits that made it. A reader can filter by kind and search changes and decisions, and without JavaScript the page shows everything. The project record writes the page with Lion, as it writes `CHANGELOG.md` and `DECISIONS.md`, turning the record's Markdown into HTML itself, and the site's navigation links to it.
- Unreleased: The project record. `history/` keeps Lion's changes, releases, and design decisions as a Lion model of the git history. Entries are plain JSON files; every commit, parent, and tag, and the commit that added each file, are facts; and rules derive the rest, such as the release that shipped each change, which is the oldest release whose commit reaches every commit that made it. `CHANGELOG.md` and the new `DECISIONS.md` are written from the record by Lion expressions, with `bun run history write`. `bun run history check` fails on a `feat` or `fix` commit that no entry records, a quote that is not in the commit message it cites, a breaking change that follows from no decision, a version that does not rise, a tag on the wrong commit, or a page that is not what the record writes, and the tests and CI run it. `bun run history ask` asks the record anything.
- Unreleased: The record was backfilled from git. Every entry of the hand-written changelog is tied to the commits that made it, and lands, by ancestry alone, in the release it was written under. The releases of `@lionlang/core` 0.1.0 and 0.1.1, which had no changelog, have sections now, and 0.2.0 lists the `@lionlang/cli` package it introduced. The decisions behind Lion's design, from the first commit on, each quote the commit messages they rest on, and every `feat` and `fix` commit since the first is recorded.

### Commits

- `44e509d` feat: keep Lion's changelog, decisions, and a checked model of its development in Lion

<a id="research-model-of-development"></a>

## Keep a research model of Lion's development that checks the project against itself

Decided 2026-11-14. In force. Not released yet.

### Context

The project record says what changed, when it shipped, and which decisions it follows, but not whether the project agrees with itself. Rules were stated in commit messages, the README, and AGENTS.md, and later commits changed behavior the rules still predicted without saying so; decisions were made, reversed, and made again; figures in commit messages were reported against baselines that did not chain. Nothing read the history as a whole, and nothing could be asked before a new decision whether it contradicts an old one.

### Decision

`history/research/` holds a model of Lion's development built with the lion-research skill. Readers record what each commit states as quoted claims in five kinds: a feature, a behavior, a rule with the behavior it predicts and the cases it leaves out, a decision, and a figure. The README, AGENTS.md, and CLAUDE.md as they stand, each decision of the record, and probes that run a program on Lion at HEAD are sources too. A publisher's latest word counts. The frame states assumptions about the project, each with a rule that finds evidence against it, and every finding is either listed in `known.json`, waiting for a decision, or accepted with a reason in `accepted.json`. `bun run history research` builds the model and the page `docs/research.html`, and fails on a finding in neither list and on a listed finding the model no longer finds.

### Consequences

Inconsistencies in the project's history are listed where everyone can see them, on the website and in the check, and a new one fails the record's tests until someone decides about it. A decision can say in the research's terms what it settles, with `"claims"` quoted from its own words, so it is checked against every rule and behavior as soon as it is written. The model is rebuilt from git, the notes, the decisions, and Lion itself, so only the notes, the probes, the lists of findings, and the page are kept in git. A commit nobody has read yet is listed but does not fail the check.

### Alternatives considered

- **Review decisions by hand against the decision record.** Nobody can hold every rule and every behavior in mind, and the inconsistencies the model found had gone unnoticed by every commit that made them.
- **Keep `model.json` and the steps in git.** The documents and decisions are dated by the commit that holds them, so the model changes with every commit and would always be out of date in the commit that writes it.
- **Fail the check on every open finding.** The history cannot be changed, so a finding in an old commit would fail every build until someone accepted it without deciding anything. A list of known findings, like the interop grid's, keeps them visible while it waits for a decision, and fails only on what is new.

### Changes that follow from it

- Unreleased: A checked model of Lion's development, at [lionlang.dev/research.html](https://lionlang.dev/research.html). Every statement each commit made, quoted from its message and diff, what the README, AGENTS.md, and CLAUDE.md say now, the claims of each recorded decision, and what Lion at HEAD does in each probed case are one Lion model, built with the lion-research skill. Rules over it find where the project disagrees with itself: rules in force that predict different behavior for one case, behavior that breaks a rule in force, removals and breaking changes in commits that record no decision, figures that do not chain, and docs that do not say what Lion does. The page answers what the project has said about any rule, decision, behavior, feature, or figure, and shows each statement where it stands in its commit.
- Unreleased: `bun run history research` builds the model and the page and fails on a finding that is not listed in `history/research/known.json` or accepted with a reason; the record's tests run it, so CI does. `bun run history query` asks the model anything, such as `["query", ["reversed", "?topic", "?before", "?after"]]` for the decisions the project made one way and later another. A decision in `history/decisions/` can carry `"claims"` quoted from its own words, so the model checks what it settles against every rule and behavior.
- Unreleased: In the research model, what a rule predicts for a case is what its latest statement naming that case predicts, so a rule reworded to allow a case, as the editor's connector rule was, stops predicting the old behavior.

### Commits

- `44e509d` feat: keep Lion's changelog, decisions, and a checked model of its development in Lion

<a id="lead-done-when-confirmed"></a>

## A research lead is done when every question it pursues has an answer two publishers give first-hand

Decided 2026-11-15. In force. Not released yet.

### Context

The research skill's leads record what each line of inquiry set out to find. A lead needs an end besides running out of patience, and the core already says what confirmation is: an answer two publishers give first-hand, with relays not counted.

### Decision

A lead pursues questions written as patterns: a record covers every answered question that has its keys and values, so `{"warehouses": "tarnwell"}` covers the count on every date. Senses the reader set aside are not covered. The lead is done when every pattern covers an answer that is `corroborated`. Disputes do not hold a lead open; `disputed` reports them as before.

### Consequences

In the Tarnwell corpus, the lead for an outside count of warehouses is done once the licensing registry says 37 first-hand, though Cargo Ledger's 39 is still a dispute. A question only one publisher can answer never finishes its lead, which then runs out of patience, and the report says that nobody independent gives it.

### Alternatives considered

- **Done only when the covered questions are also undisputed.** One outlier source would keep a lead open for as long as anyone kept reading, and the dispute is already a finding of its own.
- **Done when any source answers the question.** One publisher's word repeated by ten outlets would finish it, which is the mistake the research core exists to catch.

### Changes that follow from it

- Unreleased: The lion-research skill records leads, the lines of inquiry a research run follows: `"leads": [{"id": "outside-warehouses", "statement": "…", "pursues": [{"warehouses": "tarnwell"}], "patience": 2}]`, and `"for": ["outside-warehouses"]` on each source read to follow one. A source pays off for a lead when it says something first-hand the lead covers; a lead is `done` when every question it pursues has an answer two publishers give first-hand, waits while the reader has not chosen a sense of one, and is set aside after as many sources in a row as its patience gave it nothing. The standing questions ask where the next search should go and how each lead ended, and the page's "How solid is it" shows the reader "What was looked for".

### Commits

- Not committed yet.

<a id="patience-since-last-payoff"></a>

## A direction or a lead is set aside after as many misses in a row as its patience, counted since its last payoff

Decided 2026-11-15. In force. Not released yet.

### Context

Taylor's map-driven autoresearch keeps a map of ideas, runs experiments on some, and moves effort from the ideas that stall to the ones that pay. The reasoning skill's directions (ideas for improving a score) and the research skill's leads (lines of inquiry) both need a rule for when to stop spending on one. A direction's experiment pays off when its version improves a score; a lead's source pays off when it says something first-hand the lead covers.

### Decision

Each direction and lead has a patience, 3 unless it says. Its misses are the experiments, or the sources read for it, that paid nothing and came after its last payoff; when they reach its patience it is set aside, and it stays in the model with why. A payoff starts the count again, as patience does in early stopping. Both skills use the one rule and the same names: `paid_off`, `miss`, `exhausted`, `live`, `progress`. The research recorder numbers the sources read for leads in the order their notes are recorded, so "in a row" has a meaning there too.

### Consequences

A direction that keeps paying off keeps its budget, and one that never pays is dropped after its patience. The list of where to try next puts the live directions that paid off most first, then those tried least; it is advice, and the agent says why when it goes against it. A direction or lead can also wait: on a question it `needs` that only the user may answer (reasoning), or on the reader's choice of a sense of a question it pursues (research), and an answer otherwise rules a direction out.

### Alternatives considered

- **Count every miss, not only those since the last payoff.** The most productive direction also misses most often in absolute terms, so it would be the first set aside.
- **A fixed number of experiments or sources for each, whatever they find.** It spends as much on an idea that has stopped paying as on one that pays every time, which is what reallocating effort is meant to avoid.
- **Let the model choose the next experiment.** Which idea to try next weighs things the model does not hold, such as cost and how promising an untried idea looks; the model says what the evidence shows and the agent decides.

### Changes that follow from it

- Unreleased: The lion-reasoning skill keeps the record of an experiment loop, in the manner of autoresearch. Notes declare `scores`, numbers to make better, such as `{"question": {"comparisons": "bench.mjs"}, "better": "lower"}`, and `directions`, the ideas to try; an observation that `tries` a direction is an experiment of it. What a version is sure to give is its worst run: the `best` is the best of those, and a version has `improved` a score when its worst run beats the best that any earlier version was sure to give, so `improved`, `best`, `score_in`, and `regressed` follow the evidence and not one lucky run; runs of a score that differ are its spread rather than a dispute. A direction pays off when its experiment improves a score, and is set aside after as many misses in a row as its `patience`, 3 unless it says. The standing question "Where should the next experiment go?" lists the live directions, those that paid off most first.
- Unreleased: The lion-research skill records leads, the lines of inquiry a research run follows: `"leads": [{"id": "outside-warehouses", "statement": "…", "pursues": [{"warehouses": "tarnwell"}], "patience": 2}]`, and `"for": ["outside-warehouses"]` on each source read to follow one. A source pays off for a lead when it says something first-hand the lead covers; a lead is `done` when every question it pursues has an answer two publishers give first-hand, waits while the reader has not chosen a sense of one, and is set aside after as many sources in a row as its patience gave it nothing. The standing questions ask where the next search should go and how each lead ended, and the page's "How solid is it" shows the reader "What was looked for".

### Commits

- Not committed yet.

<a id="score-improves-past-noise"></a>

## A version improves a score when its worst run beats the best that any earlier version was sure to give

Decided 2026-11-15. In force. Not released yet.

### Context

The reasoning skill now keeps the record of an experiment loop, after Karpathy's autoresearch and Mike Taylor's map-driven version of it: change the files, run a score, keep the change if the score got better, revert it otherwise. A benchmark's time or an agent eval's grade moves from run to run, so a loop that compares one run with one run keeps changes that only got lucky, and an agent that may run again when a result disappoints can stop once it is ahead.

### Decision

A score's runs in a version are its range, and what the version is sure to give is its worst run. The best a score has been is the best of those across versions. A version improves a score when its worst run beats the best that the versions which appeared before it were sure to give; which came before is the order the files first held each state. With one run each this is beating the best so far. Runs of a score that differ are its spread, so `disputed` leaves scores out. The files as they are now have regressed when every run on them is worse than the best.

### Consequences

Best, improvement, and regression rest on the one notion of what a version is sure to give, so a lucky run counts on neither side. Another run of the new version can only lower what it is sure to give, and another run of an earlier version can only raise what came before, which takes an improvement back: the verdicts follow the evidence, not the order it came in. In the first trial an agent's dropped change ran 11, 11, and 22 ms; a rule that took the best from any single run named it the best on its 11, and under this rule the best is 13, the worst run of the version the agent kept. The skill asks for the same number of runs on each version, since a version run once has only the one run to be sure of. `why` on an improvement ends in the runs it compared and a check such as `["number/lessThan", 62, 117]`, because the rules compare the values as recorded: one rule each for lower and higher, where negating lower-is-better scores would have saved three rules and shown `-62 > -117`.

### Alternatives considered

- **Every run of the version beats every run of every earlier version.** A score with a ceiling can never improve once any run reaches it. In the loop over the research skill, the baseline's two runs passed 17 and 23 of 23 checks; the next versions were sure to give 22 and then 23, and this rule called both changes misses because of the baseline's one lucky 23.
- **Compare the mean of each version's runs.** With the few runs an agent makes, a mean moves with every run, so an improvement inside the noise gets claimed, and stopping once the mean is ahead is the easiest way to claim one.
- **An improvement must clear a margin the score declares.** A margin is a number the agent picks, and a wrong one either hides real improvements or admits noise; the runs themselves show how far a score moves.
- **Compare one run with one run, as autoresearch does.** It is the same rule when each version has one run, and ignores the others when a version has more.

### Changes that follow from it

- Unreleased: The lion-reasoning skill keeps the record of an experiment loop, in the manner of autoresearch. Notes declare `scores`, numbers to make better, such as `{"question": {"comparisons": "bench.mjs"}, "better": "lower"}`, and `directions`, the ideas to try; an observation that `tries` a direction is an experiment of it. What a version is sure to give is its worst run: the `best` is the best of those, and a version has `improved` a score when its worst run beats the best that any earlier version was sure to give, so `improved`, `best`, `score_in`, and `regressed` follow the evidence and not one lucky run; runs of a score that differ are its spread rather than a dispute. A direction pays off when its experiment improves a score, and is set aside after as many misses in a row as its `patience`, 3 unless it says. The standing question "Where should the next experiment go?" lists the live directions, those that paid off most first.

### Commits

- Not committed yet.

<a id="score-requirements"></a>

## A version's runs of a score count only where what the score requires holds

Decided 2026-11-15. In force. Not released yet.

### Context

An experiment loop that keeps whatever scores best keeps the change that makes a benchmark fast by breaking what it measures. In the skill's own trial, an early exit cut a sort's comparisons from 117 to 27 and failed a test. The reasoning skill already had beliefs, but a belief is judged from the version it was formed in on and stays contradicted once contradicted, which is the wrong rule for a condition each version must meet on its own.

### Decision

A score can list `requires`: questions and the answers a version must have, such as no failing tests. Where one is unanswered, or answered otherwise in any run, the version has no score: no range, no best, no improvement. `unmet(version, score, question, needed)` lists such versions.

### Consequences

A requirement has to be run on each version, as the score is, so a change is not kept until both have run on it. The skill tells the agent to fix or drop such a change and never to relax the requirement to let a score count.

### Alternatives considered

- **Record the requirement as a belief.** A belief contradicted in one version stays contradicted, so one broken experiment would mark every later version.
- **Leave it to the agent to discard broken versions.** An unwritten check is the one that gets skipped, and the record would still call the broken version the best.

### Changes that follow from it

- Unreleased: A lion-reasoning score can list what it `requires`, such as `{"question": {"failing tests": "test.mjs"}, "value": 0}`: a version where that is unanswered or answered otherwise has no score, and `unmet` lists it, so a change that breaks the tests never becomes the best. A direction can list what it `needs`; it waits while that is unanswered or not yet decided by whoever `ask` names, and is `ruled_out` once it is answered otherwise, so the user's answer prunes the directions.

### Commits

- Not committed yet.

# Changelog

## 2026-11-13 — @lionlang/core 0.10.0, @lionlang/cli 0.9.0

Figures that can be checked: numbers read from the text they came from, records changed by making new ones, and explanations that show their arithmetic. The research skill builds on them to check every figure against its source, so it needs this release.

### Added

- `["number/fromString", text]` reads text as a number, as `string->number` does in Scheme, and is `null` when the text is not one number. With a second argument, the whole part may be in groups of three digits with that string between them, so it reads back what `number/toString` writes with the same separator: `["number/fromString", "1,234,567.5", ","]` is `1234567.5`.
- `["string/numbers", text]` is every number written in the text, in order, each read as `number/fromString` reads it, with the same optional separator. A minus sign counts only where no letter, digit, or point stands before it, so `"fiscal 2023-24"` holds 2023 and 24.
- `["object/set", record, key, value]` and `["object/remove", record, key]` give a new record with the key set or gone, as `hash-set` and `hash-remove` do in Racket.
- Like every library function, each waits for a logic variable and refuses a call with another number of arguments.

### Changed

- `why` shows every goal of a rule's body as it held, with the answer's values in place of its variables. A goal that computed a value, such as `["=", "?ratio", ["number/divide", "?a", "?b"]]`, shows as `{"check": ["=", 0.25, ["number/divide", 1, 4]]}`, so a figure's explanation shows its arithmetic. `=` and `in` used to be left out.

### Documentation

- Every special form and library function is used in a live example on [lionlang.dev](https://lionlang.dev/docs.html), and the docs build fails when one is not. The new functions are in their modules' examples, `func/callback`, `object/get-method-path`, `object/new`, and `value/symbol?` now have examples too, and "Explain a result" shows how a computed figure was worked out.
- AGENTS.md and CLAUDE.md ask that every new feature be used in an example in the docs, with output that was run.

### Research skill

- The core program checks that every number in a claim is written in its quote (`unquoted`), takes a publisher's later word over its earlier one (`restated`, `withdrawn`, and `backing`, `disputed`, and `secondhand` without what was withdrawn), lists the questions sources answer in more than one sense of a word the frame declares as a reading (`ambiguous`), records the reader's choice (`decided`), and gives the questions the reader means (`meant`, `set_aside`). A claim can say where in its source it stands (`located`).
- The page carries the saved text of each source a claim quotes, and each statement opens in its place there, with the quote marked. A computed figure's evidence shows "Worked out as" its arithmetic. How solid is it gains what needs the reader's decision, figures their publisher changed, figures not written in their quote, and what the reader chose.
- `page-check.json` also lists questions the plan names that a choice set aside or that have senses nobody chose between. It used to keep only one entry of two blocks with one title; it now keeps both.
- A frozen-corpus eval, `verifies-company-figures`, with known answers checked stage by stage by `grade.mjs`, and a reference run that a property replays.
- `replay.mjs` runs the Lion command `LION_CLI` names, as the reasoning skill's scripts do.

### Reasoning skill

- Notes can list questions only the user may settle, under `ask`. The core lists the ones the user has not answered (`undecided`) and every answer to them from anyone else (`presumed`), and the standing checks ask both. A decision is the user's word in any version, so it does not go out of date when files change.

## 2026-11-13 — lion-reasoning skill

No package changed. `skills/lion-reasoning` is a new agent skill that uses Lion as the working memory of an agent's reasoning while it works, and the README has a section on it.

### Added

- The skill. An agent records what it observed, each observation a question and a value with the words of a command's output or a file that show it, and what it believes, each belief with the answers it predicts. A problem is a question with the value that shows it. Rules derive what the agent would otherwise have to remember to check.
- `assets/core.json`, the program every model starts from. Each observation speaks for the versions of the project in which the files it depends on hold what they held when it was seen, so evidence about a changed file is stale and `changed` lists what the work changed. What the agent ran or read overrules what it was told or recalled, and `overruled` lists each time. A belief is contradicted, borne out, or untested by the evidence of every version from the one it was formed in on, and a belief that explains a problem by the versions where the problem shows, so a fix does not count against the explanation of the bug it fixed. For rival explanations, `decisive` names the questions they answer differently, `remaining` the ones still standing, `settled` the one left when all its predictions are borne out, and `unexplained` a problem with none left. `needed` and `open` say what the task must still observe.
- `scripts/start.mjs`, `see.mjs`, `record.mjs`, `replay.mjs`, and `ask.mjs`. `see.mjs` runs a command and keeps its output and exit status as evidence, with the hash of what it depends on when it ran. `record.mjs` writes a step from plain notes, refuses a quote that is not in the text it came from, and stamps each belief with the version it was formed in. Every version of the project is kept as the changes since the last. The scripts run the published `@lionlang/cli`, so changing Lion itself never changes the checker, and a question runs on a copy of the model.
- References for the agent: the part of Lion it uses, and patterns, each example of which was run, for finding the cause of a bug, verifying a change, checking a test against the old code, checking what it was told, assumptions with rules of their own, a plan with dependencies, and asking what if.
- Properties in `packages/metrics` check the core program against a plain model of versions, evidence, and beliefs, rival explanations against the law that an answer keeps exactly those that predicted it, the recorder, the versions against the files they were taken from, and the chain from changing files to the present answer. Fifteen mutations break those behaviors, and `mutation.ts` takes a `package` so a mutation can run the tests of `metrics`.

### Changed during the first trial

Two agents fixed one real bug in history-free copies of Lion from before commit `28ae742`: loading `special-forms/lambda` first crashed with "Cannot access 'evaluateLambda' before initialization". One used the skill and one did not. Both found the same cause and the same 11 of 49 modules, and both fixes were verified independently: no module fails when loaded first, the core tests and typecheck pass, and each new test fails on the old code. The cost was the same within noise: 238,607 tokens, 81 tool calls, and 17.5 minutes with the skill; 235,018 tokens, 88 tool calls, and 18.3 minutes without. The skill's agent put 30 to 35% of its effort into the model. The model caught one thing that changed what it did: its "fails on the old code" evidence was stale after a later edit to the test, so it ran the check again. It reported five problems with the skill, each fixed above:

- A belief it had disproved on the old code showed as holding again after the fix, because beliefs that explain no problem were judged only against the present. Beliefs are now judged from the version they were formed in on. Rebuilt with the new core, the trial's own model marks that belief as violated.
- Its check that the test fails on the old code went stale for good, because it undid the fix in place to run it. The patterns now run such a check against a copy of the old code, depending only on the test.
- A prediction about the fixed code inside the explanation of the bug could never be checked there, so the problem was never settled. The skill now says to make what a fix will do a belief of its own, recorded after the change.
- Build output that git ignores was never hashed, so evidence about it could not go stale. Such paths are now hashed from disk.
- A list in the output could not be quoted as one observation. A quote can now be a list of quotes.

## 2026-11-13 — @lionlang/core 0.9.0, @lionlang/cli 0.8.0

Text from lists and numbers, and a record that keeps its empty key. The research skill writes its page's words with the new functions, so it needs this release.

### Added

- `["string/join", list, separator]` is a list of strings with the separator between them. With a third string, that one stands before the last item, as `#:before-last` does in Racket: `["string/join", ["array/make", "a", "b", "c"], ", ", " and "]` is `"a, b and c"`.
- `["string/split", text, separator]` is the parts of the text between each separator, so joining them with the same separator gives the text back.
- `["string/padStart", text, length, fill]` and `["string/padEnd", text, length, fill]` make text as long as asked, as JavaScript does: `["string/padStart", "7", 2, "0"]` is `"07"`.
- `number/toString` takes a second argument, a string to write between groups of three digits of the whole part, as `#:group-sep` does in Racket: `["number/toString", 1234567.5, ","]` is `"1,234,567.5"`. With one argument it is unchanged.
- Like every library function, each waits for a logic variable, so a rule, a query, or a `find` can build text with them, and a call with another number of arguments says how many the function takes.

### Fixed

- A record keeps the key `""`, as JSON does. `{"": 1, "a": 2}` used to evaluate to `{"a": 2}`, and so did the same record inside `quote`, in a fact, in a pattern, and in a snapshot; `["object/keys", ["quote", {"": 1}]]` was `[]`. Every record now keeps every key JSON allows except `__proto__`, so a pattern such as `{"": "?v"}` takes the value apart, and a snapshot writes it back. The graph editor's dialog still asks for a property name, and now says so instead of saying keys must be non-empty.

## 2026-11-13 — lion-research skill

No package changed. `skills/lion-research` is a new agent skill that uses Lion as the working memory of a deep research run, and the README has a section on it.

### Added

- The skill. An agent records what each source says as facts, each with the quote that carries it, and writes rules that derive its conclusions, so the model is a materialized view of the research. Its assumptions are rules that the evidence can contradict. A run ends with the saved model and one page for the person who asked for the research.
- `assets/core.json`, the program every research model starts from. It says who stands behind each answer: the publishers who give it first-hand, in a claim credited to nobody else. Sources with one publisher are one voice, and a source that relays another adds nothing, so an answer that three articles took from one press release rests on one publisher. It derives which answers independent publishers confirm, which rest on one publisher's word and how many on each, which are known only second-hand, which sources are credited with something they do not say, which questions sources dispute, which credited sources are unread, and which assumptions hold. Its invariants reject a claim without a known source.
- `assets/utc-minutes.json` and `assets/utc-text.json`, Lion functions that turn a time in any zone into minutes since 1970 UTC and such a count into text, so a rule can order a timeline, measure the time between events, and show both.
- `scripts/build-explorer.mjs`, which packs a model and the plan of its page into one HTML file with the evaluator inside it. The page is for a reader who does not know Lion, and it has no fixed form: the agent writes a plan, `page.json`, for what this reader wants to know. A plan names the views and fills each with blocks: an answer in plain words with its evidence under it, key figures, a table, a timeline, a comparison grid, a lookup whose answer changes as the reader chooses from lists, how solid the findings are, the sources, and text. The plan states no facts: its summary, answers, notes, and figures are Lion expressions that the page evaluates against the model each time it opens, so the wording follows the model and a `cond` on `disputed` or `corroborated` picks the sentence. A lookup's query is a Lion function, called with what the reader chose as data. `assets/words.json` gives the expressions functions for wording: a list as a sentence lists it, a number with separators, a count with its noun. The trust block is built from the core: what independent publishers confirm, where sources disagree, what rests on one publisher's word, what is second-hand, what was misquoted, and which assumptions held. The query editor and the model's tables are always the last view, for readers who know Lion, where a query can also add facts to ask what would follow. The script also writes every query the plan asks as one Lion record, so they can all be run before the page is opened.
- `scripts/record.mjs`, which writes a step from plain notes on what sources said, with everything in it as data, and refuses a quote that is not in the saved text of its source. `scripts/replay.mjs`, which rebuilds the model from its steps and gives a frame the time functions it names.
- `scripts/page-text.mjs`, which saves the text of a page a source was read from, and `scripts/check-quotes.mjs`, which checks that every claim's quote is in the saved text of its source, word for word.
- Two references for the agent, each example of which was run: the part of Lion a research model uses, and rules for facts that hold or do not, disputes, timelines, statements that change, totals, networks, gaps, assumptions, and competing explanations.
- Properties in `packages/metrics` check the core program against a plain model of provenance for any sources, publishers, claims, and attributions, the time functions against JavaScript's clock, and each script against what it is given: the page against its model and plan, and a reader's choice in a lookup against the data it stands for.

### Changed during the first trial

A trial run researched the Microsoft 365 outage of 12 November 2026 with the first version of the skill: 19 sources and 175 claims. That version's core followed each claim to the source it was credited to and counted distinct sources. On the trial's model it called 15 answers corroborated. Eight of them were not: two channels of one company counted as two origins in three, two articles from one newspaper in one, and in four an origin was a source that was only credited, either unread or saying something else. The core above replaced it. On the same evidence it calls 7 answers corroborated, the 7 the trial's agent reached with stricter rules of its own, and it reports 4 misquotes and 26 answers known only second-hand.
## 2026-11-13 — @lionlang/core 0.8.0, @lionlang/cli 0.7.0

Three surprises found while writing Lion programs for a research skill, each removed by one rule. A call gives a function as many arguments as it takes. A number has text. A fact that holds a name says which name, and how to write the string.

### Breaking

- Every function of the standard library takes a set number of arguments, and a call with any other number fails and says how many the function takes. `["number/subtract", 10, 3, 1]` used to be `7`, with the `1` dropped, and `["object/get", {"a": 1}]` used to be `null`, with no key given. They now fail with `"number/subtract" takes 2 arguments but got 3.` and `"object/get" takes 2 arguments but got 1.` The call fails the same way where it waits for a logic variable, in a rule, a query, or a `find`. The failure is a `LogicError`; a call with too few arguments used to fail with a `SchemaError`, or pass `undefined` on.
- Host code that calls a library function gives it the arguments it takes too. `["func/callback", "value/number?"]` handed to JavaScript's `Array.prototype.map` is called with three arguments, and fails. A lambda still ignores arguments past its parameters, so a lambda remains the way to write a callback.
- `func/bind` and `func/apply` take the function and its `this`, then any arguments. `["func/bind", fn]` used to bind `undefined`.

### Added

- `number/add`, `number/multiply`, `number/min`, `number/max`, `string/concat`, and `array/concat` combine one or more arguments, as `+`, `*`, `min`, `max`, `string-append`, and `append` do in Scheme. `["number/add", 1, 2, 3]` is `6`, where the `3` used to be dropped, and `["string/concat", "lion", "-", "ized", "!"]` is `"lion-ized!"`. They work from left to right, so three arguments give what two nested calls give. With one argument they give it back.
- `["number/toString", 42]` is `"42"`: the number as text, the way JSON writes it. Like every function it waits for a logic variable, so a rule can build text from a number: `["string/concat", "order ", ["number/toString", "?id"]]`. The only way used to be `["object/call-method", 42, "toString"]`.
- `object/json-stringify` writes any JSON value, where it used to refuse all but records and lists with `Expected an object`. `["object/json-stringify", 42]` is `"42"`, and `["object/json-stringify", "lion"]` is the string with its quotes. The replacer and the indent are optional. A value JSON cannot write fails with `"number/add" has no JSON text.`
- For hosts: `takes` from `@lionlang/core/errors/evaluation` gives a function the same rule, as in `takes(2, fn)` or `takes(atLeast(1), fn)`, and `over` and `combining` from `@lionlang/core/modules/lib/shared` build a library function from schemas for its arguments. `nameOf` from `@lionlang/core/logic/terms` gives the name a function is written with.

### Changed

- A fact that holds something other than JSON data says which column it is for, what it is, and, for a string that is a name, how to write the string. `["fact", ["note", "source"]]`, where `source` is a relation, used to fail with `Facts may only contain JSON data: ["note","source"].`, which shows nothing wrong. It now fails with `Facts may only contain JSON data, but the "text" of ["note","source"] is the relation "source". To mean the string itself, write ["quote", "source"].` The same message covers the name of a schema or a function, and a logic variable such as `"?why"`, which used to have a message of its own, `Facts cannot contain logic variables`. `fact`, `retract`, and `why` share it.
- Every message about the number of arguments has one form, and names the function as it is written in Lion. `graph/pageRank takes 3 arguments (edges, node, rank) but got 1.` now starts with `"graph/pageRank"`, `Schema "Tree" takes 1 argument, the value to check, but got 2.` is `"Tree" takes 1 argument (the value to check) but got 2.`, and `aggregate/sum takes one argument but got 2.` is `"aggregate/sum" takes 1 argument but got 2.` A relation's message is unchanged.
- `@lionlang/cli` 0.7.0 bundles `@lionlang/core` 0.8.0.
- An `ArithmeticError` shows every number of the call: `number/add: 1e+308 + 1e+308 + 1 has no finite result.`

### Fixed

- A fact that holds a lambda fails with `... which is not JSON data.` It used to fail with `Facts cannot contain logic variables`, though it holds none.

## 2026-11-13 — lionlang.dev

No package changed. These are fixes to the documentation page.

### Fixed

- "On this page" marks the section a link was followed to. For every one of the page's 273 section links it used to mark the section before, or none for a document's first section: a link puts a heading 168 pixels below the top of the window, the page's scroll padding and the heading's scroll margin together, and a heading counted as reached only above 140. A section now counts as reached where a link puts its heading, read from the stylesheet. At the end of a page the last section is the one being read, where its heading could never get high enough to be marked, as in 29 of the 39 documents in a window 800 pixels tall. A section a link was followed to stays marked for as long as the page stays where the link left it, also when the page is too short to bring its heading up.
- An example shows how long its program ran whenever the program ran. A run that a coarse clock measured as 0 ms showed no time, beside others that showed `<1 ms`. A program that did not run, such as text that is not JSON, still shows none.
- Both rules are in `docs/pure.js`, and `@lionlang/site-runtime` now tests them with properties.

## 2026-11-12 — @lionlang/core 0.7.0, @lionlang/cli 0.6.0

Schemas say what a value must be, and one rule says what fits: whatever checks a value against a schema asks whether the value fits it. A logic variable in a schema is the value it meets, so a schema is also a pattern that takes data apart.

### Breaking

- `match` fits a record against a record with the same keys. A record pattern used to fit any record that had its keys, so a branch that picks by one field of a larger record, such as `[{"type": "refund"}, handler]`, must open the record: `[["schema/open", {"type": "refund"}], handler]`.
- An unbound string of the form `module/name` that reads as a misspelled name is an error, where it used to be the string: one whose module has other names bound, such as `"number/ad"`, or one a letter or two away from a bound name, such as `"numbr/add"`. The error is the new `UnboundNameError`, which suggests the name, and holds the string as `unbound` and the suggestion as `nearest`. Other strings with a slash, such as `"n/a"` or `"text/plain"`, are unchanged, and `["quote", "number/ad"]` is always the string.
- A function among the arguments of a relation call is a schema for the column. `["reading", "?sensor", "value/number?"]` used to match nothing, since no row holds a function, and now asks for the readings that are numbers. A relation with more than one column is not the schema of one value, so `["path", "edge", "?to"]` is an error where it matched nothing.

### Added

- Schemas. Anything is a schema. A function is a predicate, so `value/number?`, a lambda, a relation with one column, and a named schema all are. A record fits a record with the same keys and values that fit, a list fits a list of the same length item by item, and any other value fits a value equal to it. So data is a schema for itself.
- `["schema/fits?", value, schema]` says whether a value fits. `["schema/problems", value, schema]` lists every place where it does not, as records with a `path` and what was `expected` or `found` there. `["schema/assert", value, schema]` returns the value or fails and says where.
- `schema/anyOf`, `schema/allOf`, `schema/arrayOf`, `schema/recordOf`, `schema/optional`, and `schema/open` build schemas out of others. What they build is a function like any other. `schema/open` fits a record whatever other keys it has.
- `["schema", "Order", shape]` declares a named schema in the database and binds the name, as `relation` does for a relation. A shape can name its own schema, and one form can declare several, `["schema", name, shape, name, shape, ...]`, whose shapes name each other. Snapshots write the schemas of one form as one form, and a later run that shares the database finds them under their names.
- Patterns. A logic variable in a schema is its value once it is bound, and until then takes the value it meets. `schema/fits?`, the arguments of a relation call, both sides of `=`, and the element of `in` bind the variables of a record, a list, or a schema built by the `schema` functions: `["inbox", ["schema/open", {"type": "order", "id": "?id"}]]`, `["in", {"sku": "?sku", "qty": "?qty"}, "?lines"]`. `?_` fits any value and binds nothing. The goals of a rule give the same answers in any order.
- A schema check is an ordinary call, so it waits for logic variables and works as a filter in a rule or query, under `not`, in a `find`, in `cond`, and as a value in a rule head. `["in", "?p", ["schema/problems", "?doc", "Order"]]` turns the problems of a value into rows.
- An argument of a relation call is a schema for its column: a value, a variable, a pattern, a predicate, or a variable that holds one of those. A relation as the schema of a column is a foreign key.
- The relation option `{"schema": "Order"}` says that every row, as a record of its columns, must fit a declared schema. It stands for the invariant a program could write by hand, so a `fact`, `retract`, or `rule` form that would leave a row that does not fit fails and changes nothing.
- When the goal of an invariant or query assertion says an answer fails a schema, the message ends with where the answer does not fit: `{"id":2,"status":"opne"} does not fit "Order": "status" must fit ["schema/anyOf","open","shipped"] but is "opne".`
- `value/integer?` and `value/any?`.
- For hosts: `@lionlang/core/logic/fit` exports `fits`, `problemsOf`, `misfit`, and `matching`, and `@lionlang/core/modules/schema` holds the `schema` module. From `@lionlang/core/logic/terms`, `builtBy` records the call that built a function, so the function is written as that call, and `readsOnlyArguments` marks host functions that read nothing but their arguments.

### Changed

- `match` checks a value against schemas. Besides a predicate or a record of predicates, a pattern can now be a plain value, a list of schemas, or a schema built by the `schema` functions. A pattern that was neither a function nor a record of them used to fail; now it is a value to equal.
- A change to facts is checked against the invariants that read what it changed, and an invariant that expects no answers is asked about the rows the change added when that is enough. Which changes are kept does not change. An invariant that calls a function the host added is asked in full every time, unless the function is marked with `readsOnlyArguments`, since such a function can read the database on its own.
- A record or list with a logic variable in it is held as a record or list of its parts, and written that way in snapshots and messages, where it was a call to a lambda that made it.
- A function made by `func/partial` is written as the call that made it, so a rule or schema that holds one can be saved in a snapshot.
- A lambda inside a list, a record, or a function that another function built is closed over the values its names have when a rule is written, like a lambda that is a direct argument, so a rule that holds one can be saved in a snapshot.
- A list that holds a function or a logic value is shown as the `array/make` call that makes it, not as a bare list that reads like a call.
- An unsafe goal's message names `"schema/fits?"` among the goals that bind a variable.
- An unknown relation option is reported with the relation's options, `"key"` and `"schema"`.
- For hosts: `applyQueryOptions` from `@lionlang/core/logic/query-options` only sorts and pages; `checkAssertion` from `@lionlang/core/logic/database` checks a query's assertion.
- `@lionlang/cli` 0.6.0 bundles `@lionlang/core` 0.7.0, so `lion --database` keeps a database's schemas with its data, and the graph editor reads the `schema` form.

### Fixed

- A function made by `func/partial` from a logic variable waits for the variable when a rule or query holds it, as a lambda that mentions the variable does. Handed to `array/map` in a query, it used to fail with `has no value yet`.
- A goal-directed query that hands a rule-derived relation a function, for example through a variable, is answered as in full evaluation. It used to fail with `Rule undefined produced a value that is not JSON data`.
- A graph algorithm's input that a variable binds to something that is not data fails with the message an input written in place gets.
- Any module of `@lionlang/core` can be the first one loaded. Importing the module of a special form before the evaluator failed with `Cannot access 'evaluateLambda' before initialization`, and whether the built package loaded at all depended on the order the bundler happened to choose.

## 2026-11-12 — @lionlang/core 0.6.0, @lionlang/cli 0.5.0

Two rules now cover how plain code and the logic layer meet: whatever needs the value of a logic variable waits for it, and whatever needs the value of a goal asks it.

### Added

- Waiting. Every function waits when it is called with a logic variable and runs once the variable is bound: the whole standard library, host functions as they are, and `func/partial` results. `cond`, `match`, `eval`, and records wait the same way, and so do lambdas passed to a waiting call. A rule can hold `["cond", [["number/greaterThan", "?x", 10], "big"], ["else", "small"]]` or the record `{"id": "?x", "twice": ["number/multiply", "?x", 2]}`, and gives for each answer what plain code gives with the value in the variable's place. `logicFunction` from `@lionlang/core/logic/terms` marks a host function that takes logic values as they are.
- Asking. A goal with a relation in it is a question that any expression can ask. As a goal of a rule or query it still matches rows and binds variables. As a value it is `true` when it has a match and `false` when it has none: in a `cond` condition, as an argument of a function, as an operand of `=` or `in`, as a value of a record, as an argument of `fact`, and as the value `match` looks at. A relation is a predicate for `match` and for functions that are given it, so `["array/map", ["array/make", "ada", "zed"], "person"]` is `[true, false]`. Plain code asks right away, and goal-directed. A rule, query, invariant, or `find` holds its questions and asks them for each answer when it runs.
- `["find", template, goal]` returns the template's value for every match of the goal, as a sorted list: `["find", "?c", ["parent", "ada", "?c"]]` is `["ben", "cy"]`. It works in plain code and inside rules. The Fold Map editor and the site highlighter recognize the form.
- Aggregates outside rule heads. As a whole argument of a rule head an aggregate still combines one value from each match. Anywhere else it combines a list once the list is known, so `["=", "?total", ["aggregate/sum", "?items"]]` works in a rule body. An aggregate of a `find` combines what the find found, so `["aggregate/count", ["find", "?c", ["parent", "?p", "?c"]]]` can be 0. An aggregate's argument can also be a constant, as in `["aggregate/sum", 1]`.
- Questions have variables of their own. When a question is asked, the variables that the rule or query around it has bound are fixed, and every other variable belongs to the question. So a goal under `not` no longer needs every variable bound first: `["not", ["and", ["parent", "?p", "?c"], ["retired", "?c"]]]` asks whether `?p` has a retired child.
- An algorithm's value input can be a variable that another goal binds: `["and", ["depot", "?s"], ["graph/shortestPath", "road", "?s", "?to", "?km", "?_"]]` runs the algorithm once for each depot.
- `number/remainder`, `number/power`, `number/min`, `number/max`, `number/absolute`, `number/floor`, `number/ceiling`, and `number/round`.
- For hosts: `call` from `@lionlang/core/evaluation/special-forms/function` calls a Lion function from host code and gives its value, asking a goal the function returns. `WaitingError` is what it fails with when the value is not known yet. `@lionlang/core/logic/model` holds the engine, and `LionAskerService` from `@lionlang/core/services/asker` says who answers questions.
- The docs have a new guide, [Use answers as values](https://lionlang.dev/docs.html#ask-questions), a step in the family tree tutorial that collects answers with `find`, and reference sections for waiting and asking.

### Changed

- A relation goal given to a plain function, a record, `=`, `in`, or `fact` is asked. Before, a function or record was handed the goal itself, and `fact` refused it. `define`, `and`, `or`, `not`, and lambdas keep a goal as it is, so goals can still be named, combined, and passed around.
- A filter must be `true` or `false`. A goal such as `["number/add", "?x", 1]` used to pass as true; now the rule or query fails and shows the value.
- `and` and `or` stop at the first argument that decides them, as in Scheme, so `["and", false, ["number/divide", 1, 0]]` is `false` instead of an error.
- Query answers must be JSON data. A variable bound to a function used to be left out of the answer; now the query fails and shows the answer.
- A rule cannot ask about a relation that depends on its own head. This is the rule against negation through recursion, and it now covers every question: a goal under `not`, a `find`, and a goal used as a value.
- A query that is not goal-directed derives only the relations it reads, instead of every relation that rules define.
- Lion is faster. Ten benchmarks, from a recursive lambda to negation over 20,000 facts, run 1.5 to 3.5 times as fast as on 0.5.0.
- For hosts, `@lionlang/core/logic/terms` changed. `markPure` and `isPureFunction` are removed, since every function waits. The `Negation`, `Conjunction`, `Disjunction`, `Unification`, and `Membership` classes are one `LogicForm` class, tested with `isForm`. The `Aggregate` class is removed: an aggregate is a waiting call. `relationInfo` is now `relationOf`, and `RelationValue`, `isRelationValue`, and `isLogicTerm` are removed.
- For hosts, in other modules: `keyColumns` and `MAX_LATTICE_ROUNDS` moved from `logic/database` to `logic/model`. `SpecialFormName` and `isSpecialFormName` moved from `analysis/analyze` to `schemas/evaluation`. `literalGoal` and the schemas for the cases of `cond`, the patterns of `match`, and the `snapshot` form are no longer exported.
- `@lionlang/cli` 0.5.0 bundles `@lionlang/core` 0.6.0.

### Fixed

- A `cond`, `match`, or lambda that branched on a logic variable ran before the variable had a value, so it took the same branch for every answer: `["cond", [["number/greaterThan", "?x", 10], "big"], ["else", "small"]]` in a rule head gave `"big"` for 1, and a snapshot saved the rule with `"big"` in place of the `cond`. `eval` of a logic variable returned the variable. These forms now wait.
- A `cond` whose condition was a relation goal took that case whether or not the goal had a match.
- A snapshot wrote a function under the name the program called it by, such as a name bound with `define`, which is not there when the snapshot loads. It now writes the name the environment gives the function.
- A query that held `false` and the `"order"` option failed with "Cannot order by" instead of returning no answers.
- `match` read a fallback written as a two-item call, such as `["mk", 10]`, as one more pattern.
- `["=", 0, -0]` was `false`. JSON writes both as `0`, so they are the same number.

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

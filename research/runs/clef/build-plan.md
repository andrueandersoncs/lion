# Build plan: everything the Clef run found

The plan that came out of the Clef run (`report.md` beside this file). On 2026-11-20 the user, shown the run's answer, said: "do ALL of these. Everything. All fixes and new ideas worth adopting. Fix all surprises. Everything. Write this all down somewhere so you don't lose track as context grows."

Branch `claude/clef-language-lion-insights-e4faf9`, which starts at the consolidation branch (a242648) with the Clef run cherry-picked onto it (7573548). Keep this file current: mark each item's status, what it settled, and its commit, so the work survives a long session. Read it first after any break in context.

**Permission given (2026-11-20):** the user's "do ALL of these. Everything." settles the three ideas the report said wait for a decision. Each one is still recorded as a decision in `history/notes/`, in the commit that makes it, because a breaking change follows a decision:
- a match may leave out its fallback;
- decision `lambda-arity` is reversed: a lambda refuses extra arguments;
- `set!` is refused where the engine picks the order.

## How each item is done

Every item follows `AGENTS.md` and `CLAUDE.md`, and is committed on its own:
- one rule, not special cases; walk the feature through every existing feature, plain code and logic layer (the list in `guidelines/designing-features.md`); add its cells to the interop grid (`packages/metrics/src/grid-cases.ts`), and a new form to the model in `packages/core/src/evaluation/tests/interpreter.ts`;
- property tests (`it.prop` / `it.effect.prop`) against a simpler model, a round trip, or an equivalence, written to fail first; a mutation in `packages/metrics/src/mutations.ts`; `bun run mutate --in <files>`;
- a new function in the arity table, `packages/core/src/modules/tests/arity.test.ts`;
- `bun run measure --against main`, `bun run bench --against main` (twice), `bun run scale --against main`, reported as they are;
- a live `<lion-example>` in `packages/site-runtime/content/`, the README section, `bun run compare main --docs`, the search for sentences made untrue, `bun run --cwd packages/site-runtime docs`;
- claims in `history/notes/` (a decision record where a rule changes), a probe in `history/research/probes.json` for each behavior changed, `bun run history write`, `bun run history check`;
- `bun run check`, `bun run test`, typecheck, before the commit.

At the end: run the Clef probes again under a new source id (`node research/probes/run.mjs lion-probes-cl-built ...`) and record what changed in the research model, so its verdicts follow what was built.

## The items, in build order

Status: `todo`, `doing`, `done (<commit>)`.

### A. The surprises

1. **A failure names the function, the argument, and the callers** — done (see the commit "fix(core): a failure names the function...").
   - Built as designed. A frame that called in tail position is not named (the `Called` mark in `enter`), nor one no `define` bound. `define` names an unnamed lambda dynamically. `raisedAs(error)` gives the message without the trail (the analysis compares diagnostics with it). A match case that is not a function now fails as a call does. `SchemaError` still comes from a program that is not a Lion expression.
   - Measured against main (a242648): +227 code lines, +29 functions, +4 messages, no new form or kind of error; benchmarks and growth within noise.
   - No history probe for the new messages: a probe that fails is just "error". Add probes once failures can be caught (item 10).
   - Today `["number/add", "seven", 1]` fails with "Expected number at [0]" (the schema decoder's words); `["label", "seven"]` through two lambdas says the same.
   - Rule: a library function's argument of the wrong kind fails in the same form as its arity message: `"number/add" takes a number as argument 1 but got "seven".` (`modules/lib/shared.ts`: `decode` failures inside `over` and `combining`, which know the function by `show`).
   - Callers: an error that passes out of a Lion function's body says which named functions it passed through, innermost first: `(in "next", called from "label")`. Added in `enter` (`evaluation/special-forms/lambda.ts`) on the error path only. A lambda gets its name from the `define` that binds it, as Racket infers names.
2. **One arity rule: a lambda refuses extra arguments** — done (commit "fix(core)!: a lambda takes as many arguments as it has parameters"). Decision `lambda-arity` reversed in `history/notes/lambda-takes-its-parameters.json`.
   - Built as designed. `counted`/`countOf` in `errors/evaluation.ts` record every function's count (`takes`, lambdas, `func/partial`'s functions); `func/callback` slices the host's arguments to it. `ArgumentMismatchError` is gone (kinds of error 9 -> 8). Four known findings in `history/research/known.json` settled and removed.
   - `enter` fails when given more or fewer arguments than parameters, in the one form of message: `"next" takes 1 argument but got 2.` `ArgumentMismatchError` goes away.
   - Host callbacks: `func/callback` gives the lambda as many of the host's arguments as it takes. Check every library function that calls a Lion function (`array/map` and the rest) for the number of arguments it passes.
   - Guideline line "A call gives a function as many arguments as it takes" gains lambdas; the arity table too.
3. **Integers Lion cannot hold exactly are refused** — done (commit "fix(core): integers a JSON number holds exactly do exact arithmetic").
   - As built, one change from the design: only integers a JSON number holds exactly (|n| <= 2^53 - 1) do exact arithmetic (add, subtract, multiply, power, `aggregate/sum`); past that range a number is a float and rounds. Every double past 2^53 is whole, so treating every whole operand as an integer refused `["number/multiply", 1e300, 1e5]`. So `["number/add", 9007199254740992, 1]` still rounds (2^53 is a float); `9007199254740991 + 2` fails.
   - `evaluation/reading.ts` (`readJson`, `inexactInteger`) refuses text that writes an integer that would not read as itself; used by the CLI (file and `--database`), the site runtime, and the REPL. `number/fromString` and `string/numbers` leave such an integer out.
   - Arithmetic on integers whose result is an integer past ±(2^53−1) fails with an `ArithmeticError`, as a result past the finite numbers fails now.
   - A program's text with an integer literal past that range is refused when it is read, naming the literal: a check over the JSON text's number tokens, in one reader every host uses (CLI, site runtime, REPL, `--database` files).
4. **`object/get` tells a missing key from one that holds null** — done (commit "fix(core)!: object/get fails on a key a record does not have"). Decision `object-get-missing-key` in `history/notes/object-get-tells-missing-keys.json`.
   - Built as designed, with `KeyNotFoundError` moved to `errors/evaluation.ts` (it names the record now) and the solver reading `object/has?` and `object/get`'s value for a missing key on records of known shape.
   - Every two-argument `object/get` in the repo's Lion programs (history/core.json, history/outputs.json, history/research/steps, research/steps, skills/lion-research/assets/core.json, skill eval references, packages/examples) got an explicit `null`, by `scratchpad/get-null.py` (a layout-keeping rewrite), so each behaves as before. Proof patterns in the docs and research probes ask `["object/has?", "c", "deposit"]` instead.
   - The rule `values-are-json` is restated to predict an error for a missing key.
   - As Racket's `hash-ref` and Lion's own `object/get-path`: a missing key fails (`KeyNotFoundError`), and a third argument is the value to give instead. Only a record's own keys count (today `["object/get", {}, "toString"]` gives a JavaScript function).
   - Add `object/has?` (Racket `hash-has-key?`). Update every program in the docs that relied on null.
5. **No `set!` where the engine picks the order** — done (commit "fix(core)!: set! fails where the engine chooses the order"). Decision `set-in-rule-bodies` in `history/notes/set-where-the-engine-orders.json`.
   - Built as designed: `Environment.made` (from `makingScope()`), `Asker.since` (from `madeNow()`), and `refusedSet` in `evaluation/special-forms/set.ts`, which reads the asker synchronously through `Fiber.getCurrent()`. The interpreter model has the same rule.
   - A lambda called from a rule body runs once, when the rule is written (`applyIn` in `evaluation/special-forms/function.ts`), so a `set!` there runs once, not once for each row.
   - Rule: while a rule, query, or find is written or run (a `LionAskerService` is present), `set!` fails when it changes a binding made before that began. A binding the evaluation made itself, such as a loop's counter in a helper, can still change. Frames record when they were made; the asker records when it began.

### B. Proofs

6. **Proofs that notice premises allowing no state** — done (commit "feat(core): why names the goals that contradict each other").
   - As built: `contradictionOf` in `logic/model.ts` (deletion over the step's filters, goals under `not` first, so `vacuous` is exact), `stepOf` and `refuted` in `logic/explain.ts`. `why` now also tells an `exists` the solver decides whole, which it told only as absent. Goals fixed when the rule is written (constants) are no goals of the step.
   - Mutation run: "a relation goal reads a relation's rows before they are derived" was already stale on main; "why explains a row a key made again by the first answer found" was missed once and caught in two reruns (a randomized property).
   - Today `cl-vacuous-proof` proves a rule no account meets, and `cl-why-absent`'s `why` says only "absent".
   - Rule: when the solver proves `not exists` because the conditions other than the one negated allow no value at all, `why` says so (a `vacuous` premise naming the contradicting conditions, an unsatisfiable core), and a certificate's lines name the premises the refutation used. Read `logic/solver.ts`, `logic/certificate.ts`, `logic/explain.ts` first.

### C. Matching and contracts

7. **A match's cases checked with schema inclusion; the fallback optional** — done (commit "feat(core)!: a match may leave out its fallback"). Decision `match-fallback` in `history/notes/match-cases-checked.json`.
   - As built: a last part that is a pair is a case (`isMatchCase` in `schemas/evaluation.ts`); with no fallback, no fit fails naming the value. The analysis (`withCaseWarnings` in `analysis/analyze.ts`) warns of a case an earlier case includes, for case schemas that are closed (host names, data, and names bound inside them); `lion check` prints analysis errors and warnings; the editor shows warnings in a non-blocking alert, and the match node reads "N cases" without a fallback. `schema/includes?` holds of a schema and itself.
   - Not done: coverage of a subject's schema (a match "checked to cover every value of its schema"). It needs the subject's schema, which item 8's contracts give: do it there.
   - Proof video: `out/proof/match-warning.mp4`.
   - A match with no fallback fails, naming the value, when no case fits, as Racket's `match` does.
   - `analyze` reports a case that an earlier case includes (it can never be reached), and a match without a fallback whose subject has a known schema (a contract's) that its cases do not cover. Both decided by `schema/includes?`.
8. **Contracts on lambdas, with blame** — done (commit "feat(core): a lambda's parameter may carry a contract").
   - As built: a parameter `[name, schema]` (`ParameterSchema`, `parameterNames`, `parameterSchemas` in `schemas/evaluation.ts`) checks its argument as `schema/assert` does, at the call (`checked` in `lambda.ts`, through `applyIn`, so a check of a waiting value waits). The schema is made where the lambda is. The trail starts with the caller (blame). The solver refuses contracted lambdas by name, so the waiting rule lists values. The analysis reads a contract's schema in the scope around the lambda. Item 7's coverage check is here: a match with no fallback on a contracted parameter is warned of when its cases leave out a value of the contract.
   - Not done: a result contract (Racket's range). The message is schema/assert's, not one naming the contracted function: a check that waits in a rule must be a call a snapshot can write.
   - A parameter may be `[name, schema]`: the call checks the argument by the one fitting rule, and a failure blames the caller: `"label" called "next" with "seven" as argument 1, which does not fit value/number?.`
   - Maybe a result schema, blamed on the function. Decide when building, by Racket's `->`.

### D. New values and control

9. **`delay` and `force`** — todo. As Racket: `["delay", expr]` makes a promise, which `force` runs once and keeps; `force` of any other value gives it back.
10. **Failures a program can catch and read as data** — todo. As Racket's `with-handlers` and `raise`: a failure caught as a record (its kind and message, and the data it was raised with). Never catches waiting or asking, which are not failures.
11. **Numbers that carry their units** — todo. Pint's way, checked when the program runs: a quantity is a JSON record of a value and a unit, the unit a record from base unit to whole exponent, equal when the JSON is. Arithmetic checks units; schemas say what unit a value has; the solver solves for exponents.
12. **Host code that watches a query** — todo. The database keeps derived rows up to date already; add a way for host code (and Lion code) to be told the answers that came and went after each change.
13. **Delimited continuations** — todo. `reset` and `shift`, one-shot: the body after `shift` runs in a fiber that `k` resumes, so generators, coroutines, and early exit are one construct. A second resume of one `k` fails by name.

## Pitfalls met

- The pre-commit hook runs every package's tests; a failing hook leaves nothing committed. Check `git log` after each commit.
- `compiled.test.ts` compares the compiled evaluator with `evaluation/tests/interpreter.ts`: change the interpreter with the evaluator. Messages are compared as raised (`raisedAs`), without the trail of callers.
- Build core (`bunx turbo build --filter=@lionlang/core --filter=@lionlang/cli`) before `bun run --cwd packages/site-runtime docs`: the docs run the built core, and `bun run history check`'s probes do too.
- A settled finding must leave `history/research/known.json`, or the check fails.

## Found while building

(Surprises met on the way, to fix in the item they belong to or list here.)

- `["object/get", {}, "toString"]` reads a JavaScript method off the record's prototype (item 4). Fixed in item 4.
- `begin` in a rule body, a query, or a `find` drops a call that waits for a logic variable when it is not the last part: `["find", ["f", "?x"], ...]` with `f`'s body `["begin", ["schema/assert", "n", S], body]` never runs the assert, so a misfit passes where plain code fails (found while testing item 8). Not fixed yet: a `begin` that waits should run every part when it runs.

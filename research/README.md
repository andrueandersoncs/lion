# Research

Research for Lion is kept as one Lion model, built with the [lion-research skill](../skills/lion-research/SKILL.md). Each run adds to the same model instead of starting a new one. A later run starts from everything earlier runs established: what each source said, what Lion does, which ideas were weighed and what the evidence said about them, and the rules that drew those conclusions. When new evidence arrives, conclusions that rest on old evidence change with it, because the rules derive them.

`guidelines/researching.md` holds the rules for a run. This file describes the folder.

## Layout

```text
research/
  steps/       every program that changed the model, in order, for every run
  notes/       what each batch of sources said, as plain JSON, one file per step
  sources/     the text of every source, as it was read: <source id>.txt
  probes/      the Lion programs whose output is a source, and run.mjs to run them
  checks.json  the standing questions, asked after every batch
  runs/<run>/  each run's report.md and page.json; readers/ keeps what subagents returned
  model.json   built from steps/ by the replay; never edited, not committed
```

Every file is committed except what is built from the rest: `model.json`, and each run's `explorer.html` and `page-check.json`.

## Rebuild and ask

Run these from this folder:

```bash
node ../skills/lion-research/scripts/replay.mjs
node ../packages/cli/dist/bin.mjs checks.json --database model.json
node ../skills/lion-research/scripts/check-quotes.mjs
node ../skills/lion-research/scripts/build-explorer.mjs model.json --page runs/<run>/page.json --out runs/<run>/explorer.html
```

Build the CLI first with `bunx turbo build --filter=@lionlang/cli`. The replay runs every step into a new model, and replaces `model.json` only when all of them pass.

## The shared frame

`steps/00-core.json` is the skill's core. `steps/01-frame.src.json` holds what every run shares:

| Kind of statement | Says |
|---|---|
| `{"lion": feature, "has": true/false}` | Lion has a feature, or lacks it |
| `{"covers": feature, "by": technique, "is": true/false}` | a technique, language, or system gives a feature, or does not |
| `{"needs": condition, "by": technique}` | a technique only means something where the condition holds |
| `{"adopted": technique, "in": system}` | a working system uses the technique |
| `{"designed": technique, "in": system}` | a system's design or specification plans the technique, which it does not say is built yet; it is not a precedent |
| `{"defines": term}` | a source explains a term |
| `{"raises": term}` | a source asks about a term |
| `{"counted": what, "n": integer}` | a figure a program gave |
| `{"result": technique, "measure": what, "bound": bound, "times"/"percent"/"count": number}` | a result a source reports for a technique, such as a speedup |
| `{"lion measured": workload, "ms"/"s": number}` | how long Lion took on a workload |
| `{"lion grows": workload, "power": number}` | how Lion's time grows with the size of a workload |

What a program run on Lion says about what Lion has overrules what its docs say: where the publisher `Lion probes` gives one value and the docs another, only the probes' value is `stated`.

It also holds the rules that judge an idea for Lion:
- A `candidate` is a proposed change to Lion, with the techniques it `uses` and the features it `offers`. `weighed_in` names the runs that weighed it, so a run's page can keep to its own.
- The model derives what a candidate's techniques `give`, and of that what Lion has, which they `handle`, and what it lacks, which they `bring`.
- It derives what each candidate `adds` that Lion lacks among what it offers, what Lion has `already`, what it `folds` into one rule, and what `blocks` it or leaves it `moot`.
- From those it derives a `verdict`, a `rank`, `caveat`s, and `precedent`s.
- A candidate that adds something Lion lacks, but needs a condition Lion lacks too, is `worth adopting in part`; one that adds nothing and needs such a condition `has nothing in Lion to work on`. Only `worth adopting` is ranked, and not an idea that another covers: `subsumed_by` holds when everything one idea gains, the features it adds and the mechanisms it folds into one (`gain`), another gains too, and more.
- An idea `builds_on` another that adds a condition it needs, and is `unfounded` on a condition no idea adds. It `overturns` a documented rule Lion has that it `rewrites`.
- `to_build` holds the ideas left to build, across every run, and `stage` orders them: 1 for an idea that waits for nothing, one more than the stage of an idea it builds on otherwise. `passed_over` gives the reason each other idea was set aside.
- An assumption `expects` a question to have a value, or `expects_cover`s: expects some technique a candidate uses to cover a feature. The model finds the evidence that `violated` it, and calls it `unsettled` while no evidence bears on it.

A feature name is the same words in every run, so that evidence from different runs meets on one question. Before you name a feature, ask the model which names exist:

```json
["aggregate/unique", ["find", "?f", ["or", ["answer", {"lion has": "?f"}, "?_", "?_"], ["answer", ["schema/open", {"covers": "?f"}], "?_", "?_"]]]]
```

## Runs

| Run | Steps | Question |
|---|---|---|
| `separation-logic` (2026-11-18) | `02-sl-*` to `10-sl-*` | What can Lion use from separation logic? Step `10-sl-built` records Lion after the three ideas it ranked were built. |
| `lion-improvements` (2026-11-17) | `11-li-*` to `23-li-*` | What to improve in Lion next? It weighs seven directions, such as one algebra of changes (DBSP) and annotated relations, by net reasons: Lion features one mechanism would take over, capabilities it would add, and measured gaps a published speedup applies to, until Lion closes them. Its own frame, `11-li-frame`, ranks them as `net_rank` from `tally`. Step `23-li-built` records Lion after the least-member fix, component following, and compiled evaluation were built. |
| `cirt-refinement-types` (2026-11-18) | `24-ci-*` to `27-ci-*` | What can Lion use from CIRT, the calculus of inductive refinement types (arXiv 2611.20867)? It weighs seven ideas against Lion's schemas and rules. It ranks stratified recursion for schemas first: a schema may ask about itself only about a smaller part of the value. Its probes found that a schema whose predicate asks about itself, about the same value, runs Lion out of memory; step `26-ci-probes-now` reran them after compiled evaluation, and step `27-ci-fixed` after the fix (8325151), so its first idea is now one Lion does already. Its own frame, `24-ci-frame`, adds `alike` (an assumption that two questions have one answer). It first wrote `overturns` (a documented rule a candidate would change), which the `consolidation` run moved into the shared frame. It also added the shared verdict `worth adopting in part`. |
| `unified-algebra` (2026-11-18) | `28-ua-*` to `30-ua-*` | Can the one algebra of changes that `lion-improvements` designed be built, rules that invent unknowns included? It was: every row has a weight, the number of its candidates, and the time it holds is a column of the same rows. Step `28-ua-technique` names the technique, candidates counted by level, and `29-ua-built` records what the properties and the benchmarks gave. The report says how rules that invent, keys, and equality rules are followed row by row, what the checks found, and what it cost. Step `30-ua-gaps` records the gaps closed after it: a row beside one with its key is read a level later, `why` tells the least answer at a row's level, found when asked, and a group whose rules read nothing of its own keeps a weight alone. |
| `formal-verification` (2026-11-19) | `31-fv-*` to `38-fv-*` | What should Lion add so a model can be proved correct, as Alchemy's Verify proves its domain models with Z3? It weighs ten ideas against twelve probes of a bank account (`probes/fv-*.json`). It ranks first a solver for the values a question leaves open, then bounded search with inputs drawn from schemas, then rules about what must eventually happen; proofs that every command keeps the invariants, invariant inference, and certificates build on the solver. Its own frame, `31-fv-frame`, adds `fv_rank`, `build_level`, `fv_needs`, `fv_caveat`, and Alchemy's gaps beside Lion. It first wrote `builds_on` (a condition another candidate adds) and `subsumed_by`, which the `consolidation` run moved into the shared frame. |
| `tufazip` (2026-11-19) | `39-tz-*` | What can Lion learn from TufaZip, a compressor whose decoder learns in step with its encoder and whose benchmark counts the decoder in the score? Lion already makes a change pay for what it adds, and rebuilds its state from steps in any order. It adds one idea, a held-out eval case for the skills' improvement loop, because one fixed case can be gamed. `probes/tz-figures.json` checks eleven of the page's figures. |
| `consolidation` (2026-11-19) | `40-co-*`, `41a-co-*` to `41d-co-*` | What should Lion build next, across every run? It runs every earlier program again under `lion-probes-now`, and moves the rules that ordered the formal-verification ideas into the shared frame so they order every run's: `gain`, `subsumed_by`, `builds_on`, `unfounded`, `overturns`, and new `to_build`, `stage`, and `passed_over`. Its page lists what can start now in rank order, what waits for what, what needs a decision because it would change a documented rule, and what was passed over and why. `runs/consolidation/build-plan.md` is the order the user agreed and its status; step `41a-co-built-listing` records the first step built, schemas that list their values, and `41b-co-built-solver` the second, the solver: Lion now solves for values no goal binds, proves that none meets a goal, and runs a program's own lambdas on symbolic values, so formula terms are something it does already, and of what the solver offers only a way to compare what two predicates accept is left, for schema inclusion; `41c-co-built-eventually` the third, rules about what must eventually happen as questions over the states of every run, which Lion now does already; and `41d-co-built-proofs` the fourth: proofs that a command keeps a rule, Houdini in Lion, `schema/includes?`, and certificates a checker written in Lion rechecks, so every formal-verification idea Lion could build is one it does already. |
| `join-gap` (2026-11-19) | `41-jg-*` | Does Lion still have the hub-graph join gap after the weights engine and compiled evaluation? It does. The triangle query on two hub nodes and 19,983 edges takes 15,010 ms and grows n^1.9, as on 2026-11-17, against 36 ms and n^0.9 without hubs. `probes/hubs/` keeps the generator and the timing script, so the measure can be taken again. `joins` is still worth adopting, ranked 1 of what is left to build with annotated relations, now that the solver is built. |
| `clef` (2026-11-20) | `42-cl-*` to `45-cl-*` | What can Lion adopt or learn from Clef (clef-lang.com), an F#-family language with units of measure, delimited continuations, incremental computation, and verification designed into its compiler? It reads 47 of Clef's pages and posts, and Racket, Pint, and RFC 8259 for precedents, and weighs twelve ideas against seventeen probes (`probes/cl-*.json`). Clef's pages describe as designs what they have not built, so the shared frame gains `{"designed": technique, "in": system}`, which is not a precedent. Its probes found that a function that changes a binding gives one number for three items in a rule body and three in plain code, that a failure for an argument of the wrong kind names neither the function nor its caller, that integers past 2^53 are rounded without a word, and that a proof from premises that allow no state is still a proof. Three of its ideas would change a rule Lion documents: a match's fallback, extra arguments to a lambda (decision `lambda-arity`), and `set!` in a rule body. Step `45-cl-built` records Lion after every idea and surprise was built (`runs/clef/build-plan.md`): the seventeen probes run again (`lion-probes-cl-built`), programs that use what was added (`probes/cl-built-*.json`, `lion-probes-cl-added`), `lion check` and a host program that watches a query (`probes/watch-host/`, `lion-host-cl-added`), and the reference pages as they read now. Lion does eleven of the twelve ideas already. Contracts on lambdas are built in part: an argument is checked and the caller blamed, but the failure does not name the function whose contract was broken. |
| `exact-numbers` (2026-11-21) | `46-en-*` to `51-en-*` | Should Lion make its numbers exact, so that what its solver proves holds of what its code computes, and how do provers such as Lean prove arithmetic no procedure decides? Its probes (`probes/en-*.json`) found two proofs of Lion's solver that Lion's own code breaks, at 0.1 and at 2^53, and that Lion rounds 2^53 + 1 without a word although it refuses 9007199254740991 + 2. It reads Scheme, Racket, JSON's RFCs, JavaScript, Python, Lean and Mathlib, Dafny, ACL2, SMT-LIB, Flocq, and what is decidable, and weighs nine ideas. It ranks first of everything left to build making every number exact: integers of any size and fractions, each number read as the value its digits write. It sets aside Scheme's two kinds of number, decimals, and two ways of keeping doubles, since exact numbers give all they give. A model of exact numbers beside JavaScript's doubles (`probes/exact-model/`, saved as `exact-model-tests`) estimates that Lion would take 1.7 times as long to add decimals, and `probes/json-source/` checks that Node and Bun give a reader a number's digits. After exact numbers come polynomial identities, nonlinear facts from products of hypotheses, and proofs as values a small checker accepts; induction over recursive functions can start now. Its own frame, `46-en-frame`, adds `en_cost` and `en_slowdown`, and `en_built` for the cost measured once it was built. Step `51-en-built` records Lion with exact numbers built (`lion-probes-en-built`, `exact-built-timing`): the two proofs hold of plain code, every number idea is one Lion does already, adding decimals takes 1.9 times as long against the estimate of 1.7, and the proof ideas no longer wait, with induction over recursive functions ranked first of them. |
| `self-improvement` (2026-11-21) | `52-si-*` to `54-si-*` | How can Lion be used to improve Lion, and the rate at which it improves? `runs/self-improvement/plan.md` lists the qualities that can be measured, the constraints and how each is kept, a short experiment loop, a build order, and nine mechanisms. Its first phase is in the project record: three decision records, and `untested`, the rules in force that no probe checks. The run weighs the nine mechanisms at commit 7d623a7 as ideas, from what Lion's own tools print (`probes/si-built/run.mjs`, saved as `lion-host-si-built`), a probe of the solver against plain code (`probes/si-number-gap.json`), and thirteen sources for precedents. The improvement record and pair coverage are ideas Lion does already, and so is `testing`, which no run had judged. The capability corpus is first of everything left to build, with agents' attempts, held-out tasks, and outside suites to add, so `held-out-eval` is passed over as folded into it. Picking tests by function, naming the constraints a change puts at risk, recording every check run, and listing stale probes can start now. A check of the solver against plain code waits for a solver that computes with plain code's numbers, which no idea in the model adds, and counting agents' errors waits for the corpus's agent runs. Its probes found that a reach map is written, and `affected` exits 0, even when tests it traces fail, which leaves picking unsound until the map is made again. |

A run's own ids start with its prefix: claims `sl-a1`, leads `sl-terms`, assumptions `sl-records`. Source ids, candidate ids, and feature names have no prefix, because later runs share them. A later run that reads Reynolds 2002 cites `a-reynolds-2002`, and new evidence about the record split adds to the candidate `rest`.

A run's page asks about its own candidates through `weighed_in` and its own beliefs and claims by their prefix, since the model holds every run's. Its trust and sources views show the whole model.

## Lion as a source

What Lion does is recorded from its reference pages and from programs run on it.
- Each program is in `probes/`.
- `probes/run.mjs` runs them and saves their output as a source, so a claim quotes what Lion gave.
- `sources/lion-probes.txt` names the commit it ran at.

When Lion changes, run the probes again under a new source id, and record what the new output says. The publisher's latest word replaces its earlier one, so the conclusions follow Lion as it is now.

```bash
node research/probes/run.mjs lion-probes-2026-12-01 records keys-rules split-model
```

A probe that models a proposed rule beside Lion's engine is a TypeScript program in a folder of its own, run with `bun` in that folder: `chase-model/` (invented unknowns and equality, saved as `chase-model-tests`) and `algebra-model/` (annotations as aggregated columns, saved as `algebra-model-tests`), and `weights-model/` (rows with weights, held from a level, which runs the properties of `packages/core/src/logic/tests/weights.test.ts` several thousand times, saved as `weights-model-tests`).

A probe that times Lion keeps the program's generator and a script that times it, in a folder of its own: `hubs/` writes the triangle program on a graph with two hub nodes and times it at four sizes (`node research/probes/hubs/time.mjs 3 node packages/cli/dist/bin.mjs`). Its output, saved as a source such as `lion-bench-hubs`, is what a claim about a time quotes.

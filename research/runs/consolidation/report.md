# What to build in Lion next, from every research run

Run `consolidation` (2026-11-19), steps `40-co-frame` and `40a-co-lion-now`, with changes to the shared frame. It gathers what three sessions found (formal verification, the TufaZip review, and a second look at the CIRT paper) into the one research model, runs every earlier program again on Lion as it is now, and has the model put every idea from every run in one order. The page plan is `page.json`. Every figure below is what the model gives; the checks named "Every run: …" in `research/checks.json` ask for them.

## Update: what has been built since

The user agreed a build order from this report on 2026-11-19; `build-plan.md` beside it keeps its status. All four steps are built, and steps `41a-co-built-listing` to `41d-co-built-proofs` record them: schemas that list their values, the solver, rules about what must eventually happen, and proofs that a command keeps a rule with schema inclusion, invariant inference, and certificates. Every formal-verification idea Lion could build is now "Lion does this already", so the model lists four ideas left to build ("Every run: what is left to build, by stage and rank"): annotated relations and worst-case optimal joins, tied first, then a schema of valid programs, then a held-out eval case. The `join-gap` run (step `41-jg-hubs-now`, `runs/join-gap/report.md`) timed the hub-graph join gap again, and it still holds. The figures below are as they were when the report was written.

## The answer

Across 5 runs the model weighs 32 ideas. 11 are left to build. 7 can start now, 4 wait for one of those, 12 Lion does already, 7 were passed over, and 2 are judged only by their own run.

**Can start now, in the model's order:**

| | Idea | Run | What it would give Lion |
|---|---|---|---|
| 1 | Solve for the values a question leaves open | formal verification | a proof that a goal has no answer for any value; values that satisfy constraints over unbound variables; running a program's own code on symbolic values; a way to compare what two predicates accept |
| 2 | Annotated relations: top-k proofs and probabilities | what to improve next | top-k proofs; probabilities |
| 2 | Worst-case optimal joins | what to improve next | worst-case optimal joins; skewed joins |
| 4 | Search every sequence of commands up to a bound, with inputs drawn from schemas | formal verification | every value a schema allows, up to a size |
| 5 | A schema of valid programs, for models that write Lion | what to improve next | constrained generation |
| 6 | Rules about what must eventually happen | formal verification | rules about what must eventually happen |
| 6 | A held-out eval case for the skills' improvement loop | TufaZip | a score the tuning never saw |

**After the solver,** which gives each what it needs: proving that every command keeps the invariants, finding the invariants a proof needs, a certificate for every proof (all from formal verification), and deciding when one schema includes another (from CIRT). The CIRT run left schema inclusion "worth adopting in part" because Lion could not compare what two predicates accept; the solver adds exactly that, so the two runs' answers now meet on one idea.

**Needs your decision first.** The solver would change a rule Lion documents: "Every variable in a filter, in a computed value, or in an input of a graph algorithm must first be bound by a relation goal" (logic guarantees, `co-g1`; the probe `fv-unbound-filter` still refuses, `co-n4`). The formal-verification report proposes keeping the rule's promise by deciding only fragments where every question gets an answer (linear arithmetic, equality over JSON) and refusing the rest by name. Recursion through `not` on a smaller argument, the open CIRT lead, would change "rules refused when a question goes through recursion", but it is passed over anyway: it needs a way to know a computed value is smaller, and no idea adds one.

**Passed over:** Formulog-style formula terms (the solver gives all they give, and more), rules that use up facts (they conflict with results independent of rule order), hand-written proofs and polymorphic schemas (both need a type checker that runs before the program), model checking with rules over every reachable state (needs rules that follow computed states without a bound), a conjunction whose goals match different facts, and rules recursing through `not` on a smaller argument (each needs something no idea adds).

**Judged only by their own run:** merge functions over a union-find (egglog) and metamorphic engine tests. Neither offers a feature Lion lacks by name, so the shared rule gives no verdict; the 2026-11-17 run's own measure ranks them 3rd and 7th of its seven.

## What came in from the three sessions

- **Formal verification.** Its commit, f0ce896, is applied here. It adds steps `31-fv-*` to `38-fv-*`, twelve probes, 66 sources, and 384 claims. Its record pages were written again rather than merged.
- **TufaZip.** That session committed nothing. It is now run `tufazip` (see `runs/tufazip/report.md`): three sources, a program that checks eleven of the page's figures, three beliefs that hold, and one idea, the held-out eval case.
- **The arXiv paper** was CIRT, which the model already held from 2026-11-18. That session ran the fifteen CIRT probes again and found the same output, so it committed nothing. They ran again here, on this commit, with every other program (`lion-probes-now`), and still give what step `27-ci-fixed` recorded.

## What running every program again found, and what was fixed

The 43 programs earlier runs kept, and one new one, ran on commit f07d583. 41 give what their run recorded. Two differ, each because of a change made on purpose:

1. **An aggregated relation now takes facts.** `aggregate-facts.json` was refused with "computed by aggregate rules, so it cannot have facts"; since 8f281ba a relation whose rules aggregate merges what each key gets, and its facts are candidates. The new program `co-aggregate-facts.json` shows a fact of 7 summed with rows of 30 and 20 into 57 (`co-n1`). The reference page on logic guarantees still said "an aggregated relation cannot have facts, unless it merges what a key gets"; that sentence is corrected here.
2. **A `cond` condition must be true or false** (475bab7). `fv-explore-code.json` used a number as a condition and stopped with "A condition must be true or false". Its conditions now ask `value/number?`, and it gives what it gave: 5,460 sequences checked, and the careless withdrawal broken by one withdrawal of 3 (`co-n2`, `co-n3`).

Asking the model what changed found two more things to fix:

3. **The model said Lion lacks counting.** The claim `li-l17` read "Adding what the database already holds changes nothing" as no counting. The docs now say "Every derived row has a weight: the number of its candidates" (`co-w1`), so the newer word replaces it, and the one algebra of changes (DBSP) from 2026-11-17 is judged "Lion does this already", as the unified-algebra run built it.
4. **Two earlier pages were wrong on this commit.** The separation-logic page asked for every ranked idea in the model, so since the formal-verification run it read "0 are worth building: 1. Let a question solve for the values…". It now asks about its own run only and reads "none is left to build", as before. The lion-improvements page used a list's length as a condition and no longer opened; it now compares the length with 0.

## How the model puts the runs in one order

The rules that ordered the formal-verification ideas now order every run's, in the shared frame (`steps/01-frame.src.json`):

- `builds_on`, `unfounded`, and `subsumed_by` moved there from `31-fv-frame`, and `rewrites` and `overturns` from `24-ci-frame`. `subsumed_by` now compares what each idea gains, the features it adds and the mechanisms it folds into one, across every run, instead of the features one run's ideas add.
- `gain` is what an idea adds or folds. `standing` counts it, and leaves out an idea another covers, so the shared `rank` no longer ranks Formulog's terms second.
- `to_build` is an idea worth adopting, in whole or in part, that no other covers, or one that has nothing in Lion to work on but needs only what another idea adds. `stage` is 1 for those that wait for nothing, and one more than the stage of an idea it builds on: a lattice maximum through recursion. `passed_over` gives the reason for each idea set aside.
- The 2026-11-17 directions now say what they offer (`11a-li-candidates`), so the shared verdict judges them, and its frame judges a direction that aims at speed done when every gap it measured has closed, as compiling to closures did.

## Limits

- **The order across runs is coarse.** Rank counts the features an idea gives, then the publishers behind its techniques. Each run named its features at its own grain, so "annotated relations" and "joins" tie at 2 with two features each, and the solver's four come from one run that split its features finely. Read ranks one apart as close.
- **Not in the order:** what the unified-algebra run left open is measured, not weighed as ideas: deriving from nothing is 0.78 to 0.88 times as fast as before it where rows give each other, and a database that invents or recurses through an aggregate keeps more memory. Those figures are in `runs/unified-algebra/report.md`; the model holds Lion's times but not the earlier ones they were compared with.
- **One publisher.** That held-out evaluation gives a score the tuning never saw rests on Wikipedia alone.
- **Written after the evidence.** The TufaZip beliefs were written after its first session read the page, as the formal-verification beliefs were written after its probes ran. They confirm rather than predict.

## Rebuild

```bash
bunx turbo build --filter=@lionlang/cli
cd research
node ../skills/lion-research/scripts/replay.mjs
node ../packages/cli/dist/bin.mjs checks.json --database model.json
node ../skills/lion-research/scripts/check-quotes.mjs
node ../skills/lion-research/scripts/build-explorer.mjs model.json --page runs/consolidation/page.json --out runs/consolidation/explorer.html
```

# Lion improving Lion

A plan, written 2026-11-21 at core 0.15.0 (commit 4e8e625). Nothing in it is built yet. Every figure marked "today" was measured on that commit. Figures from earlier sessions carry their date.

## The idea

Make the way Lion gets better a Lion model, and judge each change to Lion the way Lion judges a change to a database. Each quality is a **score**, observed for each version of the files. Each constraint is something a version must satisfy before its scores count (`requires`), or an invariant that refuses the change outright. Each idea is a **direction**. Each experiment carries a **belief** that predicts what it will move. `why` explains every verdict.

Lion already has every piece:

- `packages/metrics` observes complexity, speed, growth, test strength, and behavior.
- The project record in `history/` checks decisions against Lion at HEAD.
- The research model in `research/` ranks ideas across runs.
- lion-reasoning's scores and directions run an experiment loop that does not reward a lucky run.

Four things are missing:

1. **A measure of what a change buys.** Lion counts the cost of every change and none of the gain. Without a gain, "aim for the numbers to go down" works against capability. Core grew 3.7 times in eight days, and nothing can say whether that was a good price.
2. **Constraints that a check enforces.** Several of Lion's MUST-level constraints are written down, and no check fails when one breaks.
3. **A check cycle short enough for a loop.** About an hour per item (2026-11-20), most of it spent running checks.
4. **A record of the loop itself.** Without one, the rate of improvement cannot be measured, so it cannot be improved.

## 1. What "better" means

The loop compares versions in this order. Each level counts only once the level above it is satisfied, so this is never a weighted sum:

1. **Constraints hold.** A version that breaks one has no score.
2. **Capability rises.** Lion can do more of what it is for: general computation, logic programming, and formal proofs, written as JSON, mostly by agents.
3. **Cost per capability falls.** Cost means:
   - what a programmer must know;
   - the code;
   - time and memory;
   - an agent's dollars per solved task.
4. **The rate rises.** More capability is gained per hour and per dollar, with the constraints still held.

A weighted sum would let a large gain buy a broken constraint, so the order is strict. Within level 3, a change is accepted when it is no worse on any hard measure and better on at least one. A soft measure, such as a constant-factor slowdown, counts against the change as a reported cost.

## 2. Qualities that can be measured

✓ means the instrument exists. **new** means it must be built.

### 2.1 Capability: the measure that is missing

| Quality | Instrument | Baseline |
|---|---|---|
| Agent-solved corpus, per pillar (computation, logic, proofs): the share of tasks a headless agent solves in Lion | **new**: a corpus, run with `skill-eval`'s isolation | none |
| The held-out share of the same | **new**: a private folder that only the grader reads | none |
| First-attempt validity: the share of agent programs that are well-formed and run without an error on the first try | **new**: read from the corpus transcripts | none |
| Cost per solved task: dollars, minutes, turns | `skill-eval` prints them ✓ | about $2–3 and 6 minutes per Tarnwell run (2026-11-14) |
| Reference programs: the public tasks a stored Lion solution solves, at no cost | `bun run capability`, and a property in `packages/metrics` ✓ (phase 1B) | 48 of 55 public tasks: computation 24 of 26, logic 14 of 15, proofs 10 of 14; the other 7 are gaps |
| R7RS-small conformance: passes, listed departures, unlisted departures | probes `r7rs-<section>-<what>` of the cases R7RS-small settles, predicted by the rule `scheme-racket-semantics` in `history/notes/r7rs-small-cases.json`; its exceptions are the departures ✓ (phase 1B) | of 36 cases probed, 26 give what Scheme gives and 10 differ, each a departure a decision names; 11 departures listed in all, with an unbound string |
| Logic-programming suite: programs that run, how long they take, and how they grow | **new**: suite chosen by a research run | hub-graph triangles: 15,010 ms, growing as n^1.9 (`join-gap` run) |
| Verification suite: tasks proved, refuted with a counterexample, or refused by name, and proofs that plain code contradicts | **new** | two false proofs found by hand: the solver works over exact numbers, and plain code over doubles (2026-11-21) |
| Ideas left to build | the research model's `to_build` ✓ | 4: annotated relations, joins, a schema of valid programs, a held-out eval |

### 2.2 Coherence: least astonishment

| Quality | Instrument | Baseline |
|---|---|---|
| Grid cells like plain code, and grid exceptions | `measure` ✓ | 1,289 cells; 3 exceptions, all in `KNOWN` |
| The 12 equivalence pairs in `guidelines/designing-features.md` that have a property, and a mutation that property catches | **new**: the constraint ledger (§3.2) | not counted |
| The "one rule everywhere" rules that have a property and a caught mutation | **new**: the same ledger | not counted |
| Feature pairs covered: two forms in one place, with a grid cell or a property | **new**: generated from the vocabulary | the grid covers expression × place only |
| Surprises found by probes and still open | the research model ✓ | the solver number gap is open, and the `exact-numbers` run in the Clef session is working on it; the six from the Clef run are built |
| Findings listed in `known.json`, and in `accepted.json` | `history check` ✓ | 29 listed and 0 accepted: 11 figures that do not chain, 9 rules broken, 5 undecided removals, 2 rule conflicts, 2 docs unlike Lion |
| Decision assertions, checked by running Lion | `history` ✓ | 632 hold, 5 broken, 351 stated but never run, 28 replaced |

### 2.3 Cost: what a programmer must know, and the code

These are today's numbers and the numbers at each release. Grid exceptions are left out because today's grid holds cases that the older versions cannot run.

| | 0.6.0 (11-12) | 0.8.0 (11-13) | 0.12.0 (11-17) | 0.14.0 (11-18) | 0.15.0 (today) |
|---|---|---|---|---|---|
| code lines | 6,035 | 7,858 | 11,178 | 13,248 | 22,392 |
| paths through functions | 1,542 | 2,036 | 2,932 | 3,508 | 5,931 |
| tests of a value's kind | 70 | 92 | 133 | 168 | 257 |
| special forms | 21 | 22 | 24 | 25 | 27 |
| library functions | 82 | 94 | 105 | 105 | 122 |
| kinds of error | 6 | 7 | 7 | 7 | 9 |
| messages | 95 | 123 | 136 | 151 | 250 |

9,144 of the lines came after 0.14.0, with the solver, the proofs, and the Clef items. The grid's exceptions fell over the same releases. **new**: each measure per passed capability task, per pillar, such as lines, paths, messages, and vocabulary per passed task. This is the measure you chose (§3.0).

### 2.4 Correctness

| Quality | Instrument | Baseline |
|---|---|---|
| Property tests and example tests in core | count (**new** as a score) | 375 property tests; 173 tests with fixed inputs remain |
| Mutations caught, missed, and stale, of 460 | `mutate` ✓, most of an hour | not run today |
| Flake rate: properties that pass and fail on the same files | **new**: hook telemetry | several seen in the commit hook on 11-19 and 11-20: the `cond`-that-asks family, a weights follow bug, slow docs examples under load |
| Solver soundness: proofs that plain code contradicts | **new**: differential property (M5) | 2 known |
| Escaped defects: a fix to a feature after the release that shipped it, and the days it took to find | **new**: a rule in the history model | not counted; 92 `feat` and 51 `fix` commits overall |

### 2.5 Speed and growth

| Quality | Instrument | Baseline |
|---|---|---|
| Time of 22 benchmark programs, beside a commit | `bench` ✓ | run per change |
| Growth power, peak memory, and kept memory of 36 workloads | `scale` ✓ | not run today; the hub-graph join, a research probe and not a `scale` workload, grows as n^1.9 |

### 2.6 Documentation truth

| Quality | Instrument | Baseline |
|---|---|---|
| Documented programs whose result differs from Lion's | `compare --docs` ✓ | run per change |
| Forms and functions with no live example | the docs build fails on one ✓ | 0, gated |
| Claims on sentences the docs no longer hold | `history check` notes ✓ | listed per check |

### 2.7 Writability by agents

| Quality | Instrument | Baseline |
|---|---|---|
| Messages that name the function, the caller, and what was expected | **new**: a property over the message catalogue | 250 messages; the Clef run found one that named neither, and library arguments were fixed |
| Causes of corpus failures, by share, such as a relation name written as text or `set!` in a rule | **new**: transcripts classified by a Lion rule | at least four recurring pitfalls in the session notes |
| Skill eval grades | `skill-eval` ✓ | lion-research is sure to give 23 of 23 |

### 2.8 Rate: qualities of the improvement process itself

| Quality | Instrument | Baseline |
|---|---|---|
| Check time per change: the hook, `history check`, `mutate --in`, `bench`, `scale` | **new**: telemetry | about 1 h per item (11-20). Measured 2026-11-21 at 9d59e05: the commit hook 1 min 58 s (core 72 s, history 56 s, metrics 52 s, and cli 20 s, run side by side); `history write` 63 s; `history check` 55–62 s; `scale` 50 s; `bench` 5 s; `measure` 4 s; `compare --docs` 1 s; the docs build 0.4 s; a full `mutate` 56 min (591 of 594 caught, with 4 jobs under a load of about 25). Per change, the tests are minutes and mutations are the hour. |
| Throughput | git ✓ | 304 commits since 2025-12-03; core went from 0.6.0 (11-12) to 0.15.0 (11-20); 50 commits on 11-18 |
| Hit rate: experiments that paid off, of those tried | lion-reasoning `progress` ✓ | not recorded for Lion itself |
| Calibration: predictions the evidence bore out, and predictions it contradicted, per kind of change | lion-reasoning `borne_out` and `contradicted` ✓ | not recorded |
| Rework: decisions reversed, assertions replaced, fixes within 7 days of their feature | history ✓, plus a **new** rule | 28 assertions replaced |
| Idea latency: from first weighed to "Lion does this already" | **new**: a rule in the research model | formal verification took one day (11-19 to 11-20) |
| Record lag: unread commits, stale probes, how long findings stay listed | history ✓ | listed per check |
| Your attention: questions asked per merged improvement, and merges waiting | **new** | none |
| **R**: capability gained per hour and per dollar | **new**: derived | none until §2.1 exists |

## 3. Constraints, and how each is kept

### 3.0 What you decided on 2026-11-21

| Question | Decision |
|---|---|
| Complexity | Judged **per capability**. The hard limit is on what a programmer must know (grid exceptions, vocabulary, messages), and on lines per passed task. Code may grow when capability grows. |
| Scheme fidelity | A **conformance suite** drawn from R7RS-small. Every departure is a recorded decision, kept in a list like the grid's `KNOWN`. An unlisted departure fails. (As built, the list is the exceptions of the rule `scheme-racket-semantics` in the record; see §3.2, row 3.) |
| Autonomy | **Branches only.** Agents build, measure, record, and commit on branches. You merge, release, and approve any decision that overturns a documented rule. |
| Yardstick | **Both**: an agent-solved task corpus with a held-out part, and external suites. |
| Faster checks | **Impact-picked checks are not weaker** when the picked set catches every listed mutation the full set catches. The full suite still runs before merge. |
| Speed | **Growth is hard**: a workload's growth power or kept memory may not rise past its recorded value. **Constant factors are soft**: reported, and counted against the change's score. |
| Held-out tasks | Kept **outside the repository**. Only the grader reads them, and only scores enter the model. |
| Budget | A **dollar cap per experiment**, recorded in the model. A direction that runs over is set aside. |

Phase 0 recorded these as three decision records: `history/notes/improvement-judged-by-capability.json`, `improvement-loop-on-branches.json`, and `scheme-departures-listed.json`. The last also lists the first departure from Scheme, which you approved: an unbound string evaluates to itself.

### 3.1 A constraint is kept only when a check can fail on it

Each constraint sits on one of three levels:

| Level | Meaning |
|---|---|
| **stated** | It is written down. |
| **probed** | A program observes it. |
| **gated** | A check fails when it breaks. |

On top of the level, a constraint is **guarded** when an experiment cannot change the instrument that checks it. The ledger records each constraint's level, and a rule lists every constraint below gated. As built in phase 0, the constraints are the record's rules in force, and `untested(rule)` lists those no probe checks: 107 of them at phase 0's commit. The loop's first directions raise those.

### 3.2 The ledger

**Identity: what Lion is**

| # | Constraint | Source | Kept today by | Level | How the loop keeps it |
|---|---|---|---|---|---|
| 1 | Every program is valid JSON, read with no parser of Lion's own | `json-programs`, AGENTS.md | `evaluation/reading.ts` reads JSON | stated | A property: every program in the corpus, the grid, the docs, and the probes gives the same result after a JSON round trip. A repository probe with an allow-list fails when a special form or library function parses a string as code. |
| 2 | A program evaluates entirely in memory | AGENTS.md (MUST) | core imports no `node:fs`, `net`, `http`, or `child_process` (checked today) | stated | A repository probe over `packages/core/src` imports, with an allow-list, run by `history check`. A property: a program run twice in fresh environments gives equal results. |
| 3 | Semantics approximately those of Scheme and Racket | `scheme-where-unclear`; `scheme-departures-listed` | the record's `scheme-precedent` assumption, and probes of the cases the rule predicts | gated where probed | The departures are the cases the rule `scheme-racket-semantics` excepts, each by a decision (built in phase 0: an unbound string is the first). Phase 1B adds probes of the cases R7RS-small settles, so a difference from Scheme in a case no decision excepts is a `rules-hold` finding and fails `history check`. A separate list beside `KNOWN` would say the same thing twice. |
| 4 | The logic layer and the Lisp are one language | AGENTS.md, goal 1 | the grid's exceptions must be in `KNOWN` | gated | Kept as it is, and extended to pairs of features (M7). |

**The language's rules**

| # | Constraint | Source | Kept today by | Level | How the loop keeps it |
|---|---|---|---|---|---|
| 5 | Each "one rule everywhere" rule, and each equivalence pair, has a property and a mutation that property catches | `designing-features.md` | some do; nobody counts them | stated | Ledger rows go from rule to property to mutation. `unpinned(rule)` fails the check. |
| 6 | What a decision asserts holds | the record | `history check` fails on a new finding | gated for findings; 351 assertions only stated | Each new decision brings a probe. The loop aims at stated assertions in the order of how much depends on them. |
| 7 | A proof agrees with plain code | goal 1: an expression gives in a question what it gives in plain code | nothing; **violated** by the number gap | none | Being fixed by the Clef session's `exact-numbers` run (commit 643e1d1), which ranks exact numbers first. The loop adds the differential property (M5) after that lands. |
| 8 | No breaking change or removal without a decision | `recording-changes.md` | the record's `breaking-decided` and `removals-decided` | gated; 5 known findings | Kept as it is. |

**Ratchets: what may not go backwards**

| # | Constraint | Level today | How the loop keeps it |
|---|---|---|---|
| 9 | Capability never drops | none | Public reference programs pass, as a gate at no cost. The agent pass rate and the held-out pass rate stay at or above their best: the worst run of a version must not fall below the best any version was sure to give (`score-improves-past-noise`). |
| 10 | Semantic cost per capability holds or falls, and grid exceptions never rise | exceptions gated | `requires` on the per-capability scores (your answer). |
| 11 | Code per capability holds or falls | none | The same. Absolute growth is allowed when capability grows. |
| 12 | Growth power and kept memory never rise past their recorded values | reported | Hard `requires`. A constant-factor slowdown is a soft score (your answer). |
| 13 | No new missed mutation, and each added behavior brings a mutation that is caught | `mutate` reports | A `requires` on the picked mutations. The full run happens before merge. |
| 14 | The docs are true | `compare --docs` is run by hand; examples are gated | A `requires` of zero unintended differences on the affected docs. |
| 15 | No feature, test, or message a user needs is removed without a decision | features: gated; tests and messages: stated | A rule over git: a deleted `it.prop`, or a message that is gone, in a commit with no decision, is a finding. |
| 16 | Properties are not weakened, such as by fewer `runs` or a narrower generator | stated | The mutation score is a `requires`, so a weakened property shows up as a missed mutation. |

**Process**

| # | Constraint | Level today | How the loop keeps it |
|---|---|---|---|
| 17 | Every change is recorded in its commit | gated by `history check` | Kept as it is. |
| 18 | Ask before undoing an intentional constraint | stated | The research model derives `overturns`. A direction that overturns a documented rule, or whose diff changes what a decided topic asserts, `needs` your answer (lion-reasoning `needs` with `ask: user`), and waits until you give it. |
| 19 | Branches only | **new** (your answer) | The loop's runner has no command that merges, pushes, tags, or publishes. A probe checks that the loop's commits are on loop branches. |
| 20 | Every presentation comes from the model | stated; the record's pages are written from it | Scoreboards, reports, and the figures in commit messages are written from the improvement model. This also stops new figures that do not chain (11 of today's 29 findings). |
| 21 | Compute in Lion; no `npm` or `npx`; AGENTS.md and CLAUDE.md under 200 lines | stated | Cheap repository probes: line counts, and a search of the scripts. |

**The measurements stay honest: guards against the optimizer**

| # | Constraint | How the loop keeps it |
|---|---|---|
| 22 | An experiment never changes the instrument it is scored by | A `requires` that the experiment's diff leaves these alone: `packages/metrics`, the corpus, the graders, `KNOWN`, `known.json`, `accepted.json`, `mutations.ts`, and the probes. This generalizes skill-eval's `eval lines changed = 0`. Changing an instrument is an experiment of its own, with a decision, and it starts a new score question. |
| 23 | A list that excuses failures grows only by a decision | Each list's size is a cost score, so a growing excuse list counts against the change. |
| 24 | Held-out tasks stay unseen | They live outside the repository (your answer). The improving agent's session has no path to them. |
| 25 | Runs are compared only under the same question | The question names the suite version, the machine, the model, and the budget, as lion-reasoning already requires. |
| 26 | One lucky run never counts | A version is judged by its worst run against the best of earlier versions (existing rule). |
| 27 | Spend stays within each experiment's cap | lion-reasoning `needs` the budget answer. A direction over its cap is set aside (your answer). |
| 28 | The full suite runs before merge | The merge request the loop prepares for you carries the full run's results (your answer). |

## 4. The method: a short scientific method, run as a constrained optimizer

### 4.1 One experiment

1. **Observe.** Read the scoreboard at HEAD. A score already observed on identical files is not run again, because versions are file hashes.
2. **Orient.** The model lists, in this order:
   - violated constraints;
   - regressions;
   - untested constraints (`untested`);
   - the largest capability gap in each pillar;
   - open surprises;
   - the ranked directions.
3. **Predict.** Record a belief that `tries` the direction before the build. It names the scores the change should move and by how much, and the scores it should leave alone.
4. **Clear.** Check the constraints that can be checked before anything is built:
   - A direction that overturns a rule waits for you.
   - A direction that touches an instrument is split off as a separate experiment.
   - The budget is declared.
5. **Build** the smallest version that tests the belief, on a branch.
6. **Test**, cheapest check first, and stop at the first failure:
   1. typecheck;
   2. the picked properties;
   3. the grid;
   4. `compare --docs` on the affected docs;
   5. the picked mutations;
   6. `bench`, then `scale`, of the affected workloads;
   7. the reference programs;
   8. agent runs on the affected corpus tasks;
   9. the held-out tasks.
7. **Judge.** The constraints are the `requires`. A version improves a score when its worst run beats the best so far, and on the costs it must be no worse on any hard measure.
8. **Record** the claims, a decision if the change made one, the verdict, and whether the belief was borne out.
9. **Choose the next experiment.** Apply patience, set aside exhausted directions, and propose a merge to you.

### 4.2 Where shortening is safe

- **A belief replaces the write-up.** Its predictions are the hypothesis and the design note in one.
- **Run each score as often as its noise needs.**
  - Once for deterministic scores: code, semantics, the grid, reference programs.
  - Several times for noisy ones: `bench` and agent runs.
- **Stop at the first failed check.**
- **Never measure the same files twice.**

### 4.3 The optimization strategy

- **Order of comparison.** Strict order as in §1, then Pareto across the costs.
- **Choosing the next direction.** Expected value is the predicted gain, times the hit rate of earlier directions of the same kind, divided by the predicted cost in hours and dollars. Until the hit rates exist, the research model's rank stands in.
- **Two step sizes.**
  - Hill-climbing: a missing library function, a message, a constant factor.
  - Unification: one rule that removes special cases.

  A fixed share of experiments goes to unifications. They lower the cost per capability the most, and they are how Lion has improved best so far: the waiting rule and the asking rule took the grid from 209 exceptions to 2. Both kinds are judged on the same scores.
- **Patience.** lion-reasoning's default is 3 misses in a row.
- **Restarts.** When a pillar's pass rate stops rising for several experiments in a row, run a lion-research run on that pillar to bring in directions from outside, instead of trying more of the same.

## 5. Mechanisms: how Lion improves Lion

Each mechanism is a Lion program or a Lion model. The host only observes, the way the record's probes observe the repository with `repo/read` and `repo/run`.

### M1. The improvement record

- **What it is.** A committed lion-reasoning task folder. I recommend `improvement/`, linked to `research/` and `history/` as sources rather than merged into either (§8).
  - Its **scores** are the qualities in §2.
  - Its **requires** are the constraints in §3 that are scores.
  - Its **directions** come from three places: the research model's `to_build`, the causes of corpus failures (M6), and the constraints `untested` lists.
- **What it pays.** It measures the rate, and it writes the figures that commit messages quote.
- **What it needs.** lion-reasoning takes versions from one checkout today (2026-11-14 notes), so parallel experiments in worktrees need versions keyed by content across worktrees.

### M2. The constraint ledger

- **What it is.** Each constraint is a fact: its source decision, its level, its instrument, and the files it protects.
- **What it derives.**
  - `untested(rule)`: built in phase 0, in `history/research/steps/01-frame.src.json`.
  - `at_risk(c, direction)`: a direction's predicted diff touches what `c` protects.
  - `instrument_touched(experiment)`.
- **Where it lives.** Its gates are probes in `history/research/probes.json`, so `history check` enforces them.

### M3. The impact model: Lion picks the checks

- **Facts.**
  - Changed files and functions, from git.
  - Which source functions each test file ran, from one coverage run per file. Static imports are not enough, because a test that evaluates a program through `stdlib` imports every module.
  - Which mutations each test catches, from the last full `mutate`.
  - The forms and functions each docs example uses, from Lion's own `analyze`.
  - What each probe and each workload runs.
- **Rule.** `affected(check)`: the checks a change can reach.
- **Soundness property.** For every mutation in `mutations.ts`, the checks picked for that mutation's diff include a test that catches it, whenever the full set does. If the property fails, the picking falls back to a wider set. The full suite runs before merge.
- **What it pays.** Every later cycle gets shorter.
- **What it gives Lion.** Tens of thousands of coverage facts, followed as files change, make a real workload for the logic engine's incremental following. If the impact model is slow, Lion has found a performance bug in itself.
- **As built in phase 1A** (`bun run affected`, `packages/metrics/src/affected.json`):
  - The facts are per test file, not per function. They are what its tests ran (load time left out, since every test loads the whole library), the files it read, and whether it ran `git`.
  - Every fact carries a change id. A diff, a past commit, and each listed mutation are all changes, so one set of rules picks the checks and judges their soundness (`unsound`).
  - The mutations picked are those in a changed file and those whose named tests a change reaches. A change that weakens a property so brings back the mutations it guarded, which `mutate --in` misses.
  - Not built: the docs examples' forms (the docs build runs every example in under a second, so picking them would save nothing), and per-function facts.

### M4. The capability corpus and the external suites

- **Task shape.** `{id, pillar, statement, inputs, check, tags, origin}`.
  - `check` is a Lion lambda that judges the result, so the grading is Lion computing.
  - `tags` are the features a task needs.
  - `origin` is where the task came from, such as an R7RS section or a textbook problem.
- **Public tasks.**
  - Each has a reference solution, and the metrics tests run it at no cost. This makes ratchet 9 a gate.
  - Agents run the tasks with `skill-eval`'s isolation and get the docs and the CLI.
  - Scores are kept per pillar, with the cost and whether the first attempt was valid.
- **Held-out tasks.**
  - They have the same shape, in a folder outside the repository that an environment variable names.
  - The grader records only scores, under a question that names the suite's hash.
  - You move tasks from held-out to public over time.
- **External suites.**
  - **R7RS-small.** The expressions and standard procedures, written as JSON Lion where Lion has a counterpart. The mapping from Scheme procedure to Lion function, or to no counterpart (a capability gap), is data. Expected values come from the report, or from a reference Scheme run on the developer's machine and recorded as a source.
  - **Logic programming and verification.** A lion-research run picks these suites in `research/`, reusing the names the model already holds. Candidates to weigh:
    - Datalog classics: transitive closure, same generation, points-to;
    - OpenRuleBench;
    - SV-COMP's loop tasks;
    - textbook Dafny and Why3 problems.

### M5. Differential oracles: Lion checks itself

- **The solver against plain code.**
  - A proof that no value of a schema meets a goal, and a bounded search over the values the schema lists, must agree. Both are Lion questions, since schemas list their values.
  - This would have found the number gap mechanically.
  - It fails today. Fixing it needs your decision.
- **Laws proved by Lion.**
  - The stdlib laws the README states become `prove` questions where the solver decides them, such as left-to-right folding of `number/add`, or `object/set` followed by `object/get`.
  - When a sample disagrees with a proof, the disagreement is a bug.
- **A Lion evaluator written in Lion, for the core forms** (later stage).
  - For generated programs, evaluating through it must give what `run` gives.
  - It is a second statement of the semantics, written in the semantics.
  - It is also a computation task and a benchmark.

### M6. Mining agents' errors

- **What it reads.** Corpus transcripts: each failed attempt's program and message.
- **How it classifies them.** A Lion rule from message to cause, which gives counts per cause.
- **What each frequent cause becomes**, as a direction:
  - a message that names the function, the caller, and what was expected;
  - a `lion check` lint written as Lion rules over the program's JSON, since the analysis already reads names by scope;
  - the `agents` candidate already in the research model, a schema of valid programs for constrained generation, judged by first-attempt validity.
- **Why it is Lion improving Lion.** A lint is a Lion program about Lion programs.

### M7. Coverage of feature pairs: mining for surprises

- **Facts.** The vocabulary and the places an expression can stand.
- **Rule.** Enumerate pairs of features in one place. Coverage is the share of pairs with a grid cell or a property.
- **Order of work.** Uncovered pairs are ranked by how often the corpus uses both features, and the top pairs get generated grid cells first.
- **Equivalence pairs.** They get metamorphic properties. That is the research model's `testing` candidate, which only its own run has judged so far; this gives it a score.

### M8. Telemetry

- **What is recorded.** The hook and the loop's runner write one JSON line for each check they run: the check, the files' hash, the seconds, and the outcome.
- **How it enters the model.** The lines are recorded as observations.
- **Flakes.** Two outcomes on the same files are `disputed`, which makes the flake a problem with a record of its own.
- **Needs a decision.** It changes the hook.

### M9. Keeping the record current

- **What the model lists.**
  - stale probes after a change to core;
  - commits no claim reads;
  - findings listed for a long time.
- **What the loop does with them.** They are directions: on a branch, an agent rebuilds the CLI, runs the probes again under a new source id, and reads the commits into notes.

## 6. The rate: making the loop itself faster

**R** is the weighted capability tasks newly passing per hour and per dollar, minus what had to be reworked, with every constraint held. The model derives it weekly from the record. The levers, each with the mechanism that measures it:

| Lever | Mechanism |
|---|---|
| Shorter cycles | M3, M8, checks ordered cheapest first, and no files measured twice |
| More experiments that pay off | M6, and calibration of beliefs by kind of change |
| Larger steps | the share of experiments reserved for unification |
| Less rework | M5 and M7 find surprises before a feature ships, and the escaped-defect score measures what still gets through |
| More experiments at once | directions whose predicted files do not overlap run in separate worktrees. This needs M1's versions across worktrees, and `out/metrics` must stop being shared: measure, bench, and scale cannot run twice at once today |
| Knowledge that compounds | a research run reuses the model's names, and every probe becomes a regression check |
| Less of your attention | questions in batches, each with a recommendation; merges queued with the full run attached |

A change to the process is a direction in the same loop. It is scored on R and on check time, and it `requires` the same set of caught mutations and the same gates.

## 7. Build order

| Phase | Work | Done when |
|---|---|---|
| **0. Record and baseline** | Eight decision records (§3.0). Ledger v0 as a Lion program, with each constraint's level. A baseline scoreboard: today's `measure` (done), `bench`, `scale`, a full `mutate` in the background, and `compare --docs`. Weigh M1 to M9 as candidates in `research/` under the run `self-improvement` (prefix `si-`), reusing `held-out-eval`, `agents`, and `testing`. | The ledger answers `untested`. The baseline is recorded as observations. **Status:** the decision records, `untested`, and four probes are built. Baseline at 9d59e05: `measure` as in §2.3; `bench`, 21 programs from 2.8 ms to 232 ms; `scale`, every workload growing at n^1.0 or less; `mutate`, 591 of 594 caught in 56 min with 4 jobs under a load of about 25. The one stale mutation is "a relation goal reads a relation's rows before they are derived", and the two missed are "a rule that asks assuming is followed through a change as other rules are" and "a broken chain of figures ignores the measurements between". The `si-` candidates are not weighed yet. |
| **1A. Cycle time** (M8, M3) | Telemetry, the impact model, and its soundness property. | The mutation property passes. Median check time is measured before and after. **Status:** built (`bun run affected`, `mutate --affected`). `--check` finds picking sound for all 599 listed mutations: 595 have every named test picked, and the other 4 are caught by the tests picking keeps. `--replay 30` gives a median of 98% of the tests' time and 555 of 599 mutations. A change to core reaches about 96 of 107 test files, while one to the docs, research, or record reaches 6 to 25. At file level, picking pays only outside core; per-function reach is the next direction to try. |
| **1B. Capability** (M4, part) | The public corpus with reference programs as a gate. Probes of the cases R7RS-small settles, predicted by `scheme-racket-semantics`. Can run beside 1A: the files are separate. | A per-pillar baseline exists, and every difference from Scheme the probes find is excepted by a decision or fixed. **Status:** the corpus, its gate, `bun run capability`, the held-out folder's loading and grading, and the 36 probes were built on branch `claude/phase-1b-capability-3ba717` and merged into this branch. Reference programs pass 48 of 55 tasks: computation 24 of 26, logic 14 of 15, proofs 10 of 14. Of the 20 differences, you chose (2026-11-21) to fix ten, now fixed, and to except ten, now named by `r7rs-departures-decided`. |
| **2. The loop** (M1) | Constraints as `requires`, a branch-only runner, budgets, the held-out folder, and agent runs. | Five experiments run end to end, each with a belief, a verdict, and its cost. **Status:** the record (`improvement/`) and its scoreboard (`bun run loop`) are built (36b993b). One experiment has run end to end: `chain-property` fixed `p-chain-runs`, raising the catch rate of the chain mutation from 5 of 6 runs to 6 of 6, with every requirement met, at about 4 minutes of checks. The user then set the dollar cap at $25 per experiment and let the commit hook run picked tests on `claude/` branches (decision `commit-hook-tests`, done), and left the meta-score to this session: the loop measures itself by predictions resolved per hour of checks (decision `loop-meta-score`), 10.8 after the first experiment. Waiting for the user: merging phase 1B (the capability scores and `close-gaps`). |
| **3. Oracles and mining** (M5, M6, M7) | The solver differential property. Lints from the three most frequent agent errors. Pair coverage. | Each has a score in the record. The solver property waits for the exact-numbers work in the Clef session. |
| **4. Meta** | Calibration, R, and process directions. | R is reported from the model, and one process change has been judged as an experiment. |

What the loop would take up first, from today's evidence:

1. Raise constraints 1, 2, and 21 from stated to gated. They are cheap and need no decision. Done in phase 0 (9d59e05), with constraint 4's grid check: the probes `lisp-text-string`, `core-imports-host-modules`, `scripts-call-npm`, and `grid-undocumented-exceptions`. The line counts of AGENTS.md and CLAUDE.md were probed already.
2. Constraint 7, the solver number gap: the Clef session's `exact-numbers` run is on it.
3. Constraint 3's one known departure: done in phase 0, with your approval. An unbound string is a listed departure.
4. The join gap, ranked first in `to_build`, which is a logic capability and a growth score.
5. Messages per capability. There are 250 messages; group them by the rule each states, and unify where a group says the same thing in different words.

## 8. What this plan leaves open

- **Where the improvement record lives.** I recommend a committed lion-reasoning folder, linked to `research/` and `history/` and not merged into either. Merging would undo the line the `research-compounds` and `one-model-of-development` decisions drew. I would ask before folding it into `history/`.
- **How the pillars are weighted in R.** Equal by default, until you say otherwise.
- **Which logic and verification suites.** A research run picks them in phase 1B.
- **The solver number gap.** The Clef session's `exact-numbers` run is fixing it; the fix changes documented arithmetic, so it goes through a decision there.
- **The 351 stated assertions and the 173 tests with fixed inputs.** The loop works them down as directions. They stay as they are until a change touches them.
- **The release-by-release table** applies today's measures to old code. It is accurate for code and vocabulary, but not for grid exceptions.

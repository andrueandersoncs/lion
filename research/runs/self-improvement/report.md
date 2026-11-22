# How Lion can improve Lion: the plan's nine mechanisms, weighed

Run `self-improvement` (2026-11-21), steps `52-si-frame`, `53-si-lion`, and `54-si-precedents`, at commit 7d623a7 (core 0.15.0). It weighs the nine mechanisms of `plan.md` §5 as ideas in the shared research model, against what the repository holds now. The shared rules give each its verdict, its rank, and its place in what is left to build. Every figure below is what the model gives. The checks named "Self-improvement: …" in `research/checks.json` ask for them.

Lion is a programming language whose programs are JSON, with a logic layer of facts and rules. Its developers, mostly AI agents, keep three models written in Lion beside the code: this research model, the project record in `history/`, and the improvement record in `improvement/`. The plan asks how those models, and Lion's own measuring tools, can judge and steer each change to Lion. Here are its nine answers, weighed.

## The answer

| Mechanism in the plan | Idea | Verdict | Rank | Stage | What it would still add |
|---|---|---|---|---|---|
| M4. A corpus of tasks, with agents, held-out tasks, and outside suites | `capability-corpus` | worth adopting | 1 | 1 | agents' attempts at each task, graded by running checks; a score the tuning never saw; a suite of rule-engine benchmark programs; verification tasks with explicit properties to check |
| M3. Lion picks the checks a change can reach | `impact-model` | worth adopting | 4 | 1 | tests picked by the functions a change touched |
| M2. The constraint ledger | `constraint-ledger` | worth adopting | 4 | 1 | the constraints a change puts at risk, found before it is made |
| M8. Telemetry | `telemetry` | worth adopting | 7 | 1 | the outcome and time of every check run, kept as data |
| M9. Keeping the record current | `record-currency` | worth adopting | 7 | 1 | a probe's evidence listed as out of date when a file it ran on changes |
| M5. The solver checked against plain code | `differential-oracles` | worth adopting in part | none | 1 | a solver's answers checked against plain code, once the solver computes with the numbers plain code computes with |
| M6. Agents' errors counted by cause | `error-mining` | worth adopting in part | none | 2 | failures counted by cause, to choose what to fix; a known mistake found again in other programs by a query over the programs as data |
| M1. The improvement record | `improvement-record` | Lion does this already | | | |
| M7. Pairs of features checked together | `pair-coverage` | Lion does this already | | | |
| M7, its metamorphic part | `testing` (from `lion-improvements`) | Lion does this already | | | |
| M4, its held-out part | `held-out-eval` (from `tufazip`) | passed over: `capability-corpus` gives all it gives, and more | | | |
| M6, its last direction | `agents` (from `lion-improvements`) | worth adopting, unchanged | 4 | 1 | constrained generation |

In plain words:

- **Two of the nine are done.** The improvement record (M1) and the pair coverage of the grid (M7) do everything the plan asks of them. So does the metamorphic testing idea that an earlier run left unjudged.
- **The corpus is first of everything left to build, across every run.** It gains four things Lion lacks, the most of any idea, and four publishers stand behind them:
  - HumanEval, for grading agents' programs by running them;
  - Wikipedia, for held-out tests;
  - OpenRuleBench (through Brass and Stephan), for rule-engine benchmarks;
  - SV-COMP, for verification tasks.

  What it has already is the part phase 1B built: public tasks graded by Lion checks, and a conformance suite drawn from R7RS-small.
- **Four more can start now, each adding one thing:**
  - picking tests by function (M3);
  - naming the constraints a change puts at risk (M2);
  - recording every check's outcome and time (M8);
  - listing probes that went out of date (M9).

  The improvement record already holds a direction for the first, `function-reach`.
- **Two wait.**
  - The solver check (M5) is worth adopting only in part. It adds a check of the solver against plain code, but that check means something only once the solver computes with the numbers plain code computes with. Lion lacks that, and no idea in this model adds it.
  - Counting agents' errors (M6) waits for agents' attempts at the corpus, which `capability-corpus` adds, so it comes at stage 2.
- **The held-out eval case is folded into the corpus.** `held-out-eval`, from the TufaZip run, gains only "a score the tuning never saw". The corpus gains that as well, so the model passes it over.

Across every run the model now lists 11 ideas left to build.

## What the tools say at 7d623a7

Each figure is a claim quoting a tool's output, saved by `probes/si-built/run.mjs` as `lion-host-si-built`:

- **The corpus.** Reference programs pass 48 of 55 public tasks: computation 24 of 26, logic 14 of 15, proofs 10 of 14. 7 tasks are ones Lion cannot express yet.
- **Conformance.** The project record runs 44 cases of its rule `scheme-racket-semantics`, and a decision excepts 14 of them as departures from Scheme. A difference no decision excepts would fail `bun run history check`.
- **Pairs.** `bun run pairs` checks 6561 pairs of the grid's rows in 118098 cells, with 0 surprising pairs.
- **Picking.** The run used a reach map of every test file. For 636 of 640 listed mutations, every test the mutation names is picked for its change, and the tests picking keeps catch the other 4: picking is sound.
- **The ledger.** 96 rules in force have no probe that checks them, down from 107 at phase 0.
- **The rate.** The improvement loop has resolved 27 predictions in 2816 seconds of checks, which the model works out as 34.5 an hour.
- **What is missing.** Searches of the repository find none of these:
  - a line of the commit hook that records a check;
  - a rule that names a constraint at risk;
  - a relation of the research model for stale evidence.

  `lion check` writes its warnings in TypeScript, in `packages/core/src/analysis/analyze.ts`, not as Lion rules over a program.

## What the run found

- **The solver still proves what plain code contradicts.** `probes/si-number-gap.json` asks the solver two questions:
  - Does any number between 0 and 1 have (x + 0.2) - 0.2 other than x? It proves none does, but plain code at 0.1 gives 0.10000000000000003.
  - Does any whole number from 2^53 up have n + 1 equal to n? It proves none does, but plain code at 2^53 gives exactly that.

  This is the condition M5 waits for.
- **A reach map can be written without the tests it failed to trace.**
  - The run's first `bun run affected --map` ran while other commands ran beside it. Among them was `bun run history ask`, which rebuilds the model the record's tests read.
  - The history tests failed. The command still wrote a map of 109 test files and exited 0.
  - On that map, `affected --check` found picking unsound for 33 mutations, each naming a history test the map lacked (`lion-host-si-map-failed`).
  - Made again with nothing else running, the map held 112 test files and checks, and picking was sound.

  The check catches such a map. The commit hook runs `affected --run` without the check, so it would not, and would skip those tests on an agent's branch. The model lists "a reach map refused when a test it traces fails" as something `impact-model` lacks. No technique in the model gives it, so it does not change the verdict.
- **Every belief the run wrote down holds.** The nine beliefs, `si-built` to `si-pairs`, are all confirmed by the evidence.

## Limits

- **These ideas are about how Lion is developed, not about the language.** The shared frame says "Lion has" a feature; for this run it reads "the repository has": a command, a rule, or a record.
- **Several precedents are general.** A source says a technique gives a feature in general, and the run reads it for Lion's case:
  - Wikipedia's account of change impact analysis, for constraints at risk;
  - its account of differential testing, for checking the solver;
  - a study of build errors at Google, for agents' errors.

  Lion's own lion-reasoning skill is the only publisher behind listing stale probes.
- **The beliefs came late for some evidence.** The corpus, the pairs, and the number gap had been run once before the beliefs were written, so those three beliefs confirm rather than predict. The other beliefs were written before their searches ran: soundness, the hook, `lion check`, constraints at risk, and stale evidence.
- **What the plan calls not built is taken from the plan.** Agent runs, held-out tasks, per-function reach, and the outside suites are recorded as absent on the plan's word (`lion-self-improvement-plan`), since a missing run leaves nothing to probe. Several have been built on this branch since 7d623a7; a later run should record them.
- **No agent ran in this run, and no money was spent by it.**
- **The exact-numbers work is not in this model.** It is on branch `claude/exact-numbers`. Until a step records it here, no idea adds M5's condition, and the model cannot place M5 after it.
- **The run has no page.** It has this report and its checks, but no `page.json`.
- **Names.** The new ideas are named without the run's prefix, as `research/README.md` asks of candidate ids, so later runs can add to them. The run's own claims and beliefs start with `si-`.

## Sources

- Center for Open Science, [Preregistration](https://www.cos.io/initiatives/prereg)
- Thoughtworks Technology Radar, [Architectural fitness function](https://www.thoughtworks.com/radar/techniques/architectural-fitness-function)
- Wikipedia, [Change impact analysis](https://en.wikipedia.org/wiki/Change_impact_analysis) and [Differential testing](https://en.wikipedia.org/wiki/Differential_testing)
- Lingming Zhang, [Hybrid Regression Test Selection](https://experts.illinois.edu/en/publications/hybrid-regression-test-selection/) (ICSE 2018)
- [Ekstazi](https://github.com/gliga/ekstazi), its README
- Chen et al., [Evaluating Large Language Models Trained on Code](https://arxiv.org/abs/2107.03374) (2021)
- Brass and Stephan, [Experiences with Some Benchmarks for Deductive Databases](https://arxiv.org/abs/1701.00627) (2017)
- [SV-COMP](https://sv-comp.sosy-lab.org/)
- Seo et al., [Programmers' Build Errors: A Case Study (at Google)](https://research.google/pubs/programmers-build-errors-a-case-study-at-google/) (ICSE 2014)
- GitHub, [About CodeQL](https://codeql.github.com/docs/codeql-overview/about-codeql/)
- NIST, [Automated Combinatorial Testing for Software](https://csrc.nist.gov/projects/automated-combinatorial-testing-for-software)
- Memon et al., [Taming Google-Scale Continuous Testing](https://research.google/pubs/taming-google-scale-continuous-testing/) (ICSE 2017)
- Zhang, Wang, and Rigger's Deopt paper (`e-zhang-2024`), from the `lion-improvements` run
- Lion, all at 7d623a7: `plan.md`, `guidelines/improving.md`, `improvement/README.md`, `skills/lion-reasoning/SKILL.md`, `history/research/README.md`, and the probes `si-number-gap.json` and `si-built/run.mjs`

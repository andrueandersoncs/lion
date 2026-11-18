# What to improve in Lion next

Research run of 2026-11-17, extended 2026-11-18: 81 sources, 272 quoted claims, kept in a Lion model (`model.json`, built from `steps/`). Every figure below comes from a query of that model.

**Moved into the shared model, 2026-11-18.** The run now lives in `research/` beside the separation-logic run, as steps `11-li-*` to `22-li-*`, and its ranking, tallies, and beliefs came out the same there. Its ids carry the run's prefix: claim `u2` is `li-u2`, belief `a-order` is `li-order`. It uses the shared names for three features: "derived rows kept up to date as facts change" for incremental maintenance, "results independent of rule order" for a unique result, and "showing what is missing for a goal to hold" for why-not provenance. A direction is a shared `candidate`, its techniques are what it `uses`, and the ranking below is `net_rank`, from `tally`. The decision record and `components.ts` named in "What became of #2" are on the branch `claude/lion-improvement-research-4c67df`, which merges every open branch for `main` (c219278), not yet on `main`. The two programs `order-e1-e2.json` and `order-e2-e1.json` behind `lion-order-probe` were not kept; the same counterexample is case 1 of `research/probes/chase-model/test.ts`, and `research/probes/order-ab.json` and `order-ba.json` run it again on Lion as built. `shared-algebra.md` is kept word for word, because the separation-logic run quotes it as the source `lion-shared-algebra`, so its claim ids and paths are the run's original ones.

**Lion as built, 2026-11-18.** Step `23-li-built` records Lion after the least-member fix (91f41a5), component following (73698b5), and compiled evaluation (bdc3c06) were merged with `main` (c219278).
- **Merges.** The counterexample's program, with its two equality rules in either order (`order-ab.json`, `order-ba.json`), now gives one unknown, mother b's, both ways (li-b1, li-b2). The model now states that Lion's merges do not depend on order. The belief that they never did still counts as broken, because it was broken when the run began (li-u2).
- **Plain code.** The workloads the compile direction targeted now take 2 ms, 12.9 ms, and 0.27 s, where they took 45.6 ms, 117 ms, and 2.56 s (li-b3, li-b4, li-b6). The loop's time is now mostly the command's start-up.
- **The ranking.** The frame's `gap` rule gains `closed`: a gap no longer counts as a reason once Lion is at least twice as fast on it as an earlier measurement, the bound the reason already asks of a published speedup. The compile direction then has no reasons left and ranks sixth. The others keep their order, so merge functions over a union-find move up to third. The sections below are the ranking as the run first gave it.

## The short answer

Seven directions from the literature were weighed against what Lion has and what it measured. The model ranks these three highest:

1. **Annotated relations (semirings and lattices).** Every row carries a value from a declared algebra, and joins and unions combine those values.
2. **One algebra of changes (DBSP).** Every relation is a set of rows with integer weights, and a change is just another such set. One chain rule makes every operator incremental.
3. **Compile to direct-style closures.** Turn each expression into a JavaScript closure once, and enter Effect only where a node really needs it.

Third place is a tie on net reasons (3 each) with merge functions over a union-find (egglog) and worst-case optimal joins. The tie is broken by how many independent research groups back each: 9 for compiling, 7 for merge functions, 3 for joins.

**Update, 2026-11-18.** After two follow-up questions, the model now ranks DBSP first (12 net reasons) and annotated relations second (10). Treat that swap as a sign of where the follow-ups looked, not as a change in merit:
- The follow-ups added sources about DBSP only. The score counts breadth of evidence, so looking harder at one direction raises it.
- The order to build them in, decided in "In what order" below, does not depend on the swap.

## What became of #2 (added 2026-11-18)

Lion did not adopt DBSP's representation. The recorded decision `derived-rows-follow-changes` had rejected per-row counts and keeping every group's matches, and a first DBSP stage would have added a fourth path without removing anything. You chose to keep Lion's delete-and-re-derive engine and remove its fall-backs instead.

A group whose rules invent into a keyed relation, or beside other rules, or that has equality rules, is now followed one component of values at a time (`packages/core/src/logic/components.ts`). The twins workload: 20 changes take 17 ms against 8.4 s on main at 10,000 people, and 107 ms against over 60 s at 100,000. Decision record: `follow-a-component-at-a-time`.

## Invented unknowns and equality (added 2026-11-18)

The full design is in `unknowns-and-equality.md`, and the model in `research/probes/chase-model/`.

- **A bug in Lion today.** Lion's answer can depend on the order its equality rules are written in, although its README says it cannot. When a key or an equality rule makes two values one, Lion keeps one of them by a pairwise rule that is not transitive. Swapping the two equality rules in one program names every merged unknown differently (li-u2, against li-u1). The model records this as a dispute between the README and the probe, and the probe wins.
- **The fix.** Name each class by its least member, under one total order: known values first, then unknowns that nest fewer unknowns, then Lion's sort order.
  - It never depended on rule or fact order across 10,000 random programs.
  - Of the random programs Lion accepts, 328 gave Lion's exact answer and 14 the same rows with the same values shared, under another unknown's name (li-u5, li-u6).
- **Why the fix is the precondition for DBSP.** A class's representative now depends only on what is in it, so a merge becomes a view that can be retracted rather than a union-find's history. Following a removed equality by walking only its class matched a from-scratch rebuild after every one of 25,348 random insertions and deletions (li-u4).
- **Prior art.** No source of the 81 does all three together: invented unknowns, equality, and incremental maintenance. Each piece exists separately:
  - least-member representatives: ChaseBench, Motik et al.'s B/F≈, RDFox, differential dataflow;
  - deleting equalities: B/F≈, and fully dynamic connectivity;
  - incremental chases: ORCHESTRA, and Chabin et al., both without equality;
  - retracting equalities in congruence closure: only last in, first out.

  So the new parts are the combination as one DBSP circuit, and re-splitting congruence when a class splits. Both are designed but not yet built.
- **Today's engine is correct, only costly.** Lion's current fall-back gave the same answer as recomputing from scratch in all 223 programs tested (li-u7).

## 1. Annotated relations

- **What it would cover.** Six things Lion handles with separate code today: aggregates, lattice aggregates, shortest paths, stratified negation, `why` provenance, and why-not provenance.
- **What it would add.** Four things Lion lacks: counting, probabilities, top-k proofs, and non-stratified negation.
- **Coverage gaps.** No source reports a feature of Lion's that no technique in this family covers.
- **Evidence.** 9 independent research groups:
  - Green, Karvounarakis and Tannen show that why-provenance, bag counts, and probabilistic databases are all one construction with different semirings (li-b1, li-b2, li-b3).
  - Datalog over pre-semirings covers shortest paths and recursion through lattice aggregates. It terminates in polynomial time when the semiring is 0-stable, and distributive lattices and the tropical semiring are 0-stable (li-b12, li-b13, li-b15, li-b16).
  - Scallop switches between discrete, probabilistic, and differentiable reasoning by changing only the provenance. It reports a 25% accuracy gain on CLUTRR (li-b19, li-b23).
  - ProvSQL, Orchestra, and Propolis use semiring provenance in working systems (li-b9, li-b36).
- **Why it matters for Lion.** Jev already answers with probabilities, but no rule can carry a probability through a derivation. Annotations would let it.
- **Limits a reader should know:**
  - **Negation.** The plain tuple-semiring model breaks on negation (li-b4, li-b7). The fixes are dual-indeterminate and absorptive semirings, which are theory results for first-order and fixed-point logic (li-b8, li-b11). The only implemented why-and-why-not system, PUG, has no recursion and no aggregation (li-b33, li-b34). So keep Lion's current why-not explainer and treat folding it in as research. The "non-stratified negation" credit above rests on the same theory result (li-b11).
  - **Sum and count.** These need annotations on values (semimodules), not on rows (li-b5, li-b6).
  - **Termination.** It is not guaranteed for semirings that are not stable, such as counting over cycles (li-b14).
  - **Exact probabilities.** These are NP-hard (li-b35), so top-k proofs should be the default (li-b17).

## 2. One algebra of changes (DBSP)

- **What it would cover.** Six things Lion maintains with separate cases today: aggregates, equality rules, host functions, incremental maintenance, lattice aggregates, and stratified negation. It would also add counting.
- **Coverage gap.** No source shows any of its techniques covering existential rules (li-d21), and Lion has those.
- **Evidence.** 5 independent research groups:
  - DBSP breaks a complex query's incremental version down into the incremental versions of its parts. It handles monotonic and non-monotonic recursion, aggregation, and stratified negation (li-d1–li-d4).
  - Feldera runs DBSP with user-defined functions (li-d6).
  - DRedL makes recursive lattice aggregation incremental (li-d22).
  - B/F≈ maintains rules with equality (li-d18).
- **What it would remove.** Two of the three fall-backs in `maintain.ts` (957 lines), where Lion now derives a relation again and diffs it:
  - opaque host functions, because map and filter are linear in DBSP;
  - relations read through a schema, which are a filter.
  The third fall-back, rules that invent unknowns, remains open work.
- **Limits:**
  - **Memory.** DRedL's cached analysis needed 2.5x the whole IDE's memory (li-d24).
  - **Counting cost.** Recursive counting scored 258.92 on average against the fastest algorithm on small deletions (li-d16).
  - **Feldera's 6.2x over Flink** is the vendor's own blog figure (li-d7).

## 3. Compile to direct-style closures

- **The measured gap:**
  - Lion's plain code costs 25.6 microseconds per loop step and 5.9 per item of `array/map` and `array/reduce`.
  - fib(17) takes 45.6 ms.
- **What the literature says the cost is.** It points at the Effect around each node more than at walking the tree:
  - Closure compilation alone made programs 30–50% faster (li-a1). It is a weak gain on its own.
  - Direct style was 76.2x faster than runtime effect handlers on Koka's JavaScript backend (li-a28).
  - Fused effect handlers were about 300x faster than free monads (li-a33).
  - CPS and generators were 3x and 2x slower than direct-style JavaScript (li-a34, li-a35).
- **The design these results suggest:**
  - Compile JSON to closures once.
  - Run pure nodes directly, and enter Effect only for host effects, logic variables, and asking questions.
  - Keep tail calls with bind-inlining and join points (li-a32).
  - Keep deep recursion by falling back to Effect, as Stopify does (li-a36, li-a37).
- **One compiler for both layers.** The same compiler can turn rule bodies into closures, which is the specialization Soufflé and Flan get from Futamura projections (li-a14, li-a27). Soufflé's redesigned tree interpreter is within 1.32–5.67x of compiled code (li-a15).

## In what order (added 2026-11-18)

**#1 and #2 are one design.** DBSP's Z-sets are relations annotated with integers. DBSP takes them from Green, Ives and Tannen's z-relations (li-f5), and Green et al. describe bag semantics as annotated relations (li-f6).

**What #2 replaces.** DBSP's one rule replaces two things Lion keeps apart today:
- semi-naive evaluation. DBSP proves it correct as a corollary of its cycle rule (li-f2). In Lion it lives in `model.ts`, 2,545 lines.
- the fall-back of deriving a relation again and diffing. Integrate, apply, differentiate is DBSP's *definition* of the incremental version of any operator (li-f1). In Lion this lives in `maintain.ts`, 957 lines.

**The catch.** That rule needs values that can be subtracted (li-f3), and MIN must keep the full set of candidates to survive deletions (li-f4). The belief "build #2 first, add #1 later without rework" therefore fails (li-order, written after the question was asked).

**So the order should be:**
1. Decide #1's algebra.
2. Build #2 in that shape.
3. Fill in #1.

Compiling plain code (#3) is independent of both. Compiling rule bodies should wait until #2 defines the operators.

**Resolved, 2026-11-18.** The shared algebra design (`shared-algebra.md`) removes the catch:
- annotations are columns that aggregates combine, as Lion's aggregated relations already are;
- DBSP's weights count candidates, so only candidates are ever added and removed.

Integer weights are enough, and annotated relations need no rework of DBSP. Checked against Lion (li-w1–li-w3):
- every aggregate kept by counted candidates matched Lion's fold after all 5,730 changes;
- Lion's aggregated relations matched the fold of distinct matches after all 2,238 fact changes;
- best-proof probabilities through recursion matched a model after all 2,467 edge changes, retractions included.

The checks also show Lion already has the annotation mechanism, so improvement #1 is smaller than ranked: top-k proofs, possibly facts as candidates, and documentation.

## The runners-up

- **Merge functions over a union-find (egglog), net 3.**
  - **What it would cover.** Keys, equality rules, invented unknowns, and lattice aggregates in one mechanism (li-c1–li-c4). egglog measured 4.96x over Soufflé (li-c10).
  - **What it would cost.** No technique shows proofs through merges, which `why` would need (li-c8). The union-find cannot undo a merge, which incremental maintenance would need (li-d19).
- **Worst-case optimal joins, net 3.**
  - **The measured gap.** Lion's triangle query grows as n^1.9 on a graph with two hub nodes, against n^0.8 without hubs. That is the textbook case of skew.
  - **What fixes it.** Free Join is up to 15.45x faster than binary joins on cyclic queries and 2.94x faster on average on JOB (li-d26, li-d28). On the worst JOB query it was 0.85x, slightly slower (li-d29).
  - **Effort.** Small, and it applies inside whichever engine Lion keeps.
- **Programs a model can't get wrong, net 1.**
  - **Constrained generation.** Lion has none; no JSON Schema for programs ships.
  - **Repair from errors.** It makes programs run more often (+5.01 points, li-e4) but not more correct (li-e6). At equal budget, self-repair gave 0.97x–1.05x of plain resampling (li-e17, li-e20).
  - **The bottleneck** is the model's own account of why code is wrong (li-e19). Human-quality feedback gave 1.58x more repaired programs (li-e18).
- **Metamorphic engine tests, net 0.** These found 13, 16, and 30 bugs in mature Datalog engines (li-e33, li-e35, li-e36). Lion's property tests already compare goal-directed against full evaluation, and incremental against from-scratch evaluation, which is the same idea.

## One you might not have thought of (my judgment, not the model's ranking)

The repair studies say the missing piece is an accurate explanation of why a program is wrong (li-e18, li-e19). Lion's why-not tree is exactly that kind of explanation: each rule that could have given a row, and the goal that stopped it. If Lion handed that tree back as structured feedback in its error messages and failed assertions, together with a published schema of valid programs that a model's decoder can use, it could raise what the "programs a model can't get wrong" direction is worth. The model ranks that direction 6th because its evidence is about language models, not about Lion's own mechanisms.

## What the evidence overturned

Five of eight beliefs written before reading failed:

| Belief | What overturned it |
|---|---|
| Compiling to closures is at least twice as fast | Only 30–50% (li-a1) |
| Joins are not where Lion is slow | Hub graphs grow as n^1.9 (li-l28). This belief was written after the first join probe, before the hub probe. |
| One algebra of changes maintains everything Lion maintains | Not invented unknowns (li-d21) |
| Solver-error feedback makes programs more accurate | It makes them run, not right (li-e6, li-e19, li-e20) |
| Constraining output to a grammar costs no reasoning | Format restrictions degrade reasoning (li-e25). Letting the model reason first, then format, avoids it (li-e27, li-e32). |

Three beliefs held:
- Annotated relations cover `why`, lattice aggregates, and probabilities.
- They also explain why-not, but in theory only.
- Merge functions cover keys, equality rules, and invented unknowns.

## How the ranking works, and its limits

**The rule.** A direction scores one reason for each of these:
- each Lion feature one of its techniques is reported to cover, for directions whose aim is fewer mechanisms;
- each capability Lion lacks that it would add;
- each measured Lion workload where a published speedup of at least 2x applies.

It loses one for each Lion feature that a source says one of its techniques does not cover, when no other technique in the direction does.

**Corrections made after the evidence arrived.** All are recorded in `research/steps/11-li-frame.json`:
- a slowdown no longer counts as a speedup;
- a limit counts only when no technique covers it;
- "covers" counts as folding a feature in only for unifying directions, so a compiler that "supports host functions" earns nothing for it;
- a target with no evidence linking it to `why` was removed.

**What the ranking measures.** It counts breadth, not size. Compiling's measured gap is the largest in raw time, but it scores only 3.

**Third place** is a tie on net reasons (3 each), broken by the number of research groups behind each direction.

**Sources:**
- 65 of the 69 are papers or project pages. The other 4 are Lion's own README and the probes and benchmarks run for this research.
- One paper was never read: DRed (Gupta, Mumick, Subrahmanian 1993), because ACM refused. The two claims about it come from Motik et al., who cite it.
- Mündler et al. (type-constrained decoding) was read only as an abstract. Its compile-error reductions are therefore not recorded.
- Four papers were read from PDFs, so some quotes keep PDF artefacts.
- The literature was read by five parallel readers. I recorded and checked their claims; `check-quotes` finds all 220 quotes in the saved texts.

## Files

This run is part of the shared research model in `research/`; `research/README.md` says how to rebuild and ask it.
- `research/steps/11-li-frame.json` and `11a-li-candidates.json` hold the run's own rules, beliefs, and directions; `12-li-*` to `22-li-*` hold what its sources said, from `research/notes/`.
- `research/checks.json` holds the standing questions, for every run.
- `page.json`, beside this report, is the page plan. `node ../skills/lion-research/scripts/build-explorer.mjs model.json --page runs/lion-improvements/page.json --out runs/lion-improvements/explorer.html`, run in `research/`, builds the page.
- `research/sources/` holds the saved text of each source, and `research/probes/chase-model/` and `research/probes/algebra-model/` the programs whose output `chase-model-tests.txt` and `algebra-model-tests.txt` keep.
- `readers/brief.md` is what the five readers were given.

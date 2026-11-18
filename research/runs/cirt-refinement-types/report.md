# CIRT (arXiv 2611.20867) and what Lion can use from it

**The paper.** *CIRT: Calculus of Inductive Refinement Types*, by Alessio Ferrarini, Niki Vazou and G. A. Kavvos, posted 16 November 2026 (extended version of a POPL 2027 paper). It gives the first mathematical model (partial equivalence relations over a Scott domain) of a refinement type system that has all four of these at once: subtyping, SMT-style equality that ignores refinements, impredicative polymorphism, and two kinds of recursive datatypes beyond the usual (positive, and stratified by a shrinking index). From the model it proves the system consistent: no program can prove false. It also explains why refinements never change what a program computes ("annotation independence"). It is metatheory for static checkers like Liquid Haskell. It has no algorithm or engine to borrow.

**Short answer.** Lion has no static type checker. Its schemas are refinement predicates checked while the program runs. So most of the paper's machinery has nothing in Lion to work on. One idea carries over directly, though, and testing it found a real bug: **a schema whose own predicate asks whether a value fits that same schema runs Lion out of memory.** The paper's stratification rule is the fix.

This run is steps `24-ci-frame` to `26-ci-probes-now` of the shared model in `research/`. Every verdict below comes from the shared frame's rules, over 66 quoted statements (claims `ci-*`) from 13 sources, plus 2 sources known only through others' citations. Among the 66 are 14 Lion programs (`research/probes/ci-*.json`), run twice: at commit f49b97a (source `lion-probes-ci-f49b97a`) and again at a2324d9, after Lion compiled its evaluation (source `lion-probes-ci`). All 14 gave the same output both times.

## What Lion can use, idea by idea

| Idea from the paper | Verdict (derived) | What it means for Lion |
|---|---|---|
| A recursive definition may refer to itself under negation only at a strictly smaller index ("stratified" types) | **worth adopting** | Let a schema ask about itself only about a strictly smaller part of the value. This fixes the crash below. |
| Subtyping is inclusion, decided by implication between predicates | **worth adopting in part** | Lion could decide when one schema includes another, but only for the parts that are data (literals, records, lists, `anyOf`, `allOf`, `arrayOf`, `recordOf`, `open`, `optional`). Lion cannot compare what two lambdas accept. |
| Read a recursive (positive) type as its least fixed point | Lion does this already | "A value fits only when that follows from the shapes in finitely many steps." The `Loop` probe agrees. |
| Refinements never change what a program computes (no casts) | Lion does this already | A relation's schema "is nothing more" than an invariant. `schema/assert` returns the value unchanged. |
| Equality must ignore refinements. Function extensionality next to it proves false. | Lion does this already | `=` is "structural equality of JSON values, and identity for other values". Two lambdas with the same text are not equal, so Lion has no function extensionality to misuse. |
| Impredicative polymorphism | has nothing in Lion to work on | It needs a checker that runs before the program. Lion checks only when code runs: a function that adds a string to a number is defined without complaint and fails only when called. |
| Recursion through `not` at a smaller argument, in rules (local stratification) | has nothing in Lion to work on | Lion would need to know that a computed value is smaller than the one it came from. It would also change a documented rule: "A question, such as a goal under not, cannot go through recursion." |

The model ranks stratified schemas first. Three publishers back it first-hand: the paper, Jacob-Rao, Pientka and Thibodeau's *Index-Stratified Types* (the Tores language), and Liquid Haskell's own documentation. Schema inclusion, backed only by the paper, is adoptable only in part, and the model ranks only whole verdicts.

## The bug: a schema that asks about itself through a predicate never finishes

The paper's canonical inconsistent datatype is `Bad`, a type defined through its own negation. Written as a Lion schema, it is:

```json
["schema", "Bad", ["lambda", ["v"], ["not", ["schema/fits?", "v", "Bad"]]]]
```

`["schema/fits?", 1, "Bad"]` does not fail with an error. The process runs out of memory: `FATAL ERROR: ... JavaScript heap out of memory`. It still does at a2324d9, under compiled evaluation. The positive version, `["schema", "Self", ["lambda", ["v"], ["schema/fits?", "v", "Self"]]]`, does the same. By the docs' own rule ("finitely many steps"), `Self` should fit nothing.

**Cause.** [fit.ts](../../../packages/core/src/logic/fit.ts) keeps the named schemas being checked in `at.open` ([fit.ts:491](../../../packages/core/src/logic/fit.ts:491)), which is what makes `["schema", "Loop", ["schema/anyOf", "Loop", 1]]` work. But every top-level check starts with an empty set ([fit.ts:163](../../../packages/core/src/logic/fit.ts:163), [fit.ts:607](../../../packages/core/src/logic/fit.ts:607)). So the `schema/fits?` that a predicate calls never sees the loop it is in.

**Why it matters.** The JSON Schema specification says "Validators MUST NOT fall into an infinite loop", and notes that schemas are often written by untrusted parties. A Lion program is JSON. Here a five-line schema takes down the process.

**The fix the paper points to.** Stratification is one rule: a definition may refer to itself, even under negation, only at a strictly smaller index under a well-founded measure. For a schema, the index is the value being checked and the measure is its size. Lion already accepts this case. `EvenList`, which asks under `not` whether the list's tail fits `EvenList`, gives the right answers for lists of length 0 to 3. What Lion lacks is the refusal of the other case. Concretely:

- Carry the named schemas being checked, each with the size of its value, through predicate calls (a fiber-local reference rather than the per-check `at.open`).
- A predicate that asks a schema being checked about a value **no smaller** than the one it is checking fails with an error. It would be worded like the rule layer's error, since it is the same mistake: a question going through recursion.
- A strictly smaller value is allowed, so `EvenList` keeps working. Shape-level loops keep today's "does not fit" rule, which is the least fixed point, because every schema builder is positive.

There is one decision for you. When a schema re-asks about the same value through a predicate, should Lion raise an error, or answer "does not fit" as it does for shapes? I recommend the error. "Does not fit" gives `Bad` the answer *fits*, which contradicts its own definition. An error also matches the rule layer, which refuses even the positive loop through a relation (both relation-loop probes are refused).

Properties to write with the fix:
1. Every generated schema group's check ends, with an answer or with the error.
2. A schema that recurses through a predicate only on smaller parts gives the same answer as a TypeScript model that recurses on size.
3. `EvenList` fits exactly the lists of even length.

## A surprise between schemas and rules

My assumption that "Lion's schemas and rules follow one rule for recursion through not" failed:

- Schemas accept recursion through `not` on a smaller part (`EvenList`).
- Rules refuse it. `win(x) :- move(x, y), not win(y)` is refused even over facts with no cycle.
- Rules also refuse recursion on a value they compute and shrink: each suffix of a word by `array/tail` is refused with "computes a new value in its head while recursing, which may never finish".

The Datalog version of the paper's idea is local stratification. The model knows it only second-hand, through Hitzler and Wendt's survey citing Przymusinski (1988). Bringing rules up to schemas would need a well-founded order on computed values, and it would change two documented rules, so I would not start it without your say. It is a lead, not a recommendation.

## How solid this is

- **Confirmed by independent publishers first-hand.** Recursion at a strictly smaller index is well-founded and consistent: the paper, Tores, and Liquid Haskell. Lion's least-fixed-point reading, its checks that never change values, its lack of function extensionality, and its refusal of questions through recursion: Lion's docs and the probes agree on each.
- **One publisher's word.** "Every check of a recursive schema ends: false" rests on the probes alone. That is two probes, run at two commits, reproducible with `node packages/cli/dist/bin.mjs research/probes/ci-negative-recursion.json`. Every claim about the paper's own technique (no casts, equality that ignores refinements, subtyping as implication) rests on the paper alone. The paper itself says "Our proofs are not mechanically verified."
- **Second-hand only.** That negative datatypes break normalisation comes from Mendler (1987), cited by CIRT. Local stratification comes from Przymusinski (1988), cited by the survey. Neither original was read.
- **Failed assumptions.**
  - `ci-ends` ("every check of a recursive Lion schema ends"), broken by both crash probes. I formed it from the docs' "finitely many steps" sentence before probing.
  - `ci-one-recursion`, broken by the `win` probe and the stratification docs.
- **Held.** Schemas are refinements that never change a value; Lion reads recursive schemas as least fixed points; Lion has no function extensionality.
- **Not checked.** I did not read the paper's appendix proofs (C–F) beyond their statements. I did not measure how the proposed fix would affect speed.

## Sources

- Ferrarini, Vazou, Kavvos, [CIRT: Calculus of Inductive Refinement Types](https://arxiv.org/abs/2611.20867) (2026)
- Vazou, Greenberg, [How to Safely Use Extensionality in Liquid Haskell](https://arxiv.org/abs/2103.02177) (2021/2022)
- Jacob-Rao, Pientka, Thibodeau, [Index-Stratified Types](https://arxiv.org/abs/1805.00401) (2018)
- [Liquid Haskell: Specifications](https://ucsd-progsys.github.io/liquidhaskell/specifications/), "Stratified Types"
- Hitzler, Wendt, [A uniform approach to logic programming semantics](https://ar5iv.labs.arxiv.org/html/cs/0210027)
- [JSON Schema Core 2020-12](https://json-schema.org/draft/2020-12/json-schema-core), section 9.4.1 and security considerations
- Lion's reference (logic forms, logic guarantees, standard library), its logic-programming explanation, `packages/core/src/logic/fit.ts`, and the probes `research/probes/ci-*.json`

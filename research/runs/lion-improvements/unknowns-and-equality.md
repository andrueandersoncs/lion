# Invented unknowns and equality as one algebra of changes

A design note, 2026-11-18. It answers one question: can Lion follow fact changes row by row through rules that invent unknowns, keys that merge them, and equality rules, instead of deriving those relations again and diffing? The executable model and its tests are in `chase-model/`. The evidence is recorded in the research model (`steps/17-unknowns.json`), and the page's "Unknowns and equality" view answers from it.

## 1. What stands in the way

Lion merges unknowns with a union-find. Two values that a key or an equality rule makes one are merged pairwise, as each merge is found, by one rule:

- a given value is kept;
- otherwise the unknown that the other describes is kept;
- otherwise the one that sorts first is kept.

That rule is not transitive. Take three unknowns:

- `u_c`, the mother of c;
- `u_b`, the mother of b;
- `g`, which describes `u_c`.

`u_c` beats `g` because `g` describes it. `g` beats `u_b` because `g` sorts first. `u_b` beats `u_c` because `u_b` sorts first. So the survivor of a class depends on the order its merges happened in.

**This is a bug in Lion today.** `order-e1-e2.json` and `order-e2-e1.json` (not kept; case 1 of `research/probes/chase-model/test.ts` is the same counterexample) are the same program with two equality rules swapped. In one order, every unknown becomes the mother of c. In the other, every unknown becomes the mother of b (`sources/lion-order-probe.txt`). The README promises the opposite: "the result does not depend on the order rules or facts were added in."

For incremental maintenance this is the root problem, not a corner case. DBSP's incremental version of a query, `D ∘ Q ∘ I`, is correct only when `Q` is a function of its input. A union-find whose answer depends on its history is not such a function, and it cannot undo a merge.

## 2. The idea: a union-find is a cache of a view

Choose each class's representative by *what is in the class*, never by how the class was formed:

```
rep(x) = min⊑ [x]≈
```

`⊑` is one fixed total order:
1. known values first;
2. then unknowns by how many unknowns they nest, fewest first;
3. then by Lion's sort order.

An unknown always nests fewer unknowns than any unknown that describes it. So `⊑` keeps the one thing Lion's pairwise rule was for: a value is never replaced by something that describes it. And because `⊑` is a total order, there are no cycles.

**The semantics, as functions of the facts.** Let `E` be the edges that keys and equality rules find in the rows. Define:

- `≈` is the least equivalence relation that contains `E` and is closed under congruence. Congruence means two unknowns whose descriptions are equal, once their parts are replaced by their representatives, are equal.
- `canon(t)` replaces every value in `t` by its representative, inside unknowns' descriptions too.
- One round is the least fixpoint of `F(R, E) = (canon(R ∪ T_P(R)), E ∪ edges(R))`:
  - `T_P` applies the rules that invent nothing;
  - rows grow under `⊆`, and partitions grow coarser.

  `F` is monotone, so its least fixpoint exists and is unique (Knaster–Tarski). The order of processing appears nowhere in the definition.
- **Invention.** The next round starts from `R ∪ I(R)`, where
  `I(R) = { canon(h[θ, x ↦ some(x, h[θ])]) | θ ∈ body(R), no row of R matches h[θ] }`.
  This is Lion's restricted, parallel chase: invent, all at once, for every answer whose head does not hold. It ends after finitely many rounds, under the weak-acyclicity check Lion already makes.

**Claim 1.** The result is a function of the facts and the rules. It holds by construction, since every step above is a function of sets. In tests:
- it never depended on rule or fact order across 10,000 random programs;
- a mode that merges as Lion does today found the order bug by itself after 157 programs.

**Claim 2.** It changes no rows. On the 342 random programs that Lion 0.13 accepts, it gave:
- the identical answer for 328;
- the same rows, with the same values shared, for 14. Only the unknown that names a class differs.

A faithful copy of today's merge rule matched Lion on every accepted program, up to the same naming (`research/sources/chase-model-tests.txt`).

## 3. Following changes: every piece is a DBSP operator

Write one round as a circuit over Z-sets (rows with integer weights):

| Piece | Operator | Incremental version |
|---|---|---|
| Rules that invent nothing, `T_P` | joins and maps | DBSP: bilinear and linear |
| Edges from keys | self-join on the key columns | bilinear |
| Edges from equality rules | their bodies | bilinear |
| **Classes** `E ↦ rep` | **new: components, each named by its least member** | an added edge joins two classes, and the losing class's members change representative; a removed edge re-walks only the class it was in |
| Congruence | join of each unknown's description with `rep`; an unknown whose description now names another becomes an edge into Classes | bilinear, inside the loop |
| `canon(R)` | join of each row's values with `rep` | bilinear |
| Invention `I` | anti-join of body answers against the head, then a map to the invented row | DBSP's anti-join and distinct |
| Rounds | DBSP nested time: an outer loop over rounds, an inner loop to the fixpoint | DBSP's rule for recursive circuits |

DBSP's chain rule, `(Q1 ∘ Q2)^Δ = Q1^Δ ∘ Q2^Δ`, together with its rule for recursive circuits, gives the incremental version of the whole round from the incremental versions of its pieces. No relation has to be derived again.

**Claim 3.** The Classes operator is correct. After each of 25,348 random insertions and deletions of edges, between known values and unknowns at two depths, its representatives equaled those of a union-find rebuilt from scratch.

**Claim 4.** Today's fall-back is correct but costly. In 223 random programs, Lion's current engine gave the same answer whether facts were added one at a time and one was then retracted, or everything was derived from scratch. So the gain here is in mechanism and cost, not in correcting answers.

### What it costs

- **Per-round state.** DBSP keeps each round's changes. Under weak acyclicity, the number of rounds is bounded by the program, not by the data.
- **One large class.** A deletion re-walks its class, so one giant class costs its size. Fully dynamic connectivity (Holm, de Lichtenberg, Thorup 2001) would make this polylogarithmic if it ever matters.
- **Unknowns whose descriptions mention a changed class** are re-canonicalized through an index from each value to the unknowns that mention it.

### Not yet shown

- **The invention operator is unbuilt.** Section 3 is a design built on DBSP's theorems; only the Classes operator was built and tested incrementally.
- **`why` needs a deterministic path.** A row marked `same` must be explained by the edges that put two values in one class. A deterministic choice would be the shortest path in the class's edge graph, ties broken by `⊑`.

## 4. What changes for people who write Lion

- **The survivor rule.** "Of two unknowns, the one that sorts first, unless it describes the other" becomes "the unknown that nests the fewest others, then the one that sorts first". In the 342 programs above, 14 (4%) would show a different unknown naming the same class, with the same rows.
- **The order guarantee.** "The result does not depend on the order rules or facts were added in" becomes true.
- **The fall-backs.** Lion's three fall-backs to deriving a relation again shrink to the one DBSP itself defines, `D ∘ Q ∘ I`, which is the general rule rather than a special case. Only host functions that do not say they read just their arguments would still use it.

## 5. What is new, and what is not

A reader searched 2000–2026 for prior work (sources `g-*`, claims li-g1–li-g35). Its verdict was checked against the model: no technique in the 81 sources covers invented unknowns, equality, and incremental maintenance together (`covers_all` is empty).

**Not new; each piece exists on its own:**

- **Least member under a fixed total order as the representative.** This is standard, with nulls after constants:
  - ChaseBench's EGD determinization (li-g28);
  - Motik et al.'s B/F≈, whose rewriting is unique (li-g31, li-g33);
  - RDFox's clique-representative rules (li-g12);
  - differential dataflow's smallest label per component (li-g34).
- **Deleting equalities incrementally.** B/F≈ does it for plain Datalog in RDFox (li-g32). Modular materialisation recomputes a component (li-g5). Fully dynamic connectivity does it in polylogarithmic time (li-g17, li-g18).
- **Keeping a chase with invented values up to date:**
  - ORCHESTRA does it for the Skolem chase through provenance (li-g7, li-g8);
  - Chabin et al. do it for marked nulls, with no equality (li-g1–li-g3).
- **Retracting equalities in congruence closure** exists only last in, first out: DPLL(T), egglog's push and pop, Sundance (li-g15, li-g24, li-g25).

**New, as far as the search found:**

1. **The whole combination as one circuit.** It keeps Lion's restricted, parallel chase up to date under arbitrary insertions and deletions, together with keys, equality rules, and congruence over *nested* unknowns.
2. **Re-splitting congruence when a class splits.** This is out-of-order deletion in congruence closure, and it is handled by deriving congruence edges as rows inside DBSP's recursion rather than as a union-find's history.
3. **An order that respects nesting.** ChaseBench's order puts constants before nulls, but its nulls are flat. Lion's unknowns nest, so the order must also put an unknown before anything that describes it. Lion's pairwise rule tried to do this and made a cycle. This piece is small, and obvious once seen.

**Not yet built.** Items 1 and 2 are designed on DBSP's theorems. Only the Classes operator was built and tested incrementally.

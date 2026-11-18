# Rows, weights, and annotations: the algebra DBSP and annotated relations share

A design, 2026-11-18. It settles what had to be decided before building DBSP: what a row carries, and where annotations live. The checks behind each claim are in `algebra-model/test.ts`, and their output is in `sources/algebra-model-tests.txt`.

## The question

DBSP writes every change as rows with integer weights, so a deletion is a weight of −1, and its change rule needs those values to be subtractable. Annotated relations want rows to carry values such as a probability, a best distance, or a set of proofs. These are combined by operations that often cannot be undone: there is no "minus" for `min`. If annotations were the weights, building DBSP on integers first would have to be redone for annotations. That was the open risk in "In what order".

## The answer: annotations are columns, and weights count candidates

1. **Every relation is a set of rows with integer weights.** A row holds while its weight is above zero. People see sets, as now: weights never appear in answers, in `why`, or in snapshots. Adding what holds still changes nothing.
2. **An annotation is a column that a rule aggregates.** "Combine along a derivation" (⊗) is an expression in the rule's head, such as `["number/multiply", "?q", "?p"]`. "Combine across derivations" (⊕) is the head's aggregate, such as `aggregate/max`. This is not a new mechanism: it is Lion's aggregated relations, which already recurse through `min`, `max`, `shortest`, and `union`.
3. **What gets subtracted is candidates, never annotations.** A group's value is a fold over the multiset of its candidates: one value for each distinct match of its rules. DBSP adds and removes candidates, with weights +1 and −1, and each aggregate keeps its result the cheap way it allows:
   - `count`, `sum`, `mean` keep running totals, so each change costs O(1);
   - `min`, `max`, `shortest` keep their candidates counted, and read the least one still held;
   - `union`, `unique`, `countUnique`, `collect` keep their elements counted.

   Nothing that can't be subtracted ever is. A group's `min` is never "minus"-ed; a candidate is removed and the least remaining one is read.

**What the checks show:**

- **T1.** Each of Lion's 10 aggregates, kept this way, equaled Lion's own fold after every one of 5,730 random insertions and deletions of candidates.
- **T2.** Lion's aggregated relations already are this algebra. After every one of 2,238 random fact additions and retractions, each group's value equaled the fold of the distinct matches of its rule's body, including bodies that join and bodies with `or`.
- **T3.** A probability is an annotation Lion can carry today. The best proof, the maximum over paths of the product of probabilities, through a recursive `aggregate/max`, equaled a max-of-products model after every one of 2,467 edge changes, retractions included. For example, with `me` trusting ana at 0.75 and bo at 0.5, and ana and bo each vouching for cy:

```json
["rule", ["trust", "?to", ["aggregate/max", "?p"]], ["said", "me", "?to", "?p"]],
["rule", ["trust", "?to", ["aggregate/max", ["number/multiply", "?q", "?p"]]],
  ["trust", "?via", "?q"], ["said", "?via", "?to", "?p"]]
```

  cy's trust is 0.5, through bo. After `["retract", ["said", "bo", "cy", 1]]` it is 0.375, the best proof left, through ana (`algebra-model/example.json`).

So DBSP can be built with plain integer weights, and annotated relations need no rework of it. The risk in "In what order" does not hold under this design.

## The four questions

| Question | Decision |
|---|---|
| What does a row carry? | An integer weight. It holds while the weight is above zero. Annotations live in columns. |
| Which annotations come first? | None new for the DBSP build: aggregated relations are the mechanism. After it, one new fold for probabilities: the k best proofs, since the exact probability over every proof is NP-hard (b35), and Scallop's top-k proofs keep it tractable (b17). |
| How do `min` and `max` survive deletions? | By keeping their candidates counted (T1). Inside recursion this is the costliest part: DBSP keeps each round's changes. DRedL (d22) is the alternative if that memory is too much. |
| How does `why` fit? | It is unchanged. It is worked out on demand from the rows that hold, as the least answer, and weights never appear in it. Seen through the algebra, `why` is the "least derivation" annotation, computed only when asked. |

## One mechanism under keys, equality, and aggregates

The merge fix (91f41a5) makes a keyed relation's merge a fold too. A key groups rows by their key columns, and each other column folds the group's candidates into one value:
- invented unknowns fold to their least member;
- two different known values are an error.

That is the same shape as `aggregate/min`, over a total order that is a function of the candidates, so DBSP keeps it the same way. Keys, equality rules, and aggregates become one thing under DBSP: **a group's columns are folds over its candidates.** This is egglog's merge function (c1–c4), kept up to date under deletions, which egglog itself does not do (g21, g23).

There is one exception. A `fact` written to a keyed relation still replaces the row with that key. That is a change, not a fold: the old row gets −1 and the new row +1.

## What this changes for people who write Lion

- **The DBSP build: nothing visible.** Answers stay the same, as T2 checks today's aggregates against the fold the build would keep.
- **One exception could go**, which is your decision. An aggregated relation cannot have facts today. Under this design, a fact is simply one more candidate of its group: `["fact", ["spend", "ana", 30]]` into a `sum` relation would add 30. That removes a rule people have to remember, but someone used to facts being rows might be surprised, so it should not change without your OK.

## A correction to the research's ranking

The research credited "annotated relations" with folding in six features under a new mechanism. The checks show Lion already has the mechanism. What remains of improvement #1 is smaller and builds on #2:
- folds for probabilities (top-k proofs);
- possibly facts as candidates;
- documentation that names aggregated relations as annotated relations.

General provenance polynomials are not needed, since `why` already gives a derivation on demand. #2 (DBSP) carries more of the value than the ranking said.

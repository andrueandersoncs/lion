# Rows with weights, held for a time: the algebra of changes as built

A design and build report, 2026-11-18. It follows `research/runs/lion-improvements/shared-algebra.md` and `unknowns-and-equality.md`, which designed one algebra of changes for Lion and left one part open: rules that invent unknowns. This report says what was built, how the open part was solved, what was checked, and what it cost. The code is `packages/core/src/logic/weights.ts`. The decision record is `history/notes/rows-carry-weights.json`.

## The short answer

- **Every derived row now has a weight**: the number of its candidates. A candidate is a fact, or an answer of a rule's body that gives the row. The row holds while its weight is above zero.
- **Time is a column of the same rows.** A candidate has a level, and a row is held from the least level one of its candidates has. That is what lets weights follow rows that give each other.
- **One procedure derives and follows.** Deriving a group from nothing is the work of a change that adds every fact. The four procedures Lion had for deriving, and the five it had for following a change, are one.
- **Rules that invent, keys, and equality rules are followed row by row**, whatever their goals look like. The fall-back that derived such a group again is gone, and so is following "a component of values at a time".
- **It costs speed from nothing.** Following a change costs what it reaches, as before, and an aggregate now changes by one candidate. Deriving from nothing is slower on recursion, on aggregates that recurse, and where keys make unknowns one. The numbers are under "What it costs".

## What was open

`shared-algebra.md` settled what a row carries: an integer weight, with annotations as columns that aggregates combine. `unknowns-and-equality.md` designed how invented unknowns and equality could join that algebra, as a circuit of DBSP operators over nested time, and said plainly what was not built: "The invention operator is unbuilt", and only the operator that names classes had been tested. The earlier search of 81 sources found no work that keeps a chase with invented values, equality, and congruence up to date under deletions together (claims li-g1 to li-g35, and li-d21).

Two earlier decisions had also said no to this direction:

- `derived-rows-follow-changes` did not take counts, because "Counts cannot tell a row that recursion supports through itself from one that still holds".
- `follow-a-component-at-a-time` did not take weighted rows, because they would replace the engine before removing a special case.

Both reasons were true of weights alone. The rest of this report is about what makes them untrue.

## 1. Candidates and weights

A rule's answer is one candidate of the row its head gives. A fact is one candidate of its own row. A row's weight is how many candidates it has.

A change to facts is then a change to candidates:

- an answer that used a row a relation lost is a candidate taken away;
- an answer that uses a row a relation gained is a candidate added.

Every answer is counted once. When several rows change together, a body is run once from each goal that reads a changed relation, and an answer is dropped when a goal that stands earlier in the rule matched a changed row too: the earlier goal finds that answer on its own turn. Answers that used a lost row are found as things were, before the change, and answers that use a gained row as things are. A relation as it was is read through a view: its rows without the ones it gained, and with the ones it lost. Nothing is copied.

## 2. Time is a column

Weights alone are wrong for rows that give each other. Take `path` over a cycle `a → b → a` and one more edge into the cycle. When that edge goes, each path on the cycle still has a candidate, from the other, so every weight stays above zero and nothing is taken away.

The trouble is the question, not the counting. "Does this row hold?" has many solutions when rows give each other: every set of rows that keeps itself up is one, and the least is meant. A least solution cannot be checked row by row.

So Lion asks a different question, which has one solution:

> A candidate has a **level**: one more than the highest level of the rows of its own group that its answer used, and zero when it used none. A row is **held from** the least level one of its candidates has.

A candidate's level is above the level of every row it used. So a row's level never rests on itself, and the levels are a function of the facts: there is exactly one way to give every row a level. Lion keeps, for each row, how many candidates it has at each level.

That makes a change something to repair in order, lowest level first:

- A row whose least level lost its last candidate leaves, and takes its answers' candidates with it. Those are at higher levels, since an answer is above the rows it used.
- If the row has candidates left at a higher level, it joins again there, and gives its answers' candidates again.
- What is settled at one level is never looked at again.

On the cycle above, the path that rested on the lost edge leaves at its level. Its answers' candidates go, so the next path's least level is empty too, and it leaves, and so on round the cycle. No row is taken out that still holds, which is what the earlier engine did: it took out everything a change could reach and derived it again.

This is what DBSP and differential dataflow do with nested time (li-d1 to li-d4), kept in another shape. They keep each round's changes in a trace. Lion keeps the round as a number on the row, with its candidates counted by level, which is `aggregate/min` over a column, kept the way `shared-algebra.md` keeps `min`: by counted candidates. So the time is inside the algebra, not machinery beside it.

Deriving a group from nothing is the same repair, for a change that adds every fact. Every answer is a candidate, and the levels are settled lowest first, which is semi-naive evaluation: each level's new rows are the only ones the next level starts from.

## 3. Rules that invent: stages

A rule that invents gives its rows where its head does not hold yet, once the rules that invent nothing are done. All such rules then invent at once, and the others run on what was invented. That is a chase in stages, and which answers invent depends on the stage an answer first appears in: an answer that appears after a row already gives its head invents nothing.

Time carries this too.

- **Levels are counted in stages.** A stage is every level the rules that invent nothing reach.
- **The answers of a rule that invents are rows**, of a relation of their own, with candidates and a level like any row. Answers that name the same unknowns are one row.
- **At the end of the stage such a row is first held in, it is asked**: does a row that holds by then give its head? If none does, it invents, and what it invents is a candidate at the first level of the next stage.

The question asks only about lower levels than what it gives. So it keeps the property that makes the repair work: one solution, found in order. When a fact goes and an answer's level moves to a later stage, the answer is asked again there. When a row that gave a head goes, the answers that were not inventing because of it are asked again.

## 4. Values made one: a merge ends a row's time

A key or an equality rule makes two values one. Lion writes each class of such values as its least member. The hard case for following changes is the reverse: when the fact that made two unknowns one goes, the rows that held them apart must come back. A database that only keeps rows as they are written now has nothing to bring them back from, which is why the earlier engine derived the whole component again.

Three things solve it.

- **A pair of values made one is a row**, of a relation of its own, with candidates and a level. An equality rule's answer is a candidate of each pair where its two sides differ. Two rows of a keyed relation that hold at one level are candidates of the pairs where they differ.
- **Classes are worked out over time.** The pairs that hold are taken in the order of their levels, each makes two classes one from its level on, and a class is written as its least member: a value the group did not invent, else the unknown that nests the fewest unknowns, else the one that sorts first. So each value has a short history: the levels at which the value it is written as changes.
- **A row has a time, not only a start.** A row that holds a value which stops being the least of its class at a level is held **until** that level. At that level it gives the row with the least member in its place a candidate. The row that ended is kept beside the rows that hold. Questions about the database never see it.

An answer is then one whose rows were all held at one level: the highest level they are held from is below the lowest level one is held until. An answer over a row that ended still counts, since it was an answer while the row held, and it is how a pair keeps the candidate that made it.

So when a fact goes:

1. the answers that used it are taken away, among them the answer over the rows as they were before the merge;
2. the pair loses its candidate and leaves;
3. the class is worked out again, and the row that ended no longer ends;
4. it gives no candidate to the row it had become, which leaves if nothing else gives it.

Nothing is derived again that still holds. An unknown inside what another unknown describes is written the same way, so unknowns that describe values made one become one too.

Which unknowns a class may write as another depends on the facts: an unknown that a fact holds is given, and stays as it is. So a fact that holds an unknown is a change to every group that invents, and Lion now follows it there. Before this work it did not, which is listed under "What the checks found".

## 5. Aggregates

An aggregated row is its group's candidates combined.

- Each aggregate keeps the values its candidates give, counted.
- A count, and a sum or a mean of whole numbers, are running totals: a change is one addition.
- Every other aggregate combines the values that are left. `min` is never "minus"-ed: a candidate is taken away, and the least one still held is read.
- Where an aggregate recurses, a group gives a row from each level at which what its candidates up to there combine to changes. **A better value ends the row before it**, as a merge ends a row: the row is held until the level of the next. Only the levels from the first that changed are worked out again.

One visible change follows. A sum or a mean of numbers that are not all whole is added up in sort order. Before, it was added in the order the matches were found, which depended on the order facts were added in, though the docs say results do not. Counted candidates have no order to add in, so sort order is the one that does not depend on history.

An answer that several rules with one head find counts once. Such an answer is a row of a relation of its own, so it is held from the least level any of them finds it at.

## 6. Questions about what changed

A rule can ask about a relation: under `not`, in a `find`, as a value, in its head. When that relation changes, the answers of the rule may change without any goal of its body matching a changed row.

Lion finds the answers a changed row could have touched, as before, and names rows by the head values that ask nothing. Every answer that gave a row so named, as things were, is taken away, and every answer that gives one, as things are, is added. An answer the change left alone is taken away and added.

## 7. What is still derived again

Two kinds of relation cannot be followed row by row: one whose rule holds a function from the host that does not say it reads only its arguments, and one whose rule reads a changed relation through a schema instead of a relation goal. Such a relation is derived again and compared with what it was. That is the general rule of the algebra for something whose reads are not known: apply it again and take the difference.

## What the checks found

The properties are in `packages/core/src/logic/tests/weights.test.ts`.

| Property | What it compares |
|---|---|
| Rows, levels, and weights after any changes | A database that followed changes against one that derived nothing yet: the same rows, and for every row the same level it is held from, the same level it is held until, and the same number of candidates at each level, also for answers that invent, pairs, and rows that ended. Programs invent in two stages, pass unknowns through derived relations, and make them one by a key, by equality rules, and by an equality rule that needs a row of the second stage. |
| The level a row is held from | Lion's levels and counts for every path of a random graph, after any edge changes, against a plain model that works them out round by round. |
| Aggregates kept by counted candidates | Ten aggregates after any changes against a plain model computed from the facts there are. |

Each property ran 5,000 random programs once (`research/probes/weights-model`, saved as `research/sources/weights-model-tests.txt`), and runs 1,000 in the test suite. The properties that were there before still hold: 459 tests pass in `@lionlang/core`, among them the ones that compare a database that followed changes with a fresh one over recursion, negation, finds, aggregates, an aggregate that recurses, keys, and rules that invent, and the ones that compare Lion with a plain model of the chase.

The first property found four mistakes while it was being written, each fixed with the property kept:

1. **A fact that holds an unknown was not followed through groups that invent.** Adding `["fact", ["tall", ["some", "?m", ["mother", "b", "?m"]]]]` makes that unknown given, so a class can no longer write it as another value. The group that invents mothers does not read `tall`, so nothing reached it. This was wrong before this work too.
2. **An invariant was not asked again after such a fact.** An equality rule's invariant reads `mother` and `registered`, not `tall`, so the change was accepted where a database with the same facts refuses the rule. Every invariant is now asked when a fact that holds an unknown comes or goes. This was wrong before too.
3. **A row that ended kept the writing its class had.** When a class's least member changed at the same level, the row it had become was not written again.
4. **A class was written again while half of it was new**, which never ended.

## What it costs

All figures are beside `main` (b2e2f66), from `bun run measure`, `bun run bench` twice, and `bun run scale`, on 2026-11-18. The output is saved as `research/sources/lion-bench-weights.txt`.

**Following a change**

| Twenty changes, then ask | at 1,000 | at 10,000 | at 100,000 | main at 100,000 |
|---|---|---|---|---|
| add a twin, ask the mother a key gave them | 9 ms | 10 ms | 9 ms | 77 ms |
| add a fact, ask one group's total | 6 ms | 5 ms | 5 ms | 17 ms |
| add a fact, ask every group's total | 6 ms | 8 ms | 25 ms | 36 ms |
| add a fact, ask a rule that invents | 16 ms | 91 ms | 1.3 s | 1.3 s |
| add a fact, ask a count that can be zero | 8 ms | 9 ms | 36 ms | 26 ms |
| add a road, ask every shortest distance | 9 ms | 32 ms | 272 ms | 239 ms |

The twins no longer grow with the people: the change reaches two rows, and two rows are settled. A count that can be zero is slower, since a rule that asks about a changed relation is counted as things were and as they are.

**Deriving from nothing**

| Benchmark | main | now | speed |
|---|---|---|---|
| every path on a 150 chain | 11.6 ms | 15.1 ms | 0.77× and 0.82× |
| shortest distances by lattice recursion | 17.2 ms | 30.0 ms | 0.57× and 0.61× |
| 2,500 pairs of twins whose unknown mothers a key makes one | 144.8 ms | 200.8 ms | 0.72× and 0.74× |
| a mother for each of 5,000 people, 1,000 given | 44.3 ms | 54.8 ms | 0.81× and 0.95× |
| 300 rules added one form at a time, then a query | 67.0 ms | 81.4 ms | 0.82× and 0.97× |
| sum and count 20,000 facts into 500 groups | 51.7 ms | 57.0 ms | 0.91× and 0.95× |

The other fifteen benchmarks ran between 0.90× and 1.04× in both runs. Building the model of this repository's history, about 4,600 claims through some 200 groups of rules, takes 31 seconds where it took 26.

**Memory a database keeps**, at the largest size:

| Workload | main | now |
|---|---|---|
| every path, 100,000 nodes in chains of 10 | 237 MB | 360 MB |
| add a road, ask every shortest distance | 32 MB | 153 MB |
| add a fact, ask a rule that invents | 121 MB | 444 MB |
| add a twin, ask the mother a key gave them | 133 MB | 704 MB |

A row now has an entry with its candidates by level, and a group that invents keeps each answer that could invent, what it would invent, and the rows that ended. That is the price of following such a group row by row, and it is the largest cost of this work.

**Code**

| | main | now |
|---|---|---|
| code lines | 13,251 | 14,083 (+6.3%) |
| functions | 1,552 | 1,599 |
| paths through functions | 3,508 | 3,758 |
| nesting-weighted decisions | 2,458 | 2,729 |
| messages a program can get | 151 | 151 |
| interop grid exceptions | 3 | 3 |

Nine procedures became one: four that derived (rows, aggregates, rules that invent, and the pass that made unknowns one) and five that followed a change (rows, groups, rules that invent alone, a component at a time, and deriving again). The one is longer than the nine were. `maintain.ts` went from 969 lines to about 550, `components.ts` is gone, `model.ts` lost about 650 lines, and `weights.ts` is about 2,100 with its comments.

## After the gaps were closed

A second pass, on 2026-11-19, closed the gaps the first left open: what a database keeps, two rows with one key inside a group, `why`, and the breaks no property caught. The decision record is `history/notes/rows-read-when-held.json`; the properties and measures are saved as `research/sources/weights-model-gaps.txt` and `research/sources/lion-bench-gaps.txt`.

**What a group keeps is what its rules need.** A group whose rules read nothing of its own, which is most groups, has one level: its rows keep a weight in their table and nothing else. In any other group a row's entry rides on the row itself instead of in two maps beside it. The answers of a rule that invents keep the unknowns they name and recompute the rows of their head when asked, and no group keeps how its rows came about.

**A row beside one with its key is read a level later.** A row that comes while another row with its key is held can be read from the level after, when the pair that makes the two one holds and the row whose value its class no longer writes has ended. So no answer finds two rows with one key, not even an answer of the group's own rules. A row that is never held is read from the level it is held from. Holding the pair from the same level, tried in the first pass, is not needed.

**`why` finds its answer when asked.** Of the answers that give a row at the level it is held from, it tells the least of the first rule that has one, worked out from the rows there are. A change keeps no explanations and works none out. Where a key or an equality rule made values one, the group's answers are worked out again once after a change, to tell its rows through the values made one: that remains.

**What the checks found.** Five properties were added to `weights.test.ts`, and each was shown to fail on the break it is for:

| Property | What it compares |
|---|---|
| Rows with one key | In programs where a twin passes a keyed mother on inside her own group, and a rule of that group asks for two mothers of one child, the rule finds none, and the followed and fresh databases keep the same rows. It fails when the row beside another is read at its own level, and when an answer counts though its rows were never held at one level, the break the first pass could not catch. |
| `why` over paths | With the rule that recurses listed first, `why` tells each path by the least answer at the level a plain model gives it. It fails when `why` takes the first answer found, and when it ignores the level. |
| `why` over invented rows | `why` tells an invented home by its mother's least child. It fails when `why` takes the first answer found. |
| `why` in any order | After any changes, `why` tells every row as two databases that derived nothing tell it, with the facts given in either order, and asked once before the changes too. It fails when what was told is kept through a change. |
| `why` over computed heads | For a rule whose head computes from what a claim says, a sum, a product, a string, a list, or a record, with or without a `not`, `why` tells every row by the claim it computed the row from, and the row holds what a plain model computes, after any changes. It fails when a value the head computes names the row. |

The first of them found that a row that is never held could be read from one level in a followed database and another in a fresh one, by the order the rows were settled in; such a row is now read from the level it is held from. The research skill's frozen eval found that `why` failed on a row whose rule head computes, such as `["number/multiply", "?usd_bn", 1000]`: finding the row's answers put the computed value in a goal that ran before the body bound its variable. A row is now named only by head values that are variables, values, or records and lists of those; the last property pins it. The first property also showed that a change refused because it breaks a key forgets what was derived, since following it failed partway, so the change after it finds nothing to follow; that is as on `main`. Each property ran 5,000 random programs once. `bun run mutate --in logic/weights.ts,logic/maintain.ts` caught all 56 breaks; one of them never ends, and `mutate` now stops a mutation's tests after ten minutes and counts it caught.

**What it costs now**, beside `main` and beside the first pass:

| Memory a database keeps | main | first pass | now |
|---|---|---|---|
| every path, 100,000 nodes in chains of 10 | 233 MB | 360 MB | 238 MB |
| add a fact, ask a rule that invents | 121 MB | 444 MB | 186 MB |
| add a twin, ask the mother a key gave them | 133 MB | 704 MB | 400 MB |
| add a road, ask every shortest distance | 32 MB | 153 MB | 143 MB |
| add an edge, ask what one node reaches | 36 MB | 55 MB | 48 MB |
| `why` of one derived row among 100,000 | 75 MB | 68 MB | 61 MB |

| Deriving from nothing | first pass | now, three runs |
|---|---|---|
| every path on a 150 chain | 0.77× and 0.82× | 0.88×, 0.88×, and 0.78× |
| shortest distances by lattice recursion | 0.57× and 0.61× | 0.67×, 0.56×, and 0.62× |
| 2,500 pairs of twins whose unknown mothers a key makes one | 0.72× and 0.74× | 1.19×, 1.32×, and 1.25× |
| a mother for each of 5,000 people, 1,000 given | 0.81× and 0.95× | 0.83×, 0.98×, and 1.00× |

Following a change costs what it did: twenty twins in 10 milliseconds among 100,000 people, where `main` takes 75. The code grew again: 14,438 lines where `main` has 13,251 (+9.0%), 1,650 functions, 3,859 paths, 2,782 nesting-weighted decisions. A group with one level and a group with entries are two ways of keeping rows, and that is most of the growth. The messages, special forms, library functions, and grid exceptions are unchanged.

## What is new, and what is not

**Not new.** Rows with integer weights are DBSP's Z-sets and Green, Ives and Tannen's z-relations (li-f5, li-f6). Counting the derivations of a row is the oldest way to maintain a view, and counting by round is how it is made right for recursion (li-d16 measures it). Nested time is DBSP's and differential dataflow's. Least members under a fixed order are standard (li-g28, li-g31, li-g12, li-g34).

**New, as far as the earlier search of 81 sources found:**

1. **A restricted, parallel chase kept up to date by counting**, with the stage as part of a row's level and the question "does a row give this head?" asked of lower levels only.
2. **A merge as the end of a row's time.** Rows that ended are kept, an answer is one whose rows were held together, and so the answer that made two values one is still there to lose its candidate. That is how an equality is taken back without deriving a class again, also when unknowns nest.
3. **The same end of time for a better value** of an aggregate that recurses.

No new search was run for this report. Those three are claims about the 81 sources read on 2026-11-17 and 2026-11-18, not about everything written.

## Where it differs from the two designs

- `unknowns-and-equality.md` kept classes with an operator of its own that walks a class again when a pair is removed. Here a pair is a row, and the class is worked out again from the pairs that hold, in the order of their levels. A removed pair still costs its class.
- `shared-algebra.md` kept a running total for every sum. Here a sum of numbers that are not whole combines the counted values in sort order, since a running total of such numbers drifts as values come and go.
- `shared-algebra.md` asked whether a fact could be one more candidate of an aggregated relation. That is unchanged: only a relation that merges takes facts.

## Open ends

These are what is left after the second pass.

- **From nothing it is slower where rows give each other.** Paths run at 0.78 to 0.88 times the speed of `main`, and lattice recursion at about 0.6: a group that reads its own rows keeps an entry per row.
- **A database keeps more than on `main`** where rules invent or recurse through an aggregate: 400 megabytes for the twins where `main` kept 133, and 143 for shortest distances where it kept 32. A group that makes values one keeps the rows that ended, and an aggregate that recurses keeps its candidates by level.
- **`why` in a group that made values one** works the group's answers out again once after a change, to tell rows through the values made one.
- **A rule that asks about a changed relation is counted twice**, as things were and as they are.
- **One large class costs its size** when a pair is removed, as before.
- **A change refused for breaking a key forgets what was derived**, so the next change derives it again when something reads it, as on `main`.

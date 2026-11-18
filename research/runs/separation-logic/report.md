# Separation logic, and what Lion can use from it

Research run of 2026-11-18. It covers 46 sources, 203 quoted statements, and 37 publishers, kept in the shared research model in `research/` (steps `02-sl-*` to `09-sl-*`). Every figure below comes from a query of that model.

## Update: all three were built (2026-11-18)

The three ideas ranked worth building are now in Lion:
- **Record and list rests** (`5ec2b84`): `["schema/open", record, rest]`.
- **Merging what a key gets** (`5f46e6d`): `{"key": ..., "merge": {column: aggregate}}`.
- **Asking what would hold** (`48880e4`): `["assuming", change, ..., expression]`.

The probes were run again on the built Lion (`research/sources/lion-probes-built.txt`), and the README's new sentences were recorded (step `10-sl-built`). Lion's latest word now replaces its earlier one, so the model's verdict for each of the three is "Lion does this already". The beliefs that Lion lacked them are now overturned by that evidence. The answer below is the run as it stood before the build.

## The short answer

The tweet ([@kirancodes, 2026-11-17](https://x.com/kirancodes/status/2122526789918753113)) introduces two ideas from separation logic:

- **The separating conjunct, written `P ∗ Q`.** It holds when the state can be split into two parts that share nothing, with P true of one part and Q true of the other.
- **A unital resource algebra.** This is Iris's generalization of "the state". It is a set of values with three things: a way to combine two values, a check of which combinations are valid, and a unit that changes nothing when it is combined with anything.

The model weighed 7 ways to bring these ideas to Lion:

- **Worth building (3):**
  1. Split a record into the keys a pattern names and the rest.
  2. Give each keyed column a way to combine values, where a clash is a combination that is not valid.
  3. Ask what would hold if some facts were added.
- **Lion does these already (2):** it checks and updates only what a change can reach, and its `why` says which facts are missing for a goal to hold.
- **Has nothing in Lion to work on (1):** a conjunction whose goals must match different facts.
- **Conflicts with what Lion guarantees (1):** rules that use up the facts they read.

The record split is the clear first choice. It is a small feature with direct precedent in Racket. One rule would give Lion three things it lacks: a pattern that binds the rest of a record, a way to compose exact record schemas, and a pattern that binds the rest of a list. That same rule would also replace Lion's two separate cases for exact and open records, and a check run in Lion found it reproduces both exactly.

## What the tweet is about

I could read only the tweet's text. The 119-second video is not available as text, and Kiran's blog has no post on resource algebras. The explanations below come from the primary sources.

**Separating conjunction.**
- Reynolds introduced P ∗ Q as an operation "that asserts that P and Q hold for disjoint portions of the addressable storage" (Reynolds 2002). O'Hearn (2019), Gardner, Maffeis and Smith (2012), and Kiran's 2021 blog define it the same way.
- `emp`, the empty state, is its unit.
- The idea pays off in the **frame rule**. If a command turns P into Q, it turns P ∗ R into Q ∗ R for any R it does not touch. So you reason only about the command's *footprint*. Reynolds calls the frame rule "the key to local reasoning".
- The **magic wand** P −∗ Q says this: if the state were extended with a separate part where P holds, Q would hold.

**Resource algebra and "unital".**
- Iris replaces the heap with any resource algebra. "Instead of partiality, RAs use validity to rule out invalid combinations of ownership" (Jung et al. 2018).
- An RA is unital when it has a unit ε, so that ε · a = a, and the unit is valid. Iris requires the global RA to be unital, and "one can always turn an RA into a unital RA by extending it with a unit element".
- The standard examples:
  - **Heaps:** combining two heaps is disjoint union, overlapping heaps are invalid, and the empty heap is the unit.
  - **Agreement:** a · a = a, and two different values combine to the invalid element.
  - **Exclusive:** every combination is invalid.
  - **Fractions:** shares are valid while they sum to at most 1.
- Two publishers define "unital resource algebra": the Iris project and Dietrich's 2021/2025 guide. The term is Iris's own.

## What Lion can use

### 1. Split a record into named keys and the rest (worth building; ranked first)

**The fit.** Separation logic's model of state is a finite map, and combining two states is defined only when their keys are disjoint (O'Hearn 2019). A Lion record is also a finite map, so P ∗ Q over a record means "the record splits into two sets of keys". Lion already has the two readings separation logic has:
- An exact record pattern has no room for other keys. This is P ∗ emp.
- `schema/open` ignores other keys. This is P ∗ true.

JavaScript program logics describe objects in exactly these two ways. A field assertion "says nothing about any other field" (Gardner et al. 2012). JaVerT's `emptyFields` asserts that an object has no properties outside a set (2018).

**What Lion lacks** (Lion's docs and the probes run for this research):
- No pattern can bind the rest of a record. `["schema/open", {"id": "?id"}]` binds only `?id`.
- Two exact record schemas cannot be composed. `["schema/allOf", "Id", "Tagged"]` fits nothing, because each part rejects the other's key. In plain code you can build one combined literal schema with `object/set`, but there is no way to do it with named schemas.
- No list pattern binds the rest of a list.

**Precedent.**
- **Racket's `hash` pattern** (added in 8.11.1.10) is Lion's design plus the missing piece. It is closed by default, `#:open` allows other keys, and `#:rest pat` "is further matched against the residue hash table". `list-rest` binds the rest of a list.
- **JSON Schema** hit the composition problem. `additionalProperties` "can restrict you from 'extending' a schema using combining keywords such as allOf", so draft 2019-09 added `unevaluatedProperties`.
- **JavaScript** binds an object's rest with `...rest`, but only to a name.
- **Elsewhere:** row polymorphism (Leijen; PureScript) names "the other fields", and disjoint intersection types name their disjointness relation A ∗ B "inspired by the separating conjunction".

**The rule.** A record schema checks the keys it names and hands the record of the remaining keys to a *rest schema*:
- `{}` for an exact record, which is today's default;
- any record for `schema/open`;
- a variable to bind the rest;
- another exact schema to compose two.

Lists work the same way: a prefix, then the rest of the list.

**Checked in Lion.** `research/probes/split-model.json` tries every combination of 64 small record schemas and 27 records.
- **Exact records:** over the 1,728 schema-and-record cases, a split with an empty rest differed from today's exact records in 0 cases.
- **Open records:** a split with any record as the rest differed from today's `schema/open` in 0 cases.
- **Composition:** over 9,261 cases of two disjoint exact schemas and a record, a split with an exact rest differed from the single combined exact schema in 0 cases. `schema/allOf` of the same two parts accepted 27 of the 729 records the combined schema accepts.

The check is exhaustive but small: 3 keys, values `1` and `"x"`, and 4 kinds of key schema. A property test in the repo would generalize it.

**Demand inside Lion.** The lion-research skill's core already computes a record's rest by hand, folding `object/remove` over a record with an accumulator it names `rest`.

**A decision for you.** The syntax could be a second argument to `schema/open`, as in `["schema/open", {"type": "order"}, "?rest"]`, or a new name. I recommend the second argument: it keeps Lion's existing word, it is the same as Racket's `#:rest`, and it is additive, since a one-argument `schema/open` keeps its meaning.

Things to settle in the design:
- A bound rest that shares a key with the named part should fail. That is the disjointness of ∗.
- Optional keys that are absent never reach the rest.
- `=` compares values and takes no schemas, so it stays as it is.

### 2. Combine values in keyed columns, with validity (worth building; ranked second)

**What Lion has.**
- Lion's keyed rules behave like Iris's agreement RA. Two different derived rows with the same key make the query fail, and in the agreement RA two different values combine to the invalid element. Both sides confirm this assumption.
- Lion's aggregates already have units. A count of nothing is 0. Min, max and mean of nothing are `null`, which is Iris's move of adding a unit to an algebra that has none.

**What Lion lacks.**
- Relations take only the options `"key"` and `"schema"`, so a keyed column cannot declare how two values combine.
- An aggregated relation cannot have facts.

**How it lines up with existing plans.** Lion's earlier algebra design (`shared-algebra.md`) already plans "a group's columns are folds over its candidates", with "two different known values are an error". egglog's merge expressions are the working precedent. The resource-algebra framing adds one general rule: a clash is a combination that is not valid. That rule names each of Lion's current behaviors:
- keyed rules are agreement;
- aggregates are algebras where every combination is valid;
- a fact that replaces its key's row is an update by the one owner of an exclusive value.

**A decision for you.** This touches two documented rules: "a fact with a key that is present replaces the old row", and "an aggregated relation cannot have facts". I would treat this as a refinement of the planned fold design, not a separate feature.

### 3. Ask what would hold if some facts were added (worth building, with a cost; ranked third)

**The fit.** The magic wand over facts that can be reused amounts to "would Q hold if these facts were added?". That is hypothetical Datalog's embedded implication (Bonner 1988, 1990; Sáenz-Pérez 2015) and the implication goal of λProlog and Lolli (Hodas and Miller 1994).

**What Lion lacks.** Lion has no goal for this. The lion-research skill's "What if" pattern copies the model and runs the step against the copy instead.

**The cost.**
- Hypothetical additions raise data complexity "from PTIME to PSPACE", and deletions raise it "to EXPTIME" (Bonner 1990).
- Stratified negation adds no complexity, and the fixpoint "is independent of the way it is stratified". So the idea keeps Lion's single answer.

## What Lion already does

- **The frame rule's idea.**
  - "A change to facts is checked against the invariants that read what it changed".
  - Derived rows are "brought up to date when facts or rules change".
  - Rules take the values their names had when written, so a later `define` does not reach them.
  - Infer's compositional, incremental analysis is the same principle at the scale of a codebase.
- **Bi-abduction's "missing part".** `why` on a fact that does not hold names the missing goals. For `path a c` with only `edge a b`, it names `edge a c` and `edge b c`.
- **Units.** Each aggregate has an answer for nothing, as described above.

## What does not carry over

- **A separating conjunction over facts.** A Lion fact can be used again: `and` matched one row twice in the probe. For such propositions separation logic itself says ∗ and ∧ coincide. The Iris lecture notes put it this way: "if one of the propositions is persistent, then there is no difference between conjunction and separating conjunction". Reynolds says the same of pure assertions. A bunched-logic database example gets ∗ over facts only by splitting the database into separate parts, which in flat relations "would require a tagging system", that is, a column. Lion can already do that.
- **Rules that use up the facts they read.** This covers constraint handling rules, Lolli, Ceptre and Linear Meld. Each gives answers that can depend on which rule fires or which facts are chosen:
  - "CHR programs often rely on the execution control" of an ordered semantics.
  - Ceptre's rules are unordered and "potentially giving rise to nondeterminism".
  - Linear Meld picks facts "non-deterministically".

  This conflicts with Lion's guarantee that every program "has a single answer, whatever order rules and facts were added in". Some linear programs are order-independent, and CHR has a confluence test for terminating programs, but neither makes it a property of the language.
- **Read about but not weighed as ideas.**
  - Incorrectness logic: under-approximation with "no false positives".
  - Verifying Lion's engine with a separation-logic tool such as JaVerT.

  Neither changes what a Lion program can say.

## How solid this is

- **Assumptions.** I wrote 10 beliefs into the model before the literature arrived. None failed, and all 10 are confirmed by evidence on every question they depend on.
- **Disputes.** No question is disputed.
- **Corroboration.** 28 questions are confirmed first-hand by two or more publishers, and 112 rest on one publisher's word. Most of those are a system's own documentation of itself, such as Racket's docs on Racket's `match`, where that publisher is the authority.
- **The separation-logic sources come from a small, overlapping group.** O'Hearn is an author of many of the papers. I counted each paper's author group as its own publisher, and the two Iris sources as one publisher, "Iris project".
- **What Lion does** rests on Lion's reference docs and on probes run with the CLI built at commit `f49b97a` (core 0.13.0).
- **Not read:**
  - Boyland 2003, which is paywalled; fractional permissions are known here through Bornat et al. 2005.
  - O'Hearn and Pym 1999, and Armelín and Pym 2001, which are paywalled or did not extract to readable text.
  - Krebbers et al. 2017, which one source credits.
  - The tweet's video.
- **Dates.** The readers took some publication dates from memory. No finding depends on a date.
- **No prior work combines separation logic with Datalog.** The readers found none after several searches. The nearest are Linear Meld, a bunched-logic database example, and a separation-logic prover written in Prolog.

## Files

- `page.json` beside this report is the plan of the page. Build `explorer.html` from it as `research/README.md` says, and open it in a browser from disk.
- The model, the steps that build it, the quoted sources, and the Lion programs run for this research are in `research/`.

# Formal verification for Lion

Run `formal-verification`, 2026-11-19. Steps `31-fv-frame` to `38-fv-model-checking` in `research/steps/`, probes `research/probes/fv-*.json`. Every figure and verdict below is a query of the model; the sketches of Lion code under "What it would look like" are proposals, not findings.

## The answer

Alchemy's "formal verification" proves one thing and searches the rest. Its prover asks Z3 whether any state that keeps the invariants, and any input, lets a command break one (one step of induction). What it cannot prove it checks by running every short sequence of commands, and then by random walks. A broken rule comes back as the shortest sequence that breaks it, written as a test.

Lion already has half of that: invariants, rules that compare a change before and after (over an event log), a search of every sequence of commands up to a bound (in plain Lion code), the shortest breaking sequence, and a counterexample that runs again as a Lion program. What it lacks is everything that needs a solver. Lion refuses any question about every value a variable could take, so it can check the states it is given but cannot prove anything about all of them.

The model ranks three of the ten ideas it weighed as worth adopting now, and three more as worth adopting once the first is built:

1. **Solve for the values a question leaves open** (rank 1; adds 4 things Lion lacks; 15 publishers behind its techniques). A filter over a variable that no goal binds becomes a constraint. A decision procedure finds values that meet the constraints, or shows there are none, and "none" is a proof for every value.
2. **Search every sequence of commands up to a bound, with inputs drawn from their schemas** (rank 2; adds 1; 7 publishers). Lion can already search sequences; what it lacks is a schema that lists the values it allows, up to a size.
3. **Rules about what must eventually happen** (rank 3; adds 1; 1 publisher), checked at the end of every sequence searched.

After the solver: **prove that every command keeps the invariants** (the Alchemy feature itself), **find the invariants a proof needs**, and **a certificate for every proof**. The model derives that each of these needs "a proof that a goal has no answer for any value", which only the solver gives. The CIRT run's idea "decide when one schema includes another" needs the solver too: the model now derives that it builds on it.

## What Alchemy's verify does

From the tweet, the pull request (alchemy-run/alchemy#3260), the `alchemy-domain` skill's testing reference, and the prover's source (`Prove/internal/Induction.ts`, `Smt.ts`), all from one publisher, Alchemy:

- **Proved.** "`Prove` reads `decide`, `evolve` and the rules as logic and asks Z3 whether any state and input break one." The report calls it "Proved: for every state and every input, after any number of commands". The source describes it as "Take each command from any state that satisfies every invariant, along every path through its code". That is one-step induction, the technique Dafny, TLA+'s Apalache, and AWS's P verifier also use.
- **Checked.** "`Explore` runs every sequence of a few commands through the Apis, with solver-picked values": bounded model checking, two commands deep by default.
- **Sampled.** "200 seeded random walks of up to 12 commands", for rules that take longer to break.
- **Too weak to prove.** "A relation too weak to prove itself drops to Checked and says which states the proof needs ruled out". The user adds the invariant that rules them out. Alchemy finds no invariants itself.
- **Repeatable.** "The solver stops after a fixed amount of work and starts from fixed seeds, so a result repeats on every machine."
- **Limits.** It reads TypeScript handlers into logic, and refuses what it cannot read: "Not read: a loop whose number of turns depends on an input, … a record whose keys the schema leaves open". "Arithmetic JavaScript rounds is reported as not read." Its tests "run under Node (vitest), not Bun".

## What Lion does today

Twelve programs in `research/probes/fv-*.json`, run at 6e9cb59 (core 0.14.1), on a bank account whose invariant is that an open account is never overdrawn:

- **Invariants are kept at every change, not proved.** A withdrawal that overdraws is refused: "Adding this fact breaks an invariant, so nothing changed." Lion checks the state it is given. Whether some other state and some other amount would break the rule is a question it cannot ask.
- **No question over every value.** `["find", "?balance", ["number/lessThan", "?balance", 0]]` gives "?balance must first be bound by a relation". `["=", "?y", ["number/add", "?x", 1]]` does not solve for `?x`. A schema does not list its values. An unknown balance invented by an existential rule cannot be compared with 0: "Expected number at [0]".
- **Rules cannot follow the states a model computes.** A rule that reaches `balance + amount` from `balance` is refused: it "computes a new value in its head while recursing, which may never finish". This is Lion's termination guarantee doing its job. Inside a scope given as facts (balances 0 to 6), the same rules reach 13 states, list the ones that break the invariant, and `graph/shortestPath` gives the shortest way there.
- **A search in plain code works.** A breadth-first search over four commands checked 5,460 sequences of up to six commands with the careful withdrawal and found nothing. With a withdrawal that forgets its check it stops at the first sequence that breaks the rule: one withdrawal of 3.
- **The counterexample runs again.** The sequence found is data. Built into a Lion program of facts, rules, and the invariant, and run with `eval`, it is refused by the same invariant. Lion's programs are JSON, so a counterexample is already a test.
- **Before-and-after rules.** With changes kept as facts in an event log, an invariant can say that nothing happens to an account after it is closed, and a later deposit is refused. The state is a rule over the events (`aggregate/sum` of signed amounts), which is the decider pattern written as rules.
- **`why` can be rechecked.** Lion's docs: "Every check, evaluated as it stands, is true, so anyone can work the arithmetic again". A certificate format for proofs already exists for what holds; nothing yet proves what holds for every value.

## What to add, and what it would look like

### 1. Solve for the values a question leaves open

What it adds, per the model: values that satisfy constraints over unbound variables; a proof that a goal has no answer for any value; running a program's own code on symbolic values; a way to compare what two predicates accept. Precedents the model lists: Rosette, Z3, Dafny, Verus, Formulog, Apalache, P, AWS, Alchemy (SMT solving); Rosette, EFFIGY, KLEE, P (symbolic evaluation); SWI-Prolog, HSF (constraint logic programming).

Rosette is the closest precedent. It is embedded in Racket, whose semantics Lion follows: "Symbolic values, including constants, can be used just like concrete values of the same type", and `verify` returns either a binding that breaks an assertion or `(unsat)`. Lion has most of the parts already:

- **The waiting rule** keeps an expression over an unbound variable as a term until the variable is bound. Today, if it is never bound, the query is refused. The proposal changes only that ending: what still waits becomes a constraint.
- **Unknowns** (`["some", "?m", goal]`) are already values that stand for some value. They would become the symbolic constants, and `why`'s `"assumed"` mark already says when an answer depends on one.
- **Equality over unknowns** is already decided by Lion's unifier, the congruence part of an SMT solver.
- **Schemas** give each open variable its sort: `value/integer?`, `value/number?`, strings, booleans, `schema/anyOf` of literals, records of these.
- **`exists` and `not`** are already questions. Asked over open variables, `exists` finds a witness, which `why` shows as values, and `not` is a proof.

Proposed rule, in the vocabulary Lion has. A variable that a schema types and no goal binds stands for every value of the schema. A filter over it is a constraint. A question over it asks whether some value meets every constraint.

```json
["exists", ["?b", "?amount"],
  ["and", ["schema/fits?", "?b", "value/integer?"], ["schema/fits?", "?amount", "value/integer?"],
    ["number/greaterThanOrEqualTo", "?b", 0], ["number/greaterThan", "?amount", 0],
    ["number/lessThan", ["number/subtract", "?b", "?amount"], 0]]]
```

This would be true, with `why` showing `?b` 0 and `?amount` 1. With the careful withdrawal's guard `["number/greaterThanOrEqualTo", "?b", "?amount"]` added it is false: a proof for every balance and every amount. A `find` over open variables lists its answers only when a schema makes them finite, so `["find", "?x", ["schema/fits?", "?x", ["schema/anyOf", 1, 2, 3]]]` gives `[1, 2, 3]`. That is also what idea 2 needs.

**What the sources say it needs.** A decidable theory (Dafny's guide; Rosette: "effectively decidable only for linear constraints"); symbolic values only of types the solver supports, and every operation lifted (Rosette); a bound on symbolic evaluation of loops and recursion (Rosette, Formulog); trust in the solver's code (Lean's guide). Caveats the model derives: SMT solving and symbolic evaluation do not by themselves give guaranteed termination, and whether SMT results repeat on every machine is disputed. Alchemy gets repeatable results by fixing the solver's work budget and seeds; Dafny and Formulog say the solver is random.

**The engine: my recommendation, not a finding.** Lion promises one answer and that evaluation finishes. A solver that may say "unknown" (Z3's guide, Formulog) breaks both. Decide only theories where every question gets "yes" or "no": linear arithmetic over numbers, equality over strings, booleans, null, and records and lists of known shape. Refuse anything else with an error that names the term, as Alchemy refuses arithmetic that rounds. Z3 compiled to WebAssembly does run in memory, but the sources say it needs threads with SharedArrayBuffer, a page served with cross-origin isolation headers in a browser, asynchronous calls, and Node rather than Bun. Lion's examples run in the browser and its tests run under Bun. So build the decision procedure for this fragment in Lion's own engine, reusing its unifier for equality, and let a host binding to Z3 cover richer theories where a program asks for them. Lion's numbers are JavaScript doubles: treat arithmetic as exact only on integers (Alchemy: "Keep numbers that are added or multiplied whole").

### 2. Search every sequence of commands up to a bound

What it adds: every value a schema allows, up to a size (Alloy's small scope; SmallCheck: "verify properties for all test cases up to some depth"). What Lion has already: the search, the shortest breaking sequence, and the counterexample as a program. Caveat: a bounded search never proves anything past its bound (Apalache: "bounded model checking may miss it!"), so its result should say "checked up to N" and never "proved".

What it would look like: a library function over a start state, a list of commands (lambdas from a state and an input to a change), the invariants, and a depth. Inputs come from each command's argument schema, through the finite `find` of idea 1. It returns how many sequences it checked and the shortest one that breaks a rule, as a Lion program to rerun. The probe `fv-explore-code.json` is a first draft of it, in 42 lines of Lion.

### 3. Rules about what must eventually happen

On a finite trace, "eventually P" means P holds before the trace ends (De Giacomo and Vardi). Alchemy checks `eventually` rules the same way, at the end of each sequence searched. This needs only idea 2.

### After the solver: prove that every command keeps the invariants

This is what the tweet calls formal verification. With idea 1 it is one Lion question, not a new engine: "is there a state that every invariant allows, and an input its schema allows, such that, assuming the command's change, some invariant's goal has an answer?" The state is a row of open values per keyed relation, typed by the relation's schema. `assuming` applies the command's change, and the invariant's own goal asks the question. "No" is the proof. "Yes" is a state that breaks the induction step. It may be unreachable, which is why Apalache and the P verifier ask for "a user-written invariant strong enough to be inductive". Bounded search tells the two apart: a state it reaches is a real bug, and one it never reaches calls for another invariant.

Invariants over aggregates, such as a balance summed over an event log, quantify over every row. Alchemy proves relations over "a fixed few" instances and only searches model-wide rules. Lion should start the same way: prove invariants whose goal joins a fixed number of rows, and report the rest as checked.

### After the solver: find the invariants a proof needs, and certificates

- **Invariant inference.** Houdini "returns the unique, maximal conjunction of candidates that form an inductive invariant" and "is sound, deterministic, and terminating, assuming each call to the underlying SMT solver returns". Lion could try the bounds its schemas and invariants already state as candidates, and drop those that fail. IC3/PDR and constrained Horn clauses go further, but sources say they do not guarantee termination.
- **Certificates.** Lion's `why` already gives trees that can be rechecked by evaluating them. A proof that a goal has no answer for any value would need its own tree, one a small checker rechecks (DRAT-trim, cvc5's Ethos, Lean's kernel). Z3's own proofs include "big opaque steps", one more reason to keep the decision procedure in Lion.

## What not to add

- **Model checking with rules over every reachable state** (as XMC does in tabled Prolog). It needs rules that follow states they compute without a bound, which Lion's termination rule refuses, and no idea weighed here would give that. Inside a finite scope Lion's rules already do it.
- **Proofs people write, checked by machine** (Lean, TLAPS). It needs a type checker that runs before the program, which Lion lacks, and proof steps written by the user.
- **Formulas as values with a solver function** (Formulog). The model derives that the solver gives everything it gives, and more: Formulog's formulas are terms built beside the program, not the program's own code run on symbolic values.

## Limits

- **Where sources disagree.** Whether SMT results repeat on every machine: yes for Alchemy with a fixed work budget and seeds, no for Dafny and Formulog. Whether bounded model checking terminates: yes with a bound (Apalache), no when the goal is unreachable and no bound is set (Programming Z3).
- **One voice.** Every statement about Alchemy is Alchemy's own. The docs page the pull request links, alchemy.run/domain/verifying-models, answered 404, so the pull request, the skill's testing reference, and the source code stand in for it. Every statement about what Lion has comes from one publisher, Lion's probes or Lion's docs.
- **Readings.** Several claims stretch their source a little, and a reader of the model should know which: Formulog's and Rosette's scoped constraints are read as "adding facts for the duration of a goal"; Z3's "big opaque steps" as proofs a small checker cannot recheck; the probe in which an unknown balance cannot be compared with 0 as "Lion has no proof that every change keeps an invariant"; and a Lion invariant's two assertion kinds, `none` and `some`, as "no rules about what must eventually happen".
- **Not read.** Four works had no readable text and are recorded without claims: Bjørner et al. 2015 (Horn clause solvers), Bradley 2011 (IC3), Sheeran et al. 2000 (k-induction), and Flanagan and Leino 2001 (Houdini). Each is covered through other sources by the same authors or that describe the same technique.
- **Assumptions.** All six beliefs held: Lion has no solver; it can search sequences in plain code; Alchemy's "proved" is one-step induction; an SMT solver can run in memory; a bounded search proves nothing past its bound; Lion's termination rule refuses rules that follow computed states. They came late: I wrote them into the model after the Lion probes had run and after reading Alchemy's pull request, though before the rest of the literature. The three about Lion are checks of what the probes showed, not predictions.
- **Not decided here.** Three things are left to a design decision with property tests, under the designing-features guideline: the surface (whether proofs are an `invariant` option, a form, or a library function), whether the solver lives in core or a module, and how open variables meet `find`'s sorted, finite results.

## Rebuild

From `research/`:

```bash
node ../skills/lion-research/scripts/replay.mjs
node ../packages/cli/dist/bin.mjs checks.json --database model.json
node ../skills/lion-research/scripts/build-explorer.mjs model.json --page runs/formal-verification/page.json --out runs/formal-verification/explorer.html
```

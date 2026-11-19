# Build plan: schemas that bind, the solver, and what it unlocks

The plan that came out of the consolidation run (`report.md` beside this file), agreed with the user on 2026-11-19 on branch `claude/lion-improvements-consolidation-30c193`. The user's words: "keep firmly grounded in these 4 steps and this build order and build it all." Keep this file current: mark each step's status and what it settled, so the work survives a long session.

**Permission given (2026-11-19):** the user allows changing the documented rule that "every variable in a filter, in a computed value, or in an input of a graph algorithm must first be bound by a relation goal, `=`, `in`, or `schema/fits?`" (logic guarantees, Safety). The change is recorded as a decision in `history/notes/` when it is made, since a breaking change follows a decision.

## The order

1. **A schema stands for every value it allows, starting with finite schemas.**
   - Today `["find", "?x", ["schema/fits?", "?x", ["schema/anyOf", 1, 2, 3]]]` is refused: `?x` must first be bound. The rule to write: a variable that a schema types counts as bound, and a finite schema lists its values, up to a size where it has many.
   - It delivers bounded search with inputs drawn from schemas: the formal-verification probes already search every sequence of up to six commands in plain Lion (`research/probes/fv-explore-code.json`); what they lack is a schema listing its values. Also the shortest breaking sequence, and a counterexample written as a program to run again.
   - It is the test oracle for step 2: over small domains the solver must give exactly what listing the values gives.
2. **The solver: the same rule for domains that cannot be listed.**
   - A filter over a variable that a schema types and no goal binds becomes a constraint. Decide only linear arithmetic (numbers, integers) and equality over JSON values; refuse anything else by name, so every question keeps one answer and evaluation keeps finishing.
   - `exists` and `find` give an example, which `why` shows; `not` becomes a proof for every value.
   - Lion already has most parts: the waiting rule keeps an expression over an unbound variable as a term, unknowns are symbolic values, the unifier decides equality, schemas type variables. Precedent: Rosette in Racket.
   - Properties check it against step 1's listing on bounded domains.
3. **Rules about what must eventually happen**, checked at the end of every sequence the bounded search explores.
4. **What the solver unlocks**, each close to one Lion question:
   - prove that every command keeps the invariants: is there a state the invariants allow, and an input, such that after `assuming` the command's change some invariant breaks? "No" is the proof;
   - decide when one schema includes another (the CIRT run's open idea);
   - find the invariants a proof needs (Houdini: drop candidates the induction step breaks, until the rest hold);
   - a certificate for every proof, which `why` shows and a small checker rechecks.

**Alongside, in other sessions the user started:** the research pages' bundled engine brought in line with the CLI ("Run research pages on the CLI's own engine"), and the hub-graph joins re-measured ("Re-measure hub-graph joins on the weights engine"). Later, when a use asks: annotated relations (top-k proofs, probabilities), a schema of valid programs and why-not trees as structured errors, and the unified-algebra run's open costs.

## How each step is done

Every step follows `AGENTS.md` and `CLAUDE.md`, and is committed on its own:
- read the guidelines it touches (`designing-features.md`, `testing.md`, `code-style.md`, `patterns.md`, `measuring.md`, `documentation.md`, `recording-changes.md`) before the work;
- one rule, not special cases; walk the feature through every existing feature, plain code and logic layer; add its cells to the interop grid (`packages/metrics/src/grid-cases.ts`);
- property tests (`it.prop` / `it.effect.prop`) against a simpler model, round trip, or equivalence; `bun run mutate --in <files>`;
- `bun run measure --against main`, `bun run bench --against main`, `bun run scale --against main`, reported as they are;
- a live `<lion-example>` in `packages/site-runtime/content/`, `bun run compare main --docs`, the search for sentences made untrue, `bun run --cwd packages/site-runtime docs`;
- claims in `history/notes/` (a decision record where a rule changes), `bun run history write`, `bun run history check`;
- the formal-verification probes run again under a new source id, so the research verdicts follow what was built;
- a proof recording under `out/proof/` (see the memory on proof recordings).

## Step 2 design (written before building it)

- **One rule with step 1.** A variable that a schema types stands for every value the schema allows. Step 1 lists them when they are finitely many. Step 2 keeps them as a symbolic value when they are not: `value/integer?` makes an integer variable, `value/number?` a real one, any other schema that cannot list (such as `value/string?`) a variable compared only by equality. A record or list schema with such parts makes a record or list of symbolic parts.
- **Filters become constraints.** A goal that is stuck only on symbolic variables joins one solver step at the end of the body: number comparisons and `=`/`number/equals?` over linear terms (`number/add`, `number/subtract`, `number/multiply` by a constant, `number/divide` by a constant, negation), equality and disequality of JSON values, `not` of those, and `cond`, `and`, `or`, `number/min`, `number/max`, `number/absolute` as case splits. A lambda the program defined is run on symbolic values by inlining its body. Anything else, such as a non-linear product or a string function on a symbolic string, is refused by name.
- **Decision procedure.** Exact rationals (BigInt). Real variables are eliminated by Fourier–Motzkin; integer variables by the Omega test (exact elimination, real and dark shadows, grey-shadow splinters), with equalities solved first and gcd normalization. Disequalities split. Every conjunction gets sat or unsat; nothing is "unknown".
- **What a body gives.** The solver step binds only the variables something after it needs: a rule's head, a query's answer, a find's template. If their solutions are finitely many (bounded integers) it binds each, which replaces a range schema; if infinitely many, it fails and says so. Variables nothing needs (a rule body's own, `exists`, a question under `not`) only need a solution to exist: the step keeps the answer once, and `why` shows an example. `not` over such a question is then a proof for every value.
- **Oracle.** Properties compare the solver with listing (step 1) and with brute force over small bounded integer domains, and check every witness by evaluating the goal with it.
- **Build in phases:** (a) `logic/solver.ts`, the decision procedure, with properties against brute force; (b) translating Lion terms into constraints, with case splits and lambda inlining; (c) the planner's solver step, needs, enumeration, `exists`/`not`, `why`; (d) records and lists of symbolic parts; (e) docs, the decision record for the rule change, measurements.

## Status

| Step | Status | Commit | What it settled |
|---|---|---|---|
| 1. Schemas stand for their values | done | d1f4b7a | `schema/fits?` binds its value when the schema lists finitely many (`logic/listing.ts`); `["schema/arrayOf", item, most]`; `value/boolean?`/`value/null?` list their values; a listing only where nothing else binds, at most 100,000; decision `history/notes/schemas-list-their-values.json`; properties `logic/tests/listing.test.ts` |
| 2. The solver | in progress | | |
| 3. Eventually rules | not started | | |
| 4. Proofs, inclusion, inference, certificates | not started | | |

# CLAUDE.md

Follow the developer guidelines in AGENTS.md:

@AGENTS.md

## Goals

Every change aims for the goals in "Goals for Every Change" in AGENTS.md. Integrate a new feature deeply, so it works with every existing feature in plain code and in the logic layer. Leave Lion simpler than you found it, in its code and in its semantics, without removing a feature. Give every new feature and every bug a property-based test. Be ambitious: prefer one rule that removes special cases to another special case, and do the deeper work that takes. Lion stays a JSON-based Lisp that evaluates entirely in memory, with semantics approximately those of Scheme and Racket.

## Complexity

Measure before you call a change to `@lionlang/core` done: `bun run measure --against main` for the code and the semantics, and `bun run bench --against main` for speed. Aim for the numbers to go down, and report them as they are, including the ones that went up. Add a new kind of expression, or a new place one can stand, to the interop grid in `packages/metrics/src/grid-cases.ts`; a cell that does not give what plain code gives is an exception to remove. See "Measuring Complexity" in AGENTS.md.

## Features and semantics

Keep the principle of least astonishment in mind whenever you consider a new feature or semantic. A feature should do what someone who knows Lion expects, both on its own and combined with every existing feature. Reuse the vocabulary and rules Lion already has. Walk through how the new behavior interacts with each existing feature. Point out existing surprises instead of building on them. See "Designing Features and Semantics" in AGENTS.md.

## Documentation

Use every new feature in at least one example in the docs, with output that was run, not typed. A core feature gets a live `<lion-example>` in `packages/site-runtime/content/`, where a reader would look for it, and the docs build fails when a special form or library function appears in no example; rebuild `docs/docs.html` with `bun run --cwd packages/site-runtime docs`. A skill's new relation, note field, or script gets an example in its `SKILL.md` or `references/`. Correct every documented result a change makes untrue. See "Documenting Every Feature" in AGENTS.md.

## Testing

Write property-based tests, not example-based unit tests. Use `it.prop` or `it.effect.prop` from `@effect/vitest` with Schemas or generators from `effect/Arbitrary`, and check behavior against a simpler model, a round trip, or an equivalence. Do not add tests with fixed example inputs (`it(...)` or `it.effect(...)`) for new behavior. When you find a bug, write the property it breaks, for every input and not only the one that failed, before you fix it. Run `bun run mutate` to confirm the properties fail on broken code. See "Write Property-Based Tests" in AGENTS.md for the details and an example.

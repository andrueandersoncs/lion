# CLAUDE.md

Follow the developer guidelines in AGENTS.md:

@AGENTS.md

AGENTS.md names a guideline in `guidelines/` for each kind of work. Read that guideline in full before you start the work it covers.

## Goals

Every change aims for the goals in "Goals for Every Change" in AGENTS.md. Integrate a new feature deeply, so it works with every existing feature in plain code and in the logic layer. Leave Lion simpler than you found it, in its code and in its semantics, without removing a feature. Give every new feature and every bug a property-based test. Be ambitious: prefer one rule that removes special cases to another special case, and do the deeper work that takes. Lion stays a JSON-based Lisp that evaluates entirely in memory, with semantics approximately those of Scheme and Racket.

## First principles

Reason about every task from what it is for, not from what exists: no format, file, kind, rule, or tool stays only because it is there. Before you undo something that looks intentional, such as a recorded decision, a documented rule, a schema, or a format others rely on, ask the user in a short question with your recommendation. Do not write long plans for approval.

## Complexity

Measure before you call a change to `@lionlang/core` done: `bun run measure --against main` for the code and the semantics, `bun run bench --against main` for speed, and `bun run scale --against main` for how time and memory grow with the facts. Aim for the numbers to go down, and report them as they are, including the ones that went up. Add a new kind of expression, or a new place one can stand, to the interop grid in `packages/metrics/src/grid-cases.ts`; a cell that does not give what plain code gives is an exception to remove. See `guidelines/measuring.md`.

## Features and semantics

Keep the principle of least astonishment in mind whenever you consider a new feature or semantic. A feature should do what someone who knows Lion expects, both on its own and combined with every existing feature. Reuse the vocabulary and rules Lion already has. Walk through how the new behavior interacts with each existing feature. Point out existing surprises instead of building on them. See `guidelines/designing-features.md`.

## Documentation

Use every new feature in at least one example in the docs, with output that was run, not typed. A core feature gets a live `<lion-example>` in `packages/site-runtime/content/`, where a reader would look for it, and the docs build fails when a special form or library function appears in no example; rebuild `docs/docs.html` with `bun run --cwd packages/site-runtime docs`. A skill's new relation, note field, or script gets an example in its `SKILL.md` or `references/`. Correct every documented result a change makes untrue. See `guidelines/documentation.md`.

After every change to what Lion does, run the documentation procedure in `guidelines/documentation.md`, in order: run the docs' programs with `bun run compare main --docs` and correct what differs; search `README.md`, `packages/site-runtime/content/`, and each skill's `SKILL.md` and `references/` for sentences the change made untrue; give each new feature its example; rebuild `docs/docs.html`, which also writes `packages/core/README.md` from the README; record the change, updating the claims in `history/notes/16-docs-head.json` that quote sentences you reworded; update AGENTS.md, the guidelines, and this file when a practice changed; and say in your report what the first two steps found.

## Changelog and decisions

Record every change and every design decision as claims in `history/notes/`, in the commit that makes it: each claim is words and what they say. A decision is a notes file with a title, its context, and claims for what it decides and what it asserts, which the model checks against Lion. Then run `bun run history write`, which writes `CHANGELOG.md`, `DECISIONS.md`, and `docs/changelog.html` from the model. Never edit those files by hand. A breaking change follows a decision. See `guidelines/recording-changes.md`.

## Research

Every research run adds to the one Lion model in `research/` and is committed with it, so runs compound instead of starting over.
- **Before you search**, rebuild the model and ask it what earlier runs found.
- **Reuse their names** for features, techniques, sources, and candidates.
- **Prove each conclusion** with a rule, over claims that quote a source or the output of a Lion program in `research/probes/`.
- **When Lion changes**, run the probes again under a new source id, so the verdicts follow Lion as it is now.

See `guidelines/researching.md` and `research/README.md`.

## Testing

Write property-based tests, not example-based unit tests. Use `it.prop` or `it.effect.prop` from `@effect/vitest` with Schemas or generators from `effect/Arbitrary`, and check behavior against a simpler model, a round trip, or an equivalence. Do not add tests with fixed example inputs (`it(...)` or `it.effect(...)`) for new behavior. When you find a bug, write the property it breaks, for every input and not only the one that failed, before you fix it. Run `bun run mutate` to confirm the properties fail on broken code. See `guidelines/testing.md` for the details and an example.

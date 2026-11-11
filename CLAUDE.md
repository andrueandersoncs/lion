# CLAUDE.md

Follow the developer guidelines in AGENTS.md:

@AGENTS.md

## Features and semantics

Keep the principle of least astonishment in mind whenever you consider a new feature or semantic. A feature should do what someone who knows Lion expects, both on its own and combined with every existing feature. Reuse the vocabulary and rules Lion already has. Walk through how the new behavior interacts with each existing feature. Point out existing surprises instead of building on them. See "Designing Features and Semantics" in AGENTS.md.

## Testing

Write property-based tests, not example-based unit tests. Use `it.prop` or `it.effect.prop` from `@effect/vitest` with Schemas or generators from `effect/Arbitrary`, and check behavior against a simpler model, a round trip, or an equivalence. Do not add tests with fixed example inputs (`it(...)` or `it.effect(...)`) for new behavior. See "Write Property-Based Tests" in AGENTS.md for the details and an example.

# Examples

Runnable examples for the current Lion evaluator and stdlib.

The example script demonstrates:

- arithmetic with the `number` module
- sequential evaluation with `begin` and `define`
- branching with `cond`
- collection transforms with `array/map`
- structural pattern matching with `match`
- host interop through injected JavaScript values and functions
- nested lookup with `object/get-path`
- TypeSafe AI Jev evaluation from a standalone Lion JSON program
- relations, recursive rules, negation, queries, and `why` explanations in `logic.json`
- schemas, patterns that take data apart, and a relation that refuses rows that do not fit in `schemas.json`

## Run

From the repo root:

```bash
bun run packages/examples/index.ts
```

Run the logic example:

```bash
bun run --cwd packages/examples logic
```

Run the schemas example:

```bash
bun run --cwd packages/examples schemas
```

Run the Jev example with the API key stored in `packages/typesafe-ai/.env`:

```bash
bun run --cwd packages/examples jev
```

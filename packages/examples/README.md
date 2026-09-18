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

## Run

From the repo root:

```bash
bun run packages/examples/index.ts
```

Run the Jev example with the API key stored in `packages/typesafe-ai/.env`:

```bash
bun run --cwd packages/examples jev
```

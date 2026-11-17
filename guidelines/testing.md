# Testing Guidelines

Part of Lion's developer guidelines, which start in [AGENTS.md](../AGENTS.md).

## Test Framework
- **Framework**: Vitest with @effect/vitest
- **Test files**: `src/**/*.test.ts` pattern
- **Test runner**: `vitest run` for CI, `vitest` for watch mode

## Write Property-Based Tests

> **IMPORTANT**: Write property-based tests, not example-based unit tests. Do not add tests with fixed example inputs (`it(...)` or `it.effect(...)`) for new behavior. Every new feature, and every bug you come across, gets a property.

A property-based test states something that holds for every input a generator produces. The runner checks it against many generated inputs (100 by default), and shrinks any failing input to a small counterexample.

- Use `it.prop` for synchronous properties and `it.effect.prop` for Effect properties, both from `@effect/vitest`. Pass the inputs as Schemas, or as generators from `effect/Arbitrary` (`Arbitrary.schema`, `array`, `all`, `map`, `flatMap`, `filter`).
- Check behavior against something independent of the code under test:
  - a simpler model, such as the same change made without invariants, or a count computed with a `Set`
  - a round trip, such as save, load, and save again
  - an equivalence, such as two ways of computing the same answer

  A property that restates the implementation proves little.
- Shape generators so they reach the interesting cases, then confirm they do. Sample with `Arbitrary.sampleEffect` and count which branches the generated inputs take.
- Cover every case of a new feature: each form it adds, each place the form can stand, and each existing feature it meets. If you cannot name a property for a case, the case is not specified yet.
- Turn every bug into a property. When you find a bug, in your own change or in old code, first write the property it breaks. State it for every input, not for the one input that failed, and watch it fail. Then fix the bug, and keep the property.
- Make sure each property can fail: break the code it covers on purpose, and confirm the property catches it. `bun run mutate` does this for the breaks listed in `packages/metrics/src/mutations.ts`. Add a mutation for each behavior you add, and add a property for any mutation it reports as `MISSED`.
- Before you finish a change to the evaluator or the logic engine, run its properties once with a few thousand runs each, by raising `runs`, and then put the number back.
- Keep a domain's generators in a module next to its tests and reuse them across files, as `packages/core/src/logic/tests/programs.ts` does for logic programs. A generator can carry its own model: `packages/core/src/logic/tests/shapes.ts` generates a schema as a description that is written out as Lion and read by a plain TypeScript model of what fits it.
- When a property rarely reaches its interesting cases, raise its runs with the fourth argument, `{ arbitrary: { runs: 300 } }`. A failure prints a `Replay` token; pass it back as `{ arbitrary: { replay } }` to reproduce that exact run.

```typescript
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";

const small = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: -100, maximum: 100 }))
);

describe("number/add", () => {
  it.effect.prop("does not depend on argument order", { a: small, b: small }, ({ a, b }) =>
    Effect.gen(function* () {
      expect(yield* run(["number/add", a, b], stdlib)).toBe(
        yield* run(["number/add", b, a], stdlib)
      );
    })
  );
});
```

## Running Single Tests
- Run specific test file: `bunx vitest run path/to/test.test.ts`
- Run tests matching pattern: `bunx vitest run --reporter=verbose "pattern"`
- Run with coverage: `bunx vitest run --coverage`

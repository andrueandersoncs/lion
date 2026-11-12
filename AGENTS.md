# AGENTS.md - Developer Guidelines for Lion Project

This document provides essential information for AI coding agents working on the Lion project, including build commands, testing procedures, and code style guidelines.

## Project Overview

Lion is a TypeScript monorepo with two main packages:
- **@lionlang/core**: Core library built with Effect v4 for functional programming
- **@lionlang/repl**: React-based web application using TanStack Router and Vite

## Designing Features and Semantics

> **IMPORTANT**: Follow the principle of least astonishment. Before adding a feature or changing how something behaves, ask what someone who already knows Lion would expect it to do, both on its own and combined with every existing feature. Then make it do that.

Lion's value comes from features that compose, so one surprising interaction costs more than a missing feature.

- **Reuse what exists.** Build a new feature out of vocabulary Lion already has before inventing more. For example, invariants take the query option `"assert"` instead of a new keyword, and report failures in the same words as a failed query assertion.
- **Apply one rule everywhere.** When a feature needs a rule, look for a similar feature that already has one and follow it. If the existing rule falls short, change it for every feature at once rather than letting the new one differ. For example:
  - Every form that changes the logic database either makes all of its changes or none.
  - Adding something the database already holds changes nothing, whether it is a fact, a relation, a rule, or an invariant.
- **Walk through the combinations.** Surprises hide where two features meet. Before settling a behavior, trace how it interacts with each existing one. For the logic layer, that includes:
  - logic variables and `quote`
  - everything that waits for a logic variable: function calls, `cond`, `match`, `eval`, records, and lambdas passed to a waiting call
  - `define`, and the fresh environment each `run` gets
  - recursion and negation
  - aggregates and keyed relations
  - graph algorithms
  - goal-directed queries and `why`
  - snapshots and the CLI's `--database` file
- **Keep equivalent programs equivalent.** These pairs should behave the same:
  - a program and its snapshot
  - goal-directed and full evaluation
  - a name and the value bound to it
  - an expression over a logic variable and the same expression with the variable's value in its place

  Where results may differ, such as answer order without the `"order"` query option, say so in the docs.
- **Don't build on surprising behavior.** When existing behavior would astonish a user, such as a failed form leaving partial changes behind, point it out and fix it, or propose a fix, instead of working around it.
- **Pin the expectation down.** State the behavior users expect as a property and test it (see [Write Property-Based Tests](#write-property-based-tests)), so a later change can't quietly break it.
- **Document how features combine.** Describe each feature's semantics in the README, including what it does alongside the features it touches.

## Build, Lint, and Test Commands

All commands should be run from the root directory using Turbo:

> **IMPORTANT**: NEVER use `npx` or `npm` commands. Use `bun` or `turbo` instead.

```bash
# Install dependencies for all workspaces
bun install

# Run all tests across all packages
bun run test

# Build all packages
bun run build

# Run linting and formatting check (ultracite)
bun run check

# Fix linting and formatting issues
bun run fix

# Prepare development environment (Effect language service)
bun run prepare
```

### Package-Specific Commands

For running commands in a specific package, use Turbo's filter syntax:

```bash
# Run tests for a specific package
turbo test --filter=@lionlang/core
turbo test --filter=@lionlang/repl

# Run dev server for repl package
turbo dev --filter=@lionlang/repl

# Run typecheck for core package
turbo typecheck --filter=@lionlang/core
```

## Testing Guidelines

### Test Framework
- **Framework**: Vitest with @effect/vitest
- **Test files**: `src/**/*.test.ts` pattern
- **Test runner**: `vitest run` for CI, `vitest` for watch mode

### Write Property-Based Tests

> **IMPORTANT**: Write property-based tests, not example-based unit tests. Do not add tests with fixed example inputs (`it(...)` or `it.effect(...)`) for new behavior.

A property-based test states something that holds for every input a generator produces. The runner checks it against many generated inputs (100 by default), and shrinks any failing input to a small counterexample.

- Use `it.prop` for synchronous properties and `it.effect.prop` for Effect properties, both from `@effect/vitest`. Pass the inputs as Schemas, or as generators from `effect/Arbitrary` (`Arbitrary.schema`, `array`, `all`, `map`, `flatMap`, `filter`).
- Check behavior against something independent of the code under test:
  - a simpler model, such as the same change made without invariants, or a count computed with a `Set`
  - a round trip, such as save, load, and save again
  - an equivalence, such as two ways of computing the same answer

  A property that restates the implementation proves little.
- Shape generators so they reach the interesting cases, then confirm they do. Sample with `Arbitrary.sampleEffect` and count which branches the generated inputs take.
- Make sure each property can fail: break the code it covers on purpose, and confirm the property catches it.
- Keep a domain's generators in a module next to its tests and reuse them across files, as `packages/core/src/logic/tests/programs.ts` does for logic programs.
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

### Running Single Tests
- Run specific test file: `bunx vitest run path/to/test.test.ts`
- Run tests matching pattern: `bunx vitest run --reporter=verbose "pattern"`
- Run with coverage: `bunx vitest run --coverage`

## Code Style Guidelines

### TypeScript Configuration
- **Target**: ESNext
- **Module**: NodeNext
- **JSX**: react-jsx
- **Strict mode**: Enabled
- **Key flags**:
  - `exactOptionalPropertyTypes: true`
  - `noFallthroughCasesInSwitch: true`
  - `noUncheckedIndexedAccess: true`
  - `noImplicitOverride: true`
  - `verbatimModuleSyntax: true`

### Biome Formatting/Linting
- **Indentation**: Tabs (not spaces)
- **Quote style**: Double quotes (`"`)
- **Import organization**: Automatic (enabled)
- **Files to format**: `src/**/*`, `.vscode/**/*`, `index.html`, `vite.config.js`
- **Ignored files**: `src/routeTree.gen.ts`, `src/styles.css`

### Import Organization
Imports are automatically organized by Biome. Manual organization follows:
```typescript
// Effect imports first
import { Effect, Schema, flow } from "effect";
import { dual } from "effect/Function";

// External dependencies
import React from "react";

// Internal imports
import { localModule } from "./localModule";

// Type-only imports
import type { SomeType } from "./types";
```

### Naming Conventions

#### Variables and Functions
- **camelCase** for variables, functions, and methods
- **PascalCase** for classes, interfaces, and type aliases
- **SCREAMING_SNAKE_CASE** for constants

#### Files
- **kebab-case** for file names: `user-profile.ts`, `auth-service.ts`
- **index.ts** for barrel exports
- Test files: `*.test.ts`

### Effect.js Patterns

#### Function Definitions
```typescript
// Pure functions
const add = (a: number, b: number) => a + b;

// Effect-returning functions
const divide = (a: number, b: number) =>
  b === 0 ? Effect.fail(new Error("Division by zero")) : Effect.succeed(a / b);

// Dual functions (data-first/last)
const dual = (args: unknown[], options?: Options) =>
  Effect.succeed(process(args, options));
```

#### Schema Validation
```typescript
const validateNumber = Schema.decodeUnknownEffect(Schema.Number);
const validateTuple = Schema.decodeUnknownEffect(
  Schema.Tuple([Schema.Number, Schema.Number])
);
```

#### Flow Composition
```typescript
export const operation = flow(
  (...args: unknown[]) => args,
  Schema.decodeUnknownEffect(SomeSchema),
  Effect.map(processData)
);
```

### React/TypeScript Patterns

#### Component Definitions
```typescript
interface Props {
  title: string;
  onClick?: () => void;
}

function MyComponent({ title, onClick }: Props) {
  return (
    <div>
      <h1>{title}</h1>
      {onClick && <button onClick={onClick}>Click me</button>}
    </div>
  );
}
```

#### Effect Integration
```typescript
// Using effects in components
const [data, setData] = useState<unknown>(null);

useEffect(() => {
  Effect.runPromise(operation())
    .then(setData)
    .catch(console.error);
}, []);
```

### Error Handling

#### Effect.js Error Handling
```typescript
// Fail with specific errors
const operation = (value: unknown) =>
  typeof value === "number"
    ? Effect.succeed(value * 2)
    : Effect.fail(new TypeError("Expected number"));

// Catch and handle errors
const safeOperation = Effect.catch(operation, (error) =>
  Effect.succeed(`Error: ${error.message}`)
);
```

#### React Error Boundaries
```typescript
class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Component error:", error, info);
  }

  render() {
    return this.state.hasError ? <ErrorFallback /> : this.props.children;
  }
}
```

### Shadcn/UI Integration

When adding new UI components:
```bash
# Use bunx (as specified in .cursorrules)
bunx shadcn@latest add button
bunx shadcn@latest add dialog
```

Components follow the established patterns in the codebase and integrate with:
- Tailwind CSS for styling
- Radix UI primitives
- Class Variance Authority for component variants

### File Organization

#### Core Package Structure
```
packages/core/
├── src/
│   ├── evaluation/
│   ├── modules/
│   │   ├── tests/
│   │   └── *.ts
│   └── index.ts
├── vitest.config.ts
└── package.json
```

#### REPL Package Structure
```
packages/repl/
├── src/
│   ├── routes/
│   ├── components/
│   ├── styles.css
│   └── index.html
├── biome.json
├── vite.config.ts
└── package.json
```

### Commit Guidelines

- Use conventional commit format when possible
- Run tests and linting before committing
- Ensure type checking passes
- For multi-package changes, test both packages

### Development Workflow

1. **Before coding**: Run `bun install` and `bun run prepare`
2. **During development**: Use `turbo dev --filter=@lionlang/repl` for REPL development
3. **Before committing**:
   - Run `bun run check`
   - Run `bun test`
   - Run `bun run build`
4. **After changes**: Update this AGENTS.md if development practices change

### Completion Proof

- After completing any development task where any app behavior is changed, **you MUST capture a screen recording** that demonstrates the delivered behavior working as intended.
- For UI work, record the actual application and exercise the changed interaction end to end.
- For CLI, backend, configuration, or documentation work, record the relevant terminal command, runtime scenario, or rendered artifact and its successful result.
- Screenshots, logs, and automated tests may supplement the recording but never replace it.
- Provide the recording artifact with the final response. Do not claim completion without it.
- Do not commit proof into git.


### Performance Considerations

- Use Effect.js for complex async operations and error handling
- Leverage React's optimization features (memo, useCallback, useMemo)
- Profile with TanStack Devtools (included in development)
- Use Vite's fast HMR for development

### Security Guidelines

- Validate all inputs using Effect Schemas
- Handle errors gracefully without exposing internal details
- Use TypeScript's strict mode to catch type-related issues
- Follow Effect.js patterns for safe computation

---

*This document should be updated whenever development practices, tooling, or code standards change in the Lion project.*
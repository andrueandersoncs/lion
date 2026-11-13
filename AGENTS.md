# AGENTS.md - Developer Guidelines for Lion Project

This document provides essential information for AI coding agents working on the Lion project, including build commands, testing procedures, and code style guidelines.

## Project Overview

Lion is a TypeScript monorepo with two main packages:
- **@lionlang/core**: Core library built with Effect v4 for functional programming
- **@lionlang/repl**: React-based web application using TanStack Router and Vite

It also holds **@lionlang/metrics**, private tools that measure Lion's complexity, speed, and tests (see [Measuring Complexity](#measuring-complexity)).

## Goals for Every Change

> **IMPORTANT**: These goals apply to every feature, fix, and refactor. Treat the codebase as your own: leave Lion more unified, simpler, and better tested than you found it.

What Lion is does not change:

- Lion MUST be a JSON-based Lisp: every program is valid JSON.
- A Lion program MUST be able to be evaluated entirely in memory.
- The semantics are approximately those of Scheme and Racket, plus the logic layer.

Every change aims for these:

1. **Integrate deeply.** A new feature works together with every existing feature when it ships, in plain code and in the logic layer. The logic features and the Lisp features are one language: an expression gives in a rule, a query, a `find`, or anywhere else what it gives in plain code. A feature that works only on its own is not finished. See [Designing Features and Semantics](#designing-features-and-semantics).
2. **Reduce complexity.** Each change should leave Lion simpler, in its code and in its semantics, without removing a feature. Before adding a special case, look for one rule that replaces several. Measure before and after, and aim for the numbers to go down. See [Measuring Complexity](#measuring-complexity).
3. **Test with properties.** Every new feature and every bug you come across gets property-based tests that fail without your change. See [Write Property-Based Tests](#write-property-based-tests).
4. **Be ambitious.** When the unified design needs deeper work, do that work: research how other languages solved the problem, design a new algorithm, or rewrite the part of the engine that stands in the way. A larger change that removes exceptions is better than a smaller one that adds them.
5. **Report what you measured.** Give the numbers as they are, including the complexity that grew, the benchmark that got slower, and the exception that remains, and say why.

## Designing Features and Semantics

> **IMPORTANT**: Follow the principle of least astonishment. Before adding a feature or changing how something behaves, ask what someone who already knows Lion would expect it to do, both on its own and combined with every existing feature. Then make it do that.

Lion's value comes from features that compose, so one surprising interaction costs more than a missing feature.

- **Reuse what exists.** Build a new feature out of vocabulary Lion already has before inventing more. For example:
  - Invariants take the query option `"assert"` instead of a new keyword, and report failures in the same words as a failed query assertion.
  - The schema of a relation's rows is the invariant a program could write by hand, so it is kept, reported, and saved like any other.
  - A schema check is an ordinary function call, so the waiting and asking rules carry it into rules, `not`, `find`, and rule heads with no rule of its own.
  - A pattern is a schema with logic variables in it, so what takes data apart is what checks it: a record, a list, and every `schema` function.
- **Apply one rule everywhere.** When a feature needs a rule, look for a similar feature that already has one and follow it. If the existing rule falls short, change it for every feature at once rather than letting the new one differ. For example:
  - Every form that changes the logic database either makes all of its changes or none.
  - Adding something the database already holds changes nothing, whether it is a fact, a relation, a rule, or an invariant.
  - Whatever needs the value of a logic variable waits for it, and whatever needs the value of a goal asks it, in every form and function.
  - Whatever checks a value against a schema asks whether the value fits, by one rule: `match`, the `schema` functions, a schema's own parts, the arguments of a relation call, and the schema of a relation's rows.
  - A logic variable in a schema is its value once it is bound, and takes the value it meets until then, in every goal that can bind: `schema/fits?`, a relation call, `=`, and `in`.
- **Walk through the combinations.** Surprises hide where two features meet. Before settling a behavior, trace how it interacts with each existing one. For the logic layer, that includes:
  - logic variables and `quote`
  - everything that waits for a logic variable: function calls, `cond`, `match`, `eval`, records, and lambdas passed to a waiting call
  - everything that asks a question: `not`, `find`, and a goal used as a value, in plain code and inside a rule, with variables of its own
  - schemas: predicates, relations as schemas, named schemas and the shapes that name themselves or each other, and the schema of a relation's rows
  - patterns: variables in a record, a list, or a `schema` function, bound by `schema/fits?`, a relation call, `=`, and `in`, and a variable that holds a schema
  - names: a string that is bound, one that is data, and one that reads as a misspelled name
  - `define`, and the fresh environment each `run` gets
  - recursion and negation
  - aggregates and keyed relations
  - graph algorithms
  - goal-directed queries and `why`
  - snapshots and the CLI's `--database` file
- **Add it to the interop grid.** The grid in `packages/metrics/src/grid-cases.ts` runs every kind of expression in every place an expression can stand, and compares each with plain code. Add a row for a new kind of expression and a column for a new place, then run `bun run measure --grid`. A cell that does not give what plain code gives is an exception users have to remember: change the feature until the cell agrees, or, when the exception is the right design, document it and list it in `KNOWN`.
- **Keep equivalent programs equivalent.** These pairs should behave the same:
  - a program and its snapshot
  - goal-directed and full evaluation
  - a name and the value bound to it
  - an expression over a logic variable and the same expression with the variable's value in its place
  - a question asked in a rule and the same question asked in plain code with the rule's variables bound
  - a database that has derived rows for earlier queries and one that has derived nothing yet
  - a schema and the name it is declared under
  - a goal that binds through a pattern and the same goal with its variables bound first
  - a relation call with a schema among its arguments and the same call followed by `schema/fits?`
  - the schema of a relation's rows and the invariant it stands for
  - an invariant asked about the rows a change added and the same invariant asked in full

  Where results may differ, such as answer order without the `"order"` query option, say so in the docs.
- **Don't build on surprising behavior.** When existing behavior would astonish a user, such as a failed form leaving partial changes behind, point it out and fix it, or propose a fix, instead of working around it.
- **Pin the expectation down.** State the behavior users expect as a property and test it (see [Write Property-Based Tests](#write-property-based-tests)), so a later change can't quietly break it.
- **Document how features combine.** Describe each feature's semantics in the README, including what it does alongside the features it touches.

## Measuring Complexity

> **IMPORTANT**: Measure every change to `@lionlang/core` before you call it done, in the code and in the semantics, and aim for both to go down. Put the numbers in your final report and in the commit message, also when they went up.

`packages/metrics` holds the tools, and its README explains each number. Run them from the root. `--against` takes any commit: `main`, a tag, or a hash.

```bash
# Code and semantic complexity of the working tree, beside main
bun run measure --against main

# The same with every file, or with the whole interop grid
bun run measure --against main --files
bun run measure --grid

# Speed, beside main
bun run bench --against main

# Break the code in each listed place and check that the tests notice
bun run mutate

# Run the same programs on main and on the working tree
bun run compare main programs.json
```

- **Code complexity** is counted from the source of `@lionlang/core` without its tests: code lines, functions, paths through functions, decisions weighted by how deep they nest, and `instanceof` tests of a value's kind.
- **Semantic complexity** is how much a Lion programmer has to know: the special forms, library functions, and kinds of error; the distinct messages that tell a program it broke a rule; and the exceptions in the interop grid, the cells where an expression in some place does not give what plain code gives.

How to use the numbers:

- **Pay for what you add.** A feature usually adds code. Pay for it in the same change: find the rule that makes special cases redundant, and delete them. The waiting rule and the asking rule each replaced a list of cases this way.
- **Keep the grid's exceptions at the documented ones.** A new exception fails the tests of `packages/metrics`. Fix the feature rather than add to `KNOWN`.
- **Never buy a lower number with a worse Lion.** Do not remove a feature, a test, or a message a user needs, and do not squeeze code until it is hard to read.
- **Check the speed.** Run `bun run bench --against main` twice, since times move by a few percent between runs, and report any benchmark that got slower.
- **Check what you say about behavior.** Before you write that a change fixes, breaks, or keeps something, in a changelog or a report, put the program in a file and run `bun run compare`.
- **Do not edit code while `bun run mutate` runs.** It rewrites source files while their tests run, then puts them back.

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

# Measure complexity, speed, and how well the tests catch broken code
bun run measure --against main
bun run bench --against main
bun run mutate
```

### Package-Specific Commands

For running commands in a specific package, use Turbo's filter syntax:

```bash
# Run tests for a specific package
turbo test --filter=@lionlang/core
turbo test --filter=@lionlang/repl
turbo test --filter=@lionlang/metrics

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

#### Metrics Package Structure
```
packages/metrics/
├── src/
│   ├── tests/
│   ├── grid-cases.ts   # the interop grid's rows, columns, and known exceptions
│   ├── mutations.ts    # the breaks `bun run mutate` checks
│   ├── benchmarks.ts   # the programs `bun run bench` times
│   └── *.ts
├── measure.ts
├── bench.ts
├── mutate.ts
├── compare.ts
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
- For a change to `@lionlang/core`, state the measured change in complexity and speed in the commit message
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
   - For a change to `@lionlang/core`, run `bun run measure --against main` and `bun run bench --against main`, and `bun run mutate` when you added behavior
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
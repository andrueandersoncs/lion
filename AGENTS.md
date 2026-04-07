# AGENTS.md - Developer Guidelines for Lion Project

This document provides essential information for AI coding agents working on the Lion project, including build commands, testing procedures, and code style guidelines.

## Project Overview

Lion is a TypeScript monorepo with two main packages:
- **@lionlang/core**: Core library built with Effect.js for functional programming
- **@lionlang/repl**: React-based web application using TanStack Router and Vite

## Build, Lint, and Test Commands

All commands should be run from the root directory using Turbo:

> **IMPORTANT**: NEVER use `npx` or `npm` commands. Use `bun` or `turbo` instead.

```bash
# Install dependencies for all workspaces
bun install

# Run all tests across all packages
bun test

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

### Testing Patterns
```typescript
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

describe("moduleName", () => {
  it("should perform operation", () => {
    expect(Effect.runSync(operation())).toBe(expectedResult);
  });

  it("should handle errors", () => {
    expect(() => Effect.runSync(failingOperation())).toThrow();
  });
});
```

### Running Single Tests
- Run specific test file: `npx vitest run path/to/test.test.ts`
- Run tests matching pattern: `npx vitest run --reporter=verbose "pattern"`
- Run with coverage: `npx vitest run --coverage`

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
const validateNumber = Schema.decodeUnknown(Schema.Number);
const validateTuple = Schema.decodeUnknown(
  Schema.Tuple(Schema.Number, Schema.Number)
);
```

#### Flow Composition
```typescript
export const operation = flow(
  (...args: unknown[]) => args,
  Schema.decodeUnknown(SomeSchema),
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
const safeOperation = Effect.catchAll(operation, (error) =>
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

*This document should be updated whenever development practices, tooling, or code standards change in the Lion project.*</content>
<parameter name="filePath">AGENTS.md
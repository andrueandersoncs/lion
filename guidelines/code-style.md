# Code Style Guidelines

Part of Lion's developer guidelines, which start in [AGENTS.md](../AGENTS.md).

## TypeScript Configuration
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

## Biome Formatting/Linting
- **Indentation**: Tabs (not spaces)
- **Quote style**: Double quotes (`"`)
- **Import organization**: Automatic (enabled)
- **Files to format**: `src/**/*`, `.vscode/**/*`, `index.html`, `vite.config.js`
- **Ignored files**: `src/routeTree.gen.ts`, `src/styles.css`

## Import Organization
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

## Naming Conventions

### Variables and Functions
- **camelCase** for variables, functions, and methods
- **PascalCase** for classes, interfaces, and type aliases
- **SCREAMING_SNAKE_CASE** for constants

### Files
- **kebab-case** for file names: `user-profile.ts`, `auth-service.ts`
- **index.ts** for barrel exports
- Test files: `*.test.ts`

## File Organization

### Core Package Structure
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

### Metrics Package Structure
```
packages/metrics/
├── src/
│   ├── tests/
│   ├── grid-cases.ts   # the interop grid's rows, columns, and known exceptions
│   ├── mutations.ts    # the breaks `bun run mutate` checks
│   ├── benchmarks.ts   # the programs `bun run bench` times
│   ├── workloads.ts    # the workloads `bun run scale` times at growing sizes
│   └── *.ts
├── measure.ts
├── bench.ts
├── scale.ts
├── mutate.ts
├── compare.ts
└── package.json
```

### REPL Package Structure
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

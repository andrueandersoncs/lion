# Effect and React Patterns

Part of Lion's developer guidelines, which start in [AGENTS.md](../AGENTS.md).

## Effect.js Patterns

### Function Definitions
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

### Schema Validation
```typescript
const validateNumber = Schema.decodeUnknownEffect(Schema.Number);
const validateTuple = Schema.decodeUnknownEffect(
  Schema.Tuple([Schema.Number, Schema.Number])
);
```

### Flow Composition
```typescript
export const operation = flow(
  (...args: unknown[]) => args,
  Schema.decodeUnknownEffect(SomeSchema),
  Effect.map(processData)
);
```

## React/TypeScript Patterns

### Component Definitions
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

### Effect Integration
```typescript
// Using effects in components
const [data, setData] = useState<unknown>(null);

useEffect(() => {
  Effect.runPromise(operation())
    .then(setData)
    .catch(console.error);
}, []);
```

## Error Handling

### Effect.js Error Handling
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

### React Error Boundaries
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

## Shadcn/UI Integration

When adding new UI components:
```bash
# Use bunx
bunx shadcn@latest add button
bunx shadcn@latest add dialog
```

Components follow the established patterns in the codebase and integrate with:
- Tailwind CSS for styling
- Radix UI primitives
- Class Variance Authority for component variants

## Performance Considerations

- Use Effect.js for complex async operations and error handling
- Leverage React's optimization features (memo, useCallback, useMemo)
- Profile with TanStack Devtools (included in development)
- Use Vite's fast HMR for development

## Security Guidelines

- Validate all inputs using Effect Schemas
- Handle errors gracefully without exposing internal details
- Use TypeScript's strict mode to catch type-related issues
- Follow Effect.js patterns for safe computation

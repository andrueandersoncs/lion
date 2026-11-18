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

### Compiled Evaluation
Lion compiles an expression, in `packages/core/src/evaluation/`, to a function of the scope it runs in (`Compiled` in `evaluation/compiled.ts`). A lambda's body is compiled the first time the lambda is called and kept with it, so code that runs again runs compiled; nothing else keeps compiled code. A special form's compiler compiles its parts when it is compiled, and returns a function that runs in direct style:

- It returns the form's value, or a `Pending` that holds the rest of the evaluation as an Effect. Return a `Pending` only where a node needs Effect: a host function's Effect that is not done yet, a question, a call that waits, an error. Never return an Effect as a value.
- Go on from a part with `andThen(result, depth, next)` and run several in order with `runAll`, so a part that needs Effect makes only what follows it run in Effect. Call a function's result through `returned`, which takes a finished Effect's value right away and runs any other in the scope of the call.
- Pass `depth` on unchanged. Only a call to a Lion function goes one deeper, and past `DEEPEST` it starts again at the bottom of the stack.
- Give a part that is in tail position back as it is, without `andThen`, so a loop of tail calls keeps nothing.
- A library function returns a finished Effect when it can: decode its arguments with `decode` and combine with `Effect.flatMapEager` or `Effect.mapEager`, as `over` does.
- Add the new form to the model in `evaluation/tests/interpreter.ts` too: the compiled evaluator is checked against it.

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

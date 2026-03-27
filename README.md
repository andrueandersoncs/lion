# Lion

Lion is a JSON-based Lisp. All code is valid JSON, and all JSON is valid Lion code.

Expressions are evaluated using Lisp-style prefix notation, where arrays represent function calls and objects evaluate their values. The result is a language that is serializable, homoiconic, and trivially parseable by any system that can read JSON.

## Usage

### Basic Evaluation

```typescript
import { Effect } from "effect";
import { run } from "@lion/core/evaluation";
import { stdlib } from "@lion/core/modules";

const result = await Effect.runPromise(
  run(["math/+", 1, 2], stdlib)
);
// => 3
```

### Custom Environment

Extend the standard library with your own bindings. Strings in expressions resolve against the environment, so bound values can be referenced by name:

```typescript
import { Effect } from "effect";
import { run } from "@lion/core/evaluation";
import { stdlib } from "@lion/core/modules";

const result = await Effect.runPromise(
  run(
    ["math/+", "price", ["math/*", "price", "tax-rate"]],
    { ...stdlib, "tax-rate": 0.08, "price": 100 }
  )
);
// => 108
```

### Evaluating JSON from an External Source

Because Lion programs are plain JSON, they can be loaded from files, APIs, or databases:

```typescript
import { Effect } from "effect";
import { run } from "@lion/core/evaluation";
import { stdlib } from "@lion/core/modules";

const program = JSON.parse(`
  ["logic/if", ["math/>", "score", 90],
    "pass",
    "fail"]
`);

await Effect.runPromise(run(program, { ...stdlib, "score": 95 }));
// => "pass"

await Effect.runPromise(run(program, { ...stdlib, "score": 80 }));
// => "fail"
```

### Evaluating Records

Objects evaluate their values while preserving keys, making it easy to compute multiple results at once:

```typescript
import { Effect } from "effect";
import { run } from "@lion/core/evaluation";
import { stdlib } from "@lion/core/modules";

const env = { ...stdlib, "x": 10, "y": 20 };

const result = await Effect.runPromise(
  run({
    "sum": ["math/+", "x", "y"],
    "product": ["math/*", "x", "y"],
    "gt": ["math/>", "x", "y"],
  }, env)
);
// => { sum: 30, product: 200, gt: false }
```

## Expressions

Lion has three expression types:

**Primitives** — numbers, booleans, and `null` evaluate to themselves. Strings are looked up as references in the environment; if no binding is found, the string evaluates to itself.

```json
42
true
null
"x"
```

**Arrays** — an array with a string as its first element is a function call. The remaining elements are the arguments. All elements are evaluated before the function is applied.

```json
["math/+", 1, 2]
```

An array without a string head evaluates each of its elements and returns the resulting array:

```json
[1, ["math/+", 2, 3], true]
```

Evaluates to `[1, 5, true]`.

**Objects** — each value in the object is evaluated; keys are preserved.

```json
{
  "sum": ["math/+", 1, 2],
  "flag": true
}
```

Evaluates to `{ "sum": 3, "flag": true }`.

## Special Forms

### `quote`

Returns its argument unevaluated.

```json
["quote", ["math/+", 1, 2]]
```

Evaluates to `["math/+", 1, 2]`.

### `eval`

Evaluates its argument, then evaluates the result.

```json
["eval", ["quote", ["math/+", 1, 2]]]
```

Evaluates to `3`.

## Standard Library

Functions are namespaced with `/`.

### `math`

```json
["math/+", 1, 2]       // 3
["math/-", 10, 3]          // 7
["math/*", 5, 4]           // 20
["math//", 20, 4]          // 5
["math/=", 5, 5]           // true
["math/<", 3, 5]           // true
["math/>", 5, 3]           // true
["math/<=", 3, 5]          // true
["math/>=", 5, 5]          // true
```

### `logic`

```json
["logic/not", true]                // false
["logic/and", true, false]         // false
["logic/or", false, true]          // true
["logic/if", true, "yes", "no"]    // "yes"
```

### `list`

```json
["list/list", 1, 2, 3]            // [1, 2, 3]
["list/head", [1, 2, 3]]          // 1
["list/tail", [1, 2, 3]]          // [2, 3]
["list/length", [1, 2, 3]]        // 3
["list/concat", [1, 2], [3, 4]]   // [1, 2, 3, 4]
```

### `object`

```json
["object/get", {"a": 1}, "a"]     // 1
["object/keys", {"a": 1, "b": 2}] // ["a", "b"]
["object/values", {"a": 1}]       // [1]
```

### `func`

```json
["func/identity", 42]             // 42
```

## Nested Expressions

Expressions compose naturally. Arguments to function calls are themselves expressions, evaluated before application:

```json
["math/+", ["math/*", 3, 4], ["math/-", 10, 5]]
```

Evaluates to `17`.

```json
["logic/if", ["math/<", 1, 2],
  ["math/+", 10, 20],
  ["math/*", 10, 20]]
```

Evaluates to `30`.

## Environment

Evaluation runs against an environment — a map of string names to values. The standard library populates this environment with the built-in functions. Strings in expressions resolve against the environment, so user-defined bindings work the same way:

```json
"x"
```

If the environment contains `{ "x": 10 }`, this evaluates to `10`. If `"x"` is not bound, it evaluates to `"x"`.

## Implementation

Lion is implemented in TypeScript with [Effect](https://effect.website). The evaluator is built with `Match` for pattern-based dispatch, `Schema` for runtime type validation of function arguments, and Effect's service system for dependency-injected environments.

```
packages/
  core/     # evaluator, standard library, schemas
  repl/     # interactive REPL
```

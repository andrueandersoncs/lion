# Lion

Lion is a JSON-based Lisp. Every Lion program is valid JSON, which makes it easy to serialize, store, inspect, and generate from other systems.

The evaluator runs on Effect v4.

Lion evaluates:

- JSON primitives directly
- strings as environment references when a binding exists
- arrays as special forms or function-call expressions
- objects by recursively evaluating their values

The result is a small homoiconic language that can describe both computation and data interchange without a separate parser.

## Packages

```text
packages/
  core/         evaluator, special forms, stdlib
  cli/          Effect CLI executable for evaluating Lion JSON programs
  typesafe-ai/  TypeSafe AI and Jev expression bindings
  repl/         interactive graph editor
  agent/        real-world Lion program driving an OpenTUI + AI agent
```

## Graph Editor

`@lionlang/repl` is the Lion Fold Map: a local-first semantic graph and exact JSON workbench. Source text remains canonical while graph, outline, inspector, diagnostics, and evaluation results track explicit document revisions.

```bash
bun install
bun run prepare
bun run dev --filter=@lionlang/repl
```

Open `http://localhost:3000`, import or open a Lion JSON file, edit through either synchronized view, run against the standard library, then save to the original file handle or download the exact source. See [`packages/repl/README.md`](packages/repl/README.md) for shortcuts, browser fallback behavior, verification, and architecture.

## Command Line

Install `@lionlang/cli` in a project or globally:

```bash
bun add --dev @lionlang/cli
```

Evaluate a Lion JSON file:

```bash
bun run lion program.json
```

Serve the bundled graph editor locally:

```bash
bun run lion repl
```

The editor listens on `127.0.0.1:3000` by default. Use `--host` and `--port`
to change the bind address. The published CLI includes the production editor,
so an end-user project does not need the Lion monorepo or a separate REPL
installation.

The `lion` command validates files as Lion expressions, evaluates them with the
standard library, and writes results as formatted JSON. The graph editor keeps
opened programs local to the browser and saves through the browser's file APIs.

## Basic Usage

```ts
import { Effect } from "effect";
import { run } from "@lionlang/core/evaluation/evaluate";
import { stdlib } from "@lionlang/core/modules";

const result = await Effect.runPromise(
	run(["number/add", 1, 2], stdlib)
);

// => 3
```

## TypeSafe AI and Jev

`@lionlang/typesafe-ai` exposes every Jev question primitive plus the System One and models APIs as Lion functions. Set `TYPESAFE_API_KEY`, create the bindings once in the host, and spread them into the evaluation environment:

```ts
import { Effect } from "effect";
import { run } from "@lionlang/core/evaluation/evaluate";
import { stdlib } from "@lionlang/core/modules";
import { makeTypeSafeBindings } from "@lionlang/typesafe-ai";

const environment = {
	...stdlib,
	...makeTypeSafeBindings(),
};

const result = await Effect.runPromise(
	run(
		[
			"typesafe/system-one",
			{
				state: "Help! My payouts have been failing for 3 days.",
				questions: {
					urgent: [
						"typesafe/noul",
						"Does this convey urgency?",
						{
							true: "Explicitly time-sensitive",
							false: "No urgency expressed",
						},
					],
					department: [
						"typesafe/choice",
						"Which team should handle this?",
						{
							billing: "Payments, invoicing, and refunds",
							technical: "Bugs, outages, and integrations",
						},
					],
					frustration: [
						"typesafe/score",
						"How frustrated is the customer?",
						["quote", ["Calm", "Frustrated", "Very angry"]],
					],
				},
			},
		],
		environment
	)
);
```

Lion arrays are executable, so literal arrays in state, instructions, or score criteria must use `quote`. Use `["typesafe/models"]` to list the models available to the configured account. `makeTypeSafeBindings` accepts the TypeSafe SDK client configuration and an optional namespace.

## Custom Environment

Any string can resolve against the evaluation environment. That includes values, objects, classes, and functions.

```ts
import { Effect } from "effect";
import { run } from "@lionlang/core/evaluation/evaluate";
import { stdlib } from "@lionlang/core/modules";

const env = {
	...stdlib,
	price: 100,
	taxRate: 0.08,
	clamp: (min: number, max: number, value: number) =>
		Math.min(max, Math.max(min, value)),
};

await Effect.runPromise(
	run(["number/add", "price", ["number/multiply", "price", "taxRate"]], env)
);
// => 108

await Effect.runPromise(run(["clamp", 0, 100, 150], env));
// => 100
```

## Expression Model

### Primitives

Numbers, booleans, and `null` evaluate to themselves. Strings are treated as references first; if no binding exists, the original string is returned.

```json
42
true
null
"x"
```

With `{ "x": 10 }` in the environment, `"x"` evaluates to `10`. Otherwise it evaluates to `"x"`.

### Arrays

Arrays are always treated as executable expressions:

1. special forms such as `["define", "x", 1]`
2. function calls when the first element evaluates to a function

```json
["number/add", 1, 2]
```

Evaluates to `3`.

### Objects

Objects preserve their keys and evaluate each value.

```json
{
  "sum": ["number/add", 1, 2],
  "ok": true
}
```

Evaluates to `{ "sum": 3, "ok": true }`.

## Special Forms

### `quote`

Returns its argument without evaluating it.

```json
["quote", ["number/add", 1, 2]]
```

### `eval`

Evaluates its argument, then evaluates the result.

```json
["eval", ["quote", ["number/add", 1, 2]]]
```

### `begin`

Evaluates expressions in order and returns the last result.

```json
["begin", ["define", "x", 1], ["define", "x", 2], "x"]
```

### `define`

Evaluates a value, stores it in the global environment, and returns the stored value.

```json
["define", "answer", 42]
```

### `lambda`

Creates a Lion function with lexical scope.

```json
["lambda", ["x"], ["number/add", "x", 1]]
```

Lambdas close over surrounding scope, and they observe updated global bindings when invoked later.

### `cond`

Evaluates condition/result pairs in order and returns the first matching result. An `else` branch is optional.

```json
["cond",
  [["number/greaterThan", "score", 90], "great"],
  [["number/greaterThan", "score", 70], "pass"],
  ["else", "retry"]]
```

If no branch matches and no `else` is provided, `cond` returns `null`.

### `match`

Pattern matches a value against predicate/function pairs, then applies the first matching branch. The last argument is a fallback function.

```json
["match",
  "value",
  ["value/number?", ["lambda", ["x"], ["number/add", "x", 1]]],
  ["value/string?", ["lambda", ["x"], ["string/concat", "x", "!"]]],
  ["lambda", ["x"], "x"]]
```

`match` also supports structural predicates:

```json
["match",
  { "type": "user", "profile": { "name": "Ada" } },
  [
    {
      "type": ["func/partial", "string/equals?", "user"],
      "profile": { "name": "value/string?" }
    },
    "value/identity"
  ],
  ["lambda", ["x"], null]]
```

## Standard Library

The default environment exported as `stdlib` namespaces entries as `<module>/<name>`.

### `number`

```json
["number/add", 1, 2]
["number/subtract", 10, 3]
["number/multiply", 5, 4]
["number/divide", 20, 4]
["number/equals?", 5, 5]
["number/lessThan", 3, 5]
["number/greaterThan", 5, 3]
["number/lessThanOrEqualTo", 3, 5]
["number/greaterThanOrEqualTo", 5, 5]
```

### `boolean`

```json
["boolean/not", true]
["boolean/and", true, false]
["boolean/or", false, true]
["boolean/xor", true, false]
["boolean/nand", true, true]
["boolean/nor", false, false]
["boolean/equals?", true, true]
```

### `array`

```json
["array/make", 1, 2, 3]
["array/head", ["array/make", 1, 2, 3]]
["array/tail", ["array/make", 1, 2, 3]]
["array/length", ["array/make", 1, 2, 3]]
["array/concat", ["array/make", 1, 2], ["array/make", 3, 4]]
["array/includes?", ["array/make", 1, 2, 3], 2]
["array/map", ["array/make", 1, 2, 3], ["lambda", ["x"], ["number/add", "x", 1]]]
["array/flat-map", ["array/make", 1, 2], ["lambda", ["x"], ["array/make", "x", "x"]]]
["array/reduce", ["array/make", 1, 2, 3], 0, ["lambda", ["acc", "x"], ["number/add", "acc", "x"]]]
```

### `string`

```json
["string/equals?", "a", "a"]
["string/length", "lion"]
["string/concat", "lion", "ized"]
["string/startsWith", "lion", "li"]
["string/endsWith", "lion", "on"]
["string/includes", "lion", "io"]
["string/indexOf", "lion", "o"]
```

### `object`

```json
["object/get", {"a": 1}, "a"]
["object/get-path", {"a": {"b": {"c": 42}}}, "a.b.c"]
["object/keys", {"a": 1, "b": 2}]
["object/values", {"a": 1, "b": 2}]
["object/json-stringify", {"a": 1}, null, 2]
["object/get-method", "obj", "methodName"]
["object/call-method", "obj", "methodName", 1, 2]
["object/get-method-path", "obj", "nested.methodName"]
["object/call-method-path", "obj", "nested.methodName", 1, 2]
["object/new", "SomeClass", "arg1", "arg2"]
```

`object/get-path` understands dot paths and numeric array segments such as `"users.1.name"`.

### `func`

```json
["func/bind", "fn", "obj"]
["func/apply", "fn", "obj", 1, 2]
["func/callback", ["lambda", ["x"], ["number/add", "x", 1]]]
["func/partial", "fn", 1, 2]
```

`func/callback` is especially useful for turning Lion lambdas into JavaScript callbacks while preserving access to the Lion environment.

### `value`

```json
["value/function?", "x"]
["value/number?", 1]
["value/string?", "lion"]
["value/boolean?", true]
["value/object?", {"a": 1}]
["value/array?", ["array/make", 1, 2]]
["value/null?", null]
["value/identity", 42]
```

`value/undefined?` and `value/symbol?` are mainly useful when Lion is evaluating host values supplied through the environment.

### `console`

```json
["console/log", "hello"]
["console/log-json", {"hello": "world"}]
```

## Host Interop

Lion works well as a configuration and orchestration layer over ordinary JavaScript objects and functions.

The `packages/agent` package is the clearest example. It injects:

- `OpenTUI` classes and enums
- AI SDK helpers
- a model instance
- Node `fs`
- Zod constructors
- a renderer instance

Then Lion code in [`packages/agent/src/agent.json`](/Users/andrueanderson/Workspace/TypeScript/lion/packages/agent/src/agent.json) uses:

- `object/get-path` to traverse host APIs
- `object/new` to construct classes
- `object/call-method` via aliases such as `"()"`
- `func/callback` to hand Lion lambdas to promise and event APIs
- `match`, `cond`, `begin`, and `define` to orchestrate application flow

That lets Lion drive a non-trivial terminal UI agent entirely from JSON.

## Development

From the repo root:

```bash
bun install
bun run prepare
bun run test
bun run build
```

To work on a specific package:

```bash
turbo test --filter=@lionlang/core
turbo dev --filter=@lionlang/repl
```

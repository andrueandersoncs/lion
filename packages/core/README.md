# Lion

Lion is a JSON-based Lisp. Every Lion program is valid JSON, which makes it easy to serialize, store, inspect, and generate from other systems.

The evaluator runs on Effect v4.

Lion evaluates:

- JSON primitives directly
- strings as environment references when a binding exists
- arrays as special forms or function-call expressions
- unbound `"?name"` strings as logic variables for relations, rules, and queries
- objects by recursively evaluating their values

The result is a small homoiconic language that can describe both computation and data interchange without a separate parser.

## Packages

```text
packages/
  core/   evaluator, special forms, stdlib
  repl/   interactive web REPL
  agent/  real-world Lion program driving an OpenTUI + AI agent
```

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

An unbound string of the form `"?name"` evaluates to a logic variable instead. See [Logic](#logic).

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

The logic forms (`relation`, `fact`, `retract`, `rule`, `query`, `why`, `not`, `and`, `or`, and `=`) are covered in [Logic](#logic).

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

## Logic

Lion includes a Datalog-style logic layer. Relations, goals, and logic variables are ordinary values, so rules and queries use the same JSON syntax as the rest of the language and query results are plain Lion data.

```json
["begin",
  ["relation", "edge", ["from", "to"]],
  ["relation", "path", ["from", "to"]],
  ["fact", ["edge", "a", "b"], ["edge", "b", "c"]],
  ["rule", ["path", "?x", "?y"], ["edge", "?x", "?y"]],
  ["rule", ["path", "?x", "?z"], ["path", "?x", "?y"], ["edge", "?y", "?z"]],
  ["query", ["path", "a", "?to"]]]
```

Evaluates to `[{ "to": "b" }, { "to": "c" }]`.

### Building blocks

- `"?name"` evaluates to a logic variable when `?name` is not bound. `"?_"` is anonymous: each occurrence is a separate variable, and inside `not` it matches anything.
- `["relation", "edge", ["from", "to"]]` declares a relation and binds `edge` to it. Calling a relation, such as `["edge", "a", "?b"]`, returns a goal; it does not search anything by itself.
- Functions from the pure modules (`number`, `string`, `boolean`, `value`, `array`) wait when called with a logic variable. `["number/greaterThan", "?amount", 100]` becomes a filter in a rule body, and `["number/add", "?n", 1]` becomes a value computed once `?n` is bound.
- Ordinary lambdas run as usual, so a lambda can build and return goals.

### Forms

| Form | Meaning |
|---|---|
| `["fact", goal, ...]` | Adds ground facts. Returns the facts added. |
| `["retract", goal, ...]` | Removes facts. Derived answers update on the next query. |
| `["rule", head, goal, ...]` | Adds a rule: `head` holds whenever every goal holds. |
| `["query", goal]` | Returns one record per distinct answer, keyed by variable name without the `?`. A goal with no variables returns `[{}]` when it holds and `[]` when it does not. |
| `["why", goal]` | Explains a fact as a tree of the rules and facts that derived it, or returns `null` when it does not hold. |
| `["and", goal, ...]`, `["or", goal, ...]` | Combine goals. With only booleans, they are boolean operators. |
| `["not", goal]` | Holds when the goal has no matches. With a boolean, it negates it. |
| `["=", term, term]` | Binds a variable to a value, or compares two values. Without logic variables it is plain equality. |

### Aggregates

A rule head can aggregate. An argument such as `["aggregate/sum", "?amount"]` combines the values of `?amount` across every match of the rule body, and the head's other columns group the matches, like `GROUP BY` in SQL.

```json
["begin",
  ["relation", "order", ["id", "customer", "amount"]],
  ["relation", "spend", ["customer", "total", "orders"]],
  ["fact", ["order", 1, "ana", 30], ["order", 2, "ana", 20], ["order", 3, "bo", 50]],
  ["rule", ["spend", "?c", ["aggregate/sum", "?amount"], ["aggregate/count", "?id"]],
    ["order", "?id", "?c", "?amount"]],
  ["query", ["spend", "?customer", "?total", "?orders"]]]
```

Evaluates to `[{ "customer": "ana", "total": 50, "orders": 2 }, { "customer": "bo", "total": 50, "orders": 1 }]`.

| Aggregate | Result |
|---|---|
| `aggregate/count` | Number of matches |
| `aggregate/countUnique` | Number of distinct values |
| `aggregate/sum`, `aggregate/mean` | Sum and mean of numbers (`mean` of nothing is `null`) |
| `aggregate/min`, `aggregate/max` | Smallest and largest value; all numbers or all strings |
| `aggregate/collect` | Every value, sorted, duplicates kept |
| `aggregate/unique` | Distinct values, sorted |

- Each match of a rule body counts once. A match that several alternatives of one `or` find counts once, and separate rules for the same relation add up.
- A group exists only when something matches, so a count is never `0`.
- An aggregate can combine computed values, such as `["aggregate/sum", ["number/multiply", "?price", "?quantity"]]`.
- Every rule for an aggregated relation must aggregate the same columns in the same way, and the relation cannot also have facts.
- `why` on an aggregated fact lists every match it combines under `matches`. For `min` and `max`, it explains the one match that produced the value.
- Called on a plain list instead of a logic variable, the same functions combine the list right away: `["aggregate/sum", ["array/make", 1, 2, 3]]` is `6`.

### Guarantees

Rules are checked when they are added:

- Every variable in a rule head, filter, or `not` must first be bound by a relation goal or `=`.
- Negation cannot go through recursion, so every program has a single well-defined answer.
- Aggregation cannot go through recursion either, so an aggregate runs only once its inputs are complete.
- A recursive rule cannot compute new values in its head, so evaluation always finishes.

Answers are computed bottom-up with semi-naive evaluation and cached until a fact or rule changes. Each `run` starts from an empty database; pass `{ database: new LogicDatabase() }` as the third argument to share relations, facts, and rules across runs.

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

### `aggregate`

Called on a list, each function combines it. Called on a logic variable in a rule head, each becomes an aggregate; see [Aggregates](#aggregates).

```json
["aggregate/count", ["array/make", 3, 1, 3]]
["aggregate/countUnique", ["array/make", 3, 1, 3]]
["aggregate/sum", ["array/make", 3, 1, 3]]
["aggregate/mean", ["array/make", 3, 1, 3]]
["aggregate/min", ["array/make", 3, 1, 3]]
["aggregate/max", ["array/make", 3, 1, 3]]
["aggregate/collect", ["array/make", 3, 1, 3]]
["aggregate/unique", ["array/make", 3, 1, 3]]
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
bun test
bun run build
```

To work on a specific package:

```bash
turbo test --filter=@lionlang/core
turbo dev --filter=@lionlang/repl
```

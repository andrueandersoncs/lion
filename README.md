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
  core/         evaluator, special forms, stdlib
  cli/          Effect CLI executable for evaluating Lion JSON programs
  typesafe-ai/  TypeSafe AI and Jev expression bindings
  repl/         interactive graph editor
  agent/        real-world Lion program driving an OpenTUI + AI agent
  site-runtime/ in-browser evaluator (Web Worker) for the live examples on lionlang.dev
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
| `["query", goal, options]` | Sorts and pages the answers, or asserts that there are some or none. See [Query options](#query-options). |
| `["why", goal]` | Explains a fact as a tree of the rules and facts that derived it, or returns `null` when it does not hold. |
| `["and", goal, ...]`, `["or", goal, ...]` | Combine goals. With only booleans, they are boolean operators. |
| `["not", goal]` | Holds when the goal has no matches. With a boolean, it negates it. |
| `["=", term, term]` | Binds a variable to a value, or compares two values. Without logic variables it is plain equality. |
| `["in", element, list]` | Binds a variable to each item of a list, or tests that a value is one. Without logic variables it is plain membership. See [Lists](#lists). |

### Query options

A record as the third argument of `query` sorts and pages the answers, or asserts that there are some or none. Options are read as written, like a relation's column list.

```json
["begin",
  ["relation", "score", ["player", "points"]],
  ["fact", ["score", "ana", 12], ["score", "bo", 30], ["score", "cy", 30], ["score", "dee", 7]],
  ["query", ["score", "?player", "?points"], {"order": ["-points", "player"], "limit": 3}]]
```

Evaluates to `[{ "player": "bo", "points": 30 }, { "player": "cy", "points": 30 }, { "player": "ana", "points": 12 }]`.

| Option | Meaning |
|---|---|
| `"order"` | A variable name or a list of them, compared in turn. A leading `-` sorts that variable in descending order, and the `?` is optional. |
| `"offset"`, `"limit"` | Skip `offset` answers, then return at most `limit`. |
| `"assert"` | `"some"` fails the query when it has no answers, and `"none"` fails it when it has any. The assertion sees every answer, before `offset` and `limit`. |

Without `"order"`, answers come in the order they are found. Values sort in a fixed order across types: `null`, booleans, numbers, strings, arrays, then records.

### Lists

`in` lets rules use list values. With the element unbound, it binds the element to each item of the list; once the element is bound, it tests membership.

```json
["begin",
  ["relation", "post", ["id", "tags"]],
  ["relation", "tagged", ["tag", "post"]],
  ["fact", ["post", "p1", ["array/make", "lisp", "json"]], ["post", "p2", ["array/make", "json", "logic"]]],
  ["rule", ["tagged", "?tag", "?p"], ["post", "?p", "?tags"], ["in", "?tag", "?tags"]],
  ["query", ["tagged", "json", "?post"]]]
```

Evaluates to `[{ "post": "p1" }, { "post": "p2" }]`.

- The list must be bound before `in` runs. It can be a variable, a computed value such as `["array/make", "?x", "?y"]`, or a list such as `["array/range", 0, 10]`.
- A list that repeats an item binds it once.
- Without logic variables, `["in", "b", ["array/make", "a", "b"]]` is plain membership and evaluates to `true`.

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
| `aggregate/shortest` | Shortest list or string; ties go to the smaller value |
| `aggregate/union` | Every element of every list, distinct and sorted |
| `aggregate/collect` | Every value, sorted, duplicates kept |
| `aggregate/unique` | Distinct values, sorted |

- Each match of a rule body counts once. A match that several alternatives of one `or` find counts once, and separate rules for the same relation add up.
- A group exists only when something matches, so a count is never `0`.
- An aggregate can combine computed values, such as `["aggregate/sum", ["number/multiply", "?price", "?quantity"]]`.
- Every rule for an aggregated relation must aggregate the same columns in the same way, and the relation cannot also have facts.
- `why` on an aggregated fact lists every match it combines under `matches`. For `min`, `max`, and `shortest`, it explains the one match that produced the value.
- Called on a plain list instead of a logic variable, the same functions combine the list right away: `["aggregate/sum", ["array/make", 1, 2, 3]]` is `6`.

#### Recursion through aggregates

`aggregate/min`, `aggregate/max`, `aggregate/shortest`, and `aggregate/union` are lattice aggregates: a group's value only moves one way as matches arrive. A recursive rule can aggregate with them, and the aggregate can compute its value, which an ordinary recursive rule cannot do. Each group keeps its best value so far, and evaluation stops once no value improves.

```json
["begin",
  ["relation", "road", ["from", "to", "km"]],
  ["relation", "dist", ["to", "km"]],
  ["fact", ["road", "a", "b", 4], ["road", "a", "c", 1], ["road", "c", "b", 2], ["road", "b", "d", 5]],
  ["rule", ["dist", "?to", ["aggregate/min", "?km"]], ["road", "a", "?to", "?km"]],
  ["rule", ["dist", "?to", ["aggregate/min", ["number/add", "?d", "?km"]]],
    ["dist", "?via", "?d"], ["road", "?via", "?to", "?km"]],
  ["query", ["dist", "?to", "?km"]]]
```

Evaluates to `[{ "to": "c", "km": 1 }, { "to": "b", "km": 3 }, { "to": "d", "km": 8 }]`.

`aggregate/shortest` keeps a path itself. With `route` edges `a→b`, `b→c`, `a→c`, and `c→d`, these rules make `["query", ["best", "d", "?path"]]` return `[{ "path": ["a", "c", "d"] }]`:

```json
["rule", ["best", "?to", ["aggregate/shortest", ["array/make", "a", "?to"]]], ["route", "a", "?to"]],
["rule", ["best", "?to", ["aggregate/shortest", ["array/concat", "?path", ["array/make", "?to"]]]],
  ["best", "?via", "?path"], ["route", "?via", "?to"]]
```

- Every relation in a recursive cycle through an aggregate must aggregate too, so replacing a value never leaves rows derived from the old one behind.
- If values are still improving after 10,000 rounds, as with a negative-weight cycle under `aggregate/min`, the query fails with an error instead of running forever.

### Graph algorithms

Some questions are easier to answer with a classic algorithm than with rules. The `graph` module turns algorithms into goals: call one with an edge relation, any other inputs, and one term per output column, and it builds a goal the way calling a relation does. The engine runs the algorithm once its input relation is complete, so its rows work in queries, rule bodies, `not`, and aggregates.

```json
["begin",
  ["relation", "road", ["from", "to", "km"]],
  ["fact", ["road", "a", "b", 4], ["road", "a", "c", 1], ["road", "c", "b", 2], ["road", "b", "d", 5]],
  ["query", ["graph/shortestPath", "road", "a", "?to", "?km", "?path"]]]
```

Evaluates to `[{ "to": "a", "km": 0, "path": ["a"] }, { "to": "c", "km": 1, "path": ["a", "c"] }, { "to": "b", "km": 3, "path": ["a", "c", "b"] }, { "to": "d", "km": 8, "path": ["a", "c", "b", "d"] }]`.

| Goal | Rows |
|---|---|
| `["graph/shortestPath", edges, start, to, cost, path]` | Dijkstra's algorithm from `start`, in order of cost, starting with `start` itself at cost 0. A third edge column is the weight, at least 0; without one, every edge costs 1. |
| `["graph/pageRank", edges, node, rank]` | PageRank with damping 0.85, rounded to 6 decimal places. The ranks add up to 1. |
| `["graph/components", edges, node, component]` | Connected components, ignoring edge direction. |
| `["graph/stronglyConnected", edges, node, component]` | Strongly connected components. |
| `["graph/topologicalOrder", edges, node, position]` | Positions from 0 in a topological order, or an error that names a cycle. |

- The first two columns of `edges` are the edge's from and to.
- Components are named after their smallest node, and ties go to the smaller value, so results never depend on the order facts were added.
- Inputs such as `start` must be values when the goal is built. Output terms can be variables or values, so `["graph/shortestPath", "road", "a", "d", "?km", "?_"]` asks for one distance.
- A computed relation cannot have facts or rules of its own, and it cannot be part of a recursive cycle.
- `why` shows a computed row as `{ "fact": ["graph/shortestPath", "road", "a", "d", 8, ["a", "c", "b", "d"]], "computed": true }`.
- Hosts can add their own algorithms with `defineAlgorithm`; see [Host Interop](#host-interop).

### Goal-directed queries

Bottom-up evaluation derives everything a program implies, but a query usually needs much less. When a query gives a rule-defined relation a known argument, such as `"a"` in `["path", "a", "?to"]`, Lion rewrites the rules with the magic-sets technique: each relation gets a copy for that pattern of known arguments, and extra rules pass the known values down through the rule bodies. Evaluation then derives only the facts the query can reach.

```json
["begin",
  ["relation", "edge", ["from", "to"]],
  ["relation", "path", ["from", "to"]],
  ["rule", ["edge", "?n", ["number/add", "?n", 1]], ["in", "?n", ["array/range", 0, 3000]]],
  ["rule", ["path", "?x", "?y"], ["edge", "?x", "?y"]],
  ["rule", ["path", "?x", "?z"], ["edge", "?x", "?y"], ["path", "?y", "?z"]],
  ["query", ["path", 2997, "?to"]]]
```

Evaluates to `[{ "to": 2998 }, { "to": 2999 }, { "to": 3000 }]` in milliseconds. Computing `path` in full would derive about 4.5 million rows.

- Known arguments are values, or variables bound by an earlier relation goal in the query, as in `["and", ["start", "?s"], ["path", "?s", "?to"]]`.
- Relations that are aggregated, computed by an algorithm, or used under `not` are computed in full first, along with everything they depend on.
- The answers are the same either way, but they can come in a different order. Use the `"order"` query option when order matters.
- `why` explains facts with every relation computed in full.
- Pass `{ database: new LogicDatabase({ goalDirected: false }) }` to `run` to compute every relation for every query instead.

### Guarantees

Rules are checked when they are added:

- Every variable in a rule head, filter, or `not` must first be bound by a relation goal, `=`, or `in`.
- Negation cannot go through recursion, so every program has a single well-defined answer.
- Aggregation goes through recursion only with the lattice aggregates `min`, `max`, `shortest`, and `union`, and only when every relation in the cycle aggregates. Any other aggregate runs once its inputs are complete.
- A recursive rule cannot compute new values in its head columns, so evaluation always finishes. Recursion through a lattice aggregate stops when no value improves, or fails with an error after 10,000 rounds.

Answers are computed bottom-up with semi-naive evaluation, goal-directed when a query has known arguments, and cached until a fact or rule changes. Each `run` starts from an empty database; pass `{ database: new LogicDatabase() }` as the third argument to share relations, facts, and rules across runs.

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
["aggregate/shortest", ["array/make", ["array/make", 1, 2], ["array/make", 3]]]
["aggregate/union", ["array/make", ["array/make", 1, 2], ["array/make", 2, 3]]]
```

### `array`

```json
["array/make", 1, 2, 3]
["array/head", ["array/make", 1, 2, 3]]
["array/tail", ["array/make", 1, 2, 3]]
["array/length", ["array/make", 1, 2, 3]]
["array/concat", ["array/make", 1, 2], ["array/make", 3, 4]]
["array/includes?", ["array/make", 1, 2, 3], 2]
["array/range", 0, 5]
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

### `graph`

Algorithm goals over an edge relation; see [Graph algorithms](#graph-algorithms).

```json
["graph/shortestPath", "road", "a", "?to", "?cost", "?path"]
["graph/pageRank", "edge", "?node", "?rank"]
["graph/components", "edge", "?node", "?component"]
["graph/stronglyConnected", "edge", "?node", "?component"]
["graph/topologicalOrder", "edge", "?node", "?position"]
```

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

### Custom algorithms

`defineAlgorithm` turns a TypeScript function into an algorithm goal like those in the `graph` module. It receives the tuples of each relation input and the value of each other input, and returns the output rows, or a string that explains why it cannot.

```ts
import { run } from "@lionlang/core/evaluation/evaluate";
import { defineAlgorithm } from "@lionlang/core/logic/algorithms";
import { stdlib } from "@lionlang/core/modules";

const outDegree = defineAlgorithm({
  name: "my/outDegree",
  inputs: [{ kind: "relation", name: "edges" }],
  columns: ["node", "degree"],
  run: ([edges]) => {
    const counts = new Map<unknown, number>();
    for (const [from] of edges as unknown[][]) {
      counts.set(from, (counts.get(from) ?? 0) + 1);
    }
    return [...counts];
  },
});

run(program, { ...stdlib, "my/outDegree": outDegree });
```

In the program, `["my/outDegree", "edge", "?node", "?degree"]` is then a goal.

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

## Website

[lionlang.dev](https://lionlang.dev) is served by GitHub Pages straight from `docs/`, with no build step. The live examples run `docs/lion-worker.js`, a bundle of `@lionlang/core` built by `@lionlang/site-runtime`. After changing the core evaluator, rebuild and commit it:

```bash
turbo build --filter=@lionlang/site-runtime
```

GitHub Pages lets browsers cache every file for ten minutes, so `docs/index.html` loads its scripts and stylesheet with a `?v=` hash of the site's assets, and the scripts pass it on to the worker and highlighter. A returning visitor therefore never runs new examples on a cached evaluator. The build above updates the hash. After editing only files in `docs/`, update it with:

```bash
bun run --cwd packages/site-runtime stamp
```

CI fails when the hash in `docs/index.html` is out of date.

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

Keep a logic database in a file across runs with `--database`:

```bash
bun run lion setup.json --database store.json
bun run lion more-facts.json --database store.json
```

The file is loaded before the program runs, so the program can use its relations without declaring them, and is saved afterwards as a [snapshot](#snapshots) program, one form and one fact per line. A file that does not exist yet starts empty. A program that fails, such as one that would break an [invariant](#invariants) saved in the file, leaves the file as it was. Running the same setup again keeps one copy of each rule and invariant.

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

An unbound string of the form `"module/name"` that reads as a misspelled name is an error, and not a string: one whose module has other names, such as `"number/ad"`, or one a letter or two away from a bound name, such as `"numbr/add"`.

```json
["number/ad", 1, 2]
```

Fails with `Nothing is bound to "number/ad". Did you mean "number/add"? To mean the string itself, write ["quote", "number/ad"].` Any other string with a slash in it, such as `"n/a"` or `"text/plain"`, evaluates to itself, and `["quote", "number/ad"]` is always the string.

### Arrays

Arrays are always treated as executable expressions:

1. special forms such as `["define", "x", 1]`
2. function calls when the first element evaluates to a function

```json
["number/add", 1, 2]
```

Evaluates to `3`.

### Objects

Objects preserve their keys and evaluate each value. A key can be any string JSON allows, the empty string among them, except `__proto__`, which is left out.

```json
{
  "sum": ["number/add", 1, 2],
  "ok": true
}
```

Evaluates to `{ "sum": 3, "ok": true }`.

## Special Forms

The logic forms (`relation`, `fact`, `retract`, `rule`, `query`, `why`, `not`, `and`, `or`, and `=`) are covered in [Logic](#logic), and `schema` in [Schemas](#schemas).

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

A call must give a lambda at least as many arguments as it has parameters. Arguments beyond those are ignored, as in JavaScript, so host code can call a lambda as a callback. The functions of the [standard library](#standard-library) are stricter: each takes a set number of arguments.

### `cond`

Evaluates condition/result pairs in order and returns the first matching result. An `else` branch is optional.

```json
["cond",
  [["number/greaterThan", "score", 90], "great"],
  [["number/greaterThan", "score", 70], "pass"],
  ["else", "retry"]]
```

If no branch matches and no `else` is provided, `cond` returns `null`. `else` is an ordinary string, and a string counts as true. A condition can be a goal, such as `["member", "name", "?_"]`: it holds when the goal has a match. See [Asking](#asking).

### `match`

Checks a value against schema/function pairs, then applies the function of the first schema the value fits. The last argument is a fallback function.

```json
["match",
  "value",
  ["value/number?", ["lambda", ["x"], ["number/add", "x", 1]]],
  ["value/string?", ["lambda", ["x"], ["string/concat", "x", "!"]]],
  ["lambda", ["x"], "x"]]
```

Anything is a [schema](#schemas): a predicate, a record or list of schemas, or a plain value. A record of schemas fits a record with the same keys:

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

A plain value fits a value equal to it, so `match` can pick among choices with `["schema/anyOf", "refund", "void"]`. To pick a branch by one field of a record that has others, open the record: `[["schema/open", {"type": "refund"}], handler]`.

A relation is a predicate too: `["match", "name", ["member", handler], fallback]` takes the first branch when `["member", "name"]` has a match. See [Asking](#asking).

## Logic

Lion includes a Datalog-style logic layer. Relations, goals, and logic variables are ordinary values, so rules and queries use the same JSON syntax as the rest of the language and query results are plain Lion data. The two halves meet in both directions: any expression works inside a rule, and any expression can ask the database a question.

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

- `"?name"` evaluates to a logic variable when `?name` is not bound. `"?_"` is anonymous: each occurrence is a separate variable, and it never appears in an answer.
- `["relation", "edge", ["from", "to"]]` declares a relation and binds `edge` to it. Calling a relation, such as `["edge", "a", "?b"]`, returns a goal; it does not search anything by itself. A goal is a question: a rule or query asks it for its matches, and any other expression can ask it too. See [Asking](#asking). Each argument of a call is a [schema](#schemas) for its column: a value, a variable, a pattern such as `{"id": "?id"}`, or a predicate. See [Taking data apart](#taking-data-apart). A record after the columns holds the relation's options: `{"key": ["id"]}` gives it a key, see [Keys](#keys), and `{"schema": "Order"}` says what its rows must fit, see [Schemas](#the-schema-of-a-relations-rows).
- Anything that needs the value of a logic variable waits until the variable is bound. `["number/greaterThan", "?amount", 100]` becomes a filter in a rule body, and `["number/add", "?n", 1]` becomes a value computed once `?n` is bound. See [Waiting for values](#waiting-for-values).
- A lambda's body runs right away, so a lambda can build and return goals. Whatever in the body needs a value waits. Only an argument that asks a question makes the call wait, so the question is answered first, as it is in plain code.

### Forms

| Form | Meaning |
|---|---|
| `["fact", goal, ...]` | Adds ground facts. Returns the facts added. |
| `["retract", goal, ...]` | Removes facts. Derived answers update on the next query. |
| `["rule", head, goal, ...]` | Adds a rule: `head` holds whenever every goal holds. |
| `["query", goal]` | Returns one record per distinct answer, keyed by variable name without the `?`. A goal with no variables returns `[{}]` when it holds and `[]` when it does not. |
| `["query", goal, options]` | Sorts and pages the answers, or asserts that there are some or none. See [Query options](#query-options). |
| `["find", template, goal]` | Returns the template's value for every match of the goal, as a sorted list. See [Asking](#asking). |
| `["why", goal]` | Explains a fact as a tree of the rules and facts that derived it, or returns `null` when it does not hold. |
| `["and", goal, ...]`, `["or", goal, ...]` | Combine goals. On booleans they are the boolean operators, and stop at the first argument that decides the result. |
| `["not", goal]` | Holds when the goal has no match. The goal can be any goal, with variables of its own; a boolean is negated. |
| `["=", term, term]` | Binds a variable to a value, or compares two values. Either side can be a record or list with variables in it, which takes the other side apart. Without logic variables it is plain equality. |
| `["invariant", goal, {"assert": "none"}]` | Keeps a query assertion: the goal must have no answers, or with `"some"` at least one, now and after every later change. See [Invariants](#invariants). |
| `["snapshot"]` | Returns a Lion program that rebuilds the current database. See [Snapshots](#snapshots). |
| `["in", element, list]` | Binds a variable to each item of a list, or tests that a value is one. The element can be a record or list with variables in it. Without logic variables it is plain membership. See [Lists](#lists). |

A fact holds JSON data. A string that is a name evaluates to what it names, so a fact written with one is refused, and the message says which column it is for, what the string names, and how to write the string itself. `fact`, `retract`, and `why` refuse in the same words.

```json
["begin",
  ["relation", "note", ["text"]],
  ["relation", "source", ["id"]],
  ["fact", ["note", "source"]]]
```

Fails with `Facts may only contain JSON data, but the "text" of ["note","source"] is the relation "source". To mean the string itself, write ["quote", "source"].` The same goes for the name of a schema or a function, and for a string such as `"?why"`, which is a logic variable: `... is the logic variable "?why". To mean the string itself, write ["quote", "?why"].` An argument that is not data for another reason is shown with the reason: `... is ["number/add","?x",1], which waits for a logic variable.`

`why` explains a derived fact by the rule that derived it and what its body rested on, under `because`: each row a relation goal matched, explained in turn down to the facts that were given, and every other goal as it held, with the answer's values in place of its variables. A `not` shows as `absent`, and every other goal, `=` and `in` among them, as `check`. A figure a rule computes therefore shows its arithmetic on the values it was given:

```json
["begin",
  ["relation", "line", ["item", "usd_m"]],
  ["relation", "days_held", ["days"]],
  ["fact", ["line", "inventory", 4946], ["line", "cost of sales", 210352]],
  ["rule", ["days_held", "?days"],
    ["line", "inventory", "?stock"],
    ["line", "cost of sales", "?cost"],
    ["=", "?days", ["number/round", ["number/multiply", 365, ["number/divide", "?stock", "?cost"]]]]],
  ["why", ["days_held", 9]]]
```

Its `because` holds the two `line` facts and `{ "check": ["=", 9, ["number/round", ["number/multiply", 365, ["number/divide", 4946, 210352]]]] }`. Each check, evaluated as it stands, is `true`, so anyone can work the arithmetic again.

### Waiting for values

A rule or query is written before its variables have values, so anything that needs a variable's value waits, and runs once for each answer that binds the variable:

- A function call with a logic variable among its arguments. That is every function: the standard library, functions the host adds, and functions made by `func/partial`.
- `cond` when a condition is not known yet, `match` when its value is not, and `eval` when its code is not.
- A record or list with a logic variable in it. Where a goal can bind variables it is a pattern: see [Taking data apart](#taking-data-apart).

```json
["begin",
  ["relation", "reading", ["sensor", "celsius"]],
  ["relation", "report", ["sensor", "summary"]],
  ["fact", ["reading", "attic", 30], ["reading", "cellar", 10]],
  ["rule",
    ["report", "?s",
      {"fahrenheit": ["number/add", ["number/multiply", "?c", 1.8], 32],
       "level": ["cond", [["number/greaterThan", "?c", 25], "hot"], ["else", "fine"]]}],
    ["reading", "?s", "?c"]],
  ["query", ["report", "?sensor", "?summary"]]]
```

Evaluates to `[{ "sensor": "attic", "summary": { "fahrenheit": 86, "level": "hot" } }, { "sensor": "cellar", "summary": { "fahrenheit": 50, "level": "fine" } }]`.

- What waits computes what it would compute with the value in place of the variable.
- As a goal, a waiting call is a filter, and so is a variable that holds true or false. A filter must be true or false: `["string/indexOf", "?s", "a"]` as a goal is an error, since it is a number.
- A goal is also a value: `["=", "?ok", ["and", ["number/greaterThan", "?x", 0], ["number/lessThan", "?x", 10]]]` binds `?ok` to true or false. A goal with a relation in it is asked for its value; see [Asking](#asking).
- What a rule holds runs when the rule runs. A call on values that are already known may be computed when the rule is written, which changes nothing but when a side effect happens.
- A filter runs as soon as its variables are bound, and filters that are ready together run in the order written. So a guard written first protects the filter after it, as in `["value/number?", "?v"], ["number/greaterThan", "?v", 0]`. A filter that fails names the call and the values it ran on.
- A lambda passed to a waiting call, such as the function of `array/map`, waits with it, and can mention the rule's variables.
- Names are replaced by their values when the rule is written, also inside a waiting `cond` or lambda, so redefining a name later does not change the rule. A lambda that calls itself by name is the exception: it looks its name up each time it runs, as it does outside of rules.
- Functions run forward only: `["=", ["number/add", "?x", 1], 5]` does not solve for `?x`.

### Asking

A goal with a relation in it is a question, and any expression can ask it. As a goal of a rule or query it matches rows and binds variables. Anywhere else it is asked:

- Under `not`, it holds when it has no match.
- As a value, it is `true` when it has a match and `false` when it has none: in a `cond` condition, as an argument of a function, as an operand of `=` or `in`, as a value of a record, as an argument of a `fact`, and as the value `match` looks at. A relation is a predicate for `match` and for functions that are given it, such as `array/map`.
- `["find", template, goal]` returns the value of `template` for every match of `goal`, as a list.

```json
["begin",
  ["relation", "person", ["name"]],
  ["relation", "parent", ["parent", "child"]],
  ["relation", "family", ["name", "children", "kind"]],
  ["fact", ["person", "ada"], ["person", "ben"], ["person", "cy"]],
  ["fact", ["parent", "ada", "ben"], ["parent", "ada", "cy"]],
  ["rule",
    ["family", "?p",
      ["find", "?c", ["parent", "?p", "?c"]],
      ["cond", [["parent", "?p", "?_"], "has children"], ["else", "no children"]]],
    ["person", "?p"]],
  {"in a rule": ["query", ["family", "?name", "?children", "?kind"], {"order": "name"}],
   "in plain code": ["find", "?c", ["parent", "ada", "?c"]],
   "as a value": ["parent", "ben", "?_"],
   "as a predicate": ["array/map", ["array/make", "ada", "zed"], "person"]}]
```

Evaluates to `{ "in a rule": [{ "name": "ada", "children": ["ben", "cy"], "kind": "has children" }, { "name": "ben", "children": [], "kind": "no children" }, { "name": "cy", "children": [], "kind": "no children" }], "in plain code": ["ben", "cy"], "as a value": false, "as a predicate": [true, false] }`.

- When a question is asked, the variables that the rule or query around it has bound have their values. Every other variable in it is the question's own: the question binds it, and it never appears in an answer. So `["not", ["and", ["parent", "?p", "?c"], ["retired", "?c"]]]` asks whether `?p` has a retired child, for the `?p` the rule has bound.
- In plain code a question is asked right away, and every variable in it is its own. In a rule, query, invariant, or `find`, a question is part of what is written, and is asked for each answer when that runs. A question gives in a rule what it gives in plain code with the rule's variables in place.
- `find` gives one value for every match, sorted in the fixed order values sort in, so its list never depends on how the matches were found. It can repeat a value, as `aggregate/collect` does; use `aggregate/unique` for distinct values. A `find` must bind every variable of its template that the rule around it does not.
- `define`, `and`, `or`, `not`, and lambdas keep a goal as it is, so goals can still be named, combined, and passed around. To get a goal's truth on its own, give it to a function: `["value/identity", goal]`.
- A question sees every row of the relations it asks about, so those are derived in full first. A rule cannot ask about a relation that depends on the rule's own head.
- Within a rule or query, a name is one variable, also inside the questions nested in it. Give a question nested in another its own names.

### Keys

A record after the columns gives a relation a key. A keyed relation holds at most one row per key, so a fact whose key is already present replaces the old row, like an upsert.

```json
["begin",
  ["relation", "order", ["id", "status"], {"key": ["id"]}],
  ["fact", ["order", 1, "open"], ["order", 2, "open"]],
  ["fact", ["order", 1, "shipped"]],
  ["query", ["order", "?id", "?status"], {"order": "id"}]]
```

Evaluates to `[{ "id": 1, "status": "shipped" }, { "id": 2, "status": "open" }]`.

- A key can span several columns, as in `{"key": ["warehouse", "sku"]}`, and a single column can be written without the list, as in `{"key": "id"}`.
- When one `fact` form repeats a key, the last row wins.
- `retract` removes a row only when every column matches.
- Rules can derive rows of a keyed relation, but two different rows with the same key, from facts or rules, are an error.
- Declaring the relation again, for example in a later `run` that shares the database, must repeat the same columns and key.

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

### Invariants

An invariant is a query assertion the database keeps. `["invariant", goal, {"assert": "none"}]` says the goal never has answers, and `{"assert": "some"}` says it always has at least one. The invariant must hold when it is added, and from then on every `fact`, `retract`, and `rule` form is checked against it. A form that would break an invariant fails and changes nothing.

```json
["begin",
  ["relation", "order", ["id", "status"], {"key": "id"}],
  ["relation", "cancelled", ["id"]],
  ["fact", ["order", 1, "open"], ["order", 2, "shipped"]],
  ["invariant", ["and", ["order", "?id", "shipped"], ["cancelled", "?id"]], {"assert": "none"}],
  ["fact", ["cancelled", 1]],
  ["fact", ["order", 1, "shipped"]]]
```

Fails with `Adding this fact breaks an invariant, so nothing changed. The invariant expected no answers but found 1, such as {"id":1}: ["and",["order","?id","shipped"],["cancelled","?id"]].` Order 1 is still open.

- The goal can be anything a query can ask, including relations that rules derive, `not`, aggregates, and graph algorithms. It is answered the same way a query is, goal-directed when it has known arguments.
- A form is checked once it has made all of its changes, so one `fact` form can add several facts that only keep an invariant together. Separate forms in a `begin` are separate changes, each checked on its own.
- If checking an invariant fails, for example because `graph/topologicalOrder` finds a cycle, the change is undone too.
- Invariants take only the `"assert"` option, read as written. Like rules, they cannot be removed.
- A change to facts is checked against the invariants that read what it changed. An invariant that expects no answers, and whose goal matches the rows of the relation that changed, is asked about the new rows alone, so checking a write does not cost more as the relation grows. Which invariants are asked never changes whether a change is kept. An invariant that calls a function the host added is asked in full after every change, since Lion cannot see what such a function reads; see [Host functions in rules](#host-functions-in-rules).
- When an invariant's goal says an answer fails a [schema](#schemas), the message ends with where the answer does not fit.
- Snapshots write invariants after the rules, so loading one checks them against the whole database.

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

- Each match of a rule body counts once. A match that several alternatives of one `or` find counts once, and separate rules for the same relation add up. Adding a rule the database already holds changes nothing, so its matches never count twice.
- A group exists only when something matches, so a count is never `0`. To count what may be nothing, aggregate a `find`: `["rule", ["activity", "?c", ["aggregate/count", ["find", "?id", ["order", "?id", "?c", "?_"]]]], ["customer", "?c"]]` gives every customer a count, `0` included.
- An aggregate can combine computed values, such as `["aggregate/sum", ["number/multiply", "?price", "?quantity"]]`, or a constant: `["aggregate/count", 1]` counts the matches.
- An aggregate call combines a rule's matches only as a whole argument of the head, and only when its argument is not a `find`. Anywhere else, in a body or inside another call, it combines the list it is given: `["=", "?n", ["aggregate/count", "?tags"]]` counts the items of `?tags` for each match.
- An aggregate of a `find` combines what the `find` found, wherever it is written: in a rule, in a query, or in plain code, as in `["aggregate/sum", ["find", "?amount", ["order", "?_", "?_", "?amount"]]]`.
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
- An input such as `start` is a value, or a variable that another goal binds. The algorithm then runs once for each value: `["and", ["depot", "?from"], ["graph/shortestPath", "road", "?from", "d", "?km", "?_"]]` finds the distance to `d` from every depot.
- Output terms can be variables or values, so `["graph/shortestPath", "road", "a", "d", "?km", "?_"]` asks for one distance.
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
  ["rule", ["path", "?x", "?z"], ["path", "?x", "?y"], ["edge", "?y", "?z"]],
  ["query", ["path", 2997, "?to"]]]
```

Evaluates to `[{ "to": 2998 }, { "to": 2999 }, { "to": 3000 }]` in milliseconds. Computing `path` in full would derive about 4.5 million rows.

- Known arguments are values, variables the query has already bound with a relation, `=`, or `in`, and values computed from them, as in `["and", ["start", "?s"], ["path", ["number/add", "?s", 1], "?to"]]`. Inside a rule only values and variables bound from facts count, so a rewritten rule never asks about values without end.
- How a recursive rule is written matters. With a known start, recursion on the left, as in `["path", "?x", "?y"], ["edge", "?y", "?z"]`, asks only about that start. Recursion on the right, as in `["edge", "?x", "?y"], ["path", "?y", "?z"]`, asks about every node the paths pass through, which can cost as much as full evaluation.
- Relations that are aggregated, computed by an algorithm, or asked about, under `not`, in a `find`, or as a value, are derived in full, along with everything they depend on.
- A relation is derived the first time something reads it, and kept until a fact or rule changes, so a query never pays for relations it does not read.
- The answers are the same either way, but they can come in a different order. Use the `"order"` query option when order matters. A goal-directed query also never fails on a row it does not derive, where full evaluation would.
- `why` explains facts with every relation computed in full.
- Pass `{ database: new LogicDatabase({ goalDirected: false }) }` to `run` to derive every row of the relations a query reads instead.

### Snapshots

`["snapshot"]` returns a Lion program that rebuilds the current database: a `relation` form for every relation, a `schema` form for the schemas each `schema` form declared, a `fact` form with the facts of each relation, every `rule`, and every `invariant`. Evaluating the program into an empty database gives the same answers, so a snapshot is a save file that is also ordinary Lion you can read, edit, diff, and run.

```json
["begin",
  ["relation", "edge", ["from", "to"]],
  ["relation", "path", ["from", "to"]],
  ["fact", ["edge", "a", "b"], ["edge", "b", "c"]],
  ["rule", ["path", "?x", "?y"], ["edge", "?x", "?y"]],
  ["snapshot"]]
```

Evaluates to `["begin", ["relation", "edge", ["from", "to"]], ["relation", "path", ["from", "to"]], ["fact", ["edge", "a", "b"], ["edge", "b", "c"]], ["rule", ["path", "?x", "?y"], ["edge", "?x", "?y"]]]`.

- Strings that would evaluate to something else when loaded, such as relation names, names bound in the environment, namespaced names like `"number/add"`, and `?variable` names, are written inside `quote`. So are lists and records.
- Rules are written as they were evaluated. A name like `budget` in a rule appears as its value, and a function appears under the name the environment gives it: with `plus` defined as `number/add`, `["plus", "?x", 1]` is written `["number/add", "?x", 1]`.
- A waiting `cond`, `match`, or record is written as it was, and a lambda as its `lambda` form. A name in it that would not evaluate to the same value when loaded is bound by a lambda around it, as in `[["lambda", ["limit"], ["cond", [["number/greaterThan", "?a", "limit"], "big"], ["else", "small"]]], 100]`.
- A function that another function built is written as the call that built it: `["func/partial", "number/add", 1]`, or `["schema/arrayOf", "value/number?"]`.
- A schema is written with the form of its shape. A name in it that would not evaluate to the same value when loaded is bound by a lambda around it, as in a waiting form. Schemas that one form declared are written in one form, so they can name each other when it is loaded. The schema of a relation's rows is written as the invariant it stands for.
- A snapshot cannot write a lambda that calls itself, or a function that the environment does not name and that is not a lambda or built by a function it can write. `snapshot` then fails with an error that names the function.

From TypeScript, `saveDatabase(database)` and `loadDatabase(program, environment)` from `@lionlang/core/logic/snapshot` do the same:

```ts
import { readFileSync } from "node:fs";
import { run } from "@lionlang/core/evaluation/evaluate";
import { loadDatabase, saveDatabase } from "@lionlang/core/logic/snapshot";
import { stdlib } from "@lionlang/core/modules";
import { Effect } from "effect";

const saved = JSON.parse(readFileSync("store.json", "utf8"));

const program = Effect.gen(function* () {
  const database = yield* loadDatabase(saved, stdlib);
  const rows = yield* run(["query", ["path", "a", "?to"]], stdlib, { database });
  return { rows, saved: yield* saveDatabase(database) };
});
```

### Guarantees

Rules are checked when they are added:

- Every variable in a rule head or a filter must first be bound by a relation goal, `=`, `in`, or `schema/fits?`. So must every input of an algorithm goal, and an input must be data.
- A question, a goal under `not`, a goal used as a value, or a `find`, waits for the variables the rule binds. Any other variable in it is its own, and the question must bind it itself.
- A rule cannot ask a question about a relation that depends on its own head, so every program has a single well-defined answer. Negation is one such question.
- Aggregation goes through recursion only with the lattice aggregates `min`, `max`, `shortest`, and `union`, and only when every relation in the cycle aggregates. Any other aggregate runs once its inputs are complete.
- A recursive rule cannot compute new values for its head columns, in the head itself or through `=` or `in`, so evaluation always finishes. Values that come from facts, such as `["=", "?m", "?to"]` with `?to` from a relation, are fine. Recursion through a lattice aggregate stops when no value improves, or fails with an error after 10,000 rounds.

A form that changes the database, `fact`, `retract`, or `rule`, either makes all of its changes or fails and makes none of them. When the database has [invariants](#invariants), a change that breaks one is undone the same way.

Nothing is guessed at: a filter must be true or false, and the rows a rule derives and the answers a query gives must be JSON data. Anything else is an error that shows the call or the value.

Adding what the database already holds changes nothing: a fact that is already there, a relation or schema declared the same way, or a rule or invariant that a snapshot would write the same way. Rules and invariants hold values as they were evaluated, so `["limit", "k"]` with `k` bound to 3 is the same rule as `["limit", 3]`, and `["plus", "?x", 1]` with `plus` bound to `number/add` is the same rule as `["number/add", "?x", 1]`, while the variable `"?x"` and the string `["quote", "?x"]` differ. Running a program again, or loading a snapshot onto the database it came from, keeps one copy of each.

Answers are computed bottom-up with semi-naive evaluation, one relation at a time as something reads it, goal-directed when a query has known arguments, and kept until a fact or rule changes. What the database has already derived never changes an answer. Each `run` starts from an empty database; pass `{ database: new LogicDatabase() }` as the third argument to share relations, schemas, facts, rules, and invariants across runs. The database's relations and schemas are bound by name in every run that uses it, unless the environment binds the same name.

## Schemas

A schema says what a value must be. Anything is a schema, and one rule says what fits it:

- A function is a predicate: a value fits when the function returns `true`. `value/number?` is one, and so is a lambda, a relation with one column, and a schema with a name.
- A record fits a record with the same keys, with values that fit.
- A list fits a list of the same length, item by item.
- Any other value fits a value equal to it.

So data is a schema for itself: it fits exactly the values equal to it. A function in it makes room for every value the function accepts, `schema/optional` for a key that can be left out, and `schema/open` for keys the record does not name.

`["schema/fits?", value, schema]` asks whether a value fits. `["schema/problems", value, schema]` lists every place where it does not, and `["schema/assert", value, schema]` returns the value when it fits and fails when it does not. `["schema", name, shape]` gives a schema a name, and the name is then a predicate: `["Order", value]`.

```json
["begin",
  ["schema", "Line",
    {"sku": "value/string?",
     "qty": ["schema/allOf", "value/integer?", ["lambda", ["n"], ["number/greaterThan", "n", 0]]]}],
  ["schema", "Order",
    {"id": "value/integer?",
     "status": ["schema/anyOf", "open", "shipped"],
     "lines": ["schema/arrayOf", "Line"],
     "note": ["schema/optional", "value/string?"]}],
  ["define", "good", ["quote", {"id": 7, "status": "open", "lines": [{"sku": "a1", "qty": 2}]}]],
  ["define", "bad", ["quote", {"id": 8, "status": "opne", "lines": [{"sku": "a1", "qty": 2}, {"sku": "b2", "qty": 0}], "rush": true}]],
  {"good": ["Order", "good"],
   "bad": ["schema/fits?", "bad", "Order"],
   "problems": ["schema/problems", "bad", "Order"]}]
```

Evaluates to `{ "good": true, "bad": false, "problems": [{ "path": ["lines", 1, "qty"], "expected": ["lambda", ["n"], ["number/greaterThan", "n", 0]], "found": 0 }, { "path": ["rush"], "found": true }, { "path": ["status"], "expected": ["schema/anyOf", "open", "shipped"], "found": "opne" }] }`.

With the same schemas, `["schema/assert", ["quote", {"id": "7", "status": "open", "lines": []}], "Order"]` fails with `{"id":"7","status":"open","lines":[]} does not fit "Order": "id" must fit "value/integer?" but is "7".`

### Building schemas

| Function | The schema it builds fits |
|---|---|
| `["schema/anyOf", schema, ...]` | A value that fits at least one of the schemas. Of plain values, it is a list of choices: `["schema/anyOf", "open", "shipped"]`. |
| `["schema/allOf", schema, ...]` | A value that fits every one of the schemas. |
| `["schema/arrayOf", schema]` | A list whose every item fits the schema. |
| `["schema/recordOf", schema]` | A record whose every value fits the schema. |
| `["schema/optional", schema]` | As the schema of a record's key, lets the key be left out. A key that is there must fit. |
| `["schema/open", record]` | A record that fits the record of schemas, whatever other keys it has. |

- What these functions build is a function like any other, so it can be called, as in `[["schema/arrayOf", "value/number?"], "items"]`, and given to `array/map` or `match`.
- A predicate that fails, or returns anything but `true`, does not fit. So `["lambda", ["n"], ["number/greaterThan", "n", 0]]` needs no check that `n` is a number first: a string does not fit it.
- A string is a name before it is a string, as everywhere in Lion. `"open"` is the string unless something is bound to `open`, and `["quote", "open"]` is always the string.
- A misspelled name is an error, and not a schema that nothing fits: `"value/intger?"` as a schema fails with `Nothing is bound to "value/intger?". Did you mean "value/integer?"?`, and so does a misspelled name inside a predicate, where any other failure means the value does not fit. See [Primitives](#primitives).
- Data is a schema for itself: `["schema/fits?", "x", ["quote", {"a": [1, 2]}]]` holds when `x` is the record `{"a": [1, 2]}`.
- A relation is a schema when it has one column: a value fits `person` when `["person", value]` has a match. A relation with more columns is not the schema of one value, and using it as one is an error.
- `value/any?` fits every value. `["schema/anyOf", "value/string?", null]` fits a string or `null`.
- A problem has a `path`, the keys and positions that lead to the part that does not fit. A part with the wrong value has what was `expected`, a schema written as the expression that makes it, and what was `found`. A part that is missing has only `expected`, and a key the schema does not name has only `found`. Problems come in the order of their paths.
- `schema/anyOf` reports one problem, at the value that fits none of its schemas. `schema/allOf` reports the problems of every schema the value does not fit.

### Named schemas

`["schema", "Order", shape]` declares a schema in the logic database and binds `Order` to it, the way `relation` declares a relation.

- The shape is evaluated once, when the schema is declared, with the values its names have then. Redefining a name afterwards does not change the schema, as it does not change a rule.
- A shape can name its own schema, so a schema can describe nested data: `["schema", "Tree", {"value": "value/number?", "children": ["schema/arrayOf", "Tree"]}]`.
- One form can declare several schemas, `["schema", name, shape, name, shape, ...]`, and the shape of each can name any of them, so schemas can be defined in terms of each other:

  ```json
  ["begin",
    ["schema",
      "Expr", ["schema/anyOf", "value/number?", "Sum"],
      "Sum", {"add": ["schema/arrayOf", "Expr"]}],
    {"fits": ["Expr", ["quote", {"add": [1, {"add": [2, 3]}]}]],
     "does not": ["Expr", ["quote", {"add": [1, {"add": [2, "x"]}]}]]}]
  ```

  Evaluates to `{ "fits": true, "does not": false }`.
- A value fits only when that follows from the shapes in finitely many steps, so a schema that comes back to itself without going into the value does not fit: only `1` fits `["schema", "Loop", ["schema/anyOf", "Loop", 1]]`.
- What a name in a shape means is settled when the shape is declared. A name that nothing has yet is a plain string, and nothing can be declared under it afterwards: declaring `Line` after an `Order` whose shape says `"Line"` fails, and says to declare `Line` first, to declare the two in one form, or to write `["quote", "Line"]` for the string.
- A shape can name the schemas of its form, but cannot call them: `["Expr", 1]` inside the form fails, since `Expr` has no shape yet. `["schema/open", "Sum"]` takes the name as it is, and a check fails if `Sum` turned out not to be a record.
- A shape cannot ask the database while it is declared, since a snapshot writes the shape and it has to mean the same when it is loaded. To check a value against the facts, use a relation as a schema, or ask inside a lambda.
- Declaring a schema again, for example in a later `run` that shares the database, must repeat the same shape, and changes nothing. A schema and a relation cannot share a name.
- A named schema that is `schema/optional` lets a record's key be left out, and `schema/open` takes a named record schema, like the schemas they name.

### Taking data apart

A logic variable in a schema stands for a value. Once it is bound it is that value, and until then any value fits it, and binds it. So in a rule or query a schema is also a pattern: it tests a value and takes it apart at once. These goals bind the variables in a pattern:

- `["schema/fits?", value, schema]` binds the variables in the schema.
- A relation call binds the variables in its arguments. Each argument is a schema for its column, so `["inbox", {"type": "refund", "id": "?id"}]` asks for the rows that fit.
- `["=", a, b]` and `["in", element, list]` bind the variables in a record or list, on either side of `=` or as the element. They compare values, so a function in the record is a value there, and not a predicate.

```json
["begin",
  ["relation", "inbox", ["doc"]],
  ["fact",
    ["inbox", ["quote", {"type": "order", "id": 1, "lines": [{"sku": "a1", "qty": 2}, {"sku": "b2", "qty": 1}]}]],
    ["inbox", ["quote", {"type": "order", "id": 2, "lines": [], "rush": true}]],
    ["inbox", ["quote", {"type": "refund", "id": 3}]]],
  {"refunds": ["query", ["inbox", {"type": "refund", "id": "?id"}]],
   "orders": ["query", ["inbox", ["schema/open", {"type": "order", "id": "?id"}]], {"order": "id"}],
   "lines": ["find", ["array/make", "?order", "?sku", "?qty"],
     ["and",
       ["inbox", ["schema/open", {"id": "?order", "lines": "?lines"}]],
       ["in", {"sku": "?sku", "qty": "?qty"}, "?lines"]]],
   "ends": ["query", ["=", ["array/make", "?first", "?_", "?last"], ["quote", ["a", "b", "c"]]]]}]
```

Evaluates to `{ "refunds": [{ "id": 3 }], "orders": [{ "id": 1 }, { "id": 2 }], "lines": [[1, "a1", 2], [1, "b2", 1]], "ends": [{ "first": "a", "last": "c" }] }`.

- A record in a pattern is a record schema: it fits a record with the same keys. `schema/open` takes the keys it names from a record that has more, as `orders` does above, where the second order also has `rush`.
- `?_` fits any value and binds nothing. A variable that occurs twice must take the same value: `{"a": "?x", "b": "?x"}` fits `{"a": 1, "b": 1}` and not `{"a": 1, "b": 2}`.
- Every `schema` function works in a pattern. `["schema/allOf", "value/integer?", "?id"]` binds `?id` only to an integer. `["schema/anyOf", a, b]` gives the answers of every schema that fits, each once: `["schema/anyOf", ["schema/open", {"a": "?x"}], ["schema/open", {"b": "?x"}]]` binds `?x` to 1 and then to 2 for `{"a": 1, "b": 2}`.
- An argument of a relation call that is not data is a schema like any other. With readings of `30`, `10`, and `"n/a"`, `["reading", "?sensor", "value/number?"]` asks for the two that are numbers, and `["and", ["limit", "?max"], ["reading", "?sensor", ["func/partial", "number/lessThan", "?max"]]]` for those above the limit.
- A variable can hold a schema. After `["=", "?ends", ["schema/anyOf", 2, 5]]`, the goal `["path", "?from", "?ends"]` asks for the paths that end in 2 or in 5.
- The order of the goals does not matter. A goal that binds through a pattern gives what the same goal gives when another goal has bound its variables first.
- `["schema/open", "?shape"]` does not bind `?shape`: it waits for another goal to bind it to a record of schemas.
- In plain code, where no rule or query is there to bind anything, a check with a variable in it is a goal, like `=` with one: `["schema/fits?", 1, "?x"]` evaluates to the goal, and `["query", ["schema/fits?", 1, "?x"]]` to `[{ "x": 1 }]`.
- `why` explains a rule's answer by the rows its goals matched, also when a goal says which rows with a schema.

### Schemas in rules and queries

A schema check is a call like any other. It waits for logic variables, so it is a filter in a rule or query, it works under `not` and in a `find`, and its value can go in a rule head. `schema/problems` gives a list, so `in` turns the problems of a value into rows.

```json
["begin",
  ["relation", "inbox", ["doc"]],
  ["relation", "order", ["id", "status"], {"key": "id"}],
  ["relation", "rejected", ["doc", "where"]],
  ["schema", "Order", {"id": "value/integer?", "status": ["schema/anyOf", "open", "shipped"]}],
  ["fact",
    ["inbox", {"id": 1, "status": "open"}],
    ["inbox", {"id": 2, "status": "opne"}],
    ["inbox", {"id": "3", "status": "shipped"}]],
  ["rule", ["order", "?id", "?status"],
    ["inbox", ["schema/allOf", "Order", {"id": "?id", "status": "?status"}]]],
  ["rule", ["rejected", "?doc", ["object/get", "?problem", "path"]],
    ["inbox", "?doc"], ["in", "?problem", ["schema/problems", "?doc", "Order"]]],
  {"orders": ["query", ["order", "?id", "?status"]],
   "rejected": ["query", ["rejected", "?doc", "?where"], {"order": "where"}],
   "how many": ["aggregate/count", ["find", "?doc", ["and", ["inbox", "?doc"], ["not", ["Order", "?doc"]]]]]}]
```

Evaluates to `{ "orders": [{ "id": 1, "status": "open" }], "rejected": [{ "doc": { "id": "3", "status": "shipped" }, "where": ["id"] }, { "doc": { "id": 2, "status": "opne" }, "where": ["status"] }], "how many": 2 }`.

- A schema check gives in a rule what it gives in plain code with the rule's variables in place. A logic variable inside a schema is its value once it is bound, and is bound by the value it meets until then: see [Taking data apart](#taking-data-apart).
- A check written first guards what comes after it, like any filter: a rule that starts with `["inbox", "?doc"], ["Order", "?doc"]` can go on with a filter that needs `id` to be a number.
- A predicate can be made from a rule's variable, as `["func/partial", "number/lessThan", "?max"]` is, or as a lambda that mentions `?max`. It is the predicate made from the variable's value.
- `["schema/assert", "?doc", "Order"]` as a value in a rule fails the query that runs the rule when a value does not fit.
- `why` shows a check that held as `{ "check": ["Order", ["quote", { "id": 1, "status": "open" }]] }`.
- A schema as a goal needs its value bound: `["query", ["Order", "?doc"]]` is an unsafe goal, since a schema cannot list the values that fit it.

A relation with one column is a predicate, so it is a schema: a value fits `person` when `["person", value]` has a match. A schema that holds a relation asks the database when it checks a value, in plain code and in rules, and a rule cannot use a schema that asks about the relation the rule derives.

### The schema of a relation's rows

The relation option `{"schema": "Order"}` says that every row must fit a declared schema. A row is checked as a record of its columns, the way a query answers.

```json
["begin",
  ["schema", "Order", {"id": "value/integer?", "status": ["schema/anyOf", "open", "shipped"]}],
  ["relation", "order", ["id", "status"], {"key": "id", "schema": "Order"}],
  ["fact", ["order", 1, "open"]],
  ["fact", ["order", 2, "opne"]]]
```

Fails with `Adding this fact breaks an invariant, so nothing changed. The invariant expected no answers but found 1, such as {"id":2,"status":"opne"}: ["and",["order","?id","?status"],["not",["Order",{"id":"?id","status":"?status"}]]]. {"id":2,"status":"opne"} does not fit "Order": "status" must fit ["schema/anyOf","open","shipped"] but is "opne".` Order 1 is still there, and order 2 was not added.

- The option stands for the [invariant](#invariants) the message shows, and is nothing more: `["invariant", ["and", ["order", "?id", "?status"], ["not", ["Order", {"id": "?id", "status": "?status"}]]], {"assert": "none"}]`. So it is kept like every invariant: a `fact`, `retract`, or `rule` form that would leave a row that does not fit fails and changes nothing, rows that rules derive are checked too, and a snapshot writes it as that invariant.
- Any invariant or query assertion whose goal says an answer fails a schema, with `["not", [schema, value]]` or `["not", ["schema/fits?", value, schema]]`, ends its message with where the first answer does not fit.
- A relation as the schema of a column is a foreign key. With `["schema", "Kin", {"parent": "person", "child": "person"}]` and `["relation", "parent", ["parent", "child"], {"schema": "Kin"}]`, a `parent` fact needs both people to be there, and retracting a person who is still a parent fails with `"child" must fit "person" but is "ben"`. One `fact` form can add a person and their parent together.
- The option names a schema that is already declared, and is read as written, like the key. A row is a record of every column, so the schema names every column, or is a `schema/open` record that names some. Declaring the relation again with the option adds the invariant if the database does not hold it, and it must hold for the rows that are there.
- Checking a write costs what its new rows cost. An invariant is asked again only after a change to a relation it reads, and one that says no row of a relation fails a test, as a relation's schema does, is asked about the new rows alone.

### Data from outside

Schemas let a program take in data it does not trust. From TypeScript, bind the data to a name in the environment and check it there, or add it as a fact and let rules sort it:

```ts
const database = new LogicDatabase();
await Effect.runPromise(run(setup, stdlib, { database }));

const problems = await Effect.runPromise(
  run(["schema/problems", "incoming", "Order"], { ...stdlib, incoming }, { database })
);
```

An empty list means `incoming` fits. Schemas are data like the rest of a Lion program, so they can be written, stored, and changed while the program runs, and a snapshot saves the ones a database holds.

## Standard Library

The default environment exported as `stdlib` namespaces entries as `<module>/<name>`.

Every function takes a set number of arguments. A call with any other number fails and says how many the function takes, so no argument is dropped and none is missing:

```json
["number/subtract", 10, 3, 1]
```

Fails with `"number/subtract" takes 2 arguments but got 3.` The call fails the same way where it waits for a logic variable, in a rule, a query, or a `find`. A relation, a schema, and a graph algorithm say the same of their own arguments, as in `"edge" takes 2 arguments (from, to) but got 3.`

Six functions combine one or more arguments, as `+`, `*`, `min`, `max`, `string-append`, and `append` do in Scheme: `number/add`, `number/multiply`, `number/min`, `number/max`, `string/concat`, and `array/concat`. They work from left to right, so `["number/add", 1, 2, 3]` is `["number/add", ["number/add", 1, 2], 3]`. The functions that pass arguments on take any number after the ones they need: `array/make`, `func/partial`, `func/bind`, `func/apply`, `object/new`, `object/call-method`, `object/call-method-path`, `schema/allOf`, and `schema/anyOf`.

### `number`

```json
["number/add", 1, 2]
["number/add", 1, 2, 3]
["number/subtract", 10, 3]
["number/multiply", 5, 4]
["number/divide", 20, 4]
["number/equals?", 5, 5]
["number/lessThan", 3, 5]
["number/greaterThan", 5, 3]
["number/lessThanOrEqualTo", 3, 5]
["number/greaterThanOrEqualTo", 5, 5]
["number/remainder", 7, 3]
["number/power", 2, 10]
["number/min", 3, 5]
["number/max", 3, 5, 4]
["number/absolute", -4]
["number/floor", 2.7]
["number/ceiling", 2.1]
["number/round", 2.5]
["number/toString", 42]
["number/toString", 1234567.5, ","]
["number/fromString", "1,234,567.5", ","]
```

Arithmetic whose result is not a finite number, such as division by zero, fails with `ArithmeticError`.

`number/toString` is the number as text, the way JSON writes it: `"42"`, `"-0.5"`, `"1e+21"`. With a second argument, a string, the whole part is written in groups of three digits with that string between them, as `#:group-sep` does in Racket: `["number/toString", 1234567.5, ","]` is `"1,234,567.5"`, and `["number/toString", -1234, " "]` is `"-1 234"`. The digits after the point and a number written with an exponent stay as they are. With `string/concat` it builds text from a number, also from one a rule has bound:

```json
["rule", ["label", "?id", ["string/concat", "order ", ["number/toString", "?id"]]],
  ["order", "?id", "?_"]]
```

`number/fromString` reads text as a number, as `string->number` does in Scheme, and is `null` when the text is not one number: `["number/fromString", "-0.5"]` is `-0.5`, and `["number/fromString", "12 apples"]` is `null`. It reads what JSON writes, and also zeros before the digits and `"−"` as the minus sign. With a second argument, the whole part may be in groups of three digits with that string between them, so it reads back what `number/toString` writes with the same string: `["number/fromString", "1,234,567.5", ","]` is `1234567.5`, `"1234"` is still `1234`, and `"12,34"` is `null`. A number too large for JSON, such as `"1e999"`, is `null`.

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

Called on a list, each function combines it. Called on anything else, it waits for the list its argument turns out to be; a `find` is the list of what it found. Only as a whole argument of a rule head, and not on a `find`, it combines the rule's matches instead. See [Aggregates](#aggregates).

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
["array/concat", ["array/make", 1], ["array/make", 2], ["array/make", 3]]
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
["string/concat", "lion", "-", "ized", "!"]
["string/startsWith", "lion", "li"]
["string/endsWith", "lion", "on"]
["string/includes", "lion", "io"]
["string/indexOf", "lion", "o"]
["string/join", ["array/make", "a", "b", "c"], ", "]
["string/join", ["array/make", "a", "b", "c"], ", ", " and "]
["string/split", "a,b,c", ","]
["string/padStart", "7", 2, "0"]
["string/padEnd", "7", 3, "."]
["string/numbers", "$1,250.5M in fiscal 2023-24, down -3%", ","]
```

`string/join` is a list of strings with the separator between them: `"a, b, c"`. With a third string, that one stands before the last item in place of the separator, as `#:before-last` does in Racket: `"a, b and c"`, and `"a and b"` for two items. One item is itself, and an empty list is `""`. Every item must be a string, so a list of numbers is joined after `["array/map", numbers, "number/toString"]`.

`string/split` is the parts of the text between each separator, as JavaScript splits: `["a", "b", "c"]`. Joining the parts with the same separator gives the text back. `string/padStart` and `string/padEnd` make the text as long as the number says by putting copies of the last argument before it or after it, as JavaScript does: `"07"` and `"7.."`. Text that is already that long is unchanged.

`string/numbers` is every number written in the text, in order, each read as `number/fromString` reads it, with the same optional separator: the example is `[1250.5, 2023, 24, -3]`. A minus sign counts only where no letter, digit, or point stands right before it, so the range `2023-24` holds 2023 and 24, and `COVID-19` holds 19. Words for amounts, such as "million", are not read: `"$1.2 billion"` holds `1.2`. It is how a program can check that a figure was copied from the words it is said to come from, rather than worked out by whoever copied it.

### `object`

```json
["object/get", {"a": 1}, "a"]
["object/get-path", {"a": {"b": {"c": 42}}}, "a.b.c"]
["object/keys", {"a": 1, "b": 2}]
["object/values", {"a": 1, "b": 2}]
["object/set", {"a": 1}, "b", 2]
["object/remove", {"a": 1, "b": 2}, "b"]
["object/json-stringify", {"a": 1}, null, 2]
["object/get-method", "obj", "methodName"]
["object/call-method", "obj", "methodName", 1, 2]
["object/get-method-path", "obj", "nested.methodName"]
["object/call-method-path", "obj", "nested.methodName", 1, 2]
["object/new", "SomeClass", "arg1", "arg2"]
```

`object/get-path` understands dot paths and numeric array segments such as `"users.1.name"`.

`object/set` and `object/remove` give a new record, as `hash-set` and `hash-remove` do in Racket: `{"a": 1, "b": 2}` with the key set to the value, and `{"a": 1}` without the key. The record they are given is unchanged, removing a key it does not hold gives the same record, and a key is any string a record can hold, so `"__proto__"` is refused.

`object/json-stringify` writes any JSON value: a record, a list, a string, a number, a boolean, or `null`. The text of a string has its quotes, so `["object/json-stringify", "lion"]` is `"\"lion\""`, and the text of a number is the number, as `number/toString` gives it. The replacer and the indent are optional. A value JSON cannot write, such as a function, fails with `"number/add" has no JSON text.`

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

`func/partial` gives a function that behaves like the one it wraps: calling it is calling that function with the first arguments filled in, so made from a relation, it builds goals. Made from a predicate, it is a [schema](#schemas): `["func/partial", "number/lessThan", 0]` fits a number above 0.

### `value`

```json
["value/function?", "x"]
["value/number?", 1]
["value/integer?", 1]
["value/string?", "lion"]
["value/boolean?", true]
["value/object?", {"a": 1}]
["value/array?", ["array/make", 1, 2]]
["value/null?", null]
["value/any?", 42]
["value/identity", 42]
```

`value/any?` is true for every value. `value/undefined?` and `value/symbol?` are mainly useful when Lion is evaluating host values supplied through the environment.

### `schema`

Checks values against [schemas](#schemas), and builds schemas out of others.

```json
["schema/fits?", 3, "value/number?"]
["schema/problems", {"id": "x"}, {"id": "value/integer?", "name": "value/string?"}]
["schema/assert", 3, "value/number?"]
["schema/anyOf", "value/string?", null]
["schema/allOf", "value/integer?", ["lambda", ["n"], ["number/lessThan", "n", 3]]]
["schema/arrayOf", "value/number?"]
["schema/recordOf", "value/number?"]
["schema/optional", "value/string?"]
["schema/open", {"id": "value/integer?"}]
```

The second evaluates to `[{ "path": ["id"], "expected": "value/integer?", "found": "x" }, { "path": ["name"], "expected": "value/string?" }]`.

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

### Host functions in rules

A host function needs nothing to work in rules and queries. Like every function, it waits when it is called with a logic variable, and it can return a value or an Effect:

```ts
const env = { ...stdlib, "text/upper": (text: string) => text.toUpperCase() };
// ["rule", ["shout", ["text/upper", "?word"]], ["word", "?word"]]
```

A goal given to a host function is asked first, so the function receives `true` or `false`. A host function that takes a Lion function, such as a lambda or a relation, calls it with `call`, which gives the callback's value and lets the whole call wait when that value is not known yet:

```ts
import { call } from "@lionlang/core/evaluation/special-forms/function";

const env = {
  ...stdlib,
  "list/keep": (items: unknown[], keep: unknown) =>
    Effect.filter(items, (item) =>
      Effect.map(call(keep, item), (kept) => kept === true)
    ),
};
// ["list/keep", ["array/make", "ana", "bo"], "member"]
```

Lion cannot see what a host function reads when it runs. An [invariant](#invariants) whose goal calls one, in the goal itself, inside a schema, or through a rule, is asked in full after every change to facts, where any other invariant is asked only about what a change can have broken. A host function that reads nothing but its arguments can say so, and is then treated like a function of the standard library:

```ts
import { readsOnlyArguments } from "@lionlang/core/logic/terms";

const upper = (text: string) => text.toUpperCase();
readsOnlyArguments({ upper });
const env = { ...stdlib, "text/upper": upper };
```

To write a function that takes logic variables as they are and builds a goal from them, mark it with `logicFunction`:

```ts
import { LogicForm, logicFunction } from "@lionlang/core/logic/terms";

const same = logicFunction((left: unknown, right: unknown) =>
  Effect.succeed(new LogicForm("=", [left, right]))
);
```

### Custom algorithms

`defineAlgorithm` turns a TypeScript function into an algorithm goal like those in the `graph` module. It receives the tuples of each relation input and the value of each other input, and returns the output rows, or a string that explains why it cannot. When a value input is a variable that another goal binds, the function runs once for each combination of values.

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

## Research Skill

[`skills/lion-research`](skills/lion-research/SKILL.md) is an agent skill that uses Lion as the working memory of a deep research run. The agent records what each source says as facts, with the quote that carries it, and writes rules that derive its conclusions, so the model is a materialized view of the research: [`why`](#forms) traces any conclusion to quoted sources, [invariants](#invariants) reject malformed evidence, and the agent's assumptions are rules that the evidence can contradict.

The skill ships a core program, [`assets/core.json`](skills/lion-research/assets/core.json), that says who stands behind each answer. Only a publisher who gives an answer first-hand counts, so three articles that repeat one press release are one voice, an answer that every source credits to someone else is second-hand, and a source credited with something it does not say is a misquote. A publisher's later word replaces its earlier one, so a figure a company corrected in its annual report is a restatement, not a dispute with its own press release, and whoever still repeats the earlier figure is set aside with it.

The core also checks that figures are verifiable, in the way a finance desk would want. Every number in a claim must be written in the words quoted for it, read with [`string/numbers`](#string), so a figure that was mistyped or converted on the way in is listed; the agent copies "$1.2 billion" as written and a rule converts it. A word used in more than one sense, such as revenue as reported and revenue excluding fuel surcharges, is a reading the frame declares: the core lists the questions that sources answer in more than one sense, the agent asks the reader which they mean instead of choosing, and every rule that reaches the question through `meant` follows the choice. `why` on a computed figure shows its arithmetic on the line items it used, and each quote on the page opens in its place in the saved text of its source.

A run ends with `explorer.html`, one page that holds the model and the evaluator, made for the person who asked for the research and knows nothing of Lion. The agent designs the page for that person's goal, as a plan of views and blocks: answers in plain words with the evidence under each, key figures, timelines, comparison grids, and lookups, where the reader picks from a list and gets the answer. The plan states no facts. Its summary, answers, and figures are Lion expressions that the page works out from the model each time it opens, and a lookup is a Lion function of what the reader chose. It says how solid each finding is, lists every source with its quotes, and keeps a query editor for readers who do know Lion.

To use it with Claude Code, link or copy the folder into your skills:

```bash
ln -s "$(pwd)/skills/lion-research" ~/.claude/skills/lion-research
```

Its scripts do the mechanical parts: `record.mjs` turns notes on what sources said into a step and refuses a quote that is not in the saved text of its source, `replay.mjs` rebuilds the model from its steps, `check-quotes.mjs` checks every quote in a finished model, and `build-explorer.mjs` builds the page.

The explorer page runs a bundle of `@lionlang/core`. After changing the core evaluator, rebuild it:

```bash
bun build skills/lion-research/scripts/engine.ts --target browser --format iife --minify --outfile skills/lion-research/assets/lion-engine.js
```

The properties in `packages/metrics/src/tests/research-skill.test.ts` check the core program against a plain model of provenance and restatement, its figure check against the numbers written into a quote, its readings against a plain model of senses and choices, its two time functions against JavaScript's clock, and its scripts: the explorer page against the model, plan, and saved texts it was given, a reader's choice in a lookup against the data it stands for, the wording functions against plain ones, the recorder against the notes it was given, the page reader against what a reader sees, the quote check against quotes that are and are not in a source's text, where a quote stands against the text it was found in, the page check against every text and query of a plan, and each script started through a link, as an installed skill starts it.

The skill has two evals. `researches-recent-outage` researches a live event on the web. `verifies-company-figures` works from a frozen corpus of seven made-up sources about one company, written with the traps a financial analyst meets: a figure restated in a later filing, revenue in two senses and two periods, a figure in billions, a misquote, a chain of relays, a disputed count, and a margin to work out. Its known answers, in `answers.json`, are checks on a finished run, each for one stage: reading the sources, framing the model, its conclusions, the page, and the report. `grade.mjs` grades a run by stage, so a failure says which stage went wrong, and a property replays the case's reference run and checks that leaving out any one source fails exactly the checks that rest on it.

```bash
node skills/lion-research/evals/verifies-company-figures/grade.mjs research/tarnwell
```

## Reasoning Skill

[`skills/lion-reasoning`](skills/lion-reasoning/SKILL.md) is an agent skill that uses Lion as the working memory of an agent's reasoning while it does a task such as debugging, verifying a change, or auditing docs and notes against code. The agent records what it observed, each observation with the words that showed it, and what it believes, each belief with the answers it predicts. Rules derive the rest, so the model tells the agent which beliefs the evidence contradicts, which evidence went out of date, and what would tell two explanations apart, as the work goes and not only at the end.

Everything is one shape: an observation answers a question with a value, a belief predicts answers to questions, and a problem is a question with the value that shows it. The skill's core program, [`assets/core.json`](skills/lion-reasoning/assets/core.json), derives from that:

- **Versions.** Each source records the files its output depends on, by content hash, and the scripts keep the project's files by hash, numbered, each time the agent observes. An observation speaks for every version of the project in which those files hold what they held when it was seen, and for no other. Evidence about a file that changed is stale, so "the tests pass" from before the last edit does not count as the present, and `changed` lists what the agent's work changed. A path git ignores, such as build output, and a path outside the project are hashed from disk as they are now.
- **Kinds of evidence.** A source is something the agent `ran`, `read`, was `told`, or `recalled`. What it ran or read overrules what it was told or recalled, and the model lists each time it did, so a wrong doc or a stale memory surfaces instead of being ignored.
- **Beliefs.** A belief is contradicted when an answer differs from its prediction, and holds otherwise. It is judged by the evidence of every version from the one it was formed in on, so a belief once contradicted stays contradicted, and a later edit that breaks an assumption is caught. A belief that explains a problem is judged instead in the versions where the problem shows, so fixing a bug does not count against the explanation of it. For rival explanations of a problem, `decisive` lists the questions they answer differently, which are the experiments to run next, and `settled` names the one explanation left when every one of its predictions is borne out.
- **What only the user decides.** A question the agent lists under `ask` is the user's to settle, such as which of two meanings a request has. It is `undecided` until the user's own words answer it, and an answer from anywhere else, a file, a command, a doc, or the agent, is `presumed`, so a choice made for the user is listed rather than hidden. It is the reasoning skill's form of the research skill's readings: one wrong reading early breaks everything built on it, and nothing observed later can contradict a choice.

To use it with Claude Code, link or copy the folder into your skills:

```bash
ln -s "$(pwd)/skills/lion-reasoning" ~/.claude/skills/lion-reasoning
```

Its scripts do the mechanical parts, and run the published `@lionlang/cli`, so a project's own copy of Lion, even a broken one, never changes the checker: `start.mjs` makes a task folder under `.lion/` and keeps it out of git, `see.mjs` runs a command and keeps its output and exit status as evidence with the hashes of what it depended on, `record.mjs` turns notes into a step and refuses a quote that is not in its source's text, `replay.mjs` rebuilds the model from its steps, and `ask.mjs` asks the model a question against the project as it is now, on a copy, so a question never changes the model.

The properties in `packages/metrics/src/tests/reasoning-skill.test.ts` check the core program against a plain model of versions, evidence, and beliefs, rival explanations against the law that an answer keeps exactly those that predicted it, the recorder against the notes it was given, a version's hashes against the files they were taken from, a path git ignores against the disk, the chain from files to the present answer on files that change, and each script started through a link. `bun run mutate` breaks each of these behaviors in turn; a mutation can now run the tests of another package than core, with `package`.

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

The documentation page, [`docs/docs.html`](https://lionlang.dev/docs.html), is generated from the fragments in `packages/site-runtime/content/`, one per document, organized by the [Diátaxis](https://diataxis.fr/) framework into tutorials, how-to guides, reference, and explanation. A fragment's `<lion-example>` becomes a live editor, and the build runs every example with the same evaluator the page uses and writes its real result, so a published result can never drift from what Lion does. The build fails on an example that errors unexpectedly, on one too slow for the browser, and on a link to an id the page lacks. After editing a fragment, or the core evaluator, rebuild the page:

```bash
bun run --cwd packages/site-runtime docs
```

GitHub Pages lets browsers cache every file for ten minutes, so `docs/index.html` and `docs/docs.html` load their scripts and stylesheet with a `?v=` hash of the site's assets, and the scripts pass it on to the worker and highlighter. A returning visitor therefore never runs new examples on a cached evaluator. The build above updates the hash. After editing only files in `docs/`, update it with:

```bash
bun run --cwd packages/site-runtime stamp
```

CI fails when either page's hash is out of date, and the site-runtime tests fail when `docs/docs.html` is not what its fragments build.

What the pages decide without touching a page is in `docs/pure.js`: which section "On this page" marks as the one being read, and how an example shows how long its program ran. The site-runtime tests check it with properties, against a model of a page that a browser scrolls:

```bash
turbo test --filter=@lionlang/site-runtime
```

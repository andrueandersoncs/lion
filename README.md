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
  examples/     example Lion programs and the hosts that run them
  site-runtime/ in-browser evaluator (Web Worker) for the live examples on lionlang.dev
  metrics/      private tools that measure Lion's complexity, speed, and tests
  history/      the project record and the research model of Lion's development
```

## Graph Editor

`@lionlang/repl` is the Lion Fold Map: a local-first semantic graph editor for Lion JSON files. The JSON source remains canonical while the graph, diagnostics, and evaluation results track explicit document revisions.

```bash
bun install
bun run prepare
turbo dev --filter=@lionlang/repl
```

Open `http://localhost:3000`, import or open a Lion JSON file, and edit it in the graph: there is no text pane beside it, so you edit literals in their graph nodes or replace the selected expression with JSON. Run against the standard library, then save to the original file handle or download the exact source. See [`packages/repl/README.md`](packages/repl/README.md) for shortcuts, browser fallback behavior, verification, and architecture.

## Command Line

Install `@lionlang/cli` in a project or globally:

```bash
bun add --dev @lionlang/cli
```

Evaluate a Lion JSON file, an inline expression with `--eval` (`-e`), or standard input (`-` or piped stdin):

```bash
bun run lion program.json
bun run lion -e '["number/add", 1, 2]'
echo '["number/add", 1, 2]' | bun run lion -
```

Keep a logic database in a file across runs with `--database`:

```bash
bun run lion setup.json --database store.json
bun run lion more-facts.json --database store.json
```

The file is loaded before the program runs, so the program can use its relations without declaring them, and is saved afterwards as a [snapshot](#snapshots) program, one form and one fact per line. A file that does not exist yet starts empty. A program that fails, such as one that would break an [invariant](#invariants) saved in the file, leaves the file as it was. Running the same setup again keeps one copy of each rule and invariant.

Read a program without running it, and print what is wrong with it, each with where it stands as a JSON pointer: a part that would fail when it runs (such as a malformed form, a misspelled name, or a wrong-arity call to a standard function, declared relation or schema, immediate lambda, or unmutated defined lambda), as an `error`, and a part that is wrong though nothing fails, such as a [match](#match) case no value can reach, as a `warning`. Pass `--eval` (`-e`), `-` / piped stdin, or `--database` (read-only, to validate calls against a saved database's relations and schemas without altering it). It exits with an error when there is an `error`:

```bash
bun run lion check program.json
bun run lion check --database store.json -e '["query", ["edge", "a", "?to"]]'
```

It also runs lints written in Lion: rules over the program read as data, one fact for each term with its JSON pointer. The one lint so far finds a list written as a bare array inside a rule, a find, or a query, which Lion reads as a call of its first item. Of `["find", "?a", ["in", ["?a", "?b"], ["quote", [[1, 2]]]]]` it prints `[{"at": "/2/1", "warning": "[\"?a\",\"?b\"] calls \"?a\", since an array is always a call. To match a list, write [\"array/make\",\"?a\",\"?b\"]."}]`, the words the program's message says when it runs.

Serve the bundled graph editor locally:

```bash
bun run lion repl
```

The editor listens on `127.0.0.1:3000` by default. Use `--host` and `--port`
to change the bind address. The published CLI includes the production editor,
so an end-user project does not need the Lion monorepo or a separate REPL
installation.

Print the command's own Lion as a Web Worker script, for a page that runs Lion in a browser:

```bash
bun run lion worker > lion-worker.js
```

The worker holds one logic database. Each message it is posted has an `id`, and each answer it posts back has the same `id`, `ok`, and the value as JSON text in `json`, or the reason in `error`. `{"type": "load", "snapshot": saved}` loads a database the way `--database` loads its file, and `{"type": "run", "program": program}` runs a program against it:

```text
{"id":1,"type":"load","snapshot":["begin",["relation","edge",["from","to"]], ...]}
  answers {"id":1,"ok":true,"json":"null"}
{"id":2,"type":"run","program":["find","?to",["path","a","?to"]]}
  answers {"id":2,"ok":true,"json":"[\"b\",\"c\"]"}
{"id":3,"type":"run","program":["path","a"]}
  answers {"id":3,"ok":false,"error":"\"path\" takes 2 arguments (from, to) but got 1."}
```

The snapshot there is the database of [Logic](#logic)'s first example, and each answer also has `ms`, how long it took. A page that carries this script runs the Lion of the command that printed it, so running the page's programs with that command checks the page: the [research skill](#research-skill)'s page is built this way.

The `lion` command validates files as Lion expressions, evaluates them with the
standard library, and writes results as formatted JSON. It reads each number
exactly as its digits write it, so `9007199254740993` is itself, and refuses to
write a result that holds a fraction no decimal writes, such as 1/3. The graph editor keeps
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

Numbers, booleans, and `null` evaluate to themselves. A string is a name when a scope it is written in declares it, and data otherwise, except for the two kinds of string below. What a string means is settled by where it is written, so a binding made later never turns data into a name.

```json
42
true
null
"x"
```

With `{ "x": 10 }` in the environment, `"x"` evaluates to `10`. Otherwise it evaluates to `"x"`.

A scope declares its bindings from its start, also the names its body defines before the `define` has run: the top scope of a run declares the names the environment and the database bind, every name the program's top level defines, and every relation and schema the program declares; a lambda's scope declares its parameters and the names its body defines. So the same string means the same thing every time its code runs:

```json
["begin",
  ["define", "greet", ["lambda", [], ["string/concat", "hello, ", "who"]]],
  ["define", "who", "world"],
  {"greeting": ["greet"], "note": ["eval", ["quote", "status"]]}]
```

Evaluates to `{ "greeting": "hello, world", "note": "status" }`: `"who"` is a name everywhere in the program, since the program defines it, while `"status"` names nothing. A name read before its `define` has run fails with `"who" is read before it is defined.`, and code that `eval` compiles later is written in the scope as it is then.

An undeclared string of the form `"?name"` evaluates to a logic variable instead. See [Logic](#logic).

An undeclared string of the form `"module/name"` that reads as a misspelled name is an error, and not a string: one whose module has other names, such as `"number/ad"`, or one a letter or two away from a bound name, such as `"numbr/add"`.

```json
["number/ad", 1, 2]
```

Fails with `Nothing is bound to "number/ad". Did you mean "number/add"? To mean the string itself, write ["quote", "number/ad"].` Any other string with a slash in it, such as `"n/a"` or `"text/plain"`, evaluates to itself, and `["quote", "number/ad"]` is always the string.

### Arrays

The empty array `[]` evaluates to itself. Every other array is treated as an executable expression:

1. special forms such as `["define", "x", 1]`, when no scope around the array declares the form's name
2. function calls when the first element evaluates to a function. The first element names what the array does, so a string there is a name and never data: one that no scope declares is looked up where the call runs, so a relation or function that code `eval` ran has bound by then is called

```json
["number/add", 1, 2]
```

Evaluates to `3`.

An array that names a form but does not have the form's shape fails and says what the form takes: `["define", "x"]` fails with `["define","x"] is not a well-formed define form: define takes a name and an expression, as in ["define", "answer", 42].` A parameter or a `define` may take a form's name, as Scheme lets a binding shadow a keyword: where the binding is in scope, the array is a call. `[["lambda", ["fact"], ["fact", 3]], "value/identity"]` is `3`.

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

Evaluates its argument, then evaluates the result as a program: the code is compiled as it runs, so it can define and use names of its own, and a string in it means what the scope declares then.

```json
["eval", ["quote", ["number/add", 1, 2]]]
```

### `begin`

Evaluates expressions in order and returns the last result.

```json
["begin", ["define", "x", 1], ["define", "x", 2], "x"]
```

Every expression before the last runs, also one that waits for a logic variable. Such an expression, or a question in a rule, a query, or a `find`, makes the whole `begin` wait, as a condition makes `cond` wait, and the `begin` then runs every expression for each answer, as plain code would with the values in place. So a function that checks its argument first checks it in a `find` too:

```json
["begin",
  ["define", "pair", ["lambda", ["n"],
    ["begin", ["schema/assert", "n", "value/number?"], ["array/make", "n", "n"]]]],
  ["find", ["pair", "?item"], ["in", "?item", ["array/make", 3, "three"]]]]
```

Fails with `"three" does not fit "value/number?".`, as `["pair", "three"]` does.

A program's own `begin`, and a `begin` among its forms, runs its forms one at a time instead, as Scheme splices a top-level `begin` into the program. A definition there of a value that waits names it, and the forms after it run:

```json
["begin",
  ["define", "half", ["number/divide", "?n", 2]],
  ["find", "half", ["in", "?n", ["array/make", 2, 4]]]]
```

Evaluates to `[1, 2]`.

### `define`

Evaluates a value, binds the name to it in the body the form stands in, a lambda's or the program's, and returns the value. The body declares the name from its start, so it means this definition everywhere in the body, and a define inside a lambda never changes a name outside it.

```json
["define", "answer", 42]
```

### `delay`

Makes a promise of an expression, as Racket's `delay` does: nothing runs until `value/force` asks for its value, the first force runs the expression and keeps the value, and every force after gives it without running the expression again.

```json
["begin",
  ["define", "runs", 0],
  ["define", "total", ["delay", ["begin", ["set!", "runs", ["number/add", "runs", 1]], ["aggregate/sum", ["array/range", 0, 1000]]]]],
  {"forced": ["value/force", "total"], "forced again": ["value/force", "total"], "runs": "runs"}]
```

Evaluates to `{"forced": 499500, "forced again": 499500, "runs": 1}`. A failure keeps nothing, so the next force runs the expression again, and a promise forced while it is being forced fails. `value/force` of any other value gives the value, and `value/promise?` tells a promise apart. A promise is not data, so a fact or a query's answer cannot hold one.

### `set!`

Changes the value of the nearest binding of a name and returns the value, as in Scheme. It is how a lambda changes a name around it:

```json
["begin",
  ["define", "count", 0],
  ["define", "tick", ["lambda", [], ["set!", "count", ["number/add", "count", 1]]]],
  ["tick"], ["tick"],
  "count"]
```

Evaluates to `2`. A name no scope declares has no binding to change, so `["set!", "nope", 1]` fails.

A rule, a query, and a `find` run their parts when and as often as the engine chooses: a rule body runs once when the rule is written, not once for each row. So `set!` of a binding made outside them fails there, `set! cannot change "calls" while a rule, query, or find runs: …`, where a counter called in plain code would number three items 1, 2, and 3 but in a rule body would give them all one number. A binding the call makes for itself, such as a helper's own counter, it changes as it would anywhere:

```json
["begin",
  ["define", "calls", 0],
  ["define", "counted", ["lambda", ["x"], ["begin", ["set!", "calls", ["number/add", "calls", 1]], "calls"]]],
  ["define", "steps", ["lambda", ["x"], ["begin", ["define", "n", 0], ["set!", "n", ["number/add", "x", 1]], "n"]]],
  {"numbered in plain code": ["array/map", ["array/make", 10, 20, 30], "counted"],
   "a helper's own counter, in a find": ["find", ["steps", "?x"], ["in", "?x", ["array/make", 10, 20, 30]]]}]
```

Evaluates to `{"numbered in plain code": [1, 2, 3], "a helper's own counter, in a find": [11, 21, 31]}`. To count what a rule matches, use an aggregate, as `["aggregate/count", "?x"]` in its head.

### `lambda`

Creates a Lion function with lexical scope.

```json
["lambda", ["x"], ["number/add", "x", 1]]
```

Lambdas close over surrounding scope, and see the value a name has when they run, so a `set!` or a later `define` of a name the program declares is seen.

A parameter written as a name and a [schema](#schemas), `["n", "value/number?"]`, is a contract: a call checks the argument as `schema/assert` does, before the body runs, so a misfit fails with `schema/assert`'s words and the functions it left start with the caller, as Racket blames the party that broke a contract. The schema is made where the lambda is. Where the call waits for a logic variable, in a rule or a `find`, the check waits too and runs when the variable is bound, as plain code would run it:

```json
["begin",
  ["define", "next", ["lambda", [["n", "value/number?"]], ["number/add", "n", 1]]],
  ["define", "label", ["lambda", ["n"], ["string/concat", "item ", ["number/toString", ["next", "n"]]]]],
  ["label", "seven"]]
```

fails with `"seven" does not fit "value/number?". (in "label")`. A [match](#match) with no fallback on a parameter with a contract is checked to cover every value the contract allows: `lion check` and the graph editor warn when its cases leave one out.

Calls nest as deep as memory allows. A call in tail position keeps nothing of the call it is in, as in Scheme. A lambda's body is in tail position, and so are the result of a `cond` case and the last expression of a `begin` that are. A lambda that calls itself there is a loop, and runs in constant memory, so this counts to 100,000 in a fraction of a second:

```json
["begin",
  ["define", "count", ["lambda", ["n", "total"],
    ["cond", [["number/equals?", "n", 0], "total"],
             ["else", ["count", ["number/subtract", "n", 1], ["number/add", "total", 1]]]]]],
  ["count", 100000, 0]]
```

Written with one name in place of its list of parameters, a lambda takes any number of arguments and binds the name to the list of them, as `(lambda args body)` does in Scheme: `[["lambda", "args", ["array/length", "args"]], 1, 2, 3]` is `3`, and `["func/apply", f, null, list]` hands such a lambda the items of `list`. The list is what `array/make` gives with the arguments: a goal among them is asked, so `[["lambda", "args", "args"], ["small", 1]]` gives `[true]` when `small` holds 1, and where an argument waits for a logic variable, the list waits with it.

A call gives a lambda with a list of parameters one argument for each, as it gives every function as many as it takes, and any other number fails in the same form of message: `[["lambda", ["a"], "a"], 1, 2]` fails with `["lambda",["a"],"a"] takes 1 argument but got 2.`, and a lambda a `define` bound is named by it, as `"next" takes 1 argument but got 2.` Host code that passes more arguments than a function can name, as `Array.prototype.map` does, calls it through `func/callback`, which gives it as many as it takes.

### `cond`

Evaluates condition/result pairs in order and returns the first matching result. An `else` branch is optional.

```json
["cond",
  [["number/greaterThan", "score", 90], "great"],
  [["number/greaterThan", "score", 70], "pass"],
  ["else", "retry"]]
```

If no branch matches and no `else` is provided, `cond` returns `null`. A condition must be `true` or `false`, as a filter in a rule or query and an argument of `and`, `or`, and `not` must: `["cond", [0, "yes"], ["else", "no"]]` fails with `A condition must be true or false, but found 0.` `else`, unless a scope declares it, always holds. A condition can be a goal, such as `["member", "name", "?_"]`: it holds when the goal has a match. See [Asking](#asking).

### `match`

Checks a value against schema/function pairs, then applies the function of the first schema the value fits. A last argument that is not a pair is a fallback function, applied to a value no schema fits; without one, as Racket's `match` does, a value no schema fits fails: `No case of the match fits "value", and it has no fallback: …`. A last argument that is a pair is a case, so a fallback is never written as a call of two parts, such as `["func/partial", "f"]`: write it as a lambda.

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

A case that comes after one whose schema takes every value it allows can never be reached. Reading the program finds it without running it, as `schema/includes?` decides, where both schemas have one value wherever the match runs: the graph editor shows it, and `lion check program.json` prints each such case with where it stands, as for this match, whose integer case the number case before it takes:

```json
["match", 5,
  ["value/number?", ["lambda", ["n"], "a number"]],
  ["value/integer?", ["lambda", ["n"], "an integer"]]]
```

`lion check` prints `[{"at": "/3", "warning": "This case can never be reached: every value its schema allows fits the schema of case 1, which comes first."}]`, and exits with an error when a part would fail when it runs.

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
- A rule's head is a relation call, an `and` of relation calls, which adds a row to each, or `exists` over either, which says the head holds for values nobody has given. See [Existential rules](#existential-rules).

### Forms

| Form | Meaning |
|---|---|
| `["fact", goal, ...]` | Adds ground facts. Returns the facts added. |
| `["retract", goal, ...]` | Removes facts. What rules derived from them changes with them. A `rule` or `invariant` form among them, written as it was added, takes that rule or invariant back. See [Taking rules back](#taking-rules-back). |
| `["rule", head, goal, ...]` | Adds a rule: `head` holds whenever every goal holds. A head is a relation call, `=` between two values, an `and` of those, or `exists` over relation calls. See [Existential rules](#existential-rules). |
| `["query", goal]` | Returns one record per distinct answer, keyed by variable name without the `?`. A goal with no variables returns `[{}]` when it holds and `[]` when it does not. |
| `["query", goal, options]` | Sorts and pages the answers, or asserts that there are some or none. See [Query options](#query-options). |
| `["find", template, goal]` | Returns the template's value for every match of the goal, as a sorted list. See [Asking](#asking). |
| `["assuming", change, ..., expression]` | What the expression gives in the database as it would be after the changes, each a `fact`, `retract`, or `rule` form. The database does not change. See [Asking what would hold](#asking-what-would-hold). |
| `["why", goal]` | Explains a fact as a tree: the rules and facts that derived it, or, when it does not hold, each rule that could have given it and what stopped it. |
| `["and", goal, ...]`, `["or", goal, ...]` | Combine goals. On booleans they are the boolean operators, and stop at the first argument that decides the result. With no goals, `["and"]` holds and `["or"]` does not, as `(and)` is `#t` and `(or)` is `#f` in Scheme. |
| `["not", goal]` | Holds when the goal has no match. The goal can be any goal, with variables of its own; a boolean is negated. |
| `["=", term, term]` | Binds a variable to a value, or compares two values. Either side can be a record or list with variables in it, which takes the other side apart. Without logic variables it is plain equality. |
| `["invariant", goal, {"assert": "none"}]` | Keeps a query assertion: the goal must have no answers, or with `"some"` at least one, now and after every later change. See [Invariants](#invariants). |
| `["snapshot"]` | Returns a Lion program that rebuilds the current database. See [Snapshots](#snapshots). |
| `["in", element, list]` | Binds a variable to each item of a list, or tests that a value is one. The element can be a record or list with variables in it. Without logic variables it is plain membership. See [Lists](#lists). |
| `["exists", ["?m", ...], goal]` | Holds when the goal holds for some value of each listed variable. The listed variables are its own. As a rule head, it says the head holds for values nobody has given, and the rule invents them. See [Existential rules](#existential-rules). |
| `["some", "?m", goal]` | The unknown that `?m` stands for in a match of the goal, such as a value a rule invented: `["some", "?m", ["mother", "ben", "?m"]]`. See [Existential rules](#existential-rules). |

A fact holds data: JSON values, and the [unknowns](#existential-rules) that rules invent. A string that is a name evaluates to what it names, so a fact written with one is refused, and the message says which column it is for, what the string names, and how to write the string itself. `fact`, `retract`, and `why` refuse in the same words.

```json
["begin",
  ["relation", "note", ["text"]],
  ["relation", "source", ["id"]],
  ["fact", ["note", "source"]]]
```

Fails with `Facts may only contain data, but the "text" of ["note","source"] is the relation "source". To mean the string itself, write ["quote", "source"].` The same goes for the name of a schema or a function, and for a string such as `"?why"`, which is a logic variable: `... is the logic variable "?why". To mean the string itself, write ["quote", "?why"].` An argument that is not data for another reason is shown with the reason: `... is ["number/add","?x",1], which waits for a logic variable.`

`why` explains a derived fact by the rule that derived it and what its body rested on, under `because`: each row a relation goal matched, explained in turn down to the facts that were given, and every other goal as it held, with the answer's values in place of its variables. When several answers give the fact, `why` tells the one deriving from nothing finds first: of the answers at the [level](#guarantees) the fact is held from, the least of the first rule that has one, so the tree does not depend on the order the facts came in. A `not` shows as `absent`, and every other goal, `=` and `in` among them, as `check`. A figure a rule computes therefore shows its arithmetic on the values it was given:

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

Its `because` holds the two `line` facts and `{ "check": ["=", 9, ["number/round", ["number/multiply", 365, ["number/divide", 4946, 210352]]]] }`. Each check, evaluated as it stands, is `true`, so anyone can work the arithmetic again. A row that a rule which invents gives only because a key or an equality rule made its unknown equal to another value ends with `{ "same": [unknown, value] }`: the unknown the rule named, and the value it was made. See [Existential rules](#existential-rules).

A row that several answers give is explained the way a database that derives it from the facts as they now are finds it first. Rules run in the order they were added, round after round from the facts up, and of the answers of the first rule that gives the row, the least explains it, comparing the values its body binds in the order it binds them. So the tree is the same whatever order the facts were added in, and whatever the database had derived before they changed. A path is explained by its shortest chain of edges: once `["edge", "a", "c"]` is added, `["why", ["path", "a", "c"]]` rests on that edge, even where the database derived the path through `b` before it came.

A fact that does not hold is explained the other way round. `why` returns it as `absent`, and under `because` every way it could have held: each rule whose head can give it, with the goals of its body that held under `because`, and under `but` the goal that stopped it.

```json
["begin",
  ["relation", "user", ["name", "age"]],
  ["relation", "banned", ["name"]],
  ["relation", "eligible", ["name"]],
  ["fact", ["user", "bo", 16], ["user", "cy", 40], ["banned", "cy"]],
  ["rule", ["eligible", "?n"],
    ["user", "?n", "?age"],
    ["number/greaterThan", "?age", 18],
    ["not", ["banned", "?n"]]],
  ["why", ["eligible", "bo"]]]
```

Evaluates to `{ "absent": ["eligible", "bo"], "because": [{ "rule": [...], "because": [{ "absent": ["banned", "bo"], "because": [] }, { "fact": ["user", "bo", 16], "given": true }], "but": { "absent": ["number/greaterThan", 16, 18] } }] }`: bo is not banned and is a user, but 16 is not greater than 18.

- `but` is the other side of the goal that stopped the rule. A filter that was false and a relation call with no match are `absent`, and an absent relation call is explained in turn, down to the facts that are missing. A `not` stops a rule because what it denies holds, so its `but` is that fact or `check`: for `["why", ["eligible", "cy"]]` it is `{ "fact": ["banned", "cy"], "given": true }`.
- Every `absent`, asked as it stands, is `false`, as every `check` is `true`. A variable the rule had not bound when it stopped keeps its name.
- Where the [solver's step](#solving-for-values) stopped a rule, its `absent` has a `certificate` for each case the solver split the goals into: the constraints as whole-number sums compared with 0, and steps, each adding earlier lines multiplied by whole numbers and, over whole numbers, maybe tightened, down to a line with no variables that is false; integer cases that need the Omega test's dark and grey shadows receive a binary integer split tree (`kind: "split"`) whose leaves are linear certificates. When induction proved the goal, `absent` carries an `induction` proof record naming its guarded recursive functions and checked cases. Plain arithmetic checks every certificate, split tree, induction proof, and `why` derivation via [`proof/valid?`](#proof); see [Prove that every command keeps a rule](#prove-commands). It also has `contradicting`: the fewest of the step's goals that already have no values together, each with the answer's values, such as `[["number/greaterThanOrEqualTo", "?balance", 0], ["number/lessThan", "?balance", 0]]`. The same goes for an `exists` under `not` that the solver decides as a whole, as a proof that a rule is kept is. When the step denies a goal, as such a proof denies that the rule breaks, and the goals that contradict each other leave out every goal it denies, the other goals allow no values at all: the absent goal says `"vacuous": true`, since the proof holds of no state.
- A rule's body runs from the values the fact gives its head, so the goals those values reach come first. A rule is told once for every answer of its first goals that the next goal stops, in an order that does not depend on the order facts were added in.
- When a rule's whole body holds, it gave another row than the one asked about, since its head computes, combines, or invents a value. That way has no `because`, and its `but` explains the row the rule gave, such as the total a rule summed when another total was asked about.
- A goal under `not` that is made of several goals lists its alternatives the same way, without a `rule`. So an `absent` premise of a fact that holds says why it had no match.
- An absent goal is explained once in a tree. Where the tree comes to it again, as recursion does, it is written without `because`. A fact that no rule could give has an empty `because`.
- `"assumed": true` marks what could change once an unknown is known. See [Existential rules](#existential-rules).

### Waiting for values

A rule or query is written before its variables have values, so anything that needs a variable's value waits, and runs once for each answer that binds the variable:

- A function call with a logic variable among its arguments. That is every function: the standard library, functions the host adds, and functions made by `func/partial`.
- `cond` when a condition is not known yet, `match` when its value is not, `eval` when its code is not, and `begin` when an expression before its last is not.
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
- What a rule holds runs when the rule runs. A call on values that are already known may be computed when the rule is written. So a rule, a query, and a `find` refuse a `set!` of a binding made outside them, whose change would happen once, or as often as the engine chose, rather than once for each answer.
- A filter runs as soon as its variables are bound, and filters that are ready together run in the order written. So a guard written first protects the filter after it, as in `["value/number?", "?v"], ["number/greaterThan", "?v", 0]`. A filter given a value it does not take names the function, the argument, and the value, as in `"number/greaterThan" takes a number as argument 1 but got "n/a".`, and any other failure names the call and the values it ran on.
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
- In plain code a question is asked as soon as something needs its value, and every variable in it is its own. In a rule, query, invariant, or `find`, a question is part of what is written, and is asked for each answer when that runs. A question gives in a rule what it gives in plain code with the rule's variables in place.
- `find` gives one value for every match, sorted in the fixed order values sort in, so its list never depends on how the matches were found. It can repeat a value, as `aggregate/collect` does; use `aggregate/unique` for distinct values. A `find` must bind every variable of its template that the rule around it does not.
- `define`, `and`, `or`, `not`, and lambdas keep a goal as it is, so goals can still be named, combined, and passed around. So does a program, or a `begin`, whose value is a goal: it gives the goal as written. To get a goal's truth on its own, give it to a function: `["value/identity", goal]`.
- A question sees every row of the relations it asks about, so those are derived in full first. A rule cannot ask about a relation that depends on the rule's own head.
- Within a rule or query, a name is one variable, also inside the questions nested in it. Give a question nested in another its own names.
- `["exists", ["?y"], goal]` is a question too, also when its goal has no relation in it, and the variables it lists are its own wherever it stands: as a value, `["value/identity", ["exists", ["?y"], ["=", "?y", 1]]]` is `true`. See [Existential rules](#existential-rules).

#### Asking what would hold

`["assuming", change, ..., expression]` asks a question of the database as it would be after some changes, and leaves the database as it is. Each change is a `fact`, `retract`, or `rule` form, made in order as that form would make it, with keys and merges: a `rule` form adds its rule, a `fact` states rows with `exists` as it does on its own, and a `retract` takes back the rules and invariants it names as well as facts, as it does on its own. No invariant refuses a change, not even the one an assumed rule that says two values are the same holds as, since an invariant keeps the database and the change is only assumed. The expression gives its value from the database those changes leave: a goal is `true` or `false`, and a `find` is what it finds there.

```json
["begin",
  ["relation", "road", ["from", "to"]],
  ["relation", "reaches", ["from", "to"]],
  ["relation", "town", ["name"]],
  ["relation", "joins", ["from", "to"]],
  ["fact", ["road", "a", "b"], ["road", "b", "c"], ["town", "a"], ["town", "b"], ["town", "c"], ["town", "d"]],
  ["rule", ["reaches", "?x", "?y"], ["road", "?x", "?y"]],
  ["rule", ["reaches", "?x", "?z"], ["road", "?x", "?y"], ["reaches", "?y", "?z"]],
  ["rule", ["joins", "?x", "?y"],
    ["town", "?x"], ["town", "?y"],
    ["not", ["reaches", "a", "?y"]],
    ["assuming", ["fact", ["road", "?x", "?y"]], ["reaches", "a", "?y"]]],
  {"with a road from c to d": ["assuming", ["fact", ["road", "c", "d"]], ["find", "?t", ["reaches", "a", "?t"]]],
   "without the road from b to c": ["assuming", ["retract", ["road", "b", "c"]], ["find", "?t", ["reaches", "a", "?t"]]],
   "without the rule that goes on": ["assuming",
     ["retract", ["rule", ["reaches", "?x", "?z"], ["road", "?x", "?y"], ["reaches", "?y", "?z"]]],
     ["find", "?t", ["reaches", "a", "?t"]]],
   "as it is": ["find", "?t", ["reaches", "a", "?t"]],
   "one road that would reach d": ["find", "?x", ["joins", "?x", "d"]]}]
```

Evaluates to `{ "with a road from c to d": ["b", "c", "d"], "without the road from b to c": ["b"], "without the rule that goes on": ["b"], "as it is": ["b", "c"], "one road that would reach d": ["a", "b", "c"] }`.

- `assuming` is a question, as `find` is. In plain code it is asked right away. In a rule, query, or `find` it is asked for each answer, with the values the rule bound in place: `joins` above asks, for each pair of towns, whether a road between them would let `a` reach the second.
- What a change states must be known when it is asked, so the variables of its facts are ones the rule around it binds. Every other variable of the expression is its own, as in any question. A rule a change adds or takes back has variables of its own too: those the rule around it binds take their values, and every other one is the held rule's. So in a rule that binds `?x`, `["assuming", ["rule", ["reaches", "?x", "?t"], ["town", "?t"]], ...]` asks with `?x` reaching every town, and a rule to take back is written with names that rule does not bind.
- As a goal, its expression must be a goal, and it holds when that goal holds after the changes. As a value it is whatever the expression gives, so `["=", "?n", ["assuming", ..., ["aggregate/count", ["find", ...]]]]` counts what would be there.
- An invariant does not refuse a change that is only assumed. With `["invariant", ["shift", "?p", "sun"], {"assert": "none"}]`, adding `["fact", ["shift", "cy", "sun"]]` fails, while `["assuming", ["fact", ["shift", "cy", "sun"]], ["find", "?p", ["shift", "?p", "sun"]]]` is `["cy"]`. So an invariant can ask with `assuming` what a change would do, and holds of the same facts whatever order they and the invariant came in, without asking itself again. A change that fails for another reason, such as a relation call with the wrong number of arguments, fails the question in the same words. Assumptions nest, and an inner one starts from the database the outer one assumed.
- Each `assuming` derives what its expression needs in a database of its own, which shares every fact it does not change. Asked for each answer of a rule, it costs one such derivation per answer. Hypothetical reasoning is known to cost more than reasoning over the facts: in Datalog, adding facts hypothetically raises the cost of a question from polynomial to polynomial space.
- A rule cannot ask, through `assuming`, about a relation that depends on its own head, as for every question.

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
- When one `fact` form repeats a key, the last row wins, and the form writes no other row for that key. So a form whose last row for each key holds already changes nothing, not even the order a snapshot writes the rows in.
- `retract` removes a row only when every column matches.
- Rules can derive rows of a keyed relation, but two different rows with the same key, from facts or rules, are an error, unless they differ only in values that rules invented: then the key makes them one. See [Existential rules](#existential-rules). A question that reads the relation, or a relation derived from it, fails with the error, and so does a change an invariant that reads it checks. The error names the same two rows, and the same rule, whatever order the rules and facts came in, and whether the rows were derived from nothing or followed through changes: of the pairs of rows with one key, the one whose rows sort first; of its two rows, the one a rule gives, or the one that sorts later when rules give both; and of the rules that give it, the one whose written form sorts first. A row a key or an equality rule made from another row is given by the rules that give that row. The rows are kept, so asking again fails at once, and the next change is followed through them.
- Declaring the relation again, for example in a later `run` that shares the database, must repeat the same columns, key, and merge.

#### Merging what a key gets

A relation is a key and how the candidates for a key combine. Without a key, a row is its own key and every candidate is a row. With a key, the candidates of a key must agree. `"merge"` says how they combine instead: for a column outside the key, an aggregate, such as `aggregate/min`, `aggregate/sum`, or `aggregate/count`. Every row a key gets is then a candidate, from a fact or a rule alike, and the key holds one row, whose merged columns combine the candidates' values. A column the merge does not name must agree, as it must for any key.

```json
["begin",
  ["relation", "offer", ["sku", "shop", "usd"]],
  ["relation", "best", ["sku", "usd"], {"key": "sku", "merge": {"usd": "aggregate/min"}}],
  ["fact", ["offer", "a1", "north", 5], ["offer", "a1", "south", 4], ["offer", "b2", "north", 9]],
  ["rule", ["best", "?sku", "?usd"], ["offer", "?sku", "?_", "?usd"]],
  ["fact", ["best", "b2", 7], ["best", "c3", 2]],
  {"best": ["query", ["best", "?sku", "?usd"], {"order": "sku"}],
   "why b2": ["why", ["best", "b2", 7]]}]
```

Evaluates to `{ "best": [{ "sku": "a1", "usd": 4 }, { "sku": "b2", "usd": 7 }, { "sku": "c3", "usd": 2 }], "why b2": { "fact": ["best", "b2", 7], "rule": ["relation", "best", ["sku", "usd"], { "key": ["sku"], "merge": { "usd": "aggregate/min" } }], "because": [{ "fact": ["best", "b2", 7], "given": true }] } }`.

- A fact of a relation that merges never replaces another: it is one more candidate, and `retract` takes it back. The fact `["best", "b2", 7]` beats the rule's 9 above, and `c3` has only its fact.
- A rule's head gives a merged column plainly, as above, and the relation combines it: it is the rule `["rule", ["best", "?sku", ["aggregate/min", "?usd"]], ...]`, which may also be written. A rule whose head aggregates says the same of its relation as a merge does: its other columns are the key, and every fact and every rule with a plain head for the relation gives a candidate too, whatever order they come in. See [Aggregates](#aggregates).
- A relation that merges is derived in full, before the rules that read it. With a lattice aggregate, `aggregate/min`, `aggregate/max`, `aggregate/shortest`, or `aggregate/union`, it can go through recursion: a merge with `aggregate/min` over a rule that adds a road's length to a distance gives the shortest distances. Any other aggregate combines the candidates once they are all there.
- Every aggregate combines a key's candidates counted, each fact and each rule's match once, so what it gives does not depend on the order they come in.
- `why` tells the candidate that gave the row: a fact, with the relation's declaration as its rule, or a rule's match.

### Taking rules back

A `rule` form inside `retract`, written as it was added, takes the rule back, and an `invariant` form takes the invariant back. The relations whose rules changed are derived again, as when a rule is added, and the change is checked against the invariants that stay, so it is all or nothing like any other change.

```json
["begin",
  ["relation", "edge", ["from", "to"]],
  ["relation", "path", ["from", "to"]],
  ["fact", ["edge", "a", "b"], ["edge", "b", "c"]],
  ["rule", ["path", "?x", "?y"], ["edge", "?x", "?y"]],
  ["rule", ["path", "?x", "?z"], ["path", "?x", "?y"], ["edge", "?y", "?z"]],
  {"taken": ["retract", ["rule", ["path", "?x", "?z"], ["path", "?x", "?y"], ["edge", "?y", "?z"]]],
   "paths": ["find", "?to", ["path", "a", "?to"]]}]
```

Evaluates to `{ "taken": [["rule", ["path", "?x", "?z"], ["path", "?x", "?y"], ["edge", "?y", "?z"]]], "paths": ["b"] }`.

- A form takes back the rule a snapshot would write the same way, so a rule written with a name bound to a value is the same as one written with the value. A form that names no rule the database holds takes nothing back.
- Taking back a rule that says two values are the same takes back the invariant it holds as too.
- Facts named beside a rule are taken back in the same change: when taking the rule back breaks an invariant, the facts stay too.
- `retract` gives what it took back: each fact, and each rule or invariant form.
- To ask what would hold without a rule and keep it, put the `retract` in [`assuming`](#asking-what-would-hold).

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

Without `"order"`, answers come in the order they are found, which can differ with what the database had derived before and with the changes it has seen. Values sort in a fixed order across types: `null`, booleans, numbers, strings, arrays, records, then [unknowns](#existential-rules).

### Invariants

An invariant is a query assertion the database keeps. `["invariant", goal, {"assert": "none"}]` says the goal never has answers, and `{"assert": "some"}` says it always has at least one. The invariant must hold when it is added, and from then on every `fact`, `retract`, and `rule` form is checked against it. A form that would break an invariant fails and changes nothing. The message counts the answers and shows one as an example: the first in [sort order](#query-options), whatever order they were found in.

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
- Invariants take only the `"assert"` option, read as written. `["retract", ["invariant", goal, options]]` takes one back. See [Taking rules back](#taking-rules-back).
- A change to facts is checked against the invariants that read what it changed. An invariant that expects no answers, and whose goal matches the rows of the relation that changed, is asked about the new rows alone, so checking a write does not cost more as the relation grows. Which invariants are asked never changes whether a change is kept. An invariant that calls a function the host added is asked in full after every change, since Lion cannot see what such a function reads; see [Host functions in rules](#host-functions-in-rules).
- When an invariant's goal says an answer fails a [schema](#schemas), the message ends with where the answer does not fit.
- Snapshots write the rules, then every fact in one `fact` form, then the invariants, so loading one checks the facts and the invariants once, against the whole program, as the database was checked. A database whose facts hold only beside every rule, such as two registered mothers of twins that an equality rule makes one, loads as it was saved.

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
| `aggregate/sum`, `aggregate/mean` | Sum and mean of numbers, both exact, so the order of the values never changes them (`mean` of nothing is `null`) |
| `aggregate/min`, `aggregate/max` | Smallest and largest value; all numbers or all strings |
| `aggregate/shortest` | Shortest list or string; ties go to the smaller value |
| `aggregate/union` | Every element of every list, distinct and sorted |
| `aggregate/collect` | Every value, sorted, duplicates kept |
| `aggregate/unique` | Distinct values, sorted |

- A sum or a mean of numbers that are not all whole is added up in sort order, so it does not depend on the order the facts were added in.
- Each match of a rule body counts once. A match that several alternatives of one `or` find counts once, and separate rules for the same relation add up. Adding a rule the database already holds changes nothing, so its matches never count twice.
- A group exists only when a candidate gives it, a match or a fact, so a count is never `0`. To count what may be nothing, aggregate a `find`: `["rule", ["activity", "?c", ["aggregate/count", ["find", "?id", ["order", "?id", "?c", "?_"]]]], ["customer", "?c"]]` gives every customer a count, `0` included.
- An aggregate can combine computed values, such as `["aggregate/sum", ["number/multiply", "?price", "?quantity"]]`, or a constant: `["aggregate/count", 1]` counts the matches.
- An aggregate call combines a rule's matches only as a whole argument of the head, and only when its argument is not a `find`. Anywhere else, in a body or inside another call, it combines the list it is given: `["=", "?n", ["aggregate/count", "?tags"]]` counts the items of `?tags` for each match.
- An aggregate of a `find` combines what the `find` found, wherever it is written: in a rule, in a query, or in plain code, as in `["aggregate/sum", ["find", "?amount", ["order", "?_", "?_", "?amount"]]]`.
- A rule that aggregates says how the candidates of each key of its relation combine, as a [merge](#merging-what-a-key-gets) does: the head's other columns are the key. A fact of the relation, and a rule with a plain head for it, give a candidate too, combined with the rest as a match is: under `aggregate/sum` a fact adds its value, and under `aggregate/count` it counts once. So a fact can give a key a group no match gives, and a rule that gives refunds plainly adds them to the sum. Whether a fact replaces the fact its key has is the relation's declaration's to say, as for any relation: under a key it declares without a merge, it does, and the fact it keeps is a candidate. Every rule that aggregates into a relation must aggregate the same columns in the same way.
- `why` on an aggregated fact lists every match it combines under `matches`, in the order of their answers. For `min`, `max`, and `shortest`, it explains the one match that produced the value, the least where several did.
- Called on a plain list instead of a logic variable, the same functions combine the list right away: `["aggregate/sum", ["array/make", 1, 2, 3]]` is `6`.

#### Recursion through aggregates

`aggregate/min`, `aggregate/max`, `aggregate/shortest`, and `aggregate/union` are lattice aggregates: a group's value only moves one way as matches arrive. A recursive rule can aggregate with them, and the aggregate can compute its value from values the rule made before, which an ordinary recursive rule cannot do. Each group keeps its best value so far, and evaluation stops once no value improves.

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

### Existential rules

A rule head can say that something exists without saying what it is. `["exists", ["?m"], head]` says the head holds for some value of `?m` that nobody has given, and the rule invents one: an unknown.

```json
["begin",
  ["relation", "person", ["name"]],
  ["relation", "mother", ["child", "mother"]],
  ["relation", "tall", ["name"]],
  ["fact", ["person", "ada"], ["person", "ben"]],
  ["fact", ["mother", "ada", "eve"]],
  ["rule", ["exists", ["?m"], ["mother", "?c", "?m"]], ["person", "?c"]],
  ["fact", ["tall", ["some", "?m", ["mother", "ben", "?m"]]]],
  {"mothers": ["query", ["mother", "?child", "?mother"], {"order": "child"}],
   "tall mothers": ["find", "?c", ["and", ["mother", "?c", "?m"], ["tall", "?m"]]],
   "known mothers": ["find", "?c", ["and", ["mother", "?c", "?m"], ["not", ["value/unknown?", "?m"]]]]}]
```

Evaluates to `{ "mothers": [{ "child": "ada", "mother": "eve" }, { "child": "ben", "mother": ["some", "?m", ["mother", "ben", "?m"]] }], "tall mothers": ["ben"], "known mothers": ["ada"] }`.

- A rule invents only for an answer whose head does not hold already. Ada has a mother, so the rule invents nothing for her.
- An unknown is written `["some", "?m", ["mother", "ben", "?m"]]`: the value `?m` stands for in a row `["mother", "ben", ?m]`. That form is ordinary Lion. Evaluating it gives the same unknown, so a program can write one, put it in a fact, as the fact about `tall` above does, compare it, or look it up.
- An unknown is data, as a string is: rows, facts, answers, `find`, and aggregates hold it. It equals itself and nothing else, as a constant does, and two unknowns are the same when they are written the same way. It sorts after every record, and unknowns sort by how they are written. `value/unknown?` is true for an unknown, and `value/object?` is false for one. A function that needs a number or a string fails on one, as it does on any value of the wrong kind.
- `["not", ["value/unknown?", "?m"]]` keeps only known answers. Lion stays closed-world: `["not", ["=", "?m", "eve"]]` holds for ben's unknown mother, as `not` holds for anything that is not known.
- That ben's mother is not eve is an assumption: she may be. `why` marks what could change once an unknown is known with `"assumed": true`. `["why", ["mother", "ben", "eve"]]` is `{ "absent": ["mother", "ben", "eve"], "assumed": true, ... }`, and `["why", ["mother", "ada", "fay"]]` has no mark: ada's mother is eve whatever ben's turns out to be. An absent goal that is not marked stays absent whatever the unknowns are, and a fact holds whatever they are when nothing it rests on is marked. A `check` is marked when it computes with an unknown, and a row that combines matches when a match holds one or its rule's body could gain one. The mark is safe, not exact: Lion follows each rule that could give the goal, and marks it when a row that holds an unknown could match a goal on the way, so a goal that is marked may still not change. Saying what an unknown is means adding the fact its `some` form describes, with a value in place of its variable.
- A head can be a relation call, `=`, an `and` of those, or `exists` over relation calls. `["rule", ["and", ["p", "?x"], ["q", "?x"]], ["r", "?x"]]` adds rows to both `p` and `q`. `["exists", ["?m"], ["and", ["mother", "?c", "?m"], ["female", "?m"]]]` invents one unknown that is in both rows, and the goal of its `some` is the whole `and`.
- With several variables, `exists` invents an unknown for each, and the goal of each `some` mentions the others, which are its own too: `["some", "?f", ["and", ["father", "ann", "?f"], ["mother", "ann", "?m"]]]` is the `?f` of some pair the goal describes.
- Rules that invent wait until every rule that invents nothing has finished. Then every rule that invents, and whose head does not hold, invents, all at once. The other rules then run on what was invented, and so on until nothing more is invented. So the result does not depend on the order rules or facts were added in.
- `exists` is also a goal: it holds when its goal holds for some value of each variable it lists. Those variables are its own wherever it stands, as a question's own variables are: they never bind or meet a variable of the same name outside it, and they never appear in an answer. It is a [question](#asking), so as a value `["exists", ["?y"], ["link", 3, "?y"]]` is `true` or `false`, and it works in a query, a rule body, under `not`, in `find`, as a value, and in an invariant.
- The variables of `exists` must be named logic variables, each listed once, and its goal must mention each. In a rule head, it cannot list a variable the body binds.
- A `fact` or `retract` can hold `exists`. `["fact", ["exists", ["?m"], ["mother", "ben", "?m"]]]` adds the row with ben's unknown mother in it, the very row the rule above would invent. A fact states rows, so it adds the row whether or not the head holds already. `why` takes `exists` too.
- Inside a rule, query, or `find`, `some` waits for the variables the rule binds, and every other variable of its goal is its own. Its goal is a relation call or an `and` of them, and an argument can be a value, one of its variables, or a record or list of those. A question among the arguments is asked. Nothing may compute with one of its own variables; that is an error.
- A rule that invents cannot aggregate.
- Rules that invent can recurse, as long as what they invent never flows back into inventing more. See [Guarantees](#guarantees).
- A relation that rules invent rows of is derived in full, as an aggregated relation is. See [Goal-directed queries](#goal-directed-queries).

A key makes unknowns equal. When two rows of a keyed relation have the same key and differ only where one holds an unknown that a rule of the keyed relation, or of a relation in a recursive cycle with it, invented, the unknown takes the other row's value: a given value, or, when both are such unknowns, the one that nests fewer unknowns, and of those the one that sorts first. Then every row that holds it is replaced. Here twins share a mother:

```json
["begin",
  ["relation", "person", ["name"]],
  ["relation", "twin", ["a", "b"]],
  ["relation", "mother", ["child", "mother"], {"key": "child"}],
  ["fact", ["person", "ben"], ["person", "cy"], ["person", "dee"]],
  ["fact", ["twin", "ben", "cy"]],
  ["rule", ["exists", ["?m"], ["mother", "?c", "?m"]], ["person", "?c"]],
  ["rule", ["mother", "?b", "?m"], ["twin", "?a", "?b"], ["mother", "?a", "?m"]],
  ["rule", ["mother", "?a", "?m"], ["twin", "?a", "?b"], ["mother", "?b", "?m"]],
  ["query", ["mother", "?child", "?mother"], {"order": "child"}]]
```

Evaluates to `[{ "child": "ben", "mother": ["some", "?m", ["mother", "ben", "?m"]] }, { "child": "cy", "mother": ["some", "?m", ["mother", "ben", "?m"]] }, { "child": "dee", "mother": ["some", "?m", ["mother", "dee", "?m"]] }]`. Ben and cy have one unknown mother, ben's, since it sorts first, and `why` on cy's row explains it by the twin rule. With `["fact", ["mother", "cy", "eve"]]`, both would have eve.

- Two different values that are not such unknowns, such as two given mothers, are still an error, with the key's message.
- Of the values a key makes one, the one kept depends only on which values they are, never on the order they were made one, so it does not depend on the order rules or facts were added in. An unknown nests fewer unknowns than any unknown that describes it, so an unknown never takes a value that describes it.
- An unknown that a fact holds is given, not invented, so a key never changes it. Nor does a key change an unknown invented for a relation that the keyed relation only reads.
- `why` explains a row by an answer that gives it as it is, when one does. A row that a rule which invents gives only because a key or an equality rule made its unknown equal to another value ends with `{ "same": [unknown, value] }`.

A rule's head can also say that two values are the same: `["rule", ["=", "?a", "?b"], goal, ...]` is an equality rule. Whenever its body holds, the two sides are one value. While Lion derives the relations its body reads, an unknown a rule invented there takes the value on the other side, as it does under a key, and the rule holds as an invariant, so a change that would leave two different known values under it is refused:

```json
["begin",
  ["relation", "person", ["name"]],
  ["relation", "twin", ["a", "b"]],
  ["relation", "mother", ["child", "mother"]],
  ["relation", "registered", ["child", "mother"]],
  ["fact", ["person", "ben"], ["person", "cy"], ["person", "dee"], ["twin", "ben", "cy"]],
  ["fact", ["registered", "dee", "eve"]],
  ["rule", ["exists", ["?m"], ["mother", "?c", "?m"]], ["person", "?c"]],
  ["rule", ["=", "?m1", "?m2"], ["twin", "?a", "?b"], ["mother", "?a", "?m1"], ["mother", "?b", "?m2"]],
  ["rule", ["=", "?m", "?r"], ["mother", "?c", "?m"], ["registered", "?c", "?r"]],
  ["query", ["mother", "?child", "?mother"], {"order": "child"}]]
```

Evaluates to `[{ "child": "ben", "mother": ["some", "?m", ["mother", "ben", "?m"]] }, { "child": "cy", "mother": ["some", "?m", ["mother", "ben", "?m"]] }, { "child": "dee", "mother": "eve" }]`: the twins share one unknown mother, and dee's is the registered one.

- An equality rule holds as the invariant it stands for, `["and", goal, ..., ["not", ["=", "?a", "?b"]]]` with `{"assert": "none"}`, and is reported in an invariant's words. A rule that does not hold is not added, and a change that would break it is refused: with `["rule", ["=", "?a", "?b"], ["email", "?p", "?a"], ["email", "?p", "?b"]]` and `["fact", ["email", "ann", "a@x"]]`, adding `["fact", ["email", "ann", "ann@y"]]` fails with `Adding this fact breaks an invariant, so nothing changed. The invariant expected no answers but found 2, such as {"p":"ann","a":"a@x","b":"ann@y"}: ["and",["email","?p","?a"],["email","?p","?b"],["not",["=","?a","?b"]]].` A snapshot writes the rule and the invariant.
- It makes unknowns one by the rule a key follows: an unknown that the rules of the group it runs with invented takes the other value, a given one, or of two such unknowns the one that nests fewer unknowns, and of those the one that sorts first. So which value is kept does not depend on the order the equality rules are written in.
- It runs with the relations of every rule that invents an unknown it can meet: Lion follows each invented value through the columns of the rules, and when one can reach a column the rule makes equal, the relations of the rule that invents it read every relation the equality rule reads. They are derived together with the relations between them, so an unknown can pass through any number of derived relations before the rule meets it. A question about those relations, such as a goal under `not`, would go through recursion and is refused when the rule is added. An equality rule that no invented value can reach, such as one whose body reads only facts, has nothing to make one, and the invariant keeps it; so does an unknown that a fact holds.
- A head can join relation calls and `=` with `and`: `["and", ["r", "?x"], ["=", "?x", "?y"]]` adds rows to `r` and says the two are the same. `exists` goes over relation calls only.
- Its body cannot ask a question, such as a goal under `not`, about the group it runs with.

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
- A known argument narrows a rule when the rule can look rows up by it: when it stands whole in one of the rule's relation goals, as `?x` in `["edge", "?x", "?y"]`. Where the rule can only test it, inside a record pattern, a schema such as `["schema/open", {"topic": "?t"}]`, or an `in`, the rule runs as written and keeps the rows asked about, so it never does more than the rule itself.
- Relations that are aggregated, computed by an algorithm, or asked about, under `not`, in a `find`, or as a value, are derived in full, along with everything they depend on. So is a relation that rules [invent](#existential-rules) rows of, since what such a rule adds depends on every row, and so is a relation that a goal asks with no argument known, since a copy for it would hold every row.
- What is derived in full is derived once, in the database, and every later query reads it there; a query that knows an argument of a relation the database already holds in full looks its rows up rather than deriving a copy. A model asked many different questions derives each relation about once, as full evaluation would.
- A relation is derived the first time a goal reads it, and kept, also [when facts change](#guarantees), so a query never pays for relations it does not reach, and never fails on one: with `["rule", ["report", "?t"], ["audit", "?t"], ["broken", "?t"]]` and no `audit` rows, `broken` is never derived.
- The answers are the same either way, but they can come in a different order. Use the `"order"` query option when order matters. A goal-directed query also never fails on a row it does not derive, where full evaluation would.
- `why` explains facts with every relation computed in full.
- Pass `{ database: new LogicDatabase({ goalDirected: false }) }` to `run` to derive every row of the relations a query reads instead.

### Snapshots

`["snapshot"]` returns a Lion program that rebuilds the current database: a `relation` form for every relation, a `schema` form for the schemas each `schema` form declared, every `rule`, one `fact` form with every fact, and every `invariant`. Evaluating the program into an empty database gives the same answers, so a snapshot is a save file that is also ordinary Lion you can read, edit, diff, and run.

```json
["begin",
  ["relation", "edge", ["from", "to"]],
  ["relation", "path", ["from", "to"]],
  ["fact", ["edge", "a", "b"], ["edge", "b", "c"]],
  ["rule", ["path", "?x", "?y"], ["edge", "?x", "?y"]],
  ["snapshot"]]
```

Evaluates to `["begin", ["relation", "edge", ["from", "to"]], ["relation", "path", ["from", "to"]], ["rule", ["path", "?x", "?y"], ["edge", "?x", "?y"]], ["fact", ["edge", "a", "b"], ["edge", "b", "c"]]]`.

- Strings that would evaluate to something else when loaded, such as relation names, names bound in the environment, namespaced names like `"number/add"`, and `?variable` names, are written inside `quote`. So are lists and records.
- Rules are written as they were evaluated. A name like `budget` in a rule appears as its value, and a function appears under the name the environment gives it: with `plus` defined as `number/add`, `["plus", "?x", 1]` is written `["number/add", "?x", 1]`.
- A waiting `cond`, `match`, or record is written as it was, and a lambda as its `lambda` form. A name in it that would not evaluate to the same value when loaded is bound by a lambda around it, as in `[["lambda", ["limit"], ["cond", [["number/greaterThan", "?a", "limit"], "big"], ["else", "small"]]], 100]`.
- A function that another function built is written as the call that built it: `["func/partial", "number/add", 1]`, or `["schema/arrayOf", "value/number?"]`.
- A schema is written with the form of its shape. A name in it that would not evaluate to the same value when loaded is bound by a lambda around it, as in a waiting form. Schemas that one form declared are written in one form, so they can name each other when it is loaded. The schema of a relation's rows is written as the invariant it stands for.
- A rule whose head says `exists` is written as it was, and an [unknown](#existential-rules) a fact holds as its `some` form, such as `["fact", ["tall", ["some", "?m", ["mother", "ben", "?m"]]]]`. The CLI's `--database` file therefore keeps both.
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

- Every variable in a rule head or a filter must first be bound by a relation goal, `=`, `in`, or `schema/fits?`, or typed by a schema that says what kind its values are, such as `value/integer?`, so that it is [solved for](#solving-for-values), unless the head lists it in [`exists`](#existential-rules). So must every input of an algorithm goal, and an input must be data. An array is always a call, so a list pattern written as `["?a", "?b"]` calls `?a` and binds nothing: write it `["array/make", "?a", "?b"]`. The message of a goal that cannot run says so when it holds such a call: `["in", ["?a", "?b"], ["quote", [[1, 2], [3, 4]]]]` is refused with `["?a","?b"] calls "?a", since an array is always a call. To match a list, write ["array/make","?a","?b"].`
- `schema/fits?` binds the value it checks only where nothing else can. A schema that [lists the values it allows](#taking-data-apart) binds it to each, at most 100,000 of them. One that says what kind they are, such as `value/integer?`, makes the variable symbolic: the filters about it are [solved for](#solving-for-values), and the ones the solver cannot decide wait for the values it lists. A variable no goal binds and no such schema types stays unbound, and the message says why.
- A question, a goal under `not`, a goal used as a value, or a `find`, waits for the variables the rule binds. Any other variable in it is its own, and the question must bind it itself.
- A rule cannot ask a question about a relation that depends on its own head, so every program has a single well-defined answer. Negation is one such question.
- Aggregation goes through recursion only with the lattice aggregates `min`, `max`, `shortest`, and `union`, and only when every relation in the cycle aggregates. Any other aggregate runs once its inputs are complete.
- Evaluation always finishes. Values flow from the columns a rule's body reads to the columns of its head. A rule may make a new value for a column, by computing it in its head or through `=` or `in`, or by [inventing](#existential-rules) it, as long as that value never flows back, through the rules, into making another new value. Values that come from facts, such as `["=", "?m", "?to"]` with `?to` from a relation, are not new.
- So `["rule", ["b", "?x", ["number/add", "?x", 10]], ["a", "?x"]]` with `["rule", ["a", "?x"], ["b", "?x", "?y"]]` is accepted: no rule reads the second column of `b` to make anything. "Every person has a mother", `["rule", ["exists", ["?m"], ["mother", "?p", "?m"]], ["person", "?p"]]`, with "every mother is a person", `["rule", ["person", "?m"], ["mother", "?p", "?m"]]`, is refused: `Rule [...] invents a value for "?m" in its head while recursing, which may never finish. Invent the value in a rule that does not recurse.` A computed value that flows back is refused with `... computes a new value in its head while recursing, which may never finish.`, and the message suggests a non-recursive rule or a lattice aggregate.
- Recursion through a lattice aggregate stops when no value improves, or fails with an error after 10,000 rounds.

A form that changes the database, `fact`, `retract`, or `rule`, either makes all of its changes or fails and makes none of them. When the database has [invariants](#invariants), a change that breaks one is undone the same way.

Nothing is guessed at: a filter must be true or false, and the rows a rule derives and the answers a query gives must be data, JSON values and [unknowns](#existential-rules). Anything else is an error that shows the call or the value.

Adding what the database already holds changes nothing: a fact that is already there, a relation or schema declared the same way, or a rule or invariant that a snapshot would write the same way. Rules and invariants hold values as they were evaluated, so `["limit", "k"]` with `k` bound to 3 is the same rule as `["limit", 3]`, and `["plus", "?x", 1]` with `plus` bound to `number/add` is the same rule as `["number/add", "?x", 1]`, while the variable `"?x"` and the string `["quote", "?x"]` differ. Running a program again, or loading a snapshot onto the database it came from, keeps one copy of each.

Answers are computed bottom-up with semi-naive evaluation, one relation at a time as something reads it, goal-directed when a query has known arguments, and kept. What the database has already derived never changes an answer, only the order answers come in. A relation goal finds its rows through an index on the values it knows, or, when a later relation goal holds every variable it binds and has fewer rows for the answer, through that goal's rows, as worst-case optimal joins such as Free Join choose a cover. So a join through a node that most rows share, such as the triangles through a hub, reads the rows the other goals allow instead of every path through the hub. It changes what an answer costs, never which answers come or the order they come in. A filter between the two still runs on every answer of the goals before it, so a later goal is read early only past relation goals.

A change to facts or rules is followed through what was derived, so it costs what it reaches and not what the database holds, and the database then answers as one that derived everything from the facts and rules as they now are. Rows that give each other cannot hold each other up, so retracting the fact a cycle of rules rests on takes the whole cycle away, and taking away the fact that made two unknowns one gives back the rows that held them apart. Two kinds of relation are derived again and compared instead of followed row by row: one whose rule holds a [function from the host](#host-functions-in-rules) that does not say it reads only its arguments, or asks [`assuming`](#asking-what-would-hold), which asks the database as it is and never as it was before the change, and one whose rule reads a changed relation through a schema instead of a relation goal. A [goal-directed query](#goal-directed-queries) keeps what it derived and follows changes too, for up to 32 different queries; past that they are answered again when asked. How the engine follows a change, with weights, levels, and stages, is in [`packages/core/src/logic/ENGINE.md`](packages/core/src/logic/ENGINE.md).

Each `run` starts from an empty database; pass `{ database: new LogicDatabase() }` as the third argument to share relations, schemas, facts, rules, and invariants across runs. The database's relations and schemas are bound by name in every run that uses it, unless the environment binds the same name.

## Schemas

A schema says what a value must be. Anything is a schema, and one rule says what fits it:

- A function is a predicate: a value fits when the function returns `true`. `value/number?` is one, and so is a lambda, a relation with one column, and a schema with a name.
- A record fits a record with the same keys, with values that fit.
- A list fits a list of the same length, item by item.
- Any other value fits a value equal to it.

So data is a schema for itself: it fits exactly the values equal to it. A function in it makes room for every value the function accepts, `schema/optional` for a key that can be left out, and `schema/open` for the keys a record does not name or the items after a list, which are the rest.

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
| `["schema/arrayOf", schema, most]` | The same, with at most `most` items. |
| `["schema/recordOf", schema]` | A record whose every value fits the schema. |
| `["schema/optional", schema]` | As the schema of a record's key, lets the key be left out. A key that is there must fit. |
| `["schema/open", record]` | A record that fits the record of schemas, whatever other keys it has. With a list of schemas, a list that starts with items that fit them, whatever comes after. |
| `["schema/open", record, rest]` | The same, when the record of its other keys, or the list of its other items, fits the schema `rest`. |

- What these functions build is a function like any other, so it can be called, as in `[["schema/arrayOf", "value/number?"], "items"]`, and given to `array/map` or `match`.
- A predicate that fails, or returns anything but `true`, does not fit. So `["lambda", ["n"], ["number/greaterThan", "n", 0]]` needs no check that `n` is a number first: a string does not fit it.
- A string is a name where a scope declares it, as everywhere in Lion. `"open"` is the string unless a scope it is written in declares `open`, and `["quote", "open"]` is always the string.
- A misspelled name is an error, and not a schema that nothing fits: `"value/intger?"` as a schema fails with `Nothing is bound to "value/intger?". Did you mean "value/integer?"?`, and so does a misspelled name inside a predicate, where any other failure means the value does not fit. See [Primitives](#primitives).
- Data is a schema for itself: `["schema/fits?", "x", ["quote", {"a": [1, 2]}]]` holds when `x` is the record `{"a": [1, 2]}`.
- A relation is a schema when it has one column: a value fits `person` when `["person", value]` has a match. A relation with more columns is not the schema of one value, and using it as one is an error.
- `value/any?` fits every value. `["schema/anyOf", "value/string?", null]` fits a string or `null`.
- A problem has a `path`, the keys and positions that lead to the part that does not fit. A part with the wrong value has what was `expected`, a schema written as the expression that makes it, and what was `found`. A part that is missing has only `expected`, and a key the schema does not name has only `found`. Problems come in the order of their paths.
- `schema/anyOf` reports one problem, at the value that fits none of its schemas. `schema/allOf` reports the problems of every schema the value does not fit.

#### The rest of a record or list

A record of schemas names some keys of a value, and a list of schemas its first items. What it leaves over is the rest: the record of the other keys, or the list of the items after. One rule says what the rest must fit:
- **On its own**, a record or list of schemas leaves nothing: `{}`, or `[]`. So a record has no other keys, and a list has no other items.
- **`["schema/open", record]`** leaves anything.
- **`["schema/open", record, rest]`** leaves what fits `rest`.

A key the record names is never part of the rest. So `["schema/open", a, b]`, where `a` and `b` are records of schemas with no key in common, is the one record of schemas with the keys of both: two exact schemas build a third that is exact too. `["schema/allOf", a, b]` asks for a record that has only `a`'s keys and only `b`'s keys at once, which no record does when each has a key the other lacks.

```json
["begin",
  ["schema", "Entity", {"id": "value/integer?", "created": "value/string?"}],
  ["schema", "Line", {"sku": "value/string?", "qty": "value/integer?"}],
  ["schema", "Stock", ["schema/open", "Entity", "Line"]],
  ["schema", "Tagged", ["schema/open", {"id": "value/integer?"}, ["schema/recordOf", "value/string?"]]],
  {"stock": ["Stock", ["quote", {"id": 4, "created": "2026-11-18", "sku": "a1", "qty": 2}]],
   "allOf": ["schema/fits?", ["quote", {"id": 4, "created": "2026-11-18", "sku": "a1", "qty": 2}], ["schema/allOf", "Entity", "Line"]],
   "problems": ["schema/problems", ["quote", {"id": 4, "created": "2026-11-18", "sku": "a1", "qty": 2, "rush": true}], "Stock"],
   "tagged": ["Tagged", ["quote", {"id": 1, "color": "red", "size": "m"}]],
   "numbers after a name": ["schema/fits?", ["quote", ["total", 3, 4]], ["schema/open", ["array/make", "value/string?"], ["schema/arrayOf", "value/number?"]]]}]
```

Evaluates to `{ "stock": true, "allOf": false, "problems": [{ "path": ["rush"], "found": true }], "tagged": true, "numbers after a name": true }`.

- A part of the rest that does not fit is shown where it stands in the value, as `rush` is above. When the rest as a whole does not fit, the problem is the value not fitting the `schema/open` schema.
- A record of schemas with no rest is `["schema/open", record, {}]`, and `["schema/open", record]` is `["schema/open", record, "value/any?"]`: each fits the same values.
- `rest` is a schema like any other: a variable binds the rest in a pattern, as [Taking data apart](#taking-data-apart) shows.

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
- A lambda in a shape can ask about its own schema again, and the same rule holds as far as it can:
  - About a smaller value, such as a list's tail or one of a record's values, the schema is checked as any schema is. A value is smaller when it holds fewer values, counting each character of a string.
  - About the same value, it gets the least answer that agrees with itself: first that the value does not fit, and, if the check then says it fits, that it fits. When neither agrees, as for a schema that fits exactly the values that do not fit it, whether the value fits has no answer, and the check fails.
  - About any other value, such as a list that holds the value, or the next number, the check is refused, since it need not end.

  A lambda that fails does not fit, so such a failure inside another schema's lambda only makes that schema not fit.

  ```json
  ["begin",
    ["schema", "EvenList", ["schema/anyOf", ["quote", []],
      ["lambda", ["v"], ["and", ["value/array?", "v"], ["number/greaterThan", ["array/length", "v"], 0],
        ["not", ["schema/fits?", ["array/tail", "v"], "EvenList"]]]]]],
    ["schema", "Same", ["lambda", ["v"], ["schema/fits?", "v", "Same"]]],
    {"even lengths": ["array/map", ["quote", [[], [1], [1, 2]]], "EvenList"],
     "asks the same question": ["Same", 1]}]
  ```

  Evaluates to `{ "even lengths": [true, false, true], "asks the same question": false }`. `["schema", "Odd", ["lambda", ["v"], ["not", ["schema/fits?", "v", "Odd"]]]]` fits no value consistently, so `["Odd", 1]` fails, and says that whether `1` fits `"Odd"` has no answer.
- What a name in a shape means is settled when the shape is declared. A name that nothing has yet is a plain string, and nothing can be declared under it afterwards: declaring `Line` after an `Order` whose shape says `"Line"` fails, and says to declare `Line` first, to declare the two in one form, or to write `["quote", "Line"]` for the string.
- A shape can name the schemas of its form, but cannot call them: `["Expr", 1]` inside the form fails, since `Expr` has no shape yet. `["schema/open", "Sum"]` takes the name as it is, and a check fails if `Sum` turned out not to be a record or a list.
- A shape cannot ask the database while it is declared, since a snapshot writes the shape and it has to mean the same when it is loaded. To check a value against the facts, use a relation as a schema, or ask inside a lambda.
- Declaring a schema again, for example in a later `run` that shares the database, must repeat the same shape, and changes nothing. A schema and a relation cannot share a name.
- A named schema that is `schema/optional` lets a record's key be left out, and `schema/open` takes a named record schema, like the schemas they name.

### Taking data apart

A logic variable in a schema stands for a value. Once it is bound it is that value, and until then any value fits it, and binds it. So in a rule or query a schema is also a pattern: it tests a value and takes it apart at once. These goals bind the variables in a pattern:

- `["schema/fits?", value, schema]` binds the variables in the schema. When nothing else binds the value, it binds the value too, to each value the schema allows, if the schema can list them, as `in` binds its element to each item of a list. Data lists itself, a record or list of schemas every way of choosing its parts, with and without a key whose schema is optional, `schema/anyOf` what its schemas list, `schema/allOf` what its first schema that can list lists, `value/boolean?` false and true, `value/null?` null, and `["schema/arrayOf", schema, most]` every list of at most `most` items. Each is then checked, so the value takes exactly the values that fit: `["find", "?run", ["schema/fits?", "?run", ["schema/arrayOf", ["schema/anyOf", 2, -1], 2]]]` gives the seven runs of at most two moves. A schema that cannot list its values but says what kind they are, such as `value/integer?`, makes the value symbolic instead, and the goals about it are [solved for](#solving-for-values).
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
   "the rest": ["find", ["array/make", "?id", "?rest"], ["inbox", ["schema/open", {"type": "order", "id": "?id"}, "?rest"]]],
   "ends": ["query", ["=", ["array/make", "?first", "?_", "?last"], ["quote", ["a", "b", "c"]]]],
   "the tail": ["query", ["schema/fits?", ["quote", ["a", "b", "c"]], ["schema/open", ["array/make", "?head"], "?tail"]]]}]
```

Evaluates to `{ "refunds": [{ "id": 3 }], "orders": [{ "id": 1 }, { "id": 2 }], "lines": [[1, "a1", 2], [1, "b2", 1]], "the rest": [[1, { "lines": [{ "sku": "a1", "qty": 2 }, { "sku": "b2", "qty": 1 }] }], [2, { "lines": [], "rush": true }]], "ends": [{ "first": "a", "last": "c" }], "the tail": [{ "head": "a", "tail": ["b", "c"] }] }`.

- A record in a pattern is a record schema: it fits a record with the same keys. `schema/open` takes the keys it names from a record that has more, as `orders` does above, where the second order also has `rush`.
- A variable as the rest of `schema/open` binds what the record or list leaves over: the record of the other keys, as `the rest` does above, or the list of the items after, as `the tail` does. Put back together with the parts the pattern names, the two are the value. A rest that another goal bound first must be exactly what is left over.
- `?_` fits any value and binds nothing. A variable that occurs twice must take the same value: `{"a": "?x", "b": "?x"}` fits `{"a": 1, "b": 1}` and not `{"a": 1, "b": 2}`.
- Every `schema` function works in a pattern. `["schema/allOf", "value/integer?", "?id"]` binds `?id` only to an integer. `["schema/anyOf", a, b]` gives the answers of every schema that fits, each once: `["schema/anyOf", ["schema/open", {"a": "?x"}], ["schema/open", {"b": "?x"}]]` binds `?x` to 1 and then to 2 for `{"a": 1, "b": 2}`.
- An argument of a relation call that is not data is a schema like any other. With readings of `30`, `10`, and `"n/a"`, `["reading", "?sensor", "value/number?"]` asks for the two that are numbers, and `["and", ["limit", "?max"], ["reading", "?sensor", ["func/partial", "number/lessThan", "?max"]]]` for those above the limit.
- A variable can hold a schema. After `["=", "?ends", ["schema/anyOf", 2, 5]]`, the goal `["path", "?from", "?ends"]` asks for the paths that end in 2 or in 5.
- The order of the goals does not matter. A goal that binds through a pattern gives what the same goal gives when another goal has bound its variables first.
- `["schema/open", "?shape"]` does not bind `?shape`: it waits for another goal to bind it to a record of schemas.
- In plain code, where no rule or query is there to bind anything, a check with a variable in it is a goal, like `=` with one: `["schema/fits?", 1, "?x"]` evaluates to the goal, and `["query", ["schema/fits?", 1, "?x"]]` to `[{ "x": 1 }]`.
- `why` explains a rule's answer by the rows its goals matched, also when a goal says which rows with a schema.

### Solving for values

A schema stands for every value it allows. When nothing else binds the value `schema/fits?` checks and the schema cannot list its values, but says what kind they are, the value is symbolic, and the goals about it are solved for. Lion works out exactly which values meet them, says whether any does, or proves that none does, for every number.

```json
["begin",
  ["define", "careful", ["lambda", ["account", "amount"],
    ["cond", [["number/lessThan", ["object/get", "account", "balance"], "amount"], "account"],
             ["else", {"balance": ["number/subtract", ["object/get", "account", "balance"], "amount"]}]]]],
  {"between": ["find", "?x",
     ["and", ["schema/fits?", "?x", "value/integer?"],
       ["number/greaterThan", "?x", 2], ["number/lessThan", "?x", 6]]],
   "never overdrawn": ["query",
     ["not", ["exists", ["?account", "?amount"],
       ["and",
         ["schema/fits?", "?account", {"balance": "value/integer?"}],
         ["schema/fits?", "?amount", "value/integer?"],
         ["number/greaterThanOrEqualTo", ["object/get", "?account", "balance"], 0],
         ["number/greaterThan", "?amount", 0],
         ["number/lessThan", ["object/get", ["careful", "?account", "?amount"], "balance"], 0]]]]]}]
```

Evaluates to `{ "between": [3, 4, 5], "never overdrawn": [{}] }`: for every whole balance of at least 0 and every positive amount, the careful withdrawal leaves the balance at least 0.

- A schema computed where it is written, such as one that holds a lambda or one a function is given, is the same for every answer, so it stands for its values as the same schema under a name does: listed when it can list them, solved for otherwise.
- `value/integer?` stands for a whole number and `value/number?` for any number. A record or list of schemas stands for a record or list of what its parts stand for, `schema/anyOf` for any of its schemas' values, `["schema/arrayOf", schema, most]` for a list of each length up to `most`, and `schema/allOf` for what its first part stands for that fits the others. A predicate alone, such as a lambda, says no kind.
- A goal that waits only for such variables joins one step that runs after the goals its other variables need. `=` with such a variable on one side gives it the value of the other.
- The step works the goals out on the values: `number/add`, `number/subtract`, `number/multiply` and `number/divide` by a known number, `number/floor`, `number/ceiling`, `number/round`, and `number/remainder` by a known non-zero divisor, `value/integer?`, comparisons, `number/equals?`, `=`, `cond`, `match`, `schema/fits?`, `number/min`, `number/max`, `number/absolute`, `boolean/and`, `boolean/or`, `boolean/not`, `and`, `or`, `not`, `object/get` and `object/has?` on a record, and a lambda by its body (including `begin` with local `define` and recursion over bounded inputs). Products of unknowns are tracked as exact polynomials so matching nonlinear terms cancel in equalities and comparisons (for example `n * n + 2n + 1 = (n + 1) * (n + 1)`). A list of known length, such as one `["schema/arrayOf", schema, most]` stands for, keeps its items' values: `array/reduce`, `array/reductions`, `array/map`, `array/filter`, `array/flat-map`, `array/reverse`, `array/sort`, `array/slice`, `array/zip`, `array/some?`, `array/every?`, `array/length`, `array/head`, `array/tail`, `array/concat`, and `array/includes?` run on it item by item, and `in` takes each of its items, so a check of every run of commands or of a recursive sort over bounded lists can leave the values they carry to the solver (see [Checking every run of commands](#checking-every-run-of-commands)). For universal claims (`["not", ["exists", ...]]`) over recursive named schemas, unbounded `schema/arrayOf`, or lower-bounded integers, the solver also proves by structural or numeric induction whenever the recursive functions involved are pure, strictly decrease on a structural sub-part or lower-bounded integer measure, and return a uniform sort. Anything else on such a value, such as an uncancelled product of two unknowns, a string function, or a question, waits: the step lists the values of the variables it needs and runs it on each, as plain code does. When those are infinitely many, the step fails and names what the solver cannot reason about.
- The solver decides with exact numbers: Fourier and Motzkin's method for any number and Pugh's Omega test for whole numbers. Every question gets yes or no, the same on every machine. Plain code computes with the same exact numbers (see [`number`](#number)), so what the solver proves about numbers holds of what plain code computes.
- The step binds the variables whose values make the answers, to each combination of values they take, when those are finitely many: a whole number bounded on both sides, or a number the goals fix. In a query or a `find`, which give one answer or value for every match, and in a rule that aggregates, which combines one value from each, those are every variable of the body, as for values a schema lists; in any other rule, those its head shows. A variable a `cond` defines takes the value of each case that can hold. One with infinitely many values fails, and says so. The others, a plain rule's own, those `exists` lists, and a question's own under `not`, only need some values to exist. `why` explains a row the step gave with an `example` that meets its goals.
- A step gives at most 100,000 answers, splits into at most 4,096 cases, and makes at most 20,000 constraints while eliminating its variables; past those it is refused, so every question ends soon.

### Checking every run of commands

A model of commands is checked by asking about every run of them up to a length, which `["schema/arrayOf", "Command", 3]` stands for, and about the states each run passes through, which `array/reductions` gives. When the commands carry amounts a schema types, such as any positive whole number, the solver works the amounts out, so a check covers every amount, not only the ones a test tried.

```json
["begin",
  ["schema", "Amount", ["schema/allOf", "value/integer?", ["lambda", ["n"], ["number/greaterThan", "n", 0]]]],
  ["schema", "Command", ["schema/anyOf", {"deposit": "Amount"}, {"withdraw": "Amount"}]],
  ["define", "careful", ["lambda", ["balance", "c"],
    ["cond", [["object/has?", "c", "deposit"], ["number/add", "balance", ["object/get", "c", "deposit"]]],
             [["number/lessThan", "balance", ["object/get", "c", "withdraw"]], "balance"],
             ["else", ["number/subtract", "balance", ["object/get", "c", "withdraw"]]]]]],
  ["define", "careless", ["lambda", ["balance", "c"],
    ["cond", [["object/has?", "c", "deposit"], ["number/add", "balance", ["object/get", "c", "deposit"]]],
             ["else", ["number/subtract", "balance", ["object/get", "c", "withdraw"]]]]]],
  ["define", "overdraws", ["lambda", ["step"],
    ["query", ["exists", ["?run", "?balance"],
      ["and", ["schema/fits?", "?run", ["schema/arrayOf", "Command", 3]],
              ["in", "?balance", ["array/reductions", "?run", 0, "step"]],
              ["number/lessThan", "?balance", 0]]]]]],
  ["define", "reaches", ["lambda", ["step", "goal"],
    ["query", ["not", ["exists", ["?run"],
      ["and", ["schema/fits?", "?run", ["schema/arrayOf", "Command", 2]],
              ["number/equals?", ["array/length", "?run"], 2],
              ["not", ["array/some?", ["array/reductions", "?run", 0, "step"],
                ["lambda", ["balance"], ["number/greaterThanOrEqualTo", "balance", "goal"]]]]]]]]]],
  {"careful overdraws": ["overdraws", "careful"],
   "careless overdraws": ["overdraws", "careless"],
   "every run of two reaches 1": ["reaches", "careful", 1]}]
```

Evaluates to `{ "careful overdraws": [], "careless overdraws": [{}], "every run of two reaches 1": [] }`: no run of up to three commands, with any amounts, takes the careful account below 0; some run takes the careless one there; and a run of two withdrawals never brings the balance up to 1.

- A rule that must always hold is one no state of any run breaks: `exists` over a run and a state `in` its states, under `not`.
- Something that must eventually happen is something some state of every run meets: `array/some?` over the states. One checked at the end of every run is about what `array/reduce` gives. Which runs have run their course, such as those of a full length or those that end in a closing command, is a goal about the run.
- The shortest run that breaks a rule: a rule that gives each length of a run that breaks it, with the length in its head and the run only in its body, so its rows are the lengths; `aggregate/min` gives the least, and `why` shows a run of that length with amounts that break it.
- A run's length is known in each shape the schema gives it, so the solver runs the step function on each command in turn; see [Solving for values](#solving-for-values) for what it decides, and what waits for listed values instead.

### Proving that a command keeps a rule

A rule is kept by a step function when no state the rule allows, and no command, leads to a state that breaks it: the step of a proof by induction. With the state and the command typed by schemas, it is one question, for every state and every command:

```json
["begin",
  ["schema", "Account", {"balance": "value/integer?", "limit": "value/integer?"}],
  ["schema", "Amount", ["schema/allOf", "value/integer?", ["lambda", ["n"], ["number/greaterThan", "n", 0]]]],
  ["schema", "Command", ["schema/anyOf", {"deposit": "Amount"}, {"withdraw": "Amount"}]],
  ["define", "step", ["lambda", ["a", "c"], ["cond", [["object/has?", "c", "deposit"], {"balance": ["number/add", ["object/get", "a", "balance"], ["object/get", "c", "deposit"]], "limit": ["object/get", "a", "limit"]}], [["number/lessThan", ["number/add", ["object/get", "a", "balance"], ["object/get", "a", "limit"]], ["object/get", "c", "withdraw"]], "a"], ["else", {"balance": ["number/subtract", ["object/get", "a", "balance"], ["object/get", "c", "withdraw"]], "limit": ["object/get", "a", "limit"]}]]]],
  ["define", "within limit", ["lambda", ["a"], ["number/greaterThanOrEqualTo", ["number/add", ["object/get", "a", "balance"], ["object/get", "a", "limit"]], 0]]],
  ["define", "limit not negative", ["lambda", ["a"], ["number/greaterThanOrEqualTo", ["object/get", "a", "limit"], 0]]],
  ["define", "not overdrawn", ["lambda", ["a"], ["number/greaterThanOrEqualTo", ["object/get", "a", "balance"], 0]]],
  ["define", "keeps", ["lambda", ["rule"], ["query", ["not", ["exists", ["?a", "?c"], ["and", ["schema/fits?", "?a", "Account"], ["rule", "?a"], ["schema/fits?", "?c", "Command"], ["not", ["rule", ["step", "?a", "?c"]]]]]]]]],
  {"within limit": ["keeps", "within limit"], "not overdrawn": ["keeps", "not overdrawn"]}]
```

Evaluates to `{ "within limit": [{}], "not overdrawn": [] }`: every command keeps a balance within its overdraft limit, for every account; but a withdrawal can take an account with a limit below 0.

- When the proof fails, a rule that holds when a breaking state exists, and `why` of it, give the state and the command. A state that cannot be reached means the rule needs another beside it; Houdini's way of finding the largest set of candidate rules that keeps itself is a few lines of Lion over the same question.
- Where the solver's step stopped a rule, `why` shows a certificate (linear or integer split tree) or `induction` proof that [`proof/valid?`](#proof) checks without invoking the solver, along with the goals that contradict each other. A proof whose premises allow no state, such as one of a rule no account can meet, says `"vacuous": true`.
- `["schema/includes?", a, b]` says whether every value `a` allows fits `b`, decided the same way — across all value kinds (such as `value/number?`, `value/integer?`, `value/string?`, `value/array?`, `value/object?`), open records and lists (`schema/open`), unbounded collections (`schema/arrayOf`, `schema/recordOf`), and recursive or mutually recursive named schemas (including structurally uninhabited schemas and least-fixed-point loops).
- `["proof/rules", rel, schema]` (or `["proof/rules", {"relA": schemaA, "relB": schemaB}]` for mutually recursive relations) proves by rule induction that every row derived by those relations fits the target schema across all databases whose base relations satisfy their declared schemas, returning a proof value checkable by `proof/valid?`.
- See [Prove that every command keeps a rule](#prove-commands) for each, with examples.

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
- Any invariant or query assertion whose goal says an answer fails a schema, with `["not", [schema, value]]` or `["not", ["schema/fits?", value, schema]]`, ends its message with where the answer it shows as an example does not fit.
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

### Watching a query

Host code can be told when a query's answers change. `watch` runs a query, such as a `find`, against a database, and after each change a `fact`, `retract`, `rule`, or `invariant` form makes that adds or takes away an answer, calls back with the answers that came and went. The database keeps what it derived up to date as its facts change, so asking again costs what the change costs; a change an invariant refuses, and what `assuming` asks, tell nothing:

```ts
import { run, watch } from "@lionlang/core/evaluation/evaluate";

const { answers, stop } = await Effect.runPromise(
  watch(["find", "?to", ["path", "a", "?to"]], stdlib, database, ({ added, removed }) =>
    console.log("reachable now", added, "no longer", removed)
  )
);
await Effect.runPromise(run(["fact", ["edge", "c", "d"]], stdlib, { database }));
// reachable now [ "d" ] no longer []
stop();
```

## Standard Library

The default environment exported as `stdlib` namespaces entries as `<module>/<name>`.

Every function says how many arguments it takes: most take a set number, and the ones at the end of this section take any number, one or more, or any number after the ones they need. A call with any other number fails and says how many the function takes, so no argument is dropped and none is missing:

```json
["number/subtract", 10, 3, 1]
```

Fails with `"number/subtract" takes 2 arguments but got 3.` The call fails the same way where it waits for a logic variable, in a rule, a query, or a `find`. A relation, a schema, and a graph algorithm say the same of their own arguments, as in `"edge" takes 2 arguments (from, to) but got 3.`

Six functions combine their arguments, as `+`, `*`, `min`, `max`, `string-append`, and `append` do in Scheme. Four take any number, and none gives what combining nothing gives, as `(+)` is 0 in Scheme: `number/add` gives 0, `number/multiply` 1, `string/concat` `""`, and `array/concat` `[]`. `number/min` and `number/max` take one or more, since nothing is the smallest of no numbers. They work from left to right, so `["number/add", 1, 2, 3]` is `["number/add", ["number/add", 1, 2], 3]`, and `["number/add", 1]` is 1. The functions that pass arguments on take any number after the ones they need: `array/make`, `func/partial`, `func/bind`, `func/apply`, `object/new`, `object/call-method`, `object/call-method-path`, `schema/allOf`, and `schema/anyOf`.

### `number`

```json
["number/add", 1, 2]
["number/add", 1, 2, 3]
["number/subtract", 10, 3]
["number/multiply", 5, 4]
["number/divide", 20, 4]
["number/divide", 1, 3]
["number/add", 0.1, 0.2]
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
["number/round", 2.345, 2]
["number/toString", 42]
["number/toString", ["number/divide", 1, 3]]
["number/toString", 1234567.5, ","]
["number/fromString", "1,234,567.5", ","]
```

Every number is exact, as Scheme's exact numbers are: an integer of any size or a fraction. A number a program writes is the exact value its digits write, so `0.1` is one tenth and `9007199254740993` is itself, and a JavaScript number a host passes stands for the decimal its shortest digits write. So arithmetic is exact: `["number/add", 0.1, 0.2]` is `0.3`, `["number/add", 9007199254740991, 2]` is `9007199254740993`, no sum or product overflows, and `["number/divide", 1, 3]` is the fraction one third, which times 3 is 1. A sum and a mean are exact too, in whatever order the values come. Division by zero has no result and fails with `ArithmeticError`, and so does a whole power with more than 4,300 digits; a number read from text may have at most as many. A power that is not whole, such as a square root, is the nearest double, which stands for its digits as every JavaScript number does. `number/round` takes a number of places after the point: `["number/round", 2.345, 2]` is `2.35`, a half rounding up. A result is written as JSON with each number's digits, and a fraction no decimal writes, such as 1/3, has no JSON text: the `lion` command, the website, and `object/json-stringify` fail with `ArithmeticError` and say to round it or write it as text. A snapshot writes it as `["number/divide", 1, 3]`, which reads back as the same number.

`number/toString` is the number as text, the way JSON writes it: `"42"`, `"-0.5"`, `"1e+21"`, and a fraction no decimal writes as Scheme writes it, `"1/3"`, which `number/fromString` reads back. With a second argument, a string, the whole part is written in groups of three digits with that string between them, as `#:group-sep` does in Racket: `["number/toString", 1234567.5, ","]` is `"1,234,567.5"`, and `["number/toString", -1234, " "]` is `"-1 234"`. The digits after the point and a number written with an exponent stay as they are. With `string/concat` it builds text from a number, also from one a rule has bound:

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
["array/slice", ["array/make", 1, 2, 3, 4], 1, 3]
["array/slice", ["array/make", 1, 2, 3, 4], -2]
["array/length", ["array/make", 1, 2, 3]]
["array/concat", ["array/make", 1, 2], ["array/make", 3, 4]]
["array/concat", ["array/make", 1], ["array/make", 2], ["array/make", 3]]
["array/zip", ["array/make", 1, 2, 3], ["array/make", "a", "b"]]
["array/includes?", ["array/make", 1, 2, 3], 2]
["array/range", 0, 5]
["array/map", ["array/make", 1, 2, 3], ["lambda", ["x"], ["number/add", "x", 1]]]
["array/filter", ["array/make", 1, 5, 2, 4], ["lambda", ["x"], ["number/greaterThan", "x", 2]]]
["array/flat-map", ["array/make", 1, 2], ["lambda", ["x"], ["array/make", "x", "x"]]]
["array/reverse", ["array/make", 1, 2, 3]]
["array/sort", ["array/make", 3, 1, 2]]
["array/sort", ["array/make", 3, 1, 2], "number/greaterThan"]
["array/reduce", ["array/make", 1, 2, 3], 0, ["lambda", ["acc", "x"], ["number/add", "acc", "x"]]]
["array/reductions", ["array/make", 1, 2, 3], 0, ["lambda", ["acc", "x"], ["number/add", "acc", "x"]]]
["array/some?", ["array/make", 1, 5, 2], ["lambda", ["x"], ["number/greaterThan", "x", 4]]]
["array/every?", ["array/make", 1, 5, 2], ["lambda", ["x"], ["number/greaterThan", "x", 0]]]
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
["string/chars", "a𝄞b"]
["string/slice", "lionlang", 0, 4]
["string/slice", "lionlang", -4]
["string/padStart", "7", 2, "0"]
["string/padEnd", "7", 3, "."]
["string/numbers", "$1,250.5M in fiscal 2023-24, down -3%", ","]
```

`string/join` is a list of strings with the separator between them: `"a, b, c"`. With a third string, that one stands before the last item in place of the separator, as `#:before-last` does in Racket: `"a, b and c"`, and `"a and b"` for two items. One item is itself, and an empty list is `""`. Every item must be a string, so a list of numbers is joined after `["array/map", numbers, "number/toString"]`.

`string/split` is the parts of the text between each separator, as JavaScript splits: `["a", "b", "c"]`. Joining the parts with the same separator gives the text back. `string/chars` gives the text's Unicode characters in order, keeping astral characters whole: `["string/chars", "a𝄞b"]` is `["a", "𝄞", "b"]`. `string/slice` is the text from one position up to, but not including, another, as JavaScript's `slice` cuts it: `"lion"`. A negative position counts from the end, a position past either end stops there, and without the second position the part runs to the end: `"lang"`. `array/slice` cuts a list the same way, `[2, 3]` and `[3, 4]` above, so the two parts of a cut at any position join back into the whole. `string/padStart` and `string/padEnd` make the text as long as the number says by putting copies of the last argument before it or after it, as JavaScript does: `"07"` and `"7.."`. Text that is already that long is unchanged.

`string/numbers` is every number written in the text, in order, each read as `number/fromString` reads it, with the same optional separator: the example is `[1250.5, 2023, 24, -3]`. A minus sign counts only where no letter, digit, or point stands right before it, so the range `2023-24` holds 2023 and 24, and `COVID-19` holds 19. Words for amounts, such as "million", are not read: `"$1.2 billion"` holds `1.2`. It is how a program can check that a figure was copied from the words it is said to come from, rather than worked out by whoever copied it.

### `object`

```json
["object/get", {"a": 1}, "a"]
["object/get", {"a": 1}, "b", 0]
["object/has?", {"a": null}, "a"]
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

`object/get` gives the value under a key the record has, `null` among them. For a key it does not have, it gives its third argument, as Racket's `hash-ref` gives a failure result, so `["object/get", {"a": 1}, "b", 0]` is `0`; without one it fails with `KeyNotFoundError`, `There is no key "b" in {"a":1}.`, as `object/get-path` does. Only a record's own keys count, so `"toString"` is not a key of `{}`. `object/has?` says whether a record has a key, as `hash-has-key?` does in Racket: `["object/has?", {"a": null}, "a"]` is `true`. The solver reads both on a record whose shape it knows, so a proof can ask which kind of command it was given with `["object/has?", "c", "deposit"]`.

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

### `quantity`

Numbers that carry their units, checked when the program runs, as Pint checks them. A quantity is data, a record of a `value` and a `unit` from each base unit to its whole exponent, so a schema can say what unit a value has, a fact can hold one, and a snapshot saves it:

```json
["begin",
  ["define", "distance", ["quote", {"value": 120, "unit": {"m": 1}}]],
  ["define", "duration", ["quote", {"value": 8, "unit": {"s": 1}}]],
  {"speed": ["quantity/divide", "distance", "duration"],
   "no unit left": ["quantity/divide", "distance", "distance"],
   "in km": ["quantity/in", ["quantity/divide", "distance", ["quote", {"value": 1000, "unit": {"m": 1, "km": -1}}]], {"km": 1}]}]
```

Evaluates to `{"speed": {"value": 15, "unit": {"m": 1, "s": -1}}, "no unit left": 1, "in km": 0.12}`. `quantity/multiply`, `quantity/divide`, and `quantity/power` add, take away, and multiply the exponents; `quantity/add` and `quantity/subtract` need one unit, and fail with `ArithmeticError` otherwise, as `quantity/add: 120 {"m":1} and 8 {"s":1} have different units.`; `quantity/in` gives a quantity's number once its unit is the one asked for. A plain number is a quantity with no unit, and a result with no unit left is its plain number. There is no table of units: converting is multiplying by a quantity such as `{"value": 1000, "unit": {"m": 1, "km": -1}}`.

### `func`

```json
["func/bind", "fn", "obj"]
["func/apply", "fn", "obj", 1, ["array/make", 2, 3]]
["func/callback", ["lambda", ["x"], ["number/add", "x", 1]]]
["func/partial", "fn", 1, 2]
["func/catch", ["lambda", [], ["number/divide", 1, 0]], ["lambda", ["failure"], "failure"]]
["func/raise", "out of stock"]
["func/reset", ["lambda", [], ["number/add", 1, ["func/shift", ["lambda", ["k"], ["number/multiply", 10, ["k", 5]]]]]]]
```

`func/catch` calls a function of no arguments and gives its value; when it fails, it calls the handler with the failure as data and gives that, as Racket's `with-handlers` does: `["func/catch", ["lambda", [], ["number/divide", 1, 0]], ["lambda", ["failure"], "failure"]]` is `{"failure": "ArithmeticError", "message": "number/divide: 1 ÷ 0 has no finite result."}`. `func/raise` fails with any value, as Racket's `raise` does: its message is the value, a string as it is, and a catch gives back the `value`, with `"failure": "raised"`. A call that waits for a logic variable is not a failure, so a catch in a rule or a `find` gives for each value what plain code gives with the value in place.

`func/reset` and `func/shift` are delimited continuations, as Racket's `reset` and `shift` are: `func/reset` runs a function of no arguments, the delimited part, and `func/shift`, inside it, stops the delimited part where it stands and has the reset give what its handler gives, called with `k`, the rest of the delimited part. A call of `k` with a value resumes it there, as the value of the shift, and gives what the rest gives: the example above is `60`, ten times one more than 5. Generators, coroutines, and early exits are each one use of the two. Unlike Racket's, a continuation resumes once: a second call of one `k` fails, `A continuation was resumed a second time: …`, since the delimited part runs in a fiber of its own that can only go on once.

`func/partial` is how a program curries a function: it gives a function of the arguments still to come, so `[["func/partial", "number/subtract", 10], 3]` is `7`. Lion never curries by itself; a call with fewer arguments than its function takes fails, as it does in Scheme.

`func/apply` calls a function with `obj` as `this`, the arguments given, and then the items of its last argument, a list, as Scheme's `apply` and JavaScript's `Function.prototype.apply` spread it: `["func/apply", "number/add", null, 1, ["array/make", 2, 3]]` is `6`, as `["number/add", 1, 2, 3]` is. A last argument that is not a list fails, as in `"func/apply" takes a list as argument 4 but got 3.`

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
["value/unknown?", "lion"]
["value/any?", 42]
["value/identity", 42]
```

`value/any?` is true for every value. `value/unknown?` is true for an [unknown](#existential-rules), such as a value a rule invented, and `value/object?` is false for one. `value/undefined?` and `value/symbol?` are mainly useful when Lion is evaluating host values supplied through the environment.

### `schema`

Checks values against [schemas](#schemas), and builds schemas out of others.

```json
["schema/fits?", 3, "value/number?"]
["schema/problems", {"id": "x"}, {"id": "value/integer?", "name": "value/string?"}]
["schema/assert", 3, "value/number?"]
["schema/includes?", "value/integer?", "value/number?"]
["schema/anyOf", "value/string?", null]
["schema/allOf", "value/integer?", ["lambda", ["n"], ["number/lessThan", "n", 3]]]
["schema/arrayOf", "value/number?"]
["schema/recordOf", "value/number?"]
["schema/optional", "value/string?"]
["schema/open", {"id": "value/integer?"}]
```

The second evaluates to `[{ "path": ["id"], "expected": "value/integer?", "found": "x" }, { "path": ["name"], "expected": "value/string?" }]`.

### `proof`

Checks proof values with a small trusted kernel (without invoking the solver), and proves universal properties of rule-defined relations by rule induction.

```json
["proof/valid?", proof]
["proof/rules", "path", "PosPath"]
["proof/rules", {"even": "PosRow", "odd": "PosRow"}]
```

`proof/valid?` verifies linear refutation certificates, Omega integer split trees (`kind: "split"`), case splits (`kind: "cases"`), induction proofs (`kind: "induction"`), lemma compositions (`kind: "lemma"`), and `why` derivation trees. `proof/rules` checks existing facts, base relation schemas, and every rule (including element-preserving `aggregate/min` and `aggregate/max` heads), returning a kernel-checkable induction proof or a counterexample.

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

Then Lion code in [`packages/agent/src/agent.json`](packages/agent/src/agent.json) uses:

- `object/get-path` to traverse host APIs
- `object/new` to construct classes
- `object/call-method` via aliases such as `"()"`
- `func/callback` to hand Lion lambdas to promise and event APIs
- `match`, `cond`, `begin`, and `define` to orchestrate application flow

That lets Lion drive a non-trivial terminal UI agent entirely from JSON.

### Host values

A host function may give any value, also one JSON cannot hold, such as a `Date`, a `Map`, a `bigint`, an instance of a class, or `undefined`, and Lion checks none. Plain code carries such a value as it is: a name, a list, a record, a lambda's argument, and a function's result give back the very value, and `=` is true of it only for the same value, as Racket's `equal?` is of values it cannot look into. What the logic database holds and what a question answers stay data, as they do for a function, so a fact, a derived row, or an answer of `query` or `find` that holds such a value fails, and a message shows the value as its kind in angle brackets, as it shows a function as `<function>`:

```ts
const env = { ...stdlib, "host/now": () => new Date(0) };
// ["begin", ["define", "now", ["host/now"]], ["array/make", "now", ["=", "now", "now"]]]
//   gives [the very Date, true]
// ["begin", ["relation", "seen", ["at"]], ["fact", ["seen", ["host/now"]]]]
//   fails: Facts may only contain data, but the "at" of ["seen","<Date>"] is "<Date>", which is not data.
```

The standard library itself gives only JSON values.

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

The explorer page runs the Lion of the `lion` command that checks it: `build-explorer.mjs` asks that command, the one the replay runs, for [`lion worker`](#command-line) and puts what it prints in the page. So the page and `page-check.json` give the same answers, and a page built in this repository runs the Lion in it once the CLI is built with `bunx turbo build --filter=@lionlang/cli`.

The properties in `packages/metrics/src/tests/research-skill.test.ts` check the core program against a plain model of provenance and restatement, its figure check against the numbers written into a quote, its readings against a plain model of senses and choices, its two time functions against JavaScript's clock, and its scripts: the explorer page against the model, plan, saved texts, and engine it was given, the engine against what the `lion` command that checks the page gives for `lion worker`, a reader's choice in a lookup against the data it stands for, the wording functions against plain ones, the recorder against the notes it was given, the page reader against what a reader sees, the quote check against quotes that are and are not in a source's text, where a quote stands against the text it was found in, the page check against every text and query of a plan, and each script started through a link, as an installed skill starts it. The properties in `packages/cli/src/tests/worker.test.ts` check that `lion worker` answers every program as the `lion` command does, against the same saved database.

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
- **Experiments.** A `score` is a number the agent is making better, and a `direction` an idea it tries; a run that `tries` a direction is an experiment of it, on the version of the files it ran on. A direction `addresses` the problems it is meant to fix, and a belief that `tries` a direction is what one experiment was expected to do: it is judged in the version it was formed in and no other, so putting the files back does not count against it. Where it predicts a problem's question otherwise than the problem shows, the experiment `targets` the problem, and the model says whether that version `fixed` it or left it `unfixed`. A direction's experiments say nothing about a score none of them ran with an earlier version to beat, such as the same eval under another model: its record is `carried` to that score until a run there judges it.
- **What only the user decides.** A question the agent lists under `ask` is the user's to settle, such as which of two meanings a request has. It is `undecided` until the user's own words answer it, and an answer from anywhere else, a file, a command, a doc, or the agent, is `presumed`, so a choice made for the user is listed rather than hidden. It is the reasoning skill's form of the research skill's readings: one wrong reading early breaks everything built on it, and nothing observed later can contradict a choice.

To use it with Claude Code, link or copy the folder into your skills:

```bash
ln -s "$(pwd)/skills/lion-reasoning" ~/.claude/skills/lion-reasoning
```

Its scripts do the mechanical parts, and run the published `@lionlang/cli`, so a project's own copy of Lion, even a broken one, never changes the checker: `start.mjs` makes a task folder under `.lion/` and keeps it out of git, `see.mjs` runs a command and keeps its output and exit status as evidence with the hashes of what it depended on, `record.mjs` turns notes into a step and refuses a quote that is not in its source's text, `replay.mjs` rebuilds the model from its steps, and `ask.mjs` asks the model a question against the project as it is now, on a copy, so a question never changes the model.

The properties in `packages/metrics/src/tests/reasoning-skill.test.ts` check the core program against a plain model of versions, evidence, and beliefs, rival explanations against the law that an answer keeps exactly those that predicted it, the recorder against the notes it was given, a version's hashes against the files they were taken from, a path git ignores against the disk, the chain from files to the present answer on files that change, and each script started through a link. `bun run mutate` breaks each of these behaviors in turn; a mutation can now run the tests of another package than core, with `package`.

## Project Record

Lion keeps its own changelog and design decisions as a Lion model of its development, in [`history/`](history/): the record of changes, releases, and decisions that people write, the git history, and what each commit said. [`CHANGELOG.md`](CHANGELOG.md), [`DECISIONS.md`](DECISIONS.md), and the timeline at [lionlang.dev/changelog.html](https://lionlang.dev/changelog.html) are written from it, so change the record, not those files.

What people write are plain JSON files, one piece of work per file:

- `history/notes/<topic>.json` holds claims: `{"claims": [{"quote", "says"}]}`. The quote is a source's words and `says` is what they say, in one of five kinds: a feature that exists or was removed, a behavior and what Lion does in it, a rule with the behavior it predicts, a decision with what it chose over what and why, and a figure. A claim names the `"commits"` that made it, the `"decisions"` it follows, and the `"source"` it quotes, such as a commit; a claim with no source is said by its own file, in the words the changelog shows. A notes file with a `"title"`, `"context"`, `"decision"`, `"consequences"`, and `"alternatives"` is a decision record, and its claims quote that text: what it decides and what it asserts about Lion.
- `history/releases/<date>-<name>.json` is one release: `{"ships": [{"name", "version"}]}`, with an optional `"summary"`, `"notes"` under a heading, and `"commit"`.

A commit is named by the start of its hash, or as `{"commit", "quote"}` with words from its message, which must be there. A file renamed with nothing else changed keeps the commit that added it; a renamed and edited file counts as added anew, since git's renames by likeness would pair two different files that share most of their lines. Everything else is derived by the rules in [`history/core.json`](history/core.json) from those files and from git, which is read in as facts: every commit with its parents, time, and message, every tag, and the commit that added each file.

- A claim is made by the commits it names, else by the commit it quotes, else by the commit that added its file. It shipped in the oldest release whose commit reaches every one of those commits, so no file says which release a change is in.
- An item is a question with an answer, such as a behavior and what Lion does in it. It appears once, under the release that first shipped a claim giving that answer, in the words of the latest claim, with every claim that gives it as a source. A feature removed and added again, or a decision made one way and later another, is two items.
- What a decision record asserts is checked: against Lion at HEAD where a probe runs the case, and otherwise against what the repository says now. A probe is a Lion program that can also read the repository's files and run a declared command, so a record can assert what the pre-commit hook runs or which version of a package is installed. Each assertion holds, is broken, is stated but not run, or was replaced by a later word.
- `bun run history check` builds the model and fails on a `feat` or `fix` commit that no claim is made by, a commit named that no commit or more than one starts with, a quote that is not in its source, a decision followed that no record holds, a decision record with no decision claim, a version that does not rise from one release to the next, a tag on another commit than its release, a finding of the research that no list holds (see below), and a page that is not what the model writes. It lists releases that have no tag yet, and counts the rules in force that no probe checks, which nothing Lion does can break until a probe runs a case they predict. The record's tests run it, so the pre-commit hook and CI do too.

The pages are Lion expressions in [`history/outputs.json`](history/outputs.json), evaluated against the model, so every heading, date, link, and quote in them comes from it. `CHANGELOG.md` lists each release's items by section: Breaking, Added, Removed, Changed, Fixed, Documentation, Decided, and Rules. `DECISIONS.md` lists every decided question, oldest first, with each answer it was given and every record that explains it, with what the record asserts and how each assertion checked. The timeline, `docs/changelog.html`, is HTML that Lion writes the same way: each release on a line through time, newest first, with its items by section, figures among them, and each item's sources, the records it follows, and the findings that wait for a decision above it. Lion turns Markdown in the claims into HTML itself, code spans and links included. `docs/changelog.css` and `docs/changelog.js` only style it and let a reader filter by section and search; without the script the page shows everything.

```bash
bun run history write    # build the model, and write CHANGELOG.md, DECISIONS.md, and docs/changelog.html
bun run history check    # what in the record or the research needs fixing
bun run history ask '["query", ["first_shipped", {"decision": "record-pattern-keys"}, "?chose", "?release"], {"order": "release"}]'
```

The last asks which release first shipped each answer to one question, a decision made one way and later another:

```json
[
  {"chose": "pattern-keys-only", "release": "history/releases/2026-04-06-core-0.1.0.json"},
  {"chose": "exact", "release": "history/releases/2026-11-12-core-0.7.0.json"}
]
```

The record was backfilled from the git history: every entry of the hand-written changelog, tied to the commits that made it, lands by ancestry alone in the release it was written under, and every decision quotes the commit messages it rests on. Those entries and decisions were later turned into claims, each keeping its words and the commits that made it, beside the claims readers took from every commit, so one change said in a commit and in the changelog is one item. The tooling lives in `packages/history`, and runs on the workspace's own `@lionlang/core`. Its properties check the rules against a plain model of generated commit graphs, merges, releases, tags, and notes of claims, the pages against that model by reading them back, the facts from git against real repositories built step by step, and the repository's own record against `git rev-list`.

### What every commit said

The record says what changed and why. The rest of the model, in [`history/research/`](history/research/), is built with the [lion-research skill](skills/lion-research/): every statement each commit made, quoted word for word from its message and diff, what the README, AGENTS.md, the guidelines it points to, and CLAUDE.md say now, the claims of each recorded decision, and what Lion at HEAD does in each case a probe runs. Rules over those statements check the project against itself: rules in force that predict different behavior for one case, behavior that breaks a rule in force, a base form that follows a precedent other than Scheme, Racket, or JSON, a removal or breaking change in a commit that records no decision, a figure that does not start where the one before it ended, and documentation that says something other than what Lion does.

A publisher's latest word counts, so a rule is in force while the repository's latest word on it says it holds, it predicts for a case what its latest statement naming the case predicts, and a decision decided again differently is reversed. A decision record in `history/notes/` holds claims, each a quote from its own words and what it says, so a new decision is checked against everything else as soon as it is written. Every finding waits in `history/research/known.json` for a decision, or is accepted with a reason in `accepted.json`; `bun run history check` fails on a finding in neither.

```bash
bun run history ask '["query", ["reversed", "?topic", "?before", "?after"], {"limit": 3}]'
```

The query asks which decisions the project made one way and later another:

```json
[
  {"topic": "repl-surface", "before": "terminal-repl", "after": "graph-editor"},
  {"topic": "library-function-arity", "before": "two-arguments", "after": "strict"},
  {"topic": "evaluation-error-representation", "before": "tagged-errors", "after": "parse-error"}
]
```

The timeline shows all of it to a reader who will not write a query: what waits for a decision first, then each release with what its commits decided and said, each statement linked to its commit, with filters and a search. `history/research/README.md` says how to read new commits into the model and how to settle a finding.

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

To measure a change to the language, beside `main`: `bun run measure --against main` for how much code and how many rules it has, `bun run bench --against main` for speed, and `bun run scale --against main` for how time and memory grow as the facts grow from a thousand to a hundred thousand and more. `bun run capability` grades the capability corpus, tasks of general computation, logic programming, and formal proofs that Lion's reference programs must keep passing. [`packages/metrics`](packages/metrics/README.md) describes each.

## Website

[lionlang.dev](https://lionlang.dev) is served by GitHub Pages straight from `docs/`, with no build step. The live examples run `docs/lion-worker.js`, a bundle of `@lionlang/core` built by `@lionlang/site-runtime`. After changing the core evaluator, rebuild and commit it:

```bash
turbo build --filter=@lionlang/site-runtime
```

The documentation page, [`docs/docs.html`](https://lionlang.dev/docs.html), is generated from the fragments in `packages/site-runtime/content/`, one per document, organized by the [Diátaxis](https://diataxis.fr/) framework into tutorials, how-to guides, reference, and explanation. A fragment's `<lion-example>` becomes a live editor, and the build runs every example with the same evaluator the page uses and writes its real result, so a published result can never drift from what Lion does. The build fails on an example that errors unexpectedly, on one too slow for the browser, on a link to an id the page lacks, and on a special form or library function that no example uses, so every part of Lion is shown working. After editing a fragment, or the core evaluator, rebuild the page:

```bash
bun run --cwd packages/site-runtime docs
```

[`docs/changelog.html`](https://lionlang.dev/changelog.html), the changelog as a timeline, is written by the project record with `bun run history write` (see [Project Record](#project-record)), and Biome leaves it alone, as it does `docs/docs.html`.

GitHub Pages lets browsers cache every file for ten minutes, so `docs/index.html` and `docs/docs.html` load their scripts and stylesheet with a `?v=` hash of the site's assets, and the scripts pass it on to the worker and highlighter. A returning visitor therefore never runs new examples on a cached evaluator. The build above updates the hash. After editing only files in `docs/`, update it with:

```bash
bun run --cwd packages/site-runtime stamp
```

CI fails when either page's hash is out of date, and the site-runtime tests fail when `docs/docs.html` is not what its fragments build.

The same build writes [`packages/core/README.md`](packages/core/README.md), the page npm shows for `@lionlang/core`, from this README: its opening and the sections that describe the language, from Basic Usage to Host Interop, word for word. A link to a file of the repository, or to a section that page leaves out, is written there as a full address, and the page ends with a list of the sections it leaves out. So the two cannot say different things, and the site-runtime tests fail when that file is not what this README gives. Edit this README, never that file.

What the pages decide without touching a page is in `docs/pure.js`: which section "On this page" marks as the one being read, and how an example shows how long its program ran. The site-runtime tests check it with properties, against a model of a page that a browser scrolls:

```bash
turbo test --filter=@lionlang/site-runtime
```

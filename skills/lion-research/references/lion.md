# Lion for research models

The part of Lion a research model uses. Every example here was run; the results shown are what Lion gave. The full language is documented at [lionlang.dev/docs.html](https://lionlang.dev/docs.html).

## Contents

- [How Lion reads JSON](#how-lion-reads-json)
- [When a string stops being text](#when-a-string-stops-being-text)
- [Relations and facts](#relations-and-facts)
- [Goals, variables, and patterns](#goals-variables-and-patterns)
- [Rules](#rules)
- [Asking: query, find, why](#asking-query-find-why)
- [Counting and summing](#counting-and-summing)
- [Graph algorithms](#graph-algorithms)
- [Schemas and invariants](#schemas-and-invariants)
- [What the errors mean](#what-the-errors-mean)
- [Limits worth knowing](#limits-worth-knowing)
- [Functions](#functions)

## How Lion reads JSON

A Lion program is one JSON value.

| JSON | Means |
|---|---|
| number, `true`, `false`, `null` | Itself. |
| `"text"` | What the name is bound to, if anything is: a relation, a schema, a function such as `"number/add"`. Otherwise the string. |
| `"?name"` | A logic variable. `"?_"` is a variable you do not care about; each one is separate. |
| `[head, …]` | A call or a form. The head is a function, a relation, or a form's name such as `"rule"`. An array is never data on its own. |
| `{…}` | A record. Its keys are kept and its values are evaluated. |
| `["quote", x]` | `x` exactly as written, as data. |

A list of data is therefore `["quote", ["tax", "law"]]`, or `["array/make", "tax", "law"]` when its items are computed.

`["begin", a, b, c]` runs forms in order and gives the last one's value. A record of queries, `{"a": query, "b": query}`, gives a record of answers, which is how `checks.json` asks everything at once.

## When a string stops being text

A string is a name before it is text. Three things turn text into something else:

| The string | Becomes | You see |
|---|---|---|
| equals the name of a relation or schema, such as `"source"` | that relation | `Facts may only contain JSON data, but the "text" of ["note","source"] is the relation "source". To mean the string itself, write ["quote", "source"].` |
| starts with `?` and reads as a name, such as `"?why"` | a logic variable | `Facts may only contain JSON data, but the "text" of ["note","?why"] is the logic variable "?why". To mean the string itself, write ["quote", "?why"].` |
| looks like a misspelled function, such as `"number/ad"` | an error | `Nothing is bound to "number/ad". Did you mean "number/add"? …` |

So wrap in `["quote", …]` everything that came from a source: quoted words, titles, URLs, and whole records of what a claim says. Inside a quote nothing is evaluated, so one quote around a record covers every string in it.

Text you choose yourself, such as ids and the words of an enumeration, can stay bare as long as it is not also the name of a relation or schema. An entity called `claim` or `source` needs another id.

In a rule, a record with variables in it cannot be quoted, since the variables must stay variables. Its constant strings follow the same rule: `{"by": "acme"}` is fine unless something is named `acme`.

## Relations and facts

```json
["relation", "status", ["id", "state"], {"key": "id"}]
["fact", ["status", "a", "open"], ["status", "b", "open"]]
["fact", ["status", "a", "closed"]]
["retract", ["status", "b", "open"]]
```

- A relation with a key holds one row per key, so a fact with a key that is already there replaces the row. After the forms above, `status` holds only `a, closed`.
- `retract` removes a row only when every column matches.
- One `fact` form is one change: all of its facts go in, or none do. Put rows that need each other in one form.
- Adding a fact that is already there changes nothing, so running a step twice is safe.
- A fact holds JSON data only.

## Goals, variables, and patterns

Calling a relation makes a goal: a question about its rows. Each argument says what its column must be.

```json
["doc", "?id", "?tags", 2019]
```

asks for the documents of 2019 and binds `?id` and `?tags` for each. An argument can be:

| Argument | Matches |
|---|---|
| a value | a column equal to it |
| `"?name"` | anything, and binds the variable. The same variable twice must take the same value. |
| `"?_"` | anything |
| a record, `{"type": "revenue", "usd_m": "?v"}` | a record with **exactly** these keys |
| `["schema/open", {"usd_m": "?v"}]` | a record with at least these keys |
| `["array/make", "?first", "?_"]` | a list of exactly that length, item by item |
| a predicate, `"value/number?"` | a column the predicate accepts |
| `["schema/allOf", "value/number?", "?x"]` | a number, bound to `?x` |

A record pattern is closed. `{"revenue": "?c"}` does not match `{"revenue": "acme", "year": 2024}`; write every key or open the record.

For a kind of claim with a field that is sometimes there, mark the field with `["schema/optional", …]` in the schema and read the claim with an open pattern, so one rule covers both shapes:

```json
{"cause": "value/string?", "standing": "value/string?", "note": ["schema/optional", "value/string?"]}
["claim", "?c", "?_", "?_", ["schema/open", {"cause": "?cause", "standing": "?standing"}]]
```

A schema for a list of a fixed length is the list of its items' schemas: `["array/make", "value/integer?", "value/integer?"]` fits two integers and nothing longer or shorter, where `["schema/arrayOf", "value/integer?"]` fits any number of them. Use the fixed form for anything a rule takes apart by position, or a list of the wrong length will fit the schema and then match no rule.

Other goals:

- `["=", "?x", value]` binds `?x`, or compares when both sides are known. Either side can be a pattern.
- `["in", "?tag", "?tags"]` binds `?tag` to each item of a list, or tests membership.
- `["and", g, …]`, `["or", g, …]`, `["not", g]` combine goals. `not` holds when the goal has no match.
- Any call on a variable is a filter once the variable is bound: `["number/greaterThan", "?age", 4]`.

## Rules

```json
["rule", head, goal, goal, …]
```

The head holds whenever every goal holds. The rows a rule derives are never stored: they are recomputed from the facts, so they are always current.

```json
["rule", ["controls", "?owner", "?company"], ["owns", "?owner", "?company"]],
["rule", ["controls", "?owner", "?company"],
  ["controls", "?owner", "?middle"], ["owns", "?middle", "?company"]]
```

With `owns` facts `a→b`, `b→c`, and `x→c`, `["find", "?o", ["controls", "?o", "c"]]` gives `["a", "b", "x"]`.

- Declare the head's relation first, with `relation`.
- Several rules with the same head are alternatives: the relation holds what any of them derives.
- Every variable in the head must be bound by a relation goal, `=`, or `in` in the body.
- The head can compute: `["elapsed", "?a", "?b", ["number/subtract", "?tb", "?ta"]]`. So can `=` in the body: `["=", "?age", ["number/subtract", 2026, "?year"]]`.
- Filters run in the order written once their variables are bound, so a guard goes first: `["value/number?", "?x"], ["number/greaterThan", "?x", 1]`. Without the guard, a row holding `"n/a"` fails the whole query: `["number/greaterThan",["quote","n/a"],1] failed: Expected number at [0]`.
- A rule can ask a question with `not`, with `find`, or by using a goal as a value. Variables that the rule has bound keep their values inside it; any other variable belongs to the question.
- Names are fixed when the rule is written. A `define` used in a rule must come before it in the same program.

## Asking: query, find, why

```json
["query", ["doc", "?id", "?_", "?year"], {"order": "-year", "limit": 2}]
```

gives one record per answer, keyed by variable name: `[{"id": "d2", "year": 2023}, {"id": "d3", "year": 2021}]`. `?_` is left out. Options: `"order"` (a name or a list; `-` for descending), `"limit"`, `"offset"`, and `"assert"` (`"some"` or `"none"`, which fails the program when it is not so). Without `"order"` the order of answers is not fixed, so ask for one whenever it matters.

```json
["find", {"doc": "?id", "tags": ["array/length", "?tags"]}, ["doc", "?id", "?tags", "?_"]]
```

takes a template and one goal; join several goals with `["and", …]`. It gives the template's value for every match, as a sorted list: `[{"doc": "d1", "tags": 2}, {"doc": "d2", "tags": 1}, {"doc": "d3", "tags": 1}]`. Use it for a plain list of values, and inside rules and aggregates.

A `find` gives one value for each match, so a value that several rows lead to is in the list several times. `["find", "?source", ["claim", "?_", "?source", "?_", "?_"]]` lists a source once for every claim it makes. For the distinct values wrap it: `["aggregate/unique", ["find", …]]`, and to count them use `["aggregate/countUnique", ["find", …]]`, not `aggregate/count`.

```json
["why", ["corroborated", ["quote", {"headcount": "acme", "year": 2024}], 1150]]
```

explains one row: the rule that derived it, and under `because` the rows that rule matched, each explained in turn, down to recorded facts marked `"given": true`. It gives `null` when the row does not hold. Give `why` a complete row with every column a value, and quote records and text in it.

At the command line a `why` tree is long, since each node repeats its rule. To see only the recorded facts it rests on:

```bash
bunx @lionlang/cli why.json --database model.json | jq -c '.. | objects | select(.given) | .fact'
```

The explorer page shows the same tree folded, with each claim's quote and source.

A goal used as a value is `true` or `false`: `["cond", [["doc", "?_", "?_", 2023], "has a 2023 doc"], ["else", "none"]]`.

## Counting and summing

An aggregate in a rule's head combines the rule's matches, grouped by the head's other columns:

```json
["rule", ["grouped", "?topic", ["aggregate/count", "?n"]], ["note", "?topic", "?n"]]
```

The aggregates are `count`, `countUnique`, `sum`, `mean`, `min`, `max`, `collect`, `unique`, `union`, and `shortest`, all under `aggregate/`.

- **Every match counts.** Two claims that report the same figure are two matches, so summing over claims counts the figure twice. Derive the distinct things first, then aggregate those:

  ```json
  ["rule", ["figure", "?region", "?n"], ["said", "?_", "?region", "?n"]],
  ["rule", ["total", ["aggregate/sum", "?n"]], ["figure", "?region", "?n"]]
  ```

  With two claims of 10 for `eu` and one of 5 for `us`, this gives 15. Summing over `said` directly gives 25.
- **A group with no matches does not exist**, so a count is never 0. To count what may be nothing, aggregate a `find`:

  ```json
  ["rule", ["tally", "?topic", ["aggregate/count", ["find", "?n", ["note", "?topic", "?n"]]]],
    ["topic", "?topic"]]
  ```

  gives every topic a count, 0 included.
- A relation with an aggregate in its rules cannot also have facts, and all of its rules must aggregate the same way.
- On a list, the same functions combine the list: `["aggregate/sum", ["array/make", 1, 2, 3]]` is 6.
- A filter cannot follow an aggregate in the same rule. Aggregate in one rule, and filter its result in the next, as `disputed` does with `answers` in the core.

## Graph algorithms

Each takes a relation whose first two columns are an edge's from and to, and gives a goal.

| Goal | Rows |
|---|---|
| `["graph/shortestPath", edges, start, "?to", "?cost", "?path"]` | The cheapest path from `start` to each node. A third edge column is the weight; without one each edge costs 1. |
| `["graph/components", edges, "?node", "?group"]` | Which nodes are connected, ignoring direction. A group is named after its smallest node. |
| `["graph/stronglyConnected", edges, "?node", "?group"]` | Which nodes can each reach the other. |
| `["graph/topologicalOrder", edges, "?node", "?position"]` | An order in which every edge points forward, or an error that names a cycle. |
| `["graph/pageRank", edges, "?node", "?rank"]` | How central each node is. The ranks add up to 1. |

With `owns` as above, `["query", ["graph/shortestPath", "owns", "a", "c", "?hops", "?path"]]` gives `[{"hops": 2, "path": ["a", "b", "c"]}]`. The edge relation can be one that rules derive.

## Schemas and invariants

A schema says what a value must be. A predicate such as `"value/integer?"` is one; so is a record of schemas, a list of them, and any plain value, which fits only itself.

| Schema | Fits |
|---|---|
| `["schema/anyOf", a, b]` | a value that fits either. Of plain values it is a list of choices: `["schema/anyOf", "primary", "secondary"]`. |
| `["schema/allOf", a, b]` | a value that fits both |
| `["schema/arrayOf", s]` | a list whose every item fits |
| `["schema/optional", s]` | as a record's key: the key may be left out |
| `["schema/open", {…}]` | a record with these keys and any others |
| `["lambda", ["n"], ["number/greaterThan", "n", 0]]` | a value the function returns `true` for |

`["schema", "Says", shape]` names a schema, and `["Says", value]` then asks whether a value fits. `["schema/problems", value, schema]` lists where it does not.

An invariant is a query the model keeps true:

```json
["invariant", ["and", ["claim", "?id", "?_", "?_", "?says"], ["not", ["Says", "?says"]]], {"assert": "none"}]
```

Every later `fact`, `retract`, and `rule` is checked against it, and one that would break it fails and changes nothing. Use `"none"` for what must never happen and `"some"` for what must always exist. Use invariants for the model's integrity: shapes, references, and things that cannot be otherwise. A belief about the world that evidence might overturn is an assumption with a `violated` rule, since an invariant would reject the evidence instead of reporting it.

## What the errors mean

| Message begins | Cause | Fix |
|---|---|---|
| `Adding this fact breaks an invariant, so nothing changed. The invariant expected no answers but found 1, such as {…}: […].` | A row breaks a rule of the model. The record after "such as" is the row, the list after it is the invariant, and a schema failure ends with where the value does not fit. | Usually a misspelled key or a missing source. Fix the step. If the evidence is right and the frame is wrong, change the frame. |
| `Facts may only contain JSON data, but the "text" of […] is the relation "source".` | A bare string in the fact is the name of a relation or schema, or starts with `?`. The message names the column and what the string became. | Quote it, as the message shows. |
| `"number/subtract" takes 2 arguments but got 3.` | A function called with the wrong number of arguments. Nothing is dropped or filled in. | Give it what it takes. |
| `Nothing is bound to "…"` | A misspelled function, or text that looks like one. | Correct the name, or quote the text. |
| `"a" takes 2 arguments (x, y) but got 1.` | A relation call with the wrong number of columns. | Give every column; use `"?_"` for the ones you do not need. |
| `Unsafe rule head […]: ?y never appears in a relation in the body.` | A head variable nothing binds. | Bind it in the body. |
| `… failed: Expected number at [0]` | A filter met a value of the wrong type. | Put a guard before it, such as `["value/number?", "?x"]`. |
| `Rule […] asks about "p", which depends on "p".` | A `not`, `find`, or goal-as-value inside a recursion that leads back to the rule's own head. | Ask about a relation the rule does not feed. |
| `Relation "a" is already declared with columns […].` | A relation declared again with different columns. | Change the step that declared it, and replay. |
| `["find", "?x", [goal], [goal]] is not a call: its first element must be a special form or evaluate to a function.` | `find` or `query` was given two goals. The message points at the head, which is not what is wrong. | Wrap the goals in `["and", …]`. |
| `The query expected at least one answer but found none` | A query with `{"assert": "some"}` found nothing. | The assertion did its job. |

A failed program changes nothing in the model file, so fix the step and run it again.

## Limits worth knowing

- **No ordering of strings.** There is no "less than" for text. Keep dates and times as integers (`20250201`, or minutes; see the timeline pattern), and compare those. `"order"` in a query, `aggregate/min`, and `aggregate/max` do sort strings.
- **A function takes the number of arguments it takes.** Six combine any number, from left to right: `number/add`, `number/multiply`, `number/min`, `number/max`, `string/concat`, and `array/concat`, so `["number/add", 1, 2, 3]` is 6. Every other function fails on a call with too many or too few. A lambda still ignores arguments past its parameters.
- **Functions run forward.** `["=", ["number/add", "?x", 1], 5]` does not solve for `?x`.
- **Rules, schemas, and invariants cannot be removed or redefined.** Edit the step that wrote them and replay the steps.
- **A recursive rule cannot compute new values** for its head, so recursion always ends. Follow edges with recursion, and compute in a rule that is not recursive. `aggregate/min`, `max`, `shortest`, and `union` are the exception: a recursive rule can aggregate with them.
- **Each run starts with a fresh environment.** The model keeps relations, schemas, facts, rules, and invariants. A `define` lasts for one program, though a rule keeps the value a defined name had when the rule was written. So a helper you define in the frame works inside the frame's rules and nowhere else: a query in `checks.json` or `answers.json` cannot call it. Whatever a query should show, such as a time as text, has to be a column that a rule computes.

These also work, and need no experiment: a relation with both facts and rules, as long as no rule aggregates; several `attributed` rows for one claim; `in` as a test inside `not`; one defined function calling another; a record with variables in it as an argument of a query; and `["query", ["and", …]]` to join relations in a saved question.

## Functions

All take their arguments in the order shown and wait for logic variables.

- `number/`: `add`, `subtract`, `multiply`, `divide`, `remainder`, `power`, `min`, `max`, `absolute`, `floor`, `ceiling`, `round`, `toString`, `equals?`, `lessThan`, `greaterThan`, `lessThanOrEqualTo`, `greaterThanOrEqualTo`. `round` gives a whole number; for one decimal, `["number/divide", ["number/round", ["number/multiply", 10, x]], 10]`.
- `string/`: `equals?`, `length`, `concat`, `startsWith`, `endsWith`, `includes`, `indexOf`.
- `array/`: `make`, `head`, `tail`, `length`, `concat`, `includes?`, `range`, `map`, `flat-map`, `reduce`.
- `object/`: `get`, `get-path` (`"a.b.0"`), `keys`, `values`.
- `value/`: `number?`, `integer?`, `string?`, `boolean?`, `object?`, `array?`, `null?`, `any?`, `identity`.
- `boolean/`: `not`, `and`, `or`.
- `aggregate/`, `graph/`, `schema/`: as above.

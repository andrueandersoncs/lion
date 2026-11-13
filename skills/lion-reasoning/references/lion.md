# Lion for reasoning models

The part of Lion you need to write rules and questions for a reasoning model. The full language is documented at [lionlang.dev/docs.html](https://lionlang.dev/docs.html). The notes you record with `record.mjs` need none of this: they are plain JSON, and the recorder writes them as data. You need it for your own rules and for questions you ask.

## Contents

- [How Lion reads JSON](#how-lion-reads-json)
- [Goals, variables, and patterns](#goals-variables-and-patterns)
- [Rules](#rules)
- [Asking: query, find, why](#asking-query-find-why)
- [Counting and collecting](#counting-and-collecting)
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
| `"text"` | What the name is bound to, if anything is: a relation, such as `"answer"`, or a function, such as `"number/add"`. Otherwise the string. |
| `"?name"` | A logic variable. `"?_"` is a variable you do not care about; each one is separate. |
| `[head, …]` | A call or a form. The head is a function, a relation, or a form's name such as `"rule"`. An array is never data on its own. |
| `{…}` | A record. Its keys are kept and its values are evaluated. |
| `["quote", x]` | `x` exactly as written, as data. |

So a list of data is `["quote", ["a", "b"]]`, or `["array/make", "a", "b"]` when its items are computed. Text that is also the name of a relation (`"answer"`, `"source"`, `"belief"`), or starts with `?`, must be quoted to stay text. Inside a quote nothing is evaluated, so one quote around a record covers every string in it.

`["begin", a, b, c]` runs forms in order and gives the last one's value. A record of questions, `{"a": question, "b": question}`, gives a record of answers, which is how `checks.json` asks everything at once.

## Goals, variables, and patterns

Calling a relation makes a goal: a question about its rows. Each argument says what its column must be.

```json
["answer", {"failing tests": "?package"}, "?count", "?_"]
```

asks for every present answer to a "failing tests" question, binding the package and the count. An argument can be:

| Argument | Matches |
|---|---|
| a value | a column equal to it |
| `"?name"` | anything, and binds the variable. The same variable twice must take the same value. |
| `"?_"` | anything |
| a record, `{"loads first": "?module"}` | a record with **exactly** these keys |
| `["schema/open", {"loads first": "?module"}]` | a record with at least these keys |
| `["array/make", "?first", "?_"]` | a list of exactly that length, item by item |
| a predicate, `"value/number?"` | a column the predicate accepts |
| `["schema/allOf", "value/number?", "?x"]` | a number, bound to `?x` |

A record pattern is closed: `{"loads first": "?m"}` does not match `{"loads first": "lambda", "in": "bun"}`. Write every key, or open the record.

Other goals:

- `["=", "?x", value]` binds `?x`, or compares when both sides are known.
- `["in", "?item", "?list"]` binds `?item` to each item of a list, or tests membership.
- `["and", g, …]`, `["or", g, …]`, `["not", g]` combine goals. `not` holds when the goal has no match.
- Any function call on bound variables is a filter: `["number/greaterThan", "?count", 0]`.

## Rules

```json
["rule", head, goal, goal, …]
```

The head holds whenever every goal holds. Derived rows are never stored: they are worked out from the facts each time, so they are always current. Put your rules in a step of your own, such as `steps/02-rules.json`, as one program, and run `replay.mjs`:

```json
["begin",
  ["relation", "breaks", ["module"]],
  ["rule", ["breaks", "?m"], ["answer", {"loads first": "?m"}, "throws", "?_"]],
  "rules"]
```

- Declare the head's relation first, with `relation`. Use a name the core does not use.
- Several rules with the same head are alternatives: the relation holds what any of them derives. Your rules for `violated` add to the core's.
- Every variable in the head must be bound by a relation goal, `=`, or `in` in the body.
- The head can compute: `["slower", "?bench", ["number/subtract", "?after", "?before"]]`.
- Filters run in the order written once their variables are bound, so put a guard first: `["value/number?", "?x"], ["number/greaterThan", "?x", 1]`.
- A rule can ask a question with `not`, with `find`, or with a goal used as a value. Variables the rule has bound keep their values inside it; any other variable belongs to the question.
- A recursive rule follows edges: `["rule", ["reaches", "?a", "?c"], ["reaches", "?a", "?b"], ["edge", "?b", "?c"]]`. It cannot compute new values, so recursion always ends.

## Asking: query, find, why

```json
["query", ["answer", {"failing tests": "?package"}, "?count", "?_"], {"order": "-count"}]
```

gives one record per answer, keyed by variable name, without `?_`: `[{"package": "core", "count": 2}]`. Options: `"order"` (a name or a list; `-` for descending), `"limit"`, `"offset"`, and `"assert"` (`"some"` or `"none"`, which fails the program when it is not so). Without `"order"` the order of answers is not fixed.

```json
["find", "?m", ["breaks", "?m"]]
```

takes a template and one goal, joining several with `["and", …]`, and gives the template's value for each match as a sorted list. Use it for a plain list, and inside rules. A value that several matches lead to is listed several times; wrap it in `["aggregate/unique", …]` for the distinct values.

```json
["why", ["settled", "lambda-first", "cycle"]]
```

explains one row: the rule that derived it, and under `because` the rows that rule matched, each explained in turn, down to recorded facts marked `"given": true`. It gives `null` when the row does not hold. Give it a complete row with every column a value, and quote records and text in it: `["why", ["answer", ["quote", {"failing tests": "core"}], 2, "o1"]]`. To see only the recorded facts it rests on:

```bash
node <skill>/scripts/ask.mjs '["why", …]' | jq -c '.. | objects | select(.given) | .fact'
```

A goal used as a value is `true` or `false`: `["cond", [["holds", "cycle"], "still standing"], ["else", "ruled out"]]`.

## Counting and collecting

An aggregate in a rule's head combines the rule's matches, grouped by the head's other columns:

```json
["rule", ["failures", ["aggregate/count", "?m"]], ["breaks", "?m"]]
```

The aggregates are `count`, `countUnique`, `sum`, `mean`, `min`, `max`, `collect`, `unique`, `union`, and `shortest`, all under `aggregate/`.

- **Every match counts.** Derive the distinct things first, then aggregate those.
- **A group with no matches does not exist**, so a count is never 0. To count what may be nothing, aggregate a `find`: `["=", "?n", ["aggregate/count", ["find", "?m", ["breaks", "?m"]]]]`.
- A relation with an aggregate in its rules cannot also have facts.
- A filter cannot follow an aggregate in the same rule. Aggregate in one rule, filter in the next.
- On a list, the same functions combine the list: `["aggregate/sum", ["array/make", 1, 2, 3]]` is 6.

## Graph algorithms

Each takes a relation whose first two columns are an edge's from and to, and gives a goal.

| Goal | Rows |
|---|---|
| `["graph/shortestPath", edges, start, "?to", "?cost", "?path"]` | The cheapest path from `start` to each node. A third edge column is the weight; without one each edge costs 1. |
| `["graph/components", edges, "?node", "?group"]` | Which nodes are connected, ignoring direction. |
| `["graph/stronglyConnected", edges, "?node", "?group"]` | Which nodes can each reach the other: the cycles. |
| `["graph/topologicalOrder", edges, "?node", "?position"]` | An order in which every edge points forward, or an error that names a cycle. |
| `["graph/pageRank", edges, "?node", "?rank"]` | How central each node is. |

The edge relation can be one that rules derive from observations, such as imports you read.

## Schemas and invariants

A schema says what a value must be: a predicate such as `"value/integer?"`, a record of schemas, a list of them, `["schema/anyOf", a, b]`, `["schema/arrayOf", s]`, or a plain value, which fits only itself. `["schema", "Name", shape]` names one, and `["Name", value]` asks whether a value fits.

An invariant is a query the model keeps true. Every later change is checked against it, and one that would break it fails and changes nothing:

```json
["invariant", ["and", ["observed", "?o", "?_", "?_", {"failing tests": "?_"}, "?n"],
                      ["not", ["value/integer?", "?n"]]], {"assert": "none"}]
```

Use invariants for the model's integrity: the shape of a kind of observation, so a typo in a key fails when you record it instead of matching no rule. A belief about the world that evidence might overturn is a belief with predictions, since an invariant would reject the evidence instead of reporting it.

## What the errors mean

| Message begins | Cause | Fix |
|---|---|---|
| `Adding this fact breaks an invariant, so nothing changed. …such as {…}` | A row breaks a rule of the model. The record after "such as" is the row. | Usually a typo in an id, or a belief explaining a problem that was never recorded. Fix the notes. |
| `Facts may only contain JSON data, but the "text" of […] is the relation "…"` | A bare string in a fact you wrote by hand is the name of a relation, or starts with `?`. | Quote it, as the message shows. |
| `"number/subtract" takes 2 arguments but got 3.` | A function called with the wrong number of arguments. | Give it what it takes. |
| `Nothing is bound to "…"` | A misspelled function, or text that looks like one. | Correct the name, or quote the text. |
| `"a" takes 2 arguments (x, y) but got 1.` | A relation called with the wrong number of columns. | Give every column; use `"?_"` for the ones you do not need. |
| `Unsafe rule head […]: ?y never appears in a relation in the body.` | A head variable nothing binds. | Bind it in the body. |
| `… failed: Expected number at [0]` | A filter met a value of the wrong type. | Put a guard before it. |
| `Rule […] asks about "p", which depends on "p".` | A `not`, `find`, or goal-as-value in a recursion that leads back to the rule's own head. | Ask about a relation the rule does not feed. |
| `Relation "a" is already declared with columns […].` | A relation declared again differently, or a name the core uses. | Rename yours, or change the step that declared it, and replay. |
| `[…] is not a call: its first element must be a special form or evaluate to a function.` | `find` or `query` was given two goals. | Wrap the goals in `["and", …]`. |

## Limits worth knowing

- **No ordering of strings.** There is no "less than" for text; `"order"`, `aggregate/min`, and `aggregate/max` do sort it. Keep what you compare as numbers.
- **A function takes the number of arguments it takes.** `number/add`, `number/multiply`, `number/min`, `number/max`, `string/concat`, and `array/concat` take any number; every other function fails on too many or too few.
- **Functions run forward.** `["=", ["number/add", "?x", 1], 5]` does not solve for `?x`.
- **Rules, relations, and invariants cannot be removed.** Edit the step that wrote them and replay.
- **Each run starts with a fresh environment.** A `define` lasts for one program, though a rule keeps the value a defined name had when the rule was written. A question cannot call a helper defined in a step; make what it needs a column a rule computes.

## Functions

All take their arguments in the order shown and wait for logic variables.

- `number/`: `add`, `subtract`, `multiply`, `divide`, `remainder`, `power`, `min`, `max`, `absolute`, `floor`, `ceiling`, `round`, `toString`, `equals?`, `lessThan`, `greaterThan`, `lessThanOrEqualTo`, `greaterThanOrEqualTo`.
- `string/`: `equals?`, `length`, `concat`, `join`, `split`, `startsWith`, `endsWith`, `includes`, `indexOf`, `padStart`.
- `array/`: `make`, `head`, `tail`, `length`, `concat`, `includes?`, `range`, `map`, `flat-map`, `reduce`.
- `object/`: `get`, `get-path` (`"a.b.0"`), `keys`, `values`.
- `value/`: `number?`, `integer?`, `string?`, `boolean?`, `object?`, `array?`, `null?`, `any?`, `identity`.
- `boolean/`: `not`, `and`, `or`.
- `aggregate/`, `graph/`, `schema/`: as above.

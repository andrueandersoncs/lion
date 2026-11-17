# Designing Features and Semantics

Part of Lion's developer guidelines, which start in [AGENTS.md](../AGENTS.md).

> **IMPORTANT**: Follow the principle of least astonishment. Before adding a feature or changing how something behaves, ask what someone who already knows Lion would expect it to do, both on its own and combined with every existing feature. Then make it do that.

Lion's value comes from features that compose, so one surprising interaction costs more than a missing feature.

- **Let Lion compute it.** Lion is a full programming language. When something built on Lion needs a value, a condition, or text, write it as a Lion expression and evaluate it. Do not put a second, smaller language beside Lion, such as a template syntax with slots or a placeholder that gets substituted, and do not have a person or an agent type in what a program could derive.
- **Do not count the length of Lion JSON as a cost.** Nobody reads the JSON: programs are written by tools and agents and shown through the editor or a page. A longer, more explicit program is fine. Never trade away correctness or a single rule to make the JSON shorter or easier on the eye.
- **When the standard library lacks something, add it.** If a program needs a helper that any Lion programmer would want, such as joining a list into text or writing a number with separators, add it to the standard library with its properties, instead of working around the gap in each program.
- **Reuse what exists.** Build a new feature out of vocabulary Lion already has before inventing more. For example:
  - Invariants take the query option `"assert"` instead of a new keyword, and report failures in the same words as a failed query assertion.
  - The schema of a relation's rows is the invariant a program could write by hand, so it is kept, reported, and saved like any other.
  - A schema check is an ordinary function call, so the waiting and asking rules carry it into rules, `not`, `find`, and rule heads with no rule of its own.
  - A pattern is a schema with logic variables in it, so what takes data apart is what checks it: a record, a list, and every `schema` function.
- **Apply one rule everywhere.** When a feature needs a rule, look for a similar feature that already has one and follow it. If the existing rule falls short, change it for every feature at once rather than letting the new one differ. For example:
  - Every form that changes the logic database either makes all of its changes or none.
  - Adding something the database already holds changes nothing, whether it is a fact, a relation, a rule, or an invariant.
  - Whatever needs the value of a logic variable waits for it, and whatever needs the value of a goal asks it, in every form and function.
  - Whatever checks a value against a schema asks whether the value fits, by one rule: `match`, the `schema` functions, a schema's own parts, the arguments of a relation call, and the schema of a relation's rows.
  - A logic variable in a schema is its value once it is bound, and takes the value it meets until then, in every goal that can bind: `schema/fits?`, a relation call, `=`, and `in`.
  - A call gives a function as many arguments as it takes, and one with any other number fails in one form of message: a library function, a relation, a schema, and a graph algorithm. Declare what a new function takes with `takes`, or build it with `over`, and add it to the table in `packages/core/src/modules/tests/arity.test.ts`.
- **Walk through the combinations.** Surprises hide where two features meet. Before settling a behavior, trace how it interacts with each existing one. For the logic layer, that includes:
  - logic variables and `quote`
  - everything that waits for a logic variable: function calls, `cond`, `match`, `eval`, records, and lambdas passed to a waiting call
  - everything that asks a question: `not`, `find`, and a goal used as a value, in plain code and inside a rule, with variables of its own
  - schemas: predicates, relations as schemas, named schemas and the shapes that name themselves or each other, and the schema of a relation's rows
  - patterns: variables in a record, a list, or a `schema` function, bound by `schema/fits?`, a relation call, `=`, and `in`, and a variable that holds a schema
  - names: a string that is bound, one that is data, and one that reads as a misspelled name
  - `define`, and the fresh environment each `run` gets
  - recursion and negation
  - aggregates and keyed relations
  - graph algorithms
  - goal-directed queries and `why`
  - snapshots and the CLI's `--database` file
- **Add it to the interop grid.** The grid in `packages/metrics/src/grid-cases.ts` runs every kind of expression in every place an expression can stand, and compares each with plain code. Add a row for a new kind of expression and a column for a new place, then run `bun run measure --grid`. A cell that does not give what plain code gives is an exception users have to remember: change the feature until the cell agrees, or, when the exception is the right design, document it and list it in `KNOWN`.
- **Keep equivalent programs equivalent.** These pairs should behave the same:
  - a program and its snapshot
  - goal-directed and full evaluation
  - a name and the value bound to it
  - an expression over a logic variable and the same expression with the variable's value in its place
  - a question asked in a rule and the same question asked in plain code with the rule's variables bound
  - a database that has derived rows for earlier queries and one that has derived nothing yet
  - a database that followed changes to its facts and rules through what it had derived, and one that derives from the facts and rules as they now are
  - a schema and the name it is declared under
  - a goal that binds through a pattern and the same goal with its variables bound first
  - a relation call with a schema among its arguments and the same call followed by `schema/fits?`
  - the schema of a relation's rows and the invariant it stands for
  - an invariant asked about the rows a change added and the same invariant asked in full

  Where results may differ, such as answer order without the `"order"` query option, say so in the docs.
- **Don't build on surprising behavior.** When existing behavior would astonish a user, such as a failed form leaving partial changes behind, point it out and fix it, or propose a fix, instead of working around it.
- **Pin the expectation down.** State the behavior users expect as a property and test it (see [Write Property-Based Tests](testing.md#write-property-based-tests)), so a later change can't quietly break it.
- **Document how features combine.** Describe each feature's semantics in the README, including what it does alongside the features it touches, and use it in an example in the docs (see [Documenting Every Feature](documentation.md#documenting-every-feature)).

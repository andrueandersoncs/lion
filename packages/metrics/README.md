# @lionlang/metrics

Tools that measure Lion, so a change can be judged by numbers and not by feel. They answer four questions:

| Question | Command |
| --- | --- |
| Did the change make Lion simpler or more complex? | `bun run measure --against main` |
| Did it make Lion faster or slower? | `bun run bench --against main` |
| Do the tests notice when the code is wrong? | `bun run mutate` |
| What does the change do to a program's result? | `bun run compare main programs.json` |

Run them from the repository root. Each one measures the working tree. `--against <commit>` also measures an earlier commit, such as `main`, a tag, or a hash, and shows the two side by side. The earlier commit is checked out under `out/metrics/`, which git ignores, and removed when the command ends.

The package is private: it is not published.

## Complexity: `bun run measure`

```bash
bun run measure --against @lionlang/core@0.5.0
```

```
Code: packages/core/src, without tests
                              @lionlang/core@0.5.0    now        change
  code lines                                 6,071  6,035   −36 (−0.6%)
  functions                                    716    737   +21 (+2.9%)
  paths through functions                    1,528  1,542   +14 (+0.9%)
  nesting-weighted decisions                 1,013    997   −16 (−1.6%)
  tests of a value's kind                       97     70  −27 (−27.8%)

Semantics
                               @lionlang/core@0.5.0  now          change
  special forms                                 n/a   21
  library functions                              74   82     +8 (+10.8%)
  kinds of error                                  4    6     +2 (+50.0%)
  messages                                       86   95     +9 (+10.5%)
  grid: cells like plain code                    73  324  +251 (+343.8%)
  grid: exceptions                              209    2   −207 (−99.0%)
```

This is the 0.6.0 release measured beside the 0.5.0 release. A report also lists the exceptions, and the grid cells that got worse.

### The code

Measured from the source of `@lionlang/core`, tests left out, with the TypeScript compiler.

- **Code lines.** Lines that hold code. Blank lines and comments do not count.
- **Functions.** Functions, methods, and lambdas.
- **Paths through functions.** Cyclomatic complexity: every `if`, loop, `case`, `catch`, `? :`, `&&`, `||`, and `??` is a decision, and the measure is the decisions plus one for each function.
- **Nesting-weighted decisions.** Each decision counts once, plus once for every branch or loop it sits inside. Nesting starts over inside a function. Flat code scores lower than nested code with the same decisions.
- **Tests of a value's kind.** `instanceof` checks. Each is a place that has to know which kinds of value exist, so one rule for all kinds lowers this number.

`--files` adds a table of every file, with the function that has the most paths through it.

### The semantics

How much a Lion programmer has to know, counted three ways.

- **Vocabulary.** The special forms, the functions of the standard library, and the kinds of error.
- **Messages.** The distinct messages the evaluator can answer a program with instead of a value. Nearly every one states a rule a program can break, so fewer rules means fewer messages.
- **The interop grid.** Every kind of expression, in every place an expression can stand.

Lion has two rules for how plain code meets the logic layer: whatever needs the value of a logic variable waits for it, and whatever needs the value of a goal asks it. So an expression gives, in a rule head, a filter, a `find`, or anywhere else, what plain code gives with the variable's value written in. The grid checks that. Its rows are kinds of expression over `?x`, such as a function call, a `cond`, a record, a `find`, or a goal used as a value. Its columns are places: a query, a rule head, a rule body, an argument of a relation, a filter, under `not`, a `find`, an aggregate, inside a waiting `cond`, an invariant, after a snapshot is reloaded, a goal-directed query, and `why`.

Each cell is one of:

| Mark | Verdict | Meaning |
| --- | --- | --- |
| `✓` | same | It gives what plain code gives. |
| `✗` | refused | The program fails. |
| `≠` | different | It runs and gives something else. |
| `·` | skipped | The place takes only goals, and the expression is not one. |
| `?` | absent | Plain code cannot evaluate the expression in that version. |

The refused and different cells are the **exceptions**: each is one more thing to remember beyond the two rules, so their number measures how seamlessly the features combine. `--grid` prints the whole table.

The grid measures agreement, not correctness: it compares each place with plain code, so it cannot see a mistake that plain code makes too. The property tests of `@lionlang/core` check plain code against models of their own.

Lion has two exceptions on purpose, listed in `KNOWN` in [`src/grid-cases.ts`](src/grid-cases.ts) with the documented rule behind each. An exception that is not in that list is reported as `NOT DOCUMENTED`, and fails the package's tests.

### Adding to the grid

When you add a feature, add it to [`src/grid-cases.ts`](src/grid-cases.ts):

- a new kind of expression is a row in `EXPRESSIONS`;
- a new place an expression can stand is a column in `POSITIONS`.

Then run `bun run measure --grid`. Every new cell should be `✓`. If one cannot be, the feature has an exception: remove it by changing the feature, or document it and add it to `KNOWN`.

## Speed: `bun run bench`

```bash
bun run bench --against main
bun run bench asking graph
```

Times the programs in [`src/benchmarks.ts`](src/benchmarks.ts): plain code, recursive rules, aggregates, negation, graph algorithms, and questions asked from expressions. Each runs three times and the best time counts. With `--against`, the last column says how many times as fast the working tree is; above 1 is faster. Words after the command pick the benchmarks whose names hold one of them.

Times move by a few percent from run to run, so run it twice before you report a small change.

## Tests that can fail: `bun run mutate`

```bash
bun run mutate
bun run mutate find recursion
bun run mutate --list
```

A property test that passes on broken code proves nothing about that code. `mutate` breaks the code in one place, runs the property tests of the logic layer, and puts the code back, for each mutation in [`src/mutations.ts`](src/mutations.ts).

- `CAUGHT`: the tests failed, as they should.
- `MISSED`: the tests passed on broken code. Add a property that fails on it.
- `STALE`: the text to replace is not in the file exactly once, because the code moved. Point the mutation at the code that now does that job.

To try a break of your own without adding it to the list:

```bash
bun run mutate --file packages/core/src/logic/model.ts --find "values.sort(compareValues)" --replace "values" --tests src/logic/tests/asking.test.ts
```

Each mutation rewrites a source file while its tests run, so do not edit the code, and do not run two of these at once. A file that changed during the run is left as it is, with a message that names it.

When you add behavior, add a mutation that breaks it, and see it caught.

## Behavior: `bun run compare`

```bash
bun run compare main programs.json
```

Runs each program of a file on an earlier commit and on the working tree, and shows where the results differ. The file holds a record of programs by name, and its path is read from the repository root:

```json
{
  "zero equals minus zero": ["=", 0, ["number/multiply", 0, -1]],
  "cond on a goal with no match": ["begin", ["relation", "p", ["x"]], ["fact", ["p", 1]], ["cond", [["p", 2], "yes"], ["else", "no"]]]
}
```

Use it before you write that a change fixes, breaks, or keeps something: a changelog line about behavior should be a program that gives one thing before and another after.

## Tests

```bash
turbo test --filter=@lionlang/metrics
```

The tools are tested with properties, like the rest of Lion:

- the code measures, against generated functions whose shape says what each measure must be;
- the grid, for generated facts: every cell gives what plain code gives or is a documented exception, and every documented exception is still one;
- applying a mutation, counting messages, and printing changes, each against a simpler way of doing the same.

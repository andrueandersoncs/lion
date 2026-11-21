# Measuring Complexity

Part of Lion's developer guidelines, which start in [AGENTS.md](../AGENTS.md).

> **IMPORTANT**: Measure every change to `@lionlang/core` before you call it done, in the code and in the semantics, and aim for both to go down. Put the numbers in your final report and in the commit message, also when they went up.

`packages/metrics` holds the tools, and its README explains each number. Run them from the root. `--against` takes any commit: `main`, a tag, or a hash.

```bash
# Code and semantic complexity of the working tree, beside main
bun run measure --against main

# The same with every file, or with the whole interop grid
bun run measure --against main --files
bun run measure --grid

# Speed, beside main
bun run bench --against main

# How time and memory grow with the facts, beside main
bun run scale --against main

# Break the code in each listed place and check that the tests notice
bun run mutate

# Map what each test reaches, then run only the tests and mutations a change can reach
bun run affected --map
bun run affected --run
bun run mutate --affected

# Check that picking skips no test a listed mutation names, and what it would have run lately
bun run affected --check
bun run affected --replay 30

# Run the same programs on main and on the working tree
bun run compare main programs.json

# Run every program the docs show on main and on the working tree
bun run compare main --docs

# Run a skill's frozen eval case with headless agents, and grade each run
bun run skill-eval lion-research verifies-company-figures --runs 2
```

- **Code complexity** is counted from the source of `@lionlang/core` without its tests: code lines, functions, paths through functions, decisions weighted by how deep they nest, and `instanceof` tests of a value's kind.
- **Semantic complexity** is how much a Lion programmer has to know: the special forms, library functions, and kinds of error; the distinct messages that tell a program it broke a rule; and the exceptions in the interop grid, the cells where an expression in some place does not give what plain code gives.

How to use the numbers:

- **Pay for what you add.** A feature usually adds code. Pay for it in the same change: find the rule that makes special cases redundant, and delete them. The waiting rule and the asking rule each replaced a list of cases this way.
- **Keep the grid's exceptions at the documented ones.** A new exception fails the tests of `packages/metrics`. Fix the feature rather than add to `KNOWN`.
- **Never buy a lower number with a worse Lion.** Do not remove a feature, a test, or a message a user needs, and do not squeeze code until it is hard to read.
- **Check the speed.** Run `bun run bench --against main` twice, since times move by a few percent between runs, and report any benchmark that got slower.
- **Check the growth.** Run `bun run scale --against main`. A benchmark times one size, so it cannot show a step that reads everything again for each row. A workload should grow as its facts do, `n^1.0`; report any that grows faster, or that keeps more memory. Add a workload to `packages/metrics/src/workloads.ts` for a way of growing the list does not cover.
- **Check what you say about behavior.** Before you write that a change fixes, breaks, or keeps something, in a changelog or a report, put the program in a file and run `bun run compare`.
- **Go on working while `bun run mutate` runs.** It breaks copies of the working tree under `out/metrics/`, never the tree itself, so run it in the background. It checks the tree as it stood when the run began.
- **While you iterate, run what the change reaches.** `bun run affected --run` runs the test files and checks the changes since HEAD can reach, and `bun run mutate --affected` the mutations: those in a changed file, and those whose tests a changed file reaches, so a change that weakens a property brings back the mutations it guarded, which `--in` would not. Both read the map `bun run affected --map` writes, which is of the commit it was made at, so make it again after a large change, and run `bun run affected --check`, which fails when picking would skip a test a listed mutation names. On a `claude/` branch the commit hook runs only what `bun run affected` picks, so before a merge, run everything: `bun run test` and `bun run affected --check`.

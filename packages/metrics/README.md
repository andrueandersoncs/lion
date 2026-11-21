# @lionlang/metrics

Tools that measure Lion, so a change can be judged by numbers and not by feel. They answer ten questions:

| Question | Command |
| --- | --- |
| Did the change make Lion simpler or more complex? | `bun run measure --against main` |
| How many tasks of each pillar can Lion do? | `bun run capability` |
| Did it make Lion faster or slower? | `bun run bench --against main` |
| Does its time grow as the facts do, or faster? | `bun run scale --against main` |
| Do the tests notice when the code is wrong? | `bun run mutate` |
| Which tests, checks, and mutations can a change reach? | `bun run affected` |
| Did an experiment pay off, and what should the next one try? | `bun run loop status` |
| What does the change do to a program's result? | `bun run compare main programs.json` |
| Which documented results did the change make untrue? | `bun run compare main --docs` |
| How well does an agent do a skill's eval case? | `bun run skill-eval lion-research verifies-company-figures` |

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

### Pairs of rows: `bun run pairs`

```bash
bun run pairs
```

Runs the grid over every pair of its rows: one kind of expression written where another has `?x`, such as a `match` inside a call, in every place. The grid's rule holds of a pair as of a row. A pair's cell that is an exception where neither of its rows has one in that place is a **surprise**, two features that work alone and fail together, and each is a bug to fix or a rule to document. On 2026-11-21 it printed:

```
Pairs of the grid's rows: 6561, in 118098 cells
  same as plain code  72371
  plain code fails    41274
  exceptions          155
surprising pairs, grid: 0
```

Every exception is one a single row already has. The inner row's own variables and the relations it declares are renamed apart first, since a string names what is bound by that name, and a pair whose plain code fails, or gives what is no data, such as a host function's NaN, is left out. `--json` prints every surprise. The properties in `src/tests/pairs.test.ts` run sixty random pairs each time, so a change that makes two features fail together fails the tests. A row you add to the grid is paired with every other.

## Speed: `bun run bench`

```bash
bun run bench --against main
bun run bench asking graph
```

Times the programs in [`src/benchmarks.ts`](src/benchmarks.ts): plain code, recursive rules, aggregates, negation, graph algorithms, and questions asked from expressions. Each runs three times and the best time counts. With `--against`, the last column says how many times as fast the working tree is; above 1 is faster. Words after the command pick the benchmarks whose names hold one of them.

Times move by a few percent from run to run, so run it twice before you report a small change.

## Growth: `bun run scale`

```bash
bun run scale --against main
bun run scale --sizes 1000,1000000 --limit 120
bun run scale load change
```

A benchmark says how fast one size is. `scale` runs the workloads in [`src/workloads.ts`](src/workloads.ts) at growing sizes, 1,000, 10,000, and 100,000 facts unless `--sizes` says otherwise, and says how the time grows: loading facts one form at a time and many, with and without invariants, schemas, and keys; asking every row and one row; rules that join, aggregate, negate, and recurse; and changing a fact and asking again. Each run is a process of its own, so its memory is its own, and one that takes longer than `--limit` seconds, 60 by default, is stopped and shown as `over 60 s`.

- `grows` is the power of the size the time follows between the two largest sizes that ran. `n^1.0` grows as the facts do. `n^2.0` grows as their square: something reads everything again for each row. A workload that was stopped shows `stops`.
- `peak` is the most memory the timed programs added, and `kept` is what the database holds afterwards, both at the largest size.
- With `--against`, a second line gives the same for the earlier commit, and `speed` says how many times as fast the working tree is at the largest size both ran.

A workload whose answer is a number of rows says what that number is, counted without Lion, and the tests run every workload at small sizes against it, so a workload asks what its name says. Add a workload for each way a program can grow that the list does not cover.

## Tests that can fail: `bun run mutate`

```bash
bun run mutate
bun run mutate find recursion
bun run mutate --in logic/model.ts,logic/database.ts
bun run mutate --jobs 2
bun run mutate --list
```

A property test that passes on broken code proves nothing about that code. `mutate` breaks the code in one place and runs the property tests that should notice, for each mutation in [`src/mutations.ts`](src/mutations.ts). It works in copies of the working tree under `out/metrics/`, as the tree stood when the run began, with what is not committed yet, so you can go on editing while it runs; what you edit meanwhile is not checked. Four mutations run at once, each in a copy of its own, or as many as `--jobs` says.

- `CAUGHT`: the tests failed, as they should. Tests still running after ten minutes are stopped and count as failed: a break can make evaluation loop where no test's own time limit gets a turn.
- `MISSED`: the tests passed on broken code. Add a property that fails on it.
- `STALE`: the text to replace is not in the file exactly once, because the code moved. Point the mutation at the code that now does that job.

The whole list takes most of an hour, since it also breaks the skills and the project record. Words after the command pick the mutations whose names hold one of them, and `--in` picks the ones in files whose paths hold one of its words: run the mutations of the files you changed.

To try a break of your own without adding it to the list:

```bash
bun run mutate --file packages/core/src/logic/model.ts --find "values.sort(compareValues)" --replace "values" --tests src/logic/tests/asking.test.ts
```

The copies are removed when the run ends, also when it is stopped.

When you add behavior, add a mutation that breaks it, and see it caught.

## What a change reaches: `bun run affected`

```bash
bun run affected --map
bun run affected
bun run affected --against main --run
bun run mutate --affected
bun run affected --check
bun run affected --replay 30
```

A change can make a test give another result only if the test runs the code it changed or reads the file it changed. `--map` runs every package's tests once, with [`src/reach-trace.ts`](src/reach-trace.ts) as a setup file, and writes `out/reach/map.json`. For each test file, the map holds:

- the source files whose functions its tests ran, with what imports ran as they loaded left out, since every test loads the whole library;
- the files of the repository it read;
- whether it ran `git`, which reads files the map cannot see;
- how long it took.

A built file in a package's `dist/` counts as the source file of the same name, or as the whole package when no source file has its name. A command a package's test script runs besides vitest, such as the project record's check, reads the whole repository, so every change reaches it.

Rules in Lion, in [`src/affected.json`](src/affected.json), pick what a change reaches from the map:

- a test reaches a changed file it ran or read;
- a test that runs `git` reaches every change;
- a changed file that no test reached, such as a new one, reaches every test of its package;
- a file at the root that configures the build, such as `bun.lock` or `tsconfig.json`, reaches every test when no test reached it, while one of the root's Markdown files, such as `CHANGELOG.md`, reaches only the tests that run `git`;
- a mutation is reached when its own file changed, or a test it names is reached, so a change that weakens a property brings back the mutations that property catches, which `bun run mutate --in` would not.

With no option, `affected` lists what the changes since HEAD, or since `--against`, reach, and `--run` runs them. `bun run mutate --affected` runs the mutations they reach.

`--check` asks whether picking is sound: it gives each listed mutation as a change to its own file, and lists every test the mutation names that would not be picked for it. A test a mutation names should catch it, so a test that picking skips is one that might catch the break while picking says nothing ran. `--replay n` asks the same rules about each of the last n commits, and says what they would have run beside everything. The map is of the commit it was made at, so make it again after a large change.

At 9d59e05 the map held 107 test files and checks. `--check` gave each of the 599 listed mutations as a change to its file. For 595, every test the mutation names is picked. For 4, picking skips one named test that never ran the mutated file, and the tests it keeps still catch the break:

```
SKIPS    cond does not ask a goal it tests
         packages/core/src/logic/tests/connectives.test.ts
CAUGHT  cond does not ask a goal it tests, by the tests picking keeps

Picking is sound for every listed mutation: the tests it picks catch each one.
```

`--replay 30` over the commits before it shows where picking pays. A change to core reaches nearly everything, since the evaluator runs under every package's tests. A change to the docs, the research, or the record reaches a few tests:

```
commit   files  tests picked  seconds picked  mutations picked  in its files
d50cf12     22    100 of 107    1526 of 1531        587 of 599            49
f985647     23      6 of 107     305 of 1531         56 of 599             0
c03b128      3     14 of 107     557 of 1531        111 of 599             0

Median over 30 commits: 98% of the tests' time, 555 of 599 mutations.
```

The seconds are each test file's own time, added up, from the traced run. "in its files" is what `bun run mutate --in` would choose. Picking chooses more, because it also brings back the mutations whose tests a change reaches.

## The improvement loop: `bun run loop`

```bash
bun run loop scores
bun run loop observe <label> --tries <direction>
bun run loop status
```

`scores` runs every measuring tool and prints one line for each question the improvement record in [`improvement/`](../../improvement/README.md) asks, such as `grid exceptions, core: 3` or `rules no probe checks, record: 107`. The parsing is in [`src/loop.ts`](src/loop.ts), and the record's constraints and scores are the lines it reads. `observe` runs `scores` through the lion-reasoning skill's `see.mjs`, records each line as an observation that quotes it, and prints what the record then says. `status` prints the record's standing questions that have answers.

The record's first observation, of 06c885e with this runner added, printed these lines:

```
grid exceptions, core: 3
undocumented grid exceptions, core: 0
record check, history: holds
rules no probe checks, record: 107
workloads faster than linear, scale: 0
failing test tasks, all packages: 0
bench total ms, every benchmark: 965.8
tests' time picked, last 30 commits: 98
picking unsound, listed mutations: 0
instrument lines removed, since the base: 0
```

It took six minutes, most of them in the tests, the record's check, the soundness check, and scale. The tools run cheapest first, and each prints how long it took, which `observe` records as well, so the record can say how many predictions the loop resolves per hour of checks. `--fail-fast` stops at the first requirement that is not met. `--skip` leaves tools out, `--mutations "a|b"` runs listed mutations by name, `--repeat n` runs them n times and counts the runs that caught each, and `--full` runs every listed mutation. `guidelines/improving.md` says how an experiment uses them.

## Behavior: `bun run compare`

```bash
bun run compare main programs.json
bun run compare main --docs
```

Runs each program of a file on an earlier commit and on the working tree, and shows where the results differ. The file holds a record of programs by name, and its path is read from the repository root:

```json
{
  "zero equals minus zero": ["=", 0, ["number/multiply", 0, -1]],
  "cond on a goal with no match": ["begin", ["relation", "p", ["x"]], ["fact", ["p", 1]], ["cond", [["p", 2], "yes"], ["else", "no"]]]
}
```

Use it before you write that a change fixes, breaks, or keeps something: a changelog line about behavior should be a program that gives one thing before and another after.

With `--docs` in place of a file, the programs are the ones the docs show: every fenced `json` block that is a program, in the README files, `AGENTS.md`, the guidelines in `guidelines/`, and each skill's `SKILL.md` and `references/`. Only the programs whose results differ are listed, so the run says which documented results a change made untrue. It is the first step of the documentation procedure in `guidelines/documentation.md`. The website's live examples are not among them: the docs build runs those and writes what they give.

## Capability: `bun run capability`

```bash
bun run capability
```

Grades the capability corpus in [`corpus/`](corpus/README.md): tasks for each of Lion's three pillars, general computation, logic programming, and formal proofs, taken from where a reader would look for them, such as SICP's exercises, the Datalog classics, and the proofs Lion's README shows. Each task's `check` is a Lion lambda that judges what a program gives, so Lion computes the grade. A public task has a reference program, and the command prints how many of each pillar's tasks pass:

```
Capability: public tasks, graded by their reference programs
  computation    24 of  26 passed
  logic          14 of  15 passed
  proofs         10 of  14 passed
  all            48 of  55 passed

Gaps: 7 tasks Lion cannot express yet
  sicp-1.2.1-factorial-exact: Lion's numbers are exact integers only from -(2^53 - 1) to 2^53 - 1; …
```

A gap is a task Lion cannot express yet. It stays in the corpus and counts as not passed, so closing it raises the score, and `corpus/gaps.json` says what Lion lacks.

- `--solutions <folder>` grades the programs in a folder, `<id>.json` each, in place of the reference programs, as an agent's attempts would be graded. A task with no program there is not passed, and a file that is not JSON is a program that fails.
- `LION_HELD_OUT=<folder>` adds the held-out corpus: a folder with the corpus's layout outside the repository, where no agent that is scored can read it. Its tasks are graded by its own `solutions/`, or by `--solutions`. A folder inside the repository is refused.
- `--json` prints each pillar's score, the gaps, and every task's verdict.

The properties in `src/tests/capability.test.ts` make the reference programs a ratchet: each must pass its check, so a change to Lion that breaks one fails the tests. They also check that no task's check passes a generated value other than what its reference program gives, the grader against a plain model of passing, and the loader against the folders it was given.

## Skills: `bun run skill-eval`

```bash
bun run skill-eval lion-research verifies-company-figures --runs 2
```

A skill's frozen eval case (a folder under `skills/<skill>/evals/` with a `prompt.md`, a `case.yaml`, a corpus, and a `grade.mjs`) is run by headless agents, `claude -p`. Each agent works in a folder of its own outside the repository, inside a folder that cannot be listed, so neither the repository's `CLAUDE.md` nor the memory Claude Code keeps of the repository reaches it, and no agent finds another's work. Each agent gets a copy of the skill without its `evals/` folder, so it cannot read the answers, and the case's corpus where the prompt says it is. The session's own skills are switched off and only project settings load, so an installed copy of the skill cannot stand in for the one under test. When its sessions end, its folder is copied to `out/skill-eval/<run>/`, beside its transcripts, which it never saw. The case's grader then grades what each run made, its research folder when it made one and the run's folder otherwise, with the repository's own Lion build or the one `LION_CLI` names, and each run prints lines like these:

```
run: out/skill-eval/lion-research-verifies-company-figures-2026-11-14T16-36-01-186Z-2
checks passed: 17 of 23
checks failed: 6
cost usd: 2.13
minutes: 5.3
turns: 28
models: claude-opus-5-5
  failed  The page names no question a choice set aside or that has two senses: [["Questions the plan names that a choice set aside, or that have readings nobody chose between",[{"revenue":"tarnwell"},{"revenue":"tarnwell"}]]]
  failed  The report gives revenue as restated, $409.8M: no report.md
  failed  The report says the earlier figure was $412.6M: no report.md
  failed  The report gives the gross margin, 26.4%: no report.md
  failed  The report says a source counts 39 warehouses: no report.md
  failed  The report says the blog misquotes the headcount as 2,400: no report.md
```

The other run of the same command passed 23 of 23, for $2.85 in 7.4 minutes: two runs of one skill can differ by six checks, which is why a change to a skill is judged on more than one run.

`--runs n` runs n agents at once. `--from <folder>` runs a changed copy of the skill instead of the one in `skills/`, or another skill to compare it with; the agent is told the name its `SKILL.md` gives. `--bare` runs the case with no skill at all. `--model` and `--budget` (US dollars per session) pass on to `claude -p`, and `--grade <run folder>` grades a run again. A run costs what an agent session of the case's length costs, so run few, and more than one only where the runs disagree.

### Cases of more than one session

A case may run its agent several times in the same folder, as work that a later session picks up. Its prompts are then a `sessions/` folder of files named by number, `1.md`, `2.md`, run in that order, and each later prompt gets the message the session before it ended with wherever it says `{{earlier}}`. The transcripts are `agent-1.json`, `agent-2.json`, and the lines add up what all the sessions spent.

A case's `setup.mjs` makes the world around the sessions. It may export `start()`, called once before the runs, which returns what to `stop()` after them, such as a service the agents call; `prepare(work)`, which lays out a run's folder before its first session; `between(work, finished)`, called after each session but the last, for the changes the next session is not told about; and `finish(work, logs)`, which may leave a record beside the run's transcripts. All of it lives under `evals/`, so no agent reads it.

The reasoning skill's case `rechecks-what-changed` is one: two sessions check the documented scores of 24 prompts through a metered eval service, and between them seven prompts change in ways neither git nor file times date. Run it with the skill, with the plain-notes baseline the case keeps, and with no skill, to see what the skill's record is worth:

```bash
bun run skill-eval lion-reasoning rechecks-what-changed --runs 2
bun run skill-eval lion-reasoning rechecks-what-changed --from skills/lion-reasoning/evals/rechecks-what-changed/baselines/notes --runs 2
bun run skill-eval lion-reasoning rechecks-what-changed --bare --runs 2
```

Its README gives the results of each.

### An experiment loop over a skill

The lines are written to be recorded by the lion-reasoning skill, whose scores and directions keep the record of an experiment loop. Declare the grade and the cost as scores. The cost of a run counts only when it passed every check, and neither counts when the eval itself was changed:

```json
{"scores": [
   {"question": {"checks passed": "lion-research verifies-company-figures"}, "better": "higher",
    "requires": [{"question": {"eval lines changed": "lion-research"}, "value": 0}]},
   {"question": {"cost usd": "lion-research verifies-company-figures"}, "better": "lower",
    "requires": [{"question": {"checks failed": "lion-research verifies-company-figures"}, "value": 0},
                 {"question": {"eval lines changed": "lion-research"}, "value": 0}]}],
 "directions": [
   {"id": "worked-example", "statement": "Lead SKILL.md with one worked research run, start to finish", "patience": 2}]}
```

Each experiment is a change to `skills/<skill>/`, then the eval run through `see.mjs`, so the runs belong to the version of the skill they ran on, and a check that the eval is untouched. `see.mjs` runs its command through the shell, so give a pipeline as one quoted string, not wrapped in `sh -c`:

```bash
node <lion-reasoning>/scripts/see.mjs e3 --about skills/lion-research -- bun run skill-eval lion-research verifies-company-figures --runs 2
node <lion-reasoning>/scripts/see.mjs d3 --about skills/lion-research -- 'git diff -- skills/lion-research/evals | wc -l'
```

Record each run's "checks passed", "checks failed", and "cost usd" as observations that `tries` the direction, and let the model say which version is best, whether the change cleared the spread of the runs, and where to spend the next run. Revert a miss with git: the runs of the version you return to speak for the present again.

Say what each change is for. A check that fails is a problem, such as `{"id": "no-report", "question": {"check": "The report gives the gross margin, 26.4%"}, "value": "failed"}`, and before the run, a belief that `tries` the direction predicts which of them the change makes pass. The model then says which the experiment fixed and which it did not, beside whether the grade went up.

A run prints the models that ran it, since a skill tuned under one model is not thereby tuned under another. When you pass `--model`, or the default model changes, put the model in the questions, as in `{"checks passed": "lion-research verifies-company-figures", "models": "claude-opus-5-5"}`, and declare them as scores of their own. `carried` then lists every direction whose record comes only from the other model, and running the eval under the new model on the version before a change and on the version with it says whether that change still helps.

## Tests

```bash
turbo test --filter=@lionlang/metrics
```

The tools are tested with properties, like the rest of Lion:

- the code measures, against generated functions whose shape says what each measure must be;
- the grid, for generated facts: every cell gives what plain code gives or is a documented exception, and every documented exception is still one;
- applying a mutation, counting messages, and printing changes, each against a simpler way of doing the same.

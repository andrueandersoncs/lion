# The model of Lion's development

The project record in `history/` says what changed and why. This folder holds the rest of the model of Lion's development: what every commit stated, quoted word for word, read into one Lion database with the [lion-research skill](../../skills/lion-research/SKILL.md), together with the record, and rules that check the project against itself. It is meant to be kept current and asked before a decision: does this contradict a rule the project holds, has this been decided before, does the documentation say what Lion does.

```bash
bun run history write    # build the model, and write every page from it
bun run history check    # build the model, and say what needs fixing
bun run history ask '["query", ["reversed", "?topic", "?before", "?after"]]'
```

`write` and `check` save the model as `model.json`, and `write` writes the pages from it: `CHANGELOG.md`, `DECISIONS.md`, and the timeline [`docs/changelog.html`](../../docs/changelog.html), which is also on the website. `ask` evaluates any Lion expression against the saved model.

## What is in it

Every source has a publisher: who stands behind what it says.

| Source | Publisher | Where its claims come from |
|---|---|---|
| Each commit HEAD reaches: its message, the files it changed, and up to 700 lines of its diff | Lion repository | `notes/10-era-a.json` to `notes/15-era-e.json`, written by readers |
| `README.md`, `AGENTS.md`, each guideline in `guidelines/`, and `CLAUDE.md` as they stand | Lion repository | `notes/16-docs-head.json` |
| Each notes file in `history/notes/`, decision records among them | Lion repository | the file's own claims, in its words or quoting its prose |
| Each program in `probes.json`, run on Lion as it is now | Lion at HEAD | the value the program gives |

A claim is one statement with the words that carry it, and a record of what it says, in one of five kinds that `steps/01-frame.src.json` declares:

- **feature**: a named thing exists, or no longer does. `{"feature": "list-auto-quote", "kind": "capability", "present": false}`
- **behavior**: what Lion does in one case. `{"behavior": "lambda-extra-arguments", "is": "ignored", "area": "evaluation", "follows": "javascript"}`
- **rule**: a rule the project holds, with the behavior it predicts and the cases it leaves out. `{"rule": "arity-rule", "holds": true, "statement": "...", "area": "library", "predicts": [{"behavior": "library-function-extra-arguments", "is": "error"}], "except": ["lambda-extra-arguments"]}`
- **decision**: a choice. `{"decision": "library-function-arity", "chose": "strict", "over": ["lenient"], "area": "library"}`
- **measured**: a figure. `{"measured": "core-code-lines", "after": 9500, "before": 9489, "area": "metrics"}`

A publisher's latest word counts, as the skill's core says. A rule is in force while the repository's latest word on it says it holds, and what it predicts for a case is what its latest statement that names the case predicts, so a rule reworded to allow a case stops predicting the old behavior. A decision whose topic was decided again, differently, is reversed.

## What it checks

The frame states eight assumptions about the project. Each has a rule that finds evidence against it:

| Assumption | Evidence against it |
|---|---|
| `consistent-rules` | two rules in force predict different behavior for one case, and neither names it as an exception |
| `rules-hold` | the latest word on a behavior, from a commit, the docs, or a probe, is not what a rule in force predicts |
| `scheme-precedent` | a behavior follows a precedent other than Scheme, Racket, or JSON, except a library function that follows the JavaScript operation it mirrors, as the rule `stdlib-agrees-with-javascript` says it should |
| `removals-decided` | a feature was removed in a commit that records no decision |
| `breaking-decided` | a breaking change came in a commit that records no decision |
| `measures-chain` | a reported figure does not start where the one before it ended |
| `every-commit-read` | a commit no claim comes from |
| `docs-match-lion` | the repository's latest word on a behavior differs from what a probe of Lion at HEAD gives |

A violated assumption is a finding. Every finding is in one of two lists until it is settled:

- `known.json`: findings the project knows of and has not decided about, each with a note on what it is.
- `accepted.json`: findings the project accepts, each with the reason.

`bun run history check` fails on a finding in neither list, and on a listed finding the model no longer finds, so neither list goes stale. The record's tests run it, so the pre-commit hook and CI do too. Commits the model has nothing from are counted but do not fail: they wait for a reader.

A rule is checked by running Lion only where a probe runs a case it predicts; until then nothing that Lion does can break it, and a finding against it can come only from what the repository says. `untested` lists the rules in force that no probe checks, and `bun run history check` counts them with what the model holds, as in `✓ The model holds: 4823 claims, … 107 rules in force that no probe checks`. A rule leaves the list when it gains a prediction a probe answers:

```bash
bun run history ask '["find", "?rule", ["and", ["untested", "?rule"], ["string/startsWith", "?rule", "use-"]]]'
```

gives `["use-bun-test-runner"]`. `use-bun-not-npm` left the list when `history/notes/constraints-checked-by-probes.json` restated it with the prediction that no script, hook, or CI step runs `npm` or `npx`, and the probe `scripts-call-npm` answered it.

## Settling a finding

A finding is settled by what the project says next, not by editing the model:

- **A decision.** Write a decision record in `history/notes/`: a notes file with a title, its context, and claims quoting it. A rule restated with an exception settles a conflict; a rule restated with `"holds": false` withdraws it; a behavior the record states is the project's latest word on it.

  ```json
  "claims": [
    {
      "quote": "lambdas still ignore arguments past their parameters",
      "says": {"rule": "scheme-racket-semantics", "holds": true, "statement": "...", "area": "evaluation", "except": ["lambda-extra-arguments"]}
    }
  ]
  ```

- **A change to Lion or to its docs**, after which the probe or the docs say what the rules predict.
- **A reason**, in `accepted.json`, for a finding that is right as it stands, such as a figure in an old commit message that can no longer be changed.

## Reading new commits

`bun run history ask '["find", "?commit", ["silent", "?commit"]]'` lists the commits the model has nothing from: no claim quotes it, and no claim or release was made by it. A commit that records its change in `history/notes/` is not silent, since its claims were made by it. To read an older one, an agent or a person writes its claims in a notes file, `history/notes/<nn>-<name>.json`, each naming the commit as its `"source"`:

```json
{"claims": [
  {"id": "fbc25a1-1", "source": "fbc25a1",
   "quote": "`match` fits a record against a record with the same keys",
   "says": {"behavior": "match-record-pattern-extra-keys", "is": "no-fit", "area": "schemas", "breaking": true, "was": "fit"}}
]}
```

- Read the commit's text in `sources/<7-character hash>.txt` in full, after `bun run history write` or `check` has written it.
- `id` is `<commit>-<n>`. `quote` is copied word for word from the text: the clause that carries the statement and no more. For a terse commit, quote the diff: a code line, a comment, a test name. The build refuses a quote that is not in its source.
- `says` is exactly one of the five kinds, with exactly the keys the frame allows. A misspelled key fails.
- Record what the text states, at the strength it states it. One statement per claim. Give every semantic rule at least one prediction, taken from the examples the text gives; that is what lets the model find rules that contradict each other or that Lion does not follow. `follows` only when the text names the precedent; `breaking` only when the text says the change breaks programs.
- Reuse the ids the model already uses: the timeline shows every rule, decision topic, behavior case, feature, and figure under the commit that stated it, and `bun run history ask '["aggregate/unique", ["find", "?case", ["claim", "?_", "?_", "?_", ["schema/open", {"behavior": "?case"}]]]]'` lists the cases. Name a new behavior case `<subject>-<situation>`, specific enough that two readers would choose the same id.
- When the text contradicts an earlier commit, record both as they stand: that is a finding, not a mistake.

Then run `bun run history write` again, and list any new finding in `known.json` or settle it.

## Probes

`probes.json` holds programs that each answer one question, as a claim does. A probe of a behavior says, in one word, what Lion does in a case, or what the repository holds: `{"case", "area", "program"}`. A program gives the word the notes use for the behavior, such as `["cond", [["schema/fits?", [["lambda", ["a"], "a"], 1, 2], ["quote", 1]], ["quote", "ignored"]], ["else", ["quote", "other"]]]`, and a program that fails is the behavior `error`. Each build runs every probe on the workspace's own `@lionlang/core`, so a change to Lion that makes a probed behavior differ from what the repository says is a `docs-match-lion` finding until the docs or the decision catch up.

A probe of a feature says whether a named thing is there: `{"feature", "kind", "program"}`, with a program that gives `true` or `false`. The record of the library's names asserts that `number/add` is a function and that `math/+` no longer is, and these probes answer for both:

```json
[
  { "feature": "number/add", "kind": "function", "program": ["value/function?", "number/add"] },
  { "feature": "math/+", "kind": "function", "program": ["value/function?", "math/+"] }
]
```

They give `true` and `false`, so both assertions hold. A feature's probe that fails, or gives anything but `true` or `false`, has answered nothing: `bun run history check` reports it, as it reports two probes that answer one question.

Lion's library reads no file and runs no command, so the host that runs the probes gives each program functions of its own. They let a decision that asserts how the project is set up be checked like one that asserts how Lion evaluates:

| Call | Gives |
|---|---|
| `["repo/files", path]` | the paths of the files under a folder of the repository, in order, and none for a path that names nothing |
| `["repo/read", path]` | the text of a file of the repository |
| `["repo/json", path]` | a JSON file of the repository, as a value |
| `["repo/run", name]` | `{"exit", "output"}`: the exit code of a command `commands.json` declares, and what it wrote |
| `["lion/special-form?", name]` | whether Lion has a special form of that name, which a program cannot ask otherwise, since a special form is not a value |

A path is relative to the repository. A path that leads out of it, a path `repo/read` or `repo/json` is given that names no file, and a command `commands.json` does not declare each fail, so the probe gives `error`. `repo/files` leaves out `.git` and `node_modules`, and lets a probe ask about many files at once: the record of resumable evaluation asserts that the error `ContinuationNeededError` is gone, and its probe gives `false` while no file of the core declares it:

```json
{
  "feature": "ContinuationNeededError",
  "kind": "error",
  "program": [
    "array/includes?",
    [
      "array/map",
      ["repo/files", "packages/core/src"],
      ["lambda", ["file"], ["string/includes", ["repo/read", "file"], "class ContinuationNeededError "]]
    ],
    true
  ]
}
```

 The record of the quality gates asserts that the pre-commit hook runs the tests, and this probe runs the case:

```json
{
  "case": "pre-commit-hook",
  "area": "build",
  "program": [
    "cond",
    [
      ["string/includes", ["repo/read", ".husky/pre-commit"], "bun run test"],
      ["quote", "runs-tests"]
    ],
    ["else", ["quote", "other"]]
  ]
}
```

It gives `"runs-tests"`, so the assertion holds. `commands.json` lists every command a probe may run, each as the words of one command line, which no shell reads, and the folder it runs in. A command that needs more than a line is a script in `packages/history/commands/` that the line runs, such as `host-run.mjs`, which calls `run` as a TypeScript host does and prints what each call gave. Two of the eleven:

```json
{
  "docs-check": {
    "cwd": "packages/site-runtime",
    "command": ["bun", "run", "build-docs.ts", "--check"]
  },
  "host-run": {
    "cwd": "packages/history",
    "command": ["bun", "commands/host-run.mjs"]
  }
}
```

`["repo/run", "docs-check"]` gives `{"exit": 0, "output": "docs/docs.html is current.\n"}` while every library function has an example in the docs. A command runs once in a build, however many probes ask for it, and every build runs it, so declare commands that are quick and change nothing in the repository; the eleven take about two and a half seconds together.

A probe can also run a Lion program the repository holds. The research skill's rules are one, so the probe of who counts as a voice loads them with `["eval", ["repo/json", "skills/lion-research/assets/core.json"]]`, states a few facts as the skill's scripts write them, and asks the relation the decision record names.

## Files

| File | Kept in git | Written by |
|---|---|---|
| `history/notes/*.json` | yes | people writing changes and decisions, and readers of old commits |
| `probes.json`, `commands.json`, `checks.json` | yes | people |
| `known.json`, `accepted.json` | yes | people |
| `steps/01-frame.src.json`, `steps/05-links.src.json`, `steps/06-findings.src.json` | yes | people |
| `sources/`, `notes/02-commits.json`, `notes/20-runs.json` | no | the build, from git, the notes, and the probes |
| `steps/*.json`, `model.json` | no | the build: the core, the frame, each notes file, the record, links, and the lists of findings, run in order |
| `docs/changelog.html`, `CHANGELOG.md`, `DECISIONS.md` | yes | `bun run history write`, from `history/outputs.json` and the model |

`checks.json` holds the standing questions for a researcher; run it with `bun run history ask history/research/checks.json`.

## The page

The timeline, `docs/changelog.html`, is how a reader sees the model. `history/outputs.json` writes it from the model with Lion, as it writes `CHANGELOG.md` and `DECISIONS.md`: above the timeline, the findings that wait for a decision, each under the assumption it is evidence against, with its note from `known.json`; under each release, the decisions its commits made that no decision file records yet, and what each commit it shipped said, each statement under the words of the commit that carry it, marked when it is a removal or breaking change with no decision, a rule still in force, or a decision reversed later. Every word on it comes from the model or from the commits, so the page changes when the notes do, and `bun run history check` fails when the page is not what the model writes.

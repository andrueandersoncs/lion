# The research model of Lion's development

The project record in `history/` says what changed and why. This folder holds a deeper model of the same history: what every commit stated, quoted word for word, read into one Lion database with the [lion-research skill](../../skills/lion-research/SKILL.md), and rules that check the project against itself. It is meant to be kept current and asked before a decision: does this contradict a rule the project holds, has this been decided before, does the documentation say what Lion does.

```bash
bun run history research    # build the model and the page, and say what it finds
bun run history query '["query", ["reversed", "?topic", "?before", "?after"]]'
```

`research` writes the model, `model.json`, and the page for a reader, [`docs/research.html`](../../docs/research.html). The page is also on the website. `query` evaluates any Lion expression against the model.

## What is in it

Every source has a publisher: who stands behind what it says.

| Source | Publisher | Where its claims come from |
|---|---|---|
| Each commit HEAD reaches: its message, the files it changed, and up to 700 lines of its diff | Lion repository | `notes/10-era-a.json` to `notes/15-era-e.json`, written by readers |
| `README.md`, `AGENTS.md`, and `CLAUDE.md` as they stand | Lion repository | `notes/16-docs-head.json` |
| Each decision in `history/decisions/` | Lion repository | the decision's own `"claims"` |
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

`bun run history research` fails on a finding in neither list, and on a listed finding the model no longer finds, so neither list goes stale. The record's tests run it, so the pre-commit hook and CI do too. Commits the model has nothing from are listed but do not fail: they wait for a reader.

## Settling a finding

A finding is settled by what the project says next, not by editing the model:

- **A decision.** Add `"claims"` to a decision in `history/decisions/`, each a quote from the decision's own words and what it says. A rule restated with an exception settles a conflict; a rule restated with `"holds": false` withdraws it; a behavior the decision states is the project's latest word on it.

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

`bun run history research` lists the commits the model has nothing from. To read one, an agent or a person writes its claims in a notes file, `notes/<nn>-<name>.json`:

```json
{"claims": [
  {"id": "fbc25a1-1", "source": "fbc25a1",
   "quote": "`match` fits a record against a record with the same keys",
   "says": {"behavior": "match-record-pattern-extra-keys", "is": "no-fit", "area": "schemas", "breaking": true, "was": "fit"}}
]}
```

- Read the commit's text in `sources/<7-character hash>.txt` in full, after `bun run history research` has written it.
- `id` is `<commit>-<n>`. `quote` is copied word for word from the text: the clause that carries the statement and no more. For a terse commit, quote the diff: a code line, a comment, a test name. The build refuses a quote that is not in its source.
- `says` is exactly one of the five kinds, with exactly the keys the frame allows. A misspelled key fails.
- Record what the text states, at the strength it states it. One statement per claim. Give every semantic rule at least one prediction, taken from the examples the text gives; that is what lets the model find rules that contradict each other or that Lion does not follow. `follows` only when the text names the precedent; `breaking` only when the text says the change breaks programs.
- Reuse the ids the model already uses: the page's lookups list every rule, decision topic, behavior case, feature, and figure, and `bun run history query '["aggregate/unique", ["find", "?case", ["claim", "?_", "?_", "?_", ["schema/open", {"behavior": "?case"}]]]]'` lists the cases. Name a new behavior case `<subject>-<situation>`, specific enough that two readers would choose the same id.
- When the text contradicts an earlier commit, record both as they stand: that is a finding, not a mistake.

Then run `bun run history research` again, and list any new finding in `known.json` or settle it.

## Probes

`probes.json` holds programs that say, in one word, what Lion does in a case: `{"case", "area", "program"}`. A program gives the word the notes use for the behavior, such as `["cond", [["schema/fits?", [["lambda", ["a"], "a"], 1, 2], ["quote", 1]], ["quote", "ignored"]], ["else", ["quote", "other"]]]`, and a program that fails is the behavior `error`. Each build runs every probe on the workspace's own `@lionlang/core`, so a change to Lion that makes a probed behavior differ from what the repository says is a `docs-match-lion` finding until the docs or the decision catch up.

## Files

| File | Kept in git | Written by |
|---|---|---|
| `notes/1*.json` | yes | readers |
| `probes.json`, `checks.json`, `page.json` | yes | people |
| `known.json`, `accepted.json` | yes | people |
| `steps/01-frame.src.json`, `steps/05-links.src.json`, `steps/06-findings.src.json` | yes | people |
| `sources/`, `notes/02-commits.json`, `notes/04-decisions.json`, `notes/20-runs.json` | no | the build, from git, the decisions, and the probes |
| `steps/*.json`, `model.json` | no | the build: the core, the frame, each notes file, the record, links, and the lists of findings, run in order |
| `docs/research.html` | yes | the build, from `page.json` and the model |

`checks.json` holds the standing questions for a researcher; run it with `bun run history query history/research/checks.json`.

## The page

`page.json` plans `docs/research.html`: a tab for each thing its reader comes to do, each leading with an answer in words and folding the detail under "Show the evidence". Every text on it is a Lion expression the page works out from the model. To check that each screen stays within a reader's attention, measure it with the [cognitive-load](https://github.com/andrueandersoncs/cognitive-load) skill, serving `docs/` and passing each tab as a state:

```bash
node <cognitive-load skill>/scripts/attention.cjs http://localhost:4173/research.html --region page=body --states history/research/page-states.json --ready "document.getElementById('progress').hidden"
```

Run it at `--viewport 1440x900` and `--viewport 390x844`. Every tab is within budget at both; the Lion editor behind "Ask your own question" shows code, as it must.

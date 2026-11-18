# Research

Research for Lion is kept as one Lion model, built with the [lion-research skill](../skills/lion-research/SKILL.md). Each run adds to the same model instead of starting a new one. A later run starts from everything earlier runs established: what each source said, what Lion does, which ideas were weighed and what the evidence said about them, and the rules that drew those conclusions. When new evidence arrives, conclusions that rest on old evidence change with it, because the rules derive them.

`guidelines/researching.md` holds the rules for a run. This file describes the folder.

## Layout

```text
research/
  steps/       every program that changed the model, in order, for every run
  notes/       what each batch of sources said, as plain JSON, one file per step
  sources/     the text of every source, as it was read: <source id>.txt
  probes/      the Lion programs whose output is a source, and run.mjs to run them
  checks.json  the standing questions, asked after every batch
  runs/<run>/  each run's report.md and page.json; readers/ keeps what subagents returned
  model.json   built from steps/ by the replay; never edited, not committed
```

Every file is committed except what is built from the rest: `model.json`, and each run's `explorer.html` and `page-check.json`.

## Rebuild and ask

Run these from this folder:

```bash
node ../skills/lion-research/scripts/replay.mjs
node ../packages/cli/dist/bin.mjs checks.json --database model.json
node ../skills/lion-research/scripts/check-quotes.mjs
node ../skills/lion-research/scripts/build-explorer.mjs model.json --page runs/<run>/page.json --out runs/<run>/explorer.html
```

Build the CLI first with `bunx turbo build --filter=@lionlang/cli`. The replay runs every step into a new model, and replaces `model.json` only when all of them pass.

## The shared frame

`steps/00-core.json` is the skill's core. `steps/01-frame.src.json` holds what every run shares:

| Kind of statement | Says |
|---|---|
| `{"lion": feature, "has": true/false}` | Lion has a feature, or lacks it |
| `{"covers": feature, "by": technique, "is": true/false}` | a technique, language, or system gives a feature, or does not |
| `{"needs": condition, "by": technique}` | a technique only means something where the condition holds |
| `{"adopted": technique, "in": system}` | a working system uses the technique |
| `{"defines": term}` | a source explains a term |
| `{"raises": term}` | a source asks about a term |
| `{"counted": what, "n": integer}` | a figure a program gave |
| `{"result": technique, "measure": what, "bound": bound, "times"/"percent"/"count": number}` | a result a source reports for a technique, such as a speedup |
| `{"lion measured": workload, "ms"/"s": number}` | how long Lion took on a workload |
| `{"lion grows": workload, "power": number}` | how Lion's time grows with the size of a workload |

What a program run on Lion says about what Lion has overrules what its docs say: where the publisher `Lion probes` gives one value and the docs another, only the probes' value is `stated`.

It also holds the rules that judge an idea for Lion:
- A `candidate` is a proposed change to Lion, with the techniques it `uses` and the features it `offers`. `weighed_in` names the runs that weighed it, so a run's page can keep to its own.
- The model derives what a candidate's techniques `give`, and of that what Lion has, which they `handle`, and what it lacks, which they `bring`.
- It derives what each candidate `adds` that Lion lacks among what it offers, what Lion has `already`, what it `folds` into one rule, and what `blocks` it or leaves it `moot`.
- From those it derives a `verdict`, a `rank`, `caveat`s, and `precedent`s.
- An assumption `expects` a question to have a value, or `expects_cover`s: expects some technique a candidate uses to cover a feature. The model finds the evidence that `violated` it, and calls it `unsettled` while no evidence bears on it.

A feature name is the same words in every run, so that evidence from different runs meets on one question. Before you name a feature, ask the model which names exist:

```json
["aggregate/unique", ["find", "?f", ["or", ["answer", {"lion has": "?f"}, "?_", "?_"], ["answer", ["schema/open", {"covers": "?f"}], "?_", "?_"]]]]
```

## Runs

| Run | Steps | Question |
|---|---|---|
| `separation-logic` (2026-11-18) | `02-sl-*` to `10-sl-*` | What can Lion use from separation logic? Step `10-sl-built` records Lion after the three ideas it ranked were built. |
| `lion-improvements` (2026-11-17) | `11-li-*` to `22-li-*` | What to improve in Lion next? It weighs seven directions, such as one algebra of changes (DBSP) and annotated relations, by net reasons: Lion features one mechanism would take over, capabilities it would add, and measured gaps a published speedup applies to. Its own frame, `11-li-frame`, ranks them as `net_rank` from `tally`. |

A run's own ids start with its prefix: claims `sl-a1`, leads `sl-terms`, assumptions `sl-records`. Source ids, candidate ids, and feature names have no prefix, because later runs share them. A later run that reads Reynolds 2002 cites `a-reynolds-2002`, and new evidence about the record split adds to the candidate `rest`.

A run's page asks about its own candidates through `weighed_in` and its own beliefs and claims by their prefix, since the model holds every run's. Its trust and sources views show the whole model.

## Lion as a source

What Lion does is recorded from its reference pages and from programs run on it.
- Each program is in `probes/`.
- `probes/run.mjs` runs them and saves their output as a source, so a claim quotes what Lion gave.
- `sources/lion-probes.txt` names the commit it ran at.

When Lion changes, run the probes again under a new source id, and record what the new output says. The publisher's latest word replaces its earlier one, so the conclusions follow Lion as it is now.

```bash
node research/probes/run.mjs lion-probes-2026-12-01 records keys-rules split-model
```

A probe that models a proposed rule beside Lion's engine is a TypeScript program in a folder of its own, run with `bun` in that folder: `chase-model/` (invented unknowns and equality, saved as `chase-model-tests`) and `algebra-model/` (annotations as aggregated columns, saved as `algebra-model-tests`).

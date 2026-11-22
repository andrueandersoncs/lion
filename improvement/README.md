# The improvement record

The record of every experiment on Lion: a [lion-reasoning](../skills/lion-reasoning/SKILL.md) task folder whose scores are the qualities `research/runs/self-improvement/plan.md` measures, whose requirements are Lion's constraints, and whose directions are the ideas tried to improve them. `guidelines/improving.md` says how an experiment is run. This file describes the folder.

```text
improvement/
  notes/01-frame.json  the scores, what each requires, the directions, the problems, and what the user decided
  notes/NN-<label>.json  what each observation of the scoreboard showed, as `bun run loop observe` wrote it
  steps/               the steps the notes became, 00-core.json first: the skill's core as it was when the record began
  seen/                what each source showed: the scoreboard's lines, and the user's words in user.txt
  versions/            the hash of every file of the project each time it was observed
  model.json           built from steps/; not committed
```

## Asking it

```bash
bun run loop status
```

prints every standing question that has an answer: the best each score is sure to give, the versions whose scores do not count because a requirement failed, where the next experiment should go, what each experiment was expected to fix and whether it did, which directions wait for the user, and how many predictions the loop has resolved per hour of checks, from the time each tool of each observation took (decision `loop-meta-score`).

The record is judged by the published Lion CLI that `LION_CLI` names, `bunx @lionlang/cli@0.14.0` unless it is set, never by the Lion the loop is changing. A change to Lion therefore cannot change how its own experiments are judged.

## What it scores

Each score requires the constraints:
- no test task fails;
- `bun run history check` holds;
- no grid exception is undocumented;
- no `bun run scale` workload grows faster than n^1.15 or is stopped;
- no line of an instrument is removed since the base.

| Score | Better | From |
|---|---|---|
| capability passed, public, per pillar and in all | higher | `bun run capability --json` |
| code lines per passed task, core | lower | `bun run measure` and the capability |
| messages per passed task, core | lower | the same |
| grid exceptions, core | lower | `bun run measure` |
| rules no probe checks, record | lower | `bun run history check` |
| mutations missed, listed | lower | `bun run mutate`, with `--full` |
| tests' time picked, last 30 commits | lower, picking sound | `bun run affected --replay 30` and `--check` |
| bench total ms, every benchmark | lower | `bun run bench` |
| surprising pairs, grid | lower | `bun run pairs` |
| flaky checks, telemetry | lower | what the commit hook logged to `out/telemetry.jsonl` |
| capability passed by agents, per pillar and in all | higher | `bun run loop --agents`, which costs money |
| agents' first tries that ran | higher | the same |
| agents' failed tries of one cause, on a suite of chosen tasks | lower | `bun run loop --agents --tasks a,b` |

A run of agents on some of the tasks is a suite of its own, named for how many it chose, so its scores are never compared with a run of all of them. A requirement that fails, scale or the tests, is run again, and fails a version only when it fails again.

`bun run loop status` also answers how often the record's predictions came true, for scores, for requirements, and for other questions, and its rate R: capability tasks gained per hour of checks and per dollar agents spent.

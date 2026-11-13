# verifies-company-figures

A frozen eval: the run works from saved sources instead of the web, so it can be run again on a new model or a changed skill and compared with known answers.

- `corpus/`: seven sources about Tarnwell Cold Chain, a company made up for this case, as the text an agent would have saved. They hold the traps a financial analyst meets: a revenue figure restated in a later filing, revenue in two senses and two periods, a figure written in billions, a blog that misquotes the company, relays of relays, a disputed warehouse count, and a margin to work out from line items.
- `answers.json`: the known-correct answers, as checks on a finished research folder. Each check names the stage it grades (reading, framing, conclusions, page, report) and the sources it rests on.
- `grade.mjs`: grades a research folder against the answers and prints a line per stage, so a failure says where the run went wrong: in reading the sources, in the frame, in what the model derives, in the page, or in the report.
- `reference/`: a reference run: the notes, frame, standing checks, page plan, and report of a run that passes every check. A property in `packages/metrics/src/tests/research-skill.test.ts` replays it on every change, and checks that leaving out any one source fails exactly the checks that rest on it.
- `prompt.md`, `case.yaml`, `graders/`: the case for `claude plugin eval`. The graders forbid web tools and state the known answers per stage for a judge.

After a run of the eval, grade it from the run's folder:

```bash
node <skill>/evals/verifies-company-figures/grade.mjs research/tarnwell
```

`grade.mjs` runs the published Lion command, or the one `LION_CLI` names, such as `bun ~/lion/packages/cli/dist/bin.mjs`.

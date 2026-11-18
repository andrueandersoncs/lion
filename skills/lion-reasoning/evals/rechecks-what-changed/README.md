# rechecks-what-changed

A frozen eval of what a record of observations is worth when re-observing is expensive and nothing else says what changed. It runs in two sessions, and between them the project changes without the agent being told.

The project is a library of 24 prompts whose `RESULTS.md` records each prompt's score on a golden set. A score can be observed only by running the prompt's eval, through a service that is slow (eight seconds), metered, and opaque: it scores the prompt's lines, ignoring comments and blank lines, by a hash with a salt the agent never sees. The first session checks 16 prompts and may run 24 evals. The second checks the other 8, may run 15 evals, and writes `audit.json`, the lines of `RESULTS.md` that are wrong at the end.

Between the sessions, seven prompt files and `RESULTS.md` change:

- four prompts gain a rule line and score otherwise than `RESULTS.md` says;
- one gains a line and comes to score what `RESULTS.md` says;
- one right line of `RESULTS.md` is made wrong, and one wrong line is corrected;
- two prompts gain a comment, which changes no score.

Nothing dates these changes. The owner's uncommitted work had already added a rule line or two to every prompt before the first session, so `git status` and `git diff` show the same files changed before and after, with edits of the same kind. Every prompt and `RESULTS.md` is left with the same time, as a stash and pop leaves them. Fifteen evals can re-run the seven changed prompts but not all 16 of the first session's. So a run is right only if its record tells it which observations still stand.

- `world.mjs`: the prompts, the changes, the scores, and what the report should say, from a fixed seed.
- `setup.mjs`: what `bun run skill-eval` calls: the eval service, each run's project, and the changes between the sessions. It leaves the service's record of a run's evals in the run's `evals.json`.
- `sessions/1.md`, `sessions/2.md`: the two prompts, the same for every arm. The second gets the first one's closing message in place of `{{earlier}}`.
- `grade.mjs`: grades a finished run's folder by stage: `changed` (every line that went wrong after the first session is reported), `fixed` (no line that came right after it is), `unchanged` (every other wrong line is), and `precise` (no entry names a right line, or no line).
- `baselines/notes/`: the arm a skill is measured against besides no skill at all, plain working notes, with the rule that notes reflect what was true when written.
- `case.yaml`: the case's turns and time per session.

Run it with the skill, with plain notes, and with no skill:

```bash
bun run skill-eval lion-reasoning rechecks-what-changed --runs 2
bun run skill-eval lion-reasoning rechecks-what-changed --from skills/lion-reasoning/evals/rechecks-what-changed/baselines/notes --runs 2
bun run skill-eval lion-reasoning rechecks-what-changed --bare --runs 2
```

## Results

Four runs of each arm with claude-opus-5-5, on 2026-11-18, each a line of `bun run skill-eval`:

| arm | runs fully right | checks passed, run by run | cost a run | minutes a run |
|---|---|---|---|---|
| lion-reasoning | 4 of 4 | 12, 12, 12, 12 of 12 | $1.52 | 7.2 |
| plain notes (`baselines/notes`) | 0 of 4 | 11, 11, 11, 11 of 12 | $1.08 | 6.6 |
| no skill (`--bare`) | 1 of 4 | 11, 12, 8, 9 of 12 | $0.88 | 6.0 |

Every lion-reasoning run re-ran in its second session exactly the seven prompts whose files had changed, and no other, because each eval it recorded is tied to the hash of the prompt it ran on. Every plain-notes run saw that all 24 prompts had been rewritten after its notes, said that nothing it kept recorded what each prompt held when its eval ran, spent its spare evals on the prompts whose lines of `RESULTS.md` had changed and on guesses, and missed `flag-spam`. The runs with no skill trusted the first session for most prompts and missed one to four of the five lines that went wrong. The one that got every line right had found what its first session left in its own scratch folder, which a real session can do too.

The case is the line where a checked record pays. In a wider trial of the same arms with the same model, run outside this repository, the three were equally right when anything else dated the changes: the files' times, or commits. They were also equally right when re-checking cost nothing, because there the agents re-derived every fact, as one script that checked all 240 claims of a README in seconds. Lion cost two to four times as much there and gained nothing.

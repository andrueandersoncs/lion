# Improving Lion by Experiment

Part of Lion's developer guidelines, which start in [AGENTS.md](../AGENTS.md).

> **IMPORTANT**: An experiment on Lion is recorded in `improvement/` as it happens: what you expect it to do before you run it, then the scoreboard, observed with `bun run loop observe`. The record, not your report, says whether the experiment paid off, and it judges with the published Lion, not the Lion you changed.

`improvement/README.md` describes the record, and `research/runs/self-improvement/plan.md` says what it measures and why. The decisions behind it are in `history/notes/improvement-judged-by-capability.json` and `improvement-loop-on-branches.json`.

- **Start from the record.** Run `bun run loop status` before you choose what to do. It lists the versions whose scores a requirement keeps from counting, the directions that are live and the experiments each made, the problems no direction addresses, and the questions that wait for the user. A direction that `needs` the user's answer waits until they give it.
- **Say what you expect before you run it.** After the change and before the run, add a notes file in `improvement/notes/` with a belief that `tries` the direction, predicting each score or problem the change should move, and record it with the skill's `record.mjs`. A belief recorded after the run only describes what you saw.
- **Observe with the scoreboard.** Run `bun run loop observe <label> --tries <direction>`. It runs every measuring tool through the skill's `see.mjs` and records each line it prints, word for word, so no figure is typed in. `--skip` leaves out tools the change cannot reach, `--mutations` runs listed mutations by name, and `--repeat n` runs them n times and counts the runs that caught each, for a property that catches a break only sometimes.
- **Never change what scores you.** Removing a line from an instrument, such as the grid's `KNOWN`, a listed mutation, a corpus task or its reference program, a probe, or the record's frame, fails the requirement every score has. Changing an instrument is an experiment of its own, with a decision, and its runs do not count for the scores.
- **Work on a branch.** An experiment is committed on its branch with the record's notes. Merging, releasing, and reversing a decision are the user's.
- **Let the record steer.** A direction that keeps missing is set aside after its patience. A direction that paid off is tried first next time. When you go against what the record advises, say why in the experiment's notes.

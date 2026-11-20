# Does Lion still have the hub-graph join gap?

Run `join-gap` (2026-11-19), step `41-jg-hubs-now`. It times again the two triangle workloads behind the candidate `joins` (worst-case optimal joins), after the logic engine was rewritten as the weights engine and expressions were compiled to closures. It measures only; nothing was built. Every figure below is what the model gives: the checks named "Join gap: …" in `research/checks.json` ask for them.

## The answer

**Yes. The gap holds, unchanged.** On the graph with two hub nodes, counting the 23,950 triangles among 19,983 edges takes 15,010 ms on Lion as it is now (`jg-b1`), against 14,220 ms on 2026-11-17 (`li-l27`). The time still grows about n^1.9 between the two largest sizes (`jg-b2`, as `li-l28`). Without hubs, the triangles among 16,000 edges over 4,000 nodes take 36 ms (`jg-b5`) and grow n^0.9 (`jg-b4`, against n^0.8 in `li-l29`).

- **The join is the time.** The same program with its edges loaded and no triangles asked takes 290 ms, start-up included (`jg-b8`), so the join takes 14,720 ms of the 15,010.
- **The rewrite did not move it.** The published CLI v0.12.0, which the 2026-11-17 run timed, took 16,330 ms on the same machine today (`jg-b6`) and grows n^2.0 (`jg-b7`). So the machine was slower today than on 2026-11-17, and Lion now is 1.09 times as fast as v0.12.0 on this workload. That is within what the machine's load moves.
- **Not closed.** The model's `closed` rule counts a gap as closed when Lion has become at least twice as fast. Here that means 7,110 ms or less, so `closed` is empty for `joins`.

## What the model says about `joins` now

The new claims are the latest word of the publisher `Lion probes`, so `gap` now reads 15,010 ms and the verdicts follow it:

- **Verdict:** worth adopting. It adds two things Lion lacks: worst-case optimal joins (`li-l21`) and skewed joins (`jg-b3`, which restates `li-l38`).
- **Reasons** in the 2026-11-17 run's frame: those two, and "closes a measured gap", the hub-graph workload. The net is 3, with nothing against.
- **Rank across every run:** 1, tied with annotated relations (top-k proofs and probabilities). Both give two features, backed by 3 publishers. When this run was taken, only the solver for the values a question leaves open ranked above them; it is built now (step `41b-co-built-solver`), so nothing left to build ranks above them.
- **Stage:** 1. It waits for no other idea, so it can start now.
- **Rank in the 2026-11-17 run's own measure** (`net_rank`): 4 of seven.
- **Belief `li-joins`** ("Joins are not where Lion is slow") is still contradicted, now also by `jg-b2` and `jg-b7`.

## Why the hubs hurt

This is reasoning about the engine and the workload, not a measurement. Lion matches the three edge goals one at a time. Each goal is looked up by the variables the goals before it bound (`lookup` in `packages/core/src/logic/model.ts`). For each of the 7,996 edges into a hub, the second goal gives the 3,998 edges from that hub to the other nodes. The third goal checks each of those paths, and nearly all fail. A worst-case optimal join binds one variable at a time instead. It intersects what every goal allows for that variable, so its work is bounded by the largest output the edges allow, not by the paths of two edges.

## How it was measured

- **The generator.** `research/probes/hubs/hubs.mjs` is the generator the 2026-11-17 run used. It was recovered from that session's transcript, because the run had not saved it. It gives the same edge and triangle counts at all four sizes.
- **The timing.** `research/probes/hubs/time.mjs` times the hub programs at m = 500, 1,000, 2,000, and 4,000. It runs each three times and takes the median wall time, start-up included. It ran on the CLI built at 54f7b11 and on the published v0.12.0.
- **The scale workload.** `bun run scale --sizes 1000,4000,16000 --limit 60 triangles` is the same command as before, run twice.
- **The source.** The output is `research/sources/lion-bench-hubs.txt`.

To time it again after a change to Lion:

```bash
node research/probes/hubs/time.mjs 3 node packages/cli/dist/bin.mjs
```

## Limits

- **One machine, a busy one.** The load average was about 4.5 from other sessions. The same-day run of v0.12.0 is the control for that, and it puts the old and new engines within 10% of each other.
- **Wall time.** Each time includes the CLI's start-up, which is part of the 290 ms. The 2026-11-17 run timed v0.12.0 through `bunx`, and so does the control. The tree ran under `node`.
- **Three runs per size.** The largest size on the tree spread from 14.89 s to 16.19 s.
- **The growth power comes from two sizes,** as before: between 9,982 and 19,983 edges.

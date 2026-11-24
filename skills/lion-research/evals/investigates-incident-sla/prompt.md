---
tags: [lion-research, frozen, proof-building]
max_turns: 120
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
disallowed_tools: [WebSearch, WebFetch]
---

I'm deciding whether to file a contractual SLA credit claim against Meridian Pay for its April 10, 2026 payment outage. Our contract sets a **180-minute (3-hour) maximum outage SLA**, though Meridian has historically argued SLA clocks should start at incident detection rather than outage onset. Answer four questions with full source grounding:

1. Across all time-zone normalized timestamps and disclosed uncertainty windows, did Meridian Pay **provably breach** the 180-minute SLA (a) measured from outage start to full recovery, and (b) measured from incident detection to full recovery? Give exact provable minimum/maximum duration ranges in minutes for both readings and any counterexample if a breach is not provable.
2. Which timeline timestamps are independently corroborated across publishers, and which published duration/timestamp is a misconversion or misquote?
3. Is the reported service dependency graph logically consistent (acyclic) across all sources, or does any source introduce a dependency cycle?
4. How many merchants were affected (noting any restatements), and was payouts affected?

Everything there is to read is already saved under `./skill/evals/investigates-incident-sla/corpus/`: one text file per source. Work only from those files and do not search the web. Put the research folder at `research/meridian/`.

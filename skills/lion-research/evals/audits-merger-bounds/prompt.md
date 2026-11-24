---
tags: [lion-research, frozen, proof-building]
max_turns: 120
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
disallowed_tools: [WebSearch, WebFetch]
---

I'm running acquisition due diligence on Kestrel BioLabs. Answer four questions with full source grounding:

1. Our financing covenant requires Kestrel's FY25 gross margin to be **strictly above 32.0%** under every consistent reading of its audited figures. Does Kestrel provably clear the 32.0% covenant, or can it fall short? Give the exact provable minimum and maximum gross margin range and the exact worst-case figures.
2. Are Kestrel's disclosed division revenue floors mathematically consistent with its total FY25 revenue ceiling? Prove your answer.
3. How many Services staff does Kestrel employ, and how reliable is each revenue and headcount figure across the sources?
4. Which supplier or packaging bottleneck is a single point of failure for clinical assay delivery?

Everything there is to read is already saved under `./skill/evals/audits-merger-bounds/corpus/`: one text file per source. Work only from those files and do not search the web. Put the research folder at `research/kestrel/`.

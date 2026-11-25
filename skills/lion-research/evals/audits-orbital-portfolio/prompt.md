---
tags: [lion-research, frozen, proof-building, hard, v2]
max_turns: 120
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
disallowed_tools: [WebSearch, WebFetch]
---

I'm running institutional credit & investment due diligence on **Solstice Orbital Systems**. Answer four questions rigorously with full source grounding and formal verification:

1. **Launch reliability covenant (integer ratio)**: Our credit covenant requires Solstice's FY25 orbital launch success rate `s / (s + f)` (where `s` is the whole number of successful launches and `f` is the whole number of anomaly/scrubbed launches) to be **at least 83.0%** across *every* integer combination consistent with the audited disclosures. Does Solstice provably clear the 83.0% covenant? Give the **exact provable minimum and maximum reliability percentages** (to 2 decimal places) and the exact integer `(s, f)` witnesses achieving both extremes.
2. **Commercial launch revenue envelope (coupled bilinear)**: Given the disclosed capacity-adjusted launch slot range `N`, per-launch price range `P`, and volume-discount rebate constraint `P + 2N <= cap`, compute the **exact provable minimum and maximum commercial launch revenue `N * P`** (in $M, to 2 decimal places) and the exact `(N, P)` figures achieving both extremes.
3. **Multi-hop voting control & epistemic fragility**:
   - Compute **Aegis Space Fund's** exact effective voting stake in Solstice across all direct and multi-hop indirect ownership chains (including 3-hop chains). Does Aegis hold >50% control, and does that conclusion survive if **all tertiary-source claims** are retracted?
   - Compare the corroboration resilience of Solstice's **active launch pad count** vs its **propellant supplier** under single-fact retractions (which finding is resilient to retracting any single fact, and what is the minimal cut size of each?).
4. **Source integrity**: Flag any restated figures, relayed/unread claims, and misquotes across the corpus.

Everything there is to read is already saved under `./skill/evals/audits-orbital-portfolio/corpus/`: one text file per source. Work only from those files and do not search the web. Put the research folder at `research/solstice/`.

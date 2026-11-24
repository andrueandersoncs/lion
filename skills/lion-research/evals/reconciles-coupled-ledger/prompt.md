---
tags: [lion-research, frozen, proof-building, hard]
max_turns: 120
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
disallowed_tools: [WebSearch, WebFetch]
---

I'm deciding whether to underwrite a credit facility for **Vespera Grid Storage**. Answer four questions rigorously with full source grounding:

1. **Gross margin covenant**: Our credit agreement requires FY25 gross margin to be **at least 28.0%** across *every* combination of segment revenues (`GridScale`, `MicroPack`, `ServiceContracts`) and fixed plant overhead consistent with the audited disclosures. Does Vespera provably clear the 28.0% covenant? Give the **exact provable minimum and maximum gross margin percentages** (to 2 decimal places) and the exact segment/overhead figures achieving both extremes.
2. **Modular site fleet consistency**: Across the filings and permits, are Vespera's disclosed regional modular battery site constraints (`north`, `south`, `west`, and total cap) mathematically consistent, or do they contain a contradiction? Prove your answer and identify the minimal contradicting constraints.
3. **Effective voting control & counterfactual fragility**: What is Helios Infra Fund's effective voting stake in Vespera across direct and indirect holdings? Does Helios hold >50% control, and does that conclusion still hold if uncorroborated tertiary claims are retracted?
4. **Source integrity**: Flag any restated figures, relayed claims, and misquotes across the corpus.

Everything there is to read is already saved under `./skill/evals/reconciles-coupled-ledger/corpus/`: one text file per source. Work only from those files and do not search the web. Put the research folder at `research/vespera/`.

# Researching

Part of Lion's developer guidelines, which start in [AGENTS.md](../AGENTS.md).

> **IMPORTANT**: Every research run adds to the one research model in `research/`, and is committed with it. A run starts from what earlier runs established, reuses their vocabulary, and proves each of its conclusions with Lion programs that are kept beside the evidence.

Research here means any run of the [lion-research skill](../skills/lion-research/SKILL.md) on Lion's behalf: a literature review, a comparison with other languages, a check of what Lion does. The skill says how to run one. These rules say how runs build on each other in this repository. `research/README.md` describes the folder.

- **Start from the model.**
  - Before searching, rebuild it with the replay, and ask it what earlier runs found on the topic:
    - the candidates and their verdicts;
    - what Lion has and lacks;
    - which sources were read;
    - which assumptions failed.
  - Read the reports in `research/runs/` that touch the question.
  - A question the model already answers is answered from the model, and searched again only where its evidence is thin, old, or disputed.
- **Extend the model, never start another.**
  - A run's steps go in `research/steps/`, its notes in `research/notes/`, its sources in `research/sources/`, and its programs in `research/probes/`.
  - What a run adds to the frame goes into `steps/01-frame.src.json` when later runs will want it, or into the run's own frame step when it will not.
  - A schema or rule that must change is changed in the step that wrote it, and the model is replayed.
- **Reuse the vocabulary.**
  - Name a feature, a technique, a source, or a candidate the way earlier runs named it, so that evidence from different runs meets on one question. Ask the model for the names it holds before choosing new ones.
  - A run's own ids, of claims, leads, and assumptions, start with the run's prefix.
  - A run names the candidates it weighs with `weighed_in`, new or shared, and its page asks only about those and about its own prefixed ids, so another run's beliefs and candidates do not change what it says.
- **Prove each conclusion with a Lion program.**
  - What Lion does is a claim quoting the output of a program in `research/probes/`, saved as a source with `research/probes/run.mjs`, or a sentence of Lion's docs.
  - A conclusion is derived by a rule in a step, never typed in.
  - A check you run to test an inference, such as a model of a proposed rule that runs over every small case, is a probe too. Its result goes in as claims, so the conclusion and the program that proves it stay together.
- **Keep the model current.** When a change to Lion makes a recorded claim untrue, run its probes again under a new source id and record what they say now. The latest word replaces the earlier one, and the verdicts that rested on the old evidence change with it.
- **Commit the run.** Commit the steps, notes, sources, probes, checks, each run's `report.md` and `page.json`, and what the readers returned, in one commit. Do not commit what is built from them: `model.json`, `explorer.html`, and `page-check.json`. Add the run to the table in `research/README.md`.

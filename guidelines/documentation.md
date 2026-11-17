# Documenting Every Feature

Part of Lion's developer guidelines, which start in [AGENTS.md](../AGENTS.md).

> **IMPORTANT**: Every feature a change adds is used in at least one example in the docs, with output that was run, not typed. A feature with no example is not finished.

- **Core.** A new library function, special form, logic form, query option, or kind of `why` premise gets a live `<lion-example>` in a fragment of `packages/site-runtime/content/`, where a reader would look for it: its module's example in `reference/standard-library.html` for a library function, and the how-to guide for the task it serves. The docs build runs every example and writes its real result. It fails when a special form or library function appears in no example, so `bun run --cwd packages/site-runtime docs` tells you what is missing. Rebuild `docs/docs.html` with it and commit the result.
- **Skills.** A new relation of a skill's core program, a new field of its notes, and a new script or option is shown in the skill's `SKILL.md` or its `references/`, as the program or notes with the result Lion gave. Run the example before you write its output down, as `references/patterns.md` says of its own.
- **Everywhere it changes.** Update the README section of the feature, the project record (see [Recording Changes and Decisions](recording-changes.md#recording-changes-and-decisions)), and every example the change makes untrue. When a change alters what an existing example gives, run the example again and correct its stated output; never leave a documented result that Lion would no longer produce. [The documentation procedure](#after-every-change-the-documentation-procedure) says how to find them all.
- **Examples use the feature for real.** Show a function doing what it is for, combined with what a reader would combine it with, rather than called alone on a constant. Where the playground cannot show it working, such as `object/new`, which needs a class from host code, show what it does without one, and the host case as a `<code-block>`.

## After every change: the documentation procedure

> **IMPORTANT**: Run these steps, in this order, after every change to what Lion does, before you report it done. The steps for new features above are not enough: most of what a change makes untrue is in text and examples that already exist.

1. **Run the programs the docs show.** `bun run compare main --docs` runs every program in a fenced `json` block of the README files, `AGENTS.md`, these guidelines, and each skill's `SKILL.md` and `references/`, on `main` and on the working tree, and lists the ones that give something else. For each, correct the result the docs state, or fix the change when the difference was not meant. A result written inside a sentence is not found this way: search the docs for the message or value the change alters, and run it with `bun run compare main programs.json`.
2. **Search for the sentences the change made untrue.** Search for the words the old behavior was described in, in every place that describes Lion, and correct each:
   - `README.md`
   - `packages/site-runtime/content/`, the website's pages
   - each skill's `SKILL.md` and `references/`
   - the other packages' README files, `AGENTS.md`, these guidelines, and `CLAUDE.md`
3. **Give each new feature its example**, as [above](#documenting-every-feature).
4. **Rebuild the website's docs** with `bun run --cwd packages/site-runtime docs`, which runs every live example and writes what it gives. Read the diff of `docs/docs.html`: an example whose result changed shows there, and must be one you meant to change. The same build writes `packages/core/README.md`, the page npm shows, from the language sections of `README.md`, so never edit that file by hand.
5. **Record the change** as [Recording Changes and Decisions](recording-changes.md#recording-changes-and-decisions) says, then run `bun run history write` and `bun run history check`. Two things there follow from the docs:
   - The record quotes sentences of `README.md`, `AGENTS.md`, these guidelines, and `CLAUDE.md` in `history/notes/16-docs-head.json`. A sentence you reworded fails the check until its claim quotes the new words and says what they now say; a rule the docs no longer hold is restated with `"holds": false`.
   - A probe in `history/research/probes.json` that pins a behavior you changed, or reads source text you moved, is updated to tell the new behavior from the old. Build the language first, with `bunx turbo build --filter=@lionlang/core`: the probes run the built language, and a stale build checks the old code.
6. **Update `AGENTS.md`, these guidelines, and `CLAUDE.md`** when the change alters a practice, a command, or a rule they state.
7. **Say what you did** in your report: which documents changed, and what steps 1 and 2 found.

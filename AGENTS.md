# AGENTS.md - Developer Guidelines for Lion Project

This document provides essential information for AI coding agents working on the Lion project: what Lion is, the goals of every change, the commands, and the guidelines to read before each kind of work.

## Project Overview

Lion is a TypeScript monorepo. Its two main packages are:
- **@lionlang/core**: Core library built with Effect v4 for functional programming
- **@lionlang/repl**: React-based web application using TanStack Router and Vite

It also holds **@lionlang/metrics**, private tools that measure Lion's complexity, speed, and tests (see [Measuring Complexity](guidelines/measuring.md#measuring-complexity)), and **@lionlang/history**, the tools of the project record: Lion's changes, releases, and design decisions as a Lion model of its git history (see [Recording Changes and Decisions](guidelines/recording-changes.md#recording-changes-and-decisions)). The others are **@lionlang/cli**, the `lion` command; **@lionlang/site-runtime**, the evaluator behind the website's live examples; **@lionlang/typesafe-ai**, bindings for TypeSafe's Jev; and `packages/agent` and `packages/examples`, Lion programs run by small hosts.

## Goals for Every Change

> **IMPORTANT**: These goals apply to every feature, fix, and refactor. Treat the codebase as your own: leave Lion more unified, simpler, and better tested than you found it.

What Lion is does not change:

- Lion MUST be a JSON-based Lisp: every program is valid JSON.
- A Lion program MUST be able to be evaluated entirely in memory.
- The semantics are approximately those of Scheme and Racket, plus the logic layer.

Every change aims for these:

1. **Integrate deeply.** A new feature works together with every existing feature when it ships, in plain code and in the logic layer. The logic features and the Lisp features are one language: an expression gives in a rule, a query, a `find`, or anywhere else what it gives in plain code. A feature that works only on its own is not finished. See [Designing Features and Semantics](guidelines/designing-features.md#designing-features-and-semantics).
2. **Reduce complexity.** Each change should leave Lion simpler, in its code and in its semantics, without removing a feature. Before adding a special case, look for one rule that replaces several. Measure before and after, and aim for the numbers to go down. See [Measuring Complexity](guidelines/measuring.md#measuring-complexity).
3. **Test with properties.** Every new feature and every bug you come across gets property-based tests that fail without your change. See [Write Property-Based Tests](guidelines/testing.md#write-property-based-tests).
4. **Be ambitious.** When the unified design needs deeper work, do that work: research how other languages solved the problem, design a new algorithm, or rewrite the part of the engine that stands in the way. A larger change that removes exceptions is better than a smaller one that adds them.
5. **Report what you measured.** Give the numbers as they are, including the complexity that grew, the benchmark that got slower, and the exception that remains, and say why.
6. **Start from first principles.** For every task, reason from what it is for, not from what already exists. No format, file, kind, rule, or tool stays only because it is there: keep it when it still earns its place, and replace it when something simpler serves the goal better.
7. **Ask before undoing an intentional constraint.** When a change would undo something that looks deliberate, such as a recorded decision, a documented rule, a schema, or a format others rely on, ask the user first. Ask a short question with your recommendation; do not write a long plan for approval.

## Guidelines

> **IMPORTANT**: The guidelines in [`guidelines/`](guidelines/) are part of these instructions, kept out of this file so that it stays short. Before the work a guideline covers, read it in full: the lines here give each one's main rule and when to read it, not all it says.

- **[Designing features and semantics](guidelines/designing-features.md)**: read it before you add a feature or change how something behaves. Follow the principle of least astonishment: reuse the vocabulary Lion has, apply one rule everywhere, walk through how the change meets each existing feature, add it to the interop grid, and keep equivalent programs equivalent.
- **[Documentation](guidelines/documentation.md)**: read it before you report a change done. Every feature a change adds is used in an example in the docs, with output that was run. After every change to what Lion does, run the documentation procedure there, in order, starting with `bun run compare main --docs`.
- **[Recording changes and decisions](guidelines/recording-changes.md)**: read it before you commit a change, make a design decision, or release. Every change and decision is recorded as claims in `history/notes/`. `CHANGELOG.md`, `DECISIONS.md`, and `docs/changelog.html` are written from them with `bun run history write`, and never edited by hand.
- **[Measuring complexity](guidelines/measuring.md)**: read it before you call a change to `@lionlang/core` done. Measure the code, the semantics, the speed, and the growth beside `main`, aim for the numbers to go down, and report them as they are.
- **[Testing](guidelines/testing.md)**: read it before you write or change a test. New behavior gets property-based tests with `it.prop` or `it.effect.prop`, not tests with fixed example inputs, and every bug gets the property it breaks.
- **[Code style](guidelines/code-style.md)**: read it before you write TypeScript. It gives the compiler flags, the formatting, the order of imports, the naming, and where files go.
- **[Effect and React patterns](guidelines/patterns.md)**: read it before you write Effect or React code, compile a special form, handle an error, or add a UI component.
- **[Improving Lion by experiment](guidelines/improving.md)**: read it before you try to improve a score of Lion's. Record each experiment in `improvement/` as it happens: what you expect before the run, then `bun run loop observe`. The record judges with the published Lion, and an experiment never changes what scores it.
- **[Researching](guidelines/researching.md)**: read it before any research run. Every run adds to the one research model in `research/`. It starts from what earlier runs established, reuses their vocabulary, and proves its conclusions with Lion programs kept in `research/probes/`. It is committed with its sources.

Keep this file and `CLAUDE.md` under 200 lines each. What a practice needs beyond its main rule goes in its guideline, and a new practice gets a guideline and a line here.

## Build, Lint, and Test Commands

All commands should be run from the root directory using Turbo:

> **IMPORTANT**: NEVER use `npx` or `npm` commands. Use `bun` or `turbo` instead.

```bash
# Install dependencies for all workspaces
bun install

# Run all tests across all packages
bun run test

# Build all packages
bun run build

# Run linting and formatting check (ultracite)
bun run check

# Fix linting and formatting issues
bun run fix

# Prepare development environment (installs the git hooks)
bun run prepare

# Measure complexity, speed, growth, and how well the tests catch broken code
bun run measure --against main
bun run bench --against main
bun run scale --against main
bun run mutate

# The tests, checks, and mutations a change can reach, from a map of what each test reached
bun run affected --map
bun run affected --run
bun run mutate --affected

# The improvement record: what it says now, and an experiment's scoreboard
bun run loop status
bun run loop observe <label> --tries <direction>
```

### Package-Specific Commands

For running commands in a specific package, use Turbo's filter syntax:

```bash
# Run tests for a specific package
turbo test --filter=@lionlang/core
turbo test --filter=@lionlang/repl
turbo test --filter=@lionlang/metrics

# Run dev server for repl package
turbo dev --filter=@lionlang/repl

# Run typecheck for core package
turbo typecheck --filter=@lionlang/core
```

## Commit Guidelines

- Use conventional commit format when possible
- For a change to `@lionlang/core`, state the measured change in complexity and speed in the commit message
- Run tests and linting before committing
- Ensure type checking passes
- For multi-package changes, test both packages

## Development Workflow

1. **Before coding**: Run `bun install` and `bun run prepare`
2. **During development**: Use `turbo dev --filter=@lionlang/repl` for REPL development
3. **Before committing**:
   - Run `bun run check`
   - Run `bun run test`
   - Run `bun run build`
   - For a change to `@lionlang/core`, run `bun run measure --against main`, `bun run bench --against main`, and `bun run scale --against main`, and `bun run mutate --in <the files you changed>` when you added behavior
   - Run [the documentation procedure](guidelines/documentation.md#after-every-change-the-documentation-procedure): `bun run compare main --docs`, the search for sentences the change made untrue, an example for each new feature, and `bun run --cwd packages/site-runtime docs`
   - Record the change, and any design decision, as claims in `history/notes/`, then run `bun run history write` and `bun run history check`, and list or settle any new finding it reports (see [Recording Changes and Decisions](guidelines/recording-changes.md#recording-changes-and-decisions))
4. **After changes**: Update this AGENTS.md if development practices change, and the guideline that states the practice

## Completion Proof

- After a change to something people see, such as the graph editor, the website, or a rendered page, **capture a screen recording** of the changed interaction working end to end, and provide it with the final response. Screenshots and logs may supplement the recording but never replace it. Do not commit proof into git.
- For a change to the language, the CLI, the tools, or the docs' text, the proof is what ran: the properties that fail without the change, the output of `bun run compare` for the programs the change affects, and the measurements. Report them as they are in the final response.
- Do not claim completion without the proof the change calls for.

---

*This document should be updated whenever development practices, tooling, or code standards change in the Lion project.*
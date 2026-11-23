# The capability corpus

Tasks for Lion's three pillars, general computation, logic programming, and formal proofs, each with a Lion lambda that judges what a program gives. `bun run capability` grades them and prints how many of each pillar pass; see the [metrics README](../README.md#capability-bun-run-capability). The corpus measures what Lion can do, so that a change's cost in code and in what a programmer must know can be weighed against what it buys.

## Layout

| Path | What it holds |
| --- | --- |
| `tasks/<id>.json` | one task |
| `solutions/<id>.json` | the reference program of a task: a Lion program that solves it |
| `gaps.json` | `{"<id>": "what Lion lacks"}` for each task Lion cannot express yet |
| `task.json` | the Lion schema every task must fit |

The held-out corpus has the same layout, in a folder outside the repository that `LION_HELD_OUT` names. Only the grader reads it, and only its scores leave it. Its tasks are the user's: nothing in the repository writes them.

## The outside suites

Each folder of [`../suites/`](../suites/) holds a suite with this layout, its tasks drawn from a benchmark of another field, so that Lion is measured by what others measure their tools with and not only by tasks written for it. `bun run capability` grades each suite by its reference programs and prints its score beside the public tasks'. Their ids start with the suite's name and must not repeat an id of another suite.

| Suite | Tasks | Where they come from |
| --- | --- | --- |
| `openrulebench` | transitive closure with no argument bound and with the first bound, Join1, and DBLP | OpenRuleBench (Liang, Fodor, Wan, and Kifer, 2009), as Brass and Stephan, *Experiences with Some Benchmarks for Deductive Databases* (2017), describe it. The data is generated from a fixed seed, smaller than the benchmark's, and each expected answer was computed apart from Lion and is written in the check. |
| `sv-comp` | `loop-acceleration/simple_1`, `diamond_1`, and `count_by_1` | SV-COMP's benchmark set, ReachSafety, property unreach-call. A program is a function of an assertion that says whether every run that leaves the loop meets it, so the check asks it of the benchmark's assertion, and of assertions a guess would get wrong, without running the loop. |

A suite records any remaining gaps in `gaps.json` as the corpus does. Every task in `openrulebench` and `sv-comp` currently has a passing reference program.

## A task

```json
{
  "id": "sicp-ex-2.18-reverse",
  "pillar": "computation",
  "statement": "Define a function of a list that gives its items in reverse order. The program's value is the function.",
  "inputs": {},
  "check": ["lambda", ["reverse"],
             ["and",
               ["=", ["reverse", ["quote", [1, 4, 9, 16, 25]]], ["quote", [25, 16, 9, 4, 1]]],
               ["=", ["reverse", ["quote", []]], ["quote", []]],
               ["=", ["reverse", ["quote", [["a"], "b"]]], ["quote", ["b", ["a"]]]]]],
  "tags": ["lists", "recursion"],
  "origin": "SICP Exercise 2.18"
}
```

- `id` is the file's name, and says where the task comes from: `sicp-ex-2.18-…` for an exercise of SICP, `r7rs-6.10-…` for a section of R7RS-small, `datalog-…` for a classic Datalog query, `lion-…` for a proof Lion's README shows.
- `pillar` is `computation`, `logic`, or `proofs`.
- `statement` says, in words, what the program must give. It is what an agent is given.
- `inputs` binds names that the program and the check both see, such as a graph's edges: `{"edges": [["a", "b"], ["b", "c"]]}`.
- `check` is Lion that gives a function of one argument, what the program gave. The task is passed when the check gives `true`, and failed when it gives anything else or fails.
- `tags` are the features of Lion a program needs, and `origin` where the task comes from.

A program is graded in three runs. The program runs first, with the inputs bound, in a database of its own. The check is made in a run of its own, so a name the program defines or a relation it declares never changes what a string in the check means. The check is then called in the program's database, so a function the program gives can ask the relations the program declared.

## Writing a task

- **Ask for a function where a value could be copied.** A check that compares the program's value with a constant passes a program that is the constant. When the inputs would let someone work the answer out by hand, ask for a function, and have the check call it on inputs of its own, as `sicp-ex-2.18-reverse` does, or on candidates that tell a proof from a guess, as the proofs tasks do: `math-maximum-is-least-upper-bound` gives its function a candidate that is wrong only past a million, which no bounded test would see.
- **Let Lion compute the expected answer** where it can: `sorting-merge-sort` compares with `aggregate/collect`, and `recursion-towers-of-hanoi` plays the moves it is given.
- **Compare in any order** with `aggregate/unique` or `aggregate/collect` on both sides when the statement says the order does not matter.
- **Run the reference program** with `bun run capability` before you commit it. The tests fail when a reference program does not pass, and when a check passes a generated value that is not what the reference program gives.
- **Record a gap, never bend a task.** When Lion cannot express a task yet, leave the task as it is, give it no reference program, and say in `gaps.json` what Lion lacks. When Lion can, remove the gap and add the program.

---
name: lion-reasoning
description: Keep a Lion logic model of what you have observed and what you believe while you work, so a belief the evidence contradicts, evidence that went out of date when a file changed, and a claim that rests only on what you were told are caught as they happen, not in your final answer. Use it for work where a wrong belief is costly or easy to slip in. That includes debugging and finding the cause of a failure, a change that has to be verified across many places, auditing docs, notes, or memory against the code, mapping how parts of a system depend on each other, making a number better (a benchmark, a size, a test or eval score) by experiments you keep or revert, tuning a prompt, a skill, or an agent's harness against evals and carrying what you learned to a new model or benchmark, and any task long enough that your context will be summarized before it ends. Use it even when the user never mentions Lion or a model. Skip it for a task a few tool calls settle.
---

# Reasoning with a Lion model

Lion is a JSON-based Lisp with a Datalog logic layer: facts, rules, queries, schemas, aggregates, graph algorithms, and an explanation for every derived answer. This skill uses it as the working memory of your reasoning while you do a task.

You keep a **model**: what you saw, with the words that showed it, and what you believe, with what each belief predicts. Rules derive the rest. The model then tells you things you would otherwise have to remember to check:

- **Evidence that is out of date.** Every observation records the files it depends on, by content hash. When one changes, through your edit, the user's, or a pull, the observation stops counting as the present. "The tests pass" from before your last edit is not evidence that they pass now.
- **Beliefs the evidence contradicts.** A belief predicts answers to questions. When an observation answers one of them differently, the belief is contradicted, whether or not you were thinking about it at the time.
- **What would tell two explanations apart.** When rival explanations of a problem predict different answers to a question nobody has checked, that question is the next experiment to run.
- **What you only heard.** What you ran or read yourself overrules what you were told or recalled, and the model lists every time it did, so a wrong doc, note, or memory surfaces instead of being silently ignored.
- **Reasons.** `why` on any conclusion gives the observations it rests on, each with its quote, so you can say exactly what a claim stands on.

The model survives what your context does not. When the conversation is summarized, the model still holds every observation, belief, and verdict, and a later turn or session can ask it.

## When to use it, and when not

Use it when being wrong would cost more than a few minutes of bookkeeping. Bugs whose cause is not obvious, changes that must hold in many places, audits, investigations, and long tasks are where it pays.

It pays most where what you observed is expensive to observe again, such as an eval, a benchmark, or a slow run, and nothing else says which files changed since: uncommitted work in the files, a shared working tree, a stash, a folder outside git. In the eval `evals/rechecks-what-changed`, where two sessions check documented eval scores and prompts change between them in that way, every run with this skill was right, against none with plain notes and one in four with no record. Where git or the files' times date the changes, or a fact costs nothing to check again, plain notes and no record did as well, for a third to a half of the cost.

Do not use it for a task that a few tool calls settle, or for a question you can answer by reading one file. If you notice an hour has passed in the model and nothing in the task moved, the balance is wrong: the task is the work, and the model is what keeps it honest.

## Before you start

You need `node` or `bun`, and network access the first time, since the scripts run the published Lion CLI (`bunx @lionlang/cli@latest`, or `npx` without bun). They never use a copy of Lion in the project, so the checker keeps working even while you change Lion itself. `LION_CLI` names another command.

The scripts live in this skill's `scripts/` folder; below, `<skill>` is this skill's folder. Run them with `node`. Read [references/lion.md](references/lion.md) before you write your first rule, and [references/patterns.md](references/patterns.md) for tested rules for debugging, verifying a change, audits, and dependencies.

## The task folder

```bash
node <skill>/scripts/start.mjs <task-name>     # at the root of the project
cd .lion/<task-name>
```

`start.mjs` makes the folder, adds `.lion/` to the repository's own ignore list (`.git/info/exclude`, so no tracked file changes), and builds the first model. All the other scripts run inside the task folder:

```text
.lion/<task>/
  steps/        every program that changed the model, in order; 00-core.json first
  notes/        what you observed and believe, as plain JSON, one file per step
  seen/         the text of everything you observed: <source id>.txt
  versions/     the project's files by content hash, each time you observed
  checks.json   your standing questions
  model.json    built from the steps; never edited by hand
```

`steps/` is the source of truth. Rules and beliefs cannot be taken out of a model, so to change one you edit its step and run `node <skill>/scripts/replay.mjs`, which rebuilds the model from every step in one run and keeps the old model if a step fails.

## What you record

Everything goes in through notes: plain JSON that `record.mjs` checks and turns into a step. Nothing in notes needs quoting or escaping.

### Sources and observations

A **source** is where you looked. Its `kind` says how directly it shows what you take from it:

| kind | means | examples |
|---|---|---|
| `ran` | you ran something and saw its output | tests, a script, a query, `grep` |
| `read` | you read the thing itself | a source file, a config, a log |
| `told` | someone stated it | the user, a doc or comment about behavior, an issue, another agent's report |
| `recalled` | your own earlier note | memory files, a summary of earlier work, a previous session |

A README that says what a function returns is `told`: the author is telling you. Reading the function is `read`. Running it is `ran`.

An **observation** is one thing a source showed, as a **question** and its **value**, with the **quote** that shows it, copied word for word from the source's text:

```json
{"id": "o1", "source": "t1", "quote": "Tests  2 failed | 41 passed",
 "question": {"failing tests": "core"}, "value": 2}
```

When the words that show it are not printed together, such as the lines of a list, the quote can be a list of quotes, each copied word for word.

The question is a record that names what was asked; the value is the answer. Choosing the question is the modeling decision: two observations agree or disagree only when they answer the same question. Put in it everything that makes two observations comparable, and make the value what could differ. Keep values computable: numbers as numbers, lists as lists, `true` and `false` for facts that hold or not.

**Run commands through `see.mjs`.** It runs the command at the project's root, prints its output, saves it with its exit status as `seen/<id>.txt`, and records which version of the files it ran against:

```bash
node <skill>/scripts/see.mjs t1 --about packages/core -- bun run test
```

`--about` lists what the output depends on; without it, the whole project. Name it as narrowly as is true: a test of one package depends on that package, but if it imports others, list them too, or leave `--about` out. A source run this way needs no entry in the notes' `sources`. Versions keep the files git tracks and the new ones it does not ignore, never the task folder's own, wherever it is, so recording notes never makes a new version; a path git ignores, such as build output, and a path outside the project are hashed from disk as they are now.

Run a check of the old code against a copy of it, not by undoing your change in place: the result depends only on the old code, which does not change, and on what you bring to it, such as a new test. See "Checking a test against the old code" in [references/patterns.md](references/patterns.md).

For a file you read, list the source with `"kind": "read"` and the path as `what`; its quotes are looked for in that file and it depends on that file. For what you were told or recalled, save the words as `seen/<id>.txt` first, and give it an `about` when it talks about files: a note that says "parse returns null" is about the file `parse` lives in, and should go out of date when that file changes.

### Problems and beliefs

A **problem** is something wrong that you can observe, as the question and value that show it:

```json
{"id": "lambda-first", "statement": "Loading the lambda module first throws",
 "question": {"loads first": "special-forms/lambda"}, "value": "throws"}
```

A **belief** is anything you hold true that evidence could overturn: a hypothesis about a cause, an assumption about the code, an expectation about a change. It **predicts** answers to questions, and may **explain** problems:

```json
{"id": "cycle", "statement": "A circular import leaves the table half built",
 "predicts": [{"question": {"imports the evaluator": "special-forms/lambda"}, "value": true},
              {"question": {"loads first": "evaluation/evaluate"}, "value": "works"}],
 "explains": ["lambda-first"]}
```

Write a belief down **when you form it**, before the evidence that tests it arrives. A belief written first can be overturned; one written afterwards only describes what you already found. Give every belief at least one prediction that a single observation could contradict; a belief that predicts nothing is never tested.

Which evidence judges a belief:

- **A belief is about the project from the version you formed it in on.** Evidence from that version or any later one can contradict it, and once contradicted it stays contradicted, even after the files change again. An assumption such as "nothing else calls `total`" is caught by the edit that adds a caller, and a belief you disproved before a fix does not come back after it.
- **A belief that explains a problem is about the project where the problem shows.** It is judged in those versions only, so once you fix the problem, the fixed code does not count against the explanation of the old code. Its predictions should be about that project too: what the code does there, what an experiment on it shows. Put what the fix will do in a separate belief.
- **An expectation about a change is a belief about the changed project.** Record it after you make the change and before you check it, such as "with the table built lazily, every module loads first". Recorded before the change, it is judged against the unchanged project too, and the bug you are about to fix contradicts it. When the change is an experiment of a direction, say which direction it `tries`: see [What an experiment was expected to fix](#what-an-experiment-was-expected-to-fix).

When a belief needs more than predictions to be tested, such as "no test covers this", add a rule for `violated` in a step of your own; see [references/patterns.md](references/patterns.md).

### What the task needs

`needed` lists questions that observations should answer before you are done, such as `{"passes": "full test suite"}` or `{"builds": "docs site"}`. The model lists the ones no current observation answers.

### What only the user decides

Some questions are not yours to settle: what the user wants when the request allows two readings ("make the build faster": the development build or the release build?), a trade-off that is theirs to make, a word in the task that means two things. Answering one yourself and carrying on is the mistake that breaks everything built on it, and it never shows as a contradiction, because nothing you observe can disagree with a choice.

List each such question in the notes under `ask`, with whose word settles it, the user unless you say otherwise:

```json
{"ask": [{"question": {"build to speed up": "which"}, "of": "user"}]}
```

Then ask. When the user answers, save their words as `seen/user.txt` and record them as an observation of the source `user`, kind `told`. Until then the question is `undecided`. If anything else answers it, a file you read, a command you ran, a doc, or your own guess, it shows as `presumed`, so a choice you made for the user is listed instead of hidden. Their answer is about what they want, not about the files, so it does not go out of date when files change.

Say you read `package.json` and recorded that the build to speed up is the release build. Before the user answers, the standing checks give:

```json
{"What must the user decide, that they have not?": [{"question": {"build to speed up": "which"}, "of": "user"}],
 "What did I settle that was the user's to decide?": [{"question": {"build to speed up": "which"}, "value": "release", "observation": "o1"}]}
```

Once they say "the dev server, it takes 40 s to start", recorded as the value `development`, the first list is empty, and the second still names `o1`: the release build was your guess, and it was wrong.

### Scores and directions

When the task is to make a number better, such as a benchmark's time, a bundle's size, or an eval's grade, declare the number a **score** and the ideas you will try as **directions**. The model then keeps the record of an experiment loop: each experiment is a version of the files with its runs, a version counts as an improvement only when it beats the best so far, and a direction that keeps missing is set aside, so you spend the next experiment where the evidence says it pays.

```json
{"scores": [{"question": {"comparisons": "bench.mjs"}, "better": "lower",
             "requires": [{"question": {"failing tests": "test.mjs"}, "value": 0}]}],
 "directions": [
   {"id": "insertion", "statement": "Insert each item into the sorted part before it", "patience": 2},
   {"id": "early-exit", "statement": "Stop a pass as soon as the rest is in order", "patience": 1},
   {"id": "binary", "statement": "Find each item's place in the sorted part by binary search", "patience": 2},
   {"id": "built-in", "statement": "Use the built-in Array sort",
    "needs": [{"question": {"may use built-ins": "sort.mjs"}, "value": true}]}],
 "ask": [{"question": {"may use built-ins": "sort.mjs"}, "of": "user"}]}
```

- A score's **question** holds everything that makes two runs comparable: the command, its input, the machine, and the budget, such as `{"val_bpb": "train.py", "minutes": 5}`. A run under another budget answers another question, so the two are never compared.
- **`better`** is `lower` or `higher`.
- **`requires`** lists the answers a version must have for its runs to count, such as no failing tests. Where a requirement is unanswered or answered otherwise, the version has no score, so a change that breaks the tests can never become the best.
- A **direction** is an idea you will try. Its **`patience`** is how many experiments in a row it may make without paying off before it is set aside, 3 unless you say. An experiment that pays off starts the count again.
- **`addresses`** lists the problems a direction is meant to fix, such as `"addresses": ["spaces"]`, so the model can say what was tried for each problem and which problems have no direction left.
- **`needs`** lists the answers a direction depends on. While such a question is unanswered, or not yet decided by whoever `ask` names, the direction waits; once it is answered otherwise, the direction is ruled out. A choice that is the user's goes here, so their answer prunes the directions.

An experiment is a change to the files, then a run of the score with `see.mjs`, recorded as an observation that **`tries`** the direction. Run what the score requires on the same files, and record it in the same notes:

```json
{"observations": [
  {"id": "o3", "source": "b1", "quote": "comparisons: 117", "question": {"comparisons": "bench.mjs"}, "value": 117, "tries": "insertion"},
  {"id": "o4", "source": "t1", "quote": "tests: 0 failed of 7", "question": {"failing tests": "test.mjs"}, "value": 0}]}
```

How the model judges, for each version of the files:

- **A score's runs in a version are its range.** Run it again to see how far it moves; runs of a score that differ are its spread, not a dispute.
- **What a version is sure to give is its worst run.** The **best** is the best of those across versions, so one lucky run never becomes the best.
- **A version improves a score when even its worst run beats the best that any version before it was sure to give.** With one run each, that is beating the best so far. With several, the improvement has to clear the noise on both sides, and a later run of an earlier version can take an improvement back: the verdicts follow the evidence, not the order it came in. Run the score the same number of times on each version, since a version run once has a worst run that is its only one.
- **An experiment is the version its run was made on.** It pays off when that version improved a score or fixed a problem one of its beliefs targeted (see [What an experiment was expected to fix](#what-an-experiment-was-expected-to-fix)), and misses otherwise.

When an experiment misses, put the files back with git. Once they hold what they held before, the runs made on them speak for the present again, so the score is known without running it again.

After an early exit that cut the comparisons to 27 but failed a test, the standing questions in this example gave:

```json
{"Which versions' scores do not count, because a requirement is not met?": [
   {"version": "v0003", "score": {"comparisons": "bench.mjs"}, "question": {"failing tests": "test.mjs"}, "needed": 0}],
 "What is the best each score is sure to give, and in which version?": [
   {"score": {"comparisons": "bench.mjs"}, "best": 117, "version": "v0002"}],
 "Where should the next experiment go?": [
   {"direction": "insertion", "tried": 1, "paid_off": 1, "misses": 0},
   {"direction": "binary", "tried": 0, "paid_off": 0, "misses": 0}],
 "Which directions are set aside, and why?": [
   {"direction": "built-in", "why": {"waits for": {"may use built-ins": "sort.mjs"}}},
   {"direction": "early-exit", "why": {"missed in a row": 1}}]}
```

The 27 does not count, the best is still insertion's 117, and the early exit used up its patience. Binary search then brought the best to 62, and when the user said "No built-ins, please", `built-in` moved from waiting to ruled out: `{"needs": {"may use built-ins": "sort.mjs"}, "to be": true, "but is": false}`. `why` on a payoff ends in the runs it compared: `["why", ["paid_off", "binary", "v0004", ["quote", {"comparisons": "bench.mjs"}]]]` reaches the observations of 62 and 117 and the check `["number/lessThan", 62, 117]`.

"Where should the next experiment go?" lists the live directions, those that paid off most first, then those tried least. It is advice, not an order: choose with your judgment, and say why when you go against it.

### What an experiment was expected to fix

A score says whether a change helped. It does not say whether the change did what you made it for. So before you run an experiment, write down what you expect of it: a belief that **`tries`** the direction, with the answers it predicts. A function that makes URL slugs failed two of an eval's five titles, each recorded as a problem, and the first idea was to turn each run of other characters into one dash:

```json
{"problems": [
   {"id": "spaces", "statement": "Two spaces in a row give two dashes",
    "question": {"case": "double spaces", "suite": "titles"}, "value": "fail"},
   {"id": "mark", "statement": "A mark at the end leaves a dash at the end",
    "question": {"case": "trailing mark", "suite": "titles"}, "value": "fail"}],
 "directions": [
   {"id": "collapse", "statement": "Turn each run of other characters into one dash", "addresses": ["spaces"]},
   {"id": "trim", "statement": "Drop dashes from both ends", "addresses": ["mark"]}]}
```

```json
{"beliefs": [
  {"id": "collapse-1", "tries": "collapse",
   "statement": "With runs turned into one dash, both failing titles pass",
   "predicts": [{"question": {"case": "double spaces", "suite": "titles"}, "value": "pass"},
                {"question": {"case": "trailing mark", "suite": "titles"}, "value": "pass"}]}]}
```

Record the belief after you make the change and before the run, then record what the run showed, with `"tries": "collapse"` on the run of the score.

- **A belief that tries a direction is judged in the version it was recorded in, and no other.** It says what that change does. What the files show after you put them back, or after the next experiment, neither confirms nor contradicts it.
- **An experiment targets a problem** when its belief predicts the problem's question otherwise than the problem shows. The direction then addresses that problem, whether or not it said so.
- **The problem is fixed** where the version answers as predicted, and **not fixed** where it answers otherwise. Until a run in that version answers, it is not checked.
- **An experiment that fixes a problem it targets pays off**, as one that improves a score does, and `paid_off` names the problem's question. A change made to fix something is judged by whether it did, so a direction that fixes what it aimed at is never set aside for leaving the scores where they were.

The eval then printed `pass: double spaces` and `fail: trailing mark`, and the standing questions gave:

```json
{"What was each experiment expected to fix, and did it?": [
   {"direction": "collapse", "version": "v0002", "problem": "spaces", "came": "fixed"},
   {"direction": "collapse", "version": "v0002", "problem": "mark", "came": "not fixed"}],
 "Which beliefs does the evidence contradict?": [{"belief": "collapse-1", "witness": "t2-mark"}]}
```

The score went from 3 to 4, and the experiment fixed `spaces`, so it paid off twice over, and half of what it was expected to do did not happen. Both stay in the model with the run that showed them, so the next idea for `mark` starts from what was tried. `["why", ["unfixed", "collapse", "v0002", "mark", "fail", "t2-mark"]]` ends in the prediction, the problem, and the quote `fail: trailing mark`.

### A new model, benchmark, or machine

A score's question holds what makes two runs comparable, so when the model that runs an eval changes, or the benchmark, the machine, or the budget, that is another question: declare it as another score. Runs of the old score are never compared with runs of the new one, and a direction's experiments say nothing about a score that none of them ran with an earlier version to beat. Its record is **carried** over to the new score, not confirmed there.

After `trim` had brought the titles to 5 of 5, a second suite, of people's names, was declared as a score and run on the files as they were. It gave 2 of 4, and:

```json
{"Which directions' experiments say nothing about a score, because none ran it with an earlier version to beat?": [
   {"direction": "collapse", "score": {"passed": "eval.mjs names"}, "tried": 1, "paid_off": 1, "misses": 0},
   {"direction": "trim", "score": {"passed": "eval.mjs names"}, "tried": 1, "paid_off": 1, "misses": 0}]}
```

Both paid off on the titles, and nothing yet says either helps with names. To judge a carried direction on the new score, run the new score on the version before its experiment and on the experiment's version: put those files back with git, run it with `see.mjs`, and put the present back. The runs speak for the versions whose files they ran on, and the verdicts follow the evidence, not the order it came in. Here the first version gave 1 of 4 and the second 2 of 4, so `improved` gained `{"score": {"passed": "eval.mjs names"}, "version": "v0002", "before": 1, "after": 2}`: `collapse` paid off on names too, `trim`, whose version gave the 2 the one before it already gave, did not, and the list was empty. A direction that was set aside under the old score stays set aside; when it is carried, its misses were all on another score, which is a reason to try it once more on the new one.

### Recording

```bash
node <skill>/scripts/record.mjs notes/03-tests.json
```

It refuses notes with a quote that is not in its source's text, word for word, and writes nothing. Otherwise it writes `steps/03-tests.json` and rebuilds the model; if the model refuses the step (an observation of a source that does not exist, a belief explaining an unknown problem), the step is taken back and the error says which row and why. Number the notes so they sort in the order you made them.

Record what you observe before you change what it depends on. `see.mjs` hashes the files when the command runs, but a file you read is hashed when you record it.

## What the model derives

| Relation | Tells you |
|---|---|
| `answer(question, value, observation)` | The present answer to a question: observations whose files are unchanged, minus what you were told or recalled that what you saw contradicts. |
| `stale(source, path)` | Evidence whose file changed since. Its observations no longer count as the present. |
| `changed(question, before, after)` | Questions answered differently now than in an earlier version: what your work changed. |
| `disputed(question, values)` | Current observations that disagree. Two runs or two reads that differ are a finding: flakiness, two versions, or a misreading. The runs of a score are left out: they have a spread instead. |
| `overruled(observation, by)` | What you were told or recalled, contradicted by what you ran or read. |
| `hearsay(question, value)` | Present answers that rest only on what you were told or recalled. |
| `contradicted(belief, question, predicted, found, observation)` | A prediction the evidence answered otherwise, in a version that judges the belief. |
| `violated(belief, witness)` | A belief with evidence against it: every contradiction, and whatever rules of yours add. |
| `holds(belief)` | Beliefs with no evidence against them. |
| `borne_out(belief, question, value, observation)` | Predictions the evidence confirmed. |
| `untested(belief, question, value)` | Predictions of standing beliefs that nothing has answered. |
| `decisive(problem, question, predictions)` | Questions the standing explanations of a problem answer differently, that nothing has answered yet: the experiments that would tell them apart. |
| `remaining(problem, beliefs)` | The explanations of a problem still standing. |
| `settled(problem, belief)` | A problem with one explanation left, every prediction of which the evidence bore out. |
| `unexplained(problem)` | A problem whose every explanation failed. You need a new one. |
| `open(question)` | What the task needs and no current observation answers. |
| `undecided(question, of)` | A question only `of` may settle, usually the user, that they have not answered. Ask them. |
| `presumed(question, value, observation)` | An answer to such a question from anyone else: a choice made for the user. |
| `score_in(version, question, best, worst)` | A score's best and worst run in a version, for versions that meet what it requires. `now` is the files as they are. |
| `best(question, value)` | The best a score is sure to give: of every version's worst run, the best. One lucky run never becomes the best. |
| `improved(question, version, before, after)` | Versions whose worst run, `after`, beats `before`: the best that any earlier version was sure to give. |
| `regressed(question, now, best)` | Every run of the files as they are now is worse than the best: put the best version back, or say why not. |
| `unmet(version, score, question, needed)` | A version whose runs of a score do not count, because what the score requires is unanswered there or answered otherwise. |
| `experiment(direction, version)` | The versions a direction was tried on. |
| `paid_off(direction, version, question)` | Experiments that improved a score, or fixed a problem they targeted: the question is the score's or the problem's. |
| `exhausted(direction)` | Directions that missed as many times in a row as their patience. |
| `blocked(direction, question)` | Directions waiting for an answer they need: one nobody has given, or one only the user may give. |
| `ruled_out(direction, question, needed, found)` | Directions whose need is answered otherwise. |
| `live(direction)` | Directions that are not exhausted, blocked, or ruled out. |
| `progress(direction, tried, paid_off, misses)` | Each direction's experiments, payoffs, and misses since its last payoff. |
| `addresses(direction, problem)` | The problems a direction is meant to fix: those it says, and those an experiment of it targets. |
| `targets(direction, version, problem, belief)` | What an experiment was expected to fix: a belief that tries the direction, formed in that version, predicts the problem's question otherwise than the problem shows. |
| `fixed(direction, version, problem, observation)` | A targeted problem the version answers as predicted. |
| `unfixed(direction, version, problem, found, observation)` | A targeted problem the version answers otherwise: the experiment did not do what it was expected to. |
| `carried(direction, score)` | A direction with experiments, none of which ran the score in a version with an earlier version to beat: its record says nothing about that score. |

## The loop

1. **Start** the task folder. Write down the problem if there is one, what you believe going in, and what the task needs. Record them.
2. **Observe.** Run things with `see.mjs`, read files, and record what each showed, in small batches. Record surprises especially: an observation that matches no belief is often the one that matters.
3. **Ask** after every batch, and whenever you are about to rely on something:

   ```bash
   node <skill>/scripts/ask.mjs
   ```

   With no argument it runs `checks.json`, the standing questions, against the project as it is now. A question can also be a file or JSON given on the command line:

   ```bash
   node <skill>/scripts/ask.mjs '["query", ["answer", {"failing tests": "?pkg"}, "?n", "?_"]]'
   ```

   A question never changes the model, so a question that adds facts asks "what if" and is forgotten.
4. **Let the answers steer you.**
   - A **decisive** question: run that experiment next.
   - A **contradicted** belief: either the evidence is wrong or you were. Look at the witness. Never delete a belief to make the contradiction go away; an overturned belief is a finding.
   - **Stale** evidence you are relying on: observe again.
   - An **overruled** note, doc, or memory: the thing it described changed, or it was wrong. Say so, and fix it if it is yours to fix.
   - **Unexplained**: every explanation failed. Form a new one from what the evidence does show.
   - **Disputed**: find out why before you pick one.
   - **Undecided**: stop and ask the user before any work depends on it. If you cannot ask, say in your answer which way you went and that it was their call.
   - **Presumed**: you, a file, or a doc settled what was the user's to decide. Ask them, and say so.
   - **Regressed**: the files do worse than the best version. Put the best back, unless the change is one the task needs anyway.
   - **Unmet**: a version's score does not count, because what it requires failed there. Fix the change or drop it; never relax the requirement to let a score count.
   - **The next experiment**: try a direction from the list, and record the run as an experiment of it. A direction set aside stays in the model, with why.
   - **Not fixed**: the experiment did not do what you expected, even if the score improved. Say so, and let the next idea for that problem start from what the run showed.
   - **A problem with every direction set aside**: it still shows and nothing live addresses it. Form a new direction, or say it is left open.
   - **Carried**: the direction's record comes from another score, such as another model or benchmark. Judge it on this one before you rely on it or rule it out.
5. **Grow the model.** When you form a belief, record it then. When you check the same thing by hand a second time, write a rule that derives it (a step of your own, then `replay.mjs`). When you meet a kind of fact the checks do not cover, add a question to `checks.json`.
6. **Change things.** Edit, fix, refactor. The model notices by itself: what depended on the files you changed goes out of date, and the next `ask` shows it.
7. **Verify** by observing again after the change. `changed` shows what your work changed, and `open` shows what is still unverified.

## Concluding

Before you tell the user what you found or did:

1. **Ask the standing questions once more**, after your last change.
2. **Answer from the model.** Every finding you state should be a row the model derives now. Run `why` on each one you lead with, and cite what is at its leaves:

   ```bash
   node <skill>/scripts/ask.mjs '["why", ["settled", "lambda-first", "cycle"]]' \
     | jq -c '.. | objects | select(.given) | .fact'
   ```

3. **State the limits the model shows**: stale evidence you did not observe again, predictions still untested, problems not settled, what rests on hearsay, what was overruled, what `open` still lists, and what the user has not decided or what was decided for them (`undecided`, `presumed`). "Not verified since the last edit" is a fact worth stating. For scores, give the best and the version that holds it, how many runs each figure rests on, the directions still live, and those set aside with why, what each experiment was expected to fix and did not, and the directions whose record is only carried over to a score.

Keep the task folder. A follow-up question, a later session, or another agent can ask the model instead of starting over.

## What goes wrong

- **A conclusion typed in as an observation.** An observation is something a source showed, with its words. "I think the cache is the cause" is a belief; record it as one, with predictions.
- **A quote from memory.** The recorder refuses it. Copy from `seen/<id>.txt` or the file.
- **Recording after editing.** A file read before your edit and recorded after it is hashed as the edited file. Record first.
- **`--about` that is too narrow.** A test whose result depends on a file you did not list will not go out of date when that file changes. When unsure, leave `--about` out.
- **Beliefs written after the fact.** They describe the evidence instead of testing against it. Write each belief when you form it.
- **What the fix will do, inside an explanation.** An explanation is judged where its problem shows, so a prediction about the fixed code can never be checked there, and the problem is never settled. Make it a belief of its own, recorded after the change.
- **Undoing a fix in place to check the old code.** The run depends on files you then change back, so it is stale at once. Run the check against a copy of the old code.
- **What an experiment will do, recorded before the change.** A belief that tries a direction is judged in the version it was recorded in. Recorded before the change, that is the unchanged project, where the problem still shows, so every fix it predicts comes out not fixed. Make the change, then record it, then run.
- **A belief with no prediction.** Nothing can contradict it, so it always holds and tells you nothing.
- **Editing `model.json`.** The next replay undoes it. Change the step.
- **The model as the job.** Record what matters to the answer and what could overturn it, not every line you read.

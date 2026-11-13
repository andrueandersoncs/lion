---
name: lion-reasoning
description: Keep a Lion logic model of what you have observed and what you believe while you work, so a belief the evidence contradicts, evidence that went out of date when a file changed, and a claim that rests only on what you were told are caught as they happen, not in your final answer. Use it for work where a wrong belief is costly or easy to slip in. That includes debugging and finding the cause of a failure, a change that has to be verified across many places, auditing docs, notes, or memory against the code, mapping how parts of a system depend on each other, and any task long enough that your context will be summarized before it ends. Use it even when the user never mentions Lion or a model. Skip it for a task a few tool calls settle.
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

`--about` lists what the output depends on; without it, the whole project. Name it as narrowly as is true: a test of one package depends on that package, but if it imports others, list them too, or leave `--about` out. A source run this way needs no entry in the notes' `sources`. Versions keep the files git tracks and the new ones it does not ignore; a path git ignores, such as build output, and a path outside the project are hashed from disk as they are now.

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
- **An expectation about a change is a belief about the changed project.** Record it after you make the change and before you check it, such as "with the table built lazily, every module loads first". Recorded before the change, it is judged against the unchanged project too, and the bug you are about to fix contradicts it.

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
| `disputed(question, values)` | Current observations that disagree. Two runs or two reads that differ are a finding: flakiness, two versions, or a misreading. |
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

3. **State the limits the model shows**: stale evidence you did not observe again, predictions still untested, problems not settled, what rests on hearsay, what was overruled, what `open` still lists, and what the user has not decided or what was decided for them (`undecided`, `presumed`). "Not verified since the last edit" is a fact worth stating.

Keep the task folder. A follow-up question, a later session, or another agent can ask the model instead of starting over.

## What goes wrong

- **A conclusion typed in as an observation.** An observation is something a source showed, with its words. "I think the cache is the cause" is a belief; record it as one, with predictions.
- **A quote from memory.** The recorder refuses it. Copy from `seen/<id>.txt` or the file.
- **Recording after editing.** A file read before your edit and recorded after it is hashed as the edited file. Record first.
- **`--about` that is too narrow.** A test whose result depends on a file you did not list will not go out of date when that file changes. When unsure, leave `--about` out.
- **Beliefs written after the fact.** They describe the evidence instead of testing against it. Write each belief when you form it.
- **What the fix will do, inside an explanation.** An explanation is judged where its problem shows, so a prediction about the fixed code can never be checked there, and the problem is never settled. Make it a belief of its own, recorded after the change.
- **Undoing a fix in place to check the old code.** The run depends on files you then change back, so it is stale at once. Run the check against a copy of the old code.
- **A belief with no prediction.** Nothing can contradict it, so it always holds and tells you nothing.
- **Editing `model.json`.** The next replay undoes it. Change the step.
- **The model as the job.** Record what matters to the answer and what could overturn it, not every line you read.

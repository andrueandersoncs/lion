# Patterns for reasoning models

Ways to model the shapes reasoning usually takes. Each example was run with the skill's scripts on a small project, and the results shown are what the model gave. Copy a pattern into your notes or into a step of your own, and change its names.

## Contents

- [Finding the cause of a bug](#finding-the-cause-of-a-bug)
- [Verifying a change](#verifying-a-change)
- [Checking what you were told](#checking-what-you-were-told)
- [Assumptions a prediction cannot state](#assumptions-a-prediction-cannot-state)
- [A plan with dependencies](#a-plan-with-dependencies)
- [Improving a score that moves between runs](#improving-a-score-that-moves-between-runs)
- [What if](#what-if)

## Finding the cause of a bug

A small project prints `3 3` where it should print `3 5`. Record the run, the problem it shows, and each explanation you can think of, with what each predicts, before you look further:

```bash
node <skill>/scripts/see.mjs run1 --about src -- node src/main.js
```

```json
{"observations": [{"id": "o1", "source": "run1", "quote": "3 3",
                   "question": {"prints": "main"}, "value": "3 3"}],
 "problems": [{"id": "second-total", "statement": "The second total repeats the first",
               "question": {"prints": "main"}, "value": "3 3"}],
 "beliefs": [
   {"id": "cached", "statement": "total keeps its first result and returns it again",
    "predicts": [{"question": {"keeps a result": "total"}, "value": true},
                 {"question": {"prints in a fresh process": "total([5])"}, "value": "5"}],
    "explains": ["second-total"]},
   {"id": "mutated", "statement": "the first call changes the array the second call sees",
    "predicts": [{"question": {"keeps a result": "total"}, "value": false},
                 {"question": {"prints in a fresh process": "total([5])"}, "value": "5"}],
    "explains": ["second-total"]}]}
```

`ask.mjs` then names the experiment that tells them apart:

```json
"What would tell the remaining explanations apart?": [
  {"problem": "second-total", "question": {"keeps a result": "total"},
   "predictions": [{"belief": "cached", "predicts": true}, {"belief": "mutated", "predicts": false}]}]
```

Both predict that a fresh process prints 5, so running that would not help; reading `total` would. A read of `src/total.js` showing `cache ??=` answers it: `mutated` is violated, with the observation as witness, and one explanation remains. Its other prediction is still untested, so the problem is not yet settled. Running `total([5])` in a fresh process and recording `5` settles it:

```json
"Which problems are settled, and by which explanation?": [{"problem": "second-total", "explanation": "cached"}]
```

After the fix, the run prints `3 5`. The evidence about the old code is out of date, but `cached` still holds and the problem stays settled, because an explanation is judged in the versions of the project where its problem showed. `changed` records what the fix did: `{"question": {"prints": "main"}, "before": "3 3", "after": "3 5"}`. `why` on the settled row lists what it rests on: the problem, the belief, and observations `o1` and `o2` with their quotes.

- Put each explanation in before you test it. One you add after the evidence that decides it cannot lose.
- Give rivals predictions that differ. Two explanations that predict the same things cannot be told apart, and `decisive` stays empty.
- When every explanation is violated, `unexplained` lists the problem. Form a new explanation from what the evidence shows.

## Verifying a change

Name each test as a question whose answer is `true` or `false`, and list what must pass in `needed`:

```json
{"observations": [
   {"id": "o1", "source": "t1", "quote": "✓ parses numbers", "question": {"passes": "parses numbers"}, "value": true},
   {"id": "o2", "source": "t1", "quote": "✗ empty input gives null", "question": {"passes": "empty input gives null"}, "value": false}],
 "needed": [{"passes": "empty input gives null"}, {"passes": "parses numbers"}]}
```

Rules over `changed` and `answer` name what the change fixed, what it broke, and what fails now, in a step of your own:

```json
["begin",
  ["relation", "regressed", ["test"]],
  ["rule", ["regressed", "?t"], ["changed", {"passes": "?t"}, true, false]],
  ["relation", "fixed", ["test"]],
  ["rule", ["fixed", "?t"], ["changed", {"passes": "?t"}, false, true]],
  ["relation", "failing", ["test"]],
  ["rule", ["failing", "?t"], ["answer", {"passes": "?t"}, false, "?_"]],
  "rules"]
```

After an edit to `src/parse.js` and a new run, `["find", "?t", ["fixed", "?t"]]` gives `["empty input gives null"]`, and `regressed` gives `["parses lists"]`, which passed before the edit and fails after it. Until the new run is recorded, the old run is stale and `open` lists every test in `needed` again: nothing says they pass now.

### Checking a test against the old code

A new test should fail on the code before your fix. Do not check that by undoing the fix in place: the run would depend on files you then change back, so it goes stale at once and can never answer the question. Run it against a copy of the old code, and say it depends only on the test, since the old code in git does not change:

```bash
node <skill>/scripts/see.mjs old1 --about test/total.test.mjs -- \
  'old=$(mktemp -d) && git archive HEAD | tar -x -C "$old" && mkdir -p "$old/test" \
   && cp test/total.test.mjs "$old/test/" && cd "$old" \
   && node --test test/total.test.mjs 2>&1 | grep -E "(pass|fail) [0-9]"'
node <skill>/scripts/see.mjs new1 --about src --about test -- \
  'node --test test/total.test.mjs 2>&1 | grep -E "(pass|fail) [0-9]"'
```

```json
{"observations": [
   {"id": "o4", "source": "old1", "quote": "fail 1",
    "question": {"fails on the old code": "total.test.mjs"}, "value": true},
   {"id": "o5", "source": "new1", "quote": "fail 0",
    "question": {"passes": "total.test.mjs"}, "value": true}],
 "needed": [{"fails on the old code": "total.test.mjs"}, {"passes": "total.test.mjs"}]}
```

After a later edit to `src`, `open` gives `[{"passes": "total.test.mjs"}]`: the run on the new code is stale, and the run on the old code still answers its question, since the test it ran is unchanged. Edit the test, and both go stale, as they should. `git archive HEAD` is the last commit; when the old code is somewhere else, copy that instead.

## Checking what you were told

A doc, a comment, a note, or a memory is something you were told or recalled. Record it as such, with an `about` that names the code it describes, and record what the code shows when you read it:

```json
{"sources": [{"id": "doc", "kind": "told", "what": "docs/parse.md", "about": ["src/parse.js"]},
             {"id": "code", "kind": "read", "what": "src/parse.js"}],
 "observations": [
   {"id": "o4", "source": "doc", "quote": "parse returns null for empty input",
    "question": {"returns on empty": "parse"}, "value": null},
   {"id": "o5", "source": "code", "quote": "s === \"\" ? undefined",
    "question": {"returns on empty": "parse"}, "value": "undefined"}]}
```

The read overrules the doc: `overruled` gives `{"observation": "o4", "by": "o5"}`, and the present answer is `"undefined"`. The doc is wrong, or the code changed after it was written; either way it is a finding. When the code changes, the doc's observation goes out of date with the code it describes, and so does the read, so neither speaks for the new code until you look again.

To audit many claims, record each one as an observation of the note or doc, then read or run what would confirm it. Every claim the model lists as `overruled` is out of date or wrong, and every one under `hearsay` is still unchecked.

## Assumptions a prediction cannot state

A prediction says a question has one answer. Some beliefs say that something never shows up, or that two answers relate. Give such a belief a rule for `violated` in a step of your own, and record the belief there or in notes:

```json
["begin",
  ["fact", ["belief", "untested-lists", ["quote", "No test exercises lists with spaces around them"]]],
  ["rule", ["violated", "untested-lists", "?o"],
    ["answer", {"tests input": "?_"}, ["quote", " [1] "], "?o"]],
  "assumptions"]
```

It holds until an observation answers some `{"tests input": …}` question with `" [1] "`. The witness is the observation, so `why` shows its quote.

## A plan with dependencies

A plan is tasks, what each waits for, and when each is done. Make "done" a question an observation answers, so a task is done when the evidence says so and undone again if the evidence goes out of date:

```json
["begin",
  ["relation", "task", ["id", "done when"], {"key": "id"}],
  ["relation", "after", ["task", "first"]],
  ["fact",
    ["task", "schema", ["quote", {"passes": "parses numbers"}]],
    ["task", "parser", ["quote", {"passes": "empty input gives null"}]],
    ["task", "lists", ["quote", {"passes": "parses lists"}]],
    ["task", "docs", ["quote", {"says on empty": "docs/parse.md"}]],
    ["after", "parser", "schema"], ["after", "lists", "parser"], ["after", "docs", "parser"]],
  ["relation", "done", ["task"]],
  ["rule", ["done", "?t"], ["task", "?t", "?q"], ["answer", "?q", true, "?_"]],
  ["relation", "ready", ["task"]],
  ["rule", ["ready", "?t"], ["task", "?t", "?_"], ["not", ["done", "?t"]],
    ["not", ["and", ["after", "?t", "?first"], ["not", ["done", "?first"]]]]],
  ["relation", "blocks", ["task", "first"]],
  ["rule", ["blocks", "?first", "?t"], ["after", "?t", "?first"]],
  "plan"]
```

With the tests above, `done` gives `["parser", "schema"]` and `ready` gives `["docs", "lists"]`. `["query", ["graph/topologicalOrder", "blocks", "?task", "?position"], {"order": "position"}]` gives an order to do them in: schema, parser, docs, lists. If the dependencies form a loop, it fails and names the cycle.

## Improving a score that moves between runs

A timing moves from run to run, so one run per version can make a change look better or worse than it is. Run the score the same number of times on each version, three to start with, and put what the runs share in its question: here the benchmark and its number of rounds. A small project joins 200,000 strings twenty times, and two ideas compete to make it faster:

```bash
for i in 1 2 3; do node <skill>/scripts/see.mjs a$i -- node bench.mjs; done
# change join.mjs to append with a template literal
for i in 1 2 3; do node <skill>/scripts/see.mjs b$i -- node bench.mjs; done
# change join.mjs to join the array in one call
for i in 1 2 3; do node <skill>/scripts/see.mjs c$i -- node bench.mjs; done
```

```json
{"scores": [{"question": {"ms": "bench.mjs", "rounds": 20}, "better": "lower"}],
 "directions": [
   {"id": "template", "statement": "Append with a template literal", "patience": 1},
   {"id": "array-join", "statement": "Join the array in one call", "patience": 1}],
 "observations": [
   {"id": "a1-ms", "source": "a1", "quote": "ms: 105", "question": {"ms": "bench.mjs", "rounds": 20}, "value": 105},
   {"id": "b1-ms", "source": "b1", "quote": "ms: 110", "question": {"ms": "bench.mjs", "rounds": 20}, "value": 110, "tries": "template"},
   {"id": "c1-ms", "source": "c1", "quote": "ms: 34", "question": {"ms": "bench.mjs", "rounds": 20}, "value": 34, "tries": "array-join"}]}
```

(and an observation for each of the other six runs). The model gives each version the range of its runs, and an improvement only where the version's slowest run beats the most any earlier version was sure to give, its slowest run:

```json
{"score in each version": [
   {"version": "v0001", "score": {"ms": "bench.mjs", "rounds": 20}, "best": 104, "worst": 105},
   {"version": "v0002", "score": {"ms": "bench.mjs", "rounds": 20}, "best": 110, "worst": 116},
   {"version": "v0003", "score": {"ms": "bench.mjs", "rounds": 20}, "best": 34, "worst": 35},
   {"version": "now", "score": {"ms": "bench.mjs", "rounds": 20}, "best": 34, "worst": 35}],
 "improved": [{"score": {"ms": "bench.mjs", "rounds": 20}, "version": "v0003", "before": 105, "after": 35}],
 "progress": [
   {"direction": "template", "tried": 1, "paid_off": 0, "misses": 1},
   {"direction": "array-join", "tried": 1, "paid_off": 1, "misses": 0}]}
```

The template literal's slowest run, 116, was no better than the 105 the first version was sure to give, so it missed and, with a patience of one, is set aside. Joining the array's slowest run, 35, beat 105. Had its slowest run been above 105, the model would not call it an improvement, however low its fastest run: run each again, or say that the change is within the noise.

A requirement keeps a score honest, as in [Scores and directions](../SKILL.md#scores-and-directions): give the score `"requires": [{"question": {"failing tests": "core"}, "value": 0}]` and run the tests on each version, so a faster version that breaks something has no score at all.

Versions are of the one project the task folder is in, so run experiments one after another in it. Experiments in other checkouts, such as worktrees, have files the task's versions do not hold, and their runs speak for no version here.

## Carrying an experiment loop to another model or benchmark

A prompt, a skill, or an agent's harness that was tuned with one model on one set of evals is carried to another model or another set. What paid off before may not pay off there, and what was set aside may be worth another try. Declare the new setting as another score, since its runs are not comparable with the old ones, and ask what the record says about it. In the slug example of [What an experiment was expected to fix](../SKILL.md#what-an-experiment-was-expected-to-fix), two directions were tuned on a suite of titles, each change committed, and then a suite of names arrived:

```bash
node <skill>/scripts/see.mjs n3 -- node eval.mjs names        # on the files as they are: passed: 2 of 4
```

```json
{"scores": [{"question": {"passed": "eval.mjs names"}, "better": "higher"}],
 "observations": [
   {"id": "n3-passed", "source": "n3", "quote": "passed: 2 of 4", "question": {"passed": "eval.mjs names"}, "value": 2}]}
```

`carried` then listed both directions for the new score: each had paid off on the titles, and no experiment of either had run the names with an earlier version to beat. To judge them, run the new score on the versions their experiments were made on and on the one before, by putting each version's files back:

```bash
git checkout 39db117 -- slug.mjs && node <skill>/scripts/see.mjs n1 -- node eval.mjs names   # before any change: passed: 1 of 4
git checkout 0747385 -- slug.mjs && node <skill>/scripts/see.mjs n2 -- node eval.mjs names   # with collapse: passed: 2 of 4
git checkout bcca23a -- slug.mjs                                                             # the present again
```

Each run is recorded as an observation of the new score. It speaks for the version whose files it ran on, whenever it was made, so the model then gave:

```json
{"improved": [
   {"score": {"passed": "eval.mjs titles"}, "version": "v0002", "before": 3, "after": 4},
   {"score": {"passed": "eval.mjs titles"}, "version": "v0003", "before": 4, "after": 5},
   {"score": {"passed": "eval.mjs names"}, "version": "v0002", "before": 1, "after": 2}],
 "paid": [
   {"direction": "collapse", "version": "v0002", "score": {"passed": "eval.mjs titles"}},
   {"direction": "collapse", "version": "v0002", "score": {"passed": "eval.mjs names"}},
   {"direction": "trim", "version": "v0003", "score": {"passed": "eval.mjs titles"}}],
 "carried": []}
```

`collapse` holds on the names too. `trim` was judged there and paid nothing: its version gave the 2 of 4 the version before it already gave. Neither is carried any longer. Commit each experiment, so its version can be put back; a version whose files you cannot put back cannot be run again.

Keep the predictions with the record as well. A belief that `tries` a direction says which problems that experiment was expected to fix, and `fixed` and `unfixed` say which it did, so whoever continues the loop, under the new model or months later, reads why each change was made and what it did, not only that the score went up.

## What if

A question never changes the model, so to see what would follow from something you have not observed, ask with it. In the bug above, what if `total` had turned out to keep no result?

```bash
node <skill>/scripts/ask.mjs '["begin",
  ["fact", ["source", "maybe", "ran", "imagined"],
           ["observed", "o-maybe", "maybe", "x", ["quote", {"keeps a result": "total"}], false]],
  {"holds": ["find", "?b", ["holds", "?b"]], "unexplained": ["find", "?p", ["unexplained", "?p"]]}]'
```

gives `{"holds": [], "unexplained": ["second-total"]}`: that outcome would leave the problem with no explanation. The facts last for that one question; asked again without them, `cached` holds. Use it to see what each possible outcome of an experiment would overturn before you run it.

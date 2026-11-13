# Patterns for reasoning models

Ways to model the shapes reasoning usually takes. Each example was run with the skill's scripts on a small project, and the results shown are what the model gave. Copy a pattern into your notes or into a step of your own, and change its names.

## Contents

- [Finding the cause of a bug](#finding-the-cause-of-a-bug)
- [Verifying a change](#verifying-a-change)
- [Checking what you were told](#checking-what-you-were-told)
- [Assumptions a prediction cannot state](#assumptions-a-prediction-cannot-state)
- [A plan with dependencies](#a-plan-with-dependencies)
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

## What if

A question never changes the model, so to see what would follow from something you have not observed, ask with it. In the bug above, what if `total` had turned out to keep no result?

```bash
node <skill>/scripts/ask.mjs '["begin",
  ["fact", ["source", "maybe", "ran", "imagined"],
           ["observed", "o-maybe", "maybe", "x", ["quote", {"keeps a result": "total"}], false]],
  {"holds": ["find", "?b", ["holds", "?b"]], "unexplained": ["find", "?p", ["unexplained", "?p"]]}]'
```

gives `{"holds": [], "unexplained": ["second-total"]}`: that outcome would leave the problem with no explanation. The facts last for that one question; asked again without them, `cached` holds. Use it to see what each possible outcome of an experiment would overturn before you run it.

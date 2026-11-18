# Patterns for research models

Rules for the shapes research usually takes. Each was run against one small model, a made-up payments outage at a company called Northwind, and the results shown are what Lion gave. Copy a pattern into your frame step and change its names.

## Contents

- [The example's claims](#the-examples-claims)
- [Facts that hold or do not](#facts-that-hold-or-do-not)
- [Which value the model accepts](#which-value-the-model-accepts)
- [Disputes that are only rounding](#disputes-that-are-only-rounding)
- [Figures as written](#figures-as-written)
- [Senses of a word, and the reader's choice](#senses-of-a-word-and-the-readers-choice)
- [Timelines and time zones](#timelines-and-time-zones)
- [Statements that change](#statements-that-change)
- [Totals and their parts](#totals-and-their-parts)
- [Networks and dependencies](#networks-and-dependencies)
- [Who relies on whom](#who-relies-on-whom)
- [Gaps](#gaps)
- [Assumptions](#assumptions)
- [Weighing explanations](#weighing-explanations)
- [What if](#what-if)

## The example's claims

Five sources from four publishers: Northwind's status page and its post-incident review (one publisher, primary), an independent uptime monitor (primary), a wire story (secondary), and a blog (tertiary). The claims are of five kinds:

```json
["schema", "Says", ["schema/anyOf",
  {"event": "value/string?",
   "when": ["array/make", "value/integer?", "value/integer?", "value/integer?", "value/integer?", "value/integer?"],
   "offset": "value/integer?"},
  {"users affected": "value/string?", "count": "value/integer?"},
  {"affected": "value/string?", "is": "value/boolean?"},
  {"service": "value/string?", "depends on": "value/string?"},
  {"cause": "value/string?",
   "standing": ["schema/anyOf", "suspected", "confirmed", "ruled out"],
   "when": ["array/make", "value/integer?", "value/integer?", "value/integer?", "value/integer?", "value/integer?"],
   "offset": "value/integer?",
   "note": ["schema/optional", "value/string?"]}]]
```

Each kind that answers a question with one right answer gets an `answer` rule:

```json
["rule", ["answer", {"users affected": "?region"}, "?n", "?c"],
  ["claim", "?c", "?_", "?_", {"users affected": "?region", "count": "?n"}]]
```

Choosing the question is the modeling decision. Two claims dispute each other only when they answer the same question, and back each other only when they give it the same value. So put in the question everything that makes two claims comparable (which company, which year, which region), and make the value what sources could differ on.

## Facts that hold or do not

Many facts are not a value but a yes or no: a service was affected, a person attended, a product has a feature. Each is a question whose answer is `true` or `false`:

```json
["claim", "c16", "status", ["quote", "Checkout and invoicing are degraded. Payouts are not affected."],
  ["quote", {"affected": "checkout", "is": true}]],
["claim", "c17", "status", ["quote", "Checkout and invoicing are degraded. Payouts are not affected."],
  ["quote", {"affected": "payouts", "is": false}]],
["claim", "c19", "blog", ["quote", "payouts were frozen for hours too"],
  ["quote", {"affected": "payouts", "is": true}]]
```

```json
["rule", ["answer", {"affected": "?service"}, "?is", "?c"],
  ["claim", "?c", "?_", "?_", {"affected": "?service", "is": "?is"}]]
```

The core then does the rest. The monitor also saw checkout fail, so `corroborated` has `{"affected": "checkout"}: true` from two publishers. The blog and the status page disagree about payouts, so `disputed` has `{"affected": "payouts"}: [false, true]`.

Record a denial as a claim with `false`. A source that says something did not happen is evidence, and without it the model sees only the sources that said it did.

## Which value the model accepts

When sources disagree, record every value and let a rule choose. The rule states the policy, and `why` on an accepted value then shows the policy at work. Pick the policy that suits the topic; say in the report which one you used.

Prefer what primary sources say first-hand, when they agree:

```json
["relation", "primary_answer", ["question", "value"]],
["rule", ["primary_answer", "?q", "?v"],
  ["answer", "?q", "?v", "?c"], ["claim", "?c", "?s", "?_", "?_"],
  ["not", ["attributed", "?c", "?_"]],
  ["source", "?s", "?_", "?_", "?_", "primary", "?_"]],

["relation", "accepted", ["question", "value", "basis"]],
["rule", ["accepted", "?q", "?v", "the only value reported"],
  ["answers", "?q", ["array/make", "?v"]]],
["rule", ["accepted", "?q", "?v", "the one value primary sources give first-hand"],
  ["disputed", "?q", "?_"], ["primary_answer", "?q", "?v"],
  ["not", ["and", ["primary_answer", "?q", "?other"], ["not", ["=", "?other", "?v"]]]]]
```

The wire says about 100,000 merchants were affected, crediting Northwind, and Northwind's review says 95,000. `["query", ["accepted", {"users affected": "all"}, "?value", "?basis"]]` gives `[{"value": 95000, "basis": "the one value primary sources give first-hand"}]`. The core has already flagged the wire's figure twice: it is in `secondhand`, and in `misquoted` with `"relayed": 100000, "said": 95000`.

A question the primary sources themselves dispute gets no accepted value, which is the honest result: it stays in `disputed` until you learn more.

Prefer the most recent source, for facts that change between publications:

```json
["relation", "newest", ["question", "published"]],
["rule", ["newest", "?q", ["aggregate/max", "?p"]],
  ["answer", "?q", "?_", "?c"], ["claim", "?c", "?s", "?_", "?_"],
  ["source", "?s", "?_", "?_", "?_", "?_", "?p"], ["value/integer?", "?p"]],

["relation", "latest_answer", ["question", "value"]],
["rule", ["latest_answer", "?q", "?v"],
  ["newest", "?q", "?p"], ["answer", "?q", "?v", "?c"],
  ["claim", "?c", "?s", "?_", "?_"], ["source", "?s", "?_", "?_", "?_", "?_", "?p"]]
```

The guard `["value/integer?", "?p"]` leaves out sources with no date. For statements that change within a day, or within one source, see [Statements that change](#statements-that-change).

## Disputes that are only rounding

`disputed` treats 118.6 and 120 as a disagreement, which they are, but often one source rounded. Separate the disputes that matter:

```json
["relation", "materially_disputed", ["question", "low", "high"]],
["rule", ["materially_disputed", "?q", "?low", "?high"],
  ["disputed", "?q", "?vs"],
  [["schema/arrayOf", "value/number?"], "?vs"],
  ["=", "?low", ["aggregate/min", "?vs"]],
  ["=", "?high", ["aggregate/max", "?vs"]],
  ["number/greaterThan", ["number/subtract", "?high", "?low"], ["number/multiply", 0.02, "?high"]]]
```

The second goal is a guard: it keeps the rule to questions whose values are all numbers, so a dispute over `true` and `false` does not reach the subtraction. Here the values differ by more than 2%, so the result is `[{"question": {"users affected": "all"}, "low": 95000, "high": 100000}]`.

## Figures as written

The two sections that follow were run against the model of the skill's frozen eval, `evals/verifies-company-figures/reference/`: a made-up cold-storage company, Tarnwell, whose sources disagree on purpose.

A source writes "near $0.41 billion", and the frame counts revenue in millions. Record the figure as the source writes it, in a shape whose key names that unit, and let the `answer` rule convert it:

```json
["schema", "Says", ["schema/anyOf",
  {"revenue": "value/string?", "period": "value/string?", "basis": "value/string?", "usd_m": "value/number?"},
  {"revenue": "value/string?", "period": "value/string?", "basis": "value/string?", "usd_bn": "value/number?", "rounded": true}]],

["rule", ["answer", {"revenue": "?co", "period": "?p", "basis": "?b"}, "?usd_m", "?c"],
  ["claim", "?c", "?_", "?_", {"revenue": "?co", "period": "?p", "basis": "?b", "usd_m": "?usd_m"}]],
["rule", ["answer", {"revenue": "?co", "period": "?p", "basis": "?b", "rounded to": "0.01 billion"}, ["number/multiply", "?usd_bn", 1000], "?c"],
  ["claim", "?c", "?_", "?_", {"revenue": "?co", "period": "?p", "basis": "?b", "usd_bn": "?usd_bn", "rounded": true}]]
```

The claim is then `{"revenue": "tarnwell", "period": "fiscal 2025", "basis": "reported", "usd_bn": 0.41, "rounded": true}`, and the core's `unquoted` finds 0.41 in "Tarnwell reported revenue near $0.41 billion for fiscal 2025." Had it been recorded as `"usd_m": 410`, `["query", ["unquoted", "?claim", "?field", "?value"]]` would give `[{"claim": "converted", "field": "usd_m", "value": 410}]`.

- **A rounded figure is its own question.** "Near $0.41 billion" is not a third answer to the exact figure, so its question says how it was rounded, and it never disputes $409.8M or $412.6M.
- **The check reads digits grouped with commas,** as English writes them. A figure in a field declared `context` is left out of it.
- **Every number at the top of `says` is checked,** including years and dates. A date written as words ("June 30, 2025") recorded as `20250630` is a conversion, so declare the field `context`: `["fact", ["context", "on"]]`.

## Senses of a word, and the reader's choice

"Revenue" means different things in different sources: as reported, or excluding fuel surcharges; for a fiscal year, or a calendar year. Put the sense in each claim and in its question, and declare the keys that carry a sense:

```json
["fact", ["reading", "basis"], ["reading", "period"]]
```

With no choice made, `["query", ["ambiguous", "?base", "?key", "?readings"]]` gives

```json
[{"base": {"revenue": "tarnwell"}, "key": "basis", "readings": ["excluding fuel surcharges", "reported"]},
 {"base": {"revenue": "tarnwell"}, "key": "period", "readings": ["calendar 2024", "fiscal 2025"]}]
```

A rule that reaches revenue through `meant` uses every sense until the reader chooses:

```json
["relation", "gross_margin", ["company", "period", "basis", "percent"]],
["rule", ["gross_margin", "?co", "?p", "?b", "?percent"],
  ["meant", {"revenue": "?co"}, "?q"],
  ["=", "?p", ["object/get", "?q", "period"]],
  ["=", "?b", ["object/get", "?q", "basis"]],
  ["backing", "?q", "?revenue", "?_"],
  ["backing", {"cost of services": "?co", "period": "?p"}, "?cost", "?_"],
  ["=", "?percent", ["number/divide", ["number/round", ["number/multiply", 1000, ["number/divide", ["number/subtract", "?revenue", "?cost"], "?revenue"]]], 10]]]
```

so the fiscal 2025 margin is 26.4% on revenue as reported and 22.5% excluding fuel surcharges. Ask the reader. Their answer, recorded from notes as `["decided", "basis", "reported", "Use revenue as reported."]`, leaves only the period ambiguous, puts the other sense in `set_aside` (`{"question": {"revenue": "tarnwell", "period": "fiscal 2025", "basis": "excluding fuel surcharges"}, "key": "basis", "stated": "excluding fuel surcharges", "chosen": "reported"}`), and the same rule now gives one margin, 26.4%. Nothing else changed: every rule and page text that reads through `meant` follows the choice.

- **The restated revenue is the one used.** `backing` counts only a publisher's latest word, so the margin is worked out from $409.8M, not the $412.6M of the earlier release.
- **`why` shows the arithmetic.** `["why", ["gross_margin", "tarnwell", "fiscal 2025", "reported", 26.4]]` ends in `{"check": ["=", 26.4, ["number/divide", ["number/round", ["number/multiply", 1000, ["number/divide", ["number/subtract", 409.8, 301.5], 409.8]]], 10]]}`, beside the two `backing` rows it used.
- **A source that does not say which sense** shows as `null` among the readings, so the reader sees that one source left it open.

## Timelines and time zones

Sources give times in their own zones and formats, and converting them by hand is where timelines go wrong. Record the time as the source gave it, as year, month, day, hour, and minute, with the zone's offset from UTC in minutes, and let a rule convert.

```json
["claim", "c2", "status", ["quote", "16:40 UTC - A fix has been rolled out."],
  ["quote", {"event": "mitigated", "when": [2026, 3, 3, 16, 40], "offset": 0}]],
["claim", "c3", "wire", ["quote", "engineers pushed a fix at 11:40 a.m. Eastern, the company said"],
  ["quote", {"event": "mitigated", "when": [2026, 3, 3, 11, 40], "offset": -300}]],
["attributed", "c3", "status"]
```

Two functions in this skill's `assets` folder do the arithmetic. `utc-minutes.json` turns a year, month, day, hour, minute, and offset into minutes since 1970 UTC, which the engine can compare and subtract. `utc-text.json` turns such a count into text, `"2026-03-03 16:40 UTC"`, which people can read. Bind both with `define` at the top of the frame, before the rules that call them. In `steps/01-frame.src.json` write their names with an `@`, and the replay puts the functions there:

```json
["define", "utc-minutes", "@utc-minutes"],
["define", "utc-text", "@utc-text"],

["relation", "happened", ["event", "minute", "at", "claim"]],
["rule", ["happened", "?e", "?m", ["utc-text", "?m"], "?c"],
  ["claim", "?c", "?_", "?_",
    {"event": "?e", "when": ["array/make", "?y", "?mo", "?d", "?h", "?mi"], "offset": "?off"}],
  ["=", "?m", ["utc-minutes", "?y", "?mo", "?d", "?h", "?mi", "?off"]]],
["rule", ["answer", {"time of": "?e"}, "?at", "?c"], ["happened", "?e", "?_", "?at", "?c"]],

["relation", "elapsed", ["from", "to", "minutes"]],
["rule", ["elapsed", "?a", "?b", ["number/subtract", "?tb", "?ta"]],
  ["happened", "?a", "?ta", "?_", "?_"], ["happened", "?b", "?tb", "?_", "?_"],
  ["number/lessThan", "?ta", "?tb"]]
```

The two claims above become the same minute, so the model sees agreement where the text looked different, and a real difference in times would show up in `disputed`. Then:

- `["query", ["happened", "?event", "?minute", "?at", "?claim"], {"order": "minute"}]` is the timeline in order, each row with its time as text: `started` at `2026-03-03 13:52 UTC`, `detected` at `14:05`, `mitigated` at `16:40`.
- `["query", ["elapsed", "?from", "?to", "?minutes"]]` gives `detected → mitigated: 155`, `started → detected: 13`, `started → mitigated: 168`.
- The start time is in `corroborated`: Northwind's review and the independent monitor both give 13:52 first-hand.

Things to know:

- The schema fixes `when` at five integers. A list of four then fails when it is recorded, where a looser schema would let it in and no rule would match it.
- Both columns are worth having: the count for the engine, the text for people. A saved question cannot call `utc-text` itself, since a `define` lasts for one program, so any time a query should show as text has to be a column a rule computed. Text of this form sorts in time order, so a question for the reader can leave the count out with `"?_"` and still ask for `{"order": "at"}`.
- Convert in one rule, as `happened` does, and let other rules read its columns. A function bound with `define` is written into every rule that calls it, so calling these two from a dozen rules makes the saved model, and the page built from it, several times larger.
- A date with no time is an integer such as `20260303`, which sorts and compares correctly. For the distance between two dates, use `utc-minutes` with hour and minute 0 and divide by 1440.
- A source that gives a time with no zone has an offset you must choose. Record the choice you think most likely, and test the other in a [what-if](#what-if) copy: the reading that agrees with other sources' times for the same event is usually the right one.
- A vague time, such as "just before noon" or "Thursday evening", is not a `when`. Give it a kind of its own, such as `{"event": …, "around": "Thursday evening"}`, so it is on record and no rule mistakes it for a clock time.

## Statements that change

The core already takes a publisher's later word over its earlier one, by the `published` date of its sources: `restated` lists each change, and `backing` and `disputed` use only the latest. This section is for what that does not cover: statements made at clock times within a day, a history the reader should see, and a standing that changes, such as suspected to confirmed.

During a live event, and in any source that is updated, what is said changes: a cause goes from suspected to confirmed, a count rises, a status moves from investigating to resolved. Give the claim the time of the statement, and keep every statement, so the model holds the history and a rule picks the latest word.

```json
["claim", "c5", "status", ["quote", "15:10 UTC - We suspect an expired certificate on the token service."],
  ["quote", {"cause": "expired certificate", "standing": "suspected", "when": [2026, 3, 3, 15, 10], "offset": 0}]],
["claim", "c14", "postmortem", ["quote", "The cause was an expired TLS certificate on the token service."],
  ["quote", {"cause": "expired certificate", "standing": "confirmed", "when": [2026, 3, 10, 9, 0], "offset": 0,
             "note": "post-incident review"}]]
```

```json
["relation", "stood", ["cause", "standing", "minute", "at", "claim"]],
["rule", ["stood", "?cause", "?standing", "?m", ["utc-text", "?m"], "?c"],
  ["claim", "?c", "?_", "?_",
    ["schema/open", {"cause": "?cause", "standing": "?standing",
                     "when": ["array/make", "?y", "?mo", "?d", "?h", "?mi"], "offset": "?off"}]],
  ["=", "?m", ["utc-minutes", "?y", "?mo", "?d", "?h", "?mi", "?off"]]],

["relation", "last_word", ["cause", "minute"]],
["rule", ["last_word", "?cause", ["aggregate/max", "?m"]], ["stood", "?cause", "?_", "?m", "?_", "?_"]],

["relation", "stands", ["cause", "standing", "at"]],
["rule", ["stands", "?cause", "?standing", "?at"],
  ["last_word", "?cause", "?m"], ["stood", "?cause", "?standing", "?m", "?at", "?_"]]
```

- `["query", ["stands", "?cause", "?standing", "?at"]]` gives where each cause stands now: the expired certificate `confirmed`, the database migration `ruled out`, both as of `2026-03-10 09:00 UTC`.
- `["query", ["stood", "expired certificate", "?standing", "?minute", "?at", "?claim"], {"order": "minute"}]` gives its history: `suspected` at `15:10` on the day, `confirmed` a week later.

The pattern is open because the kind has an optional `note`. The standing is a short list of fixed words in the schema, so a claim cannot invent a new one. When a source's wording falls between two, take the weaker: "we have no evidence of an attack" is not "an attack is ruled out".

Two things go wrong with times here, and both give a wrong "latest word":

- **The time is the statement's, not the article's.** A live blog updated at 17:19 that repeats what a company said at 16:40 carries a 16:40 statement. Recorded at 17:19, the relay outranks the original.
- **A statement with no clock time has no `when`.** Do not guess one. Record the latest time it could have been made and mark it, with `"exact": false` as an optional field of the kind, and keep the marked ones out of `last_word` with the guard `["not", ["claim", "?c", "?_", "?_", ["schema/open", {"exact": false}]]]`. They still show in the history.

To take the latest word only from those who said it themselves, add `["not", ["attributed", "?c", "?_"]]` to the `stood` rule that feeds `last_word`.

Do not give such a claim an `answer` rule whose question leaves the time out. Two statements of one source at different times would then look like a dispute. A change of mind is a finding, and `stood` shows it as one.

## Totals and their parts

When a source gives a total and its parts, check that they agree. Sum over the distinct figures, not over claims, since two claims that repeat a figure would count it twice:

```json
["relation", "affected", ["region", "count"]],
["rule", ["affected", "?region", "?n"], ["accepted", {"users affected": "?region"}, "?n", "?_"]],

["relation", "regions_total", ["count"]],
["rule", ["regions_total", ["aggregate/sum", "?n"]],
  ["affected", "?region", "?n"], ["not", ["=", "?region", "all"]]]
```

The review says 38,000 in Europe, 54,000 in North America, and "roughly 95,000 in total". `regions_total` is 92,000. Whether that is a third region nobody named or loose rounding is a question for the next search, and the model raised it (see [Assumptions](#assumptions)).

Ratios, shares, and growth rates work the same way: a rule that joins the two figures and computes.

```json
["=", "?share", ["number/divide", ["number/round", ["number/multiply", 1000, ["number/divide", "?part", "?whole"]]], 10]]
```

gives a percentage with one decimal.

## Networks and dependencies

Who owns, funds, cites, supplies, reports to, or depends on whom is a relation of edges. Rules follow the edges, and the graph algorithms answer questions about the whole network.

```json
["relation", "depends", ["service", "on"]],
["rule", ["depends", "?s", "?on"], ["claim", "?_", "?_", "?_", {"service": "?s", "depends on": "?on"}]],

["relation", "downstream", ["of", "service"]],
["rule", ["downstream", "?on", "?s"], ["depends", "?s", "?on"]],
["rule", ["downstream", "?root", "?s"], ["downstream", "?root", "?mid"], ["depends", "?s", "?mid"]]
```

With checkout depending on the token service and invoicing on checkout:

- `["find", "?s", ["downstream", "tokens", "?s"]]` gives `["checkout", "invoicing"]`: everything a token failure takes down.
- `["query", ["graph/topologicalOrder", "downstream", "?service", "?position"], {"order": "position"}]` gives tokens, checkout, invoicing: the order in which a failure spreads. If sources describe a loop, the query fails and names the cycle, which is a contradiction worth reporting.
- `graph/components` finds the separate clusters, `graph/pageRank` what is most depended on or most cited, and `graph/shortestPath` how two things are connected and through what.

Put the recursive rule's own relation first in its body, as `downstream` does. A query that starts from one known node then looks only at what that node reaches.

An edge is also a fact that holds or does not, so to know who stands behind each edge, give the kind an `answer` rule too: `["answer", {"depends": "?s", "on": "?on"}, true, "?c"]`.

## Who relies on whom

The core counts who stands behind each answer. The sources themselves also form a network: each attribution is one source leaning on another. A rule turns the attributions into edges, and the graph algorithms read the shape of the coverage.

```json
["relation", "relies_on", ["source", "on"]],
["rule", ["relies_on", "?source", "?on"],
  ["attributed", "?claim", "?on"], ["claim", "?claim", "?source", "?_", "?_"]]
```

- `["query", ["graph/pageRank", "relies_on", "?source", "?rank"], {"order": "-rank", "limit": 2}]` gives the sources the rest stand on: here Northwind's review and its status page, level at 0.37. If the top source is one you have not read, read it next.
- `["query", ["graph/components", "relies_on", "?source", "?cluster"]]` groups sources that are tied together by attribution. The review, the status page, and the wire story are one cluster; the monitor and the blog credit nobody and are in none. Many sources in one cluster are one line of reporting, however many articles it has.
- To see how much each source carries, count its statements, zero included:

  ```json
  ["query", ["and",
    ["source", "?source", "?_", "?_", "?_", "?_", "?_"],
    ["=", "?statements", ["aggregate/count", ["find", "?c", ["claim", "?c", "?source", "?_", "?_"]]]]],
   {"order": "-statements"}]
  ```

## Gaps

List what the answer needs, and let the model say what it lacks:

```json
["relation", "missing", ["question"]],
["rule", ["missing", {"time of": "?e"}],
  ["in", "?e", ["array/make", "started", "detected", "mitigated", "resolved"]],
  ["not", ["answer", {"time of": "?e"}, "?_", "?_"]]]
```

`["find", "?q", ["missing", "?q"]]` gives `[{"time of": "resolved"}]`: no source said when the incident was declared over. For a list of entities instead of a fixed list, replace the `in` goal with the relation that holds them, as in `["company", "?c"]`.

Run this with the standing questions after every batch. An empty result is a reason to stop searching; a result that will not empty is a limit to state in the report.

## Assumptions

An assumption is a fact with a rule that finds evidence against it. The witness is whatever shows the failure: a claim's id, or a record of the figures that disagree.

Something that should never be found:

```json
["fact", ["assumption", "a-order", ["quote", "The outage was mitigated after it was detected"]]],
["rule", ["violated", "a-order", {"detected": "?td", "mitigated": "?tm"}],
  ["happened", "detected", "?td", "?_", "?_"], ["happened", "mitigated", "?tm", "?_", "?_"],
  ["number/lessThan", "?tm", "?td"]]
```

Figures that should agree:

```json
["fact", ["assumption", "a-total", ["quote", "Regional counts add up to the reported total"]]],
["rule", ["violated", "a-total", {"regions": "?sum", "reported": "?all"}],
  ["regions_total", "?sum"], ["affected", "all", "?all"], ["not", ["=", "?sum", "?all"]]]
```

Something that should exist, where the evidence against it is its absence:

```json
["fact", ["assumption", "filed", ["quote", "A primary source reports revenue"]]],
["rule", ["violated", "filed", "no primary source reports revenue"],
  ["not", ["and",
    ["claim", "?_", "?source", "?_", ["schema/open", {"revenue": "?_"}]],
    ["source", "?source", "?_", "?_", "?_", "primary", "?_"]]]]
```

`["query", ["violated", "?assumption", "?witness"]]` gives `[{"assumption": "a-total", "witness": {"regions": 92000, "reported": 95000}}]`, and `["find", "?a", ["holds", "?a"]]` gives `["a-order"]`.

- Add the assumption's fact before its rule, in the same step.
- An assumption with no `violated` rule always holds, which tells you nothing. Write the rule, or do not record the assumption.
- An "exists" assumption fails until the evidence arrives. That is correct: it shows what you have not yet established.
- Write down the assumptions you would be embarrassed to have missed: what you believe about causes, order, sizes, who knew what, and whether sources are independent.

## Weighing explanations

When there are competing explanations, write down what each one predicts and let the evidence sort them. The predictions are yours, so they are facts with no source; what was observed must come from claims.

```json
["relation", "predicts", ["explanation", "observation"]],
["relation", "observed", ["observation", "claim"]],
["relation", "fits", ["explanation", "seen", "unseen"]],
["fact",
  ["predicts", "expired certificate", "errors start on the hour"],
  ["predicts", "expired certificate", "every region fails at once"],
  ["predicts", "database migration", "a deploy just before the errors"],
  ["predicts", "database migration", "every region fails at once"]],

["rule", ["observed", "every region fails at once", "?c"],
  ["claim", "?c", "?_", "?_", ["schema/open", {"users affected": "eu"}]],
  ["claim", "?_", "?_", "?_", ["schema/open", {"users affected": "na"}]]],

["rule", ["fits", "?e",
    ["aggregate/unique", ["find", "?o", ["and", ["predicts", "?e", "?o"], ["observed", "?o", "?_"]]]],
    ["aggregate/unique", ["find", "?o2", ["and", ["predicts", "?e", "?o2"], ["not", ["observed", "?o2", "?_"]]]]]],
  ["stood", "?e", "?_", "?_", "?_", "?_"]]
```

`["query", ["fits", "?explanation", "?seen", "?unseen"]]` shows, for each explanation a source gave, which of its predictions the evidence bears out and which it has not. Both explanations here predict that every region fails at once, so that observation cannot tell them apart. The `unseen` lists say what to look for next: evidence that errors began on the hour, or of a deploy just before.

An observation that only one explanation predicts is the one worth a search. `aggregate/unique` is there because a `find` gives a value for every match, and an observation that several claims support would otherwise be listed several times.

## What if

To ask what would follow from a fact you do not have, or from reading an ambiguous source another way, run it against a copy, so the model stays as the evidence left it:

```bash
cp model.json what-if.json
bunx @lionlang/cli what-if-step.json --database what-if.json
```

The explorer page does the same in the browser: a query there can add facts, and its reset button loads the saved model again.

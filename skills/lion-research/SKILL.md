---
name: lion-research
description: Keep a Lion logic model alongside a deep research run, so findings are checked as they come in and stay queryable afterwards. Use this whenever the user asks for deep research, a multi-source investigation, a literature or market review, due diligence, a fact-check, a competitive or technical comparison, or an incident or timeline reconstruction, and for any question whose answer means reconciling several sources, even if they never mention Lion, a model, or a database. Also use it when the user wants research they can query, audit, or trace to its sources, and when they ask a follow-up about research that already has a model. It records what each source says as facts, derives conclusions with rules, tests your assumptions against the evidence, and delivers a page for the person who asked: their questions answered in plain words, how solid each finding is, and the quoted sources behind it.
---

# Research with a Lion model

Lion is a JSON-based Lisp with a Datalog logic layer: facts, rules, queries, schemas, aggregates, graph algorithms, and an explanation for every derived answer. This skill uses it as the working memory of a research run.

While you research, you keep a **model**: a Lion database that holds what each source said, with its quote, and rules that derive your conclusions from those statements. The model is a materialized view of the research. Evidence goes in, the conclusions follow from it, and when evidence changes the conclusions change with it.

That buys three things a notes file cannot:

- **The engine checks what you would miss.** Five articles that are one company's statement. A source credited with something it never said. A total that is not the sum of its parts. A time that only looks different because of its time zone. An assumption you made in the first ten minutes that the ninth source quietly broke.
- **Every conclusion can show its reasons.** A conclusion a rule derived has a `why`: a tree that ends in quoted sources. One you typed in as a fact has nothing behind it.
- **The research stays open.** The reader gets one page that holds the model itself: their questions answered, how solid each finding is, and every source with its quotes. They need to know nothing about Lion to use it, and a later question can be answered from the model without anyone searching again.

The model does not replace the research. You still search, read, and judge sources as you normally would. The model is where what you read goes.

## Before you start

You need a shell with `bun` or `node`. Every Lion program is a JSON file, run with:

```bash
bunx @lionlang/cli program.json --database model.json
```

Without bun, use `npx -y @lionlang/cli` the same way. The command loads `model.json`, runs the program, prints its value as JSON, and saves the model. A program that fails prints `ERROR` and a message, exits with 1, and leaves the model as it was.

The skill needs version 0.9.0 or later: its core reads the numbers written in a quote with `string/numbers` and takes a question's readings off it with `object/remove`, and its wording and clock functions use `string/join`, `string/padStart`, and `number/toString` with a separator. `bunx` keeps running whatever version it fetched first, so ask for the newest once, before anything else:

```bash
bunx @lionlang/cli@latest --version
```

If neither runtime is available, say so and research without a model; do not imitate one by hand.

Read [references/lion.md](references/lion.md) before you write your first rule. It is the part of Lion this skill uses, with the mistakes that cost time. [references/patterns.md](references/patterns.md) has tested rules for the common research shapes: disputes, timelines, statements that change, totals, networks, gaps, and competing explanations. Open it when you frame the model.

## The research folder

Keep one folder for the run, in the user's working directory unless they name another:

```text
research/<topic>/
  steps/          every program that changed the model, in order
    00-core.json
    01-frame.src.json   the frame as you write it
    01-frame.json       the frame as it runs, written by the replay
    02-<batch>.json     written from your notes
  notes/          what each batch of sources said, as plain JSON
  sources/        the text of each source as you read it: <source id>.txt
  model.json      the model, built from the steps; never edited by hand
  checks.json     your standing questions: one record, question → Lion query
  page.json       the plan of the reader's page: its views and what each holds,
                  chosen for what this reader wants to know
  explorer.html   the page for the reader, built from the model and the plan
  report.md       the written answer, if the user wants a file
```

`steps/` is the source and `model.json` is what it builds. Rules, schemas, and invariants cannot be removed from a model once added, so to change one you edit the step that wrote it and replay the steps:

```bash
node <this skill's folder>/scripts/replay.mjs
```

It runs every step in order into a new model and replaces `model.json` only when all of them pass; a step that fails prints its error and leaves the model as it was. Replaying takes a second and proves the model can be rebuilt from its sources. Number the steps so they sort in the order they ran.

Write the frame as `steps/01-frame.src.json`. The replay writes it out as `01-frame.json`, putting the skill's time functions wherever the frame says `"@utc-minutes"` or `"@utc-text"`, so the frame you edit stays short. Edit the `.src.json` file only.

## What the core gives you

`assets/core.json` in this skill's folder is the first step of every model. Copy it to `steps/00-core.json`. It declares the relations every research model shares, so the same queries and the explorer work on all of them.

You record these:

| Relation | Holds |
|---|---|
| `source(id, url, title, publisher, kind, published)` | A source. `publisher` is who stands behind it; `kind` and `published` are described under [Record each source](#3-record-each-source-as-you-read-it). |
| `claim(id, source, quote, says)` | One statement by one source: the words that carry it, and a record of what it says. |
| `attributed(claim, to)` | The source does not say this on its own authority: it credits another source. |
| `located(claim, where)` | Where in the source the quote stands, as a reader would look for it: `"Page 47, Consolidated Statements of Operations"`. |
| `assumption(id, statement)` | Something you believe going in. |
| `reading(key)` | A key of your questions that picks one sense of a word, such as `"basis"` (as reported, or excluding fuel surcharges) or `"period"` (fiscal or calendar). You declare these in the frame. |
| `context(field)` | A field of `says` whose number comes from where the quote stands, not from its words, such as a date given in the heading. You declare these in the frame. |
| `decided(key, value, words)` | The reader's choice of a reading, in their own words. |

Your rules add to these two:

| Relation | Holds |
|---|---|
| `answer(question, value, claim)` | This claim answers a question that has one right answer. You write one rule for each kind of claim. |
| `violated(assumption, witness)` | Evidence against an assumption. You write one rule for each assumption. |

And the core derives the rest:

| Relation | Tells you |
|---|---|
| `unquoted(claim, field, value)` | A number in a claim's `says` that its quote does not write. The figure was converted or worked out by whoever recorded it, not copied. |
| `restated(question, publisher, before, after)` | A publisher answered a question, and in a later source answered it otherwise. Its latest dated word counts. |
| `withdrawn(question, value)` | An answer its publisher restated that nobody else still gives first-hand. Relays of it do not keep it alive. |
| `backing(question, value, publishers)` | The publishers who give this answer first-hand, in a claim credited to nobody else, and have not restated it since. |
| `corroborated(question, value)` | Answers that two or more publishers give first-hand. |
| `single_origin(question, value, publisher)` | Answers that rest on one publisher's word, however many sources repeat it. |
| `reliance(publisher, answers)` | How many answers rest on each publisher alone. |
| `secondhand(question, value, credited)` | Answers nobody gives first-hand: every source that states them credits someone else. |
| `misquoted(claim, to, question, relayed, said)` | A claim credits a source that you have read, and that source answers the question differently. |
| `unread(source)` | Sources that others credit and you hold no claim from. |
| `disputed(question, values)` | Questions that sources answer differently, leaving out answers that were withdrawn. |
| `ambiguous(base, key, values)` | Sources answer one question in more than one sense of `key`, and the reader has not chosen: `{"revenue": "acme"}` as reported and excluding fuel surcharges. `base` is the question without its readings; a source that does not say which sense shows as `null`. |
| `meant(base, question)` | The questions the reader means by `base`: every reading the sources answer, less those the reader's choices set aside. |
| `set_aside(question, key, stated, chosen)` | A question answered in another sense than the one the reader chose. |
| `holds(assumption)` | Assumptions with no evidence against them. |

Only first-hand claims count as confirmation. Two sources with one publisher are one voice, and a source that relays another adds nothing to it. That is strict on purpose: a statement repeated by ten outlets is still one statement. A publisher's later word replaces its earlier one, so a figure a company corrected in its annual report is not a dispute with its own press release: it is a restatement, and the earlier figure is set aside along with everyone who repeats it.

The core also keeps invariants: a claim's source must exist, an attribution must name a known claim and a known source, a location must belong to a claim, a decision must be about a reading, and a source must fit its schema. A write that breaks one fails and changes nothing, and the message says which row and why.

## The loop

The work is deep research: searching, reading, following leads, judging sources. That is where the time goes, and nothing here replaces it. The model runs beside it, one small turn at a time:

- You read a source, and what it says goes into the model.
- You form a belief, and it goes in as an assumption with a rule that can prove it wrong.
- You are about to rely on something, and you ask the model what stands behind it.
- You notice yourself checking the same thing twice by hand, and you write the rule that checks it from then on.

Each turn takes a minute, and it is what makes the next hour of reading count: a rule written once checks every source you read afterwards, including the ones that arrive long after you stopped thinking about it. The steps below are in the order they first happen. After setting up and framing, steps 3 to 5 repeat for as long as the research runs.

### 1. Set up

```bash
mkdir -p research/<topic>/steps research/<topic>/sources && cd research/<topic>
cp <this skill's folder>/assets/core.json steps/00-core.json
bunx @lionlang/cli steps/00-core.json --database model.json
```

### 2. Frame the model

Do this before the deep reading, after a first skim tells you what the topic is made of. The frame is a first draft. It grows for as long as the research runs (step 5), so write what you can see now and do not wait for it to be complete.

Write `steps/01-frame.json` with five things.

**The kinds of statement you expect.** Each kind is a record whose first key names it. Declare them in one schema, `Says`, and add the invariant that every claim fits it. A misspelled key then fails loudly when you record the claim, instead of silently matching no rule.

**An `answer` rule for each kind.** It splits the record into a question that has one right answer, and that answer. This is what lets the core find disputes and count who stands behind each answer. A fact that either holds or does not, such as "this service was affected", is a question whose answer is `true` or `false`; see [references/patterns.md](references/patterns.md).

**The words that have more than one sense.** "Revenue" can be as reported or adjusted, a year can be fiscal or calendar, a count can be at year end or today. Give each sense a key in the claim's `says` and in the question its `answer` rule makes, and declare the key a reading: `["fact", ["reading", "basis"], ["reading", "period"]]`. The model then tells a question asked in two senses from a real disagreement, lists the senses for the reader in `ambiguous`, and keeps to the one they choose. Declare as `context` the fields whose numbers come from where a quote stands rather than from its words, such as a year given only in the headline, so the check that every figure is in its quote leaves them alone.

**What you believe going in**, each as an assumption with a `violated` rule that finds evidence against it. Writing these before the evidence arrives matters: a belief written down first can be tested by what you find, and one written afterwards only describes what you already found. Beliefs you form later get the same treatment the moment you form them.

**Rules for the conclusions you are after**: totals, rankings, durations, who is connected to whom.

```json
["begin",
  ["schema", "Says", ["schema/anyOf",
    {"revenue": "value/string?", "year": "value/integer?", "usd_m": "value/number?"},
    {"headcount": "value/string?", "year": "value/integer?", "people": "value/integer?"},
    {"acquired": "value/string?", "by": "value/string?", "year": "value/integer?"}]],
  ["invariant", ["and", ["claim", "?id", "?_", "?_", "?says"], ["not", ["Says", "?says"]]], {"assert": "none"}],
  ["fact", ["context", "year"]],

  ["rule", ["answer", {"revenue": "?company", "year": "?year"}, "?usd_m", "?claim"],
    ["claim", "?claim", "?_", "?_", {"revenue": "?company", "year": "?year", "usd_m": "?usd_m"}]],
  ["rule", ["answer", {"headcount": "?company", "year": "?year"}, "?people", "?claim"],
    ["claim", "?claim", "?_", "?_", {"headcount": "?company", "year": "?year", "people": "?people"}]],

  ["fact",
    ["assumption", "organic", ["quote", "Acme grew without acquisitions before 2020"]],
    ["assumption", "filed", ["quote", "A primary source reports revenue"]]],
  ["rule", ["violated", "organic", "?claim"],
    ["claim", "?claim", "?_", "?_", ["schema/open", {"by": "acme", "year": "?year"}]],
    ["number/lessThan", "?year", 2020]],
  ["rule", ["violated", "filed", "no primary source reports revenue"],
    ["not", ["and",
      ["claim", "?_", "?source", "?_", ["schema/open", {"revenue": "?_"}]],
      ["source", "?source", "?_", "?_", "?_", "primary", "?_"]]]],
  "framed"]
```

The frame will change as you learn the topic. Edit the step and replay.

Start `checks.json` now too, with the standing questions every run asks. These are for you, to steer the research. It is one record, so running it answers all of them at once:

```json
{
  "What do sources disagree on?": ["query", ["disputed", "?question", "?values"]],
  "What do independent publishers confirm first-hand?": ["query", ["and",
    ["corroborated", "?question", "?value"], ["backing", "?question", "?value", "?publishers"]]],
  "How much rests on each publisher alone?": ["query", ["reliance", "?publisher", "?answers"], {"order": "-answers"}],
  "What rests on one publisher's word?": ["query", ["single_origin", "?question", "?value", "?publisher"]],
  "What is known only second-hand?": ["query", ["secondhand", "?question", "?value", "?credited"]],
  "Which sources are credited with something they do not say?": ["query", ["misquoted", "?claim", "?to", "?question", "?relayed", "?said"]],
  "Which figures did their publisher change?": ["query", ["restated", "?question", "?publisher", "?before", "?after"]],
  "Which figures are not written in the words quoted?": ["query", ["unquoted", "?claim", "?field", "?value"]],
  "Which questions do sources answer in more than one sense?": ["query", ["ambiguous", "?question", "?key", "?readings"]],
  "Which credited sources are still unread?": ["find", "?source", ["unread", "?source"]],
  "Which assumptions failed, and on what evidence?": ["query", ["violated", "?assumption", "?witness"]],
  "Which statements does no answer rule read?": ["find", "?claim", ["and",
    ["claim", "?claim", "?_", "?_", "?_"], ["not", ["answer", "?_", "?_", "?claim"]]]]
}
```

### 3. Record each source as you read it

**Save the text first.** Before you record a source's claims, save the text you read as `sources/<source id>.txt`:

```bash
node <this skill's folder>/scripts/page-text.mjs "https://example.com/press/fy24" > sources/pr.txt
```

Quotes are taken from that file. This matters for two reasons. A fetch tool that answers a question about a page gives you its own words, not the page's, and a quote made from a summary is not a quote. And pages change, so the copy is the only proof of what the source said when you read it. If the script cannot reach a page, save the text by whatever means you read it; if you could not read it at all, the source has no claims of its own (see attribution below).

**Then write notes** on what the source says, as plain JSON in `notes/`, and let the recorder turn them into a step:

```json
{"sources": [
   {"id": "pr", "url": "https://example.com/press/fy24", "title": "Acme FY24 press release", "publisher": "Acme", "kind": "primary", "published": 20250201},
   {"id": "wire", "url": "https://news.example.org/acme", "title": "Acme posts record year", "publisher": "Newswire", "kind": "secondary", "published": 20250202},
   {"id": "blog", "url": "https://blog.example.net/acme", "title": "Acme by the numbers", "publisher": "Ledger Blog", "kind": "tertiary", "published": 20250205}],
 "claims": [
   {"id": "c1", "source": "pr", "quote": "revenue of $120M for fiscal 2024",
    "says": {"revenue": "acme", "year": 2024, "usd_m": 120}, "where": "Highlights"},
   {"id": "c2", "source": "wire", "quote": "posted $120M in revenue, the company said",
    "says": {"revenue": "acme", "year": 2024, "usd_m": 120}, "credits": ["pr"]},
   {"id": "c3", "source": "blog", "quote": "$120M in sales, per the wire report",
    "says": {"revenue": "acme", "year": 2024, "usd_m": 120}, "credits": ["wire"]},
   {"id": "c4", "source": "blog", "quote": "it bought Bolt back in 2018",
    "says": {"acquired": "bolt", "by": "acme", "year": 2018}}]}
```

```bash
node <this skill's folder>/scripts/record.mjs notes/02-press.json
bunx @lionlang/cli steps/02-press.json --database model.json
```

The recorder looks for every quote in the saved text of its source and writes nothing if one is missing, so a paraphrase is caught when you write it and not at the end. It writes the step with everything as data, so no text from a source can be read as a Lion name. The step it writes is one `fact` form, which is one change: a source and the claims that cite it go in together.

How to record a source:

- **`publisher` is who stands behind it**: the organization or person, named as you would print it (`"Acme"`, `"The Guardian"`) and written the same way for every channel they speak through. A company's press release, status page, and filing share one publisher, and so do two articles from one newspaper. This is what keeps one voice from counting twice. The reader sees this name.
- **`title` is the source's own title**, as the reader would recognize it. Keep your notes about how you read it out of the title.
- **`kind`** is `primary` (first-hand: filings, data, official statements, the people involved), `secondary` (reporting and analysis built on those), or `tertiary` (summaries of summaries). **`published`** is an integer date such as `20250201`, or `null`.
- **Ids are short and plain**: lowercase letters, digits, and hyphens. A source's id names its file in `sources/`.

How to record a claim:

- **If you write a step by hand, wrap everything that came from outside in `["quote", …]`**: URLs, titles, the quoted words, and every `says` record. In Lion a bare string is a name first, so text that happens to equal a relation's name, or starts with `?`, would not stay text. The recorder does this for you.
- **Record what the source says, not what you conclude.** If two sources disagree, record both. Deciding between them is a rule's job, where the decision is visible and can be questioned.
- **One claim is one statement with the words that carry it.** Copy the quote from the saved text, word for word: the sentence or clause that carries the statement, and no more. A sentence that says three things becomes three claims with the same quote. If you cannot point to the words, you do not have a claim.
- **Record how strongly the source says it.** "Blamed", "suspects", "has ruled out", and "has no evidence of" are different statements. Turning them into one value is a conclusion of yours, and disputes will hang on it. Give the kind a field for the strength, and when the words allow two readings take the weaker.
- **Record attribution whenever a source credits another**: "the company said", "according to", "per", "citing". This is the detail that most often turns five confirmations into one. Add the credited source as a `source` even if you have not read it. A source you cannot read (behind a login, taken down, refused) stays in the model with no claims of its own, and what it is said to say stays second-hand. A mirror or an extract of a source is a source of its own whose claims are attributed to the original, and so is a page that embeds another's post word for word: until you read the original, its words are second-hand, and the page should say so where it matters.
- **A person or organization quoted by an outlet is a source of their own.** "X told the outlet" is X's statement, relayed: add X as a source, with X's organization as its publisher, and credit it. The outlet's own observations are the outlet's. Without this, a company's spokesperson quoted in three papers reads as three voices.
- **Give a statement the time it was made, not the time of the article that carries it.** A live blog updated at 17:19 that repeats a 16:40 statement did not say anything at 17:19. When a source gives no clock time for a statement, do not invent one: give the latest time it could have been made and mark it, as in `"exact": false`, so rules that order statements can leave it out or treat it as a bound.
- **A source you read only part of** is recorded for what you read. Say in the report what you could not reach, since `unread` no longer lists it.
- **Keep values computable.** Numbers as numbers with the unit in the key (`usd_m`, `minutes`), dates as integers (`20250201`), names as short lowercase ids used the same way every time. Lion cannot compare strings by order, so a date kept as text can be matched but not sorted or compared. Clock times and time zones have a pattern of their own.
- **Copy a figure as the source writes it, and let a rule convert it.** "$1.2 billion" is `{"usd_bn": 1.2}`, not `{"usd_m": 1200}`; "2.5 hours" is `{"hours": 2.5}`. The core reads the numbers written in each quote, and `unquoted` lists every number in a claim that its quote does not write, so a slip in copying or converting shows up at once. Converting is a job for the model: give the kind a shape with the unit as written, and an `answer` rule that converts, as in [references/patterns.md](references/patterns.md#figures-as-written). A number taken from where the quote stands, such as the year in a headline, goes in a field the frame declares as `context`.
- **Say where the quote stands** when a source is long, with `"where"` in the note: `"Page 47, Consolidated Statements of Operations"`. The reader sees it beside the quote, and the page shows the quote in its place in the saved text either way.
- **Record the claims your answer depends on, and the ones that could overturn it.** A claim no rule or query will ever read is not worth its line.

If research is fanned out to subagents, have them save each source's text and return claims as data (source, quote, what it says, who it credits), and record them yourself. One writer keeps ids and kinds consistent.

### 4. Ask the model after every batch

```bash
bunx @lionlang/cli checks.json --database model.json
```

After the step above, the model already knows something a reader of three articles would not:

```json
{
  "What rests on one publisher's word?": [
    {"question": {"revenue": "acme", "year": 2024}, "value": 120, "publisher": "Acme"}
  ],
  "Which assumptions failed, and on what evidence?": [
    {"assumption": "organic", "witness": "c4"}
  ]
}
```

Three sources give $120M and all of them are Acme's own word. And the belief that Acme grew without acquisitions has evidence against it, from a tertiary source worth checking.

A later step adds Acme's 10-K, a state registry, and two more relayed claims, and the same questions give:

```json
{
  "What do sources disagree on?": [
    {"question": {"headcount": "acme", "year": 2024}, "values": [1150, 1200]}
  ],
  "Which figures did their publisher change?": [
    {"question": {"revenue": "acme", "year": 2024}, "publisher": "Acme", "before": 120, "after": 118.6}
  ],
  "What do independent publishers confirm first-hand?": [
    {"question": {"headcount": "acme", "year": 2024}, "value": 1150, "publishers": ["Acme", "State Registry"]}
  ],
  "What is known only second-hand?": [
    {"question": {"headcount": "acme", "year": 2024}, "value": 1200, "credited": ["memo"]}
  ],
  "Which sources are credited with something they do not say?": [
    {"claim": "c9", "to": "10k", "question": {"revenue": "acme", "year": 2024}, "relayed": 120, "said": 118.6}
  ],
  "Which credited sources are still unread?": ["memo"]
}
```

Acme's 10-K, filed after its press release, gives a different revenue figure, so the 10-K's figure is Acme's word now. That is not a dispute. The wire and the blog, which repeat the release, still give the old figure, and the report should say so.

Let the answers decide what you read next. This is where the model earns its keep:

- **A question in more than one sense**: stop and ask the person you are researching for which sense they mean, before any answer depends on it. Do not pick one yourself, however natural it seems; one wrong reading early in research breaks everything built on it. Record their answer, in their words, as a decision in your notes (`"decisions": [{"key": "basis", "value": "reported", "words": "…"}]`), and every rule and page that reads through `meant` follows it. If you cannot ask, say in the report and on the page that the answer depends on the choice, and give each sense.
- **A figure not written in its quote**: either you copied it wrong or you converted it. Fix the copy, or record the figure as written and let a rule convert it.
- **One publisher's word** on something the answer depends on: look for a source that could know independently. When one party is the authority on most of the topic, `reliance` says so in one row, and that is a limit to state.
- **A restatement**: the publisher changed its figure. Report the later one, say that it changed, and say who still repeats the earlier one. If the sources say why it changed, record that too.
- **A dispute**: find out why. Different dates, definitions, or units are common, and each is a finding: a difference in definition is a reading, and goes in the frame as one. Otherwise write the rule that says which value the model accepts and on what basis.
- **Second-hand only**: the claim is hearsay until you read the credited source. Read it if you can. If you cannot, the report says the claim is unconfirmed.
- **A misquote**: a source credited another with something it does not say. Report what the credited source does say, and treat the rest of the misquoting source with more care.
- **A failed assumption**: either the evidence is wrong or you were. Check the witness. Never delete an assumption to make the failure go away; a belief the evidence overturned is one of the most useful things the research found, and the report should say so.
- **Nothing where you expected an answer**: a gap. [references/patterns.md](references/patterns.md) shows how to make the model list its own gaps.

When a write fails, read the message before retrying. It names the row and the rule it broke. Usually it is a typo in a key, which you fix in the step. Sometimes it is the evidence contradicting the frame, and then the frame is what needs to change.

Do not wait for a batch to ask. Whenever you are about to lean on something, a figure you will build on or a source you are starting to trust, ask the model about it first. A one-line query costs seconds, and `why` on an answer that surprises you shows which statements and rules produced it, before you believe it or dismiss it.

### 5. Grow the model as you learn

The frame you wrote at the start knew little. Each thing you learn about the topic is a chance to make the model check more for you. Whenever one of these happens, stop for a minute and give the model what it needs, by adding to the frame step and replaying:

| When you | Give the model |
|---|---|
| form a belief: about a cause, an order, a size, who knew what, whether two sources are independent | an assumption and its `violated` rule, then and there. An unwritten belief is the one the evidence overturns without your noticing. |
| compare, add up, convert, or count something by hand a second time | a rule that derives it: an aggregate for a total or a count, a computed column for a ratio or a difference, `utc-minutes` for a time. You will not do it by hand a third time, and the rule covers sources you have not read yet. |
| meet a kind of statement the frame has no shape for | a new shape in `Says` and its `answer` rule. The check "Which statements does no answer rule read?" lists what was recorded and is being ignored. |
| see sources use one word in different senses: two definitions, two periods, two units of count | a key for the sense in that kind's `says` and question, declared as a `reading`, then ask the reader which sense they mean. |
| meet a figure in another unit than the frame's | a shape with the unit as written, and an `answer` rule that converts it. |
| see sources answer one question differently | a rule that states which answer the model accepts and on what basis, so the choice is on record and `why` can show it. |
| find a value that could have been recorded wrongly | a tighter schema: a list of allowed words, a number's range, a list's exact length. The mistake then fails when it is recorded. |
| see sources leaning on one another | a relation of who relies on whom. `graph/pageRank` over it shows which source the rest stand on, and `graph/components` which sources form one cluster. |
| follow a chain: causes, dependencies, ownership, citations | a recursive rule for everything downstream, and `graph/topologicalOrder`, which fails and names the cycle if sources describe a loop. |
| weigh competing explanations | what each predicts, as facts, and a rule that lists which predictions the evidence bears out. |
| wonder what you still lack | a rule that lists the questions with no answer. An empty list is a reason to stop searching. |
| wonder what would follow if something were true | the same step run against a copy of the model. |

[references/patterns.md](references/patterns.md) has a tested rule for each row.

Keep the rules honest as they grow:

- **A rule that gives a wrong answer is fixed, not worked around.** Change it in its step and replay. Every answer that depended on it changes with it, which is the point.
- **A rule that never fires may be broken.** If a check has stayed empty through ten sources, give it a case it should catch, in a copy of the model, and see that it does.
- **Add a question to `checks.json`** whenever you ask the model something worth asking after every batch. When you ask it something the reader will want to know, note it for the page.
- **An assumption you add after seeing evidence that bears on it is still worth adding**, since later evidence can break it. Say in the report that it came late.

### 6. Conclude from the model

When the research is done:

1. **Replay the steps** with `replay.mjs`, to prove the model builds from them.
2. **Check the quotes**:

   ```bash
   node <this skill's folder>/scripts/check-quotes.mjs
   ```

   It looks for every claim's quote in the saved text of its source and lists the ones it does not find, word for word, and the sources with no saved text. Fix a quote that is not found: it is a paraphrase or a slip, and the model's explanations end in these quotes. State in the report which sources have no saved text.
3. **Answer from queries.** Every number, date, ranking, and count in the report comes from a query result, not from memory and not from arithmetic done in your head. If the report needs a figure the model cannot give, add the rule.
4. **Run `why` on each key finding** and cite the sources at its leaves:

   ```json
   ["why", ["corroborated", ["quote", {"headcount": "acme", "year": 2024}], 1150]]
   ```

   In the report, cite sources. The quotes themselves live in the model, where the page shows them beside each finding. `why` on a figure a rule computed shows the arithmetic with the values it was given, `{"check": ["=", 26.4, ["number/divide", ["number/round", ["number/multiply", 1000, ["number/divide", ["number/subtract", 409.8, 301.5], 409.8]]], 10]]}`, so a ratio or a total traces to the line items it came from.
5. **Say what the model says about its own limits**: what is disputed and how you resolved it, which figures their publisher changed, which questions depend on a sense of a word the reader has not chosen, what rests on one publisher's word, what is known only second-hand, what was misquoted, which figures are not written in their quote, which assumptions failed, and what is still missing.
6. **Design the page for this reader** and write its plan, `page.json`. See [The page for the reader](#the-page-for-the-reader).
7. **Build the page, and run every query in it**:

   ```bash
   node <this skill's folder>/scripts/build-explorer.mjs model.json --page page.json
   bunx @lionlang/cli page-check.json --database model.json
   ```

   The first command writes `explorer.html` beside the model: one file with the model, the plan, the Lion engine, and the saved text of every source a claim quotes, which opens from disk with no server. Each statement on the page has "Show it in the source", which shows the quote marked in its paragraph of the saved text, and the whole text on request. It also writes `page-check.json`, every text the plan computes and every query it asks, as one Lion record, with one more check: the questions the plan names that the reader's choices set aside, or that sources answer in senses nobody chose between. The second command runs them all and prints the page's wording, so a sentence that reads wrong, a query that fails or comes back empty, or a question the plan should reach through `meant`, shows up before the reader finds it. `bun` runs the scripts too.

## The page for the reader

The reader asked for research because they had a goal: a decision to make, an event to understand, a claim to check, options to compare. They do not know what Lion is, and they will not write a query. `explorer.html` is made for them, and it has no fixed form. You design it for their goal, the way you would lay out a report for one particular reader, so that the things they came for are on top and the questions they will ask next take one click.

### Design from the goal

Before writing the plan, answer three questions in a sentence each:

1. **What will they do with this research?** That decides the first view and what leads it.
2. **What kinds of question will they keep asking?** "What about this one?", "when did that happen?", "who says so?", "how do these compare?". Each kind becomes a view or a block that answers every question of that kind, not just the one you thought of.
3. **What would change their mind?** Put what is disputed, thin, or unknown where they cannot miss it, in the views about the subject and not only at the back.

Then name the views in the reader's words. Some shapes, to adapt and not to copy:

| The reader wants to | Lead with | Views that follow |
|---|---|---|
| understand an event or incident | the short account, key figures, the main answers | a timeline they can filter; causes, with what was said about each; who and what was affected |
| choose between options | the recommendation and what it rests on | a comparison grid of options against criteria; one view per criterion that needs explaining; risks |
| check a claim | the verdict and how sure it is | the evidence for and against; where each version of the claim came from; what is still unverified |
| size up an organization or market | the headline figures, each with who stands behind it | one view per theme (money, people, products, risks); a lookup by entity |
| survey a field or literature | what is established, what is contested | a view per question; who cites whom; the open problems |

Whatever the shape, keep two views for trust unless the goal makes them pointless: how solid the findings are, and the sources. A reader who cannot check you has no reason to believe you.

### The plan

`page.json` is one record. The model is the source of everything the reader is told, so the plan does not state facts: it holds Lion expressions, and the page works them out from the model each time it opens. Nobody reads this file, so write each expression in full and do not shorten it.

```json
{
  "title": "Acme in 2024",
  "summary": ["string/concat",
    "Acme's 2024 revenue was ",
    ["words/listed", ["array/head", ["find", "?values", ["answers", {"revenue": "acme", "year": 2024}, "?values"]]]],
    " million dollars",
    ["cond",
      [["restated", {"revenue": "acme", "year": 2024}, "?_", "?_", "?_"],
       ["string/concat", ", after Acme corrected the ",
         ["words/listed", ["find", "?before", ["restated", {"revenue": "acme", "year": 2024}, "?_", "?before", "?_"]]],
         " million it first reported"]],
      ["else", ""]],
    ". It has ",
    ["words/number", ["array/head", ["find", "?people", ["corroborated", {"headcount": "acme", "year": 2024}, "?people"]]]],
    " staff, which an independent source confirms."],
  "names": {"acme": "Acme Corp"},
  "views": [
    {"name": "The numbers", "blocks": [
      {"type": "figures", "items": [
        {"label": "Staff, 2024",
         "value": ["words/number", ["array/head", ["find", "?people", ["corroborated", {"headcount": "acme", "year": 2024}, "?people"]]]],
         "note": ["string/concat", "confirmed by ",
           ["words/listed", ["array/head", ["find", "?publishers", ["backing", {"headcount": "acme", "year": 2024}, "?_", "?publishers"]]]]]},
        {"label": "Revenue, 2024, in millions",
         "value": ["words/listed", ["array/head", ["find", "?values", ["answers", {"revenue": "acme", "year": 2024}, "?values"]]]],
         "note": ["cond",
           [["disputed", {"revenue": "acme", "year": 2024}, "?_"], "sources disagree"],
           [["restated", {"revenue": "acme", "year": 2024}, "?_", "?_", "?_"],
            ["string/concat", "corrected from ",
              ["words/listed", ["find", "?before", ["restated", {"revenue": "acme", "year": 2024}, "?_", "?before", "?_"]]]]],
           ["else", "sources agree"]]}]},
      {"type": "answer",
       "question": "How much revenue did Acme report for 2024?",
       "answer": ["cond",
         [["disputed", {"revenue": "acme", "year": 2024}, "?_"],
          ["string/concat", "Its sources give different figures: ",
            ["words/listed", ["array/head", ["find", "?values", ["answers", {"revenue": "acme", "year": 2024}, "?values"]]]],
            " million dollars. ",
            ["cond",
              [["corroborated", {"revenue": "acme", "year": 2024}, "?_"], "One of them is confirmed independently."],
              ["else", "No independent publisher gives a figure."]]]],
         [["restated", {"revenue": "acme", "year": 2024}, "?_", "?_", "?_"],
          ["string/concat",
            ["words/listed", ["array/head", ["find", "?values", ["answers", {"revenue": "acme", "year": 2024}, "?values"]]]],
            " million dollars. Acme first reported ",
            ["words/listed", ["find", "?before", ["restated", {"revenue": "acme", "year": 2024}, "?_", "?before", "?_"]]],
            " million and later corrected it, so sources that repeat the first figure are out of date."]],
         ["else",
          ["string/concat",
            ["words/listed", ["array/head", ["find", "?values", ["answers", {"revenue": "acme", "year": 2024}, "?values"]]]],
            " million dollars."]]],
       "evidence": ["query", ["and",
         ["answer", {"revenue": "acme", "year": 2024}, "?usd_m", "?statement"],
         ["claim", "?statement", "?source", "?_", "?_"]], {"order": "usd_m"}]},
      {"type": "lookup", "title": "What does each source say?",
       "choose": {"source": {"label": "Source", "options": ["aggregate/unique", ["find", "?s", ["claim", "?_", "?s", "?_", "?_"]]]}},
       "example": {"source": "10k"},
       "query": ["lambda", ["source"], ["query", ["claim", "?_", "source", "?quote", "?says"]]]}]},
    {"name": "How solid is it", "blocks": [{"type": "trust"}]},
    {"name": "Sources", "blocks": [{"type": "sources"}]}
  ]
}
```

- **Text on the page is a string or a Lion expression.** `summary`, an answer's `answer`, a block's `note` or `text`, and a figure's `value` and `note` each take either. A string is shown as written. Anything else is evaluated against the model, and what it gives is the text. Use a string only for words that state no fact of the research: a label, a caveat about method. Whatever states a finding is an expression, so it cannot disagree with the model and changes when the model does.
- **The wording changes with the model.** A goal is true or false as a condition, so `cond` picks the sentence: one when `disputed` holds, another when it does not. Write the sentence for each case the evidence could end in, not only the case it is in today.
- **A figure's `value` is always an expression.** The build lists any figure that was typed in, and any text typed into the plan that holds a digit, for you to turn into expressions. A digit in a name, such as a product's, is fine.
- `title` and view and block titles are plain strings. `names` gives the model's ids the names a reader should see; an id in it is shown by its name everywhere on the page.
- `define` binds names for the plan's expressions to use: a record of name to Lion value, usually a `lambda`. Put a phrase or a query you use more than once there.
- `views` are the page's tabs, in order; the first is what the reader sees on opening. Each has a `name` and a list of `blocks`. "Query the model", the Lion editor for readers who know Lion, is always added last.

The page binds these before any expression runs, for turning values into words:

| Function | Gives |
|---|---|
| `["words/listed", list]` | the items as a sentence lists them: `a`, `a and b`, `a, b and c`. These functions never fail: given what is not a list or a number, they write it as `words/text` does |
| `["words/number", n]` | a number with separators: `130,000`, `1,234.5`. Anything else, as `words/text` writes it, so a figure the model lacks reads `nothing` and does not fail |
| `["words/count", n, "source", "sources"]` | `1 source`, `2,400 sources` |
| `["array/head", list]` | from the standard library: the first item of a list, or `null` when it is empty; a `find` gives a list even when one thing matches |
| `["words/text", value]` | any value as text: a number as its digits, `true` as `yes` |

`string/concat` joins any number of strings, and `number/toString` writes a number that needs no separators, such as a year.

### The blocks

Every block can have a `title` and a `note` of plain words under it.

| Block | Shows | Needs |
|---|---|---|
| `answer` | a question, your answer in words, and "Show the evidence" under it | `question`, `answer`, `evidence`: a query |
| `figures` | a row of the few numbers or facts that matter most, each with a label | `items`: each a `label`, a `value`, and an optional `note` |
| `table` | a query's rows as a table the reader can sort and filter | `query` |
| `timeline` | rows in time order, a day at a time | `query` giving `?when` as text from `utc-text`, and `?what`; other columns show under each moment |
| `comparison` | a grid: one row for each value of one column, one column for each value of another | `query`, and `rows`, `columns`, `cell`: the names of three of its variables |
| `lookup` | a question the reader completes by choosing from lists; the answer changes as they choose | `choose`: for each name a `label` and `options`, a query giving the list; `query`: a `lambda` with one parameter for each name in `choose`, in order, whose body is the query; `example`, one choice for each name |
| `trust` | how solid the findings are, built from the core: what needs the reader's decision (`undecided`), confirmed, disputed, figures their publisher changed (`restated`), one publisher's word (`alone`), second-hand, misquoted, figures not written in their quote (`unquoted`), what the reader chose (`choices`), assumptions, unread | nothing. `show` picks and orders the parts; `about` keeps the findings whose question has a given key, such as `"region hit"` |
| `sources` | every source by kind, with its publisher, date, and statements | nothing |
| `text` | a few paragraphs of your own, for what no query says: context, method, a caveat | `text` |
| `custom` | anything the others cannot | `script`: the body of a function of `root` and `kit` |

- **`lookup` is the block for "the kinds of question they will keep asking".** One lookup answers a whole family of questions: any service, any person, any year. Its `as` shows the answer as a `"timeline"` or a `"comparison"` instead of a table. Its `example` is what is chosen when the page opens, and what `page-check.json` runs. A choice's `labels` gives its options other names.
- **A lookup's query is a Lion function.** The page calls it with what the reader chose, each choice passed as data, so text they pick is never read as Lion.
- **`custom` is the last resort.** Its script gets `root`, an element to fill, and `kit`: `query` to ask the model, and `el`, `shown`, `table`, `timeline`, `comparison`, and `statement` to build what it shows. Build with those, so text from sources is never placed as markup.

### Writing what goes in them

- **Ask what the reader would ask, in their words.** A question about the model's machinery ("which answers have one origin?") belongs in `checks.json`; the `trust` block already shows it.
- **Answer in plain words, in a few sentences.** Say the answer first, then how sure it is and what it rests on. No ids, no relation names, no JSON. Where sources disagree or the evidence is thin, the answer says so, by a `cond` on the relation that shows it.
- **Read what each expression gives.** `page-check.json` runs every text and every query of the plan, so its output is the page's wording as the reader will see it. Read it as prose: an empty list reads as nothing, and a `null` as "nothing".
- **Reach a question that has senses through `meant`.** `["meant", {"revenue": "acme"}, "?q"]` gives the questions the reader means by revenue: every sense the sources answer until the reader chooses, and then only the one they chose. A plan that names `{"revenue": "acme", "basis": "reported"}` itself has made the choice for the reader, and the page check lists it. When the reader has not chosen, the wording says the answer depends on it, with a `cond` on `ambiguous`.
- **Show a computed figure's arithmetic.** Give an answer about a ratio, a margin, or a total the evidence `["why", [relation, …, figure]]`, with the figure itself an expression such as `["array/head", ["find", "?p", [relation, …, "?p"]]]`, and the page shows "Worked out as …" with the values the rule used, above the statements they came from.
- **Shape each query for a reader.** Its variable names become the column headings, so name them in plain words: `?publishers`, `?minutes_apart`, `?when`. Leave out with `"?_"` whatever is only for the engine, such as a count of minutes beside a time as text. A variable named `?statement` or `?claim` that holds a claim's id is shown as that claim's quote, and `?source` as the source's title. A record of queries is shown as parts, each under its key.
- **Give times as text.** A time the reader sees is a column a rule computed with `utc-text`. Text of that form sorts in time order, so `{"order": "when"}` works.
- **The same answer can stand in two views** when the reader would look for it in both.

After the model changes, rebuild and run `page-check.json` again. The texts follow the model on their own; read them once more to see that each still reads as a sentence.

## What to hand over

- The written answer, in whatever form the user asked for, with its limits stated.
- `explorer.html`, as the place to read the answers and check them. Say that it opens in a browser from the file, and what its parts are for.
- The research folder, for anyone who wants to rebuild or extend the model: the steps, `model.json`, `page.json`, and the replay command.
- An offer to answer further questions from the model.

## Follow-up questions

When the user asks something about research that has a model, answer from the model first. Write the query, run it, and give the result with its `why` when they ask how you know. Add the question and its answer to `page.json`, in the view where the reader would look for it, so the page holds it too. If the questions they keep asking are of one kind, give that kind a lookup. Search again only when the model lacks the evidence, and then record what you find as a new step. After any change, run `page-check.json` again, revise what changed, and rebuild the page.

## What goes wrong

- **A conclusion typed in as a fact.** It cannot be checked, explained, or updated. Record the statements and derive the conclusion.
- **A model built after the research, to decorate it.** It checks nothing, because nothing can surprise it any more. Record as you read.
- **A frame that never grows.** The rules you wrote before reading cover what you expected. What you learned since is checked by nobody unless you write the rule.
- **The model as the job.** If an hour passes in rules and no source was read, the balance is wrong. The research is the work, and the model is what makes it trustworthy.
- **A quote written from memory or from a summary.** The quote check exists to catch it.
- **A relayed claim recorded without its attribution.** It then counts as a second voice, and the model confirms what nobody confirmed.
- **Editing `model.json`.** The next replay undoes the edit. Change the step.
- **A `says` record that no rule reads.** It was recorded and then ignored. Either a rule should use it or it was not worth recording.
- **Arithmetic in the report that the model never did.** Every figure comes from a query.
- **A figure converted on the way in.** "$1.2 billion" recorded as 1,200 millions is arithmetic nobody can check, and `unquoted` lists it. Record what the source writes and let a rule convert it.
- **A sense chosen for the reader.** Picking "as reported" or "fiscal year" because it seems natural is the mistake that breaks everything downstream without anyone noticing. When `ambiguous` lists a question, ask.
- **A page written for yourself.** Questions in the model's vocabulary, answers that are a table and no sentence, column headings like `usd_m`. The reader did not ask for a database.
- **A finding typed into the plan.** A sentence with a number in it that no expression produced is a claim the model cannot check, and it stays on the page when the model changes. Compute it.
- **The same page for every reader.** A list of answers followed by trust and sources fits no goal in particular. Decide what this reader is trying to do, and build the views around that.

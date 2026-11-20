# What Lion can adopt or learn from Clef

Run `clef` (2026-11-20), steps `42-cl-frame`, `43-cl-lion`, and `44-cl-clef`, with one change to the shared frame, and step `45-cl-built`, which records Lion after the run's ideas were built. The page plan is `page.json`. Every figure below is what the model gives; the checks named "Clef: …" in `research/checks.json` ask for them.

Clef (clef-lang.com, by Braidpoint) is a natively compiled language in the F# family. It targets CPUs, GPUs, FPGAs, and other accelerators. Most of its roughly two hundred pages are about hardware, memory layout, and MLIR, and have nothing for a JSON Lisp that evaluates in memory. The run read the 47 pages and posts that bear on Lion: semantics, types, patterns, errors, laziness, incremental and reactive computation, continuations, and verification. It quoted 24 of them, and read Racket's guide and reference, Pint's tutorial, and RFC 8259 for precedents and limits. Four readers read Clef's pages in parallel, and their reports are in `readers/`.

## After the build

Every item of `build-plan.md` was built on 2026-11-20, ending at commit c1279a1. Step `45-cl-built` records Lion as it is now, from three kinds of evidence:
- the run's seventeen probes, run again at commit 1e16052 (`lion-probes-cl-built`);
- for what those seventeen cannot show, five new programs that use what the build added (`probes/cl-built-*.json`, saved as `lion-probes-cl-added`), and `lion check` and a host program that watches a query (`probes/watch-host/watch.mjs`, saved as `lion-host-cl-added`), all at c1279a1;
- the reference pages for special forms, the standard library, and logic forms at c1279a1, since they changed too, and their older words would otherwise dispute the probes.

Each publisher's newer word replaces its older one, so the verdicts follow. Of the 12 ideas, Lion does 11 already, and 1 is still worth adopting:

- **Contracts on lambdas, with blame** (rank 4) is built only in part. A parameter written `[name, schema]` is checked at the call, and the failure blames the caller. It does not name the function whose contract was broken: `"seven" does not fit "value/number?". (in "label")` names `label` but not `next` (`cl-built-contract`).
  - Lion now has "a lambda whose arguments are checked against schemas when it is called".
  - It still lacks "a failure that names the function and the caller that broke its contract". Racket is the precedent.
  - Result contracts, which the idea also names, were not built.

What the probes give now:
- **Arity.** A lambda given too many or too few arguments fails in a library function's form: `["lambda",["a"],"a"] takes 1 argument but got 3.`
- **Missing keys.** `object/get` fails on a missing key: `There is no key "b" in {"a":1}.`
- **`set!` in a rule body.** It is refused: "set! cannot change "calls" while a rule, query, or find runs".
- **Failures.** A failure names the function and the functions it left: `"number/add" takes a number as argument 1 but got "seven". (in "next", called from "label")`.
- **Large integers.** An integer a JSON number cannot hold is refused when the program's text is read.
- **Match.** A match may leave out its fallback. Without one, a value no case fits fails and is named.
- **Promises.** `delay` makes a promise. Forced twice, its body ran once (`cl-built-promise`).
- **Vacuous proofs.** `why` gives `contradicting` for a proof whose premises contradict each other.
- **The other built items.**
  - `quantity/add` refuses a length and a time.
  - `func/catch` gives a failure as a record of its kind and message.
  - A continuation from `func/shift` can be kept, and called later, once. A second call fails.
  - `lion check` reports a case no value can reach, and a match on a contracted parameter whose cases leave out a value of the contract.
  - Host code that watches a query is told what came and went after a change.
- **Unchanged.** `cl-arity-library`, `cl-match-cases` (run, not checked), `cl-plain-live`, `cl-units`, `cl-vacuous-proof`, `cl-no-callcc`, `cl-promise-by-hand`, and `cl-undecided` give what they gave before.

The beliefs about Lion, as the model reads them now:
- **Wrong when the run tested them:**
  - "A function that changes a binding gives in a rule body what it gives in plain code". It still does not, though it now fails where it gave one number for three items.
  - "Lion holds every integer a program writes exactly". It refuses such an integer instead of rounding it.
  - "Lion's failure for an argument of the wrong kind names the function that refused it". The build made this one hold.
- **Held when tested, and no longer hold since the build:**
  - "Lion has no units of measure".
  - "A Lion proof from premises that allow no state is still reported as a proof". The proof still holds (`cl-vacuous-proof` gives `true`), but `why` now names the premises that contradict each other.
- As the CIRT run did for `ci-ends`, a belief stays broken by the evidence that broke it, as the record of what the run found. The check "Clef: beliefs about Lion, and the evidence against them" now also gives the answer that Lion changed.

No idea waits for a decision now. Lion no longer has the three rules that match coverage, strict arity, and pure rule bodies would have changed.

Two caveats remain:
- **Units.** Quantities are checked when the program runs, not before it, as in Pint.
- **One-shot continuations.** The model says delimited continuations would bring "a continuation resumed more than once", which Lion lacks by design.

Across every run, five ideas are left to build, and none waits for another:
- rank 1: annotated relations, and worst-case optimal joins;
- rank 3: a schema of valid Lion programs for constrained decoding (`agents`);
- rank 4: contracts, and a held-out eval case for the skills' improvement loop.

The rest of this report is the run as it stood before the build.

## The answer

The model weighs 12 ideas from Clef. 11 are worth adopting and 1 Lion does already. The `rank` counts what an idea gives Lion, then how many publishers stand behind its techniques, across every run in the model. Two earlier ideas, annotated relations and worst-case optimal joins, hold rank 1, so the Clef ideas start at 3.

| Rank | Idea | What it would give Lion | Notes |
|---|---|---|---|
| 3 | Check a match's cases with schema inclusion | a report of a match case no value can reach; a match checked to cover every value of its schema | Builds on `schema/includes?`, which Lion has. Changes a documented rule. |
| 4 | Proofs that notice premises allowing no state | a proof that says when its premises allow no state; which assumptions make a goal unsatisfiable | |
| 4 | Contracts on lambdas, with blame | a lambda whose arguments are checked against schemas when it is called; a failure that names the function and the caller that broke its contract | Racket does it. |
| 4 | Refuse extra arguments to a lambda | a call refused when a lambda gets more arguments than it has parameters | Racket does it. Makes one rule of what Lion's library functions already do. Changes a documented rule, decision `lambda-arity`. |
| 7 | `delay` and `force` | values computed on first demand and kept | Racket does it. |
| 8 | Numbers that carry their units | quantities whose units are checked when they are combined | F# and Pint do it. |
| 8 | Failures a program can catch as data | a failure a program can catch and read as data | Racket does it. |
| 11 | Delimited continuations as one primitive | first-class continuations | |
| 11 | Host code that watches a query | host code told when a derived value changes | Lion has the engine already: derived rows kept up to date as facts change. |
| 11 | No `set!` where the engine picks the order | effects kept out of code whose evaluation order the engine chooses | Changes a documented rule. |
| 11 | Refuse integers Lion cannot hold exactly | an integer refused when it cannot be held exactly | |
| — | Keep undecided apart from no | Lion does this already | Its solver refuses what it cannot decide, by name. |

How each fits Lion:

- **Match coverage.** It is the cheapest idea: `schema/includes?` already decides both questions. A later case that an earlier one covers can never be reached, and a match covers a schema when the schema is included in the union of its cases. The probe `cl-match-cases` shows both on Lion as it is. Clef's own patterns chapter only warns about redundant type tests and stops the program when no rule matches. Its introduction claims "exhaustive pattern matching verified at compile time".
- **Proofs that notice premises allowing no state.** Clef's design says "The compiler also needs to identify inconsistent premises". Lion's `prove-commands` pattern proves a rule that no account can meet, under withdrawals with no limit (`cl-vacuous-proof`), and `why` says only "absent" (`cl-why-absent`). One more question, whether the premises allow any state, closes it. A certificate's lines could name the premises a refutation used.
- **Contracts and arity.** Today the failure for `["label", "seven"]` through two lambdas is "Expected number at [0]". It names neither the function nor its caller (`cl-contract`). Lion's library functions check their argument count ("console/log" takes 1 argument but got 2), while a lambda ignores extra arguments. Racket refuses both, and blames the side that broke a contract.
- **Units.** A unit can be a JSON record from base unit to whole-number exponent, with equality as JSON equality, which is what Clef's units chapter says unit equality is. Clef's technique checks units before the program runs and erases them: "F#'s Units of Measure are erased during IL generation." Lion has no such stage, so its precedent is Pint, which carries units on values and checks them when the program runs. The model lists that as a caveat. Lion's solver already solves for an exponent (`cl-units`).
- **Watched queries.** Clef's spec says "Signals are a thin surface layer , not a separate reactive engine". Signals, memos, and effects map onto facts, rules, and a watched query, over the engine Lion already has. Lion has no way for host code to be told when an answer changes (`lion-no-subscription`).
- **Delimited continuations.** Clef reads generators, async, and actors as one construct that differs only in what resumes it. Lion's waiting expressions already suspend and resume. The cost is Lion's direct-style closures, which a continuation would have to capture.

## What running Lion showed about Lion itself

Three beliefs about Lion were wrong:

1. **A function that changes a binding gives in a rule body what it gives in plain code.** Called three times in plain code, a counter with `set!` numbers the items 1, 2, and 3. Called from a rule body over three items, it gives one number for all three, and the count moves by one, not three (`cl-effect-in-rule`). The logic forms page says only that a call "may be computed when the rule is written, which changes nothing but when a side effect happens". This is an existing surprise against Lion's goal that an expression gives in a rule what it gives in plain code. It is what the idea "No `set!` where the engine picks the order" would remove.
2. **Lion's failure for an argument of the wrong kind names the function that refused it.** It does not: `["number/add", "seven", 1]` fails with "Expected number at [0]".
3. **Lion holds every integer a program writes exactly.** The JSON integer 9007199254740993 reads as 9007199254740992, and Lion says the two are equal (`cl-big-integers`). RFC 8259 says integers are interoperable only in the range [-(2**53)+1, (2**53)-1]. Lion fails on an overflow to infinity but rounds here without a word.

Two smaller surprises turned up beside them:

- **Missing key against null.** `object/get` gives `null` both for a key that is missing and for a key that holds `null`, while patterns and `schema/optional` tell the two apart (`cl-missing-key`).
- **Two arity rules.** Lambdas and library functions follow different arity rules.

The beliefs that held: Lion has no units of measure, its rules keep derived values up to date as Clef's incremental computation does, its solver keeps an undecided question apart from a false one, and schema inclusion is enough to check a match's cases.

## What needs your decision

Three ideas would change a rule Lion documents, so they wait:

- **Match coverage** would let a match drop its fallback, against "At least one pair and the fallback are required." The report of an unreachable case changes no rule and could come first on its own.
- **Refusing extra arguments** changes decision `lambda-arity`: "A lambda still ignores arguments past its parameters, as in JavaScript, so host code can call it as a callback." The model lists the callback as the caveat. One way to keep it is for `func/callback`, where host code meets a Lion function, to drop the extra arguments, while a Lion call refuses them.
- **No `set!` in a rule body** narrows what the logic forms page allows. Host functions with effects would still run where the engine chooses, so the rule would cover `set!` only.

## What Clef has built, and what it plans

Clef's pages describe 17 techniques as designs or plans: coeffects, delimited continuations, distinct proof outcomes, errors as values, errors at the edges of exact arithmetic, exhaustiveness checking, higher-order contracts with blame, incremental computation, interactive theorem proving, promises, proof certificates, purity analysis, reactive signals, SMT solving, units of measure, unsatisfiable cores, and vacuity checking. They say so in their own words, for example "As we currently conceive it" and "remain engineering work". None of the pages says a technique is built and working in Clef. So the shared frame gained `{"designed": technique, "in": system}`, which is not a precedent, and the precedents here come from F#, Pint, and Racket.

Clef's verification design points the way Lion's solver already went:
- decide only fragments that always get an answer, and refuse the rest;
- find properties rather than ask for them twice;
- keep certificates a small checker can recheck;
- keep proof, counterexample, unresolved, and timeout apart.

The run adds no idea for these beyond vacuity. They support choices Lion made in the consolidation build.

## Looked at and set aside

- **Null.** Clef has no null at all. Lion holds JSON, which has `null`, so the idea was not weighed. What carries over is the missing-key surprise above.
- **"Absorbing Alloy".** The page is about Clef's former standard library, not the Alloy modelling language.
- **The Baker "saturation engine".** It is elaboration into primitives with a fixed point over facts, not equality saturation.
- **Clef's critique of JSON code.** The page says JSON leaves types as "opaque metadata". It is recorded as a term a source raises. Lion's answer is that schemas are data and predicates in the same JSON.
- **Pages with nothing for Lion.** Arity in curried code, nanopass passes, region memory, actors, and the hardware pages.

## Limits

- **One publisher.** Every Clef statement is Braidpoint's word, mostly about designs. The readers flagged three statements as doubtful, and none of them is recorded in the model:
  - The QF_LIA procedure is said to run in polynomial time, but QF_LIA is NP-complete in general.
  - Two results in the patterns chapter do not match its own code.
  - The metaprogramming page says OCaml's PPX works on strings.
- **The beliefs came late.** They were written after the first probes had run, so they confirm or correct what the probes showed rather than predict it.
- **The rank is coarse.** Ranks one apart are close. Ideas at 11 each give one feature.
- **Built on the newest model, not on `main`.** This branch starts at the consolidation branch (`claude/lion-improvements-consolidation-30c193`, 7e4b4ad), which holds the newest model and the solver, schema inclusion, and certificates the probes use. It merges cleanly only after that branch does.

## Rebuild

```bash
bunx turbo build --filter=@lionlang/cli
cd research
node ../skills/lion-research/scripts/replay.mjs
node ../packages/cli/dist/bin.mjs checks.json --database model.json
node ../skills/lion-research/scripts/check-quotes.mjs
node ../skills/lion-research/scripts/build-explorer.mjs model.json --page runs/clef/page.json --out runs/clef/explorer.html
node ../packages/cli/dist/bin.mjs runs/clef/page-check.json --database model.json
```

The probes run again with `node research/probes/run.mjs lion-probes-cl cl-arity cl-arity-fewer cl-arity-library cl-missing-key cl-match-fallback cl-match-cases cl-plain-live cl-effect-in-rule cl-units cl-vacuous-proof cl-why-absent cl-contract cl-no-delay cl-no-callcc cl-promise-by-hand cl-undecided cl-big-integers` from the repository root, under a new source id when Lion has changed, as `lion-probes-cl-built` was. The programs for what the build added run with `node research/probes/run.mjs lion-probes-cl-added cl-built-units cl-built-promise cl-built-catch cl-built-shift cl-built-contract`. `lion-host-cl-added` keeps the output of `node packages/cli/dist/bin.mjs check` on `research/probes/cl-match-cases.json` and `research/probes/cl-built-match-cover.json`, and of `node research/probes/watch-host/watch.mjs`. The reference pages are saved with the skill's `htmlToText` (in `scripts/page-text.mjs`) from `packages/site-runtime/content/reference/`.

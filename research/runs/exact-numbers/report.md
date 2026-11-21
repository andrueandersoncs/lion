# Exact numbers for Lion

Run `exact-numbers`, 2026-11-21, steps `46-en-frame` to `50-en-provers`. The page is `explorer.html` beside this file; build it with `build-explorer.mjs` as `research/README.md` says.

## The question

Can Lion be called a language that formally verifies? Lion's solver decides with exact numbers, but its plain code computes with JavaScript's doubles, so a proof can be false of Lion's own code. The user asked whether Lion could support proofs with arbitrary arithmetic, and how Lean does it, and then: "Start with exact numbers, do the research run first". This run asks:

1. How should Lion make its numbers exact, so that what its solver proves holds of what its code computes, and what would that cost?
2. How do Lean and other provers prove arithmetic that no decision procedure decides, and what should Lion build after exact numbers?

## The answer

**Make every number exact** (`exact-rationals`). Every number would be an integer of any size or an exact fraction, read as the exact value its digits write. A fraction that no decimal writes, such as 1/3, would be refused when written as JSON.

- **Rank.** The model ranks this first of everything left to build in every run, ahead of annotated relations and joins, which tie for second. It gains four things Lion lacks, and ten publishers stand behind it:
  - integers kept exact past 2^53;
  - fractions kept exact;
  - decimals written in JSON kept exact;
  - proofs that hold of the code's own arithmetic.
- **Precedents.** Racket, Lean, Mathlib, Dafny, ACL2, Python and JavaScript (BigInt).
- **The documented rule it changes.** Lion's reference says, "Plain code computes with floating-point numbers, which can round where the solver does not." You allowed changing it, so it does not wait for a decision.

**Four alternatives were set aside.** For each, the model finds that exact numbers give all it gives, and more:

| Alternative | What it also fails to give |
|---|---|
| Scheme's exact and inexact numbers side by side (`scheme-tower`) | Proofs over decimals still fail, because R7RS and Racket read a number with a decimal point as inexact unless told otherwise. Fast arithmetic, and writing fractions as JSON. |
| Keep every number as a decimal (`exact-decimals`) | Proofs that hold of the code, because a division rounds to a fixed number of digits (Python's decimal docs). Numbers that every JSON reader reads the same. |
| Keep doubles and refuse what they round (`opaque-floats`) | Sound but gives nothing exact numbers do not. Lean's opaque float operations cannot be reasoned about at all. |
| Keep doubles and solve them bit for bit (`float-theory`) | It needs a decision procedure for floating point, which Lion lacks. Z3 and Bitwuzla implement SMT-LIB's FloatingPoint theory, and Lean now proves with a logical model of `Float` that it tests against the hardware rather than proves equal to it. |

### Why it matters for proofs

Two programs (`probes/en-fraction-proof.json`, `probes/en-big-integer-proof.json`) show the gap:

- **Fractions.** The solver proves that no number between 0 and 1 changes when 0.2 is added and taken away, but Lion's code gives 0.10000000000000003 for 0.1.
- **Big integers.** The solver proves that no integer from 2^53 up is unchanged by adding 1, but Lion's code gives 9007199254740992 for 2^53 + 1, with no error.

A model of exact numbers (`probes/exact-model/`, E5) gives 0.1 and 9007199254740993, so both proofs hold of exact code.

Lean has the same issue in `native_decide`. It proves facts about what compiled code computes only by trusting the compiler, and Lean's reference says such proofs are invalid wherever the compiled code and the kernel disagree. Lean records an axiom for each computation trusted this way. Lion's solver is in the position of trusting doubles to agree with exact arithmetic, which they do not.

### What it would cost

The figures come from `probes/exact-model/test.ts`, an untuned model:

- **Decimals.** Adding a hundred thousand decimals took 13.4 ms with exact numbers and 0.3 ms with doubles. Lion's own evaluator takes 17.5 ms for the same additions, so the model's rule estimates the work would take 1.7 times as long. This is within the run's expectation of at most twice the time.
- **Small integers.** With a fast path for integers a double holds exactly, adding small integers costs 6.8 times a double's raw add, before Lion's evaluator adds its own share.
- **Growing fractions.** Halving and adding 0.1 two thousand times leaves a denominator of 603 digits. Racket's guide and ACL2's manual both warn that exact non-integers can cost much more than floats.
- **Correctness.**
  - Sums and products of exact numbers broke associativity and distributivity 0 times in 10,000 random cases; doubles broke them about a third to a half of the time.
  - A decimal written as JSON and read back never changed.
  - A host's double read from its shortest digits gave back the decimal the host wrote, every time, for up to 15 significant digits.

### What building it leaves for its decision record

- **Fractions as JSON.** What a fraction no decimal writes becomes when written as JSON. Racket's JSON library refuses to write one, and the model refuses it too.
- **Other readers.** Big integers Lion writes will be rounded by readers that use doubles. RFC 8259 lets readers limit precision, and I-JSON says receivers cannot be relied on past 2^53 − 1 and recommends strings for exact interchange.
  - `JSON.rawJSON` writes a number's digits as they are, and `JSON.parse` gives a reviver each number's source text. Node 26.7 and Bun 1.4.3 both do this (`probes/json-source/`), as do V8, JavaScriptCore and SpiderMonkey (TC39 stage 4; MDN says it has worked across current browsers since March 2025).
  - Lion's reader already scans a program's number text to refuse inexact integers (`packages/core/src/evaluation/reading.ts`).
- **Digit limits.** How many digits a number read from text may have. Python 3.11 limits integer strings to avoid denial of service.
- **Functions with irrational results.** What square roots and similar functions give. Lean keeps operations it does not model, such as trigonometric functions, opaque.

## After exact numbers: proofs past the solver

No system makes arbitrary arithmetic automatic:

- **Integers.** No algorithm decides every question about integer arithmetic with multiplication: Hilbert's tenth problem was settled in the negative, and Peano arithmetic is undecidable. Dafny's guide warns that Z3 can get stuck on `*`, `/` and `%`, and offers to leave them to lemmas applied by hand.
- **Reals.** Over the real numbers the question is decidable, by quantifier elimination and cylindrical algebraic decomposition, which Z3's nlsat uses. Both can take time that grows doubly exponentially.

Lean's answer is to check proofs rather than decide them:

- **The kernel.** A small kernel checks every proof term, so the tactics that search for proofs need not be trusted, and independent checkers can recheck the terms.
- **Its numbers.** Natural numbers and integers are exact at any size, in the kernel and in compiled code. Rationals are exact.
- **Its tactics each cover a fragment:**
  - `ring` decides equations in commutative rings.
  - `linarith` decides linear inequalities over dense orders, and checks the certificate it finds with `ring`. It is not complete over the integers.
  - `omega` is "not yet a full decision procedure", lacking the Omega test's dark and grey shadows. Lion's solver has both.
  - `nlinarith` reaches some nonlinear goals by multiplying hypotheses together.
  - `linear_combination` checks coefficients written by hand.
  - `polyrith`, which found such coefficients through a Sage server, no longer works because the server was shut down.
- **Everything else** is proved by hand, from lemmas and by induction, and then checked.

Lion already has the first layer, a solver whose certificates a small Lion program rechecks. The model orders what comes after:

| Stage | Idea | Waits for | Precedent |
|---|---|---|---|
| 1 | Prove recursive functions by induction (`recursive-induction`), after showing by a measure that each one ends. Rank 4 of everything left to build. | nothing | ACL2, Dafny |
| 2 | Decide polynomial identities (`ring-normalization`) | exact numbers | Mathlib's `ring` |
| 2 | Prove nonlinear facts from products of hypotheses (`nonlinear-products`) | exact numbers | ACL2, Mathlib's `nlinarith` |
| 2 | Proofs as values a small checker accepts (`checked-proofs`), with the solver as one way to find steps | exact numbers | Lean's kernel, `linear_combination` |

The stage-2 ideas wait for exact numbers because the laws they rely on, such as associativity and distributivity, are false of doubles.

`checked-proofs` differs from the formal-verification run's `hand-proofs`, which the model still passes over because it needs a type checker that runs before the program. A proof that is a Lion value, checked when the program runs, does not.

For `recursive-induction`, ACL2 and Dafny both admit a recursive definition only once they have shown that it terminates, since a definition that never ends could prove false. Lean's compiler likewise compiles partial functions that the kernel treats as opaque.

## Beliefs the evidence broke

- **"What Lion's solver proves about numbers holds of what Lion's code computes"** (`en-solver-sound`) is broken by the two probes above. I wrote it down after running the probes, not before.
- **"Lion refuses every integer result of arithmetic it cannot hold exactly"** (`en-refusal`) is broken too. Lion refuses `9007199254740991 + 2`, whose inputs it holds exactly, but `2^53 + 1` rounds to 2^53 with no error, because past 2^53 − 1 a number is a float and its sums round.
  - So the Clef run's `exact-integers` is only partly built. The model now ranks it worth adopting again, sixth of everything left to build.
  - Exact numbers would make that refusal unnecessary, since no integer would be inexact.

Eleven beliefs held:

- Lean's numbers are exact at any size in compiled code.
- Scheme and Racket read 0.1 as inexact.
- Racket's JSON library will not write 1/3.
- JSON's grammar puts no limit on precision.
- Node and Bun give a reader a number's digits.
- Nonlinear integer arithmetic is undecidable, and nonlinear real arithmetic is decidable.
- Lean's kernel makes tactics untrusted.
- `ring` decides commutative ring equations.
- Provers ask for termination before induction.
- The cost estimate stays within twice the time.

## Other surprises

- **A long error message.** When the solver refuses a function that calls itself (`probes/en-recursion.json`), the message prints the function as Lion compiled it, a lambda with an added parameter and its own closure, three times over. It is not the function as written, and it runs to several hundred characters.
- **A documented gap.** Lion's reference already said that plain code can round where the solver does not. The gap was documented, but nothing told a reader that a `[{}]` proof over `value/number?` could be false of the code.

## Limits

- **ACL2.** The ACL2 manual refused every automated fetch (403 behind a bot check). Its text was read from the manual's source in the ACL2 repository at commit 20f0b3c, so the quotes keep the manual's markup.
- **Dafny's reals.** The Dafny reference says `real` holds "all real numbers" but not how it is compiled, so the run records no claim that Dafny's reals are exact at run time.
- **cvc5 and nlsat.** No cvc5 page on floating point was readable. For nlsat, only the abstract page saved.
- **Lean's `Rat`.** Its page is core's `Init.Data.Rat.Basic`, as rendered on the Mathlib docs site.
- **Name mappings.** Some claims map a source's words onto the run's vocabulary, and each claim's `where` says how:
  - "results that are mathematically exact" became proofs that hold of the code's own arithmetic;
  - Python's "decimal fractions" and Fraction strings became decimals kept exact;
  - Python's Inexact trap became errors at the edges of exact arithmetic.
- **Timings.** They come from one machine and one run of an untuned model. A built version should be measured with `bun run bench` and `bun run scale`.
- **Not checked.** Whether Lion has proofs written by hand and checked by machine. No program in this run shows either way.

## After the build

Exact numbers were built on branch `claude/exact-numbers`, as decision record `exact-numbers` (`history/notes/exact-numbers.json`) sets out. Step `51-en-built` records Lion afterwards:
- **What changed.** Every number is exact: an integer of any size or a fraction, each number read as the exact value its digits write.
  - A JavaScript number stands for the decimal its shortest digits write.
  - A fraction no decimal writes, such as 1/3, is refused when a value is printed as JSON. `number/toString` writes it as `1/3`, and a snapshot as `["number/divide", 1, 3]`.
  - `number/round` takes a number of places.
  - Text may write at most 4,300 digits.
- **The two probes now agree.** Plain code gives 0.1 back from (0.1 + 0.2) - 0.2, and 2^53 + 1 is 9007199254740993, so what the solver proves about numbers holds of plain code.
- **The model's verdicts.** Making every number exact, Scheme's two kinds, decimals, and refusing what doubles round are now things Lion does already. Solving doubles bit for bit has nothing in Lion to work on. The proof ideas no longer wait for exact numbers:

| Idea | Rank of everything left to build |
|---|---|
| Induction over recursive functions | 3 |
| Nonlinear facts from products of hypotheses | 4 |
| Proofs as values a small checker accepts | 4 |
| Polynomial identities | 7 |

### What it cost, measured against main

- **Code** (`bun run measure --against main`): 23,003 lines against 22,392 (+611, +2.7%).
  - Functions +38 (+1.5%), paths +142 (+2.4%), nesting-weighted decisions +128 (+3.0%), tests of a value's kind +16 (+6.2%).
  - Semantics: messages 249 against 250. The interop grid has 3 exceptions against 4, and its three new rows (an exact fraction, an exact decimal sum, a fraction written as text) give what plain code gives everywhere.
- **Speed** (`bun run bench --against main`, three runs while another session loaded the machine): the median speeds have a geometric mean of 1.02×. Every benchmark lies between 0.93× and 1.13×, within the noise of the runs.
  - Adding a hundred thousand decimals, timed alternately with main, takes 38 ms against 20 ms: 1.9 times as long. The model had estimated 1.7, and the run expected at most twice the time.
- **Growth** (`bun run scale --against main`): every workload grows by the same power of n as on main, within 0.1. Peak memory moves with garbage collection, as "every path" at 498 MB against 418 MB shows.

### What building it found

- **A mean that cannot be printed.** `aggregate/mean` of 3, 1, and 3 is 7/3, which JSON cannot hold, so two examples in "Summarize groups" now show it as text and rounded. This is the refusal the decision chose. A reader will meet it whenever a mean is not a finite decimal.
- **A schema that slowed every program.** Adding the exact number to the schema every program is checked against made Lion 10 to 20% slower on large programs. Now a program is checked without it first, and a special form that holds an exact number is checked with each one as 0, which brought the benchmarks back level with main.
- **Tests that assumed doubles.** Test models in twelve files modelled doubles: a sum rounded once, `Math.max`, `-0`. They now model exact numbers, and `finite-numbers.test.ts`, whose properties asserted rounding and refusals, was replaced by `numbers/tests/exact.test.ts`. That file has 12 properties against a fraction model written apart from the code, and checks that the solver's answers hold of plain code.
- **Mutations.** Seventeen mutations no longer applied. All seventeen were rewritten to break the new code, one of them stale on main already, and seven new ones were added. Every mutation in the changed files is caught.

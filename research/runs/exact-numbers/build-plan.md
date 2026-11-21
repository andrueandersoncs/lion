# Build plan: exact numbers

The user, 2026-11-21, after the `exact-numbers` research run: "Yes, build it", with the defaults the run's report recommends:
- a fraction no decimal writes, such as 1/3, is refused when a value is written as JSON;
- a number read from text may have only so many digits;
- a function whose result is not exact gives the nearest double's digits, and the solver reasons only about what it decides.

Branch `claude/exact-numbers`. Read this file first after a compaction.

## The one rule

Every Lion number is an exact rational. A JavaScript number stands for the decimal its shortest digits write: `0.1` is one tenth, and `2 ** 60` is 1152921504606847000, as `String(2 ** 60)` writes it.

A number is held in its one canonical form:
- the JavaScript number whose shortest digits write it, when one does;
- otherwise an interned `Exact`, with a numerator and denominator as bigints in lowest terms.

So `===` is equality, `JSON.stringify` writes every number a double writes, and hosts mostly see plain numbers. `Exact.toJSON` gives `JSON.rawJSON(digits)` for a terminating decimal, and refuses otherwise.

## Where it lands

- **`src/numbers/exact.ts`, new.** It holds:
  - the `Rational` arithmetic, moved from `logic/solver.ts`, which re-exports it;
  - `Exact`, `isNumber`, `isInteger`, `toRational`, `fromRational`;
  - arithmetic with a fast path for safe integers, `compare`, the text forms (`numberText`: decimal or `n/d`), and `readNumberText` with the digit limit.
- **Reading.** `evaluation/reading.ts` scans the number tokens. If any has more than 15 significant digits, it parses with a reviver over `context.source`. This deletes the refusal of integers that read as another.
- **Library.**
  - `modules/number.ts`: every function is exact, `round` takes optional decimal places, `toString` writes `n/d` for 1/3, `fromString` reads it, and `power` with a non-integer exponent gives the nearest double.
  - `modules/value.ts`: `number?` and `integer?`.
  - `modules/lib/guard.ts`: the number schema. `modules/lib/numerals.ts` reads exactly.
  - `modules/aggregate.ts`, `logic/aggregates.ts`: sum and mean are exact, replacing Shewchuk's fsum.
  - `modules/graph.ts` path weights, and `modules/quantity.ts`.
- **Terms.** In `logic/terms.ts`: `isDataOf`, `canonical`/`valueKey`, `sameValue`, `typeRank`, `compareValues`, and `write`, which writes 1/3 as `["number/divide", 1, 3]` and keeps it out of `isJson`.
- **Solver.** In `logic/symbols.ts`, `logic/symbolic.ts`, `logic/solver.ts`, `logic/listing.ts` and `logic/certificate.ts`, constants come in through `toRational` (decimal, not binary) and answers go out through `fromRational`. This is what makes a proof hold of the code.
- **Elsewhere in core:**
  - `logic/weights.ts:1001`, the total;
  - `logic/query-options.ts:46`, a limit;
  - `logic/fit.ts` 336 and 978.
- **Hosts.**
  - The CLI writes results with `toJSON`.
  - `packages/site-runtime/src/evaluate.ts` and the REPL read programs with core's `readJson`.
  - The worker's results go through `JSON.stringify`.

## Decision record

Notes file `history/notes/exact-numbers.json`. Its topic is `exact-numbers`, and it also decides `sum-rounding` again.

It reverses these behaviors:
- `integer-arithmetic-past-exact-range` (was error);
- `float-arithmetic-past-exact-range` (was rounded);
- `integer-literal-past-exact-range` (was error);
- `number-from-string-past-exact-range` (was null);
- `sum-exactly-rounded`.

It rewrites the documented rule "Plain code computes with floating-point numbers, which can round where the solver does not."

## Proof needed

- **Properties:**
  - arithmetic equals a BigInt-rational model;
  - the canonical form is unique: from a double, or from text, the value is the same;
  - read and write round trips;
  - the solver's "none" agrees with plain code over generated decimal constraints;
  - JSON refuses exactly the fractions that are not decimals;
  - snapshot round trip with fractions.
- **Checks:** mutations, the interop grid, `measure`/`bench`/`scale` against main, `compare main --docs`, the docs rebuilt, and `history write`/`check`.
- **Research:** rerun the `exact-numbers` probes under `lion-probes-en-built`, then add step `51-en-built`.

## Status

- [x] exact.ts and reading (`numbers/exact.ts`, `schemas/number.ts`, `evaluation/reading.ts` with `writeJson`)
- [x] library (number, value, numerals, aggregates, graph, quantity, console, object/json-stringify)
- [x] terms (keys, equality, order, `write` gives `["number/divide", n, d]`, `render`)
- [x] solver (symbols, solver re-exports, certificates written exactly however large)
- [x] hosts (CLI, worker, site, editor read exactly; refuse 1/3 when printing)
- [x] tests: `numbers/tests/exact.test.ts` (12 properties, model in `numbers/tests/model.ts`), old models made exact, `finite-numbers.test.ts` removed; grid rows added, clean
- [x] mutations: all 17 stale rewritten (one stale on main already), 7 new, every one in the changed files caught
- [x] docs and decision record written (`history/notes/exact-numbers.json`, probes updated); docs rebuilt
- [x] measures: code +611 lines (+2.7%), messages -1, grid exceptions 4 -> 3; bench geomean 1.02x over three runs (0.93x-1.13x); growth as main; decimals 1.9x (estimate 1.7). compare --docs: 0 of 121 differ. history write/check pass
- [x] research step 51-en-built; docs recording out/proof/exact-numbers-build/docs.mp4
- [x] commit (feat(core): every number is exact)

Pitfalls met:
- The metrics package loads core's source by path, so `instanceof Exact` against the built class fails there. Tell an exact number by its bigint `n`.
- The docs build stops at the first failing example. `scratchpad/scan-examples.ts` runs them all.
- `aggregate/mean` of 3, 1, 3 is 7/3, which cannot be printed. Two docs examples were changed to show it as text and rounded.

- Putting the exact-number schema in the union every program is checked against made large programs 10-20% slower. Check without it first and with it only on failure (`decodeExpression`); a special form holding an exact number is checked with each as 0 (`shaped` in `schemas/evaluation.ts`).
- The bench tool times main then the tree, so another session's load biases ratios. Time alternately: `bun packages/metrics/bench.ts --source <core src> "<name>"` on a `git worktree add --detach out/metrics/ab-main main` checkout, and remove the checkout afterwards.

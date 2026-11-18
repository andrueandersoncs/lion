# Brief for literature readers

We are choosing the top 3 improvements to make to **Lion**, a JSON-based Lisp
(Scheme-like semantics, every program is JSON, evaluated fully in memory, written
in TypeScript on Effect v4) with a built-in Datalog logic layer. Lion is used by
LLM agents as checked working memory (research and reasoning skills).

What Lion already has (do not propose these as new; do look for work that would
**replace several of them with one mechanism**, or make them much faster):

- Plain code: a tree-walking interpreter over JSON; each node is evaluated as an
  Effect. Measured here: fib(17) through a recursive lambda takes 45.6 ms (about
  9 µs per call); a 100,000-step tail-recursive loop takes about 2.3 s.
- Logic: relations, facts, rules, stratified negation, semi-naive bottom-up
  evaluation, magic-sets goal-directed queries, aggregates (sum, count, ...),
  lattice aggregates that may recurse (min, max, shortest, union), keys
  (functional dependencies; a fact with an existing key replaces the row),
  invariants (integrity constraints), existential rules (rules that invent
  unknowns / labelled nulls, a chase), equality rules (a rule head `=` that
  merges invented unknowns, like union-find), graph algorithms (shortest path,
  PageRank, components) as goals, host functions in rules.
- `why`: explains a derived row as a derivation tree down to given facts, and
  explains an absent row (why-not) with each rule that could have given it and
  the goal that stopped it.
- Incremental maintenance: on a fact change, derived rows "follow" the change,
  stratum by stratum (delete affected rows, derive again, like DRed). Three
  kinds of relation still fall back to deriving the relation again and diffing:
  relations invented into with keys or beside other rules, rules with opaque
  host functions, relations read through a schema. The maintenance module is
  ~960 lines.
- Joins: index-nested-loop joins; triangles over n edges / n/4 nodes scale as
  n^0.8 (fine at low degree).

## Your job

Search the academic literature (papers, preferably with an arXiv, ACM, VLDB,
or author-hosted page you can fetch) on your assigned topic. For each source
you rely on:

1. Save its text, from the research folder
   `/Users/andrueanderson/Workspace/lion/.claude/worktrees/lion-improvement-research-4c67df/out/research/lion-improvements`:

   ```bash
   node /Users/andrueanderson/.claude/skills/lion-research/scripts/page-text.mjs "<url>" > sources/<source id>.txt
   ```

   Prefer `https://arxiv.org/abs/<id>` (the abstract) and, when you need a
   number from the body, `https://arxiv.org/html/<id>` (full text, when arXiv
   has HTML). If a page answers 403/404, try another copy (author page, arXiv,
   dblp link, Semantic Scholar). If no copy can be read, do not record claims
   from it. Check the file is non-empty and holds the paper's words.
2. Copy quotes **word for word from the saved file** (verify each with
   `grep -F "<quote>" sources/<id>.txt`). A quote is the clause or sentence
   that carries the statement and no more (ideally under 30 words). Never
   paraphrase into a quote.

Source ids: lowercase letters, digits, hyphens, prefixed with your letter
(e.g. `b-green-2007`). Claim ids: your letter + number (`b1`, `b2`, ...).

## The vocabulary for what a claim says (`says`)

Use only these shapes. Every number in `says` must be written in the quote
exactly as a number (e.g. "2.6x" or "39.2%" — not "an order of magnitude").

1. A technique does / does not cover a concept:
   `{"covers": <concept>, "by": <technique>, "is": true | false}`
   Use `false` when the source says the technique does not handle it, or
   needs restrictions for it (e.g. negation, non-monotone aggregates).
2. A reported result with a factor:
   `{"result": <technique>, "measure": <measure>, "bound": <bound>, "times": <number>}`
   or with a percentage:
   `{"result": <technique>, "measure": <measure>, "bound": <bound>, "percent": <number>}`
   `bound` is one of "exact", "up to", "about", "at least", "average",
   "median", "geometric mean", as the source words it.
   `measure` is a short phrase naming what improved over what, e.g.
   "speedup over AST interpreter", "speedup over Soufflé",
   "accuracy gain over chain-of-thought", "fewer compile errors".
3. A technique is used in a real system:
   `{"adopted": <technique>, "in": <system>}`

Concepts (use these ids where they fit; add new short lowercase ids only when
none fits): "why provenance", "why-not provenance", "counting",
"probabilities", "top-k proofs", "lattice aggregates", "aggregates",
"keys", "equality rules", "existential rules", "stratified negation",
"non-stratified negation", "recursion", "incremental maintenance",
"goal-directed evaluation", "host functions", "worst-case optimal joins",
"shortest paths", "plain-code evaluation", "invariants",
"proper tail calls", "macros", "program repair from errors",
"constrained generation".

Technique ids: short lowercase phrases, e.g. "semiring provenance",
"datalog-o", "scallop", "flix lattices", "egglog", "egg", "dbsp",
"differential dataflow", "dred", "backward-forward", "closure compilation",
"self-optimizing ast interpreter", "souffle", "free join",
"leapfrog triejoin", "logic-lm", "linc", "type-constrained decoding".

Sources: `{"id", "url", "title", "publisher", "kind", "published"}`.
`publisher` is the research group / first author's lab as you would print it
(e.g. "Green, Karvounarakis, Tannen (UPenn)") — two papers by the same group
are one publisher. `kind` is "primary" for the paper that reports its own
result, "secondary" for surveys or papers describing others' work.
`published` is an integer date YYYYMMDD (use the first of the month if only
month/year known, e.g. 20230601). If a claim restates another paper's result,
add `"credits": ["<that source id>"]` and record that paper as a source too.

## What to return (in your final message, not as a file)

1. A JSON block: `{"sources": [...], "claims": [...]}` in the shapes above,
   each claim `{"id", "source", "quote", "says"}` (plus `credits` when it
   relays). Aim for 6–12 sources and 15–35 claims that bear on Lion.
2. A short plain-text assessment (under 300 words): which of Lion's existing
   features the technique could replace with one mechanism, what it would
   newly enable, what Lion would have to give up or work around, and how
   hard it looks. Mark this clearly as your judgment, not a source's.

Do not write any other files than `sources/*.txt`.

// Checks the claims of shared-algebra.md against Lion's engine (this worktree's core).
//
//   T1  Every aggregate is a function of the multiset of its candidates, so a group's
//       value survives deletions by keeping counted candidates: nothing it combines is
//       ever subtracted.
//   T2  Lion's aggregated relations are that algebra today: a group's value is the fold
//       of the distinct matches of its rules, also after facts are added and retracted.
//   T3  A probability is an annotation Lion can already carry: the best proof (max of
//       products) through a recursive lattice aggregate, also after edges are retracted.
import { Effect } from "effect";
import fc from "fast-check";
import { run } from "../../../packages/core/src/evaluation/evaluate";
import { AGGREGATORS } from "../../../packages/core/src/logic/aggregates";
import { LogicDatabase } from "../../../packages/core/src/logic/database";
import { stdlib } from "../../../packages/core/src/modules";

const runs = Number(process.argv[2] ?? 200);
const lion = (program: unknown, database = new LogicDatabase()) =>
  Effect.runPromise(run(program, stdlib, { database })).then((v) => JSON.parse(JSON.stringify(v)));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------- T1
/** A Z-multiset of candidate values: each distinct value with how many times it is held. */
class Candidates {
  readonly held = new Map<string, { value: unknown; count: number }>();
  total = 0;
  sum = 0;
  change(value: unknown, weight: 1 | -1) {
    const key = JSON.stringify(value);
    const entry = this.held.get(key) ?? { value, count: 0 };
    entry.count += weight;
    if (entry.count === 0) this.held.delete(key);
    else this.held.set(key, entry);
    this.total += weight;
    if (typeof value === "number") this.sum += weight * value;
  }
  values() {
    return [...this.held.values()].flatMap(({ value, count }) => Array.from({ length: count }, () => value));
  }
  /** The group's value, kept the cheap way each aggregate allows. */
  value(kind: string): unknown {
    if (kind === "count") return this.total; // invertible: a running total
    if (kind === "sum") return this.sum;
    if (kind === "mean") return this.total === 0 ? null : this.sum / this.total;
    // Selecting and set-like aggregates read the distinct candidates still held.
    const distinct = [...this.held.values()].map(({ value }) => value);
    if (kind === "countUnique") return distinct.length;
    if (["min", "max", "shortest", "unique", "union"].includes(kind)) return AGGREGATORS[kind]!.fold(distinct);
    return AGGREGATORS[kind]!.fold(this.values());
  }
}
const kinds: Record<string, fc.Arbitrary<unknown>> = {
  count: fc.integer({ min: -5, max: 5 }),
  countUnique: fc.integer({ min: -3, max: 3 }),
  sum: fc.integer({ min: -9, max: 9 }),
  mean: fc.integer({ min: -9, max: 9 }),
  min: fc.integer({ min: -9, max: 9 }),
  max: fc.constantFrom("a", "b", "c", "d"),
  shortest: fc.constantFrom("ab", "c", "de", "f", "ghi"),
  union: fc.constantFrom([1], [1, 2], [3], [2, 3]),
  collect: fc.integer({ min: 0, max: 3 }),
  unique: fc.integer({ min: 0, max: 3 }),
};
let t1 = 0;
for (const [kind, values] of Object.entries(kinds)) {
  await fc.assert(
    fc.asyncProperty(fc.array(fc.tuple(values, fc.boolean()), { minLength: 1, maxLength: 25 }), async (ops) => {
      const group = new Candidates();
      for (const [value, add] of ops) {
        const held = group.held.has(JSON.stringify(value));
        group.change(value, add || !held ? 1 : -1);
        const expected = await lion([`aggregate/${kind}`, ["quote", group.values()]]);
        if (!same(group.value(kind), expected)) return false;
        t1++;
      }
      return true;
    }),
    { numRuns: Math.ceil(runs / 4), seed: 1 }
  );
}
console.log(`T1  each of ${Object.keys(kinds).length} aggregates kept by counted candidates equals Lion's fold after each of ${t1} insertions and deletions`);

// ---------------------------------------------------------------- T2
type Row = [string, string, number];
const BODIES = {
  "e": [["e", "?a", "?b", "?n"]],
  "e and f": [["e", "?a", "?b", "?n"], ["f", "?b"]],
  "e or (e and f)": [["or", ["e", "?a", "?b", "?n"], ["and", ["e", "?a", "?b", "?n"], ["f", "?b"]]]],
} as const;
const EXPRESSIONS = { "?n": (m: Row) => m[2], "?b": (m: Row) => m[1], "?n times 2": (m: Row) => m[2] * 2 } as const;
const expressionForm = { "?n": "?n", "?b": "?b", "?n times 2": ["number/multiply", "?n", 2] } as const;
const T2_KINDS = ["sum", "count", "countUnique", "min", "max", "mean", "collect", "unique"] as const;
const step = fc.oneof(
  fc.tuple(fc.constant("e"), fc.constantFrom("x", "y"), fc.constantFrom("p", "q", "r"), fc.integer({ min: 1, max: 4 }), fc.boolean()),
  fc.tuple(fc.constant("f"), fc.constantFrom("p", "q", "r"), fc.boolean())
);
let t2 = 0;
await fc.assert(
  fc.asyncProperty(
    fc.constantFrom(...T2_KINDS),
    fc.constantFrom(...(Object.keys(BODIES) as (keyof typeof BODIES)[])),
    fc.constantFrom(...(Object.keys(EXPRESSIONS) as (keyof typeof EXPRESSIONS)[])),
    fc.array(step, { minLength: 1, maxLength: 12 }),
    async (kind, body, expression, steps) => {
      if (["sum", "mean"].includes(kind) && expression === "?b") return true;
      const database = new LogicDatabase();
      await lion(["begin", ["relation", "e", ["a", "b", "n"]], ["relation", "f", ["b"]], ["relation", "s", ["a", "v"]],
        ["rule", ["s", "?a", [`aggregate/${kind}`, expressionForm[expression]]], ...BODIES[body]]], database);
      const e = new Map<string, Row>();
      const f = new Set<string>();
      for (const s of steps) {
        const [form, fact] = s[0] === "e"
          ? [s[4] ? "fact" : "retract", ["e", s[1], s[2], s[3]]]
          : [s[2] ? "fact" : "retract", ["f", s[1]]];
        if (s[0] === "e") form === "fact" ? e.set(`${s[1]}${s[2]}${s[3]}`, [s[1], s[2], s[3]]) : e.delete(`${s[1]}${s[2]}${s[3]}`);
        else form === "fact" ? f.add(s[1]) : f.delete(s[1]);
        const got = await lion(["begin", [form, fact], ["query", ["s", "?a", "?v"], { order: "a" }]], database);
        // The model: each group folds one value for each distinct match of the body.
        const matches = [...e.values()].filter((m) => body === "e and f" ? f.has(m[1]) : true);
        const groups = new Map<string, unknown[]>();
        for (const m of matches) groups.set(m[0], [...(groups.get(m[0]) ?? []), EXPRESSIONS[expression](m)]);
        const expected = [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([a, values]) => ({ a, v: AGGREGATORS[kind]!.fold(values) }));
        if (!same(got, expected)) {
          console.log("T2 counterexample", { kind, body, expression, steps, got, expected });
          return false;
        }
        t2++;
      }
      return true;
    }
  ),
  { numRuns: runs, seed: 2 }
);
console.log(`T2  Lion's aggregated relations equal the fold of each group's distinct matches after each of ${t2} fact changes`);

// ---------------------------------------------------------------- T3
const NODES = ["s", "a", "b", "c"];
const edgeStep = fc.tuple(fc.constantFrom(...NODES), fc.constantFrom(...NODES.slice(1), "s"), fc.constantFrom(1, 0.5, 0.25, 0.75), fc.boolean());
const bestProofs = (edges: [string, string, number][]) => {
  const best = new Map<string, number>();
  for (const [from, to, p] of edges) if (from === "s") best.set(to, Math.max(best.get(to) ?? 0, p));
  for (let changed = true; changed; ) {
    changed = false;
    for (const [from, to, p] of edges) {
      const via = best.get(from);
      if (via !== undefined && via * p > (best.get(to) ?? -1)) (best.set(to, via * p), (changed = true));
    }
  }
  return [...best.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([to, p]) => ({ to, p }));
};
let t3 = 0;
await fc.assert(
  fc.asyncProperty(fc.array(edgeStep, { minLength: 1, maxLength: 14 }), async (steps) => {
    const database = new LogicDatabase();
    await lion(["begin", ["relation", "edge", ["from", "to", "p"]], ["relation", "best", ["to", "p"]],
      ["rule", ["best", "?to", ["aggregate/max", "?p"]], ["edge", "s", "?to", "?p"]],
      ["rule", ["best", "?to", ["aggregate/max", ["number/multiply", "?q", "?p"]]], ["best", "?via", "?q"], ["edge", "?via", "?to", "?p"]]], database);
    const edges = new Map<string, [string, string, number]>();
    for (const [from, to, p, add] of steps) {
      const key = `${from}${to}${p}`;
      add ? edges.set(key, [from, to, p]) : edges.delete(key);
      const got = await lion(["begin", [add ? "fact" : "retract", ["edge", from, to, p]], ["query", ["best", "?to", "?p"], { order: "to" }]], database);
      const expected = bestProofs([...edges.values()]);
      if (!same(got, expected)) {
        console.log("T3 counterexample", { steps, got, expected });
        return false;
      }
      t3++;
    }
    return true;
  }),
  { numRuns: runs, seed: 3 }
);
console.log(`T3  best-proof probabilities through recursion equal a max-product model after each of ${t3} edge changes, retractions included`);

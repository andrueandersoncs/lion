import { Effect } from "effect";
import fc from "fast-check";
import { run } from "@lionlang/core/evaluation/evaluate";
import { stdlib } from "@lionlang/core/modules";
import { type Atom, chase, type Program, type Rule, show, type Term } from "./model.ts";

const v = (name: string): Term => ({ var: name });
const c = (name: string): Term => ({ const: name });
const at = (rel: string, ...args: Term[]): Atom => ({ rel, args });

// ------------------------------------------------ Lion's engine, for fidelity
const RELS = ["b1", "b2", "m1", "m2", "t1"];
const lionTerm = (t: Term) => ("var" in t ? t.var : t.const);
const lionAtom = (a: Atom) => [a.rel, ...a.args.map(lionTerm)];
export const toLion = (p: Program) => [
  "begin",
  ...RELS.map((r) => ["relation", r, ["c0", "c1"], ...(r in p.keys ? [{ key: "c0" }] : [])]),
  ...(p.facts.length ? [["fact", ...p.facts]] : []),
  ...p.rules.map((r) =>
    r.kind === "plain"
      ? ["rule", lionAtom(r.head), ...r.body.map(lionAtom)]
      : r.kind === "invent"
        ? ["rule", ["exists", [r.exists], lionAtom(r.head)], ...r.body.map(lionAtom)]
        : ["rule", ["=", r.left, r.right], ...r.body.map(lionAtom)]
  ),
  Object.fromEntries(RELS.map((r) => [r, ["query", [r, "?c0", "?c1"]]])),
];
const lion = async (p: Program) => {
  try {
    const out = (await Effect.runPromise(run(toLion(p), stdlib))) as Record<string, { c0: unknown; c1: unknown }[]>;
    return Object.fromEntries(
      Object.entries(JSON.parse(JSON.stringify(out)) as typeof out)
        .filter(([, rows]) => rows.length > 0)
        .map(([rel, rows]) => [rel, rows.map((r) => JSON.stringify([r.c0, r.c1])).sort()])
    );
  } catch (e) {
    return { error: String((e as Error)?.message ?? e).slice(0, 80) };
  }
};

// ------------------------------------------------------- the counterexample
const person = (p: string) => ["b1", p, p] as [string, string, string];
const counter = (swap: boolean): Program => {
  const e1: Rule = { kind: "equal", left: "?a", right: "?b", body: [at("m2", v("?x"), v("?a")), at("m1", c("b"), v("?b"))] };
  const e2: Rule = { kind: "equal", left: "?a", right: "?b", body: [at("m1", c("b"), v("?a")), at("m1", c("c"), v("?b")), at("m2", v("?y"), v("?z"))] };
  return {
    keys: {},
    facts: [person("b"), person("c")],
    rules: [
      { kind: "invent", exists: "?m", head: at("m1", v("?p"), v("?m")), body: [at("b1", v("?p"), v("?q"))] },
      { kind: "invent", exists: "?g", head: at("m2", v("?x"), v("?g")), body: [at("m1", c("c"), v("?x"))] },
      ...(swap ? [e2, e1] : [e1, e2]),
    ],
  };
};

// ------------------------------------------------------- random programs
const consts = fc.constantFrom("a", "b", "c");
const varOf = fc.constantFrom("?x", "?y", "?z");
const term = fc.oneof({ weight: 3, arbitrary: varOf.map(v) }, { weight: 1, arbitrary: consts.map(c) });
const base = fc.constantFrom("b1", "b2");
const atomOf = (rels: fc.Arbitrary<string>) => fc.tuple(rels, term, term).map(([r, a, b]) => at(r, a, b));
const bound = (body: readonly Atom[], name: string) => body.some((a) => a.args.some((t) => "var" in t && t.var === name));

const ruleArb: fc.Arbitrary<Rule> = fc.oneof(
  // invent a mother for each base row's first or second column
  fc.tuple(atomOf(base), fc.constantFrom(0, 1)).map(([b, i]) => {
    const x = b.args[i];
    return { kind: "invent", exists: "?m", head: at("m1", x, v("?m")), body: [b] } as Rule;
  }),
  // invent again over what was invented: unknowns nested in unknowns
  fc.constantFrom(0, 1).map((i) => {
    const body = [at("m1", i === 0 ? v("?x") : v("?y"), i === 0 ? v("?y") : v("?x"))];
    return { kind: "invent", exists: "?g", head: at("m2", v("?x"), v("?g")), body } as Rule;
  }),
  // copy known values into m1
  atomOf(base).map((b) => ({ kind: "plain", head: at("m1", b.args[0], b.args[1]), body: [b] }) as Rule),
  // derive t1 from anything below it
  fc.tuple(atomOf(fc.constantFrom("m1", "m2", "b1")), atomOf(fc.constantFrom("m1", "m2", "b2"))).map(
    ([a, b]) => ({ kind: "plain", head: at("t1", a.args[0], b.args[1]), body: [a, b] }) as Rule
  ),
  // equality rules over invented relations
  fc
    .tuple(atomOf(fc.constantFrom("m1", "m2", "t1")), atomOf(fc.constantFrom("m1", "m2", "t1")), fc.constantFrom(0, 1), fc.constantFrom(0, 1))
    .map(([a, b, i, j]) => {
      const left = a.args[i];
      const right = b.args[j];
      return "var" in left && "var" in right
        ? ({ kind: "equal", left: left.var, right: right.var, body: [a, b] } as Rule)
        : ({ kind: "plain", head: at("t1", a.args[0], b.args[1]), body: [a, b] } as Rule);
    })
);
const safe = (r: Rule) =>
  r.kind === "plain"
    ? r.head.args.every((t) => "const" in t || bound(r.body, t.var))
    : r.kind === "invent"
      ? r.head.args.every((t) => "const" in t || t.var === r.exists || bound(r.body, t.var))
      : bound(r.body, r.left) && bound(r.body, r.right);
// Programs built to merge: unknowns at two depths, and equality rules between them.
const slot = fc.constantFrom(
  [at("m1", v("?x"), v("?a"))], [at("m2", v("?x"), v("?a"))], [at("m1", c("a"), v("?a"))],
  [at("m1", c("b"), v("?a"))], [at("m2", v("?y"), v("?a")), at("m1", v("?z"), v("?y"))], [at("b1", v("?a"), v("?x"))]
);
const mergeRule = fc.tuple(slot, slot).map(([l, r]) => {
  const rename = (a: Atom): Atom => ({ ...a, args: a.args.map((t) => ("var" in t ? v(t.var === "?a" ? "?b" : `${t.var}2`) : t)) });
  return { kind: "equal", left: "?a", right: "?b", body: [...l, ...r.map(rename)] } as Rule;
});
const mergingArb: fc.Arbitrary<Program> = fc.record({
  keys: fc.subarray(["m1", "m2"]).map((ks) => Object.fromEntries(ks.map((k) => [k, 0]))),
  rules: fc.tuple(fc.array(mergeRule, { minLength: 1, maxLength: 3 }), fc.array(ruleArb, { maxLength: 2 })).map(([es, rs]) => [
    { kind: "invent", exists: "?m", head: at("m1", v("?p"), v("?m")), body: [at("b1", v("?p"), v("?q"))] } as Rule,
    { kind: "invent", exists: "?g", head: at("m2", v("?x"), v("?g")), body: [at("m1", v("?w"), v("?x"))] } as Rule,
    ...es, ...rs.filter(safe),
  ]),
  facts: fc.uniqueArray(fc.tuple(fc.constant("b1"), consts, consts), { minLength: 1, maxLength: 3, selector: (f) => f.join() }),
});
const programArb0: fc.Arbitrary<Program> = fc.record({
  keys: fc.subarray(["m1", "m2"]).map((ks) => Object.fromEntries(ks.map((k) => [k, 0]))),
  rules: fc.array(ruleArb, { minLength: 1, maxLength: 6 }).map((rs) => rs.filter(safe)),
  facts: fc.uniqueArray(fc.tuple(base, consts, consts), { minLength: 1, maxLength: 4, selector: (f) => f.join() }),
});
const programArb = fc.oneof(programArb0, mergingArb);
const permuted = <T>(xs: readonly T[], seed: number) => {
  const out = [...xs];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------- run them
const runs = Number(process.argv[2] ?? 300);
console.log("1. The counterexample, rule order swapped:");
for (const mode of ["lion", "view"] as const)
  console.log(`   ${mode}: ${same(show(chase(counter(false), mode)), show(chase(counter(true), mode))) ? "same" : "DIFFERENT"}`);
console.log(`   Lion itself: ${same(await lion(counter(false)), await lion(counter(true))) ? "same" : "DIFFERENT"}`);
console.log(`   model (lion mode) agrees with Lion on both orders: ${same(show(chase(counter(false), "lion")), await lion(counter(false))) && same(show(chase(counter(true), "lion")), await lion(counter(true)))}`);

const orderProperty = (mode: "lion" | "view") =>
  fc.check(
    fc.property(programArb, fc.nat(), (p, seed) => {
      const q = { ...p, rules: permuted(p.rules, seed), facts: permuted(p.facts, seed + 1) };
      const [a, b] = [show(chase(p, mode)), show(chase(q, mode))];
      if ("error" in a || "error" in b) return true; // refusals are compared elsewhere
      return same(a, b);
    }),
    { numRuns: runs * 10, seed: 42 }
  );
for (const mode of ["view", "lion"] as const) {
  const r = orderProperty(mode);
  console.log(`2. ${mode} mode is independent of rule and fact order: ${r.failed ? `NO, counterexample after ${r.numRuns} runs` : `yes, ${r.numRuns} programs`}`);
}

// An answer with every unknown written as "U": the rows, whatever unknown names each class.
const blind = (v: unknown): unknown => (Array.isArray(v) ? (v[0] === "some" ? "U" : v.map(blind)) : v);
const shape = (o: unknown) =>
  JSON.stringify(Object.entries(o as Record<string, string[]>).map(([rel, rows]) => [rel, rows.map((r) => JSON.stringify(blind(JSON.parse(r)))).sort()]));
const tally = { lion: { exact: 0, shape: 0, other: 0 }, view: { exact: 0, shape: 0, other: 0 } };
let lionRefused = 0, modelRefused = 0;
const examples: unknown[] = [];
await fc.assert(
  fc.asyncProperty(programArb, async (p) => {
    const theirs = await lion(p);
    if ("error" in theirs) return (lionRefused++, true);
    for (const mode of ["lion", "view"] as const) {
      const mine = show(chase(p, mode));
      if ("error" in mine) { modelRefused++; continue; }
      const t = tally[mode];
      if (same(mine, theirs)) t.exact++;
      else if (shape(mine) === shape(theirs)) t.shape++;
      else { t.other++; if (examples.length < 2) examples.push({ mode, program: toLion(p), model: mine, lion: theirs }); }
    }
    return true;
  }),
  { numRuns: runs, seed: 7 }
);
console.log(`3. against Lion's engine, ${runs} random programs (Lion refused ${lionRefused}; the model alone refused ${modelRefused}):`);
for (const mode of ["lion", "view"] as const)
  console.log(`   ${mode} mode: same answer ${tally[mode].exact}, same rows but another unknown names a class ${tally[mode].shape}, different rows ${tally[mode].other}`);
await Bun.write("examples.json", JSON.stringify(examples));

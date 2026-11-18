import fc from "fast-check";
import type { Atom, Program, Rule, Term } from "./model.ts";
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
export const programArb = fc.oneof(programArb0, mergingArb);

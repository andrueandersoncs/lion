import fc from "fast-check";
import { chase, show } from "./model.ts";
import { programArb } from "./gen.ts";
const permuted = <T>(xs: readonly T[], seed: number) => { const out = [...xs]; let s = seed; for (let i = out.length - 1; i > 0; i--) { s = (s * 1103515245 + 12345) % 2147483648; const j = s % (i + 1); [out[i], out[j]] = [out[j], out[i]]; } return out; };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
for (const mode of ["lion", "patched"] as const) {
  const r = fc.check(fc.property(programArb, fc.nat(), (p, seed) => {
    const q = { ...p, rules: permuted(p.rules, seed), facts: permuted(p.facts, seed + 1) };
    const [a, b] = [show(chase(p, mode)), show(chase(q, mode))];
    return "error" in a || "error" in b || same(a, b);
  }), { numRuns: 10000, seed: 42 });
  let agree = 0, n = 0;
  fc.assert(fc.property(programArb, (p) => { const [a, b] = [show(chase(p, mode)), show(chase(p, "view"))]; if (!("error" in a)) { n++; if (same(a, b)) agree++; } return true; }), { numRuns: 3000, seed: 5 });
  console.log(`${mode}: independent of rule and fact order: ${r.failed ? `NO, after ${r.numRuns} programs` : `yes, ${r.numRuns} programs`}; same answer as the least-member view on ${agree} of ${n}`);
}

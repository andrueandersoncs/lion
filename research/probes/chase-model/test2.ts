import { Effect } from "effect";
import fc from "fast-check";
import { run } from "@lionlang/core/evaluation/evaluate";
import { stdlib } from "@lionlang/core/modules";
import { Classes, fromScratch } from "./classes.ts";
import { chase, compareNew, keyOf, show, type Unk, type Val } from "./model.ts";
import { programArb, toLion } from "./gen.ts";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const runs = Number(process.argv[2] ?? 300);

// Same up to renaming: some one-to-one renaming of the unknowns maps one answer onto the other.
const renamable = (x: Record<string, string[]>, y: Record<string, string[]>) => {
  const unknownsOf = (o: Record<string, string[]>) => {
    const found = new Set<string>();
    const walk = (v: unknown) => (Array.isArray(v) ? (v[0] === "some" ? found.add(JSON.stringify(v)) : v.forEach(walk)) : undefined);
    for (const rows of Object.values(o)) for (const r of rows) walk(JSON.parse(r));
    return [...found];
  };
  const [ux, uy] = [unknownsOf(x), unknownsOf(y)];
  if (ux.length !== uy.length || ux.length > 8) return false;
  const rename = (o: Record<string, string[]>, map: Map<string, number>) =>
    JSON.stringify(Object.entries(o).map(([rel, rows]) => [rel, rows.map((r) => JSON.stringify(JSON.parse(r), (_k, v) => (Array.isArray(v) && v[0] === "some" ? `U${map.get(JSON.stringify(v))}` : v))).sort()]));
  const target = rename(y, new Map(uy.map((u, i) => [u, i])));
  const perms = (n: number): number[][] => (n === 0 ? [[]] : perms(n - 1).flatMap((p) => Array.from({ length: n }, (_, i) => [...p.slice(0, i), n - 1, ...p.slice(i)])));
  return perms(ux.length).some((p) => rename(x, new Map(ux.map((u, i) => [u, p[i]]))) === target);
};
const lionRun = async (program: unknown) => {
  try {
    const out = (await Effect.runPromise(run(program, stdlib))) as unknown[];
    const last = JSON.parse(JSON.stringify(out)) as Record<string, { c0: unknown; c1: unknown }[]>;
    return Object.fromEntries(Object.entries(last).filter(([, r]) => r.length > 0).map(([rel, rows]) => [rel, rows.map((r) => JSON.stringify([r.c0, r.c1])).sort()]));
  } catch (e) {
    return { error: String((e as Error)?.message ?? e).slice(0, 60) };
  }
};

// (A) the proposed semantics against Lion, aware of which places share an unknown
let exact = 0, samePartition = 0, other = 0, refused = 0;
const examplesA: unknown[] = [];
await fc.assert(fc.asyncProperty(programArb, async (p) => {
  const theirs = await lionRun(toLion(p));
  if ("error" in theirs) return (refused++, true);
  const mine = show(chase(p, "view")) as Record<string, string[]>;
  if (same(mine, theirs)) exact++;
  else if (renamable(mine, theirs)) samePartition++;
  else { other++; if (examplesA.length < 2) examplesA.push({ program: toLion(p), mine, theirs }); }
  return true;
}), { numRuns: runs, seed: 7 });
await Bun.write("a-examples.json", JSON.stringify(examplesA));
console.log(`A. proposed semantics vs Lion, ${runs} programs (Lion refused ${refused}): same answer ${exact}, same rows and same sharing under other names ${samePartition}, different ${other}`);

// (B) Lion today: facts added one at a time, or one retracted, against from scratch
const withSteps = (p: ReturnType<typeof toLion>, facts: unknown[][], retract?: unknown[]) => {
  const program = p as unknown[];
  const head = program.filter((f) => !(Array.isArray(f) && f[0] === "fact")).slice(0, -1);
  const ask = ["query", ["m1", "?a", "?b"]];
  const steps = facts.flatMap((f) => [["fact", f], ask, ["query", ["m2", "?a", "?b"]], ["query", ["t1", "?a", "?b"]]]);
  return ["begin", ...head, ...steps, ...(retract ? [["retract", retract], ask] : []), program.at(-1)];
};
let histSame = 0, histName = 0, histOther = 0, histRefusedOnlyOne = 0;
const histExamples: unknown[] = [];
await fc.assert(fc.asyncProperty(programArb, fc.nat(), async (p, pick) => {
  const facts = p.facts as unknown as unknown[][];
  if (facts.length < 2) return true;
  const gone = facts[pick % facts.length];
  const kept = facts.filter((f) => f !== gone);
  if ("error" in (await lionRun(toLion(p)))) return true; // the fact retracted later is refused on its own
  const scratch = await lionRun(toLion({ ...p, facts: kept as never }));
  const stepwise = await lionRun(withSteps(toLion(p), facts, gone));
  if ("error" in scratch || "error" in stepwise) {
    if ("error" in scratch !== "error" in stepwise) histRefusedOnlyOne++;
    return true;
  }
  if (same(scratch, stepwise)) histSame++;
  else if (renamable(scratch, stepwise)) histName++;
  else { histOther++; if (histExamples.length < 1) histExamples.push({ program: withSteps(toLion(p), facts, gone), stepwise, scratch }); }
  return true;
}), { numRuns: runs, seed: 11 });
console.log(`B. Lion adding facts one by one then retracting one, vs from scratch: same ${histSame}, other names ${histName}, different rows ${histOther}, only one of the two refused ${histRefusedOnlyOne}`);
await Bun.write("history-examples.json", JSON.stringify(histExamples));

// (C) the classes operator under insertions and deletions, against from scratch
const unk = (rel: string, arg: Val): Unk => ({ v: rel === "m1" ? "?m" : "?g", rel, args: [arg, null] });
const universe: Val[] = ["a", "b"];
for (const x of ["a", "b", "c"]) universe.push(unk("m1", x));
for (const x of [...universe.slice(2)]) universe.push(unk("m2", x));
const step = fc.tuple(fc.nat(universe.length - 1), fc.nat(universe.length - 1), fc.boolean());
let checked = 0, touched = 0, everything = 0;
fc.assert(fc.property(fc.array(step, { minLength: 1, maxLength: 40 }), (steps) => {
  const ops = new Classes(keyOf, compareNew);
  for (const v of universe) ops.member(v);
  const live: [Val, Val][] = [];
  for (const [i, j, add] of steps) {
    const [a, b] = [universe[i], universe[j]];
    const at = live.findIndex(([x, y]) => keyOf(x) === keyOf(a) && keyOf(y) === keyOf(b));
    if (add || at < 0) (ops.change(a, b, 1), live.push([a, b]));
    else (ops.change(a, b, -1), live.splice(at, 1));
    const expected = fromScratch(live, keyOf, compareNew, universe);
    const got = ops.all();
    for (const v of universe) if (expected.get(keyOf(v)) !== got.get(keyOf(v))) return false;
    checked++;
  }
  return true;
}), { numRuns: runs * 10, seed: 3 });
console.log(`C. the classes operator equals from-scratch classes after each of ${checked} random insertions and deletions`);

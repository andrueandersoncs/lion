// A small executable model of Lion's restricted, parallel chase with keys and
// equality rules, in which merged values are a derived view: each class keeps
// its least member under one fixed total order. `mode: "lion"` instead merges
// as Lion 0.13 does, pairwise in the order merges are found.

export type Val = string | Unk;
export interface Unk {
  readonly v: string; // the variable, e.g. "?m"
  readonly rel: string;
  readonly args: readonly (Val | null)[]; // null marks the variable's place
}
export type Term = { var: string } | { const: string };
export interface Atom {
  readonly rel: string;
  readonly args: readonly Term[];
}
export type Rule =
  | { kind: "plain"; head: Atom; body: readonly Atom[] }
  | { kind: "invent"; exists: string; head: Atom; body: readonly Atom[] }
  | { kind: "equal"; left: string; right: string; body: readonly Atom[] };
export interface Program {
  readonly keys: Readonly<Record<string, number>>; // relation -> key column
  readonly rules: readonly Rule[];
  readonly facts: readonly [string, ...string[]][];
}
export type Rows = Map<string, Map<string, Val[]>>;
export type Outcome = { rows: Rows } | { error: string };

const isUnk = (v: unknown): v is Unk => typeof v === "object" && v !== null && "rel" in v;

/** How Lion writes a value, which is also how it sorts. */
export const written = (v: Val): unknown =>
  isUnk(v) ? ["some", v.v, [v.rel, ...v.args.map((a) => (a === null ? v.v : written(a)))]] : v;
export const keyOf = (v: Val) => JSON.stringify(written(v));

const rank = (v: unknown) =>
  v === null ? 0 : typeof v === "boolean" ? 1 : typeof v === "number" ? 2 : typeof v === "string" ? 3 : Array.isArray(v) ? 4 : 5;
/** Lion's order of values (terms.ts compareValues), on written forms. */
export const compareWritten = (a: unknown, b: unknown): number => {
  const r = rank(a) - rank(b);
  if (r !== 0) return Math.sign(r);
  if (typeof a === "string" && typeof b === "string") return a === b ? 0 : a < b ? -1 : 1;
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const c = compareWritten(a[i], b[i]);
      if (c !== 0) return c;
    }
    return Math.sign(a.length - b.length);
  }
  return 0;
};
/** Lion's order: known values first, then unknowns by how they are written. */
export const compareLion = (a: Val, b: Val) =>
  isUnk(a) !== isUnk(b) ? (isUnk(a) ? 1 : -1) : compareWritten(written(a), written(b));

export const depth = (v: Val): number =>
  isUnk(v) ? 1 + Math.max(0, ...v.args.map((a) => (a === null ? 0 : depth(a)))) : 0;
/** The proposed order: known values, then unknowns that nest fewer unknowns, then Lion's order. */
export const compareNew = (a: Val, b: Val) =>
  isUnk(a) !== isUnk(b) ? (isUnk(a) ? 1 : -1) : depth(a) - depth(b) || compareLion(a, b);

export const occurs = (u: Unk, v: Val): boolean =>
  isUnk(v) && (keyOf(u) === keyOf(v) || v.args.some((a) => a !== null && occurs(u, a)));

// ---------------------------------------------------------------- matching

type Env = Map<string, Val>;
const matchAtom = (atom: Atom, row: Val[], env: Env): Env | undefined => {
  const out = new Map(env);
  for (let i = 0; i < atom.args.length; i++) {
    const t = atom.args[i];
    if ("const" in t) {
      if (row[i] !== t.const) return;
    } else {
      const bound = out.get(t.var);
      if (bound === undefined) out.set(t.var, row[i]);
      else if (keyOf(bound) !== keyOf(row[i])) return;
    }
  }
  return out;
};
const matches = (body: readonly Atom[], rows: Rows): Env[] => {
  let envs: Env[] = [new Map()];
  for (const atom of body) {
    const next: Env[] = [];
    for (const env of envs)
      for (const row of rows.get(atom.rel)?.values() ?? []) {
        const e = matchAtom(atom, row, env);
        if (e) next.push(e);
      }
    envs = next;
  }
  return envs;
};
const value = (t: Term, env: Env): Val => ("const" in t ? t.const : env.get(t.var)!);

const addRow = (rows: Rows, rel: string, row: Val[]) => {
  const k = JSON.stringify(row.map(written));
  let m = rows.get(rel);
  if (!m) rows.set(rel, (m = new Map()));
  if (m.has(k)) return false;
  m.set(k, row);
  return true;
};

// ---------------------------------------------------------- equality layer

/**
 * The derived view: classes of the edges found so far, each represented by
 * its least member, applied deeply (inside what unknowns describe too), until
 * rewriting a description makes no unknown new. Fails on two known values in
 * one class, or an unknown whose class holds a value that describes it.
 */
export const classesOf = (edges: readonly [Val, Val][], order: (a: Val, b: Val) => number) => {
  const all = new Map<string, Val>();
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    const p = parent.get(k)!;
    if (p === k) return k;
    const r = find(p);
    parent.set(k, r);
    return r;
  };
  const see = (v: Val) => {
    const k = keyOf(v);
    if (!all.has(k)) (all.set(k, v), parent.set(k, k));
    return k;
  };
  const union = (a: Val, b: Val) => {
    const [x, y] = [find(see(a)), find(see(b))];
    if (x !== y) parent.set(x, y);
  };
  for (const [a, b] of edges) union(a, b);
  for (;;) {
    const rep = new Map<string, Val>();
    for (const [k, v] of all) {
      const r = find(k);
      const cur = rep.get(r);
      if (cur === undefined || order(v, cur) < 0) rep.set(r, v);
    }
    const canon = (v: Val): Val => {
      if (!isUnk(v)) return all.has(v) ? rep.get(find(v))! : v;
      const inner: Unk = { ...v, args: v.args.map((a) => (a === null ? null : canon(a))) };
      const k = keyOf(inner);
      return all.has(k) ? rep.get(find(k))! : inner;
    };
    // Congruence: an unknown whose description rewrites to another is that other.
    let grew = false;
    for (const v of [...all.values()])
      if (isUnk(v)) {
        const inner: Unk = { ...v, args: v.args.map((a) => (a === null ? null : canon(a))) };
        if (keyOf(inner) !== keyOf(v) && find(see(inner)) !== find(keyOf(v))) (union(v, inner), (grew = true));
      }
    if (grew) continue;
    const inside = (v: Val): Val[] => (isUnk(v) ? v.args.flatMap((a) => (a === null ? [] : [a, ...inside(a)])) : []);
    for (const [k, v] of all) {
      const r = rep.get(find(k))!;
      if (!isUnk(v) && !isUnk(r) && v !== r) return { error: `two known values made one: ${v}, ${r}` } as const;
      // The value a class is written as must not hold a member of its class,
      // or that unknown would describe itself.
      if (keyOf(v) === keyOf(r) && inside(r).some((w) => all.has(keyOf(w)) && find(keyOf(w)) === find(k)))
        return { error: "an unknown would describe itself" } as const;
    }
    return { canon } as const;
  }
};

// ------------------------------------------------------------- the chase

/** Lion 0.13's pairwise merge, in the order merges are found (model.ts unify). */
const lionMerger = (order?: (a: Val, b: Val) => number) => {
  const equal = new Map<string, Val>();
  const settled = (v: Val): Val => {
    if (!isUnk(v)) return v;
    const e = equal.get(keyOf(v));
    if (e !== undefined) return settled(e);
    const inner: Unk = { ...v, args: v.args.map((a) => (a === null ? null : settled(a))) };
    return keyOf(inner) === keyOf(v) ? v : settled(inner);
  };
  const unify = (left: Val, right: Val): string | undefined => {
    const [a, b] = [settled(left), settled(right)];
    if (keyOf(a) === keyOf(b)) return;
    if (!isUnk(a) && !isUnk(b)) return `two known values made one: ${a}, ${b}`;
    const keeps = order
      ? (x: Val, y: Val) => order(x, y) < 0
      : (x: Val, y: Val) => !isUnk(x) || occurs(x, y) || (isUnk(y) && !occurs(y, x) && compareLion(x, y) < 0);
    const [from, to] = keeps(b, a) ? [a, b] : [b, a];
    if (occurs(from as Unk, to)) return "an unknown would describe itself";
    equal.set(keyOf(from), to);
  };
  return { unify, settled };
};

export const chase = (p: Program, mode: "view" | "lion" | "patched" = "view", maxRounds = 12): Outcome => {
  let rows: Rows = new Map();
  for (const [rel, ...args] of p.facts) addRow(rows, rel, args);
  const edges: [Val, Val][] = [];
  const lion = mode === "lion" ? lionMerger() : mode === "patched" ? lionMerger(compareNew) : undefined;
  const canonRows = (canon: (v: Val) => Val) => {
    const next: Rows = new Map();
    for (const [rel, m] of rows) for (const row of m.values()) addRow(next, rel, row.map(canon));
    return next;
  };
  const edge = (a: Val, b: Val) => {
    if (keyOf(a) === keyOf(b)) return undefined;
    if (lion) return lion.unify(a, b);
    edges.push([a, b]);
  };
  for (let round = 0; round < maxRounds; round++) {
    for (let guard = 0; ; guard++) {
      if (guard > 200) return { error: "no fixpoint" };
      let changed = false;
      for (const r of p.rules)
        if (r.kind === "plain")
          for (const env of matches(r.body, rows))
            changed = addRow(rows, r.head.rel, r.head.args.map((t) => value(t, env))) || changed;
      const before = edges.length;
      for (const r of p.rules)
        if (r.kind === "equal")
          for (const env of matches(r.body, rows)) {
            const problem = edge(env.get(r.left)!, env.get(r.right)!);
            if (problem) return { error: problem };
          }
      for (const [rel, col] of Object.entries(p.keys)) {
        const byKey = new Map<string, Val[][]>();
        for (const row of rows.get(rel)?.values() ?? []) {
          const k = keyOf(row[col]);
          byKey.set(k, [...(byKey.get(k) ?? []), row]);
        }
        for (const group of byKey.values())
          for (let i = 1; i < group.length; i++)
            for (let c = 0; c < group[i].length; c++) {
              const problem = edge(group[0][c], group[i][c]);
              if (problem) return { error: problem };
            }
      }
      let next: Rows;
      if (lion) next = canonRows(lion.settled);
      else {
        const cls = classesOf(edges, compareNew);
        if ("error" in cls) return { error: cls.error };
        next = canonRows(cls.canon);
      }
      const same = JSON.stringify(dump(next)) === JSON.stringify(dump(rows));
      rows = next;
      if (!changed && same && edges.length === before) break;
    }
    // Invent, all at once, for every answer whose head does not hold.
    const invented: [string, Val[]][] = [];
    for (const r of p.rules)
      if (r.kind === "invent")
        for (const env of matches(r.body, rows)) {
          const known = r.head.args.map((t) => ("var" in t && t.var === r.exists ? undefined : value(t, env)));
          const holds = [...(rows.get(r.head.rel)?.values() ?? [])].some((row) =>
            known.every((v, i) => v === undefined || keyOf(v) === keyOf(row[i]))
          );
          if (holds) continue;
          const u: Unk = { v: r.exists, rel: r.head.rel, args: known.map((v) => v ?? null) };
          invented.push([r.head.rel, known.map((v) => v ?? u)]);
        }
    let any = false;
    for (const [rel, row] of invented) any = addRow(rows, rel, row) || any;
    if (!any) return { rows };
  }
  return { error: "too many rounds" };
};

/** Rows as sorted written JSON, for comparing outcomes. */
export const dump = (rows: Rows) =>
  Object.fromEntries(
    [...rows.entries()]
      .filter(([, m]) => m.size > 0)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([rel, m]) => [rel, [...m.keys()].sort()])
  );
export const show = (o: Outcome) => ("error" in o ? { error: o.error.split(":")[0] } : dump(o.rows));

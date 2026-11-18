// The one operator the design needs beyond DBSP's: equivalence classes of a
// changing set of edges, each named by its least member. A change touches only
// the classes its edges are in: an added edge joins two classes, and a removed
// edge recomputes the one class it was in.

export class Classes<V> {
  private readonly classOf = new Map<string, Set<string>>(); // member -> its class
  private readonly edges = new Map<string, number>(); // "a|b" -> how many times added
  private readonly adjacent = new Map<string, Map<string, number>>();
  private readonly values = new Map<string, V>();
  constructor(
    private readonly key: (v: V) => string,
    private readonly order: (a: V, b: V) => number
  ) {}

  private see(v: V) {
    const k = this.key(v);
    if (!this.values.has(k)) {
      this.values.set(k, v);
      this.classOf.set(k, new Set([k]));
      this.adjacent.set(k, new Map());
    }
    return k;
  }
  private least(members: Iterable<string>) {
    let best: string | undefined;
    for (const m of members) if (best === undefined || this.order(this.values.get(m)!, this.values.get(best)!) < 0) best = m;
    return best!;
  }
  /** Each member's representative, for the members of the classes given. */
  private reps(classes: Iterable<Set<string>>) {
    const out = new Map<string, string>();
    for (const c of classes) {
      const r = this.least(c);
      for (const m of c) out.set(m, r);
    }
    return out;
  }
  private bump(a: string, b: string, by: number) {
    for (const [x, y] of [[a, b], [b, a]] as const) {
      const n = (this.adjacent.get(x)!.get(y) ?? 0) + by;
      if (n === 0) this.adjacent.get(x)!.delete(y);
      else this.adjacent.get(x)!.set(y, n);
    }
  }

  /**
   * Adds (+1) or removes (-1) an edge, and returns what changed: each member
   * whose representative is now another, with its old and new one. Work is
   * proportional to the classes the edge is in, not to all the classes.
   */
  change(a: V, b: V, weight: 1 | -1): Map<string, [string, string]> {
    const [ka, kb] = [this.see(a), this.see(b)];
    const before = this.reps(new Set([this.classOf.get(ka)!, this.classOf.get(kb)!]));
    this.bump(ka, kb, weight);
    if (weight === 1) {
      const [x, y] = [this.classOf.get(ka)!, this.classOf.get(kb)!];
      if (x !== y) {
        const [big, small] = x.size >= y.size ? [x, y] : [y, x];
        for (const m of small) (big.add(m), this.classOf.set(m, big));
      }
    } else {
      // Recompute only the class the edge was in, by walking its edges.
      const old = this.classOf.get(ka)!;
      const unseen = new Set(old);
      while (unseen.size > 0) {
        const start = unseen.values().next().value as string;
        const part = new Set([start]);
        unseen.delete(start);
        for (const m of part)
          for (const n of this.adjacent.get(m)!.keys()) if (unseen.delete(n)) part.add(n);
        for (const m of part) this.classOf.set(m, part);
      }
    }
    const after = this.reps(new Set([this.classOf.get(ka)!, this.classOf.get(kb)!]));
    const changed = new Map<string, [string, string]>();
    for (const [m, r] of after) if (before.get(m) !== r) changed.set(m, [before.get(m)!, r]);
    return changed;
  }

  /** Makes a value known to the operator, in a class of its own. */
  member(v: V) {
    this.see(v);
  }

  /** Every member's representative. */
  all() {
    return this.reps(new Set(this.classOf.values()));
  }
}

/** The same thing from scratch with a plain union-find, for checking. */
export const fromScratch = <V>(edges: readonly [V, V][], key: (v: V) => string, order: (a: V, b: V) => number, members: Iterable<V>) => {
  const parent = new Map<string, string>();
  const value = new Map<string, V>();
  const find = (k: string): string => (parent.get(k) === k ? k : find(parent.get(k)!));
  for (const m of members) (parent.set(key(m), key(m)), value.set(key(m), m));
  for (const [a, b] of edges) {
    for (const v of [a, b]) if (!parent.has(key(v))) (parent.set(key(v), key(v)), value.set(key(v), v));
    const [x, y] = [find(key(a)), find(key(b))];
    if (x !== y) parent.set(x, y);
  }
  const best = new Map<string, string>();
  for (const k of parent.keys()) {
    const r = find(k), cur = best.get(r);
    if (cur === undefined || order(value.get(k)!, value.get(cur)!) < 0) best.set(r, k);
  }
  return new Map([...parent.keys()].map((k) => [k, best.get(find(k))!]));
};

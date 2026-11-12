/**
 * Graph algorithms over relations whose first two columns are edges, from and
 * to. Each is an algorithm goal: `["graph/pageRank", "edge", "?node", "?rank"]`.
 * Results never depend on the order facts were added: ties and component
 * names go to the smaller value.
 */
import { defineAlgorithm } from "@/logic/algorithms";
import { stronglyConnected as stronglyConnectedGroups } from "@/logic/strata";
import { compareValues, valueKey } from "@/logic/terms";

type Row = readonly unknown[];

interface Edge {
  readonly from: unknown;
  readonly to: unknown;
  readonly weight: number;
}

const show = (value: unknown) => JSON.stringify(value);

/** Reads edges from tuples; weights come from a third column when asked. */
const readEdges = (
  name: string,
  tuples: readonly Row[],
  weighted: boolean
): Edge[] | string => {
  const edges: Edge[] = [];
  for (const tuple of tuples) {
    if (tuple.length < 2) {
      return `${name} needs a relation with at least two columns, from and to.`;
    }
    const weight = weighted && tuple.length > 2 ? tuple[2] : 1;
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0) {
      return `${name} needs weights of at least 0 in the third column, but found ${show(weight)}.`;
    }
    edges.push({ from: tuple[0], to: tuple[1], weight });
  }
  return edges;
};

/** Every node mentioned by an edge, sorted. */
const nodesOf = (edges: readonly Edge[]) => {
  const nodes = new Map<string, unknown>();
  for (const { from, to } of edges) {
    nodes.set(valueKey(from), from);
    nodes.set(valueKey(to), to);
  }
  return [...nodes.values()].sort(compareValues);
};

/** A binary heap ordered by `before`. */
class Heap<T> {
  private readonly items: T[] = [];
  private readonly before: (a: T, b: T) => boolean;

  constructor(before: (a: T, b: T) => boolean) {
    this.before = before;
  }

  get size() {
    return this.items.length;
  }

  push(item: T) {
    const { items } = this;
    items.push(item);
    let at = items.length - 1;
    while (at > 0) {
      const parent = Math.floor((at - 1) / 2);
      if (!this.before(items[at] as T, items[parent] as T)) {
        break;
      }
      [items[at], items[parent]] = [items[parent] as T, items[at] as T];
      at = parent;
    }
  }

  pop(): T | undefined {
    const { items } = this;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0 && last !== undefined) {
      items[0] = last;
      let at = 0;
      for (;;) {
        const left = at * 2 + 1;
        const right = left + 1;
        let next = at;
        if (
          left < items.length &&
          this.before(items[left] as T, items[next] as T)
        ) {
          next = left;
        }
        if (
          right < items.length &&
          this.before(items[right] as T, items[next] as T)
        ) {
          next = right;
        }
        if (next === at) {
          break;
        }
        [items[at], items[next]] = [items[next] as T, items[at] as T];
        at = next;
      }
    }
    return top;
  }
}

const adjacency = (edges: readonly Edge[]) => {
  const out = new Map<string, Edge[]>();
  for (const edge of edges) {
    const key = valueKey(edge.from);
    const list = out.get(key);
    if (list === undefined) {
      out.set(key, [edge]);
    } else {
      list.push(edge);
    }
  }
  return out;
};

interface Route {
  readonly cost: number;
  readonly node: unknown;
  readonly path: readonly unknown[];
}

const shorter = (a: Route, b: Route) =>
  a.cost < b.cost || (a.cost === b.cost && compareValues(a.path, b.path) < 0);

/** Dijkstra's algorithm from one start node, in order of cost. */
const shortestPath = (tuples: readonly Row[], start: unknown) => {
  const edges = readEdges("graph/shortestPath", tuples, true);
  if (typeof edges === "string") {
    return edges;
  }
  const out = adjacency(edges);
  const best = new Map<string, Route>();
  const settled = new Set<string>();
  const rows: Row[] = [];
  const queue = new Heap<Route>(shorter);
  const first = { cost: 0, node: start, path: [start] };
  best.set(valueKey(start), first);
  queue.push(first);
  for (let route = queue.pop(); route !== undefined; route = queue.pop()) {
    const key = valueKey(route.node);
    if (settled.has(key) || best.get(key) !== route) {
      continue;
    }
    settled.add(key);
    rows.push([route.node, route.cost, route.path]);
    for (const edge of out.get(key) ?? []) {
      const next = {
        cost: route.cost + edge.weight,
        node: edge.to,
        path: [...route.path, edge.to],
      };
      const target = valueKey(edge.to);
      const known = best.get(target);
      if (
        !settled.has(target) &&
        (known === undefined || shorter(next, known))
      ) {
        best.set(target, next);
        queue.push(next);
      }
    }
  }
  return rows;
};

const DAMPING = 0.85;
const MAX_ITERATIONS = 100;
const TOLERANCE = 1e-12;

const round = (value: number) => Math.round(value * 1e6) / 1e6;

/** PageRank with damping 0.85; dangling nodes share their rank evenly. */
const pageRank = (tuples: readonly Row[]) => {
  const edges = readEdges("graph/pageRank", tuples, false);
  if (typeof edges === "string") {
    return edges;
  }
  const nodes = nodesOf(edges);
  const index = new Map(nodes.map((node, at) => [valueKey(node), at]));
  const links = nodes.map(() => new Set<number>());
  for (const { from, to } of edges) {
    links[index.get(valueKey(from)) ?? 0]?.add(index.get(valueKey(to)) ?? 0);
  }
  const count = nodes.length;
  let rank: number[] = nodes.map(() => 1 / count);
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const dangling = rank.reduce(
      (total, value, at) => (links[at]?.size === 0 ? total + value : total),
      0
    );
    const next = nodes.map(() => (1 - DAMPING + DAMPING * dangling) / count);
    for (const [at, targets] of links.entries()) {
      for (const target of targets) {
        next[target] =
          (next[target] ?? 0) + (DAMPING * (rank[at] ?? 0)) / targets.size;
      }
    }
    const change = next.reduce(
      (total, value, at) => total + Math.abs(value - (rank[at] ?? 0)),
      0
    );
    rank = next;
    if (change < TOLERANCE) {
      break;
    }
  }
  return nodes.map((node, at) => [node, round(rank[at] ?? 0)]);
};

/**
 * Groups nodes that reach each other, and names each group after its
 * smallest member. With `bothWays` every edge can be followed backwards too,
 * which makes the groups the connected components.
 */
const groups =
  (name: string, bothWays: boolean) => (tuples: readonly Row[]) => {
    const edges = readEdges(name, tuples, false);
    if (typeof edges === "string") {
      return edges;
    }
    const targets = new Map<string, string[]>();
    const link = (from: unknown, to: unknown) => {
      const list = targets.get(valueKey(from)) ?? [];
      list.push(valueKey(to));
      targets.set(valueKey(from), list);
    };
    for (const { from, to } of edges) {
      link(from, to);
      if (bothWays) {
        link(to, from);
      }
    }
    const nodes = nodesOf(edges);
    const group = new Map<string, number>();
    const found = stronglyConnectedGroups(
      nodes.map(valueKey),
      (key) => targets.get(key) ?? []
    );
    for (const [index, members] of found.entries()) {
      for (const member of members) {
        group.set(member, index);
      }
    }
    // Nodes are sorted, so the first node seen of a group is its smallest.
    const smallest = new Map<number | undefined, unknown>();
    for (const node of nodes) {
      const index = group.get(valueKey(node));
      if (!smallest.has(index)) {
        smallest.set(index, node);
      }
    }
    return nodes.map((node) => [node, smallest.get(group.get(valueKey(node)))]);
  };

const components = groups("graph/components", true);
const stronglyConnected = groups("graph/stronglyConnected", false);

/** Kahn's algorithm; among nodes that are ready, the smaller comes first. */
const topologicalOrder = (tuples: readonly Row[]) => {
  const edges = readEdges("graph/topologicalOrder", tuples, false);
  if (typeof edges === "string") {
    return edges;
  }
  const nodes = nodesOf(edges);
  const out = adjacency(edges);
  const waiting = new Map(nodes.map((node) => [valueKey(node), 0]));
  for (const { to } of edges) {
    const key = valueKey(to);
    waiting.set(key, (waiting.get(key) ?? 0) + 1);
  }
  const ready = new Heap<unknown>((a, b) => compareValues(a, b) < 0);
  for (const node of nodes) {
    if (waiting.get(valueKey(node)) === 0) {
      ready.push(node);
    }
  }
  const rows: Row[] = [];
  for (let node = ready.pop(); node !== undefined; node = ready.pop()) {
    rows.push([node, rows.length]);
    for (const { to } of out.get(valueKey(node)) ?? []) {
      const key = valueKey(to);
      const left = (waiting.get(key) ?? 0) - 1;
      waiting.set(key, left);
      if (left === 0) {
        ready.push(to);
      }
    }
  }
  if (rows.length < nodes.length) {
    const stuck = nodes.filter(
      (node) => (waiting.get(valueKey(node)) ?? 0) > 0
    );
    return `graph/topologicalOrder found a cycle among ${stuck.slice(0, 5).map(show).join(", ")}${stuck.length > 5 ? ", …" : ""}.`;
  }
  return rows;
};

const EDGES = { kind: "relation", name: "edges" } as const;

export const module = {
  symbol: Symbol("graph"),

  shortestPath: defineAlgorithm({
    name: "graph/shortestPath",
    inputs: [EDGES, { kind: "value", name: "start" }],
    columns: ["to", "cost", "path"],
    run: ([tuples, start]) => shortestPath(tuples as readonly Row[], start),
  }),

  pageRank: defineAlgorithm({
    name: "graph/pageRank",
    inputs: [EDGES],
    columns: ["node", "rank"],
    run: ([tuples]) => pageRank(tuples as readonly Row[]),
  }),

  components: defineAlgorithm({
    name: "graph/components",
    inputs: [EDGES],
    columns: ["node", "component"],
    run: ([tuples]) => components(tuples as readonly Row[]),
  }),

  stronglyConnected: defineAlgorithm({
    name: "graph/stronglyConnected",
    inputs: [EDGES],
    columns: ["node", "component"],
    run: ([tuples]) => stronglyConnected(tuples as readonly Row[]),
  }),

  topologicalOrder: defineAlgorithm({
    name: "graph/topologicalOrder",
    inputs: [EDGES],
    columns: ["node", "position"],
    run: ([tuples]) => topologicalOrder(tuples as readonly Row[]),
  }),
};

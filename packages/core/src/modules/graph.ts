/**
 * Graph algorithms over relations whose first two columns are edges, from and
 * to. Each is an algorithm goal: `["graph/pageRank", "edge", "?node", "?rank"]`.
 * Results never depend on the order facts were added: ties and component
 * names go to the smaller value.
 */

import { defineAlgorithm } from "@/logic/algorithms";
import { stronglyConnected as stronglyConnectedGroups } from "@/logic/strata";
import { compareValues, valueKey } from "@/logic/terms";
import {
  compareNumbers,
  isNumber,
  type LionNumber,
  sum,
} from "@/numbers/exact";

type Row = readonly unknown[];

interface Edge {
  readonly from: unknown;
  readonly to: unknown;
  readonly weight: LionNumber;
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
    if (!isNumber(weight) || compareNumbers(weight, 0) < 0) {
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
  readonly cost: LionNumber;
  readonly node: unknown;
  readonly path: readonly unknown[];
}

const shorter = (a: Route, b: Route) => {
  const order = compareNumbers(a.cost, b.cost);
  return order < 0 || (order === 0 && compareValues(a.path, b.path) < 0);
};

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
  const first: Route = { cost: 0, node: start, path: [start] };
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
        cost: sum(route.cost, edge.weight),
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
const topologicalNodes = (name: string, edges: readonly Edge[]) => {
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
  const ordered: unknown[] = [];
  for (let node = ready.pop(); node !== undefined; node = ready.pop()) {
    ordered.push(node);
    for (const { to } of out.get(valueKey(node)) ?? []) {
      const key = valueKey(to);
      const left = (waiting.get(key) ?? 0) - 1;
      waiting.set(key, left);
      if (left === 0) {
        ready.push(to);
      }
    }
  }
  if (ordered.length < nodes.length) {
    const stuck = nodes.filter(
      (node) => (waiting.get(valueKey(node)) ?? 0) > 0
    );
    return `${name} found a cycle among ${stuck.slice(0, 5).map(show).join(", ")}${stuck.length > 5 ? ", …" : ""}.`;
  }
  return ordered;
};

const topologicalOrder = (tuples: readonly Row[]) => {
  const edges = readEdges("graph/topologicalOrder", tuples, false);
  if (typeof edges === "string") {
    return edges;
  }
  const ordered = topologicalNodes("graph/topologicalOrder", edges);
  return typeof ordered === "string"
    ? ordered
    : ordered.map((node, position) => [node, position]);
};

/**
 * Finds the canonical shortest directed cycle starting and ending at `start`
 * inside `members`, breaking ties by `compareValues`.
 */
const shortestCycleFrom = (
  start: unknown,
  startKey: string,
  members: ReadonlySet<string>,
  out: ReadonlyMap<string, readonly Edge[]>
): readonly unknown[] => {
  const visited = new Set<string>();
  const queue: { readonly key: string; readonly path: readonly unknown[] }[] = [
    { key: startKey, path: [start] },
  ];
  for (const current of queue) {
    const nextEdges = [...(out.get(current.key) ?? [])]
      .filter((edge) => members.has(valueKey(edge.to)))
      .sort((a, b) => compareValues(a.to, b.to));
    for (const edge of nextEdges) {
      const nextKey = valueKey(edge.to);
      const nextPath = [...current.path, edge.to];
      if (nextKey === startKey) {
        return nextPath;
      }
      if (!visited.has(nextKey)) {
        visited.add(nextKey);
        queue.push({ key: nextKey, path: nextPath });
      }
    }
  }
  return [start, start];
};

/**
 * One canonical shortest directed cycle per cyclic strongly connected
 * component (including self-loops), named after the component's smallest node.
 * Returns no rows on an acyclic graph.
 */
const cycles = (tuples: readonly Row[]) => {
  const edges = readEdges("graph/cycles", tuples, false);
  if (typeof edges === "string") {
    return edges;
  }
  const nodes = nodesOf(edges);
  const byKey = new Map(nodes.map((node) => [valueKey(node), node]));
  const out = adjacency(edges);
  const targets = new Map<string, string[]>();
  for (const { from, to } of edges) {
    const key = valueKey(from);
    const list = targets.get(key) ?? [];
    list.push(valueKey(to));
    targets.set(key, list);
  }
  const sccs = stronglyConnectedGroups(
    nodes.map(valueKey),
    (key) => targets.get(key) ?? []
  );
  const rows: Row[] = [];
  for (const memberKeys of sccs) {
    const hasCycle =
      memberKeys.length > 1 ||
      (memberKeys.length === 1 &&
        (targets.get(memberKeys[0] as string) ?? []).includes(
          memberKeys[0] as string
        ));
    if (!hasCycle) {
      continue;
    }
    const members = new Set(memberKeys);
    const smallest = memberKeys
      .map((key) => byKey.get(key))
      .sort(compareValues)[0];
    const startKey = valueKey(smallest);
    rows.push([smallest, shortestCycleFrom(smallest, startKey, members, out)]);
  }
  return rows.sort((a, b) => compareValues(a[0], b[0]));
};

/** Reachability sets for a DAG, built in reverse topological order. */
const dagReach = (
  ordered: readonly unknown[],
  uniqueOut: ReadonlyMap<string, ReadonlySet<string>>
) => {
  const reach = new Map<string, Set<string>>();
  for (let at = ordered.length - 1; at >= 0; at -= 1) {
    const u = valueKey(ordered[at]);
    const reached = new Set<string>();
    for (const v of uniqueOut.get(u) ?? []) {
      reached.add(v);
      for (const w of reach.get(v) ?? []) {
        reached.add(w);
      }
    }
    reach.set(u, reached);
  }
  return reach;
};

const isRedundantEdge = (
  neighbors: ReadonlySet<string>,
  v: string,
  reach: ReadonlyMap<string, ReadonlySet<string>>
) => {
  for (const w of neighbors) {
    if (w !== v && reach.get(w)?.has(v)) {
      return true;
    }
  }
  return false;
};

/**
 * The unique minimal edge set of a DAG with the same reachability: keeps each
 * distinct edge (u, v) that has no directed path of length >= 2 from u to v.
 */
const transitiveReduction = (tuples: readonly Row[]) => {
  const edges = readEdges("graph/transitiveReduction", tuples, false);
  if (typeof edges === "string") {
    return edges;
  }
  const ordered = topologicalNodes("graph/transitiveReduction", edges);
  if (typeof ordered === "string") {
    return ordered;
  }
  const byKey = new Map(ordered.map((node) => [valueKey(node), node]));
  const uniqueOut = new Map<string, Set<string>>();
  for (const { from, to } of edges) {
    const u = valueKey(from);
    const set = uniqueOut.get(u) ?? new Set<string>();
    set.add(valueKey(to));
    uniqueOut.set(u, set);
  }
  const reach = dagReach(ordered, uniqueOut);
  const rows: Row[] = [];
  for (const [u, neighbors] of uniqueOut) {
    for (const v of neighbors) {
      if (!isRedundantEdge(neighbors, v, reach)) {
        rows.push([byKey.get(u), byKey.get(v)]);
      }
    }
  }
  return rows.sort((a, b) => compareValues(a, b));
};

type WeightedAdj = readonly (readonly [number, LionNumber])[];

/** Minimum-weight adjacency list for indexed nodes, ignoring self-loops. */
const weightedAdjacency = (
  nodes: readonly unknown[],
  edges: readonly Edge[]
): readonly WeightedAdj[] => {
  const index = new Map(nodes.map((node, at) => [valueKey(node), at]));
  const minEdge = new Map<number, Map<number, LionNumber>>();
  for (const { from, to, weight } of edges) {
    const u = index.get(valueKey(from)) as number;
    const v = index.get(valueKey(to)) as number;
    if (u === v) {
      continue;
    }
    const row = minEdge.get(u) ?? new Map<number, LionNumber>();
    const known = row.get(v);
    if (known === undefined || compareNumbers(weight, known) < 0) {
      row.set(v, weight);
    }
    minEdge.set(u, row);
  }
  return Array.from({ length: nodes.length }, (_, u) =>
    [...(minEdge.get(u)?.entries() ?? [])].sort(([a], [b]) => a - b)
  );
};

/** Single-source shortest-path DAG and counts for Brandes's algorithm. */
const brandesSearch = (
  s: number,
  count: number,
  out: readonly WeightedAdj[]
) => {
  const stack: number[] = [];
  const pred: number[][] = Array.from({ length: count }, () => []);
  const sigma = new Array<number>(count).fill(0);
  const dist: (LionNumber | undefined)[] = new Array(count);
  const settled = new Uint8Array(count);
  sigma[s] = 1;
  dist[s] = 0;

  const queue = new Heap<{ readonly node: number; readonly cost: LionNumber }>(
    (a, b) => {
      const order = compareNumbers(a.cost, b.cost);
      return order < 0 || (order === 0 && a.node < b.node);
    }
  );
  queue.push({ node: s, cost: 0 });
  for (let item = queue.pop(); item !== undefined; item = queue.pop()) {
    const v = item.node;
    if (settled[v] === 1) {
      continue;
    }
    settled[v] = 1;
    stack.push(v);
    const dv = dist[v] as LionNumber;
    for (const [w, weight] of out[v] ?? []) {
      if (settled[w] === 1) {
        continue;
      }
      const alt = sum(dv, weight);
      const known = dist[w];
      const cmp = known === undefined ? -1 : compareNumbers(alt, known);
      if (cmp < 0) {
        dist[w] = alt;
        sigma[w] = sigma[v] as number;
        pred[w] = [v];
        queue.push({ node: w, cost: alt });
      } else if (cmp === 0) {
        sigma[w] = (sigma[w] as number) + (sigma[v] as number);
        pred[w]?.push(v);
      }
    }
  }
  return { stack, pred, sigma };
};

/**
 * Directed betweenness centrality by Brandes's algorithm. A third edge column
 * is the non-negative weight; without one each edge costs 1.
 */
const betweenness = (tuples: readonly Row[]) => {
  const edges = readEdges("graph/betweenness", tuples, true);
  if (typeof edges === "string") {
    return edges;
  }
  const nodes = nodesOf(edges);
  const count = nodes.length;
  const out = weightedAdjacency(nodes, edges);
  const centrality = new Array<number>(count).fill(0);

  for (let s = 0; s < count; s += 1) {
    const { stack, pred, sigma } = brandesSearch(s, count, out);
    const delta = new Array<number>(count).fill(0);
    for (let at = stack.length - 1; at >= 0; at -= 1) {
      const w = stack[at] as number;
      const coeff = (1 + (delta[w] as number)) / (sigma[w] as number);
      for (const v of pred[w] ?? []) {
        delta[v] = (delta[v] as number) + (sigma[v] as number) * coeff;
      }
      if (w !== s) {
        centrality[w] = (centrality[w] as number) + (delta[w] as number);
      }
    }
  }

  return nodes.map((node, at) => [node, round(centrality[at] ?? 0)]);
};

/** Shortest hop distances from `start` following directed edges. */
const bfsDistances = (
  start: unknown,
  out: ReadonlyMap<string, readonly Edge[]>
) => {
  const startKey = valueKey(start);
  const dist = new Map<string, number>([[startKey, 0]]);
  const byKey = new Map<string, unknown>([[startKey, start]]);
  const queue: string[] = [startKey];
  for (const current of queue) {
    const nextDist = (dist.get(current) as number) + 1;
    for (const edge of out.get(current) ?? []) {
      const nextKey = valueKey(edge.to);
      if (!dist.has(nextKey)) {
        dist.set(nextKey, nextDist);
        byKey.set(nextKey, edge.to);
        queue.push(nextKey);
      }
    }
  }
  return { byKey, dist };
};

/**
 * Lowest (most specific) common ancestors of `a` and `b` in a DAG, following
 * edges from child to parent, with shortest hop distances from `a` and `b`.
 */
const lca = (tuples: readonly Row[], a: unknown, b: unknown) => {
  const edges = readEdges("graph/lca", tuples, false);
  if (typeof edges === "string") {
    return edges;
  }
  const ordered = topologicalNodes("graph/lca", edges);
  if (typeof ordered === "string") {
    return ordered;
  }
  const out = adjacency(edges);
  const fromA = bfsDistances(a, out);
  const fromB = bfsDistances(b, out);
  const commonKeys = [...fromA.dist.keys()].filter((key) =>
    fromB.dist.has(key)
  );
  if (commonKeys.length === 0) {
    return [];
  }
  const uniqueOut = new Map<string, Set<string>>();
  for (const { from, to } of edges) {
    const u = valueKey(from);
    const set = uniqueOut.get(u) ?? new Set<string>();
    set.add(valueKey(to));
    uniqueOut.set(u, set);
  }
  const reach = dagReach(ordered, uniqueOut);
  const rows: Row[] = [];
  for (const candidate of commonKeys) {
    const dominated = commonKeys.some(
      (other) => other !== candidate && reach.get(other)?.has(candidate)
    );
    if (!dominated) {
      rows.push([
        fromA.byKey.get(candidate),
        fromA.dist.get(candidate),
        fromB.dist.get(candidate),
      ]);
    }
  }
  return rows.sort((x, y) => compareValues(x[0], y[0]));
};

const MAX_SIMPLE_PATHS = 10_000;

/**
 * Deduplicated outgoing edges per node with minimum weight for parallel edges,
 * sorted canonically by target node.
 */
const minOutgoing = (edges: readonly Edge[]) => {
  const map = new Map<
    string,
    Map<string, { to: unknown; weight: LionNumber }>
  >();
  for (const { from, to, weight } of edges) {
    const fromKey = valueKey(from);
    const toKey = valueKey(to);
    const row = map.get(fromKey) ?? new Map();
    const known = row.get(toKey);
    if (known === undefined || compareNumbers(weight, known.weight) < 0) {
      row.set(toKey, { to, weight });
    }
    map.set(fromKey, row);
  }
  const out = new Map<
    string,
    readonly {
      readonly key: string;
      readonly to: unknown;
      readonly weight: LionNumber;
    }[]
  >();
  for (const [fromKey, targets] of map) {
    out.set(
      fromKey,
      [...targets.entries()]
        .map(([key, item]) => ({ key, ...item }))
        .sort((x, y) => compareValues(x.to, y.to))
    );
  }
  return out;
};

/**
 * All cycle-free directed paths from `start` to `end` of at most `maxHops`
 * edges, with optional non-negative 3rd-column edge weights.
 */
const simplePaths = (
  tuples: readonly Row[],
  start: unknown,
  end: unknown,
  maxHops: unknown
) => {
  const edges = readEdges("graph/simplePaths", tuples, true);
  if (typeof edges === "string") {
    return edges;
  }
  if (
    typeof maxHops !== "number" ||
    !Number.isInteger(maxHops) ||
    maxHops < 0
  ) {
    return `graph/simplePaths needs a whole number of at least 0 for maxHops, but found ${show(maxHops)}.`;
  }
  const startKey = valueKey(start);
  const endKey = valueKey(end);
  const out = minOutgoing(edges);
  const rows: Row[] = [];
  const visited = new Set<string>([startKey]);
  const path: unknown[] = [start];
  let exceeded = false;

  const dfs = (currentKey: string, hops: number, cost: LionNumber) => {
    if (exceeded) {
      return;
    }
    if (currentKey === endKey) {
      if (rows.length >= MAX_SIMPLE_PATHS) {
        exceeded = true;
        return;
      }
      rows.push([cost, [...path]]);
      return;
    }
    if (hops >= maxHops) {
      return;
    }
    for (const next of out.get(currentKey) ?? []) {
      if (visited.has(next.key)) {
        continue;
      }
      visited.add(next.key);
      path.push(next.to);
      dfs(next.key, hops + 1, sum(cost, next.weight));
      path.pop();
      visited.delete(next.key);
      if (exceeded) {
        return;
      }
    }
  };

  dfs(startKey, 0, 0);
  if (exceeded) {
    return `graph/simplePaths found more than ${MAX_SIMPLE_PATHS} paths; lower maxHops to bound the search.`;
  }
  return rows.sort((a, b) => {
    const order = compareNumbers(a[0] as LionNumber, b[0] as LionNumber);
    return order === 0 ? compareValues(a[1], b[1]) : order;
  });
};

/** Deterministic iterative DFS producing reverse postorder and predecessor sets. */
const reachableRpo = (
  startKey: string,
  start: unknown,
  out: ReadonlyMap<
    string,
    readonly { readonly key: string; readonly to: unknown }[]
  >
) => {
  const byKey = new Map<string, unknown>([[startKey, start]]);
  const postorder: string[] = [];
  const seen = new Set<string>([startKey]);
  const preds = new Map<string, Set<string>>();
  const stack: { key: string; at: number }[] = [{ key: startKey, at: 0 }];

  while (stack.length > 0) {
    const top = stack.at(-1) as { key: string; at: number };
    const neighbors = out.get(top.key) ?? [];
    if (top.at >= neighbors.length) {
      stack.pop();
      postorder.push(top.key);
      continue;
    }
    const next = neighbors[top.at] as (typeof neighbors)[number];
    top.at += 1;
    byKey.set(next.key, next.to);
    const set = preds.get(next.key) ?? new Set<string>();
    set.add(top.key);
    preds.set(next.key, set);
    if (!seen.has(next.key)) {
      seen.add(next.key);
      stack.push({ key: next.key, at: 0 });
    }
  }
  return { byKey, preds, rpo: [...postorder].reverse() };
};

const intersectDom = (idom: readonly number[], a: number, b: number) => {
  let f1 = a;
  let f2 = b;
  while (f1 !== f2) {
    while (f1 > f2) {
      f1 = idom[f1] as number;
    }
    while (f2 > f1) {
      f2 = idom[f2] as number;
    }
  }
  return f1;
};

const stepIdom = (
  idom: readonly number[],
  rpoIndex: ReadonlyMap<string, number>,
  predKeys: ReadonlySet<string> | undefined
) => {
  let nextIdom = -1;
  for (const predKey of predKeys ?? []) {
    const predAt = rpoIndex.get(predKey);
    if (predAt !== undefined && idom[predAt] !== -1) {
      nextIdom =
        nextIdom === -1 ? predAt : intersectDom(idom, predAt, nextIdom);
    }
  }
  return nextIdom;
};

/**
 * Immediate dominator tree for every node reachable from `start` (excluding
 * `start` itself, so the output edges form a rooted tree DAG).
 * Uses the Cooper–Harvey–Kennedy iterative algorithm on deterministic RPO.
 */
const dominators = (tuples: readonly Row[], start: unknown) => {
  const edges = readEdges("graph/dominators", tuples, false);
  if (typeof edges === "string") {
    return edges;
  }
  const { byKey, preds, rpo } = reachableRpo(
    valueKey(start),
    start,
    minOutgoing(edges)
  );
  const rpoIndex = new Map(rpo.map((key, at) => [key, at]));
  const idom = new Array<number>(rpo.length).fill(-1);
  idom[0] = 0;

  let changed = true;
  while (changed) {
    changed = false;
    for (let at = 1; at < rpo.length; at += 1) {
      const nextIdom = stepIdom(idom, rpoIndex, preds.get(rpo[at] as string));
      if (nextIdom !== -1 && idom[at] !== nextIdom) {
        idom[at] = nextIdom;
        changed = true;
      }
    }
  }

  const rows: Row[] = [];
  for (let at = 1; at < rpo.length; at += 1) {
    rows.push([
      byKey.get(rpo[at] as string),
      byKey.get(rpo[idom[at] as number] as string),
    ]);
  }
  return rows.sort((a, b) => compareValues(a[0], b[0]));
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

  simplePaths: defineAlgorithm({
    name: "graph/simplePaths",
    inputs: [
      EDGES,
      { kind: "value", name: "start" },
      { kind: "value", name: "end" },
      { kind: "value", name: "maxHops" },
    ],
    columns: ["cost", "path"],
    run: ([tuples, start, end, maxHops]) =>
      simplePaths(tuples as readonly Row[], start, end, maxHops),
  }),

  lca: defineAlgorithm({
    name: "graph/lca",
    inputs: [EDGES, { kind: "value", name: "a" }, { kind: "value", name: "b" }],
    columns: ["lca", "distA", "distB"],
    run: ([tuples, a, b]) => lca(tuples as readonly Row[], a, b),
  }),

  dominators: defineAlgorithm({
    name: "graph/dominators",
    inputs: [EDGES, { kind: "value", name: "start" }],
    columns: ["node", "dominator"],
    run: ([tuples, start]) => dominators(tuples as readonly Row[], start),
  }),

  pageRank: defineAlgorithm({
    name: "graph/pageRank",
    inputs: [EDGES],
    columns: ["node", "rank"],
    run: ([tuples]) => pageRank(tuples as readonly Row[]),
  }),

  betweenness: defineAlgorithm({
    name: "graph/betweenness",
    inputs: [EDGES],
    columns: ["node", "score"],
    run: ([tuples]) => betweenness(tuples as readonly Row[]),
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

  cycles: defineAlgorithm({
    name: "graph/cycles",
    inputs: [EDGES],
    columns: ["component", "cycle"],
    run: ([tuples]) => cycles(tuples as readonly Row[]),
  }),

  transitiveReduction: defineAlgorithm({
    name: "graph/transitiveReduction",
    inputs: [EDGES],
    columns: ["from", "to"],
    run: ([tuples]) => transitiveReduction(tuples as readonly Row[]),
  }),

  topologicalOrder: defineAlgorithm({
    name: "graph/topologicalOrder",
    inputs: [EDGES],
    columns: ["node", "position"],
    run: ([tuples]) => topologicalOrder(tuples as readonly Row[]),
  }),
};

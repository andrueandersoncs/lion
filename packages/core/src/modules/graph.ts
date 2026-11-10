/**
 * Graph algorithms over relations whose first two columns are edges, from and
 * to. Each is an algorithm goal: `["graph/pageRank", "edge", "?node", "?rank"]`.
 * Results never depend on the order facts were added: ties and component
 * names go to the smaller value.
 */
import { defineAlgorithm } from "@/logic/algorithms";
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

/** Names each group of nodes after its smallest member. */
const labelGroups = (
  nodes: readonly unknown[],
  groupOf: (node: unknown) => string
) => {
  const names = new Map<string, unknown>();
  for (const node of nodes) {
    const group = groupOf(node);
    if (!names.has(group)) {
      names.set(group, node);
    }
  }
  return nodes.map((node) => [node, names.get(groupOf(node))]);
};

/** Connected components, ignoring edge direction. */
const components = (tuples: readonly Row[]) => {
  const edges = readEdges("graph/components", tuples, false);
  if (typeof edges === "string") {
    return edges;
  }
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    let root = key;
    while (parent.get(root) !== root) {
      root = parent.get(root) ?? root;
    }
    parent.set(key, root);
    return root;
  };
  const nodes = nodesOf(edges);
  for (const node of nodes) {
    parent.set(valueKey(node), valueKey(node));
  }
  for (const { from, to } of edges) {
    parent.set(find(valueKey(from)), find(valueKey(to)));
  }
  return labelGroups(nodes, (node) => find(valueKey(node)));
};

interface Frame {
  readonly key: string;
  next: number;
}

/** Tarjan's algorithm, iterative so deep graphs cannot overflow the stack. */
class Tarjan {
  readonly group = new Map<string, string>();
  private counter = 0;
  private readonly index = new Map<string, number>();
  private readonly low = new Map<string, number>();
  private readonly onStack = new Set<string>();
  private readonly out: ReadonlyMap<string, readonly Edge[]>;
  private readonly stack: string[] = [];
  private readonly work: Frame[] = [];

  constructor(out: ReadonlyMap<string, readonly Edge[]>) {
    this.out = out;
  }

  visit(root: string) {
    if (this.index.has(root)) {
      return;
    }
    this.open(root);
    for (
      let frame = this.work.at(-1);
      frame !== undefined;
      frame = this.work.at(-1)
    ) {
      const edge = this.out.get(frame.key)?.[frame.next];
      if (edge === undefined) {
        this.close(frame);
      } else {
        frame.next += 1;
        this.follow(frame, valueKey(edge.to));
      }
    }
  }

  private lower(key: string, value: number | undefined) {
    this.low.set(key, Math.min(this.low.get(key) ?? 0, value ?? 0));
  }

  private open(key: string) {
    this.index.set(key, this.counter);
    this.low.set(key, this.counter);
    this.counter += 1;
    this.stack.push(key);
    this.onStack.add(key);
    this.work.push({ key, next: 0 });
  }

  private follow(frame: Frame, target: string) {
    if (!this.index.has(target)) {
      this.open(target);
    } else if (this.onStack.has(target)) {
      this.lower(frame.key, this.index.get(target));
    }
  }

  private close(frame: Frame) {
    this.work.pop();
    const caller = this.work.at(-1);
    if (caller !== undefined) {
      this.lower(caller.key, this.low.get(frame.key));
    }
    if (this.low.get(frame.key) !== this.index.get(frame.key)) {
      return;
    }
    for (
      let member = this.stack.pop();
      member !== undefined;
      member = this.stack.pop()
    ) {
      this.onStack.delete(member);
      this.group.set(member, frame.key);
      if (member === frame.key) {
        break;
      }
    }
  }
}

const stronglyConnected = (tuples: readonly Row[]) => {
  const edges = readEdges("graph/stronglyConnected", tuples, false);
  if (typeof edges === "string") {
    return edges;
  }
  const nodes = nodesOf(edges);
  const tarjan = new Tarjan(adjacency(edges));
  for (const node of nodes) {
    tarjan.visit(valueKey(node));
  }
  return labelGroups(nodes, (node) => tarjan.group.get(valueKey(node)) ?? "");
};

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

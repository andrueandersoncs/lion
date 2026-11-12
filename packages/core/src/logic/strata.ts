/**
 * The dependency graph of a logic program: which relations each relation
 * reads, and the groups of relations that depend on each other.
 */
import type { CompiledRule } from "@/logic/compile";
import { Atom } from "@/logic/terms";

/** Which relations each relation reads, through rules and computations. */
export const dependencyEdges = (rules: readonly CompiledRule[]) => {
  const edges = new Map<string, Set<string>>();
  for (const rule of rules) {
    const targets = edges.get(rule.head.relation.name) ?? new Set();
    for (const { goal } of rule.body) {
      if (goal instanceof Atom) {
        const { computed, name } = goal.relation;
        targets.add(name);
        if (computed !== undefined) {
          edges.set(name, new Set(computed.dependencies));
        }
      }
    }
    edges.set(rule.head.relation.name, targets);
  }
  return edges;
};

interface Frame {
  next: number;
  readonly node: string;
  readonly targets: readonly string[];
}

/**
 * Tarjan's algorithm, iterative so deep graphs cannot overflow the stack.
 * Returns the strongly connected components reachable from `nodes`, each
 * after the components it points to.
 */
export const stronglyConnected = (
  nodes: Iterable<string>,
  targets: (node: string) => readonly string[]
): string[][] => {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const work: Frame[] = [];
  const components: string[][] = [];
  const open = (node: string) => {
    low.set(node, index.size);
    index.set(node, index.size);
    stack.push(node);
    onStack.add(node);
    work.push({ node, targets: targets(node), next: 0 });
  };
  const lower = (node: string, value: number | undefined) =>
    low.set(node, Math.min(low.get(node) ?? 0, value ?? 0));
  const close = ({ node }: Frame) => {
    work.pop();
    const caller = work.at(-1);
    if (caller !== undefined) {
      lower(caller.node, low.get(node));
    }
    if (low.get(node) !== index.get(node)) {
      return;
    }
    const component: string[] = [];
    for (let member = stack.pop(); member !== undefined; member = stack.pop()) {
      onStack.delete(member);
      component.push(member);
      if (member === node) {
        break;
      }
    }
    components.push(component);
  };
  for (const root of nodes) {
    if (!index.has(root)) {
      open(root);
    }
    for (let frame = work.at(-1); frame !== undefined; frame = work.at(-1)) {
      const target = frame.targets[frame.next];
      frame.next += 1;
      if (target === undefined) {
        close(frame);
      } else if (!index.has(target)) {
        open(target);
      } else if (onStack.has(target)) {
        lower(frame.node, index.get(target));
      }
    }
  }
  return components;
};

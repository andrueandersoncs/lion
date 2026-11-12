/**
 * The dependency graph of a logic program: which relations each rule reads,
 * and the groups of relations that depend on each other.
 */
import type { CompiledRule, Literal } from "@/logic/compile";
import { Atom, LogicValue, type RelationInfo, relationOf } from "@/logic/terms";

/** Collects the relations a term mentions, however deep. */
const mention = (term: unknown, into: RelationInfo[]) => {
  const relation = term instanceof Atom ? term.relation : relationOf(term);
  if (relation !== undefined) {
    into.push(relation);
  }
  if (term instanceof LogicValue) {
    for (const part of term.parts) {
      mention(part, into);
    }
  }
};

/** The relations a term mentions, however deep. */
export const mentioned = (term: unknown): readonly RelationInfo[] => {
  const found: RelationInfo[] = [];
  mention(term, found);
  return found;
};

/**
 * The relations a body reads: the ones its relation goals match, and the
 * ones it asks about. `values` are terms computed from the body's answers,
 * such as a rule's head arguments.
 */
export const reads = (
  body: readonly Literal[],
  values: readonly unknown[] = []
) => [...body, ...values].flatMap(mentioned);

/**
 * The relations a body asks about, under `not`, in a find, or as a value,
 * and the relations its functions are handed. Their rows must be complete
 * before the body runs.
 */
export const asked = (
  body: readonly Literal[],
  values: readonly unknown[] = []
) =>
  [
    ...body.flatMap((literal) =>
      literal instanceof Atom ? literal.args : [literal]
    ),
    ...values,
  ].flatMap(mentioned);

/** Which relations each relation reads, through rules and computations. */
export const dependencyEdges = (rules: readonly CompiledRule[]) => {
  const edges = new Map<string, Set<string>>();
  for (const { body, head } of rules) {
    const targets = edges.get(head.relation.name) ?? new Set();
    for (const { computed, name } of reads(body, head.args)) {
      targets.add(name);
      if (computed !== undefined) {
        edges.set(name, new Set(computed.dependencies));
      }
    }
    edges.set(head.relation.name, targets);
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

/** Relations that depend on each other, and the rules that derive them. */
export interface Stratum {
  readonly members: ReadonlySet<string>;
  readonly rules: readonly CompiledRule[];
}

/**
 * Groups relations into strongly connected components, ordered so every
 * component comes after the components it depends on.
 */
export const components = (rules: readonly CompiledRule[]) => {
  const edges = dependencyEdges(rules);
  return stronglyConnected(edges.keys(), (name) => [
    ...(edges.get(name) ?? []),
  ]).map((component) => new Set(component));
};

const STRATA = new WeakMap<
  readonly CompiledRule[],
  ReadonlyMap<string, Stratum>
>();

/** The stratum of each relation that rules derive, by relation name. */
export const strataOf = (
  rules: readonly CompiledRule[]
): ReadonlyMap<string, Stratum> => {
  const known = STRATA.get(rules);
  if (known !== undefined) {
    return known;
  }
  const strata = new Map<
    string,
    { readonly members: ReadonlySet<string>; readonly rules: CompiledRule[] }
  >();
  for (const members of components(rules)) {
    const stratum = { members, rules: [] };
    for (const name of members) {
      strata.set(name, stratum);
    }
  }
  // Rules keep the order they were added in.
  for (const rule of rules) {
    strata.get(rule.head.relation.name)?.rules.push(rule);
  }
  for (const [name, stratum] of strata) {
    if (stratum.rules.length === 0) {
      strata.delete(name);
    }
  }
  STRATA.set(rules, strata);
  return strata;
};

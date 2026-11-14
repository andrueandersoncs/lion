/**
 * The dependency graph of a logic program: which relations each rule reads,
 * and the groups of relations that depend on each other.
 */
import type { CompiledRule, Literal } from "@/logic/compile";
import {
  Atom,
  buildOf,
  isArgumentsOnly,
  isPlainObject,
  LogicValue,
  lambdaInfo,
  type RelationInfo,
  relationOf,
  schemaOf,
} from "@/logic/terms";

const NONE: readonly RelationInfo[] = [];

/**
 * What a schema is made of: for a named schema, the form of its shape with
 * the values its names had, which also shows what the lambdas in it name;
 * the arguments of the call that built a function; and the parts of a list
 * or record. A relation among them is a predicate the schema asks.
 */
const schemaParts = (term: unknown): readonly unknown[] => {
  if (typeof term === "function") {
    const named = schemaOf(term);
    if (named === undefined) {
      return buildOf(term)?.args ?? NONE;
    }
    // A schema that is still being declared has no shape yet.
    return named.definition === undefined ? NONE : [named.definition];
  }
  if (Array.isArray(term)) {
    return term;
  }
  return isPlainObject(term) ? Object.values(term) : NONE;
};

// Schemas, and the lists and records they hold, never change, so what one
// mentions is worked out once.
const HELD = new WeakMap<object, readonly RelationInfo[]>();

/**
 * Collects the relations a term mentions, however deep. `open` holds the
 * schemas being looked through, since a named schema can hold itself.
 */
const mention = (term: unknown, into: RelationInfo[], open?: Set<unknown>) => {
  const relation = term instanceof Atom ? term.relation : relationOf(term);
  if (relation !== undefined) {
    into.push(relation);
  }
  if (term instanceof LogicValue) {
    for (const part of term.read) {
      mention(part, into, open);
    }
    return;
  }
  if (!(typeof term === "function" || (typeof term === "object" && term))) {
    return;
  }
  let held = HELD.get(term);
  if (held === undefined) {
    const parts = open?.has(term) ? NONE : schemaParts(term);
    if (parts.length === 0) {
      return;
    }
    const found: RelationInfo[] = [];
    const inside = open ?? new Set<unknown>();
    inside.add(term);
    for (const part of parts) {
      mention(part, found, inside);
    }
    held = found;
    // Only the schema the search started from has seen all of itself.
    if (open === undefined) {
      HELD.set(term, held);
    }
  }
  for (const found of held) {
    into.push(found);
  }
};

/**
 * True for a function whose reads Lion can see: a relation, a schema, a
 * function another function built, a lambda that closes over nothing, or a
 * function that reads only its arguments. What such a function is made of
 * is looked into in turn.
 */
const isSeen = (fn: object) => {
  const lambda = lambdaInfo(fn);
  return (
    relationOf(fn) !== undefined ||
    schemaOf(fn) !== undefined ||
    buildOf(fn) !== undefined ||
    (lambda === undefined ? isArgumentsOnly(fn) : !lambda.environment)
  );
};

const OPAQUE = new WeakMap<object, boolean>();

const holdsOpaque = (term: unknown, open: Set<unknown>): boolean => {
  if (!(typeof term === "function" || (typeof term === "object" && term))) {
    return false;
  }
  const known = OPAQUE.get(term);
  if (known !== undefined || open.has(term)) {
    return known === true;
  }
  if (typeof term === "function" && !isSeen(term)) {
    return true;
  }
  // A host object that is not plain data can do anything when it is called.
  const isData =
    term instanceof LogicValue ||
    typeof term === "function" ||
    Array.isArray(term) ||
    isPlainObject(term);
  open.add(term);
  const parts = term instanceof LogicValue ? term.parts : schemaParts(term);
  const opaque = !isData || parts.some((part) => holdsOpaque(part, open));
  open.delete(term);
  // What was found while a schema was open may be missing what it holds.
  if (opaque || open.size === 0) {
    OPAQUE.set(term, opaque);
  }
  return opaque;
};

/**
 * True when a term holds something whose reads Lion cannot see: a function
 * a host added, a host object, or a lambda that still closes over a scope.
 * What such a term depends on is not known, so nothing that relies on
 * knowing it can be skipped.
 */
export const isOpaque = (term: unknown): boolean =>
  holdsOpaque(term, new Set());

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

/**
 * Which relations each relation reads, through rules and computations. A
 * rule that invents reads every relation of its head, to see whether the
 * head holds already, so those relations are derived together.
 */
export const dependencyEdges = (rules: readonly CompiledRule[]) => {
  const edges = new Map<string, Set<string>>();
  const add = (
    head: Atom,
    body: readonly Literal[],
    heads?: readonly Atom[]
  ) => {
    const targets = edges.get(head.relation.name) ?? new Set();
    for (const { computed, name } of reads(body, head.args)) {
      targets.add(name);
      if (computed !== undefined) {
        edges.set(name, new Set(computed.dependencies));
      }
    }
    for (const other of heads ?? []) {
      if (other.relation.name !== head.relation.name) {
        targets.add(other.relation.name);
      }
    }
    edges.set(head.relation.name, targets);
  };
  for (const rule of rules) {
    if (rule.equates) {
      // An equality rule adds no row: it runs with the relations it reads.
      continue;
    }
    if (rule.invents === undefined) {
      add(rule.head, rule.body);
    } else {
      for (const head of rule.invents.heads) {
        add(head, rule.body, rule.invents.heads);
      }
    }
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

/**
 * Where an equality rule runs: with a relation that rules derive and that
 * its body reads, from a group no other such relation of the body depends
 * on, so every other relation it reads is complete first. A group whose
 * rules invent comes before one whose rules do not, since only an unknown
 * its own group invented can be made one. Undefined when the body reads
 * only facts: then nothing it reads holds an invented unknown, and the
 * invariant the rule stands for keeps it.
 */
export const equalityHome = (
  rule: CompiledRule,
  rules: readonly CompiledRule[],
  edges: ReadonlyMap<string, ReadonlySet<string>>
) => {
  const read = [
    ...new Set(
      rule.body.flatMap((literal) =>
        literal instanceof Atom && edges.has(literal.relation.name)
          ? [literal.relation.name]
          : []
      )
    ),
  ];
  const reaches = (from: string, to: string) => {
    const seen = new Set<string>();
    const pending = [from];
    for (let at = pending.pop(); at !== undefined; at = pending.pop()) {
      for (const next of edges.get(at) ?? []) {
        if (next === to) {
          return true;
        }
        if (!seen.has(next)) {
          seen.add(next);
          pending.push(next);
        }
      }
    }
    return false;
  };
  const together = (a: string, b: string) =>
    a === b || (reaches(a, b) && reaches(b, a));
  const highest = read.filter(
    (name) =>
      !read.some((other) => reaches(other, name) && !reaches(name, other))
  );
  const inventing = rules.flatMap((each) =>
    each.invents === undefined
      ? []
      : each.invents.heads.map((head) => head.relation.name)
  );
  return (
    highest.find((name) => inventing.some((head) => together(head, name))) ??
    highest.at(-1)
  );
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
  // Only an equality rule needs the graph again, to find where it runs.
  const edges = rules.some((rule) => rule.equates)
    ? dependencyEdges(rules)
    : undefined;
  for (const rule of rules) {
    const home =
      rule.equates && edges !== undefined
        ? equalityHome(rule, rules, edges)
        : rule.head.relation.name;
    if (home !== undefined) {
      strata.get(home)?.rules.push(rule);
    }
  }
  for (const [name, stratum] of strata) {
    if (stratum.rules.length === 0) {
      strata.delete(name);
    }
  }
  STRATA.set(rules, strata);
  return strata;
};

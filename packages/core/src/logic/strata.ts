/**
 * The dependency graph of a logic program: which relations each rule reads,
 * and the groups of relations that depend on each other.
 */
import {
  type CompiledRule,
  columnOf,
  headsOf,
  type Literal,
  originOf,
  valueOrigins,
} from "@/logic/compile";
import {
  Atom,
  buildOf,
  isArgumentsOnly,
  isForm,
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

/** A value a rule puts in a column of its head, and where it comes from. */
export interface Flow {
  readonly arg: unknown;
  readonly from: string;
  readonly made: boolean;
  readonly rule: CompiledRule;
  /** The relation of the column the value comes from. */
  readonly source: string;
  readonly to: string;
}

const FLOWS = new WeakMap<CompiledRule, readonly Flow[]>();

/** The values a rule puts in the columns of its head, and where each comes from. */
export const flowsOf = (rule: CompiledRule): readonly Flow[] => {
  const known = FLOWS.get(rule);
  if (known !== undefined) {
    return known;
  }
  const origins = valueOrigins(rule.body);
  const flows = headsOf(rule).flatMap((head) =>
    head.args.flatMap((arg, position) => {
      if (rule.aggregates.includes(position)) {
        return [];
      }
      const { columns, made } = originOf(arg, origins);
      const to = columnOf(head.relation.name, position);
      return [...columns].map(([from, source]) => ({
        arg,
        from,
        made,
        rule,
        source,
        to,
      }));
    })
  );
  FLOWS.set(rule, flows);
  return flows;
};

/**
 * The relations of the rules that invent a value which can flow, through
 * the heads of rules, into a column an equality rule makes equal.
 */
const inventorsReaching = (
  rules: readonly CompiledRule[],
  equality: CompiledRule
) => {
  const origins = valueOrigins(equality.body);
  const equated = new Set(
    equality.head.args.flatMap((arg) => [
      ...originOf(arg, origins).columns.keys(),
    ])
  );
  const next = new Map<string, string[]>();
  for (const rule of rules) {
    for (const { from, to } of rule.equates ? [] : flowsOf(rule)) {
      next.set(from, [...(next.get(from) ?? []), to]);
    }
  }
  const reaches = (start: string) => {
    const seen = new Set([start]);
    for (const column of seen) {
      if (equated.has(column)) {
        return true;
      }
      for (const to of next.get(column) ?? []) {
        seen.add(to);
      }
    }
    return false;
  };
  return rules.flatMap((rule) =>
    rule.invents?.heads.some((head) =>
      head.args.some(
        (arg, position) =>
          isForm(arg, "some") && reaches(columnOf(head.relation.name, position))
      )
    )
      ? headsOf(rule).map((head) => head.relation.name)
      : []
  );
};

/**
 * The relations of a rule that invents an unknown an equality rule can
 * meet read every relation the equality rule reads.
 */
const addEqualityEdges = (
  rules: readonly CompiledRule[],
  edges: ReadonlyMap<string, Set<string>>
) => {
  for (const rule of rules.filter(({ equates }) => equates)) {
    const read = reads(rule.body).map(({ name }) => name);
    for (const inventor of new Set(inventorsReaching(rules, rule))) {
      for (const name of read) {
        if (name !== inventor) {
          edges.get(inventor)?.add(name);
        }
      }
    }
  }
};

// A set of rules never changes, so what its relations read is worked out once.
const EDGES = new WeakMap<
  readonly CompiledRule[],
  ReadonlyMap<string, ReadonlySet<string>>
>();

/**
 * Which relations each relation reads, through rules and computations. A
 * rule that invents reads every relation of its head, to see whether the
 * head holds already, so those relations are derived together. An equality
 * rule can make an unknown one with a value, which changes every row that
 * holds the unknown, so the relations of a rule that invents an unknown the
 * equality rule can meet read every relation the equality rule reads: they
 * are derived together with the relations between them, and the equality
 * rule runs with them.
 */
export const dependencyEdges = (
  rules: readonly CompiledRule[]
): ReadonlyMap<string, ReadonlySet<string>> => {
  const known = EDGES.get(rules);
  if (known !== undefined) {
    return known;
  }
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
  addEqualityEdges(rules, edges);
  EDGES.set(rules, edges);
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
 * Where an equality rule runs: with the relations of a rule that invents an
 * unknown it can meet. Those relations read every relation the equality
 * rule reads (see `dependencyEdges`), so each is complete first or derived
 * with them. Undefined when no invented unknown can reach the columns it
 * makes equal: then it has nothing to make one, and the invariant it stands
 * for keeps it.
 */
export const equalityHome = (
  rule: CompiledRule,
  rules: readonly CompiledRule[]
): string | undefined => inventorsReaching(rules, rule)[0];

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
    const home = rule.equates
      ? equalityHome(rule, rules)
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

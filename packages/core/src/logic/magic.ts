/**
 * Goal-directed queries by the magic-sets rewrite.
 *
 * Bottom-up evaluation derives every fact a program implies, so asking for
 * `["path", "a", "?to"]` would otherwise compute paths from every node. The
 * rewrite gives each rule-defined relation a copy per binding pattern
 * ("adornment"), guarded by a "magic" relation that holds the arguments
 * someone asked about. Magic rules pass those arguments down through rule
 * bodies, so evaluation derives only facts the query can reach. The copies
 * hold a subset of the original facts, so the rewritten program still
 * finishes.
 *
 * Relations that are aggregated, computed, or negated somewhere the query
 * reaches are left out of the rewrite: they, and everything they depend on,
 * are computed in full first, as the normal evaluation would.
 */
import {
  type CompiledQuery,
  type CompiledRule,
  type Literal,
  planLiterals,
} from "@/logic/compile";
import {
  Atom,
  isLogicTerm,
  LogicVariable,
  type RelationInfo,
} from "@/logic/terms";

export interface MagicProgram {
  /** Relations to compute in full before running `rules`. */
  readonly full: ReadonlySet<string>;
  /** The query bodies, reading the rewritten relations. */
  readonly queries: readonly CompiledQuery[];
  /** Rewritten copies of rules, magic rules, and copies of base facts. */
  readonly rules: readonly CompiledRule[];
}

type Adornment = readonly boolean[];

const getOrCreate = <K, V>(map: Map<K, V>, key: K, make: () => V): V => {
  let value = map.get(key);
  if (value === undefined) {
    value = make();
    map.set(key, value);
  }
  return value;
};

/** Which relations each relation reads, through rules and computations. */
const dependencyEdges = (rules: readonly CompiledRule[]) => {
  const edges = new Map<string, Set<string>>();
  for (const rule of rules) {
    const targets = getOrCreate(
      edges,
      rule.head.relation.name,
      () => new Set()
    );
    for (const literal of rule.body) {
      if (literal.kind === "atom" || literal.kind === "absent") {
        const { computed, name } = literal.atom.relation;
        targets.add(name);
        if (computed !== undefined) {
          const inputs = getOrCreate(edges, name, () => new Set());
          for (const dependency of computed.dependencies) {
            inputs.add(dependency);
          }
        }
      }
    }
  }
  return edges;
};

const closure = (
  edges: ReadonlyMap<string, ReadonlySet<string>>,
  roots: Iterable<string>
) => {
  const seen = new Set<string>();
  const pending = [...roots];
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    if (!seen.has(name)) {
      seen.add(name);
      pending.push(...(edges.get(name) ?? []));
    }
  }
  return seen;
};

const bodyRelations = (bodies: readonly (readonly Literal[])[]) =>
  bodies.flatMap((body) =>
    body.flatMap((literal) =>
      literal.kind === "atom" || literal.kind === "absent"
        ? [literal.atom.relation.name]
        : []
    )
  );

/**
 * Relations the rewrite leaves alone: aggregated or computed relations and
 * relations used under `not`, with everything they depend on.
 */
const fullRelations = (
  rules: readonly CompiledRule[],
  queries: readonly CompiledQuery[],
  edges: ReadonlyMap<string, ReadonlySet<string>>,
  reachable: ReadonlySet<string>
) => {
  const roots = new Set<string>();
  const visit = (body: readonly Literal[]) => {
    for (const literal of body) {
      if (literal.kind === "absent") {
        roots.add(literal.atom.relation.name);
      }
      if (literal.kind === "atom" && literal.atom.relation.computed) {
        roots.add(literal.atom.relation.name);
      }
    }
  };
  for (const rule of rules) {
    if (reachable.has(rule.head.relation.name)) {
      if (rule.aggregates.length > 0) {
        roots.add(rule.head.relation.name);
      }
      visit(rule.body);
    }
  }
  for (const query of queries) {
    visit(query.body);
  }
  return closure(edges, roots);
};

const adornmentKey = (adornment: Adornment) =>
  adornment.map((bound) => (bound ? "b" : "f")).join("");

// Rewritten relation names start with a character no Lion program writes.
const adornedName = (relation: string, adornment: Adornment) =>
  `\u0000${relation}^${adornmentKey(adornment)}`;

const magicName = (relation: string, adornment: Adornment) =>
  `\u0000magic^${relation}^${adornmentKey(adornment)}`;

const REWRITTEN = "\u0000";
const MAGIC = "magic^";

/** The relation a rewritten copy stands for, for messages. */
export const originalName = (name: string) => {
  if (!name.startsWith(REWRITTEN)) {
    return name;
  }
  const inner = name.slice(REWRITTEN.length);
  const relation = inner.startsWith(MAGIC) ? inner.slice(MAGIC.length) : inner;
  return relation.slice(0, relation.lastIndexOf("^"));
};

/** A term is known when it is a value or a variable an earlier atom bound. */
const isKnown = (term: unknown, bound: ReadonlySet<string>) =>
  term instanceof LogicVariable ? bound.has(term.name) : !isLogicTerm(term);

const pick = <T>(items: readonly T[], adornment: Adornment) =>
  items.filter((_, position) => adornment[position]);

class Rewrite {
  readonly rules: CompiledRule[] = [];
  /** True once a query asks a rewritten relation about a known argument. */
  directed = false;
  private readonly byRelation: ReadonlyMap<string, readonly CompiledRule[]>;
  private readonly done = new Set<string>();
  private readonly eligible: (relation: string) => boolean;
  private readonly hasFacts: (relation: string) => boolean;
  private readonly pending: [RelationInfo, Adornment][] = [];

  constructor(
    rules: readonly CompiledRule[],
    eligible: (relation: string) => boolean,
    hasFacts: (relation: string) => boolean
  ) {
    const byRelation = new Map<string, CompiledRule[]>();
    for (const rule of rules) {
      getOrCreate(byRelation, rule.head.relation.name, () => []).push(rule);
    }
    this.byRelation = byRelation;
    this.eligible = eligible;
    this.hasFacts = hasFacts;
  }

  /**
   * Swaps eligible atoms in a planned body for their rewritten copies. Each
   * swap adds a magic rule that asks the copy about the arguments known at
   * that point: the literals before the atom are the magic rule's body.
   */
  body(planned: readonly Literal[], source: unknown, isQuery: boolean) {
    const out: Literal[] = [];
    const bound = new Set<string>();
    for (const literal of planned) {
      const { kind } = literal;
      if (kind === "atom" && this.eligible(literal.atom.relation.name)) {
        const { args, relation } = literal.atom;
        // Only values and variables bound by atoms count as known. Values
        // computed by functions could grow without end through recursion.
        const adornment = args.map((arg) => isKnown(arg, bound));
        this.directed ||= isQuery && adornment.some(Boolean);
        this.rules.push({
          aggregates: [],
          body: [...out],
          head: new Atom(
            this.magic(relation, adornment),
            pick(args, adornment)
          ),
          source,
        });
        this.pending.push([relation, adornment]);
        out.push({
          kind: "atom",
          atom: new Atom(this.adorned(relation, adornment), args),
        });
      } else {
        out.push(literal);
      }
      if (kind === "atom") {
        for (const arg of literal.atom.args) {
          if (arg instanceof LogicVariable) {
            bound.add(arg.name);
          }
        }
      }
    }
    return out;
  }

  /** Rewrites every relation queued so far; false if a body cannot be planned. */
  drain(): boolean {
    for (
      let next = this.pending.pop();
      next !== undefined;
      next = this.pending.pop()
    ) {
      const [relation, adornment] = next;
      const name = adornedName(relation.name, adornment);
      if (!this.done.has(name)) {
        this.done.add(name);
        if (!this.relation(relation, adornment)) {
          return false;
        }
      }
    }
    return true;
  }

  private adorned(relation: RelationInfo, adornment: Adornment): RelationInfo {
    return { ...relation, name: adornedName(relation.name, adornment) };
  }

  private magic(relation: RelationInfo, adornment: Adornment): RelationInfo {
    return {
      name: magicName(relation.name, adornment),
      columns: pick(relation.columns, adornment),
    };
  }

  /** The copy of one relation for one adornment, guarded by its magic. */
  private relation(relation: RelationInfo, adornment: Adornment) {
    const magic = this.magic(relation, adornment);
    const head = this.adorned(relation, adornment);
    for (const rule of this.byRelation.get(relation.name) ?? []) {
      const guard: Literal = {
        kind: "atom",
        atom: new Atom(magic, pick(rule.head.args, adornment)),
      };
      const planned = planLiterals([guard, ...rule.body]);
      if (typeof planned === "string") {
        return false;
      }
      this.rules.push({
        aggregates: [],
        body: this.body(planned, rule.source, false),
        head: new Atom(head, rule.head.args),
        source: rule.source,
      });
    }
    if (this.hasFacts(relation.name)) {
      const vars = relation.columns.map(
        (_, position) => new LogicVariable(`_fact${position}`)
      );
      this.rules.push({
        aggregates: [],
        body: [
          { kind: "atom", atom: new Atom(magic, pick(vars, adornment)) },
          { kind: "atom", atom: new Atom(relation, vars) },
        ],
        head: new Atom(head, vars),
        source: ["fact", [relation.name, ...vars.map(() => "?_")]],
      });
    }
    return true;
  }
}

/**
 * Rewrites queries to derive only what they can reach, or returns undefined
 * when no query asks a rule-defined relation about a known argument.
 */
export const rewriteQueries = (
  rules: readonly CompiledRule[],
  queries: readonly CompiledQuery[],
  hasFacts: (relation: string) => boolean
): MagicProgram | undefined => {
  const edges = dependencyEdges(rules);
  const reachable = closure(
    edges,
    bodyRelations(queries.map((query) => query.body))
  );
  const full = fullRelations(rules, queries, edges, reachable);
  const defined = new Set(rules.map((rule) => rule.head.relation.name));
  const rewrite = new Rewrite(
    rules,
    (relation) => defined.has(relation) && !full.has(relation),
    hasFacts
  );
  const rewritten = queries.map((query) => ({
    body: rewrite.body(query.body, undefined, true),
    outputs: query.outputs,
  }));
  if (!(rewrite.directed && rewrite.drain())) {
    return undefined;
  }
  return { full, queries: rewritten, rules: rewrite.rules };
};

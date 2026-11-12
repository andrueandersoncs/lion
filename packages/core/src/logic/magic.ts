/**
 * Goal-directed queries by the magic-sets rewrite.
 *
 * Bottom-up evaluation derives every fact a relation's rules imply, so asking
 * for `["path", "a", "?to"]` would otherwise compute paths from every node.
 * The rewrite gives each rule-defined relation a copy per binding pattern
 * ("adornment"), guarded by a "magic" relation that holds the arguments
 * someone asked about. Magic rules pass those arguments down through rule
 * bodies, so evaluation derives only facts the query can reach. The copies
 * hold a subset of the original facts, so the rewritten program still
 * finishes.
 *
 * Only relation goals of a body are swapped for copies. A question, under
 * `not`, in a find, or as a value, needs every row of the relations it asks
 * about, and reads them under their own names, so those are derived in
 * full. So are aggregated and computed relations, which have no copies.
 */
import {
  bindVariables,
  type CompiledRule,
  compilable,
  type Literal,
  planLiterals,
} from "@/logic/compile";
import {
  Atom,
  isGroundValue,
  LogicValue,
  LogicVariable,
  type RelationInfo,
} from "@/logic/terms";

export interface MagicProgram {
  /** The query bodies, reading the rewritten relations. */
  readonly bodies: readonly (readonly Literal[])[];
  /** Relations whose facts the rewritten rules read, under `factsName`. */
  readonly facts: ReadonlySet<string>;
  /** Rewritten copies of rules, magic rules, and copies of base facts. */
  readonly rules: readonly CompiledRule[];
}

type Adornment = readonly boolean[];

const adornmentKey = (adornment: Adornment) =>
  adornment.map((bound) => (bound ? "b" : "f")).join("");

// Rewritten relation names start with a character no Lion program writes.
const REWRITTEN = "\u0000";
const MAGIC = "magic^";

const adornedName = (relation: string, adornment: Adornment) =>
  `${REWRITTEN}${relation}^${adornmentKey(adornment)}`;

const magicName = (relation: string, adornment: Adornment) =>
  `${REWRITTEN}${MAGIC}${relation}^${adornmentKey(adornment)}`;

/** The name a rewritten rule reads a relation's facts under. */
export const factsName = (relation: string) => `${REWRITTEN}facts^${relation}`;

/** The relation a rewritten copy stands for, for messages. */
export const originalName = (name: string) => {
  if (!name.startsWith(REWRITTEN)) {
    return name;
  }
  const inner = name.slice(REWRITTEN.length);
  const relation = inner.startsWith(MAGIC) ? inner.slice(MAGIC.length) : inner;
  return relation.slice(0, relation.lastIndexOf("^"));
};

/**
 * A term is known when it is JSON data or a variable that is already bound.
 * Inside rules only variables bound from facts count, so recursion never
 * asks about values without end; a query runs once, so there a value
 * computed from bound variables counts too. Other values, such as functions,
 * can never match a fact, so they are left to filter the rewritten relation
 * instead of seeding it.
 */
const isKnown = (
  term: unknown,
  bound: ReadonlySet<string>,
  isQuery: boolean
) => {
  if (term instanceof LogicVariable) {
    return bound.has(term.name);
  }
  return term instanceof LogicValue
    ? isQuery && term.variables.every((name) => bound.has(name))
    : isGroundValue(term);
};

const pick = <T>(items: readonly T[], adornment: Adornment) =>
  items.filter((_, position) => adornment[position]);

class Rewrite {
  readonly rules: CompiledRule[] = [];
  readonly facts = new Set<string>();
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
      const name = rule.head.relation.name;
      byRelation.set(name, [...(byRelation.get(name) ?? []), rule]);
    }
    this.byRelation = byRelation;
    this.eligible = eligible;
    this.hasFacts = hasFacts;
  }

  /**
   * Swaps eligible relation goals in a planned body for their rewritten
   * copies. Each swap adds a magic rule that asks the copy about the
   * arguments known at that point: the literals before the goal are the
   * magic rule's body.
   */
  body(planned: readonly Literal[], source: unknown, isQuery: boolean) {
    const out: Literal[] = [];
    const bound = new Set<string>();
    for (const literal of planned) {
      if (literal instanceof Atom && this.eligible(literal.relation.name)) {
        const { args, relation } = literal;
        const adornment = args.map((arg) => isKnown(arg, bound, isQuery));
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
        out.push(new Atom(this.adorned(relation, adornment), args));
      } else {
        out.push(literal);
      }
      bindVariables(literal, bound, !isQuery);
    }
    return out;
  }

  /** Rewrites every relation queued so far. */
  drain() {
    for (
      let next = this.pending.pop();
      next !== undefined;
      next = this.pending.pop()
    ) {
      const [relation, adornment] = next;
      const name = adornedName(relation.name, adornment);
      if (!this.done.has(name)) {
        this.done.add(name);
        this.relation(relation, adornment);
      }
    }
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
      const guard = new Atom(magic, pick(rule.head.args, adornment));
      this.rules.push({
        aggregates: [],
        body: this.body(
          planLiterals([guard, ...rule.body]),
          rule.source,
          false
        ),
        head: new Atom(head, rule.head.args),
        source: rule.source,
      });
    }
    if (this.hasFacts(relation.name)) {
      const vars = relation.columns.map(
        (_, position) => new LogicVariable(`_fact${position}`)
      );
      this.facts.add(relation.name);
      this.rules.push({
        aggregates: [],
        body: [
          new Atom(magic, pick(vars, adornment)),
          new Atom({ ...relation, name: factsName(relation.name) }, vars),
        ],
        head: new Atom(head, vars),
        source: ["fact", [relation.name, ...vars.map(() => "?_")]],
      });
    }
  }
}

/**
 * Rewrites query bodies to derive only what they can reach, or returns
 * undefined when none asks a rule-defined relation about a known argument.
 */
export const rewriteQueries = (
  rules: readonly CompiledRule[],
  bodies: readonly (readonly Literal[])[],
  hasFacts: (relation: string) => boolean
): MagicProgram | undefined => {
  // A relation with a copy is one that rules derive without aggregating.
  const derived = new Map<string, boolean>();
  for (const { aggregates, head } of rules) {
    const plain = aggregates.length === 0;
    derived.set(
      head.relation.name,
      plain && derived.get(head.relation.name) !== false
    );
  }
  const rewrite = new Rewrite(
    rules,
    (relation) => derived.get(relation) === true,
    hasFacts
  );
  const rewritten = bodies.map((body) => rewrite.body(body, undefined, true));
  if (!rewrite.directed) {
    return undefined;
  }
  // A copy whose guarded body cannot be planned leaves the query as it is.
  return compilable(() => {
    rewrite.drain();
    return { bodies: rewritten, facts: rewrite.facts, rules: rewrite.rules };
  });
};

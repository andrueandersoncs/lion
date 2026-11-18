/**
 * Goal-directed queries by the magic-sets rewrite.
 *
 * Bottom-up evaluation derives every fact a relation's rules imply, so asking
 * for `["path", "a", "?to"]` would otherwise compute paths from every node.
 * The rewrite gives a rule-defined relation a copy for the arguments a goal
 * knows ("adornment"), guarded by a "magic" relation that holds the
 * arguments someone asked about. Magic rules pass those arguments down
 * through rule bodies, so evaluation derives only facts the query can reach.
 * The copies hold a subset of the original facts, so the rewritten program
 * still finishes.
 *
 * Only a relation goal that knows an argument is swapped for a copy, and
 * only while the database has not derived the relation in full. Any other
 * goal reads the relation under its own name: a copy for a goal that knows
 * nothing would hold every row, so the database derives the relation itself,
 * the first time a goal reads it, and keeps it for every later query. So
 * does a question, under `not`, in a find, or as a value, which needs every
 * row of the relations it asks about, and so do aggregated and computed
 * relations and relations that rules invent rows of, which have no copies.
 */
import {
  bindVariables,
  type CompiledRule,
  compilable,
  headsOf,
  isEvaluable,
  type Literal,
  planLiterals,
  scopeOf,
} from "@/logic/compile";
import {
  Atom,
  isGroundValue,
  LogicValue,
  LogicVariable,
  patternParts,
  type RelationInfo,
  termVariables,
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

const FACTS = `${REWRITTEN}facts^`;

/** The name a rewritten rule reads a relation's facts under. */
export const factsName = (relation: string) => `${FACTS}${relation}`;

/** The relation whose facts a name from `factsName` reads, or undefined. */
export const factsOf = (name: string) =>
  name.startsWith(FACTS) ? name.slice(FACTS.length) : undefined;

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
 * instead of seeding it. A question in a value waits only for the variables
 * of `scope`, the body around it; the rest are its own.
 */
const isKnown = (
  term: unknown,
  bound: ReadonlySet<string>,
  scope: ReadonlySet<string>,
  isQuery: boolean
) => {
  if (term instanceof LogicVariable) {
    return bound.has(term.name);
  }
  return term instanceof LogicValue
    ? isQuery && isEvaluable(term, bound, scope)
    : isGroundValue(term);
};

const pick = <T>(items: readonly T[], adornment: Adornment) =>
  items.filter((_, position) => adornment[position]);

/**
 * True when an argument is data once the variables in `bound` have values,
 * so rows can be looked up by it: data, one of those variables, or a record
 * or list made of such.
 */
const isLookup = (arg: unknown, bound: ReadonlySet<string>): boolean => {
  if (arg instanceof LogicVariable) {
    return bound.has(arg.name);
  }
  const parts = patternParts(arg, false);
  return parts === undefined
    ? isGroundValue(arg)
    : parts.every((part) => isLookup(part, bound));
};

/**
 * A rule's planned body with the guard of its copy, which holds the
 * arguments asked about. The guard leads when a relation goal of the body
 * can look rows up by what it binds: the copy runs the guard, then that
 * goal, then the rest of the body planned with all of that bound, and so
 * reads only the rows asked about. Otherwise leading would make the rule
 * scan the same rows once for each argument asked about, so the guard is a
 * test instead, placed where the rule's own plan has bound what it holds:
 * the copy does no more than the rule does, and keeps only what was asked.
 */
export const guarded = (body: readonly Literal[], guard: Atom): Literal[] => {
  const given = new Set<string>();
  bindVariables(guard, given);
  const lookup = body.find(
    (literal) =>
      literal instanceof Atom &&
      literal.args.some(
        (arg) =>
          termVariables(arg).some((name) => given.has(name)) &&
          isLookup(arg, given)
      )
  );
  const led =
    lookup === undefined
      ? undefined
      : compilable(() => {
          const bound = new Set(given);
          planLiterals([lookup], bound);
          bindVariables(lookup, bound);
          const rest = body.filter((literal) => literal !== lookup);
          return [guard, lookup, ...planLiterals(rest, bound)];
        });
  if (led !== undefined) {
    return led;
  }
  // What the guard holds can ask questions, of variables of their own.
  const scope = scopeOf(body);
  const known = new Set<string>();
  let at = 0;
  for (; at < body.length && !isEvaluable(guard, known, scope); at += 1) {
    bindVariables(body[at] as Literal, known);
  }
  return [...body.slice(0, at), guard, ...body.slice(at)];
};

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
    const scope = scopeOf(planned);
    for (const literal of planned) {
      const adornment =
        literal instanceof Atom && this.eligible(literal.relation.name)
          ? literal.args.map((arg) => isKnown(arg, bound, scope, isQuery))
          : [];
      const copied = adornment.some(Boolean);
      this.directed ||= isQuery && copied;
      out.push(
        copied ? this.copy(literal as Atom, adornment, out, source) : literal
      );
      bindVariables(literal, bound, !isQuery);
    }
    return out;
  }

  /**
   * The copy a goal reads for the arguments it knows, and the magic rule
   * that asks it about them once the literals `before` the goal have run.
   */
  private copy(
    { args, relation }: Atom,
    adornment: Adornment,
    before: readonly Literal[],
    source: unknown
  ) {
    this.rules.push({
      aggregates: [],
      body: [...before],
      demand: true,
      head: new Atom(this.magic(relation, adornment), pick(args, adornment)),
      source,
    });
    this.pending.push([relation, adornment]);
    return new Atom(this.adorned(relation, adornment), args);
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
    for (const rule of this.rulesOf(relation)) {
      const guard = new Atom(magic, pick(rule.head.args, adornment));
      this.rules.push({
        aggregates: [],
        body: this.body(guarded(rule.body, guard), rule.source, false),
        head: new Atom(head, rule.head.args),
        source: rule.source,
      });
    }
  }

  /**
   * A relation's rules, and for a relation with facts, a rule that reads
   * them, under `factsName`.
   */
  private rulesOf(relation: RelationInfo): readonly CompiledRule[] {
    const rules = this.byRelation.get(relation.name) ?? [];
    if (!this.hasFacts(relation.name)) {
      return rules;
    }
    this.facts.add(relation.name);
    const vars = relation.columns.map(
      (_, position) => new LogicVariable(`_fact${position}`)
    );
    return [
      ...rules,
      {
        aggregates: [],
        body: [new Atom({ ...relation, name: factsName(relation.name) }, vars)],
        head: new Atom(relation, vars),
        source: ["fact", [relation.name, ...vars.map(() => "?_")]],
      },
    ];
  }
}

/**
 * Rewrites query bodies to derive only what they can reach, or returns
 * undefined when none asks a rule-defined relation about a known argument.
 * `isComplete` says which relations the database has derived in full, which
 * the rewritten rules read as they are.
 */
export const rewriteQueries = (
  rules: readonly CompiledRule[],
  bodies: readonly (readonly Literal[])[],
  hasFacts: (relation: string) => boolean,
  isComplete: (relation: string) => boolean
): MagicProgram | undefined => {
  // A relation with a copy is one that rules derive without aggregating.
  // A relation that rules aggregate into, or invent rows of, is derived in
  // full, since what such a rule adds depends on every row.
  const derived = new Map<string, boolean>();
  for (const rule of rules) {
    const plain = rule.aggregates.length === 0 && rule.invents === undefined;
    for (const { relation } of headsOf(rule)) {
      derived.set(relation.name, plain && derived.get(relation.name) !== false);
    }
  }
  const rewrite = new Rewrite(
    rules,
    (relation) => derived.get(relation) === true && !isComplete(relation),
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

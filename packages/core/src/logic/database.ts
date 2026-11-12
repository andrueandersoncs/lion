import { Effect } from "effect";
import { ArithmeticError, LogicError, logicError } from "@/errors/evaluation";
import { aggregator, LATTICE_AGGREGATES } from "@/logic/aggregates";
import {
  bindVariables,
  type CompiledQuery,
  type CompiledRule,
  type Literal,
  literalGoal,
  matchesAtom,
  planLiterals,
} from "@/logic/compile";
import { type MagicProgram, originalName, rewriteQueries } from "@/logic/magic";
import { type Assertion, assertionProblem } from "@/logic/query-options";
import { dependencyEdges, stronglyConnected } from "@/logic/strata";
import {
  Atom,
  type ComputedRelation,
  Conjunction,
  call,
  DeferredCall,
  Disjunction,
  type Goal,
  instantiate,
  isGoal,
  isGroundValue,
  isWaiting,
  type LionFunction,
  LogicVariable,
  logicKey,
  Membership,
  makeRelationValue,
  Negation,
  type RelationInfo,
  render,
  sameValue,
  show,
  Unification,
  valueKey,
} from "@/logic/terms";
import type { LionEnvironmentService } from "@/services/evaluation";
import type { EvaluationError } from "@/types/evaluation";

type Tuple = readonly unknown[];

type LogicEffect<A> = Effect.Effect<A, EvaluationError, LionEnvironmentService>;

const getOrCreate = <K, V>(map: Map<K, V>, key: K, make: () => V): V => {
  let value = map.get(key);
  if (value === undefined) {
    value = make();
    map.set(key, value);
  }
  return value;
};

interface Index {
  readonly buckets: Map<string, Tuple[]>;
  readonly positions: readonly number[];
}

const bucketKey = (positions: readonly number[], tuple: Tuple) =>
  valueKey(positions.map((position) => tuple[position]));

/**
 * A set of tuples with hash indexes built on demand per bound-column set.
 * Adding a tuple updates the existing indexes, so a relation that grows one
 * round at a time never rebuilds them.
 */
class TupleSet {
  private readonly tuples = new Map<string, Tuple>();
  private readonly indexes = new Map<string, Index>();
  /**
   * Set for a computed relation: adds the rows for some input values the
   * first time a goal asks for them, or returns why it cannot.
   */
  demand: ((inputs: Tuple) => string | undefined) | undefined;

  get size(): number {
    return this.tuples.size;
  }

  values(): IterableIterator<Tuple> {
    return this.tuples.values();
  }

  has(tuple: Tuple): boolean {
    return this.tuples.has(valueKey(tuple));
  }

  add(tuple: Tuple): boolean {
    const key = valueKey(tuple);
    if (this.tuples.has(key)) {
      return false;
    }
    this.tuples.set(key, tuple);
    for (const { buckets, positions } of this.indexes.values()) {
      getOrCreate(buckets, bucketKey(positions, tuple), () => []).push(tuple);
    }
    return true;
  }

  delete(tuple: Tuple): boolean {
    const key = valueKey(tuple);
    const stored = this.tuples.get(key);
    if (stored === undefined) {
      return false;
    }
    this.tuples.delete(key);
    for (const { buckets, positions } of this.indexes.values()) {
      const bucket = bucketKey(positions, stored);
      const remaining = buckets.get(bucket)?.filter((item) => item !== stored);
      if (remaining === undefined || remaining.length === 0) {
        buckets.delete(bucket);
      } else {
        buckets.set(bucket, remaining);
      }
    }
    return true;
  }

  clone(): TupleSet {
    const copy = new TupleSet();
    for (const tuple of this.tuples.values()) {
      copy.add(tuple);
    }
    return copy;
  }

  lookup(positions: readonly number[], values: readonly unknown[]) {
    if (positions.length === 0) {
      return this.tuples.values();
    }
    const indexKey = positions.join(",");
    let index = this.indexes.get(indexKey);
    if (index === undefined) {
      index = { buckets: new Map(), positions };
      for (const tuple of this.tuples.values()) {
        getOrCreate(index.buckets, bucketKey(positions, tuple), () => []).push(
          tuple
        );
      }
      this.indexes.set(indexKey, index);
    }
    return index.buckets.get(valueKey(values)) ?? [];
  }
}

const EMPTY = new TupleSet();

type Vars = ReadonlyMap<string, unknown>;

/** What a match rests on: a tuple it read, or a test that held for it. */
type Premise =
  | { readonly relation: string; readonly tuple: Tuple }
  | { readonly literal: Literal; readonly vars: Vars };

interface Binding {
  readonly trail: readonly Premise[];
  readonly vars: Vars;
}

interface Derivation {
  /**
   * For an aggregated fact, the body matches it combines. A selecting
   * aggregate such as min keeps only the match that produced its value.
   */
  readonly matches?: readonly (readonly Premise[])[];
  readonly rule: CompiledRule;
  readonly trail: readonly Premise[];
}

interface Model {
  /** Computed relations evaluated so far, by relation name. */
  readonly computed: Map<string, ComputedRelation>;
  readonly derivations: Map<string, Map<string, Derivation>>;
  readonly relations: Map<string, TupleSet>;
}

export interface LogicDatabaseOptions {
  /**
   * Derive only what each query can reach (the default). When false, every
   * query computes every relation, which is useful to compare results.
   */
  readonly goalDirected?: boolean;
}

/**
 * A goal the database must never answer ("none"), or must always answer
 * ("some"). Every change to facts or rules is checked against it.
 */
export interface Invariant {
  readonly assert: Assertion;
  /** The evaluated goal, so a snapshot can write the invariant back out. */
  readonly goal: unknown;
  /**
   * Equal for invariants a snapshot would write the same way. Set when the
   * database adds the invariant; undefined when it has no written form.
   */
  readonly key?: string;
  readonly queries: readonly CompiledQuery[];
}

/**
 * Relations, base facts, rules, and invariants for one evaluation. The
 * derived model is computed on demand and cached until a fact or rule changes.
 */
export class LogicDatabase {
  readonly relations = new Map<string, RelationInfo>();
  readonly facts = new Map<string, TupleSet>();
  rules: readonly CompiledRule[] = [];
  invariants: readonly Invariant[] = [];
  version = 0;
  cache: { readonly model: Model; readonly version: number } | undefined;
  /** Models for goal-directed queries, by query, for the current version. */
  readonly goals = new Map<string, Model>();
  readonly goalDirected: boolean;

  constructor(options: LogicDatabaseOptions = {}) {
    this.goalDirected = options.goalDirected ?? true;
  }
}

const keyProblem = (
  name: string,
  columns: readonly string[],
  key: readonly string[]
) => {
  if (key.length === 0) {
    return `Relation "${name}" needs at least one key column.`;
  }
  const unknown = key.find((column) => !columns.includes(column));
  if (unknown !== undefined) {
    return `Relation "${name}" has no column "${unknown}" to use as a key. Its columns are ${JSON.stringify(columns)}.`;
  }
  return new Set(key).size === key.length
    ? undefined
    : `Relation "${name}" repeats a key column.`;
};

const describeRelation = (relation: RelationInfo) =>
  relation.key === undefined
    ? `columns ${JSON.stringify(relation.columns)}`
    : `columns ${JSON.stringify(relation.columns)} and key ${JSON.stringify(keyColumns(relation))}`;

/** The names of a keyed relation's key columns. */
export const keyColumns = (relation: RelationInfo) =>
  (relation.key ?? []).map((position) => relation.columns[position]);

export const declareRelation = (
  database: LogicDatabase,
  name: string,
  columns: readonly string[],
  key?: readonly string[]
): Effect.Effect<RelationInfo, LogicError> => {
  if (new Set(columns).size !== columns.length) {
    return logicError(`Relation "${name}" repeats a column name.`);
  }
  const problem =
    key === undefined ? undefined : keyProblem(name, columns, key);
  if (problem !== undefined) {
    return logicError(problem);
  }
  const relation: RelationInfo = {
    name,
    columns: [...columns],
    ...(key === undefined
      ? {}
      : { key: key.map((column) => columns.indexOf(column)) }),
  };
  const existing = database.relations.get(name);
  if (existing !== undefined) {
    return describeRelation(existing) === describeRelation(relation)
      ? Effect.succeed(existing)
      : logicError(
          `Relation "${name}" is already declared with ${describeRelation(existing)}.`
        );
  }
  database.relations.set(name, relation);
  database.facts.set(name, new TupleSet());
  return Effect.succeed(relation);
};

/**
 * The Lion value bound to a relation's name: calling it with one term per
 * column builds a goal.
 */
export const relationValue = (relation: RelationInfo) =>
  makeRelationValue(relation, (...args: unknown[]) =>
    args.length === relation.columns.length
      ? Effect.succeed(new Atom(relation, args))
      : logicError(
          `"${relation.name}" takes ${relation.columns.length} arguments (${relation.columns.join(", ")}) but got ${args.length}.`
        )
  );

/** A binding for every relation declared in the database. */
export const relationBindings = (database: LogicDatabase) =>
  Object.fromEntries(
    [...database.relations.values()].map((relation) => [
      relation.name,
      relationValue(relation),
    ])
  );

/** How the call that builds a computed relation reads, without its columns. */
const computedCall = ({ args, relation }: Atom) =>
  show(relation.computed?.form(args.slice(0, relation.computed.inputs)));

const groundTuple = (
  database: LogicDatabase,
  atom: Atom
): Effect.Effect<Tuple, LogicError> => {
  if (atom.relation.computed !== undefined) {
    return logicError(
      `${computedCall(atom)} is computed from its inputs, so it cannot have facts.`
    );
  }
  if (!database.relations.has(atom.relation.name)) {
    return logicError(`Relation "${atom.relation.name}" is not declared here.`);
  }
  if (atom.args.some(isWaiting)) {
    return logicError(`Facts cannot contain logic variables: ${show(atom)}.`);
  }
  if (!atom.args.every(isGroundValue)) {
    return logicError(`Facts may only contain JSON data: ${show(atom)}.`);
  }
  return Effect.succeed(atom.args);
};

const touch = (database: LogicDatabase) => {
  database.version += 1;
  database.cache = undefined;
  database.goals.clear();
};

const isAggregated = (rules: readonly CompiledRule[], relation: string) =>
  rules.some(
    (rule) => rule.head.relation.name === relation && rule.aggregates.length > 0
  );

/**
 * Undoes a change to the database, or is undefined when the change left the
 * database as it was.
 */
type Undo = (() => void) | undefined;

/**
 * Adds and removes facts for one change. While the database has invariants,
 * a change writes to copies of the fact sets it touches and swaps them in, so
 * undoing it puts back the very sets it replaced, with their facts in the
 * same order. Without invariants nothing can fail after the change, so it
 * writes in place.
 */
class FactChange {
  private readonly copies = new Map<string, TupleSet>();
  private changed = false;
  private readonly database: LogicDatabase;
  private readonly undoable: boolean;

  constructor(database: LogicDatabase) {
    this.database = database;
    this.undoable = database.invariants.length > 0;
  }

  /** The facts of a relation, to read and write during this change. */
  facts(relation: string): TupleSet | undefined {
    const live = this.database.facts.get(relation);
    if (live === undefined || !this.undoable) {
      return live;
    }
    return getOrCreate(this.copies, relation, () => live.clone());
  }

  add(facts: TupleSet, tuple: Tuple): void {
    if (facts.add(tuple)) {
      this.changed = true;
    }
  }

  delete(facts: TupleSet, tuple: Tuple): boolean {
    const deleted = facts.delete(tuple);
    this.changed ||= deleted;
    return deleted;
  }

  /** Puts the changed facts in place, and returns how to undo that. */
  apply(): Undo {
    if (!this.changed) {
      return undefined;
    }
    const originals = new Map<string, TupleSet>();
    for (const [relation, copy] of this.copies) {
      const original = this.database.facts.get(relation);
      if (original !== undefined) {
        originals.set(relation, original);
      }
      this.database.facts.set(relation, copy);
    }
    return () => {
      for (const [relation, original] of originals) {
        this.database.facts.set(relation, original);
      }
    };
  }
}

/**
 * Makes a change, then checks every invariant. When a check fails, or an
 * invariant does not hold, the change is undone, so a form that changes the
 * database either completes or leaves the database as it was. `describe`
 * starts the message, such as "Adding this rule".
 */
const commit = (
  database: LogicDatabase,
  describe: string,
  change: () => Undo
) =>
  Effect.suspend(() => {
    const undo = change();
    if (undo === undefined) {
      return Effect.void;
    }
    touch(database);
    return checkInvariants(
      database,
      database.invariants,
      `${describe} breaks an invariant, so nothing changed.`
    ).pipe(
      Effect.onError(() =>
        Effect.sync(() => {
          undo();
          touch(database);
        })
      )
    );
  });

const these = (atoms: readonly Atom[]) =>
  atoms.length === 1 ? "this fact" : "these facts";

export const assertFacts = (database: LogicDatabase, atoms: readonly Atom[]) =>
  Effect.gen(function* () {
    const tuples: (readonly [Atom, Tuple])[] = [];
    for (const atom of atoms) {
      if (isAggregated(database.rules, atom.relation.name)) {
        return yield* logicError(
          `"${atom.relation.name}" is computed by aggregate rules, so it cannot have facts.`
        );
      }
      tuples.push([atom, yield* groundTuple(database, atom)] as const);
    }
    yield* commit(database, `Adding ${these(atoms)}`, () => {
      const change = new FactChange(database);
      for (const [atom, tuple] of tuples) {
        // The declared relation decides the key, as when the fact was checked.
        const { name } = atom.relation;
        addFact(change, database.relations.get(name) ?? atom.relation, tuple);
      }
      return change.apply();
    });
    return atoms.map(render);
  });

/** Adds a fact. One whose key is already present replaces the old row. */
const addFact = (change: FactChange, relation: RelationInfo, tuple: Tuple) => {
  const facts = change.facts(relation.name);
  if (facts === undefined) {
    return;
  }
  const { key } = relation;
  if (key !== undefined) {
    const keyValues = key.map((position) => tuple[position]);
    for (const old of [...facts.lookup(key, keyValues)]) {
      if (valueKey(old) !== valueKey(tuple)) {
        change.delete(facts, old);
      }
    }
  }
  change.add(facts, tuple);
};

export const retractFacts = (database: LogicDatabase, atoms: readonly Atom[]) =>
  Effect.gen(function* () {
    // Every fact is checked before any is removed, so a retract that fails
    // removes nothing.
    const tuples: (readonly [Atom, Tuple])[] = [];
    for (const atom of atoms) {
      tuples.push([atom, yield* groundTuple(database, atom)] as const);
    }
    const removed: unknown[] = [];
    yield* commit(database, `Retracting ${these(atoms)}`, () => {
      const change = new FactChange(database);
      for (const [atom, tuple] of tuples) {
        const facts = change.facts(atom.relation.name);
        if (facts !== undefined && change.delete(facts, tuple)) {
          removed.push(render(atom));
        }
      }
      return change.apply();
    });
    return removed;
  });

/**
 * Groups relations into strongly connected components, ordered so every
 * component comes after the components it depends on.
 */
const components = (rules: readonly CompiledRule[]) => {
  const edges = dependencyEdges(rules);
  return stronglyConnected(edges.keys(), (name) => [
    ...(edges.get(name) ?? []),
  ]).map((component) => new Set(component));
};

const componentOf = (ordered: readonly Set<string>[], relation: string) =>
  ordered.find((component) => component.has(relation));

/** The kind of the aggregate at a head position, such as `"sum"`. */
const aggregateKind = (rule: CompiledRule, position: number) =>
  (rule.head.args[position] as DeferredCall).aggregate as string;

/** Which head columns aggregate, and how, such as `"1:sum"`. */
const aggregateShape = (rule: CompiledRule) =>
  rule.aggregates
    .map((position) => `${position}:${aggregateKind(rule, position)}`)
    .join(",");

const checkAggregateShapes = (rules: readonly CompiledRule[]) => {
  const shapes = new Map<string, string>();
  for (const rule of rules) {
    const relation = rule.head.relation.name;
    const shape = aggregateShape(rule);
    const earlier = shapes.get(relation);
    if (earlier !== undefined && earlier !== shape) {
      return `Every rule for "${relation}" must aggregate the same columns in the same way, but ${show(rule.source)} differs from an earlier rule.`;
    }
    shapes.set(relation, shape);
  }
  return undefined;
};

const LAST_SEPARATOR = /, ([^,]*)$/;

const latticeNames = (conjunction: string) =>
  LATTICE_AGGREGATES.map((kind) => `aggregate/${kind}`)
    .join(", ")
    .replace(LAST_SEPARATOR, `, ${conjunction} $1`);

const LATTICE_NAMES = latticeNames("and");

/**
 * A recursive rule may aggregate only with lattice aggregates, whose values
 * move one way, and only when every relation in its cycle aggregates too:
 * replacing an aggregated row must not strand rows derived from the old one.
 */
const recursiveAggregateProblem = (
  rules: readonly CompiledRule[],
  rule: CompiledRule,
  component: ReadonlySet<string>,
  dependency: string
) => {
  const head = rule.head.relation.name;
  const other = rule.aggregates
    .map((position) => aggregateKind(rule, position))
    .find((kind) => aggregator(kind).join === undefined);
  if (other !== undefined) {
    return `Rule ${show(rule.source)} aggregates with aggregate/${other} over "${dependency}", which depends on "${head}". Only ${LATTICE_NAMES} can go through recursion.`;
  }
  const plain = [...component].find((name) => !isAggregated(rules, name));
  if (plain !== undefined) {
    return `"${plain}" and "${head}" depend on each other, so "${plain}" must aggregate too. Every relation in a recursive cycle through an aggregate must aggregate with ${LATTICE_NAMES}.`;
  }
  return undefined;
};

/** A goal for each computed relation that rule bodies use, by name. */
const computedGoals = (rules: readonly CompiledRule[]) => {
  const found = new Map<string, Atom>();
  for (const rule of rules) {
    for (const { goal } of rule.body) {
      if (goal instanceof Atom && goal.relation.computed !== undefined) {
        found.set(goal.relation.name, goal);
      }
    }
  }
  return found;
};

type Components = readonly Set<string>[];

const computedCycleProblem = (
  rules: readonly CompiledRule[],
  ordered: Components
) => {
  for (const [name, goal] of computedGoals(rules)) {
    const others = [...(componentOf(ordered, name) ?? [])].filter(
      (member) => member !== name
    );
    if (others.length > 0) {
      return `${computedCall(goal)} reads relations that depend on its own results, through ${others.map((other) => `"${other}"`).join(", ")}. A computed relation cannot be part of a recursive cycle.`;
    }
  }
  return undefined;
};

/**
 * Variables whose values come from facts rather than from computation. Only
 * these can feed a recursive rule's head, so recursion never invents values
 * without end.
 */
const dataBound = (body: readonly Literal[]) => {
  const bound = new Set<string>();
  for (const literal of body) {
    bindVariables(literal, bound, true);
  }
  return bound;
};

/** Checks one rule's recursion against the rest of the program. */
const recursionProblem = (
  rules: readonly CompiledRule[],
  rule: CompiledRule,
  ordered: Components
) => {
  const component = componentOf(ordered, rule.head.relation.name) ?? new Set();
  const reads = (negated: boolean) =>
    rule.body.find(
      (literal) =>
        literal.goal instanceof Atom &&
        literal.negated === negated &&
        component.has(literal.goal.relation.name)
    )?.goal as Atom | undefined;
  const recursive = reads(false);
  if (recursive !== undefined && rule.aggregates.length > 0) {
    const problem = recursiveAggregateProblem(
      rules,
      rule,
      component,
      recursive.relation.name
    );
    if (problem !== undefined) {
      return problem;
    }
  }
  const negated = reads(true);
  if (negated !== undefined) {
    return `Rule ${show(rule.source)} negates "${negated.relation.name}", which depends on "${rule.head.relation.name}". Negation cannot go through recursion.`;
  }
  if (recursive === undefined) {
    return undefined;
  }
  const fromData = dataBound(rule.body);
  const computed = rule.head.args.find(
    (arg, position) =>
      (arg instanceof DeferredCall && !rule.aggregates.includes(position)) ||
      (arg instanceof LogicVariable && !fromData.has(arg.name))
  );
  if (computed !== undefined) {
    const what =
      computed instanceof LogicVariable
        ? `a new value for ${show(computed)}`
        : "a new value";
    return `Rule ${show(rule.source)} computes ${what} in its head while recursing, which may never finish. Compute the value in a non-recursive rule, or aggregate it with ${latticeNames("or")}.`;
  }
  return undefined;
};

const checkProgram = (rules: readonly CompiledRule[]) => {
  const shapeProblem = checkAggregateShapes(rules);
  if (shapeProblem !== undefined) {
    return shapeProblem;
  }
  const ordered = components(rules);
  const cycle = computedCycleProblem(rules, ordered);
  if (cycle !== undefined) {
    return cycle;
  }
  for (const rule of rules) {
    const problem = recursionProblem(rules, rule, ordered);
    if (problem !== undefined) {
      return problem;
    }
  }
  return undefined;
};

/**
 * Adds rules. A rule the database already holds, one a snapshot would write
 * the same way, is not added again, so adding it changes nothing.
 */
export const addRules = (
  database: LogicDatabase,
  added: readonly CompiledRule[]
): LogicEffect<void> => {
  const held = new Set(database.rules.map((rule) => rule.key));
  const rules = added.filter(
    (rule) => rule.key === undefined || !held.has(rule.key)
  );
  if (rules.length === 0) {
    return Effect.void;
  }
  for (const rule of rules) {
    const { computed, name } = rule.head.relation;
    if (computed !== undefined) {
      return logicError(
        `Rules cannot add to ${computedCall(rule.head)}: it is computed from its inputs.`
      );
    }
    if (!database.relations.has(name)) {
      return logicError(`Relation "${name}" is not declared here.`);
    }
  }
  for (const rule of rules) {
    const relation = rule.head.relation.name;
    if (
      rule.aggregates.length > 0 &&
      (database.facts.get(relation)?.size ?? 0) > 0
    ) {
      return logicError(
        `"${relation}" has facts, so rules cannot aggregate into it. Aggregate into a relation of its own.`
      );
    }
  }
  const previous = database.rules;
  const next = [...previous, ...rules];
  const problem = checkProgram(next);
  if (problem !== undefined) {
    return logicError(problem);
  }
  return commit(database, "Adding this rule", () => {
    database.rules = next;
    return () => {
      database.rules = previous;
    };
  });
};

const LINE_BREAKS = /\s*\n\s*/g;

/** A failure inside a waiting call names the call and the values it ran on. */
const inCall =
  (waiting: DeferredCall, vars: Vars) =>
  (error: EvaluationError): EvaluationError =>
    error instanceof LogicError || error instanceof ArithmeticError
      ? error
      : new LogicError({
          message: `${show(instantiate(waiting, vars))} failed: ${String(error.message).replace(LINE_BREAKS, " ")}`,
        });

const evaluateCall = (
  waiting: DeferredCall,
  vars: Vars
): LogicEffect<unknown> =>
  Effect.gen(function* () {
    const fn = yield* evaluateTerm(waiting.fn, vars);
    if (typeof fn !== "function") {
      return yield* logicError(
        `${show(fn)} is not a function, so ${show(instantiate(waiting, vars))} cannot run.`
      );
    }
    const args: unknown[] = [];
    for (const arg of waiting.args) {
      args.push(yield* evaluateTerm(arg, vars));
    }
    return yield* call(fn as LionFunction, ...args) as LogicEffect<unknown>;
  }).pipe(Effect.mapError(inCall(waiting, vars)));

/** The value of a term for an answer that has bound its variables. */
const evaluateTerm = (term: unknown, vars: Vars): LogicEffect<unknown> => {
  if (term instanceof LogicVariable) {
    return Effect.succeed(vars.get(term.name));
  }
  if (term instanceof DeferredCall) {
    return evaluateCall(term, vars);
  }
  // A goal used as a value is true or false.
  return isGoal(term) ? holds(term, vars) : Effect.succeed(term);
};

type Step = (binding: Binding) => LogicEffect<readonly Binding[]>;

type Source = (relation: string) => TupleSet;

/** The tuples an atom can match, and the variables each would bind. */
const lookup = (atom: Atom, vars: Vars, source: Source) =>
  Effect.gen(function* () {
    const positions: number[] = [];
    const values: unknown[] = [];
    const free: [number, string][] = [];
    for (const [position, arg] of atom.args.entries()) {
      if (arg instanceof LogicVariable && !vars.has(arg.name)) {
        free.push([position, arg.name]);
      } else {
        positions.push(position);
        values.push(yield* evaluateTerm(arg, vars));
      }
    }
    const tuples = source(atom.relation.name);
    const inputs = values.slice(0, atom.relation.computed?.inputs ?? 0);
    const problem = tuples.demand?.(inputs);
    if (problem !== undefined) {
      return yield* logicError(problem);
    }
    return { free, tuples: tuples.lookup(positions, values) };
  });

const extend = (
  binding: Binding,
  free: readonly [number, string][],
  tuple: Tuple
): Map<string, unknown> | undefined => {
  const vars = new Map(binding.vars);
  for (const [position, name] of free) {
    const value = tuple[position];
    if (!vars.has(name)) {
      vars.set(name, value);
    } else if (valueKey(vars.get(name)) !== valueKey(value)) {
      return undefined;
    }
  }
  return vars;
};

const matchAtom =
  (atom: Atom, source: Source): Step =>
  (binding) =>
    Effect.gen(function* () {
      const relation = atom.relation.name;
      const { free, tuples } = yield* lookup(atom, binding.vars, source);
      const out: Binding[] = [];
      for (const tuple of tuples) {
        const vars = extend(binding, free, tuple);
        if (vars !== undefined) {
          out.push({ vars, trail: [...binding.trail, { relation, tuple }] });
        }
      }
      return out;
    });

const isEmpty = (tuples: Iterable<Tuple>) =>
  tuples[Symbol.iterator]().next().done === true;

// Rules test the same list over and over, so remember each list's item keys.
const listKeys = new WeakMap<readonly unknown[], ReadonlySet<string>>();

const itemKeys = (items: readonly unknown[]) => {
  let keys = listKeys.get(items);
  if (keys === undefined) {
    keys = new Set(items.map(valueKey));
    listKeys.set(items, keys);
  }
  return keys;
};

const listOf = (list: unknown, vars: Vars) =>
  Effect.flatMap(evaluateTerm(list, vars), (items) =>
    Array.isArray(items)
      ? Effect.succeed(items as readonly unknown[])
      : logicError(`"in" expects a list, but ${show(list)} is ${show(items)}.`)
  );

/** Tests a goal that has no "and", "or", or "not" in it. */
const test = (
  goal: Literal["goal"],
  vars: Vars,
  source?: Source
): LogicEffect<boolean> =>
  Effect.gen(function* () {
    if (goal instanceof Atom) {
      return source === undefined
        ? yield* logicError(
            `${show(instantiate(goal, vars))} is a relation goal, so it has no value. A relation holds or not only as a goal of a rule or query.`
          )
        : !isEmpty((yield* lookup(goal, vars, source)).tuples);
    }
    if (goal instanceof Unification) {
      return sameValue(
        yield* evaluateTerm(goal.left, vars),
        yield* evaluateTerm(goal.right, vars)
      );
    }
    if (goal instanceof Membership) {
      const items = yield* listOf(goal.list, vars);
      const element = yield* evaluateTerm(goal.element, vars);
      return itemKeys(items).has(valueKey(element));
    }
    const value = yield* evaluateTerm(goal, vars);
    return typeof value === "boolean"
      ? value
      : yield* logicError(
          `A filter must be true or false, but ${show(instantiate(goal, vars))} is ${show(value)}.`
        );
  });

/**
 * Whether a goal holds for an answer that has bound all of its variables.
 * Without a `source` of tuples the goal is being used as a value, and only a
 * goal with no relation in it has one. Like the plain forms, "and" stops at
 * the first part that is false and "or" at the first that is true.
 */
const holds = (goal: Goal, vars: Vars, source?: Source): LogicEffect<boolean> =>
  Effect.gen(function* () {
    if (typeof goal === "boolean") {
      return goal;
    }
    if (goal instanceof Negation) {
      return !(yield* holds(goal.goal, vars, source));
    }
    if (!(goal instanceof Conjunction || goal instanceof Disjunction)) {
      return yield* test(goal, vars, source);
    }
    const stop = goal instanceof Disjunction;
    for (const part of goal.goals) {
      if ((yield* holds(part, vars, source)) === stop) {
        return stop;
      }
    }
    return !stop;
  });

const isUnbound = (term: unknown, vars: Vars): term is LogicVariable =>
  term instanceof LogicVariable && !vars.has(term.name);

/**
 * The variable "=" or "in" binds for an answer that has no value for it
 * yet, with the values to give it; undefined when the goal only tests.
 */
const binds = (
  goal: Literal["goal"],
  vars: Vars
): LogicEffect<readonly [LogicVariable, readonly unknown[]] | undefined> =>
  Effect.gen(function* () {
    if (goal instanceof Unification) {
      const { left, right } = goal;
      if (isUnbound(left, vars)) {
        return [left, [yield* evaluateTerm(right, vars)]];
      }
      if (isUnbound(right, vars)) {
        return [right, [yield* evaluateTerm(left, vars)]];
      }
    }
    if (goal instanceof Membership && isUnbound(goal.element, vars)) {
      // A list that repeats an item binds it once.
      const items = yield* listOf(goal.list, vars);
      const distinct = new Map(items.map((item) => [valueKey(item), item]));
      return [goal.element, [...distinct.values()]];
    }
    return undefined;
  });

/** Atoms, filters, and negated goals show up in `why`; "=" and "in" do not. */
const leavesPremise = ({ goal, negated }: Literal) =>
  negated || !(goal instanceof Unification || goal instanceof Membership);

/**
 * Runs one literal for one answer. An atom matches tuples, "=" and "in"
 * bind a variable that has no value yet, and everything else is a test.
 */
const literalStep = (literal: Literal, source: Source): Step => {
  if (matchesAtom(literal)) {
    return matchAtom(literal.goal, source);
  }
  const { goal, negated } = literal;
  return ({ trail, vars }) =>
    Effect.gen(function* () {
      const bound = negated ? undefined : yield* binds(goal, vars);
      if (bound !== undefined) {
        const [{ name }, values] = bound;
        return values.map((value) => ({
          vars: new Map(vars).set(name, value),
          trail,
        }));
      }
      if ((yield* holds(goal, vars, source)) === negated) {
        return [];
      }
      const premises = leavesPremise(literal)
        ? [...trail, { literal, vars }]
        : trail;
      return [{ vars, trail: premises }];
    });
};

const stepLiteral = (
  literal: Literal,
  bindings: readonly Binding[],
  source: Source
) =>
  Effect.gen(function* () {
    const step = literalStep(literal, source);
    const out: Binding[] = [];
    for (const binding of bindings) {
      for (const next of yield* step(binding)) {
        out.push(next);
      }
    }
    return out;
  });

const evaluateBody = (
  body: readonly Literal[],
  source: (position: number, relation: string) => TupleSet
) =>
  Effect.gen(function* () {
    let bindings: readonly Binding[] = [{ vars: new Map(), trail: [] }];
    for (const [position, literal] of body.entries()) {
      bindings = yield* stepLiteral(literal, bindings, (relation) =>
        source(position, relation)
      );
      if (bindings.length === 0) {
        break;
      }
    }
    return bindings;
  });

/** A row a rule derived, which must be JSON data. */
const derivedRow = (rule: CompiledRule, tuple: readonly unknown[]) =>
  tuple.every(isGroundValue)
    ? Effect.succeed(tuple as Tuple)
    : logicError(
        `Rule ${show(rule.source)} produced a value that is not JSON data: ${show([rule.head.relation.name, ...tuple])}.`
      );

const headTuple = (rule: CompiledRule, binding: Binding) =>
  Effect.gen(function* () {
    const tuple: unknown[] = [];
    for (const arg of rule.head.args) {
      tuple.push(yield* evaluateTerm(arg, binding.vars));
    }
    return yield* derivedRow(rule, tuple);
  });

/** Adds a derived tuple, remembering the first derivation for `why`. */
const recordDerived = (
  model: Model,
  delta: Map<string, TupleSet>,
  rule: CompiledRule,
  tuple: Tuple,
  binding: Binding
) => {
  const relation = rule.head.relation.name;
  if (
    !getOrCreate(model.relations, relation, () => new TupleSet()).add(tuple)
  ) {
    return;
  }
  getOrCreate(delta, relation, () => new TupleSet()).add(tuple);
  getOrCreate(model.derivations, relation, () => new Map()).set(
    valueKey(tuple),
    { rule, trail: binding.trail }
  );
};

/** Fails when a derived row has the key of a different row already there. */
const checkKey = (model: Model, rule: CompiledRule, tuple: Tuple) => {
  const { key, name } = rule.head.relation;
  if (key === undefined) {
    return Effect.void;
  }
  const keyValues = key.map((position) => tuple[position]);
  const tupleKey = valueKey(tuple);
  for (const other of model.relations.get(name)?.lookup(key, keyValues) ?? []) {
    if (valueKey(other) !== tupleKey) {
      const relation = originalName(name);
      return logicError(
        `"${relation}" is keyed by ${JSON.stringify(keyColumns(rule.head.relation))}, but ${show(rule.source)} derived ${show([relation, ...tuple])} while ${show([relation, ...other])} holds.`
      );
    }
  }
  return Effect.void;
};

const deriveHeads = (
  rule: CompiledRule,
  bindings: readonly Binding[],
  model: Model,
  delta: Map<string, TupleSet>
) =>
  Effect.gen(function* () {
    const derived: [Tuple, Binding][] = [];
    for (const binding of bindings) {
      derived.push([yield* headTuple(rule, binding), binding]);
    }
    for (const [tuple, binding] of derived) {
      yield* checkKey(model, rule, tuple);
      recordDerived(model, delta, rule, tuple, binding);
    }
  });

const hasChanges = (delta: ReadonlyMap<string, TupleSet>) =>
  [...delta.values()].some((changes) => changes.size > 0);

const fullRelation = (model: Model) => (relation: string) =>
  model.relations.get(relation) ?? EMPTY;

interface DeltaPlan {
  readonly body: readonly Literal[];
  /** The body position each premise of a match comes from, in run order. */
  readonly premises: readonly number[];
}

const deltaPlans = new WeakMap<CompiledRule, Map<number, DeltaPlan>>();

/**
 * The rule's body reordered to start from the goal at `position`, so a round
 * starts from the few new tuples instead of scanning everything else first.
 */
const deltaPlan = (rule: CompiledRule, position: number): DeltaPlan => {
  let plans = deltaPlans.get(rule);
  if (plans === undefined) {
    plans = new Map();
    deltaPlans.set(rule, plans);
  }
  const known = plans.get(position);
  if (known !== undefined) {
    return known;
  }
  const first = rule.body[position];
  const unchanged = {
    body: rule.body,
    premises: rule.body.flatMap((literal, at) =>
      leavesPremise(literal) ? [at] : []
    ),
  };
  let plan: DeltaPlan = unchanged;
  if (
    first !== undefined &&
    matchesAtom(first) &&
    first.goal.args.every((arg) => !(arg instanceof DeferredCall))
  ) {
    const rest = planLiterals(
      rule.body.filter((_, at) => at !== position),
      first.goal.args.flatMap((arg) =>
        arg instanceof LogicVariable ? [arg.name] : []
      )
    );
    if (typeof rest !== "string") {
      const body = [first, ...rest];
      plan = {
        body,
        premises: body.flatMap((literal) =>
          leavesPremise(literal) ? [rule.body.indexOf(literal)] : []
        ),
      };
    }
  }
  plans.set(position, plan);
  return plan;
};

/** Puts a match's premises back in the rule's body order, for `why`. */
const inBodyOrder = (trail: readonly Premise[], premises: readonly number[]) =>
  trail
    .map((premise, at) => [premises[at] ?? at, premise] as const)
    .sort(([a], [b]) => a - b)
    .map(([, premise]) => premise);

/**
 * Re-runs a rule once per body goal that matches tuples new in the last round,
 * so every returned binding uses at least one new tuple.
 */
const changedBindings = (
  rule: CompiledRule,
  delta: ReadonlyMap<string, TupleSet>,
  model: Model
) =>
  Effect.gen(function* () {
    const full = fullRelation(model);
    const out: Binding[] = [];
    for (const [position, literal] of rule.body.entries()) {
      const changes = matchesAtom(literal)
        ? delta.get(literal.goal.relation.name)
        : undefined;
      if (changes === undefined || changes.size === 0) {
        continue;
      }
      const plan = deltaPlan(rule, position);
      const changedAt = plan.body.indexOf(literal);
      const bindings = yield* evaluateBody(plan.body, (at, relation) =>
        at === changedAt ? changes : full(relation)
      );
      for (const binding of bindings) {
        out.push({
          vars: binding.vars,
          trail: inBodyOrder(binding.trail, plan.premises),
        });
      }
    }
    return out;
  });

/** A key that is equal for bindings of the same variables to the same values. */
const bindingKey = (vars: Vars) =>
  valueKey([...vars.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));

/** The matches of an aggregate rule that share their other head values. */
interface Group {
  /** Head values, with null where the head aggregates. */
  readonly key: Tuple;
  readonly rule: CompiledRule;
  /** The premises of each match, or of the one a selecting aggregate kept. */
  trails: (readonly Premise[])[];
  /** The row the group gave when it was last combined. */
  tuple?: Tuple;
  /**
   * For each aggregate, the values to combine: one from each match, or for
   * a lattice aggregate, its result so far and the values that came since.
   */
  readonly values: unknown[][];
}

/** The head values of one match, and the value it gives each aggregate. */
const matchValues = (rule: CompiledRule, binding: Binding) =>
  Effect.gen(function* () {
    const key: unknown[] = [];
    const values: unknown[] = [];
    for (const [position, arg] of rule.head.args.entries()) {
      if (rule.aggregates.includes(position)) {
        const [value] = (arg as DeferredCall).args;
        key.push(null);
        values.push(yield* evaluateTerm(value, binding.vars));
      } else {
        key.push(yield* evaluateTerm(arg, binding.vars));
      }
    }
    return { key, values };
  });

/** True when one match explains the row: its only aggregate picked it. */
const selectsAlone = (rule: CompiledRule) => {
  const [position, ...others] = rule.aggregates;
  return (
    others.length === 0 &&
    aggregator(aggregateKind(rule, position ?? 0)).selects
  );
};

/** Why an aggregate cannot combine some values, naming the rule. */
const aggregateProblem = (
  rule: CompiledRule,
  kind: string,
  values: readonly unknown[]
) => {
  const problem = aggregator(kind).check(values);
  if (problem === undefined) {
    return;
  }
  // A list usually means the rule wanted each match's own list combined.
  const hint = values.some(Array.isArray)
    ? ` As a whole argument of a rule head, aggregate/${kind} combines one value from every match. To combine each match's own list, do it in the body, as in ["=", "?result", ["aggregate/${kind}", "?list"]].`
    : "";
  return `Rule ${show(rule.source)}: aggregate/${kind} ${problem}.${hint}`;
};

/**
 * Combines a group's values into its row. A lattice aggregate then keeps
 * only its result, which later matches join, so recursion never starts over.
 */
const combine = (group: Group) =>
  Effect.gen(function* () {
    const { key, rule, values } = group;
    const tuple = [...key];
    for (const [index, position] of rule.aggregates.entries()) {
      const kind = aggregateKind(rule, position);
      const given = values[index] ?? [];
      const problem = aggregateProblem(rule, kind, given);
      if (problem !== undefined) {
        return yield* logicError(problem);
      }
      const { fold, join } = aggregator(kind);
      const result = fold(given);
      tuple[position] = result;
      if (join !== undefined) {
        values[index] = [result];
      }
      if (selectsAlone(rule)) {
        const winner = given.findIndex((value) => sameValue(value, result));
        group.trails = [group.trails[winner] ?? []];
      }
    }
    return yield* derivedRow(rule, tuple);
  });

/** The groups of the aggregate rules being evaluated. */
interface Groups {
  readonly byKey: Map<string, Group>;
  /** Groups that got matches since they were last combined. */
  changed: Set<Group>;
  /**
   * The matches each rule form has given. A rule's body is a set of matches,
   * so a match that several alternatives of one rule find counts once.
   * Separate rules add up.
   */
  readonly seen: Map<unknown, Set<string>>;
}

/** Gives each new match of a rule to the group its head values name. */
const addMatches = (
  groups: Groups,
  rule: CompiledRule,
  bindings: readonly Binding[]
) =>
  Effect.gen(function* () {
    const seen = getOrCreate(groups.seen, rule.source, () => new Set<string>());
    for (const binding of bindings) {
      const id = bindingKey(binding.vars);
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      const { key, values } = yield* matchValues(rule, binding);
      const group = getOrCreate(
        groups.byKey,
        `${rule.head.relation.name}\u0000${valueKey(key)}`,
        (): Group => ({
          key,
          rule,
          trails: [],
          values: rule.aggregates.map(() => []),
        })
      );
      for (const [index, value] of values.entries()) {
        group.values[index]?.push(value);
      }
      group.trails.push(binding.trail);
      groups.changed.add(group);
    }
  });

/** Combines the groups that changed, and returns the rows that are new. */
const settle = (groups: Groups, model: Model) =>
  Effect.gen(function* () {
    const delta = new Map<string, TupleSet>();
    for (const group of groups.changed) {
      const { rule, tuple: old } = group;
      const tuple = yield* combine(group);
      if (old !== undefined && valueKey(old) === valueKey(tuple)) {
        continue;
      }
      const relation = rule.head.relation.name;
      const tuples = getOrCreate(
        model.relations,
        relation,
        () => new TupleSet()
      );
      if (old !== undefined) {
        tuples.delete(old);
      }
      tuples.add(tuple);
      group.tuple = tuple;
      getOrCreate(delta, relation, () => new TupleSet()).add(tuple);
      // Replaced rows keep their derivations, so explanations that pass
      // through an earlier best value still read correctly.
      getOrCreate(model.derivations, relation, () => new Map()).set(
        valueKey(tuple),
        selectsAlone(rule)
          ? { rule, trail: group.trails[0] ?? [] }
          : { rule, trail: [], matches: [...group.trails] }
      );
    }
    groups.changed = new Set();
    return delta;
  });

/** Recursion through lattice aggregates stops after this many rounds. */
export const MAX_LATTICE_ROUNDS = 10_000;

/**
 * Evaluates the rules of aggregated relations. Every match joins a group,
 * and a group that got matches is combined again. Rules that do not recurse
 * are done after one round. Recursion goes only through lattice aggregates,
 * whose results move one way, so it ends once no group's row changes.
 */
const evaluateAggregates = (model: Model, rules: readonly CompiledRule[]) =>
  Effect.gen(function* () {
    const groups: Groups = {
      byKey: new Map(),
      changed: new Set(),
      seen: new Map(),
    };
    const full = fullRelation(model);
    for (const rule of rules) {
      const bindings = yield* evaluateBody(rule.body, (_, relation) =>
        full(relation)
      );
      yield* addMatches(groups, rule, bindings);
    }
    let delta = yield* settle(groups, model);
    for (let round = 1; hasChanges(delta); round += 1) {
      if (round > MAX_LATTICE_ROUNDS) {
        const names = [
          ...new Set(rules.map((rule) => `"${rule.head.relation.name}"`)),
        ];
        return yield* logicError(
          `${names.join(" and ")} kept improving after ${MAX_LATTICE_ROUNDS} rounds, so evaluation stopped. A cycle can improve a value forever, such as a negative-weight cycle under aggregate/min.`
        );
      }
      for (const rule of rules) {
        const bindings = yield* changedBindings(rule, delta, model);
        yield* addMatches(groups, rule, bindings);
      }
      delta = yield* settle(groups, model);
    }
  });

const evaluateComponent = (model: Model, rules: readonly CompiledRule[]) =>
  Effect.gen(function* () {
    if (rules.some((rule) => rule.aggregates.length > 0)) {
      return yield* evaluateAggregates(model, rules);
    }
    const full = fullRelation(model);
    let delta = new Map<string, TupleSet>();
    for (const rule of rules) {
      const bindings = yield* evaluateBody(rule.body, (_, relation) =>
        full(relation)
      );
      yield* deriveHeads(rule, bindings, model, delta);
    }
    while (hasChanges(delta)) {
      const next = new Map<string, TupleSet>();
      for (const rule of rules) {
        const bindings = yield* changedBindings(rule, delta, model);
        yield* deriveHeads(rule, bindings, model, next);
      }
      delta = next;
    }
  });

/**
 * Makes a computed relation's rows available. Its algorithm runs over its
 * complete input relations the first time a goal asks for some input values.
 */
const computeRelation = (model: Model, relation: RelationInfo) => {
  const { columns, computed, name } = relation;
  if (computed === undefined || model.relations.has(name)) {
    return Effect.void;
  }
  const missing = computed.dependencies.find(
    (dependency) => !model.relations.has(dependency)
  );
  if (missing !== undefined) {
    return logicError(`Relation "${missing}" is not declared here.`);
  }
  const tuples = new TupleSet();
  const asked = new Map<string, string | undefined>();
  const compute = (inputs: Tuple) => {
    const rows = computed.compute(
      (input) => [...(model.relations.get(input)?.values() ?? [])],
      inputs
    );
    if (typeof rows === "string") {
      return rows;
    }
    const width = columns.length - inputs.length;
    for (const row of rows) {
      if (row.length !== width || !row.every(isGroundValue)) {
        return `${show(computed.form(inputs))} produced a row that is not ${width} JSON values: ${show(row)}.`;
      }
      tuples.add([...inputs, ...row]);
    }
    return undefined;
  };
  tuples.demand = (inputs) => {
    const key = valueKey(inputs);
    if (!asked.has(key)) {
      asked.set(key, compute(inputs));
    }
    return asked.get(key);
  };
  model.relations.set(name, tuples);
  model.computed.set(name, computed);
  return Effect.void;
};

/** Computes the relations a query or explanation reads but no rule did. */
const computeUsed = (model: Model, body: readonly Literal[]) =>
  Effect.gen(function* () {
    for (const { goal } of body) {
      if (goal instanceof Atom) {
        yield* computeRelation(model, goal.relation);
      }
    }
  });

/**
 * Semi-naive bottom-up evaluation, one component at a time. With `only`, a
 * set closed under dependencies, it skips components outside the set.
 */
const computeModel = (database: LogicDatabase, only?: ReadonlySet<string>) =>
  Effect.gen(function* () {
    const relations = new Map<string, TupleSet>();
    for (const [name, facts] of database.facts) {
      relations.set(name, facts.clone());
    }
    const model: Model = {
      computed: new Map(),
      relations,
      derivations: new Map(),
    };
    const computed = computedGoals(database.rules);
    for (const component of components(database.rules)) {
      if (
        only !== undefined &&
        ![...component].some((name) => only.has(name))
      ) {
        continue;
      }
      const rules = database.rules.filter((rule) =>
        component.has(rule.head.relation.name)
      );
      if (rules.length > 0) {
        yield* evaluateComponent(model, rules);
      }
      for (const name of component) {
        const goal = computed.get(name);
        if (goal !== undefined) {
          yield* computeRelation(model, goal.relation);
        }
      }
    }
    return model;
  });

const currentModel = (database: LogicDatabase) =>
  Effect.gen(function* () {
    if (database.cache?.version === database.version) {
      return database.cache.model;
    }
    const version = database.version;
    const model = yield* computeModel(database);
    database.cache = { model, version };
    return model;
  });

/**
 * Evaluates a rewritten query program: the relations it leaves alone in
 * full, then the rewritten rules on top of them.
 */
const goalModel = (database: LogicDatabase, program: MagicProgram) =>
  Effect.gen(function* () {
    const model = yield* computeModel(database, program.full);
    for (const rule of program.rules) {
      yield* computeUsed(model, rule.body);
    }
    for (const component of components(program.rules)) {
      yield* evaluateComponent(
        model,
        program.rules.filter((rule) => component.has(rule.head.relation.name))
      );
    }
    return model;
  });

/** A key for a query's rewritten model; undefined when a goal has no key. */
const queryKey = (queries: readonly CompiledQuery[]) =>
  logicKey(
    queries.map((query) => [query.outputs, query.body.map(literalGoal)])
  );

/**
 * The model and query bodies to answer with. A query that asks a rule-defined
 * relation about known arguments derives only what it can reach.
 */
const answerModel = (
  database: LogicDatabase,
  queries: readonly CompiledQuery[]
) =>
  Effect.gen(function* () {
    const program = database.goalDirected
      ? rewriteQueries(
          database.rules,
          queries,
          (relation) => (database.facts.get(relation)?.size ?? 0) > 0
        )
      : undefined;
    if (program === undefined) {
      return { model: yield* currentModel(database), queries };
    }
    const key = queryKey(queries);
    const cached = key === undefined ? undefined : database.goals.get(key);
    if (cached !== undefined) {
      return { model: cached, queries: program.queries };
    }
    const model = yield* goalModel(database, program);
    if (key !== undefined) {
      database.goals.set(key, model);
    }
    return { model, queries: program.queries };
  });

/** Runs a query and returns one record per distinct answer. */
export const queryDatabase = (
  database: LogicDatabase,
  compiled: readonly CompiledQuery[]
) =>
  Effect.gen(function* () {
    const { model, queries } = yield* answerModel(database, compiled);
    const rows = new Map<string, Record<string, unknown>>();
    for (const query of queries) {
      yield* computeUsed(model, query.body);
      const bindings = yield* evaluateBody(
        query.body,
        (_, relation) => model.relations.get(relation) ?? EMPTY
      );
      for (const binding of bindings) {
        // An alternative of "or" may leave some of the variables unbound.
        const row = Object.fromEntries(
          query.outputs.flatMap((name) =>
            binding.vars.has(name) ? [[name, binding.vars.get(name)]] : []
          )
        );
        if (!isGroundValue(row)) {
          return yield* logicError(
            `The query produced an answer that is not JSON data: ${show(row)}.`
          );
        }
        rows.set(valueKey(row), row);
      }
    }
    return [...rows.values()];
  });

/**
 * Answers each invariant's goal as a query would, and fails with the first
 * one whose answers break its assertion. `context` starts the message.
 */
const checkInvariants = (
  database: LogicDatabase,
  invariants: readonly Invariant[],
  context: string
) =>
  Effect.gen(function* () {
    for (const invariant of invariants) {
      const rows = yield* queryDatabase(database, invariant.queries);
      const problem = assertionProblem(
        "invariant",
        invariant.assert,
        rows,
        invariant.goal
      );
      if (problem !== undefined) {
        return yield* logicError(`${context} ${problem}`);
      }
    }
  });

/**
 * Adds an invariant that holds now. From then on, every change to facts or
 * rules that would break it fails and is undone. An invariant the database
 * already holds, one a snapshot would write the same way, is not added again.
 */
export const addInvariant = (database: LogicDatabase, invariant: Invariant) =>
  Effect.gen(function* () {
    const key = logicKey([invariant.assert, invariant.goal]);
    if (
      key !== undefined &&
      database.invariants.some((held) => held.key === key)
    ) {
      return;
    }
    yield* checkInvariants(
      database,
      [invariant],
      "This invariant does not hold, so it was not added."
    );
    database.invariants = [
      ...database.invariants,
      { ...invariant, ...(key === undefined ? {} : { key }) },
    ];
  });

const explainPremise = (model: Model, premise: Premise): unknown => {
  if ("tuple" in premise) {
    return explain(model, premise.relation, premise.tuple);
  }
  const { goal, negated } = premise.literal;
  return { [negated ? "absent" : "check"]: instantiate(goal, premise.vars) };
};

const explain = (model: Model, relation: string, tuple: Tuple): unknown => {
  const computed = model.computed.get(relation);
  if (computed !== undefined) {
    return { fact: computed.form(tuple), computed: true };
  }
  const fact = [relation, ...tuple];
  const derivation = model.derivations.get(relation)?.get(valueKey(tuple));
  if (derivation === undefined) {
    return { fact, given: true };
  }
  const explainTrail = (trail: readonly Premise[]) =>
    trail.map((premise) => explainPremise(model, premise));
  const rule = derivation.rule.source;
  return derivation.matches === undefined
    ? { fact, rule, because: explainTrail(derivation.trail) }
    : { fact, rule, matches: derivation.matches.map(explainTrail) };
};

/** Explains how a fact was derived, or returns null when it does not hold. */
export const explainFact = (database: LogicDatabase, atom: Atom) =>
  Effect.gen(function* () {
    const model = yield* currentModel(database);
    if (atom.relation.computed !== undefined) {
      if (!atom.args.every(isGroundValue)) {
        return yield* logicError(
          `why expects a fact without variables: ${show(atom)}.`
        );
      }
      yield* computeRelation(model, atom.relation);
      return (yield* holds(atom, new Map(), fullRelation(model)))
        ? explain(model, atom.relation.name, atom.args)
        : null;
    }
    const tuple = yield* groundTuple(database, atom);
    return model.relations.get(atom.relation.name)?.has(tuple)
      ? explain(model, atom.relation.name, tuple)
      : null;
  });

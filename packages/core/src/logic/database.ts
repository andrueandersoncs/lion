import { Effect } from "effect";
import { LogicError } from "@/errors/evaluation";
import { aggregator, LATTICE_AGGREGATES } from "@/logic/aggregates";
import {
  type CompiledQuery,
  type CompiledRule,
  type Literal,
  planLiterals,
} from "@/logic/compile";
import { type MagicProgram, originalName, rewriteQueries } from "@/logic/magic";
import {
  Aggregate,
  Atom,
  type ComputedRelation,
  DeferredCall,
  isGroundValue,
  isLogicTerm,
  LogicVariable,
  makeRelationValue,
  type RelationInfo,
  render,
  sameValue,
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

type Premise =
  | { readonly kind: "atom"; readonly relation: string; readonly tuple: Tuple }
  | { readonly kind: "check"; readonly call: unknown }
  | { readonly kind: "absent"; readonly pattern: unknown };

interface Binding {
  readonly trail: readonly Premise[];
  readonly vars: ReadonlyMap<string, unknown>;
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
 * Relations, base facts, and rules for one evaluation. The derived model is
 * computed on demand and cached until a fact or rule changes.
 */
export class LogicDatabase {
  readonly relations = new Map<string, RelationInfo>();
  readonly facts = new Map<string, TupleSet>();
  rules: readonly CompiledRule[] = [];
  version = 0;
  cache: { readonly model: Model; readonly version: number } | undefined;
  /** Models for goal-directed queries, by query, for the current version. */
  readonly goals = new Map<string, Model>();
  readonly goalDirected: boolean;

  constructor(options: LogicDatabaseOptions = {}) {
    this.goalDirected = options.goalDirected ?? true;
  }
}

const fail = (message: string) => Effect.fail(new LogicError({ message }));

const show = (value: unknown) => JSON.stringify(render(value));

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
    return fail(`Relation "${name}" repeats a column name.`);
  }
  const problem =
    key === undefined ? undefined : keyProblem(name, columns, key);
  if (problem !== undefined) {
    return fail(problem);
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
      : fail(
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
      : fail(
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

/** How a computed relation's call reads in Lion, for messages. */
const computedCall = (computed: ComputedRelation) =>
  show([computed.callee, ...computed.inputs]);

const groundTuple = (
  database: LogicDatabase,
  atom: Atom
): Effect.Effect<Tuple, LogicError> => {
  const { computed } = atom.relation;
  if (computed !== undefined) {
    return fail(
      `${computedCall(computed)} is computed from its inputs, so it cannot have facts.`
    );
  }
  if (!database.relations.has(atom.relation.name)) {
    return fail(`Relation "${atom.relation.name}" is not declared here.`);
  }
  if (atom.args.some(isLogicTerm)) {
    return fail(`Facts cannot contain logic variables: ${show(atom)}.`);
  }
  if (!atom.args.every(isGroundValue)) {
    return fail(`Facts may only contain JSON data: ${show(atom)}.`);
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

export const assertFacts = (database: LogicDatabase, atoms: readonly Atom[]) =>
  Effect.gen(function* () {
    const tuples: (readonly [Atom, Tuple])[] = [];
    for (const atom of atoms) {
      if (isAggregated(database.rules, atom.relation.name)) {
        return yield* fail(
          `"${atom.relation.name}" is computed by aggregate rules, so it cannot have facts.`
        );
      }
      tuples.push([atom, yield* groundTuple(database, atom)] as const);
    }
    for (const [atom, tuple] of tuples) {
      const facts = database.facts.get(atom.relation.name);
      const key = database.relations.get(atom.relation.name)?.key;
      if (facts !== undefined && key !== undefined) {
        // A fact with a key that is already present replaces the old row.
        const keyValues = key.map((position) => tuple[position]);
        for (const old of [...facts.lookup(key, keyValues)]) {
          facts.delete(old);
        }
      }
      facts?.add(tuple);
    }
    touch(database);
    return atoms.map(render);
  });

export const retractFacts = (database: LogicDatabase, atoms: readonly Atom[]) =>
  Effect.gen(function* () {
    const removed: unknown[] = [];
    for (const atom of atoms) {
      const tuple = yield* groundTuple(database, atom);
      if (database.facts.get(atom.relation.name)?.delete(tuple)) {
        removed.push(render(atom));
      }
    }
    touch(database);
    return removed;
  });

/**
 * Groups relations into strongly connected components, ordered so every
 * component comes after the components it depends on.
 */
const components = (rules: readonly CompiledRule[]) => {
  const edges = new Map<string, Set<string>>();
  for (const rule of rules) {
    const targets = edges.get(rule.head.relation.name) ?? new Set();
    for (const literal of rule.body) {
      if (literal.kind === "atom" || literal.kind === "absent") {
        const { computed, name } = literal.atom.relation;
        targets.add(name);
        if (computed !== undefined) {
          edges.set(name, new Set(computed.dependencies));
        }
      }
    }
    edges.set(rule.head.relation.name, targets);
  }

  const index = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const ordered: Set<string>[] = [];
  let counter = 0;

  const lower = (node: string, value: number | undefined) =>
    lowlink.set(node, Math.min(lowlink.get(node) ?? 0, value ?? 0));

  const popComponent = (root: string) => {
    const component = new Set<string>();
    let member = stack.pop();
    while (member !== undefined) {
      onStack.delete(member);
      component.add(member);
      if (member === root) {
        break;
      }
      member = stack.pop();
    }
    ordered.push(component);
  };

  const visit = (node: string) => {
    index.set(node, counter);
    lowlink.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);
    for (const target of edges.get(node) ?? []) {
      if (!index.has(target)) {
        visit(target);
        lower(node, lowlink.get(target));
      } else if (onStack.has(target)) {
        lower(node, index.get(target));
      }
    }
    if (lowlink.get(node) === index.get(node)) {
      popComponent(node);
    }
  };

  for (const node of edges.keys()) {
    if (!index.has(node)) {
      visit(node);
    }
  }
  return ordered;
};

const componentOf = (ordered: readonly Set<string>[], relation: string) =>
  ordered.find((component) => component.has(relation));

/** Which head columns aggregate, and how, such as `"1:sum"`. */
const aggregateShape = (rule: CompiledRule) =>
  rule.aggregates
    .map(
      (position) =>
        `${position}:${(rule.head.args[position] as Aggregate).kind}`
    )
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
    .map((position) => (rule.head.args[position] as Aggregate).kind)
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

/** Computed relations that rule bodies use, by relation name. */
const computedRelations = (rules: readonly CompiledRule[]) => {
  const found = new Map<string, RelationInfo>();
  for (const rule of rules) {
    for (const literal of rule.body) {
      if (
        (literal.kind === "atom" || literal.kind === "absent") &&
        literal.atom.relation.computed !== undefined
      ) {
        found.set(literal.atom.relation.name, literal.atom.relation);
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
  for (const [name, { computed }] of computedRelations(rules)) {
    const others = [...(componentOf(ordered, name) ?? [])].filter(
      (member) => member !== name
    );
    if (computed !== undefined && others.length > 0) {
      return `${computedCall(computed)} reads relations that depend on its own results, through ${others.map((other) => `"${other}"`).join(", ")}. A computed relation cannot be part of a recursive cycle.`;
    }
  }
  return undefined;
};

/**
 * Variables whose values come from facts rather than from computation: bound
 * by a relation goal, or by "=" or "in" from such variables or plain values.
 * Only these can feed a recursive rule's head, so recursion never invents
 * values without end.
 */
const dataBound = (body: readonly Literal[]) => {
  const bound = new Set<string>();
  const known = (term: unknown) =>
    term instanceof LogicVariable ? bound.has(term.name) : !isLogicTerm(term);
  const bind = (term: unknown) => {
    if (term instanceof LogicVariable) {
      bound.add(term.name);
    }
  };
  for (const literal of body) {
    if (literal.kind === "atom") {
      literal.atom.args.forEach(bind);
    } else if (literal.kind === "unify") {
      if (known(literal.right)) {
        bind(literal.left);
      }
      if (known(literal.left)) {
        bind(literal.right);
      }
    } else if (literal.kind === "member" && known(literal.list)) {
      bind(literal.element);
    }
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
  const recursive = rule.body.find(
    (literal) =>
      literal.kind === "atom" && component.has(literal.atom.relation.name)
  );
  if (recursive?.kind === "atom" && rule.aggregates.length > 0) {
    const problem = recursiveAggregateProblem(
      rules,
      rule,
      component,
      recursive.atom.relation.name
    );
    if (problem !== undefined) {
      return problem;
    }
  }
  const negated = rule.body.find(
    (literal) =>
      literal.kind === "absent" && component.has(literal.atom.relation.name)
  );
  if (negated?.kind === "absent") {
    return `Rule ${show(rule.source)} negates "${negated.atom.relation.name}", which depends on "${rule.head.relation.name}". Negation cannot go through recursion.`;
  }
  if (recursive === undefined) {
    return undefined;
  }
  const fromData = dataBound(rule.body);
  const computed = rule.head.args.find(
    (arg) =>
      arg instanceof DeferredCall ||
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

export const addRules = (
  database: LogicDatabase,
  rules: readonly CompiledRule[]
): Effect.Effect<void, LogicError> => {
  for (const rule of rules) {
    const { computed, name } = rule.head.relation;
    if (computed !== undefined) {
      return fail(
        `Rules cannot add to ${computedCall(computed)}: it is computed from its inputs.`
      );
    }
    if (!database.relations.has(name)) {
      return fail(`Relation "${name}" is not declared here.`);
    }
  }
  for (const rule of rules) {
    const relation = rule.head.relation.name;
    if (
      rule.aggregates.length > 0 &&
      (database.facts.get(relation)?.size ?? 0) > 0
    ) {
      return fail(
        `"${relation}" has facts, so rules cannot aggregate into it. Aggregate into a relation of its own.`
      );
    }
  }
  const next = [...database.rules, ...rules];
  const problem = checkProgram(next);
  if (problem !== undefined) {
    return fail(problem);
  }
  database.rules = next;
  touch(database);
  return Effect.void;
};

const evaluateCall = (call: DeferredCall, vars: ReadonlyMap<string, unknown>) =>
  Effect.gen(function* () {
    const args: unknown[] = [];
    for (const arg of call.args) {
      args.push(yield* evaluateTerm(arg, vars));
    }
    const result = call.fn(...args);
    const value = Effect.isEffect(result)
      ? yield* result as LogicEffect<unknown>
      : result;
    return { args, value };
  });

const evaluateTerm = (
  term: unknown,
  vars: ReadonlyMap<string, unknown>
): LogicEffect<unknown> => {
  if (term instanceof LogicVariable) {
    return Effect.succeed(vars.get(term.name));
  }
  if (term instanceof DeferredCall) {
    return Effect.map(evaluateCall(term, vars), ({ value }) => value);
  }
  return Effect.succeed(term);
};

/** Bound positions and values of an atom; unbound variables are left out. */
const pattern = (atom: Atom, vars: ReadonlyMap<string, unknown>) =>
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
    return { positions, values, free };
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

type Step = (binding: Binding) => LogicEffect<readonly Binding[]>;

type Source = (relation: string) => TupleSet;

const matchAtom =
  (atom: Atom, source: Source): Step =>
  (binding) =>
    Effect.gen(function* () {
      const relation = atom.relation.name;
      const { positions, values, free } = yield* pattern(atom, binding.vars);
      const out: Binding[] = [];
      for (const tuple of source(relation).lookup(positions, values)) {
        const vars = extend(binding, free, tuple);
        if (vars !== undefined) {
          out.push({
            vars,
            trail: [...binding.trail, { kind: "atom", relation, tuple }],
          });
        }
      }
      return out;
    });

const isEmpty = (tuples: Iterable<Tuple>) =>
  tuples[Symbol.iterator]().next().done === true;

const matchAbsent =
  (atom: Atom, source: Source): Step =>
  (binding) =>
    Effect.gen(function* () {
      const relation = atom.relation.name;
      const { positions, values } = yield* pattern(atom, binding.vars);
      if (!isEmpty(source(relation).lookup(positions, values))) {
        return [];
      }
      const shown = atom.args.map((_, position) => {
        const at = positions.indexOf(position);
        return at === -1 ? "?_" : values[at];
      });
      const { computed } = atom.relation;
      const head =
        computed === undefined
          ? [relation]
          : [computed.callee, ...computed.inputs];
      return [
        {
          vars: binding.vars,
          trail: [
            ...binding.trail,
            { kind: "absent", pattern: [...head, ...shown] },
          ],
        },
      ];
    });

const runCheck =
  (call: DeferredCall): Step =>
  (binding) =>
    Effect.map(evaluateCall(call, binding.vars), ({ args, value }) =>
      value
        ? [
            {
              vars: binding.vars,
              trail: [
                ...binding.trail,
                { kind: "check", call: [call.name, ...args] },
              ],
            },
          ]
        : []
    );

const unify =
  (left: unknown, right: unknown): Step =>
  (binding) =>
    Effect.gen(function* () {
      const target = [left, right].find(
        (side): side is LogicVariable =>
          side instanceof LogicVariable && !binding.vars.has(side.name)
      );
      if (target === undefined) {
        const a = yield* evaluateTerm(left, binding.vars);
        const b = yield* evaluateTerm(right, binding.vars);
        return sameValue(a, b) ? [binding] : [];
      }
      const from = target === left ? right : left;
      const vars = new Map(binding.vars);
      vars.set(target.name, yield* evaluateTerm(from, binding.vars));
      return [{ vars, trail: binding.trail }];
    });

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

/** Binds the element to each item of the list, or tests that it is one. */
const member =
  (element: unknown, list: unknown): Step =>
  (binding) =>
    Effect.gen(function* () {
      const items = yield* evaluateTerm(list, binding.vars);
      if (!Array.isArray(items)) {
        return yield* fail(
          `"in" expects a list, but ${show(list)} is ${show(items)}.`
        );
      }
      if (element instanceof LogicVariable && !binding.vars.has(element.name)) {
        const seen = new Set<string>();
        const out: Binding[] = [];
        for (const item of items) {
          const key = valueKey(item);
          if (!seen.has(key)) {
            seen.add(key);
            const vars = new Map(binding.vars);
            vars.set(element.name, item);
            out.push({ vars, trail: binding.trail });
          }
        }
        return out;
      }
      const value = yield* evaluateTerm(element, binding.vars);
      return itemKeys(items).has(valueKey(value)) ? [binding] : [];
    });

const literalStep = (literal: Literal, source: Source): Step => {
  switch (literal.kind) {
    case "atom":
      return matchAtom(literal.atom, source);
    case "absent":
      return matchAbsent(literal.atom, source);
    case "check":
      return runCheck(literal.call);
    case "member":
      return member(literal.element, literal.list);
    default:
      return unify(literal.left, literal.right);
  }
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

const headTuple = (rule: CompiledRule, binding: Binding) =>
  Effect.gen(function* () {
    const tuple: unknown[] = [];
    for (const arg of rule.head.args) {
      tuple.push(yield* evaluateTerm(arg, binding.vars));
    }
    if (!tuple.every(isGroundValue)) {
      return yield* fail(
        `Rule ${show(rule.source)} produced a value that is not JSON data: ${show([rule.head.relation.name, ...tuple])}.`
      );
    }
    return tuple as Tuple;
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
      return fail(
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

const leavesPremise = (literal: Literal) =>
  literal.kind === "atom" ||
  literal.kind === "absent" ||
  literal.kind === "check";

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
    first?.kind === "atom" &&
    first.atom.args.every((arg) => !(arg instanceof DeferredCall))
  ) {
    const rest = planLiterals(
      rule.body.filter((_, at) => at !== position),
      first.atom.args.flatMap((arg) =>
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
      const changes =
        literal.kind === "atom"
          ? delta.get(literal.atom.relation.name)
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
const bindingKey = (vars: ReadonlyMap<string, unknown>) =>
  valueKey([...vars.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));

interface Group {
  /** Head values, with null where the head aggregates. */
  readonly key: Tuple;
  readonly rule: CompiledRule;
  readonly trails: (readonly Premise[])[];
  /** For each aggregate, the value each match contributed. */
  readonly values: unknown[][];
}

/** The head values of one match, and the value it gives each aggregate. */
const matchValues = (rule: CompiledRule, binding: Binding) =>
  Effect.gen(function* () {
    const key: unknown[] = [];
    const values: unknown[] = [];
    for (const arg of rule.head.args) {
      if (arg instanceof Aggregate) {
        key.push(null);
        values.push(yield* evaluateTerm(arg.arg, binding.vars));
      } else {
        key.push(yield* evaluateTerm(arg, binding.vars));
      }
    }
    return { key, values };
  });

const collectGroups = (model: Model, rules: readonly CompiledRule[]) =>
  Effect.gen(function* () {
    const full = fullRelation(model);
    // Each rule's body is a set of matches, so a match that several
    // alternatives of one rule find counts once. Separate rules add up.
    const seen = new Map<unknown, Set<string>>();
    const groups = new Map<string, Group>();
    for (const rule of rules) {
      const matched = getOrCreate(seen, rule.source, () => new Set<string>());
      const bindings = yield* evaluateBody(rule.body, (_, relation) =>
        full(relation)
      );
      for (const binding of bindings) {
        const id = bindingKey(binding.vars);
        if (matched.has(id)) {
          continue;
        }
        matched.add(id);
        const { key, values } = yield* matchValues(rule, binding);
        const group = getOrCreate(groups, valueKey(key), () => ({
          key,
          rule,
          trails: [],
          values: rule.aggregates.map(() => []),
        }));
        for (const [index, value] of values.entries()) {
          group.values[index]?.push(value);
        }
        group.trails.push(binding.trail);
      }
    }
    return groups.values();
  });

const selectsAlone = (rule: CompiledRule) => {
  const [position, ...others] = rule.aggregates;
  return (
    others.length === 0 &&
    aggregator((rule.head.args[position ?? 0] as Aggregate).kind).selects
  );
};

/** Checks values against an aggregate, naming the rule when they do not fit. */
const checkAggregate = (
  rule: CompiledRule,
  kind: string,
  values: readonly unknown[]
) => {
  const problem = aggregator(kind).check(values);
  return problem === undefined
    ? Effect.void
    : fail(`Rule ${show(rule.source)}: aggregate/${kind} ${problem}.`);
};

/** The head tuple with each aggregate's result in its column. */
const aggregatedTuple = (
  rule: CompiledRule,
  key: Tuple,
  results: readonly unknown[]
) => {
  const tuple = [...key];
  for (const [index, position] of rule.aggregates.entries()) {
    tuple[position] = results[index];
  }
  return tuple.every(isGroundValue)
    ? Effect.succeed(tuple as Tuple)
    : fail(
        `Rule ${show(rule.source)} produced a value that is not JSON data: ${show([rule.head.relation.name, ...tuple])}.`
      );
};

/** Combines one group's matches into the aggregated tuple. */
const foldGroup = (group: Group) =>
  Effect.gen(function* () {
    const { rule } = group;
    const results: unknown[] = [];
    let derivation: Derivation = { rule, trail: [], matches: group.trails };
    for (const [index, position] of rule.aggregates.entries()) {
      const { kind } = rule.head.args[position] as Aggregate;
      const values = group.values[index] ?? [];
      yield* checkAggregate(rule, kind, values);
      const result = aggregator(kind).fold(values);
      results.push(result);
      if (selectsAlone(rule)) {
        const winner = values.findIndex((value) => sameValue(value, result));
        derivation = { rule, trail: group.trails[winner] ?? [] };
      }
    }
    const tuple = yield* aggregatedTuple(rule, group.key, results);
    return { derivation, tuple };
  });

/** Aggregate rules run once their inputs are complete; they never recurse. */
const evaluateAggregates = (model: Model, rules: readonly CompiledRule[]) =>
  Effect.gen(function* () {
    for (const group of yield* collectGroups(model, rules)) {
      const { derivation, tuple } = yield* foldGroup(group);
      const relation = group.rule.head.relation.name;
      getOrCreate(model.relations, relation, () => new TupleSet()).add(tuple);
      getOrCreate(model.derivations, relation, () => new Map()).set(
        valueKey(tuple),
        derivation
      );
    }
  });

/** Recursion through lattice aggregates stops after this many rounds. */
export const MAX_LATTICE_ROUNDS = 10_000;

interface Best {
  readonly derivation: Derivation;
  readonly relation: string;
  readonly tuple: Tuple;
  /** The current value of each aggregate. */
  readonly values: readonly unknown[];
}

/** Joins one match into its group's current best, or returns undefined. */
const improve = (
  rule: CompiledRule,
  binding: Binding,
  match: { readonly key: Tuple; readonly values: readonly unknown[] },
  current: Best | undefined
) =>
  Effect.gen(function* () {
    const joined: unknown[] = [];
    let improved = current === undefined;
    for (const [index, position] of rule.aggregates.entries()) {
      const { kind } = rule.head.args[position] as Aggregate;
      const { fold, join } = aggregator(kind);
      const value = match.values[index];
      const previous = current?.values[index];
      yield* checkAggregate(
        rule,
        kind,
        current === undefined ? [value] : [previous, value]
      );
      const result =
        current === undefined || join === undefined
          ? fold([value])
          : join(previous, value);
      improved ||= !sameValue(result, previous);
      joined.push(result);
    }
    if (!improved) {
      return undefined;
    }
    const tuple = yield* aggregatedTuple(rule, match.key, joined);
    const derivation: Derivation = selectsAlone(rule)
      ? { rule, trail: binding.trail }
      : {
          rule,
          trail: [],
          matches: [...(current?.derivation.matches ?? []), binding.trail],
        };
    return {
      derivation,
      relation: rule.head.relation.name,
      tuple,
      values: joined,
    };
  });

/**
 * Recursion through lattice aggregates. Each group keeps its best value so
 * far; a round re-runs the rules on the rows that improved in the last round,
 * and evaluation stops once no group improves.
 */
const evaluateLattice = (model: Model, rules: readonly CompiledRule[]) =>
  Effect.gen(function* () {
    const best = new Map<string, Best>();
    let changed = new Map<string, Best>();
    const offer = (rule: CompiledRule, bindings: readonly Binding[]) =>
      Effect.gen(function* () {
        for (const binding of bindings) {
          const match = yield* matchValues(rule, binding);
          const id = `${rule.head.relation.name}\u0000${valueKey(match.key)}`;
          const next = yield* improve(
            rule,
            binding,
            match,
            changed.get(id) ?? best.get(id)
          );
          if (next !== undefined) {
            changed.set(id, next);
          }
        }
      });
    const settle = () => {
      const delta = new Map<string, TupleSet>();
      for (const [id, entry] of changed) {
        const tuples = getOrCreate(
          model.relations,
          entry.relation,
          () => new TupleSet()
        );
        const old = best.get(id);
        if (old !== undefined) {
          tuples.delete(old.tuple);
        }
        tuples.add(entry.tuple);
        // Replaced rows keep their derivations, so explanations that pass
        // through an earlier best value still read correctly.
        getOrCreate(model.derivations, entry.relation, () => new Map()).set(
          valueKey(entry.tuple),
          entry.derivation
        );
        getOrCreate(delta, entry.relation, () => new TupleSet()).add(
          entry.tuple
        );
        best.set(id, entry);
      }
      changed = new Map();
      return delta;
    };

    const full = fullRelation(model);
    for (const rule of rules) {
      yield* offer(
        rule,
        yield* evaluateBody(rule.body, (_, relation) => full(relation))
      );
    }
    let delta = settle();
    for (let round = 1; hasChanges(delta); round += 1) {
      if (round > MAX_LATTICE_ROUNDS) {
        const names = [
          ...new Set(rules.map((rule) => `"${rule.head.relation.name}"`)),
        ];
        return yield* fail(
          `${names.join(" and ")} kept improving after ${MAX_LATTICE_ROUNDS} rounds, so evaluation stopped. A cycle can improve a value forever, such as a negative-weight cycle under aggregate/min.`
        );
      }
      for (const rule of rules) {
        yield* offer(rule, yield* changedBindings(rule, delta, model));
      }
      delta = settle();
    }
  });

const isRecursive = (rules: readonly CompiledRule[]) => {
  const heads = new Set(rules.map((rule) => rule.head.relation.name));
  return rules.some((rule) =>
    rule.body.some(
      (literal) =>
        literal.kind === "atom" && heads.has(literal.atom.relation.name)
    )
  );
};

const evaluateComponent = (model: Model, rules: readonly CompiledRule[]) =>
  Effect.gen(function* () {
    if (rules.some((rule) => rule.aggregates.length > 0)) {
      return yield* isRecursive(rules)
        ? evaluateLattice(model, rules)
        : evaluateAggregates(model, rules);
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

/** Runs a computed relation's algorithm over its complete inputs. */
const computeRelation = (model: Model, relation: RelationInfo) =>
  Effect.gen(function* () {
    const { computed, name } = relation;
    if (computed === undefined || model.relations.has(name)) {
      return;
    }
    for (const dependency of computed.dependencies) {
      if (!model.relations.has(dependency)) {
        return yield* fail(`Relation "${dependency}" is not declared here.`);
      }
    }
    const rows = computed.compute((input) => [
      ...(model.relations.get(input)?.values() ?? []),
    ]);
    if (typeof rows === "string") {
      return yield* fail(rows);
    }
    const tuples = new TupleSet();
    for (const row of rows) {
      if (row.length !== relation.columns.length || !row.every(isGroundValue)) {
        return yield* fail(
          `${computedCall(computed)} produced a row that is not ${relation.columns.length} JSON values: ${show(row)}.`
        );
      }
      tuples.add(row);
    }
    model.relations.set(name, tuples);
    model.computed.set(name, computed);
  });

/** Computes the relations a query or explanation reads but no rule did. */
const computeUsed = (model: Model, body: readonly Literal[]) =>
  Effect.gen(function* () {
    for (const literal of body) {
      if (literal.kind === "atom" || literal.kind === "absent") {
        yield* computeRelation(model, literal.atom.relation);
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
    const computed = computedRelations(database.rules);
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
        const relation = computed.get(name);
        if (relation !== undefined) {
          yield* computeRelation(model, relation);
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

/** A key that tells variables apart from strings that look like them. */
const termKey = (term: unknown): unknown => {
  if (term instanceof LogicVariable) {
    return { variable: term.name };
  }
  if (term instanceof DeferredCall) {
    return { call: term.name, args: term.args.map(termKey) };
  }
  return { value: term };
};

const literalKey = (literal: Literal): unknown => {
  switch (literal.kind) {
    case "atom":
    case "absent":
      return [
        literal.kind,
        literal.atom.relation.name,
        literal.atom.args.map(termKey),
      ];
    case "check":
      return [literal.kind, termKey(literal.call)];
    case "unify":
      return [literal.kind, termKey(literal.left), termKey(literal.right)];
    default:
      return [literal.kind, termKey(literal.element), termKey(literal.list)];
  }
};

const queryKey = (queries: readonly CompiledQuery[]) =>
  valueKey(queries.map((query) => [query.outputs, query.body.map(literalKey)]));

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
    const cached = database.goals.get(key);
    if (cached !== undefined) {
      return { model: cached, queries: program.queries };
    }
    const model = yield* goalModel(database, program);
    database.goals.set(key, model);
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
        const row = Object.fromEntries(
          query.outputs.map((name) => [name, binding.vars.get(name)])
        );
        rows.set(valueKey(row), row);
      }
    }
    return [...rows.values()];
  });

const explainPremise = (model: Model, premise: Premise): unknown => {
  switch (premise.kind) {
    case "atom":
      return explain(model, premise.relation, premise.tuple);
    case "check":
      return { check: premise.call };
    default:
      return { absent: premise.pattern };
  }
};

const explain = (model: Model, relation: string, tuple: Tuple): unknown => {
  const computed = model.computed.get(relation);
  if (computed !== undefined) {
    return {
      fact: [computed.callee, ...computed.inputs, ...tuple],
      computed: true,
    };
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
        return yield* fail(
          `why expects a fact without variables: ${show(atom)}.`
        );
      }
      yield* computeRelation(model, atom.relation);
      return model.relations.get(atom.relation.name)?.has(atom.args)
        ? explain(model, atom.relation.name, atom.args)
        : null;
    }
    const tuple = yield* groundTuple(database, atom);
    return model.relations.get(atom.relation.name)?.has(tuple)
      ? explain(model, atom.relation.name, tuple)
      : null;
  });

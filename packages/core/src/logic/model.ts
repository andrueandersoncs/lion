/**
 * The engine: the rows a set of rules derives from the facts, and the
 * answers to goals over those rows.
 *
 * A model derives a relation's rows the first time something reads the
 * relation, after the rows of every relation its rules read, and keeps them.
 * Rules run bottom-up with semi-naive evaluation, one group of relations
 * that depend on each other at a time.
 *
 * A goal is answered in two ways. As a goal of a body, a relation call
 * matches rows and binds variables. Anywhere else it is a question: under
 * `not`, in a find, or as a value, it is asked for an answer whose variables
 * are fixed, and every other variable in it is the question's own.
 */
import { Effect } from "effect";
import { ArithmeticError, LogicError, logicError } from "@/errors/evaluation";
import { aggregator } from "@/logic/aggregates";
import {
  type CompiledRule,
  compilable,
  compiling,
  type Literal,
  planLiterals,
  questionPlans,
} from "@/logic/compile";
import { originalName } from "@/logic/magic";
import { mentioned, reads, type Stratum, strataOf } from "@/logic/strata";
import {
  Atom,
  compareValues,
  DeferredCall,
  type Goal,
  instantiate,
  invoke,
  isForm,
  isGroundValue,
  isQuestion,
  isRelational,
  type LionFunction,
  LogicForm,
  LogicValue,
  LogicVariable,
  type RelationInfo,
  sameValue,
  show,
  valueKey,
} from "@/logic/terms";
import type { LionEnvironmentService } from "@/services/evaluation";
import type { EvaluationError } from "@/types/evaluation";

export type Tuple = readonly unknown[];

/** The values an answer gives its variables, by name. */
export type Vars = ReadonlyMap<string, unknown>;

export type LogicEffect<A> = Effect.Effect<
  A,
  EvaluationError,
  LionEnvironmentService
>;

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
export class TupleSet {
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

  /** A set with the same tuples, in the same order. */
  clone(): TupleSet {
    const copy = new TupleSet();
    for (const [key, tuple] of this.tuples) {
      copy.tuples.set(key, tuple);
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

const NO_VARS: Vars = new Map();

/**
 * How a rule derived a row, for `why`: the answer of its body that gave the
 * row, or for an aggregated row, the answers it combines.
 */
type Derivation =
  | Match
  | { readonly rule: CompiledRule; readonly matches: readonly Match[] };

/** An answer of a rule's body. */
interface Match {
  readonly rule: CompiledRule;
  readonly vars: Vars;
}

/**
 * The rows that rules derive on top of facts, or for a goal-directed query,
 * on top of another model.
 */
export class Model {
  /** The rows of each relation derived so far, by relation name. */
  readonly relations = new Map<string, TupleSet>();
  /** How each derived row came about, by relation name and row. */
  readonly derivations = new Map<string, Map<string, Derivation>>();
  /** Relations whose rows are being derived, or are complete. */
  readonly state = new Map<string, "running" | "done">();
  readonly facts: ReadonlyMap<string, TupleSet>;
  readonly rules: readonly CompiledRule[];
  /** The model that holds every relation these rules do not derive. */
  readonly base: Model | undefined;

  constructor(
    facts: ReadonlyMap<string, TupleSet>,
    rules: readonly CompiledRule[],
    base?: Model
  ) {
    this.facts = facts;
    this.rules = rules;
    this.base = base;
  }
}

/**
 * A relation's rows as far as they are derived: every row once `ensure` has
 * run, and until then its facts.
 */
export const rowsOf = (model: Model, relation: string): TupleSet =>
  model.relations.get(relation) ??
  (model.base === undefined
    ? model.facts.get(relation)
    : rowsOf(model.base, relation)) ??
  EMPTY;

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

/** The values of some terms for an answer. */
const tupleOf = (model: Model, terms: readonly unknown[], vars: Vars) =>
  Effect.gen(function* () {
    const tuple: unknown[] = [];
    for (const item of terms) {
      tuple.push(yield* term(model, item, vars));
    }
    return tuple;
  });

const run = (
  model: Model,
  waiting: DeferredCall,
  vars: Vars
): LogicEffect<unknown> =>
  Effect.gen(function* () {
    const fn = yield* term(model, waiting.fn, vars);
    if (typeof fn !== "function") {
      return yield* logicError(
        `${show(fn)} is not a function, so ${show(instantiate(waiting, vars))} cannot run.`
      );
    }
    const args = yield* tupleOf(model, waiting.args, vars);
    const value = yield* invoke(
      fn as LionFunction,
      args
    ) as LogicEffect<unknown>;
    // A call that returns a question, as `eval` of a goal does, is asked it.
    return isQuestion(value) ? yield* answer(model, value) : value;
  }).pipe(Effect.mapError(inCall(waiting, vars)));

/**
 * The value of a term for an answer. A goal is true or false, a find is the
 * list of what it found, and a variable the answer has not bound stays a
 * variable.
 */
export const term = (
  model: Model,
  value: unknown,
  vars: Vars
): LogicEffect<unknown> => {
  if (!(value instanceof LogicValue)) {
    return Effect.succeed(value);
  }
  if (value instanceof LogicVariable) {
    return Effect.succeed(vars.has(value.name) ? vars.get(value.name) : value);
  }
  if (value instanceof DeferredCall) {
    return run(model, value, vars);
  }
  return isForm(value, "find")
    ? findAll(model, value, vars)
    : holds(model, value as Goal, vars);
};

/**
 * The rows a relation call can match for an answer, and the variables each
 * row would bind. `values` holds the arguments' values when they had to be
 * computed. A string says why a computed relation has no rows to give.
 */
const candidates = (
  atom: Atom,
  vars: Vars,
  tuples: TupleSet,
  values?: readonly unknown[]
) => {
  const positions: number[] = [];
  const known: unknown[] = [];
  const free: [number, string][] = [];
  for (const [position, arg] of atom.args.entries()) {
    if (!(arg instanceof LogicVariable)) {
      positions.push(position);
      known.push(values === undefined ? arg : values[position]);
    } else if (vars.has(arg.name)) {
      positions.push(position);
      known.push(vars.get(arg.name));
    } else {
      free.push([position, arg.name]);
    }
  }
  const inputs = atom.relation.computed?.inputs ?? 0;
  return (
    tuples.demand?.(known.slice(0, inputs)) ?? {
      free,
      tuples: tuples.lookup(positions, known),
    }
  );
};

/** The rows a relation call can match, once its arguments are computed. */
const lookup = (model: Model, atom: Atom, vars: Vars, tuples: TupleSet) =>
  Effect.flatMap(tupleOf(model, atom.args, vars), (values) => {
    const found = candidates(atom, vars, tuples, values);
    return typeof found === "string"
      ? logicError(found)
      : Effect.succeed(found);
  });

/** The answer with the variables a row binds, or undefined if they clash. */
const extend = (
  vars: Vars,
  free: readonly [number, string][],
  tuple: Tuple
): Vars | undefined => {
  if (free.length === 0) {
    return vars;
  }
  const next = new Map(vars);
  for (const [position, name] of free) {
    const value = tuple[position];
    if (!next.has(name)) {
      next.set(name, value);
    } else if (!sameValue(next.get(name), value)) {
      return undefined;
    }
  }
  return next;
};

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

const listOf = (model: Model, list: unknown, vars: Vars) =>
  Effect.flatMap(term(model, list, vars), (items) =>
    Array.isArray(items)
      ? Effect.succeed(items as readonly unknown[])
      : logicError(`"in" expects a list, but ${show(list)} is ${show(items)}.`)
  );

/** A key that is equal for answers that bind the same variables alike. */
const answerKey = (vars: Vars) =>
  valueKey([...vars.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));

/** Answers that several alternatives of a goal find count once. */
const distinct = (answers: readonly Vars[]) => [
  ...new Map(answers.map((vars) => [answerKey(vars), vars])).values(),
];

/**
 * Every match of a question for an answer. The variables the answer has
 * bound are fixed, and every other variable is the question's own.
 */
const solve = (
  model: Model,
  question: LogicValue,
  vars: Vars
): LogicEffect<readonly Vars[]> =>
  Effect.gen(function* () {
    const plans = yield* compiling(() =>
      questionPlans(question, (name) => vars.has(name))
    );
    const [only] = plans;
    if (plans.length === 1 && only !== undefined) {
      return yield* matches(model, only.body, vars);
    }
    const found: Vars[] = [];
    for (const { body } of plans) {
      for (const match of yield* matches(model, body, vars)) {
        found.push(match);
      }
    }
    return distinct(found);
  });

/** The value of a find's template for each match, as a sorted list. */
export const collect = (
  model: Model,
  find: LogicForm,
  found: readonly Vars[],
  vars: Vars = NO_VARS
) =>
  Effect.gen(function* () {
    const [template] = find.parts;
    const values: unknown[] = [];
    for (const match of found) {
      const value = yield* term(model, template, match);
      if (!isGroundValue(value)) {
        return yield* logicError(
          `${show(instantiate(find, vars))} found a value that is not JSON data: ${show(value)}.`
        );
      }
      values.push(value);
    }
    return values.sort(compareValues);
  });

const findAll = (model: Model, find: LogicForm, vars: Vars) =>
  Effect.flatMap(solve(model, find, vars), (found) =>
    collect(model, find, found, vars)
  );

/** Like the plain forms, "and" stops at the first false and "or" at the first true. */
const decide = (model: Model, goal: LogicForm, vars: Vars) =>
  Effect.gen(function* () {
    const stop = goal.form === "or";
    for (const part of goal.parts as Goal[]) {
      if ((yield* holds(model, part, vars)) === stop) {
        return stop;
      }
    }
    return !stop;
  });

/** True when a relation goal has a match for an answer. */
const matchesAny = (model: Model, atom: Atom, vars: Vars) => {
  if (!atom.plain || atom.relation.computed !== undefined) {
    return Effect.map(solve(model, atom, vars), (found) => found.length > 0);
  }
  // Nothing to compute: look the rows up directly.
  const found = candidates(atom, vars, rowsOf(model, atom.relation.name));
  if (typeof found === "string") {
    return logicError(found);
  }
  // Each anonymous variable is separate, so it matches any value.
  const named = found.free.filter(([, name]) => !name.startsWith("_"));
  for (const tuple of found.tuples) {
    if (extend(vars, named, tuple) !== undefined) {
      return Effect.succeed(true);
    }
  }
  return Effect.succeed(false);
};

/**
 * Whether a goal holds for an answer. A goal with a relation in it is a
 * question: it holds when it has a match. Any other goal is a filter, which
 * must be true or false.
 */
export const holds = (
  model: Model,
  goal: Goal,
  vars: Vars
): LogicEffect<boolean> => {
  if (typeof goal === "boolean") {
    return Effect.succeed(goal);
  }
  if (goal instanceof Atom) {
    return matchesAny(model, goal, vars);
  }
  const [first, second] = goal.parts;
  switch (goal instanceof LogicForm ? goal.form : undefined) {
    case "not":
      return Effect.map(holds(model, first as Goal, vars), (held) => !held);
    case "and":
    case "or":
      return isRelational(goal)
        ? Effect.map(solve(model, goal, vars), (found) => found.length > 0)
        : decide(model, goal as LogicForm, vars);
    case "=":
      return Effect.zipWith(
        term(model, first, vars),
        term(model, second, vars),
        sameValue
      );
    case "in":
      return Effect.zipWith(
        listOf(model, second, vars),
        term(model, first, vars),
        (items, element) => itemKeys(items).has(valueKey(element))
      );
    default:
      return Effect.flatMap(term(model, goal, vars), (value) =>
        typeof value === "boolean"
          ? Effect.succeed(value)
          : logicError(
              `A filter must be true or false, but ${show(instantiate(goal, vars))} is ${show(value)}.`
            )
      );
  }
};

const isUnbound = (value: unknown, vars: Vars): value is LogicVariable =>
  value instanceof LogicVariable && !vars.has(value.name);

/**
 * The variable "=" or "in" binds for an answer that has no value for it
 * yet, with the values to give it; undefined when the goal only tests.
 */
const binds = (
  model: Model,
  goal: LogicForm,
  vars: Vars
): LogicEffect<readonly [LogicVariable, readonly unknown[]] | undefined> =>
  Effect.gen(function* () {
    const [first, second] = goal.parts;
    if (goal.form === "=") {
      if (isUnbound(first, vars)) {
        return [first, [yield* term(model, second, vars)]];
      }
      if (isUnbound(second, vars)) {
        return [second, [yield* term(model, first, vars)]];
      }
    } else if (isUnbound(first, vars)) {
      // A list that repeats an item binds it once.
      const items = yield* listOf(model, second, vars);
      const unique = new Map(items.map((item) => [valueKey(item), item]));
      return [first, [...unique.values()]];
    }
    return undefined;
  });

/** Extends each answer with every row a relation goal matches for it. */
const matchRows = (
  model: Model,
  atom: Atom,
  answers: readonly Vars[],
  tuples: TupleSet
) =>
  Effect.gen(function* () {
    const out: Vars[] = [];
    for (const vars of answers) {
      const found = atom.plain
        ? candidates(atom, vars, tuples)
        : yield* lookup(model, atom, vars, tuples);
      if (typeof found === "string") {
        return yield* logicError(found);
      }
      for (const tuple of found.tuples) {
        const next = extend(vars, found.free, tuple);
        if (next !== undefined) {
          out.push(next);
        }
      }
    }
    return out;
  });

/**
 * Runs a goal that is not a relation goal for each answer: "=" and "in"
 * bind a variable that has no value yet, and everything else is a test that
 * keeps the answer or drops it.
 */
const testEach = (model: Model, literal: Literal, answers: readonly Vars[]) =>
  Effect.gen(function* () {
    const out: Vars[] = [];
    for (const vars of answers) {
      const bound = isForm(literal, "=", "in")
        ? yield* binds(model, literal, vars)
        : undefined;
      if (bound !== undefined) {
        const [{ name }, values] = bound;
        for (const value of values) {
          out.push(new Map(vars).set(name, value));
        }
      } else if (yield* holds(model, literal, vars)) {
        out.push(vars);
      }
    }
    return out;
  });

/**
 * The answers of a body, starting from an answer that may have bound some
 * variables. `changed` gives the rows a relation goal reads instead of the
 * relation's own, by the goal's position in the body.
 */
export const matches = (
  model: Model,
  body: readonly Literal[],
  start: Vars = NO_VARS,
  changed?: (position: number) => TupleSet | undefined
) =>
  Effect.gen(function* () {
    let answers: readonly Vars[] = [start];
    for (const [position, literal] of body.entries()) {
      answers =
        literal instanceof Atom
          ? yield* matchRows(
              model,
              literal,
              answers,
              changed?.(position) ?? rowsOf(model, literal.relation.name)
            )
          : yield* testEach(model, literal, answers);
      if (answers.length === 0) {
        break;
      }
    }
    return answers;
  });

/** A row a rule derived, which must be JSON data. */
const derivedRow = (rule: CompiledRule, tuple: readonly unknown[]) =>
  tuple.every(isGroundValue)
    ? Effect.succeed(tuple as Tuple)
    : logicError(
        `Rule ${show(rule.source)} produced a value that is not JSON data: ${show([rule.head.relation.name, ...tuple])}.`
      );

/** Adds a derived row, remembering the first answer that gave it. */
const recordDerived = (
  model: Model,
  delta: Map<string, TupleSet>,
  rule: CompiledRule,
  tuple: Tuple,
  vars: Vars
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
    { rule, vars }
  );
};

/** The names of a keyed relation's key columns. */
export const keyColumns = (relation: RelationInfo) =>
  (relation.key ?? []).map((position) => relation.columns[position]);

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
  model: Model,
  rule: CompiledRule,
  answers: readonly Vars[],
  delta: Map<string, TupleSet>
) =>
  Effect.gen(function* () {
    const derived: [Tuple, Vars][] = [];
    for (const vars of answers) {
      const tuple = yield* tupleOf(model, rule.head.args, vars);
      derived.push([yield* derivedRow(rule, tuple), vars]);
    }
    for (const [tuple, vars] of derived) {
      yield* checkKey(model, rule, tuple);
      recordDerived(model, delta, rule, tuple, vars);
    }
  });

const hasChanges = (delta: ReadonlyMap<string, TupleSet>) =>
  [...delta.values()].some((changes) => changes.size > 0);

const deltaPlans = new WeakMap<CompiledRule, Map<number, readonly Literal[]>>();

/**
 * The rule's body reordered to start from the goal at `position`, so a round
 * starts from the few new rows instead of scanning everything else first.
 */
const deltaPlan = (rule: CompiledRule, position: number) => {
  let plans = deltaPlans.get(rule);
  if (plans === undefined) {
    plans = new Map();
    deltaPlans.set(rule, plans);
  }
  return getOrCreate(plans, position, () => {
    const first = rule.body[position];
    if (!(first instanceof Atom && first.plain)) {
      return rule.body;
    }
    const rest = compilable(() =>
      planLiterals(
        rule.body.filter((_, at) => at !== position),
        first.variables
      )
    );
    return rest === undefined ? rule.body : [first, ...rest];
  });
};

/**
 * Re-runs a rule once per body goal that matches rows new in the last round,
 * so every answer it returns uses at least one new row.
 */
const changedAnswers = (
  model: Model,
  rule: CompiledRule,
  delta: ReadonlyMap<string, TupleSet>
) =>
  Effect.gen(function* () {
    const out: Vars[] = [];
    for (const [position, literal] of rule.body.entries()) {
      const changes =
        literal instanceof Atom ? delta.get(literal.relation.name) : undefined;
      if (changes === undefined || changes.size === 0) {
        continue;
      }
      const body = deltaPlan(rule, position);
      const changedAt = body.indexOf(literal);
      const answers = yield* matches(model, body, NO_VARS, (at) =>
        at === changedAt ? changes : undefined
      );
      for (const vars of answers) {
        out.push(vars);
      }
    }
    return out;
  });

/** The kind of the aggregate at a head position, such as `"sum"`. */
export const aggregateKind = (rule: CompiledRule, position: number) =>
  (rule.head.args[position] as DeferredCall).aggregate as string;

/** The matches of an aggregate rule that share their other head values. */
interface Group {
  /** Head values, with null where the head aggregates. */
  readonly key: Tuple;
  /** Each match, or the one a selecting aggregate kept. */
  matches: Match[];
  readonly rule: CompiledRule;
  /** The row the group gave when it was last combined. */
  tuple?: Tuple;
  /**
   * For each aggregate, the values to combine: one from each match, or for
   * a lattice aggregate, its result so far and the values that came since.
   */
  readonly values: unknown[][];
}

/** The head values of one match, and the value it gives each aggregate. */
const matchValues = (model: Model, rule: CompiledRule, vars: Vars) =>
  Effect.gen(function* () {
    const key: unknown[] = [];
    const values: unknown[] = [];
    for (const [position, arg] of rule.head.args.entries()) {
      if (rule.aggregates.includes(position)) {
        const [value] = (arg as DeferredCall).args;
        key.push(null);
        values.push(yield* term(model, value, vars));
      } else {
        key.push(yield* term(model, arg, vars));
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
        group.matches = group.matches.slice(winner, winner + 1);
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
  model: Model,
  groups: Groups,
  rule: CompiledRule,
  answers: readonly Vars[]
) =>
  Effect.gen(function* () {
    const seen = getOrCreate(groups.seen, rule.source, () => new Set<string>());
    for (const vars of answers) {
      const id = answerKey(vars);
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      const { key, values } = yield* matchValues(model, rule, vars);
      const group = getOrCreate(
        groups.byKey,
        `${rule.head.relation.name}\u0000${valueKey(key)}`,
        (): Group => ({
          key,
          rule,
          matches: [],
          values: rule.aggregates.map(() => []),
        })
      );
      for (const [index, value] of values.entries()) {
        group.values[index]?.push(value);
      }
      group.matches.push({ rule, vars });
      groups.changed.add(group);
    }
  });

/** Combines the groups that changed, and returns the rows that are new. */
const settle = (model: Model, groups: Groups) =>
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
        group.matches[0] !== undefined && selectsAlone(rule)
          ? group.matches[0]
          : { rule, matches: [...group.matches] }
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
    for (const rule of rules) {
      yield* addMatches(model, groups, rule, yield* matches(model, rule.body));
    }
    let delta = yield* settle(model, groups);
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
        const answers = yield* changedAnswers(model, rule, delta);
        yield* addMatches(model, groups, rule, answers);
      }
      delta = yield* settle(model, groups);
    }
  });

/** Runs the rules of relations that depend on each other until none adds a row. */
const evaluate = (model: Model, rules: readonly CompiledRule[]) =>
  Effect.gen(function* () {
    if (rules.some((rule) => rule.aggregates.length > 0)) {
      return yield* evaluateAggregates(model, rules);
    }
    let delta = new Map<string, TupleSet>();
    for (const rule of rules) {
      const answers = yield* matches(model, rule.body);
      yield* deriveHeads(model, rule, answers, delta);
    }
    while (hasChanges(delta)) {
      const next = new Map<string, TupleSet>();
      for (const rule of rules) {
        const answers = yield* changedAnswers(model, rule, delta);
        yield* deriveHeads(model, rule, answers, next);
      }
      delta = next;
    }
  });

/**
 * Makes a computed relation's rows available. Its algorithm runs over its
 * complete input relations the first time a goal asks for some input values.
 */
const compute = (model: Model, relation: RelationInfo): LogicEffect<void> =>
  Effect.gen(function* () {
    const { columns, computed, name } = relation;
    if (computed === undefined || model.relations.has(name)) {
      return;
    }
    for (const dependency of computed.dependencies) {
      if (!model.facts.has(dependency)) {
        return yield* logicError(
          `Relation "${dependency}" is not declared here.`
        );
      }
      yield* complete(model, dependency);
    }
    const tuples = new TupleSet();
    const asked = new Map<string, string | undefined>();
    const rows = (inputs: Tuple) => {
      const found = computed.compute(
        (input) => [...rowsOf(model, input).values()],
        inputs
      );
      if (typeof found === "string") {
        return found;
      }
      const width = columns.length - inputs.length;
      for (const row of found) {
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
        asked.set(key, rows(inputs));
      }
      return asked.get(key);
    };
    model.relations.set(name, tuples);
  });

/** Forgets what was derived for relations whose rules failed part way. */
const forget = (model: Model, members: ReadonlySet<string>) => {
  for (const name of members) {
    model.state.delete(name);
    model.relations.delete(name);
    model.derivations.delete(name);
  }
};

/**
 * Derives the rows of relations that depend on each other: first every
 * relation their rules read, then their own rules, on top of their facts.
 */
const derive = (model: Model, { members, rules }: Stratum) =>
  Effect.gen(function* () {
    for (const name of members) {
      model.state.set(name, "running");
    }
    for (const { body, head } of rules) {
      for (const relation of reads(body, head.args)) {
        if (!members.has(relation.name)) {
          yield* ensure(model, relation);
        }
      }
    }
    for (const name of members) {
      const facts =
        model.base === undefined ? model.facts.get(name) : undefined;
      model.relations.set(name, facts?.clone() ?? new TupleSet());
    }
    yield* evaluate(model, rules);
    for (const name of members) {
      model.state.set(name, "done");
    }
  }).pipe(Effect.onError(() => Effect.sync(() => forget(model, members))));

/** Makes the rows of a declared relation complete. */
const complete = (model: Model, name: string): LogicEffect<void> =>
  Effect.suspend(() => {
    const stratum = strataOf(model.rules).get(name);
    if (stratum === undefined) {
      return model.base === undefined
        ? Effect.void
        : complete(model.base, name);
    }
    const state = model.state.get(name);
    if (state === "running") {
      return logicError(
        `"${originalName(name)}" was asked about while its own rows were being derived. A question cannot go through recursion.`
      );
    }
    return state === "done" ? Effect.void : derive(model, stratum);
  });

/**
 * Makes a relation's rows complete: derives the relations its rules read,
 * then runs its rules, unless that is already done.
 */
export const ensure = (
  model: Model,
  relation: RelationInfo
): LogicEffect<void> =>
  relation.computed === undefined
    ? complete(model, relation.name)
    : compute(model.base ?? model, relation);

/**
 * Answers a question that comes up while the model is read, such as one a
 * waiting `cond` asks when it runs: whether a goal has a match, or what a
 * find finds.
 */
export const answer = (model: Model, question: unknown): LogicEffect<unknown> =>
  Effect.gen(function* () {
    const home = model.base ?? model;
    for (const relation of mentioned(question)) {
      yield* ensure(home, relation);
    }
    return yield* term(home, question, NO_VARS);
  });

/**
 * What a rule's body rested on for one answer: the rows its relation goals
 * matched, each explained in turn, and the tests that held.
 */
const premises = (
  model: Model,
  { rule, vars }: Match
): LogicEffect<unknown[]> =>
  Effect.gen(function* () {
    const out: unknown[] = [];
    for (const literal of rule.body) {
      if (literal instanceof Atom) {
        const tuple = yield* tupleOf(model, literal.args, vars);
        out.push(yield* explain(model, literal.relation, tuple));
      } else if (isForm(literal, "not")) {
        out.push({ absent: instantiate(literal.parts[0], vars) });
      } else if (!isForm(literal, "=", "in")) {
        out.push({ check: instantiate(literal, vars) });
      }
    }
    return out;
  });

/** Explains a row that holds: a fact, a computed row, or what derived it. */
export const explain = (
  model: Model,
  { computed, name }: RelationInfo,
  tuple: Tuple
): LogicEffect<unknown> =>
  Effect.gen(function* () {
    if (computed !== undefined) {
      return { fact: computed.form(tuple), computed: true };
    }
    const fact = [name, ...tuple];
    const derivation = model.derivations.get(name)?.get(valueKey(tuple));
    if (derivation === undefined) {
      return { fact, given: true };
    }
    const rule = derivation.rule.source;
    if ("vars" in derivation) {
      return { fact, rule, because: yield* premises(model, derivation) };
    }
    const matches = yield* Effect.forEach(derivation.matches, (match) =>
      premises(model, match)
    );
    return { fact, rule, matches };
  });

export { distinct, EMPTY, NO_VARS };

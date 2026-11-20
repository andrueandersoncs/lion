/**
 * The engine: the rows a set of rules derives from the facts, and the
 * answers to goals over those rows.
 *
 * A model derives a relation's rows the first time something reads the
 * relation, after the rows of every relation its rules read, and keeps them.
 * Rules run bottom-up, one group of relations that depend on each other at
 * a time: `weights.ts` counts each answer as a candidate of the row it
 * gives, and settles the levels rows are held from, lowest first.
 *
 * A goal is answered in two ways. As a goal of a body, a relation call
 * matches rows and binds variables. Anywhere else it is a question: under
 * `not`, in a find, or as a value, it is asked for an answer whose variables
 * are fixed, and every other variable in it is the question's own.
 */
import { Effect, Result } from "effect";
import { ArithmeticError, LogicError, logicError } from "@/errors/evaluation";
import { aggregator } from "@/logic/aggregates";
import {
  type CompiledRule,
  compilable,
  compiling,
  headsOf,
  type Literal,
  planLiterals,
  questionPlans,
  Solved,
} from "@/logic/compile";
import { matching } from "@/logic/fit";
import { candidatesOf, unlisted } from "@/logic/listing";
import { factsOf, originalName } from "@/logic/magic";
import {
  type Constraint,
  enumerate,
  add as plusRational,
  type Rational,
  type Sort,
  solve as solveConstraints,
  multiply as timesRational,
} from "@/logic/solver";
import { mentioned, type Stratum, strataOf } from "@/logic/strata";
import {
  formulaOf,
  members,
  type Context as SymbolicContext,
  shapeFor,
  term as symbolicTerm,
} from "@/logic/symbolic";
import {
  and,
  type Cases,
  concrete as concreteOf,
  FALSE,
  type Formula,
  leavesOf,
  MOST_WAYS,
  or,
  product,
  type Sym,
  TRUE,
} from "@/logic/symbols";
import {
  Atom,
  callsOf,
  compareValues,
  DeferredCall,
  type Goal,
  instantiate,
  invoke,
  isData,
  isForm,
  isGroundValue,
  isPlainObject,
  isQuestion,
  isRelational,
  type LionFunction,
  LogicForm,
  LogicValue,
  LogicVariable,
  patternParts,
  type RelationInfo,
  replaceVariables,
  sameValue,
  show,
  termVariables,
  Unknown,
  valueKey,
} from "@/logic/terms";
import { deriveRows, type Support } from "@/logic/weights";
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
 * One change to a set of tuples: the set, the tuple, its place, and whether
 * it was added or removed. `undo` takes it back.
 */
export type Change = readonly [
  set: TupleSet,
  tuple: Tuple,
  slot: number,
  added: boolean,
];

/** What a relation goal reads: the rows that hold some values at some places. */
export interface Rows {
  demand?: ((inputs: Tuple) => string | undefined) | undefined;
  lookup(
    positions: readonly number[],
    values: readonly unknown[]
  ): Iterable<Tuple>;
}

/**
 * What the relation goals of a body read while a change is followed: the
 * rows the goal at a position reads instead of its relation's, and what
 * becomes of an answer once a goal matched a row, which may drop it.
 */
export interface Reader {
  readonly meet?: (
    position: number,
    tuple: Tuple,
    vars: Vars,
    fresh: boolean
  ) => Vars | undefined;
  readonly rows?: (position: number) => Rows | undefined;
}

/** A set is tidied once it has this many gaps, and more gaps than tuples. */
const MOST_GAPS = 64;

/**
 * A set of tuples with hash indexes built on demand per bound-column set.
 * Adding a tuple updates the existing indexes, so a relation that grows one
 * round at a time never rebuilds them.
 *
 * The tuples are kept in the order they were added, and a tuple that is
 * removed leaves a gap where it was. So a change can be taken back by going
 * through it backwards: a tuple that was added is the last one, and a tuple
 * that was removed goes back where it was. Undoing a change costs what the
 * change cost, however large the set is.
 */
export class TupleSet {
  /** The tuples in the order they were added, with gaps. */
  private rows: (Tuple | undefined)[] = [];
  /** The key of the tuple at each place, which a gap keeps. */
  private keys: string[] = [];
  /** The place of each tuple, by its key. */
  private readonly slots = new Map<string, number>();
  /**
   * How many candidates give the tuple at each place, for a set that counts
   * them. Left out while every tuple has one.
   */
  private weights: number[] | undefined;
  private readonly indexes = new Map<string, Index>();
  /**
   * Set for a computed relation: adds the rows for some input values the
   * first time a goal asks for them, or returns why it cannot.
   */
  demand: ((inputs: Tuple) => string | undefined) | undefined;

  /** The tuples a test keeps, by the test's name, until the set changes. */
  private kept: Map<string, readonly Tuple[]> | undefined;

  get size(): number {
    return this.slots.size;
  }

  /**
   * The tuples a test keeps, worked out once and kept under the test's
   * name until the set changes.
   */
  keeping(name: string, test: (tuple: Tuple) => boolean): readonly Tuple[] {
    this.kept ??= new Map();
    let found = this.kept.get(name);
    if (found === undefined) {
      found = [...this.values()].filter(test);
      this.kept.set(name, found);
    }
    return found;
  }

  /** The tuples in the order they were added, also ones added meanwhile. */
  *values(): IterableIterator<Tuple> {
    for (const tuple of this.rows) {
      if (tuple !== undefined) {
        yield tuple;
      }
    }
  }

  has(tuple: Tuple): boolean {
    return this.slots.has(valueKey(tuple));
  }

  /** True when the set has the tuple with this key. */
  hasKey(key: string): boolean {
    return this.slots.has(key);
  }

  /** The tuple the set holds under a key. */
  get(key: string): Tuple | undefined {
    const slot = this.slots.get(key);
    return slot === undefined ? undefined : this.rows[slot];
  }

  /** How many candidates give the tuple under a key: none when it is not held. */
  weightOf(key: string): number {
    const slot = this.slots.get(key);
    return slot === undefined ? 0 : (this.weights?.[slot] ?? 1);
  }

  /**
   * Gives a tuple candidates, or takes some away, in a set that counts
   * them: a tuple is held while it has one. Returns 1 when the tuple joined
   * the set, -1 when it left, and 0 when it stayed as it was.
   */
  weigh(key: string, tuple: Tuple, by: number): number {
    const slot = this.slots.get(key);
    if (slot === undefined) {
      if (by <= 0) {
        return 0;
      }
      this.addKeyed(key, tuple);
      if (by !== 1) {
        this.counted()[this.rows.length - 1] = by;
      }
      return 1;
    }
    const weights = this.counted();
    const next = (weights[slot] ?? 1) + by;
    if (next > 0) {
      weights[slot] = next;
      return 0;
    }
    this.deleteKeyed(key);
    return -1;
  }

  /** The weights, one for each place, made when first needed. */
  private counted() {
    this.weights ??= this.rows.map(() => 1);
    return this.weights;
  }

  /** Each tuple with its key, in the order they were added. */
  *keyed(): IterableIterator<readonly [string, Tuple]> {
    for (const [slot, tuple] of this.rows.entries()) {
      if (tuple !== undefined) {
        yield [this.keys[slot] as string, tuple];
      }
    }
  }

  /** The tuple the set holds that equals a tuple, which may be another object. */
  stored(tuple: Tuple): Tuple | undefined {
    const slot = this.slots.get(valueKey(tuple));
    return slot === undefined ? undefined : this.rows[slot];
  }

  /** Adds a tuple, unless the set has it. `log` gets what `undo` needs. */
  add(tuple: Tuple, log?: Change[]): boolean {
    return this.addKeyed(valueKey(tuple), tuple, log);
  }

  /** Adds a tuple whose key is already worked out. */
  addKeyed(key: string, tuple: Tuple, log?: Change[]): boolean {
    if (this.slots.has(key)) {
      return false;
    }
    const slot = this.rows.length;
    this.kept = undefined;
    this.slots.set(key, slot);
    this.rows.push(tuple);
    this.keys.push(key);
    this.weights?.push(1);
    for (const { buckets, positions } of this.indexes.values()) {
      getOrCreate(buckets, bucketKey(positions, tuple), () => []).push(tuple);
    }
    log?.push([this, tuple, slot, true]);
    return true;
  }

  /** Removes a tuple the set has. `log` gets what `undo` needs. */
  delete(tuple: Tuple, log?: Change[]): boolean {
    return this.deleteKeyed(valueKey(tuple), log);
  }

  /** Removes the tuple under a key. */
  deleteKeyed(key: string, log?: Change[]): boolean {
    const slot = this.slots.get(key);
    const stored = slot === undefined ? undefined : this.rows[slot];
    if (slot === undefined || stored === undefined) {
      return false;
    }
    this.kept = undefined;
    this.slots.delete(this.keys[slot] as string);
    this.rows[slot] = undefined;
    for (const { buckets, positions } of this.indexes.values()) {
      const bucket = bucketKey(positions, stored);
      const remaining = buckets.get(bucket)?.filter((item) => item !== stored);
      if (remaining === undefined || remaining.length === 0) {
        buckets.delete(bucket);
      } else {
        buckets.set(bucket, remaining);
      }
    }
    log?.push([this, stored, slot, false]);
    return true;
  }

  /**
   * Takes back one change. Changes are taken back last first, so a tuple
   * that was added is the last one, and the place of one that was removed
   * is still a gap.
   */
  revert(tuple: Tuple, slot: number, added: boolean) {
    this.kept = undefined;
    if (added) {
      this.rows.pop();
      this.slots.delete(this.keys.pop() as string);
      for (const { buckets, positions } of this.indexes.values()) {
        const bucket = bucketKey(positions, tuple);
        const rest = buckets.get(bucket);
        rest?.pop();
        if (rest?.length === 0) {
          buckets.delete(bucket);
        }
      }
      return;
    }
    this.rows[slot] = tuple;
    this.slots.set(this.keys[slot] as string, slot);
    for (const { buckets, positions } of this.indexes.values()) {
      const bucket = getOrCreate(
        buckets,
        bucketKey(positions, tuple),
        () => []
      );
      bucket.splice(this.placeIn(bucket, slot), 0, tuple);
    }
  }

  /** Where a tuple at `slot` belongs in a bucket, which is in slot order. */
  private placeIn(bucket: readonly Tuple[], slot: number) {
    let low = 0;
    let high = bucket.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const at = this.slots.get(valueKey(bucket[middle] as Tuple)) ?? 0;
      if (at < slot) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return low;
  }

  /**
   * Closes the gaps removed tuples left, once there are many. Only between
   * changes: a change that may be undone names tuples by their places.
   */
  tidy() {
    const gaps = this.rows.length - this.slots.size;
    if (gaps < MOST_GAPS || gaps < this.slots.size) {
      return;
    }
    const { keys, rows, weights } = this;
    this.rows = [];
    this.keys = [];
    this.weights = weights === undefined ? undefined : [];
    for (const [slot, tuple] of rows.entries()) {
      if (tuple !== undefined) {
        this.slots.set(keys[slot] as string, this.rows.length);
        this.rows.push(tuple);
        this.keys.push(keys[slot] as string);
        this.weights?.push(weights?.[slot] ?? 1);
      }
    }
  }

  /** A set with the same tuples, in the same order. */
  clone(): TupleSet {
    const copy = new TupleSet();
    for (const [slot, tuple] of this.rows.entries()) {
      if (tuple !== undefined) {
        const key = this.keys[slot] as string;
        copy.slots.set(key, copy.rows.length);
        copy.rows.push(tuple);
        copy.keys.push(key);
      }
    }
    return copy;
  }

  lookup(positions: readonly number[], values: readonly unknown[]) {
    if (positions.length === 0) {
      return this.values();
    }
    const indexKey = positions.join(",");
    let index = this.indexes.get(indexKey);
    if (index === undefined) {
      index = { buckets: new Map(), positions };
      for (const tuple of this.values()) {
        getOrCreate(index.buckets, bucketKey(positions, tuple), () => []).push(
          tuple
        );
      }
      this.indexes.set(indexKey, index);
    }
    return index.buckets.get(valueKey(values)) ?? [];
  }
}

/** Takes back the changes of a log, last first. */
export const undo = (log: readonly Change[]) => {
  for (let at = log.length - 1; at >= 0; at -= 1) {
    const [set, tuple, slot, added] = log[at] as Change;
    set.revert(tuple, slot, added);
  }
};

const EMPTY = new TupleSet();

const NO_VARS: Vars = new Map();

/**
 * How a rule derived a row, for `why`: the answer of its body that gave the
 * row, or for an aggregated row, the answers it combines.
 */
export type Derivation =
  | Match
  | { readonly rule: CompiledRule; readonly matches: readonly Match[] };

/** An answer of a rule's body. */
export interface Match {
  readonly rule: CompiledRule;
  /**
   * For a row a rule that invents gives only once a key or an equality
   * rule made its unknowns equal to other values: each such unknown, and
   * the value it equals.
   */
  readonly same?: readonly (readonly [Unknown, unknown])[];
  readonly vars: Vars;
}

/**
 * The rows that rules derive on top of facts, or for a goal-directed query,
 * on top of another model.
 */
export class Model {
  /** The rows of each relation derived so far, by relation name. */
  readonly relations = new Map<string, TupleSet>();
  /**
   * How the rows of a group that made values one came about, by relation
   * name and row, once `why` asked, until the group changes.
   */
  readonly told = new Map<string, Map<string, Match>>();
  /**
   * The candidates that give each row of a group, by the name of each of
   * the group's relations, for the groups that keep them.
   */
  readonly support = new Map<string, Support>();
  /** Relations whose rows are being derived, or are complete. */
  readonly state = new Map<string, "running" | "done">();
  readonly facts: ReadonlyMap<string, TupleSet>;
  readonly rules: readonly CompiledRule[];
  /** The model that holds every relation these rules do not derive. */
  readonly base: Model | undefined;
  /** The group of each relation these rules derive, by relation name. */
  readonly strata: ReadonlyMap<string, Stratum>;
  /** The relations each computed relation here was computed from. */
  readonly computed = new Map<string, readonly string[]>();
  /** The derived relations something has read since facts last changed. */
  readonly read = new Set<string>();
  /**
   * What the last change to facts did with each derived relation it
   * touched: its rows were followed through the change, derived again and
   * compared, or forgotten until something reads them.
   */
  readonly last = new Map<string, "followed" | "derived" | "forgotten">();
  /**
   * The unknowns the facts hold, by key, once something asked: a fact that
   * holds one says it is given. Forgotten when such a fact comes or goes.
   */
  given: Set<string> | undefined;
  /**
   * While a change is followed, the rows a relation held before the change,
   * for the relations that are not yet to be read as they now are.
   */
  view: ((name: string) => Rows | undefined) | undefined;
  /**
   * Asks a question of the database as it would be after some changes: the
   * `fact`, `retract`, and `rule` forms of an `assuming`, with their values,
   * and its expression. The database that keeps this model sets it.
   */
  assume?: (
    changes: readonly LogicForm[],
    expression: unknown
  ) => LogicEffect<unknown>;

  constructor(
    facts: ReadonlyMap<string, TupleSet>,
    rules: readonly CompiledRule[],
    base?: Model
  ) {
    this.facts = facts;
    this.rules = rules;
    this.base = base;
    this.strata = strataOf(rules);
  }
}

/** The variables a rule's body binds, in the order it binds them. */
const BOUND = new WeakMap<CompiledRule, readonly string[]>();

const boundBy = (rule: CompiledRule) => {
  let names = BOUND.get(rule);
  if (names === undefined) {
    names = [...new Set(rule.body.flatMap(termVariables))];
    BOUND.set(rule, names);
  }
  return names;
};

/**
 * The order of a rule's answers: by the values its body binds, in the order
 * it binds them, compared as the `"order"` option compares values. Of the
 * answers that give a row first, the least explains it, so how a row came
 * about does not depend on the order the facts were added in.
 */
export const compareAnswers = (rule: CompiledRule, a: Vars, b: Vars) => {
  for (const name of boundBy(rule)) {
    const order = compareValues(a.get(name), b.get(name));
    if (order !== 0) {
      return order;
    }
  }
  return 0;
};

/** The order of answers of several rules: by rule, then by answer. */
export const compareMatches =
  (rules: readonly CompiledRule[]) => (a: Match, b: Match) =>
    a.rule === b.rule
      ? compareAnswers(a.rule, a.vars, b.vars)
      : rules.indexOf(a.rule) - rules.indexOf(b.rule);

/**
 * A relation's rows as far as they are derived: every row once `ensure` has
 * run, and until then its facts.
 */
export const rowsOf = (model: Model, relation: string): TupleSet =>
  model.relations.get(relation) ??
  (model.base === undefined
    ? model.facts.get(factsOf(relation) ?? relation)
    : rowsOf(model.base, relation)) ??
  EMPTY;

/** What a goal reads of a relation: its rows, or the rows a view gives. */
const seen = (model: Model, name: string): Rows =>
  (model.view ?? model.base?.view)?.(name) ?? rowsOf(model, name);

/**
 * The facts a relation starts from when its rules derive it: none for a
 * relation that merges, whose facts are candidates its rule reads.
 */
export const startingFacts = (
  model: Model,
  relation: RelationInfo | string
) => {
  const name = typeof relation === "string" ? relation : relation.name;
  const merges = model.rules.some(
    (rule) => rule.given && rule.head.relation.name === name
  );
  return model.base === undefined && !merges
    ? model.facts.get(name)
    : undefined;
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

/**
 * The values of some terms for an answer when none has to be computed, as
 * in most rule heads: each is data or a variable. Undefined otherwise.
 */
export const plainTuple = (terms: readonly unknown[], vars: Vars) => {
  const tuple: unknown[] = [];
  for (const item of terms) {
    if (item instanceof LogicVariable) {
      tuple.push(vars.has(item.name) ? vars.get(item.name) : item);
    } else if (item instanceof LogicValue) {
      return;
    } else {
      tuple.push(item);
    }
  }
  return tuple;
};

/** The values of some terms for an answer. */
export const tupleOf = (
  model: Model,
  terms: readonly unknown[],
  vars: Vars
): LogicEffect<unknown[]> => {
  const plain = plainTuple(terms, vars);
  return plain === undefined
    ? Effect.forEach(terms, (item) => term(model, item, vars))
    : Effect.succeed(plain);
};

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
  if (isForm(value, "some")) {
    return unknownOf(model, value, vars);
  }
  if (isForm(value, "assuming")) {
    return assumed(model, value, vars);
  }
  return isForm(value, "find")
    ? findAll(model, value, vars)
    : holds(model, value as Goal, vars);
};

/**
 * What an `assuming` gives for an answer: its changes with the values of
 * the arguments of the facts they state, asked of the database as it would
 * be after them, with the variables the answer bound in place in its
 * expression and in the rules and invariants it holds. Every other variable
 * of those is their own.
 */
const assumed = (
  model: Model,
  question: LogicForm,
  vars: Vars
): LogicEffect<unknown> =>
  Effect.gen(function* () {
    const home = model.base ?? model;
    if (home.assume === undefined) {
      return yield* logicError(
        `${show(instantiate(question, vars))} needs a database to ask: assuming asks the database as it would be after its changes.`
      );
    }
    const bound = (term: unknown) =>
      replaceVariables(term, (variable) =>
        vars.has(variable.name) ? vars.get(variable.name) : undefined
      );
    // A fact holds values; a rule or invariant holds goals.
    const valued = (part: unknown) =>
      part instanceof Atom
        ? Effect.map(
            Effect.forEach(part.args, (arg) => term(model, arg, vars)),
            (args) => new Atom(part.relation, args)
          )
        : Effect.succeed(bound(part));
    const changes = yield* Effect.forEach(
      question.parts.slice(0, -1) as LogicForm[],
      (change) =>
        change.form === "rule"
          ? Effect.succeed(bound(change) as LogicForm)
          : Effect.map(
              Effect.forEach(change.parts, valued),
              (parts) => new LogicForm(change.form, parts)
            )
    );
    return yield* home.assume(changes, bound(question.parts.at(-1)));
  });

/**
 * The variables that stand in what `some` describes: as an argument of a
 * relation call, or inside a record or list there.
 */
const standing = (goal: unknown): readonly string[] =>
  (callsOf(goal) ?? []).flatMap((call) => call.args.flatMap(held));

const held = (term: unknown): readonly string[] =>
  term instanceof LogicVariable
    ? [term.name]
    : (patternParts(term, false)?.flatMap(held) ?? []);

/**
 * What `some` describes, with the values an answer gives the variables it
 * does not own. A record or list that holds one of its own variables stays
 * a pattern, and any other argument is a value: it is computed, and a
 * question in it is asked.
 */
const described = (
  model: Model,
  goal: unknown,
  vars: Vars,
  variable: string
): LogicEffect<unknown> => {
  const own = new Set([
    variable,
    ...standing(goal).filter((name) => !vars.has(name)),
  ]);
  const value = (arg: unknown): LogicEffect<unknown> => {
    if (arg instanceof LogicVariable || !(arg instanceof LogicValue)) {
      return term(model, arg, vars);
    }
    if (held(arg).some((name) => own.has(name))) {
      const parts = patternParts(arg, false) ?? [];
      return Effect.map(
        Effect.forEach(parts, value),
        (args) =>
          new DeferredCall(
            (arg as DeferredCall).fn,
            (arg as DeferredCall).callee,
            args
          )
      );
    }
    return arg.variables.some((name) => own.has(name))
      ? logicError(
          `${show(arg)} computes with a variable that "some" owns. An unknown is described by relation calls whose arguments are values, its variables, or records and lists of those.`
        )
      : term(model, arg, vars);
  };
  const calls = callsOf(goal) ?? [];
  return Effect.map(
    Effect.forEach(calls, (call) =>
      Effect.map(
        Effect.forEach(call.args, value),
        (args) => new Atom(call.relation, args)
      )
    ),
    (done) => (done.length === 1 ? done[0] : new LogicForm("and", done))
  );
};

/** A model with no rows, for terms that ask no question. */
const NOTHING_DERIVED = new Model(new Map(), []);

/**
 * The value of a term in plain code, once every question in it is asked:
 * what `some` names, and the rows `exists` says hold, which read nothing.
 */
export const plainValue = (item: unknown) =>
  term(NOTHING_DERIVED, item, NO_VARS);

/**
 * The unknown a `some` form names, for an answer. Its variable is always its
 * own, and so is every other variable the answer does not bind.
 */
const unknownOf = (model: Model, form: LogicForm, vars: Vars) =>
  Effect.gen(function* () {
    const [variable, goal] = form.parts as [LogicVariable, unknown];
    const answered = new Map(vars);
    answered.delete(variable.name);
    return new Unknown(
      variable.name,
      yield* described(model, goal, answered, variable.name)
    );
  });

/**
 * True when a term still has a variable to bind for an answer: a variable
 * with no value, or a pattern that holds one.
 */
export const hasFree = (
  value: unknown,
  vars: Vars,
  asSchema = false
): boolean =>
  value instanceof LogicVariable
    ? !vars.has(value.name)
    : (patternParts(value, asSchema)?.some((part) =>
        hasFree(part, vars, asSchema)
      ) ?? false);

/**
 * The answers under which a value matches a pattern: each is the answer
 * with the variables the match bound. `equal` asks for the same value, as
 * "=" does, and otherwise the pattern is a schema.
 */
export const match = (
  model: Model,
  pattern: unknown,
  value: unknown,
  vars: Vars,
  equal: boolean
): LogicEffect<readonly Vars[]> => {
  // The pattern most goals have: one variable, which takes the value.
  if (
    pattern instanceof LogicVariable &&
    !(pattern.anonymous || vars.has(pattern.name))
  ) {
    return Effect.succeed([new Map(vars).set(pattern.name, value)]);
  }
  return matching(pattern, value, vars, {
    equal,
    term: (part, answered) =>
      term(model, part, answered) as unknown as Effect.Effect<unknown, Error>,
  }) as LogicEffect<readonly Vars[]>;
};

/**
 * The rows a relation call can match for an answer, and the variables each
 * row would bind. An argument is a schema for its column. One that is data
 * fits the rows equal to it, which an index finds. Any other is a pattern
 * for the rows found to be matched against: one with a variable to bind, or
 * one that holds a function. `values` holds the arguments' values when they
 * had to be computed. A string says why a computed relation has no rows to
 * give.
 */
const candidates = (
  atom: Atom,
  vars: Vars,
  tuples: Rows,
  values?: readonly unknown[]
) => {
  const positions: number[] = [];
  const known: unknown[] = [];
  const free: [number, string][] = [];
  const patterns: [number, unknown][] = [];
  const { computed } = atom.relation;
  const inputs = computed?.inputs ?? 0;
  for (const [position, arg] of atom.args.entries()) {
    const isVariable = arg instanceof LogicVariable;
    if (isVariable && !vars.has(arg.name)) {
      free.push([position, arg.name]);
      continue;
    }
    const computedValue = values === undefined ? arg : values[position];
    const value = isVariable ? vars.get(arg.name) : computedValue;
    if (isData(value)) {
      positions.push(position);
      known.push(value);
    } else if (position < inputs) {
      // An input is a value the computation is given, not a schema for one.
      return `${computed?.callee} expects a value for "${atom.relation.columns[position]}", but found ${show(value)}.`;
    } else {
      patterns.push([position, value]);
    }
  }
  return (
    tuples.demand?.(known.slice(0, inputs)) ?? {
      free,
      patterns,
      tuples: tuples.lookup(positions, known),
    }
  );
};

/**
 * The rows a relation call can match, once its arguments are computed. An
 * argument that still has a variable to bind is a pattern, and is left for
 * the rows to be matched against.
 */
export const lookup = (model: Model, atom: Atom, vars: Vars, tuples: Rows) =>
  Effect.gen(function* () {
    const values: unknown[] = [];
    for (const arg of atom.args) {
      values.push(
        hasFree(arg, vars, true) ? arg : yield* term(model, arg, vars)
      );
    }
    const found = candidates(atom, vars, tuples, values);
    return typeof found === "string" ? yield* logicError(found) : found;
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
export const answerKey = (vars: Vars) =>
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

/** The value of a find's template for each match, in the order given. */
export const found = (
  model: Model,
  find: LogicForm,
  matched: readonly Vars[],
  vars: Vars = NO_VARS
) =>
  Effect.gen(function* () {
    const [template] = find.parts;
    const values: unknown[] = [];
    for (const match of matched) {
      const value = yield* term(model, template, match);
      if (!isGroundValue(value)) {
        return yield* logicError(
          `${show(instantiate(find, vars))} found a value that is not data: ${show(value)}.`
        );
      }
      values.push(value);
    }
    return values;
  });

/** What a find finds for an answer, as a sorted list. */
const findAll = (model: Model, find: LogicForm, vars: Vars) =>
  Effect.flatMap(solve(model, find, vars), (matched) =>
    Effect.map(found(model, find, matched, vars), (values) =>
      values.sort(compareValues)
    )
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
const matchesAny = (
  model: Model,
  atom: Atom,
  vars: Vars
): LogicEffect<boolean> => {
  if (!atom.plain || atom.relation.computed !== undefined) {
    return Effect.map(solve(model, atom, vars), (found) => found.length > 0);
  }
  const pending = toRead(model, atom.relation);
  if (pending !== undefined) {
    return Effect.flatMap(pending, () => matchesAny(model, atom, vars));
  }
  // Nothing to compute: look the rows up directly.
  const found = candidates(atom, vars, seen(model, atom.relation.name));
  if (typeof found === "string") {
    return logicError(found);
  }
  if (found.patterns.length > 0) {
    return Effect.map(
      solve(model, atom, vars),
      (matched) => matched.length > 0
    );
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
    case "exists":
      return Effect.map(
        solve(model, goal as LogicForm, vars),
        (found) => found.length > 0
      );
    case "assuming":
      return Effect.flatMap(assumed(model, goal as LogicForm, vars), (value) =>
        typeof value === "boolean"
          ? Effect.succeed(value)
          : logicError(
              `As a goal, ${show(instantiate(goal, vars))} must be true or false, but its expression gives ${show(value)}. Use it as a value, as in ["=", "?found", ["assuming", ...]].`
            )
      );
    case "=":
    case "in":
    case "schema/fits?":
      // With a variable left to bind, the goal holds when it has an answer.
      return Effect.flatMap(
        bound(model, goal as LogicForm, vars),
        (found): LogicEffect<boolean> => {
          if (found !== undefined) {
            return Effect.succeed(found.length > 0);
          }
          return (goal as LogicForm).form === "="
            ? Effect.zipWith(
                term(model, first, vars),
                term(model, second, vars),
                sameValue
              )
            : Effect.zipWith(
                listOf(model, second, vars),
                term(model, first, vars),
                (items, element) => itemKeys(items).has(valueKey(element))
              );
        }
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

/**
 * The answers of a schema check whose value nothing has bound: the schema
 * stands for each value it allows, and each one that fits gives the
 * variables of the value theirs.
 */
const listed = (model: Model, value: unknown, schema: unknown, vars: Vars) =>
  Effect.gen(function* () {
    const known = yield* term(model, schema, vars);
    const values = yield* Effect.try({
      try: () => candidatesOf(known),
      catch: (error) =>
        error instanceof LogicError
          ? error
          : new LogicError({ message: String(error) }),
    });
    const out: Vars[] = [];
    for (const each of values) {
      for (const fit of yield* match(model, schema, each, vars, false)) {
        out.push(...(yield* match(model, value, each, fit, true)));
      }
    }
    return out;
  });

/** The name of the variable a solver's variable stands in, by where it stands. */
const LEAF_PARTS = /[.#/]/;

/** The length a name of a list's shape ends with. */
const LENGTH_MARK = /#\d+$/;

const symbolOf = (leaf: string) => leaf.split(LEAF_PARTS)[0] as string;

/** A goal the solver cannot decide, which waits for values, and why. */
interface Waiting {
  readonly goal: Literal;
  readonly why: string;
}

/**
 * What a solver step works out for one combination of shapes of the
 * variables it types: what each variable it reasons about stands for, the
 * formula of the goals it decides, and the goals it cannot, in order, which
 * run once it gives their variables values.
 */
interface Choice {
  readonly formula: Formula;
  readonly symbols: ReadonlyMap<string, Cases>;
  readonly waiting: readonly Waiting[];
}

/** An effect's value, or the message it fails or dies with. */
const attempt = <A>(work: Effect.Effect<A, unknown>) =>
  Effect.result(
    work.pipe(
      Effect.mapError((error) =>
        error instanceof Error ? error.message : String(error)
      ),
      Effect.catchDefect((defect) =>
        Effect.fail(defect instanceof Error ? defect.message : String(defect))
      )
    )
  );

/**
 * What a solver step works out for an answer: each combination of shapes
 * of the variables it types, with the sorts of the solver's variables. A
 * goal the solver cannot decide, and every goal that needs a variable such
 * a goal defines, waits for values instead.
 */
const stepFormulas = (model: Model, step: Solved, vars: Vars) =>
  Effect.gen(function* () {
    const sorts = new Map<string, Sort>();
    const base: SymbolicContext = {
      evaluate: (part) =>
        term(model, part, vars) as unknown as Effect.Effect<unknown, Error>,
      sorts,
      symbols: new Map(),
    };
    const typing = (literal: unknown) =>
      isForm(literal, "schema/fits?") &&
      step.symbols.includes((literal.parts[0] as LogicVariable).name);
    const typed: [string, Cases][] = [];
    for (const literal of step.parts) {
      if (typing(literal)) {
        const form = literal as LogicForm;
        const name = (form.parts[0] as LogicVariable).name;
        const schema = yield* term(model, form.parts[1], vars);
        typed.push([name, (yield* shapeFor(name, schema, base)).cases]);
      }
    }
    const goals = (step.parts as readonly Literal[]).filter(
      (literal) =>
        !(typing(literal) || step.defines.some(([, , by]) => by === literal))
    );
    const choices: Choice[] = [];
    for (const shapes of shapeChoices(typed)) {
      choices.push(yield* choiceOf(step, goals, shapes, base));
    }
    return { choices, sorts };
  });

/**
 * Two formulas that must both hold, or, when together they split into more
 * cases than the solver takes, why: the goal that adds the second then
 * waits for values instead.
 */
const joined = (a: Formula, b: Formula): Formula | string => {
  try {
    return and(a, b);
  } catch (error) {
    if (error instanceof LogicError) {
      return error.message;
    }
    throw error;
  }
};

/**
 * What a solver step's goals make for one shape of each variable it types.
 * A goal the solver cannot work out on the symbols waits, and so does every
 * goal that needs a variable such a goal defines.
 */
const choiceOf = (
  step: Solved,
  goals: readonly Literal[],
  shapes: readonly (readonly [string, Cases[number]])[],
  base: SymbolicContext
) =>
  Effect.gen(function* () {
    const symbols = new Map<string, Cases>(
      shapes.map(([name, each]) => [name, [{ sym: each.sym, when: TRUE }]])
    );
    const context: SymbolicContext = { ...base, symbols };
    const waiting: Waiting[] = [];
    // The variables that waiting goals give values to.
    const pending = new Set<string>();
    const worked = worker(waiting, pending);
    let formula: Formula = shapes.reduce<Formula>(
      (f, [, each]) => and(f, each.when),
      TRUE
    );
    // Adds what a goal says, or, when the cases grow too many, lets it wait.
    const hold = (goal: Literal, extra: Formula) => {
      const held = joined(formula, extra);
      if (typeof held === "string") {
        waiting.push({ goal, why: held });
        return false;
      }
      formula = held;
      return true;
    };
    for (const [name, value, by] of step.defines) {
      // "in" takes one item of the list: one case for each, one of which
      // must hold. The cases of "=" are every way its value can come out.
      const taken = isForm(by, "in");
      const cases = yield* worked(
        by,
        value,
        taken
          ? Effect.flatMap(symbolicTerm(value, context), (lists) =>
              members(name, lists, context)
            )
          : symbolicTerm(value, context)
      );
      const kept =
        cases !== undefined &&
        (!taken ||
          hold(
            by,
            cases.reduce<Formula>((f, each) => or(f, each.when), FALSE)
          ));
      if (kept) {
        symbols.set(name, cases);
      } else {
        pending.add(name);
      }
    }
    for (const goal of goals) {
      const decided = yield* worked(
        goal,
        goal,
        Effect.flatMap(symbolicTerm(goal, context), formulaOf)
      );
      if (decided !== undefined) {
        hold(goal, decided);
      }
    }
    return { formula, symbols, waiting } satisfies Choice;
  });

/**
 * Works a goal out on the symbols; when the solver cannot, or the goal needs
 * a variable a waiting goal gives, the goal waits for values instead.
 */
const worker =
  (waiting: Waiting[], pending: ReadonlySet<string>) =>
  <A>(goal: Literal, value: unknown, work: Effect.Effect<A, unknown>) =>
    Effect.gen(function* () {
      const before =
        value instanceof LogicValue
          ? value.variables.find((name) => pending.has(name))
          : undefined;
      if (before !== undefined) {
        const why = `It needs the value of ?${before}, which a goal the solver cannot decide gives.`;
        waiting.push({ goal, why });
        return undefined;
      }
      const done = yield* attempt(work);
      if (Result.isFailure(done)) {
        waiting.push({ goal, why: done.failure });
        return undefined;
      }
      return done.success;
    });

/** The sorts of the solver's variables that some constraints and values hold. */
const sortsFor = (
  constraints: readonly Constraint[],
  extra: readonly string[],
  sorts: ReadonlyMap<string, Sort>
) =>
  new Map(
    [
      ...new Set([
        ...constraints.flatMap((c) => [...c.linear.coefficients.keys()]),
        ...extra,
      ]),
    ].map((name) => [name, sorts.get(name) ?? "real"] as const)
  );

/** The solver's variables that the values of some variables are made of. */
const leavesFor = (
  names: readonly string[],
  symbols: ReadonlyMap<string, Cases>
) => [
  ...new Set(
    names.flatMap((name) =>
      (symbols.get(name) ?? []).flatMap((each) => leavesOf(each.sym))
    )
  ),
];

/** Why a variable with infinitely many values fails a step. */
const infinitely = (
  leaf: string,
  shown: string,
  choice: Choice,
  answered: readonly string[]
) => {
  const name = `?${symbolOf(leaf)}`;
  const waiter = choice.waiting.find(({ goal }) =>
    leavesFor(goal.variables, choice.symbols).includes(leaf)
  );
  if (waiter === undefined || answered.includes(leaf)) {
    return `${name} stands for infinitely many values that meet ${shown}, so they cannot each be an answer. Bound it on both sides, or ask only whether one exists, with exists or not.`;
  }
  return `${name} stands for infinitely many values that meet ${shown}, and ${show(waiter.goal)} waits for its value. ${waiter.why} Bound ${name} on both sides, or bind it with a relation goal.`;
};

/**
 * The answers one solution gives: each chosen variable's value under it,
 * with the other solver variables given values that meet the constraints
 * too, and the waiting goals run on them.
 */
const answersAt = (
  model: Model,
  vars: Vars,
  choice: Choice,
  constraints: readonly Constraint[],
  known: ReadonlyMap<string, Sort>,
  solution: ReadonlyMap<string, Rational>,
  chosen: ReadonlyMap<string, Sym>
) =>
  Effect.gen(function* () {
    const others = new Map([...known].filter(([name]) => !solution.has(name)));
    const rest =
      chosen.size === 0
        ? new Map()
        : ((yield* solving(() =>
            solveConstraints(fixed(constraints, solution), others)
          )) ?? new Map());
    const values = new Map([...rest, ...solution]);
    let answers: readonly Vars[] = [
      new Map([
        ...vars,
        ...[...chosen].map(
          ([name, sym]) => [name, concreteOf(sym, values)] as const
        ),
      ]),
    ];
    for (const { goal } of choice.waiting) {
      answers = yield* testEach(model, goal, answers);
    }
    return answers;
  });

/**
 * One case of each variable at a time, so each value a variable can take is
 * listed: the symbolic value chosen for each, and when they all hold.
 */
const chosenCases = (choice: Choice, names: readonly string[]) =>
  product(names.map((name) => choice.symbols.get(name) as Cases)).map(
    ({ syms, when }) => ({
      chosen: new Map(names.map((name, at) => [name, syms[at] as Sym])),
      when,
    })
  );

/**
 * What to list for each case of each variable and each way its cases hold:
 * the constraints, the solver's variables to list, those of them the
 * answers show, and the case chosen for each variable.
 */
const listings = (
  choice: Choice,
  constraints: readonly Constraint[],
  {
    first,
    names,
    needs,
  }: {
    readonly first: boolean;
    readonly names: readonly string[];
    readonly needs: readonly string[];
  },
  given: readonly string[]
) =>
  chosenCases(choice, given).flatMap(({ chosen, when }) => {
    const answered = first ? [] : leavesOfChosen(names, chosen);
    const listedLeaves = [
      ...new Set([...answered, ...leavesOfChosen(needs, chosen)]),
    ];
    return when.map((extra) => ({
      all: [...constraints, ...extra],
      answered,
      chosen,
      listedLeaves,
    }));
  });

/** The solver's variables that the chosen values of some variables are made of. */
const leavesOfChosen = (
  names: readonly string[],
  chosen: ReadonlyMap<string, Sym>
) => [
  ...new Set(
    names.flatMap((name) => {
      const sym = chosen.get(name);
      return sym === undefined ? [] : leavesOf(sym);
    })
  ),
];

/**
 * The answers one case of one choice of a solver step gives an answer,
 * with the variables `names` bound. It takes one case of each variable they
 * and the waiting goals need at a time, so each value a variable can take
 * is listed, and lists the values of the solver's variables those cases
 * are made of, each combination with the waiting goals run on it. With
 * `first`, the variables `names` only need some values, and the first
 * answer is enough. Fails when a variable it must list has infinitely many
 * values.
 */
const caseAnswers = (
  model: Model,
  step: Solved,
  vars: Vars,
  choice: Choice,
  constraints: readonly Constraint[],
  sorts: ReadonlyMap<string, Sort>,
  names: readonly string[],
  first: boolean
): LogicEffect<readonly Vars[]> =>
  Effect.gen(function* () {
    const needs = [
      ...new Set(choice.waiting.flatMap(({ goal }) => goal.variables)),
    ].filter((name) => choice.symbols.has(name));
    const given = [...new Set([...names, ...needs])].filter((name) =>
      choice.symbols.has(name)
    );
    const out: Vars[] = [];
    for (const { all, answered, chosen, listedLeaves } of listings(
      choice,
      constraints,
      { first, names, needs: given.filter((name) => needs.includes(name)) },
      given
    )) {
      const known = sortsFor(all, listedLeaves, sorts);
      const listed = yield* solving(() => enumerate(all, known, listedLeaves));
      if ("infinite" in listed) {
        const shown = show(instantiate(step, vars));
        return yield* logicError(
          infinitely(listed.infinite, shown, choice, answered)
        );
      }
      for (const solution of listed.solutions) {
        out.push(
          ...(yield* answersAt(
            model,
            vars,
            choice,
            all,
            known,
            solution,
            chosen
          ))
        );
        if (first && out.length > 0) {
          return out;
        }
      }
    }
    return out;
  }) as LogicEffect<readonly Vars[]>;

/**
 * The step with the variables an answer already holds taken as known: a
 * schema check or "=" about one is then a goal like any other. `why` asks
 * the step with the values of the row it explains.
 */
const withKnown = (step: Solved, vars: Vars) =>
  step.symbols.some((name) => vars.has(name)) ||
  step.defines.some(([name]) => vars.has(name))
    ? new Solved(
        step.parts as Literal[],
        step.symbols.filter((name) => !vars.has(name)),
        step.defines.filter(([name]) => !vars.has(name)),
        step.keeps,
        step.inputs
      )
    : step;

/**
 * A schema check of the step whose schema, computed when the step runs,
 * lists the values it allows: as for a schema written in place, one that
 * lists its values is listed, and the solver stands for the values of any
 * other.
 */
const listedTyping = (model: Model, step: Solved, vars: Vars) =>
  Effect.gen(function* () {
    for (const literal of step.parts as readonly Literal[]) {
      if (
        isForm(literal, "schema/fits?") &&
        literal.parts[1] instanceof LogicValue &&
        step.symbols.includes((literal.parts[0] as LogicVariable).name) &&
        unlisted(yield* term(model, literal.parts[1], vars)) === undefined
      ) {
        return literal;
      }
    }
    return undefined;
  });

/**
 * The answers of a solver step for an answer. With nothing to keep, the
 * answer is kept once when there are values that meet its goals. Otherwise
 * each combination of values of the variables it keeps gives an answer,
 * and a variable with infinitely many fails.
 */
const solvedAnswers = (
  model: Model,
  asked: Solved,
  vars: Vars
): LogicEffect<readonly Vars[]> =>
  Effect.gen(function* () {
    const step = withKnown(asked, vars);
    const listing = yield* listedTyping(model, step, vars);
    if (listing !== undefined) {
      // The variable takes each value its schema lists, as a listing does,
      // and the rest of the step is solved with it known.
      const out: Vars[] = [];
      for (const each of yield* listed(
        model,
        listing.parts[0],
        listing.parts[1],
        vars
      )) {
        out.push(...(yield* solvedAnswers(model, step, each)));
      }
      return out;
    }
    const { choices, sorts } = yield* stepFormulas(model, step, vars);
    const first = step.keeps.length === 0;
    const out = new Map<string, Vars>();
    for (const choice of choices) {
      for (const constraints of choice.formula) {
        for (const answer of yield* caseAnswers(
          model,
          step,
          vars,
          choice,
          constraints,
          sorts,
          step.keeps,
          first
        )) {
          if (first) {
            return [vars];
          }
          const values = step.keeps.map((name) => answer.get(name));
          out.set(
            valueKey(values),
            new Map([
              ...vars,
              ...step.keeps.map((name, at) => [name, values[at]] as const),
            ])
          );
        }
      }
    }
    return [...out.values()];
  }).pipe(
    Effect.mapError((error) =>
      error instanceof LogicError
        ? error
        : new LogicError({ message: String(error) })
    ),
    Effect.catchDefect((defect) =>
      defect instanceof LogicError ? Effect.fail(defect) : Effect.die(defect)
    )
  ) as LogicEffect<readonly Vars[]>;

/**
 * Values that meet a solver step's goals for an answer, for every variable
 * it solves for, as `why` shows them; undefined when none do.
 */
export const exampleOf = (model: Model, step: Solved, vars: Vars) =>
  Effect.map(firstAnswer(model, step, vars), (answer) =>
    answer === undefined
      ? undefined
      : Object.fromEntries(
          [...step.symbols, ...step.defines.map(([name]) => name)].map(
            (name) => [`?${name.replace(LENGTH_MARK, "")}`, answer.get(name)]
          )
        )
  ) as LogicEffect<Record<string, unknown> | undefined>;

/** The first answer a solver step gives, with every variable it solves for bound. */
const firstAnswer = (
  model: Model,
  asked: Solved,
  vars: Vars
): LogicEffect<Vars | undefined> =>
  Effect.gen(function* () {
    const step = withKnown(asked, vars);
    const listing = yield* listedTyping(model, step, vars);
    if (listing !== undefined) {
      for (const each of yield* listed(
        model,
        listing.parts[0],
        listing.parts[1],
        vars
      )) {
        const answer = yield* firstAnswer(model, step, each);
        if (answer !== undefined) {
          return answer;
        }
      }
      return undefined;
    }
    const { choices, sorts } = yield* stepFormulas(model, step, vars);
    const names = [...step.symbols, ...step.defines.map(([name]) => name)];
    for (const choice of choices) {
      for (const constraints of choice.formula) {
        const [answer] = yield* caseAnswers(
          model,
          step,
          vars,
          choice,
          constraints,
          sorts,
          names,
          true
        );
        if (answer !== undefined) {
          return answer;
        }
      }
    }
    return undefined;
  }).pipe(
    Effect.mapError((error) =>
      error instanceof LogicError
        ? error
        : new LogicError({ message: String(error) })
    ),
    Effect.catchDefect((defect) =>
      defect instanceof LogicError ? Effect.fail(defect) : Effect.die(defect)
    )
  ) as LogicEffect<Vars | undefined>;

/** Runs the solver, as an effect that fails with a LogicError when the question is too hard. */
const solving = <A>(work: () => A) =>
  Effect.try({
    try: work,
    catch: (error) =>
      error instanceof LogicError
        ? error
        : new LogicError({ message: String(error) }),
  });

/** Every way of choosing one shape for each variable a solver step types. */
const shapeChoices = (typed: readonly [string, Cases][]) => {
  let out: (readonly [string, Cases[number]])[][] = [[]];
  for (const [name, cases] of typed) {
    // Counted before they are made, so too many are never built.
    if (out.length * cases.length > MOST_WAYS) {
      throw new LogicError({
        message: `The values no goal binds can be shaped in more than ${MOST_WAYS.toLocaleString("en")} ways together. Narrow their schemas.`,
      });
    }
    out = out.flatMap((sofar) =>
      cases.map((each) => [...sofar, [name, each] as const])
    );
  }
  return out;
};

const fixed = (
  constraints: readonly Constraint[],
  values: ReadonlyMap<string, Rational>
) =>
  constraints.map((c) => {
    let linear = c.linear;
    for (const [name, value] of values) {
      const k = linear.coefficients.get(name);
      if (k !== undefined) {
        const coefficients = new Map(linear.coefficients);
        coefficients.delete(name);
        linear = {
          coefficients,
          constant: plusRational(linear.constant, timesRational(k, value)),
        };
      }
    }
    return { linear, relation: c.relation };
  });

/**
 * The answers a goal that can bind gives for an answer that leaves it a
 * variable to bind, each with what it bound; undefined when nothing is left
 * to bind, and the goal only tests. "=" matches one side against the value
 * of the other, "in" matches the element against each item of the list, and
 * "schema/fits?" always answers this way: its schema says what fits.
 */
const bound = (
  model: Model,
  goal: LogicForm,
  vars: Vars
): LogicEffect<readonly Vars[] | undefined> =>
  Effect.gen(function* () {
    const [first, second] = goal.parts;
    if (goal.form === "schema/fits?") {
      return hasFree(first, vars)
        ? yield* listed(model, first, second, vars)
        : yield* match(
            model,
            second,
            yield* term(model, first, vars),
            vars,
            false
          );
    }
    if (goal.form === "=") {
      const [pattern, other] = hasFree(first, vars)
        ? [first, second]
        : [second, first];
      return hasFree(pattern, vars)
        ? yield* match(
            model,
            pattern,
            yield* term(model, other, vars),
            vars,
            true
          )
        : undefined;
    }
    if (!hasFree(first, vars)) {
      return undefined;
    }
    // A list that repeats an item gives it once.
    const items = yield* listOf(model, second, vars);
    const out: Vars[] = [];
    for (const item of new Map(
      items.map((each) => [valueKey(each), each])
    ).values()) {
      out.push(...(yield* match(model, first, item, vars, true)));
    }
    return out;
  });

/**
 * The answers with what a row binds, for a relation call with patterns
 * among its arguments: the row's values there must fit them. None when the
 * row does not match, and more than one when a pattern fits in several ways.
 */
export const matchRow = (
  model: Model,
  found: Exclude<ReturnType<typeof candidates>, string>,
  tuple: Tuple,
  vars: Vars
) =>
  Effect.gen(function* () {
    const first = extend(vars, found.free, tuple);
    let answers: readonly Vars[] = first === undefined ? [] : [first];
    for (const [position, pattern] of found.patterns) {
      const next: Vars[] = [];
      for (const answered of answers) {
        next.push(
          ...(yield* match(model, pattern, tuple[position], answered, false))
        );
      }
      answers = next;
    }
    return answers;
  });

/**
 * Answers go on a batch at a time: a goal hands the answers it has to the
 * goals after it as soon as there are this many, so a body holds a few
 * batches at once, however many answers it has in all.
 */
const BATCH = 512;

/** What takes the answers of a body, a batch at a time. */
export type Sink = (answers: readonly Vars[]) => LogicEffect<void>;

/**
 * Runs a goal that is not a relation goal for each answer: "=", "in", and
 * "schema/fits?" bind the variables that have no value yet, and everything
 * else is a test that keeps the answer or drops it.
 */
const testEach = (model: Model, literal: Literal, answers: readonly Vars[]) =>
  Effect.gen(function* () {
    const out: Vars[] = [];
    for (const vars of answers) {
      if (literal instanceof Solved) {
        out.push(...(yield* solvedAnswers(model, literal, vars)));
        continue;
      }
      const found = isForm(literal, "=", "in", "schema/fits?")
        ? yield* bound(model, literal, vars)
        : undefined;
      if (found !== undefined) {
        out.push(...found);
      } else if (yield* holds(model, literal, vars)) {
        out.push(vars);
      }
    }
    return out;
  });

type Meet = (tuple: Tuple, vars: Vars, fresh: boolean) => Vars | undefined;

/**
 * Adds to `out` the answers a row gives a relation goal for an answer.
 * Undefined when there was nothing to wait for: the goal has no patterns.
 */
const addRow = (
  model: Model,
  found: Exclude<ReturnType<typeof candidates>, string>,
  tuple: Tuple,
  vars: Vars,
  out: Vars[],
  meet: Meet | undefined
): LogicEffect<void> | undefined => {
  // An answer that bound a variable is a new map, which `meet` may write on.
  const keep = (next: Vars | undefined, fresh: boolean) => {
    const met =
      next === undefined || meet === undefined
        ? next
        : meet(tuple, next, fresh);
    if (met !== undefined) {
      out.push(met);
    }
  };
  if (found.patterns.length === 0) {
    const next = extend(vars, found.free, tuple);
    keep(next, next !== vars);
    return;
  }
  return Effect.map(matchRow(model, found, tuple, vars), (answers) => {
    for (const answer of answers) {
      keep(answer, false);
    }
  });
};

/**
 * Extends each answer with every row a relation goal matches for it, and
 * hands the answers on a batch at a time.
 */
const matchRows = (
  model: Model,
  atom: Atom,
  answers: readonly Vars[],
  tuples: Rows,
  on: Sink,
  meet?: Meet
) =>
  Effect.gen(function* () {
    let out: Vars[] = [];
    for (const vars of answers) {
      const found = atom.plain
        ? candidates(atom, vars, tuples)
        : yield* lookup(model, atom, vars, tuples);
      if (typeof found === "string") {
        return yield* logicError(found);
      }
      for (const tuple of found.tuples) {
        yield* addRow(model, found, tuple, vars, out, meet) ?? Effect.void;
        if (out.length >= BATCH) {
          yield* on(out);
          out = [];
        }
      }
    }
    yield* on(out);
  });

/**
 * Gives a sink the answers of a body from the goal at `at` on, for some
 * answers of the goals before it, in the order they are found. `reader`
 * says what a relation goal reads instead of the relation's own rows, by
 * the goal's position in the body.
 */
const flow = (
  model: Model,
  body: readonly Literal[],
  at: number,
  answers: readonly Vars[],
  reader: Reader | undefined,
  sink: Sink
): LogicEffect<void> => {
  if (answers.length === 0) {
    return Effect.void;
  }
  const literal = body[at];
  if (literal === undefined) {
    return sink(answers);
  }
  const on = (out: readonly Vars[]) =>
    flow(model, body, at + 1, out, reader, sink);
  if (!(literal instanceof Atom)) {
    return Effect.flatMap(testEach(model, literal, answers), on);
  }
  const rows = reader?.rows?.(at);
  const meeting = reader?.meet;
  const meet: Meet | undefined =
    meeting === undefined
      ? undefined
      : (tuple, vars, fresh) => meeting(at, tuple, vars, fresh);
  // A relation is derived the first time a goal reads it, so a query
  // derives only the relations its goals reach with an answer.
  const pending =
    rows === undefined ? toRead(model, literal.relation, true) : undefined;
  const match = Effect.suspend(() =>
    matchRows(
      model,
      literal,
      answers,
      rows ?? seen(model, literal.relation.name),
      on,
      meet
    )
  );
  return pending === undefined ? match : Effect.andThen(pending, match);
};

/**
 * Gives a sink the answers of a body, a batch at a time, starting from an
 * answer that may have bound some variables.
 */
export const each = (
  model: Model,
  body: readonly Literal[],
  sink: Sink,
  start: Vars = NO_VARS,
  reader?: Reader
) => flow(model, body, 0, [start], reader, sink);

/** A sink that keeps every answer it gets in `into`. */
const keeping =
  (into: Vars[]): Sink =>
  (answers) =>
    Effect.sync(() => {
      for (const vars of answers) {
        into.push(vars);
      }
    });

/** Every answer of a body, for a body with few: they are all held at once. */
export const matches = (
  model: Model,
  body: readonly Literal[],
  start: Vars = NO_VARS
) => {
  const found: Vars[] = [];
  return Effect.as(each(model, body, keeping(found), start), found);
};

/**
 * Fails a goal-directed query that cannot be directed: it asked a relation
 * about an argument that is not data, such as a schema a variable holds,
 * and only data can be looked up. The query is then answered in full.
 */
export const UNDIRECTED = new LogicError({
  message: "A goal-directed query asked about a value that is not data.",
});

/** Why a row a rule derived cannot hold: it must be JSON data. */
export const rowProblem = (rule: CompiledRule, tuple: readonly unknown[]) => {
  if (tuple.every(isGroundValue)) {
    return;
  }
  return rule.demand
    ? UNDIRECTED
    : new LogicError({
        message: `Rule ${show(rule.source)} produced a value that is not data: ${show([rule.head.relation.name, ...tuple])}.`,
      });
};

/** A row a rule derived, which must be JSON data. */
export const derivedRow = (rule: CompiledRule, tuple: readonly unknown[]) => {
  const problem = rowProblem(rule, tuple);
  return problem === undefined
    ? Effect.succeed(tuple as Tuple)
    : Effect.fail(problem);
};

/** The names of a keyed relation's key columns. */
export const keyColumns = (relation: RelationInfo) =>
  (relation.key ?? []).map((position) => relation.columns[position]);

/**
 * The unknowns that the rules of a group of relations invent, and what the
 * keys of those relations made some of them equal to. A key says a row is
 * the only one with its key, so when two rows have the same key, an unknown
 * the group invented in one takes the value in the other.
 */
export interface Inventions {
  /** For an unknown a key made equal to another value: that value. */
  readonly equal: Map<string, unknown>;
  /** The unknowns the group's rules invented, by key. */
  readonly invented: Set<string>;
}

/** A term with each value in it, outside its variables, replaced. */
export const replaceData = (
  item: unknown,
  replace: (value: unknown) => unknown
): unknown => {
  const inner = (part: unknown) => replaceData(part, replace);
  if (item instanceof Atom) {
    return new Atom(item.relation, item.args.map(inner));
  }
  if (item instanceof LogicForm) {
    return item.map(inner);
  }
  if (item instanceof DeferredCall) {
    return new DeferredCall(item.fn, item.callee, item.args.map(inner));
  }
  return item instanceof LogicVariable ? item : replace(item);
};

/**
 * A value with every unknown a key made equal to another value replaced by
 * that value, also inside what other unknowns describe.
 */
const settled = (value: unknown, inventions: Inventions): unknown => {
  if (value instanceof Unknown) {
    const equal = inventions.equal.get(value.key);
    if (equal !== undefined) {
      return settled(equal, inventions);
    }
    // Only an unknown the group invented can describe one it invented.
    if (!inventions.invented.has(value.key)) {
      return value;
    }
    const goal = replaceData(value.goal, (item) => settled(item, inventions));
    const same = new Unknown(value.variable, goal);
    if (same.key === value.key) {
      return value;
    }
    inventions.invented.add(same.key);
    return same;
  }
  if (Array.isArray(value)) {
    return value.map((item) => settled(item, inventions));
  }
  return isPlainObject(value)
    ? Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          settled(item, inventions),
        ])
      )
    : value;
};

/** True when a value holds an unknown, also inside what others describe. */
export const occurs = (unknown: Unknown, value: unknown): boolean => {
  const inside = (part: unknown) => occurs(unknown, part);
  if (value instanceof Unknown) {
    return value.key === unknown.key || inside(value.goal);
  }
  if (value instanceof LogicValue) {
    return value.parts.some(inside);
  }
  if (Array.isArray(value)) {
    return value.some(inside);
  }
  return isPlainObject(value) && Object.values(value).some(inside);
};

/** How many unknowns deep a value goes: 0 for a value that holds none. */
export const depthOf = (value: unknown): number => {
  if (value instanceof Unknown) {
    return 1 + depthOf(value.goal);
  }
  let parts: readonly unknown[] = [];
  if (value instanceof LogicValue) {
    parts = value.parts;
  } else if (Array.isArray(value)) {
    parts = value;
  } else if (isPlainObject(value)) {
    parts = Object.values(value);
  }
  return parts.reduce(
    (deepest: number, part) => Math.max(deepest, depthOf(part)),
    0
  );
};

/**
 * Explains each row of a group again, once keys have made unknowns equal.
 * A row a key replaced came about as another row, so the answer that gave
 * it may not give it, and two rows that became one may each have rested on
 * the other. So the rules run again on the rows there are, from the facts
 * up, round by round: each row is explained by the least answer of the
 * first rule that gives it, which rests only on rows explained before it. A
 * rule that invents gives the rows of its head with what keys made its
 * unknowns equal to.
 */
export const justify = (
  model: Model,
  rules: readonly CompiledRule[],
  relations: ReadonlyMap<string, RelationInfo>,
  inventions: Inventions
) =>
  Effect.suspend(() => {
    const final = new Map<string, TupleSet>();
    const fresh = new Map<string, Map<string, Match>>();
    let delta = givenRows(model, relations, final, fresh);
    return Effect.gen(function* () {
      // Answers that give a row as it is come first. Only a row they leave
      // unexplained is explained through what a key made equal.
      for (const throughKeys of [false, true]) {
        const step = explaining(model, inventions, final, fresh, throughKeys);
        yield* firstRound(model, rules, step, delta);
        yield* rounds(model, rules, step, delta);
        delta = new Map();
      }
      for (const name of final.keys()) {
        model.told.set(name, fresh.get(name) ?? new Map());
      }
    }).pipe(
      // The group's rows are put back whatever became of the telling.
      Effect.ensuring(
        Effect.sync(() => {
          for (const [name, rows] of final) {
            model.relations.set(name, rows);
          }
        })
      )
    );
  });

/**
 * Puts each relation of a group back to its facts, for its rows to be
 * explained again, and keeps the rows it has in `final`.
 */
const givenRows = (
  model: Model,
  relations: ReadonlyMap<string, RelationInfo>,
  final: Map<string, TupleSet>,
  fresh: Map<string, Map<string, Match>>
) => {
  const delta = new Map<string, TupleSet>();
  for (const name of relations.keys()) {
    const rows = model.relations.get(name) ?? new TupleSet();
    final.set(name, rows);
    fresh.set(name, new Map());
    const given = new TupleSet();
    const facts = startingFacts(model, name);
    for (const tuple of facts?.values() ?? []) {
      if (rows.has(tuple)) {
        given.add(tuple);
      }
    }
    model.relations.set(name, given.clone());
    delta.set(name, given);
  }
  return delta;
};

/** The answers of a rule's body in a round, given to a sink. */
export type Feed = (sink: Sink) => LogicEffect<void>;

/** What a rule does with the answers of its body, in a round. */
export type Step = (
  rule: CompiledRule,
  feed: Feed,
  into: Map<string, TupleSet>
) => LogicEffect<void>;

/** Every answer of a feed, for a step that needs them all at once. */
const gathered = (feed: Feed) => {
  const found: Vars[] = [];
  return Effect.as(feed(keeping(found)), found);
};

/**
 * Explains each row of `final` that an answer gives and nothing explains
 * yet. Without `throughKeys`, a rule that invents gives rows only for an
 * answer whose unknowns no key made equal to another value.
 */
const explaining =
  (
    model: Model,
    inventions: Inventions,
    final: ReadonlyMap<string, TupleSet>,
    fresh: Map<string, Map<string, Match>>,
    throughKeys: boolean
  ): Step =>
  (rule, feed, into) =>
    Effect.flatMap(rule.equates ? Effect.succeed([]) : gathered(feed), (all) =>
      Effect.forEach(
        all.sort((a, b) => compareAnswers(rule, a, b)),
        (vars) =>
          Effect.gen(function* () {
            const same = yield* madeEqual(model, rule, vars, inventions);
            if (same.length > 0 && !throughKeys) {
              return;
            }
            const derivation =
              same.length === 0 ? { rule, vars } : { rule, same, vars };
            for (const { args, relation } of headsOf(rule)) {
              const tuple = settled(
                yield* tupleOf(model, args, vars),
                inventions
              ) as Tuple;
              explainRow(
                model,
                into,
                fresh,
                final.get(relation.name),
                relation.name,
                tuple,
                derivation
              );
            }
          }),
        { discard: true }
      )
    );

/** Explains a row of a group's final rows, unless something already does. */
const explainRow = (
  model: Model,
  into: Map<string, TupleSet>,
  fresh: Map<string, Map<string, Match>>,
  final: TupleSet | undefined,
  relation: string,
  tuple: Tuple,
  derivation: Match
) => {
  const key = valueKey(tuple);
  if (
    final?.hasKey(key) &&
    model.relations.get(relation)?.addKeyed(key, tuple)
  ) {
    getOrCreate(into, relation, () => new TupleSet()).addKeyed(key, tuple);
    fresh.get(relation)?.set(key, derivation);
  }
};

/**
 * The unknowns a rule names for an answer that a key made equal to other
 * values, each with the value it equals.
 */
const madeEqual = (
  model: Model,
  rule: CompiledRule,
  vars: Vars,
  inventions: Inventions
) =>
  Effect.map(inventedBy(model, rule, vars), (named) =>
    named.flatMap((unknown) => {
      const value = settled(unknown, inventions);
      return sameValue(value, unknown) ? [] : [[unknown, value] as const];
    })
  );

/** Gives a step every answer of each rule's body. */
const firstRound = (
  model: Model,
  rules: readonly CompiledRule[],
  step: Step,
  into: Map<string, TupleSet>
) =>
  Effect.gen(function* () {
    for (const rule of rules) {
      yield* step(rule, (sink) => each(model, rule.body, sink), into);
    }
  });

/**
 * Gives a step, round after round, the answers that use rows the round
 * before added, until a round adds none. `after` runs on what each round
 * added.
 */
export const rounds = (
  model: Model,
  rules: readonly CompiledRule[],
  step: Step,
  delta: Map<string, TupleSet>,
  after: (added: Map<string, TupleSet>) => LogicEffect<void> = () => Effect.void
) =>
  Effect.gen(function* () {
    let current = delta;
    while (hasChanges(current)) {
      const next = new Map<string, TupleSet>();
      for (const rule of rules) {
        const changes = current;
        yield* step(
          rule,
          (sink) => changedEach(model, rule.body, changes, sink),
          next
        );
      }
      yield* after(next);
      current = next;
    }
  });

/** The row a rule's head gives for an answer, when nothing is computed. */
export const plainRow = (rule: CompiledRule, vars: Vars) => {
  const plain = plainTuple(rule.head.args, vars);
  return plain?.every(isGroundValue) ? (plain as Tuple) : undefined;
};

const hasChanges = (delta: ReadonlyMap<string, TupleSet>) =>
  [...delta.values()].some((changes) => changes.size > 0);

type Body = readonly Literal[];

const deltaPlans = new WeakMap<Body, Map<number, Body>>();

/**
 * A body reordered to start from the goal at `position`, so a round starts
 * from the few new rows instead of scanning everything else first.
 */
export const deltaPlan = (body: Body, position: number) => {
  let plans = deltaPlans.get(body);
  if (plans === undefined) {
    plans = new Map();
    deltaPlans.set(body, plans);
  }
  return getOrCreate(plans, position, () => {
    const first = body[position];
    if (!(first instanceof Atom && first.plain)) {
      return body;
    }
    const rest = compilable(() =>
      planLiterals(
        body.filter((_, at) => at !== position),
        first.variables
      )
    );
    return rest === undefined ? body : [first, ...rest];
  });
};

/**
 * Runs a body once per goal that matches rows that are new, in a round of
 * rules or in a change to facts, so every answer the sink gets uses at
 * least one new row.
 */
export const changedEach = (
  model: Model,
  body: Body,
  delta: ReadonlyMap<string, TupleSet>,
  sink: Sink
) =>
  Effect.gen(function* () {
    for (const [position, literal] of body.entries()) {
      const changes =
        literal instanceof Atom ? delta.get(literal.relation.name) : undefined;
      if (changes === undefined || changes.size === 0) {
        continue;
      }
      const planned = deltaPlan(body, position);
      const changedAt = planned.indexOf(literal);
      yield* each(model, planned, sink, NO_VARS, {
        rows: (at) => (at === changedAt ? changes : undefined),
      });
    }
  });

/** Every answer of a body that uses a row that is new. */
export const changedAnswers = (
  model: Model,
  body: Body,
  delta: ReadonlyMap<string, TupleSet>
) => gathered((sink) => changedEach(model, body, delta, sink));

/** The kind of the aggregate at a head position, such as `"sum"`. */
export const aggregateKind = (rule: CompiledRule, position: number) =>
  (rule.head.args[position] as DeferredCall).aggregate as string;

/** The head values of one match, and the value it gives each aggregate. */
export const matchValues = (model: Model, rule: CompiledRule, vars: Vars) =>
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
export const selectsAlone = (rule: CompiledRule) => {
  const [position, ...others] = rule.aggregates;
  return (
    others.length === 0 &&
    aggregator(aggregateKind(rule, position ?? 0)).selects
  );
};

/** Why an aggregate cannot combine some values, naming the rule. */
export const aggregateProblem = (
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

/** Recursion through lattice aggregates stops after this many rounds. */
export const MAX_LATTICE_ROUNDS = 10_000;

/** The unknowns a rule's head names for an answer of its body. */
export const inventedBy = (model: Model, rule: CompiledRule, vars: Vars) =>
  Effect.forEach(rule.invents?.names ?? [], (name) =>
    unknownOf(
      model,
      new LogicForm("some", [new LogicVariable(name), rule.invents?.goal]),
      vars
    )
  );

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
      yield* deriving(model, dependency, false) ?? Effect.void;
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
    model.computed.set(name, computed.dependencies);
  });

/** Forgets what was derived for relations whose rules failed part way. */
export const forget = (model: Model, members: ReadonlySet<string>) => {
  for (const name of members) {
    model.state.delete(name);
    model.relations.delete(name);
    model.told.delete(name);
    model.support.delete(name);
  }
};

/**
 * Derives the rows of relations that depend on each other, by running their
 * rules on top of their facts, and keeps how each row came about. A
 * relation the rules read is derived when a goal first reads it.
 */
export const derive = (model: Model, stratum: Stratum) =>
  Effect.gen(function* () {
    const { members } = stratum;
    for (const name of members) {
      model.state.set(name, "running");
      const facts = startingFacts(model, name);
      model.relations.set(name, facts?.clone() ?? new TupleSet());
    }
    yield* deriveRows(model, stratum);
    for (const name of members) {
      model.state.set(name, "done");
    }
  }).pipe(
    Effect.onError(() => Effect.sync(() => forget(model, stratum.members)))
  );

/**
 * What must run before a declared relation's rows can be read, or undefined
 * when nothing must: its rules, unless they are done. A goal of a body that
 * is `reading` the rows takes them as they stand while they are derived, as
 * relations that depend on each other read each other while their rules
 * run; a question about them then fails.
 */
const deriving = (
  model: Model,
  name: string,
  reading: boolean
): LogicEffect<void> | undefined => {
  const stratum = model.strata.get(name);
  if (stratum === undefined) {
    return model.base && deriving(model.base, name, reading);
  }
  model.read.add(name);
  const state = model.state.get(name);
  if (state === "done" || (reading && state === "running")) {
    return;
  }
  return state === "running"
    ? logicError(
        `"${originalName(name)}" was asked about while its own rows were being derived. A question cannot go through recursion.`
      )
    : derive(model, stratum);
};

/** Makes a declared relation's rows complete, by its name. */
export const complete = (model: Model, name: string): LogicEffect<void> =>
  Effect.suspend(() => deriving(model, name, false) ?? Effect.void);

/** What must run before a relation's rows can be read, as `deriving` says. */
const toRead = (model: Model, relation: RelationInfo, reading = false) =>
  relation.computed === undefined
    ? deriving(model, relation.name, reading)
    : compute(model.base ?? model, relation);

/** Makes a relation's rows complete, unless they are already. */
export const ensure = (
  model: Model,
  relation: RelationInfo
): LogicEffect<void> =>
  Effect.suspend(() => toRead(model, relation) ?? Effect.void);

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

export { EMPTY, NO_VARS };

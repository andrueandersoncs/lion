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
  headsOf,
  type Literal,
  planLiterals,
  questionPlans,
} from "@/logic/compile";
import { matching } from "@/logic/fit";
import { originalName } from "@/logic/magic";
import { mentioned, type Stratum, strataOf } from "@/logic/strata";
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
  sameValue,
  show,
  Unknown,
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
  /** How each derived row came about, by relation name and row. */
  readonly derivations = new Map<string, Map<string, Derivation>>();
  /** Relations whose rows are being derived, or are complete. */
  readonly state = new Map<string, "running" | "done">();
  readonly facts: ReadonlyMap<string, TupleSet>;
  readonly rules: readonly CompiledRule[];
  /** The model that holds every relation these rules do not derive. */
  readonly base: Model | undefined;
  /** The group of each relation these rules derive, by relation name. */
  readonly strata: ReadonlyMap<string, Stratum>;

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
  if (isForm(value, "some")) {
    return unknownOf(model, value, vars);
  }
  return isForm(value, "find")
    ? findAll(model, value, vars)
    : holds(model, value as Goal, vars);
};

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
const hasFree = (value: unknown, vars: Vars, asSchema = false): boolean =>
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
const match = (
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
  tuples: TupleSet,
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
const lookup = (model: Model, atom: Atom, vars: Vars, tuples: TupleSet) =>
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
          `${show(instantiate(find, vars))} found a value that is not data: ${show(value)}.`
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
  const found = candidates(atom, vars, rowsOf(model, atom.relation.name));
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
      const value = yield* term(model, first, vars);
      return yield* match(model, second, value, vars, false);
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
const matchRow = (
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
        if (found.patterns.length > 0) {
          out.push(...(yield* matchRow(model, found, tuple, vars)));
          continue;
        }
        const next = extend(vars, found.free, tuple);
        if (next !== undefined) {
          out.push(next);
        }
      }
    }
    return out;
  });

/**
 * Runs a goal that is not a relation goal for each answer: "=", "in", and
 * "schema/fits?" bind the variables that have no value yet, and everything
 * else is a test that keeps the answer or drops it.
 */
const testEach = (model: Model, literal: Literal, answers: readonly Vars[]) =>
  Effect.gen(function* () {
    const out: Vars[] = [];
    for (const vars of answers) {
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
      if (literal instanceof Atom) {
        const rows = changed?.(position);
        // A relation is derived the first time a goal reads it, so a
        // query derives only the relations its goals reach with an answer.
        const pending =
          rows === undefined
            ? toRead(model, literal.relation, true)
            : undefined;
        if (pending !== undefined) {
          yield* pending;
        }
        answers = yield* matchRows(
          model,
          literal,
          answers,
          rows ?? rowsOf(model, literal.relation.name)
        );
      } else {
        answers = yield* testEach(model, literal, answers);
      }
      if (answers.length === 0) {
        break;
      }
    }
    return answers;
  });

/**
 * Fails a goal-directed query that cannot be directed: it asked a relation
 * about an argument that is not data, such as a schema a variable holds,
 * and only data can be looked up. The query is then answered in full.
 */
export const UNDIRECTED = new LogicError({
  message: "A goal-directed query asked about a value that is not data.",
});

/** A row a rule derived, which must be JSON data. */
const derivedRow = (rule: CompiledRule, tuple: readonly unknown[]) => {
  if (tuple.every(isGroundValue)) {
    return Effect.succeed(tuple as Tuple);
  }
  return rule.demand
    ? Effect.fail(UNDIRECTED)
    : logicError(
        `Rule ${show(rule.source)} produced a value that is not data: ${show([rule.head.relation.name, ...tuple])}.`
      );
};

/** Adds a derived row, remembering the first answer that gave it. */
const recordDerived = (
  model: Model,
  delta: Map<string, TupleSet>,
  relation: string,
  tuple: Tuple,
  derivation: Derivation
) => {
  if (
    !getOrCreate(model.relations, relation, () => new TupleSet()).add(tuple)
  ) {
    return;
  }
  getOrCreate(delta, relation, () => new TupleSet()).add(tuple);
  getOrCreate(model.derivations, relation, () => new Map()).set(
    valueKey(tuple),
    derivation
  );
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
interface Inventions {
  /** For an unknown a key made equal to another value: that value. */
  readonly equal: Map<string, unknown>;
  /** The unknowns that facts hold, by key: they are given, not invented. */
  given: ReadonlySet<string> | undefined;
  /** The unknowns the group's rules invented, by key. */
  readonly invented: Set<string>;
  /** True once a key has made unknowns equal that rows still hold. */
  pending: boolean;
}

/** The unknowns a value holds, however deep, by key. */
const unknownsIn = (value: unknown, into: Map<string, Unknown>) => {
  if (value instanceof Unknown) {
    into.set(value.key, value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      unknownsIn(item, into);
    }
  } else if (isPlainObject(value)) {
    for (const item of Object.values(value)) {
      unknownsIn(item, into);
    }
  }
  return into;
};

/** The unknowns any fact of a model holds, by key. */
const givenUnknowns = (model: Model) => {
  const found = new Map<string, Unknown>();
  for (const facts of (model.base ?? model).facts.values()) {
    for (const tuple of facts.values()) {
      unknownsIn(tuple, found);
    }
  }
  return new Set(found.keys());
};

/** A term with each value in it, outside its variables, replaced. */
const replaceData = (
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
const occurs = (unknown: Unknown, value: unknown): boolean => {
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

/**
 * Makes two values one, as a key says two rows with the same key are: each
 * unknown the group invented takes the value at its place in the other, or
 * when both are such unknowns, the one that sorts first. False when they
 * differ anywhere else, and so cannot be one.
 */
const unify = (
  model: Model,
  left: unknown,
  right: unknown,
  inventions: Inventions
): boolean => {
  const [a, b] = [settled(left, inventions), settled(right, inventions)];
  if (sameValue(a, b)) {
    return true;
  }
  inventions.given ??= givenUnknowns(model);
  const { given, invented } = inventions;
  const free = (value: unknown): value is Unknown =>
    value instanceof Unknown &&
    invented.has(value.key) &&
    !given.has(value.key);
  if (free(a) || free(b)) {
    // An unknown takes a value that does not hold it, so no unknown ever
    // describes itself: of two the group invented, the one that describes
    // the other takes it, and otherwise the one that sorts after.
    const keeps = (value: unknown, other: unknown) =>
      !free(value) ||
      occurs(value, other) ||
      (free(other) && !occurs(other, value) && compareValues(value, other) < 0);
    const [from, to] = keeps(b, a) ? [a, b] : [b, a];
    if (occurs(from as Unknown, to)) {
      return false;
    }
    inventions.equal.set((from as Unknown).key, to);
    inventions.pending = true;
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length &&
      a.every((item, at) => unify(model, item, b[at], inventions))
    );
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every(
        (key) =>
          Object.hasOwn(b, key) && unify(model, a[key], b[key], inventions)
      )
    );
  }
  return false;
};

/**
 * Whether a derived row can join its relation. A row whose key a different
 * row already has cannot, and is an error, unless the two can be made one:
 * then the key makes them one, and the row is not added on its own.
 */
const keyed = (
  model: Model,
  derivation: Match,
  relation: RelationInfo,
  tuple: Tuple,
  inventions: Inventions | undefined
): boolean | string => {
  const { key, name } = relation;
  if (key === undefined) {
    return true;
  }
  const keyValues = key.map((position) => tuple[position]);
  const tupleKey = valueKey(tuple);
  for (const other of model.relations.get(name)?.lookup(key, keyValues) ?? []) {
    if (valueKey(other) === tupleKey) {
      continue;
    }
    if (inventions !== undefined && unify(model, other, tuple, inventions)) {
      return false;
    }
    const shown = originalName(name);
    return `"${shown}" is keyed by ${JSON.stringify(keyColumns(relation))}, but ${show(derivation.rule.source)} derived ${show([shown, ...tuple])} while ${show([shown, ...other])} holds.`;
  }
  return true;
};

/**
 * Adds a row a rule derived to a relation, once its key allows it, or says
 * why the key does not.
 */
const addDerived = (
  model: Model,
  delta: Map<string, TupleSet>,
  relation: RelationInfo,
  tuple: Tuple,
  derivation: Match,
  inventions: Inventions | undefined
): string | undefined => {
  const row =
    inventions === undefined ? tuple : (settled(tuple, inventions) as Tuple);
  const allowed = keyed(model, derivation, relation, row, inventions);
  if (allowed === true) {
    recordDerived(model, delta, relation.name, row, derivation);
  }
  return typeof allowed === "string" ? allowed : undefined;
};

/**
 * Puts in place what keys made equal: every row of the group that holds an
 * unknown made equal to another value is replaced by the row with that
 * value, which is new. That can make more unknowns equal, so it goes on
 * until nothing more is.
 */
const settleKeys = (
  model: Model,
  relations: ReadonlyMap<string, RelationInfo>,
  delta: Map<string, TupleSet>,
  inventions: Inventions | undefined
) =>
  Effect.gen(function* () {
    while (inventions?.pending) {
      inventions.pending = false;
      for (const [name, rows] of delta) {
        delta.set(name, settledRows(rows, inventions));
      }
      for (const relation of relations.values()) {
        yield* resettle(model, relation, delta, inventions);
      }
    }
  });

const settledRows = (rows: TupleSet, inventions: Inventions) => {
  const current = new TupleSet();
  for (const tuple of rows.values()) {
    current.add(settled(tuple, inventions) as Tuple);
  }
  return current;
};

/**
 * Replaces each row of a relation that holds an unknown a key made equal to
 * another value. Only a derived row can hold one the group invented.
 */
const resettle = (
  model: Model,
  relation: RelationInfo,
  delta: Map<string, TupleSet>,
  inventions: Inventions
) =>
  Effect.gen(function* () {
    const rows = model.relations.get(relation.name);
    const derivations = model.derivations.get(relation.name);
    for (const tuple of [...(rows?.values() ?? [])]) {
      const row = settled(tuple, inventions) as Tuple;
      const derivation = derivations?.get(valueKey(tuple));
      if (
        valueKey(row) !== valueKey(tuple) &&
        derivation !== undefined &&
        "vars" in derivation
      ) {
        rows?.delete(tuple);
        const problem = addDerived(
          model,
          delta,
          relation,
          row,
          derivation,
          inventions
        );
        if (problem !== undefined) {
          return yield* logicError(problem);
        }
      }
    }
  });

/**
 * Explains each row of a group again, once keys have made unknowns equal.
 * A row a key replaced came about as another row, so the answer that gave
 * it may not give it, and two rows that became one may each have rested on
 * the other. So the rules run again on the rows there are, from the facts
 * up, round by round: each row is explained by the first answer that gives
 * it, which rests only on rows explained before it. A rule that invents
 * gives the rows of its head with what keys made its unknowns equal to.
 */
const justify = (
  model: Model,
  rules: readonly CompiledRule[],
  relations: ReadonlyMap<string, RelationInfo>,
  inventions: Inventions
) =>
  Effect.gen(function* () {
    const final = new Map<string, TupleSet>();
    const fresh = new Map<string, Map<string, Derivation>>();
    let delta = givenRows(model, relations, final, fresh);
    // Answers that give a row as it is come first. Only a row they leave
    // unexplained is explained through what a key made equal.
    for (const throughKeys of [false, true]) {
      const step = explaining(model, inventions, final, fresh, throughKeys);
      yield* firstRound(model, rules, step, delta);
      yield* rounds(model, rules, step, delta);
      delta = new Map();
    }
    for (const [name, rows] of final) {
      model.relations.set(name, rows);
      model.derivations.set(
        name,
        keptFor(rows, fresh.get(name), model.derivations.get(name))
      );
    }
  });

/**
 * Puts each relation of a group back to its facts, for its rows to be
 * explained again, and keeps the rows it has in `final`.
 */
const givenRows = (
  model: Model,
  relations: ReadonlyMap<string, RelationInfo>,
  final: Map<string, TupleSet>,
  fresh: Map<string, Map<string, Derivation>>
) => {
  const delta = new Map<string, TupleSet>();
  for (const name of relations.keys()) {
    const rows = model.relations.get(name) ?? new TupleSet();
    final.set(name, rows);
    fresh.set(name, new Map());
    const given = new TupleSet();
    const facts = model.base === undefined ? model.facts.get(name) : EMPTY;
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

/** New explanations, and an old one for a row no answer gives. */
const keptFor = (
  rows: TupleSet,
  fresh: Map<string, Derivation> = new Map(),
  old: ReadonlyMap<string, Derivation> | undefined = undefined
) => {
  for (const tuple of rows.values()) {
    const kept = old?.get(valueKey(tuple));
    if (!fresh.has(valueKey(tuple)) && kept !== undefined) {
      fresh.set(valueKey(tuple), kept);
    }
  }
  return fresh;
};

/** What a rule does with some answers of its body, in a round. */
type Step = (
  rule: CompiledRule,
  answers: readonly Vars[],
  into: Map<string, TupleSet>
) => LogicEffect<void>;

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
    fresh: Map<string, Map<string, Derivation>>,
    throughKeys: boolean
  ): Step =>
  (rule, answers, into) =>
    Effect.forEach(
      rule.equates ? [] : answers,
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
            if (final.get(relation.name)?.has(tuple)) {
              explainRow(model, into, fresh, relation.name, tuple, derivation);
            }
          }
        }),
      { discard: true }
    );

/** Explains a row of a group's final rows, unless something already does. */
const explainRow = (
  model: Model,
  into: Map<string, TupleSet>,
  fresh: Map<string, Map<string, Derivation>>,
  relation: string,
  tuple: Tuple,
  derivation: Match
) => {
  if (model.relations.get(relation)?.add(tuple)) {
    getOrCreate(into, relation, () => new TupleSet()).add(tuple);
    fresh.get(relation)?.set(valueKey(tuple), derivation);
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
      yield* step(rule, yield* matches(model, rule.body), into);
    }
  });

/**
 * Gives a step, round after round, the answers that use rows the round
 * before added, until a round adds none. `after` runs on what each round
 * added.
 */
const rounds = (
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
        yield* step(
          rule,
          yield* changedAnswers(model, rule.body, current),
          next
        );
      }
      yield* after(next);
      current = next;
    }
  });

const deriveHeads = (
  model: Model,
  rule: CompiledRule,
  answers: readonly Vars[],
  delta: Map<string, TupleSet>,
  inventions?: Inventions
) =>
  Effect.gen(function* () {
    const derived: [Tuple, Vars][] = [];
    for (const vars of answers) {
      const tuple = yield* tupleOf(model, rule.head.args, vars);
      derived.push([yield* derivedRow(rule, tuple), vars]);
    }
    for (const [tuple, vars] of derived) {
      const problem = addDerived(
        model,
        delta,
        rule.head.relation,
        tuple,
        { rule, vars },
        inventions
      );
      if (problem !== undefined) {
        return yield* logicError(problem);
      }
    }
  });

const hasChanges = (delta: ReadonlyMap<string, TupleSet>) =>
  [...delta.values()].some((changes) => changes.size > 0);

type Body = readonly Literal[];

const deltaPlans = new WeakMap<Body, Map<number, Body>>();

/**
 * A body reordered to start from the goal at `position`, so a round starts
 * from the few new rows instead of scanning everything else first.
 */
const deltaPlan = (body: Body, position: number) => {
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
 * rules or in a change to facts, so every answer it returns uses at least
 * one new row.
 */
export const changedAnswers = (
  model: Model,
  body: Body,
  delta: ReadonlyMap<string, TupleSet>
) =>
  Effect.gen(function* () {
    const out: Vars[] = [];
    for (const [position, literal] of body.entries()) {
      const changes =
        literal instanceof Atom ? delta.get(literal.relation.name) : undefined;
      if (changes === undefined || changes.size === 0) {
        continue;
      }
      const planned = deltaPlan(body, position);
      const changedAt = planned.indexOf(literal);
      const answers = yield* matches(model, planned, NO_VARS, (at) =>
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
   * The matches each rule head has given. A rule's body is a set of
   * matches, so a match that several alternatives of one rule find counts
   * once. Separate rules add up, and so do the relation calls of one head.
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
    const seen = getOrCreate(groups.seen, rule.head, () => new Set<string>());
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
        const answers = yield* changedAnswers(model, rule.body, delta);
        yield* addMatches(model, groups, rule, answers);
      }
      delta = yield* settle(model, groups);
    }
  });

/** An answer of the body of a rule that invents, waiting to be looked at. */
type Trigger = readonly [rule: CompiledRule, vars: Vars];

/**
 * Invents what one answer of a rule says exists: every relation call of its
 * head, at once, with the unknowns that `some` names in place of the
 * variables `exists` lists.
 */
const invent = (
  model: Model,
  [rule, vars]: Trigger,
  delta: Map<string, TupleSet>,
  inventions: Inventions
) =>
  Effect.gen(function* () {
    for (const unknown of yield* inventedBy(model, rule, vars)) {
      inventions.invented.add(unknown.key);
    }
    const rows: [Atom, Tuple][] = [];
    for (const head of headsOf(rule)) {
      const tuple = yield* tupleOf(model, head.args, vars);
      rows.push([head, yield* derivedRow(rule, tuple)]);
    }
    for (const [head, tuple] of rows) {
      const problem = addDerived(
        model,
        delta,
        head.relation,
        tuple,
        { rule, vars },
        inventions
      );
      if (problem !== undefined) {
        return yield* logicError(problem);
      }
    }
  });

/** The unknowns a rule's head names for an answer of its body. */
const inventedBy = (model: Model, rule: CompiledRule, vars: Vars) =>
  Effect.forEach(rule.invents?.names ?? [], (name) =>
    unknownOf(
      model,
      new LogicForm("some", [new LogicVariable(name), rule.invents?.goal]),
      vars
    )
  );

/**
 * The answers of rules that invent whose heads do not hold yet. What an
 * answer invents is what its head names, so answers that name the same
 * unknowns invent them once.
 */
const active = (
  model: Model,
  triggers: readonly Trigger[],
  fired: Set<string>
) =>
  Effect.gen(function* () {
    const ready: Trigger[] = [];
    for (const trigger of triggers) {
      const [rule, vars] = trigger;
      const named = yield* inventedBy(model, rule, vars);
      const id = named.map((unknown) => unknown.key).join("\u0000");
      if (fired.has(id)) {
        continue;
      }
      fired.add(id);
      const check = rule.invents?.check ?? [];
      if ((yield* matches(model, check, vars)).length === 0) {
        ready.push(trigger);
      }
    }
    return ready;
  });

/**
 * Runs the rules of relations that depend on each other until none adds a
 * row. Rules that invent wait until the others are done, and then every one
 * whose head does not hold invents, all at once; the others then run on
 * what they invented, and so on until nothing is invented.
 */
const evaluate = (model: Model, { members, rules }: Stratum) =>
  Effect.gen(function* () {
    if (rules.some((rule) => rule.aggregates.length > 0)) {
      return yield* evaluateAggregates(model, rules);
    }
    const relations = headRelations(rules, members);
    const inventions = inventionsOf(rules);
    const fired = new Set<string>();
    let triggers: Trigger[] = [];
    const run: Step = (rule, answers, into) => {
      if (rule.equates) {
        return equate(model, rule, answers, inventions);
      }
      if (rule.invents === undefined) {
        return deriveHeads(model, rule, answers, into, inventions);
      }
      for (const vars of answers) {
        triggers.push([rule, vars]);
      }
      return Effect.void;
    };
    const settle = (added: Map<string, TupleSet>) =>
      settleKeys(model, relations, added, inventions);
    const delta = new Map<string, TupleSet>();
    yield* firstRound(model, rules, run, delta);
    for (;;) {
      yield* settle(delta);
      yield* rounds(model, rules, run, delta, settle);
      const ready = yield* active(model, triggers, fired);
      triggers = [];
      if (ready.length === 0 || inventions === undefined) {
        if (inventions !== undefined && inventions.equal.size > 0) {
          yield* justify(model, rules, relations, inventions);
        }
        return;
      }
      delta.clear();
      for (const trigger of ready) {
        yield* invent(model, trigger, delta, inventions);
      }
    }
  });

/**
 * Makes the two sides of an equality rule one, for each answer: an unknown
 * the group invented takes the value on the other side, as it does when a
 * key finds two rows with one key. Two values it cannot make one are left
 * as they are, for the invariant the rule stands for to report.
 */
const equate = (
  model: Model,
  rule: CompiledRule,
  answers: readonly Vars[],
  inventions: Inventions | undefined
) =>
  Effect.gen(function* () {
    if (inventions === undefined) {
      return;
    }
    for (const vars of answers) {
      const [left, right] = yield* tupleOf(model, rule.head.args, vars);
      unify(model, left, right, inventions);
    }
  });

/** The relations a group's rules add rows to, by name. */
const headRelations = (
  rules: readonly CompiledRule[],
  members: ReadonlySet<string>
) => {
  const relations = new Map<string, RelationInfo>();
  for (const { relation } of rules.flatMap(headsOf)) {
    if (members.has(relation.name)) {
      relations.set(relation.name, relation);
    }
  }
  return relations;
};

/** What a group invents, when one of its rules does. */
const inventionsOf = (
  rules: readonly CompiledRule[]
): Inventions | undefined =>
  rules.some((rule) => rule.invents !== undefined)
    ? {
        equal: new Map(),
        given: undefined,
        invented: new Set(),
        pending: false,
      }
    : undefined;

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
 * Derives the rows of relations that depend on each other, by running their
 * rules on top of their facts. A relation the rules read is derived when a
 * goal first reads it.
 */
const derive = (model: Model, stratum: Stratum) =>
  Effect.gen(function* () {
    const { members } = stratum;
    for (const name of members) {
      model.state.set(name, "running");
      const facts =
        model.base === undefined ? model.facts.get(name) : undefined;
      model.relations.set(name, facts?.clone() ?? new TupleSet());
    }
    yield* evaluate(model, stratum);
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

/**
 * The row a relation goal matched for an answer. The answer says what the
 * goal's variables are, and the row is the first that fits its arguments
 * with them: a schema among the arguments does not say which row that is.
 */
const matchedRow = (model: Model, atom: Atom, vars: Vars) =>
  Effect.gen(function* () {
    const found = yield* lookup(
      model,
      atom,
      vars,
      rowsOf(model, atom.relation.name)
    );
    for (const tuple of found.tuples) {
      if ((yield* matchRow(model, found, tuple, vars)).length > 0) {
        return tuple;
      }
    }
    return yield* tupleOf(model, atom.args, vars);
  });

/**
 * What a rule's body rested on for one answer: the rows its relation goals
 * matched, each explained in turn, and every other goal as it held, with the
 * answer's values in place of its variables. A goal that computed a value,
 * such as `["=", "?ratio", ["number/divide", "?a", "?b"]]`, shows the
 * arithmetic on the values it was given.
 */
const premises = (
  model: Model,
  { rule, same, vars }: Match
): LogicEffect<unknown[]> =>
  Effect.gen(function* () {
    const out: unknown[] = [];
    for (const literal of rule.body) {
      if (literal instanceof Atom) {
        const tuple = yield* matchedRow(model, literal, vars);
        out.push(yield* explain(model, literal.relation, tuple));
      } else if (isForm(literal, "not")) {
        out.push({ absent: instantiate(literal.parts[0], vars) });
      } else {
        out.push({ check: instantiate(literal, vars) });
      }
    }
    for (const [unknown, value] of same ?? []) {
      out.push({ same: [unknown, value] });
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

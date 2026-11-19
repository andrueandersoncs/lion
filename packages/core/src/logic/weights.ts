/**
 * The algebra of changes: rows with weights, each held for a time.
 *
 * A candidate is one thing that gives a row: a fact, or an answer of a
 * rule's body. A row's weight is the number of its candidates, and the row
 * holds while its weight is above zero. So a change to facts is followed by
 * adding and taking away candidates, and deriving from nothing is the same
 * work for a change that adds every fact.
 *
 * Weights alone cannot follow rows that hold each other up: two rows that
 * each give the other keep a weight of one when the fact under them goes.
 * So time is a column too. A candidate has a level, one more than the
 * highest level of the rows of its own group that its answer used, and zero
 * when it used none, and a row is held from the least level one of its
 * candidates has. Whether a row holds has many solutions when rows give
 * each other, of which the least is meant; the level a row is held from has
 * exactly one, since a candidate's level is above the levels of the rows it
 * used. So a change is followed by repairing levels in order, lowest first:
 * a row whose least level lost its last candidate moves to the level of its
 * next candidate, or goes, and what is settled at one level is never looked
 * at again.
 *
 * A group whose rules invent values, or make values one, needs two things
 * more of time, and gets them from the same column.
 *
 * A rule that invents gives its rows where its head does not hold yet, once
 * the rules that invent nothing are done. So levels are counted in stages:
 * a stage is every level the rules that invent nothing reach, and the
 * answers of a rule that invents are rows too, of a relation of their own.
 * At the end of the stage such a row is first held in, it invents when no
 * row that holds by then gives its head, and what it invents is a candidate
 * at the first level of the next stage. That asks only about lower levels,
 * so it has one solution too.
 *
 * A key or an equality rule makes two values one from some level on: the
 * pair is a row of a relation of its own, and the values every such row
 * joins are written as their least member. A row that holds a value which
 * stops being the least of its class at a level is held until that level,
 * and gives, at that level, the row with the least member in its place. A
 * row that ended is kept beside the rows that hold, so the answers that
 * used it are still there to be counted, and taken away when what gave it
 * goes: an answer is one whose rows were all held at one level. A row that
 * comes beside a row with its key is read from the level after, when the
 * key has made the two one, so no answer finds two rows with one key.
 *
 * What a group keeps is as little as its rules need. A group whose rules
 * read nothing of its own has one level, so its rows keep a weight in their
 * table and nothing else. In any other group a row carries an entry: its
 * candidates by level and its time. How a row came about is not kept: `why`
 * finds the row's candidates when asked, and tells the least at its level.
 */
import { Effect } from "effect";
import { LogicError, logicError } from "@/errors/evaluation";
import { aggregator } from "@/logic/aggregates";
import { type CompiledRule, headsOf, type Literal } from "@/logic/compile";
import { guarded, originalName } from "@/logic/magic";
import { readingOf, type Use } from "@/logic/maintain";
import {
  aggregateKind,
  aggregateProblem,
  answerKey,
  compareAnswers,
  compareMatches,
  complete,
  type Derivation,
  deltaPlan,
  depthOf,
  derivedRow,
  each,
  type Inventions,
  inventedBy,
  justify,
  keyColumns,
  type LogicEffect,
  MAX_LATTICE_ROUNDS,
  type Match,
  type Model,
  matchValues,
  NO_VARS,
  occurs,
  plainRow,
  plainTuple,
  type Reader,
  type Rows,
  replaceData,
  rowProblem,
  rowsOf,
  type Sink,
  selectsAlone,
  startingFacts,
  type Tuple,
  TupleSet,
  tupleOf,
  type Vars,
} from "@/logic/model";
import type { Stratum } from "@/logic/strata";
import {
  Atom,
  callsOf,
  compareValues,
  isForm,
  isGroundValue,
  isPlainObject,
  LogicValue,
  LogicVariable,
  patternParts,
  type RelationInfo,
  sameValue,
  show,
  Unknown,
  valueKey,
} from "@/logic/terms";

/** The level of a row that is not held, and the end of one that never ends. */
export const NEVER = Number.POSITIVE_INFINITY;

/** Marks an entry a level is taking up to settle. */
const TAKEN = -1;

/** How many levels a stage has room for. */
const STAGE = 2 ** 32;

const stageOf = (level: number) => Math.floor(level / STAGE);

/** The last level of a stage, where the rules that invent are asked. */
const endOf = (stage: number) => stage * STAGE + STAGE - 1;

/**
 * The names an answer keeps two levels under: the highest level a row its
 * goals matched can be read from, and the lowest level one of them is held
 * until. No variable has these names.
 */
const FROM = "\u0000from";
const UNTIL = "\u0000until";

/** The relation of the answers of the rule at some place among a group's. */
const TRIGGER = "\u0000trigger^";

/** The relation of the pairs of values a group makes one. */
const EDGE = "\u0000edge";

/**
 * The relation of the answers of rules that share a head and combine their
 * answers: an answer several of them find is one row, and counts once.
 */
const MATCH = "\u0000match^";

/** The name the rows a search found go by while their answers are counted. */
const REACHED = "\u0000reached";

const isHidden = (relation: string) =>
  relation === EDGE ||
  relation.startsWith(TRIGGER) ||
  relation.startsWith(MATCH);

/** A row of a group whose rows have levels, and the candidates that give it. */
export interface Entry {
  /** The level the row is held from, or `NEVER`. */
  from: number;
  readonly key: string;
  /** The least level a candidate has, when `n` is above zero. */
  level: number;
  /** The candidates at higher levels, counted by level. */
  more: Map<number, number> | undefined;
  /** The number of candidates at `level`. */
  n: number;
  /** True while the row is among the rows goals read. */
  placed: boolean;
  /** The level the entry waits to be settled at, or `NEVER`. */
  queued: number;
  readonly relation: string;
  /**
   * The level answers can use the row from: the level it is held from, or
   * the one after when it came beside a row with its key.
   */
  seen: number;
  readonly tuple: Tuple;
  /** The level the row is held until, when a value in it stops being least. */
  until: number;
}

/** Where a row keeps its entry: on the row itself, so finding it costs nothing. */
const ENTRY = Symbol("entry");

const entryOn = (tuple: Tuple) =>
  (tuple as { readonly [ENTRY]?: Entry })[ENTRY];

/** One entry or several under a key: most keys have one. */
type Some = Entry | Entry[];

const NONE: readonly Entry[] = [];

const allOf = (map: ReadonlyMap<string, Some>, key: string) => {
  const had = map.get(key);
  if (had === undefined) {
    return NONE;
  }
  return Array.isArray(had) ? had : [had];
};

const addTo = (map: Map<string, Some>, key: string, entry: Entry) => {
  const had = allOf(map, key);
  if (!had.includes(entry)) {
    map.set(key, had.length === 0 ? entry : [...had, entry]);
  }
};

const takeFrom = (map: Map<string, Some>, key: string, entry: Entry) => {
  const rest = allOf(map, key).filter((other) => other !== entry);
  if (rest.length === 0) {
    map.delete(key);
  } else {
    map.set(key, rest.length === 1 ? (rest[0] as Entry) : rest);
  }
};

/** The values some candidates give one aggregate, each counted. */
interface Tally {
  /** False once a value is not a whole number a running total can hold. */
  exact: boolean;
  n: number;
  total: number;
  readonly values: Map<string, [unknown, number]>;
}

/**
 * The candidates that share the head values a rule does not combine, and
 * the rows their combined values give: one from each level at which the
 * combined values change, held until the next.
 */
interface Fold {
  /** The head values, with null where the head combines. */
  readonly key: Tuple;
  /** For each level, the values its candidates give each aggregate. */
  readonly levels: Map<number, Tally[]>;
  readonly relation: string;
  readonly rule: CompiledRule;
  /** The least level whose candidates changed since the rows were worked out. */
  since: number;
  /** Each row it gives: the level it is from, the row, and the row's key. */
  versions: (readonly [number, Tuple, string])[];
}

/** What an answer that counts once gives the group it is a candidate of. */
interface Answer {
  readonly fold: Fold;
  readonly values: readonly unknown[];
}

/** How a value's least member changes: each level it does, and to what. */
type History = readonly (readonly [number, unknown])[];

/** What a group whose rules invent or make values one keeps besides. */
interface Chase {
  /** The pairs that are held, by the key of each value they join. */
  readonly adjacent: Map<string, Some>;
  /** How each unknown a class writes as another is written, by its own key. */
  readonly history: Map<string, History>;
  /** The rows that hold each unknown, however deep, by its own key. */
  readonly holders: Map<string, Some>;
  /** The candidate each row that ended gives the row it became. */
  readonly images: Map<Entry, readonly [Entry, number]>;
  /** The unknowns the group's rules invented, by their own keys. */
  readonly invented: Set<string>;
  /** The answers of rules that invent whose head no row gave, so they did. */
  readonly inventing: Set<Entry>;
  /** Each value a pair joins, by key. */
  readonly values: Map<string, unknown>;
  /** The answers that invent, by what a row must hold to give their head. */
  readonly watching: Map<string, Some>;
}

/** What a group keeps of its rows between changes. */
export interface Support {
  /** What each answer that counts once gives, by its row. */
  readonly answers: Map<Entry, Answer>;
  readonly chase: Chase | undefined;
  /** The level a row that combines is held until, when a better one comes. */
  readonly ends: Map<Entry, number>;
  /**
   * True for a group whose rules read nothing of its own: every candidate
   * has the lowest level, so a row keeps a weight and no entry.
   */
  readonly flat: boolean;
  /** The candidates of each row that combines, by relation and head values. */
  readonly folds: Map<string, Fold>;
  /** The rows that ended, by relation. */
  readonly past: Map<string, TupleSet>;
  /**
   * The entries that are in no table of rows, by relation and key: a row
   * that waits for its level, and every row of the relations the group
   * keeps for itself.
   */
  readonly waiting: Map<string, Map<string, Entry>>;
}

/** A head of a rule that invents: where it stands, and what a row must match. */
interface Inventor {
  readonly call: number;
  readonly order: number;
  /** The places of the head that hold nothing the rule invents. */
  readonly positions: readonly number[];
}

/** One derivation of a group, or one change followed through it. */
interface Run {
  /** Pairs of rows with one key that cannot be made one. */
  readonly clashes: (readonly [Entry, Entry])[];
  /** The entries whose time is not what their candidates say, by level. */
  readonly dirty: Map<number, Entry[]>;
  /** The groups of candidates whose rows are to be worked out again. */
  readonly folding: Set<Fold>;
  /** True while a group is derived from nothing: nothing was held before. */
  readonly fresh: boolean;
  /** The heads of rules that invent, by the relation they give rows of. */
  readonly inventors: Map<string, Inventor[]>;
  /** The values whose classes are to be worked out again. */
  readonly links: Set<string>;
  readonly model: Model;
  /** How often each row joined the rows that hold, less how often it left. */
  readonly net: Map<string, Map<string, [Tuple, number]>>;
  /** The order of each rule among the group's. */
  readonly order: Map<CompiledRule, number>;
  /** Why the run cannot go on, once a row breaks a key. */
  problem: string | undefined;
  /** The relations the group's rules give rows of, by name. */
  readonly relations: Map<string, RelationInfo>;
  /** Answers that stopped inventing, with the level they invented at. */
  readonly retracting: (readonly [Entry, number])[];
  /** A rule that gave each row of a keyed relation, for a message. */
  readonly rules: Map<string, CompiledRule>;
  /** The heads that several rules of the group share. */
  readonly shared: Set<Atom>;
  /** The answers that invent to ask again, by the stage they are held in. */
  readonly steps: Map<number, Set<Entry>>;
  readonly stratum: Stratum;
  readonly support: Support;
}

/** True for a place of a head that holds something the rule invents. */
const holdsSome = (arg: unknown): boolean =>
  isForm(arg, "some") || (patternParts(arg, false)?.some(holdsSome) ?? false);

/** True for a rule that invents values, or makes values one. */
const makesValues = (rule: CompiledRule) =>
  rule.invents !== undefined || rule.equates === true;

/** The heads that several rules of a group share. */
const sharedHeads = (rules: readonly CompiledRule[]) => {
  const heads = new Set<Atom>();
  const shared = new Set<Atom>();
  for (const { head } of rules) {
    (heads.has(head) ? shared : heads).add(head);
  }
  return shared;
};

const runOf = (
  model: Model,
  stratum: Stratum,
  support: Support,
  fresh = false
): Run => {
  const relations = new Map<string, RelationInfo>();
  const inventors = new Map<string, Inventor[]>();
  for (const [order, rule] of stratum.rules.entries()) {
    for (const [call, head] of headsOf(rule).entries()) {
      const { name } = head.relation;
      if (!stratum.members.has(name)) {
        continue;
      }
      relations.set(name, head.relation);
      if (rule.invents !== undefined) {
        const positions = head.args.flatMap((arg, at) =>
          holdsSome(arg) ? [] : [at]
        );
        inventors.set(name, [
          ...(inventors.get(name) ?? []),
          { call, order, positions },
        ]);
      }
    }
  }
  return {
    clashes: [],
    dirty: new Map(),
    folding: new Set(),
    fresh,
    inventors,
    links: new Set(),
    model,
    net: new Map(),
    order: new Map(stratum.rules.map((rule, at) => [rule, at])),
    problem: undefined,
    relations,
    retracting: [],
    rules: new Map(),
    shared: sharedHeads(stratum.rules),
    steps: new Map(),
    stratum,
    support,
  };
};

/** Adds candidates at a level to an entry, or takes them away. */
const bump = (entry: Entry, level: number, by: number) => {
  if (entry.n === 0 && entry.more === undefined) {
    entry.level = level;
    entry.n = by;
    return;
  }
  if (level === entry.level) {
    entry.n += by;
    if (entry.n === 0) {
      promote(entry);
    }
    return;
  }
  const more = entry.more ?? new Map<number, number>();
  if (level < entry.level) {
    more.set(entry.level, entry.n);
    entry.level = level;
    entry.n = by;
  } else {
    const next = (more.get(level) ?? 0) + by;
    if (next === 0) {
      more.delete(level);
    } else {
      more.set(level, next);
    }
  }
  entry.more = more.size === 0 ? undefined : more;
};

/** Moves an entry whose least level has no candidate left to its next one. */
const promote = (entry: Entry) => {
  const { more } = entry;
  if (more === undefined) {
    return;
  }
  let least = NEVER;
  for (const level of more.keys()) {
    least = Math.min(least, level);
  }
  entry.level = least;
  entry.n = more.get(least) ?? 0;
  more.delete(least);
  entry.more = more.size === 0 ? undefined : more;
};

/** The level an entry's candidates say it is held from. */
const wanted = (entry: Entry) => (entry.n > 0 ? entry.level : NEVER);

/** The parts a value is made of, where a value in it can stand. */
const partsOf = (value: unknown): readonly unknown[] => {
  if (value instanceof Unknown) {
    return [value.goal];
  }
  if (value instanceof LogicValue) {
    return value.parts;
  }
  if (Array.isArray(value)) {
    return value;
  }
  return isPlainObject(value) ? Object.values(value) : [];
};

/**
 * The first level at which a value in a value stops being the least member
 * of its class, however deep it stands, or `NEVER`.
 */
const endIn = (chase: Chase, value: unknown): number => {
  let until =
    value instanceof Unknown
      ? (chase.history.get(value.key)?.[0]?.[0] ?? NEVER)
      : NEVER;
  for (const part of typeof value === "object" ? partsOf(value) : []) {
    until = Math.min(until, endIn(chase, part));
  }
  return until;
};

/** The unknowns a value holds, however deep, by their own keys. */
const unknownsIn = (value: unknown, into: Set<string>) => {
  if (value instanceof Unknown) {
    into.add(value.key);
  }
  for (const part of typeof value === "object" ? partsOf(value) : []) {
    unknownsIn(part, into);
  }
  return into;
};

/**
 * The level a row is held until: the first at which a value it holds stops
 * being the least member of its class, or at which its group's combined
 * values change, or `NEVER`.
 */
const ending = ({ support }: Run, entry: Entry) => {
  const { chase, ends } = support;
  const until = ends.size === 0 ? NEVER : (ends.get(entry) ?? NEVER);
  return chase === undefined ||
    chase.history.size === 0 ||
    isHidden(entry.relation)
    ? until
    : Math.min(until, endIn(chase, entry.tuple));
};

const setOf = (sets: Map<string, TupleSet>, relation: string) => {
  let rows = sets.get(relation);
  if (rows === undefined) {
    rows = new TupleSet();
    sets.set(relation, rows);
  }
  return rows;
};

/** The rows of a relation that hold, and the ones that ended. */
class Both implements Rows {
  private readonly held: Rows;
  private readonly past: Rows;

  constructor(held: Rows, past: Rows) {
    this.held = held;
    this.past = past;
  }

  *lookup(positions: readonly number[], values: readonly unknown[]) {
    yield* this.held.lookup(positions, values);
    yield* this.past.lookup(positions, values);
  }
}

/** Every row of one of a group's relations, when some of them ended. */
const everOf = ({ model, support }: Run, name: string): Rows | undefined => {
  const past = support.past.get(name);
  return past === undefined || past.size === 0
    ? undefined
    : new Both(rowsOf(model, name), past);
};

/** The rows of a keyed relation that have a row's key: it, and any other. */
const withKeyOf = (run: Run, entry: Entry) => {
  const key =
    run.support.chase === undefined
      ? undefined
      : run.relations.get(entry.relation)?.key;
  if (key === undefined) {
    return [];
  }
  const rows = everOf(run, entry.relation) ?? rowsOf(run.model, entry.relation);
  return rows.lookup(
    key,
    key.map((position) => entry.tuple[position])
  );
};

/**
 * The level answers can use a row from. A row that comes while another row
 * has its key is read from the level after: by then the key has made the
 * two one, so no answer finds both.
 */
const seenFrom = (run: Run, entry: Entry, from: number) => {
  for (const tuple of from === NEVER ? [] : withKeyOf(run, entry)) {
    const other = entryOn(tuple);
    const beside = other !== undefined && other !== entry && other.placed;
    if (beside && other.from <= from && other.until > from) {
      return from + 1;
    }
  }
  return from;
};

/** The time a row should have, by its candidates and what it holds. */
const timeOf = (run: Run, entry: Entry) => {
  const from = wanted(entry);
  const until = ending(run, entry);
  // A row that is never held is never read: nothing comes beside it.
  const seen = from < until ? seenFrom(run, entry, from) : from;
  return [from, until, seen] as const;
};

/** The first level at which a row's time is not what it should be. */
const offAt = (
  entry: Entry,
  [from, until, seen]: readonly [number, number, number]
) => {
  const first = from === entry.from ? NEVER : Math.min(from, entry.from);
  const second = until === entry.until ? NEVER : Math.min(until, entry.until);
  const third = seen === entry.seen ? NEVER : Math.min(seen, entry.seen);
  return Math.min(first, second, third);
};

/** Notes an entry whose time is not what its candidates and values say. */
const mark = (run: Run, entry: Entry) => {
  const { chase, ends } = run.support;
  // Most rows never end: only their candidates say when they are held.
  if (chase === undefined && ends.size === 0 && wanted(entry) === entry.from) {
    return;
  }
  const level = offAt(entry, timeOf(run, entry));
  if (level === NEVER || entry.queued === level) {
    return;
  }
  entry.queued = level;
  const waiting = run.dirty.get(level);
  if (waiting === undefined) {
    run.dirty.set(level, [entry]);
  } else {
    waiting.push(entry);
  }
};

const waitingOf = ({ waiting }: Support, relation: string) => {
  let found = waiting.get(relation);
  if (found === undefined) {
    found = new Map();
    waiting.set(relation, found);
  }
  return found;
};

/** The entry a group has for a row, wherever the row is. */
const entryAt = ({ model, support }: Run, relation: string, key: string) => {
  const held = isHidden(relation)
    ? undefined
    : (model.relations.get(relation)?.get(key) ??
      support.past.get(relation)?.get(key));
  return held === undefined
    ? support.waiting.get(relation)?.get(key)
    : entryOn(held);
};

/**
 * The entry of a row, made when the row has none. A row that is not the
 * group's own, as a fact's is not, is copied, since the entry is kept on it.
 */
const entryOf = (
  run: Run,
  relation: string,
  tuple: Tuple,
  key: string,
  own: boolean
) => {
  const found = entryAt(run, relation, key);
  if (found !== undefined) {
    return found;
  }
  const entry: Entry = {
    from: NEVER,
    key,
    level: 0,
    more: undefined,
    n: 0,
    placed: false,
    queued: NEVER,
    relation,
    seen: NEVER,
    tuple: own ? tuple : [...tuple],
    until: NEVER,
  };
  Object.defineProperty(entry.tuple, ENTRY, { value: entry, writable: true });
  waitingOf(run.support, relation).set(key, entry);
  const { chase } = run.support;
  if (chase !== undefined && !isHidden(relation)) {
    for (const unknown of unknownsIn(tuple, new Set())) {
      addTo(chase.holders, unknown, entry);
    }
  }
  return entry;
};

/** Forgets an entry that nothing gives any more. */
const drop = ({ support }: Run, entry: Entry) => {
  const waiting = support.waiting.get(entry.relation);
  if (waiting?.get(entry.key) === entry) {
    waiting.delete(entry.key);
  }
  const { chase } = support;
  if (chase !== undefined && !isHidden(entry.relation)) {
    for (const unknown of unknownsIn(entry.tuple, new Set())) {
      takeFrom(chase.holders, unknown, entry);
    }
  }
  chase?.inventing.delete(entry);
  chase?.images.delete(entry);
  support.answers.delete(entry);
  support.ends.delete(entry);
};

/**
 * The answer with the time of a row one of its goals matched: undefined
 * when the rows it matched could never all be read at one level.
 */
const during = (
  vars: Vars,
  { seen, until }: Entry,
  fresh: boolean
): Vars | undefined => {
  const since = (vars.get(FROM) as number | undefined) ?? -1;
  const before = (vars.get(UNTIL) as number | undefined) ?? NEVER;
  const first = Math.max(since, seen);
  const last = Math.min(before, until);
  if (first >= last) {
    return;
  }
  if (first === since && last === before) {
    return vars;
  }
  // An answer nothing else holds yet is written on, not copied.
  const next = fresh ? (vars as Map<string, unknown>) : new Map(vars);
  next.set(FROM, first);
  return last === NEVER ? next : next.set(UNTIL, last);
};

/** The level of the candidate an answer is: above the rows it used. */
const levelOf = (vars: Vars) => {
  const from = vars.get(FROM) as number | undefined;
  return from === undefined ? 0 : from + 1;
};

/** An answer without the levels kept on it. */
const bare = (vars: Vars): Vars =>
  vars.has(FROM)
    ? new Map([...vars].filter(([name]) => name !== FROM && name !== UNTIL))
    : vars;

/** Notes that a row joined the rows that hold, or left them. */
const moved = (
  run: Run,
  relation: string,
  key: string,
  tuple: Tuple,
  by: number
) => {
  if (run.fresh || isHidden(relation)) {
    return;
  }
  let rows = run.net.get(relation);
  if (rows === undefined) {
    rows = new Map();
    run.net.set(relation, rows);
  }
  const [, had] = rows.get(key) ?? [tuple, 0];
  rows.set(key, [tuple, had + by]);
};

const keyMessage = (
  relation: RelationInfo,
  rule: CompiledRule | undefined,
  tuple: Tuple,
  other: Tuple
) => {
  const shown = originalName(relation.name);
  return (rule?.aggregates.length ?? 0) > 0
    ? `"${shown}" is keyed by ${JSON.stringify(keyColumns(relation))}, but it would hold ${show([shown, ...tuple])} and ${show([shown, ...other])}, which differ in a column that does not merge.`
    : `"${shown}" is keyed by ${JSON.stringify(keyColumns(relation))}, but ${show(rule?.source)} derived ${show([shown, ...tuple])} while ${show([shown, ...other])} holds.`;
};

const ruleName = (relation: string, key: string) => `${relation}\u0000${key}`;

/**
 * Says why a row that joined a keyed relation cannot stay: another row has
 * its key. Where rules invent, rows with one key are made one instead.
 */
const keyProblem = (run: Run, relation: string, key: string) => {
  const info = run.relations.get(relation);
  const rows = run.model.relations.get(relation);
  const tuple = rows?.get(key);
  if (
    info?.key === undefined ||
    rows === undefined ||
    tuple === undefined ||
    run.support.chase !== undefined
  ) {
    return;
  }
  const values = info.key.map((position) => tuple[position]);
  for (const other of rows.lookup(info.key, values)) {
    if (other !== tuple) {
      const rule = run.rules.get(ruleName(relation, key));
      return keyMessage(info, rule, tuple, other);
    }
  }
  return;
};

/**
 * Gives a row a candidate at a level, or takes one away. In a group with
 * one level the row's table counts it, and the row joins or leaves at once.
 * Anywhere else the row's entry counts it, and its level is settled later.
 */
const weigh = (
  run: Run,
  relation: string,
  tuple: Tuple,
  key: string,
  level: number,
  by: number,
  own = true
) => {
  if (!run.support.flat) {
    const entry = entryOf(run, relation, tuple, key, own);
    bump(entry, level, by);
    mark(run, entry);
    return entry;
  }
  const went = setOf(run.model.relations, relation).weigh(key, tuple, by);
  if (went !== 0) {
    moved(run, relation, key, tuple, went);
  }
  if (went > 0 && run.fresh) {
    run.problem ??= keyProblem(run, relation, key);
  }
  return;
};

/** Remembers a rule that gave a row of a keyed relation. */
const ruleFor = (
  run: Run,
  relation: string,
  key: string,
  rule: CompiledRule | undefined
) => {
  if (rule !== undefined && run.relations.get(relation)?.key !== undefined) {
    run.rules.set(ruleName(relation, key), rule);
  }
};

/**
 * The pairs of values that differ where two values do, when making each
 * pair one would make the two values one: false when they differ somewhere
 * no unknown stands.
 */
const pairsOf = (
  a: unknown,
  b: unknown,
  into: (readonly [unknown, unknown])[]
): boolean => {
  if (sameValue(a, b)) {
    return true;
  }
  if (a instanceof Unknown || b instanceof Unknown) {
    into.push([a, b]);
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length && a.every((item, at) => pairsOf(item, b[at], into))
    );
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every(
        (key) => Object.hasOwn(b, key) && pairsOf(a[key], b[key], into)
      )
    );
  }
  return false;
};

/** The unknowns a value holds, not looking into what they describe. */
const givenIn = (value: unknown, into: Set<string>) => {
  if (value instanceof Unknown) {
    into.add(value.key);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      givenIn(item, into);
    }
  } else if (isPlainObject(value)) {
    for (const item of Object.values(value)) {
      givenIn(item, into);
    }
  }
  return into;
};

/** True when a row holds an unknown, not looking into what unknowns describe. */
export const holdsUnknown = (tuple: Tuple) =>
  tuple.some(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      givenIn(value, new Set()).size > 0
  );

/**
 * The unknowns any fact holds, by their own keys: they are given, not
 * invented. Found when first asked for, and kept until a fact that holds
 * one is added or taken away.
 */
const givenOf = (model: Model) => {
  const home = model.base ?? model;
  if (home.given === undefined) {
    const found = new Set<string>();
    for (const facts of home.facts.values()) {
      for (const tuple of facts.values()) {
        for (const value of tuple) {
          if (typeof value === "object" && value !== null) {
            givenIn(value, found);
          }
        }
      }
    }
    home.given = found;
  }
  return home.given;
};

/**
 * True for a value a class can write as another: an unknown the group's
 * rules invented, which no fact holds.
 */
const isFree = (run: Run, value: unknown): value is Unknown =>
  value instanceof Unknown &&
  (run.support.chase?.invented.has(value.key) ?? false) &&
  !givenOf(run.model).has(value.key);

/**
 * The order the least member of a class is chosen by: a value the group
 * did not invent, else the unknown that nests the fewest unknowns, else the
 * one that sorts first.
 */
const before = (run: Run, a: unknown, b: unknown) => {
  const [free, other] = [isFree(run, a), isFree(run, b)];
  if (free !== other) {
    return other;
  }
  return ((free ? depthOf(a) - depthOf(b) : 0) || compareValues(a, b)) < 0;
};

/** Gives the pair of two values a candidate at a level, or takes one away. */
const weighPair = (
  run: Run,
  a: unknown,
  b: unknown,
  level: number,
  by: number
) => {
  // The same row whichever value comes first.
  const pair = valueKey(a) < valueKey(b) ? [a, b] : [b, a];
  weigh(run, EDGE, pair, valueKey(pair), level, by);
};

const tallyOf = (): Tally => ({
  exact: true,
  n: 0,
  total: 0,
  values: new Map(),
});

/** Adds what a candidate gives each aggregate of its group, or takes it away. */
const tally = (
  run: Run,
  { fold, values }: Answer,
  level: number,
  by: number
) => {
  let tallies = fold.levels.get(level);
  if (tallies === undefined) {
    tallies = values.map(tallyOf);
    fold.levels.set(level, tallies);
  }
  for (const [at, value] of values.entries()) {
    const kept = tallies[at] as Tally;
    const key = valueKey(value);
    const [, had] = kept.values.get(key) ?? [value, 0];
    if (had + by === 0) {
      kept.values.delete(key);
    } else {
      kept.values.set(key, [value, had + by]);
    }
    kept.n += by;
    kept.total += typeof value === "number" ? by * value : 0;
    kept.exact &&=
      Number.isSafeInteger(value) && Number.isSafeInteger(kept.total);
  }
  if ((tallies[0]?.n ?? 0) === 0) {
    fold.levels.delete(level);
  }
  fold.since = Math.min(fold.since, level);
  run.folding.add(fold);
};

/** An answer as a row: the values of its variables, by name. */
const answerRow = (vars: Vars): Tuple =>
  [...bare(vars)].sort(([a], [b]) => (a < b ? -1 : 1)).flat();

const foldName = (relation: string, key: Tuple) =>
  `${relation}\u0000${valueKey(key)}`;

/**
 * Counts an answer of a rule that combines as a candidate of its group: the
 * answers that share the head values the rule does not combine. An answer
 * that several rules with one head find is a row of its own, so it counts
 * once.
 */
const combine = (run: Run, rule: CompiledRule, vars: Vars, by: number) =>
  Effect.gen(function* () {
    const { support } = run;
    const relation = rule.head.relation.name;
    const { key, values } = yield* matchValues(run.model, rule, vars);
    const name = foldName(relation, key);
    let fold = support.folds.get(name);
    if (fold === undefined) {
      fold = {
        key,
        levels: new Map(),
        relation,
        rule,
        since: NEVER,
        versions: [],
      };
      support.folds.set(name, fold);
    }
    const answer = { fold, values };
    const level = levelOf(vars);
    if (!run.shared.has(rule.head)) {
      tally(run, answer, level, by);
      return;
    }
    const order = run.stratum.rules.findIndex(
      (other) => other.head === rule.head
    );
    const tuple = answerRow(vars);
    const row = weigh(
      run,
      `${MATCH}${order}`,
      tuple,
      valueKey(tuple),
      level,
      by
    ) as Entry;
    const had = support.answers.get(row);
    if (by > 0) {
      // What the answer gives may be other than it gave before a change.
      if (had !== undefined && row.placed) {
        tally(run, had, row.from, -1);
        tally(run, answer, row.from, 1);
      }
      support.answers.set(row, answer);
    }
  });

/** The values some candidates give an aggregate, each as often as it is given. */
const given = (kind: string, { values: counted }: Tally) => {
  const repeats = ["collect", "count", "mean", "sum"].includes(kind);
  const values: unknown[] = [];
  for (const [value, times] of counted.values()) {
    for (let left = repeats ? times : 1; left > 0; left -= 1) {
      values.push(value);
    }
  }
  return values;
};

/**
 * What an aggregate gives for the candidates of a group's lowest level. A
 * count, and a sum or mean of whole numbers, are kept as running totals.
 * Anything else combines the values there are, in sort order, so the result
 * does not depend on the order the candidates came in. Throws what the
 * aggregate cannot combine.
 */
const combined = (rule: CompiledRule, kind: string, kept: Tally) => {
  if (kind === "count") {
    return kept.n;
  }
  if (kept.exact && kind === "sum") {
    return kept.total;
  }
  if (kept.exact && kind === "mean" && kept.n > 0) {
    return kept.total / kept.n;
  }
  const values = given(kind, kept).sort(compareValues);
  const problem = aggregateProblem(rule, kind, values);
  if (problem !== undefined) {
    throw new LogicError({ message: problem });
  }
  return aggregator(kind).fold(values);
};

/**
 * What an aggregate that recurses gives once the candidates of a higher
 * level join what the lower levels gave: its value only moves one way.
 */
const joined = (
  rule: CompiledRule,
  kind: string,
  current: unknown,
  kept: Tally
) => {
  const values = given(kind, kept);
  const problem = aggregateProblem(rule, kind, [current, ...values]);
  if (problem !== undefined) {
    throw new LogicError({ message: problem });
  }
  const { fold, join } = aggregator(kind);
  return join === undefined
    ? fold([current, ...values])
    : values.reduce(join, current);
};

/**
 * What a group's candidates up to a level combine to, as a row, and under
 * `running` what each aggregate gave: the candidates of the level join
 * what the lower levels gave, when there are lower ones.
 */
const rowAt = (
  fold: Fold,
  level: number,
  running: unknown[],
  first: boolean
): Tuple => {
  const { key, rule } = fold;
  const tuple = [...key];
  for (const [at, position] of rule.aggregates.entries()) {
    const kind = aggregateKind(rule, position);
    const kept = (fold.levels.get(level) as Tally[])[at] as Tally;
    running[at] = first
      ? combined(rule, kind, kept)
      : joined(rule, kind, running[at], kept);
    tuple[position] = running[at];
  }
  const problem = rowProblem(rule, tuple);
  if (problem !== undefined) {
    throw problem;
  }
  return tuple;
};

/**
 * Says how long each row a group gives is held: until the level of the row
 * that comes after it. The rows before `from` are as they were.
 */
const endVersions = (run: Run, fold: Fold, from: number) => {
  const { ends } = run.support;
  for (const [at, [, , key]] of fold.versions.entries()) {
    const entry = at < from ? undefined : entryAt(run, fold.relation, key);
    const until = fold.versions[at + 1]?.[0];
    if (entry === undefined) {
      continue;
    }
    if (until === undefined) {
      ends.delete(entry);
    } else {
      ends.set(entry, until);
    }
    mark(run, entry);
  }
};

/**
 * Works out the rows a group of candidates gives: one from each level at
 * which what its candidates up to there combine to changes, held until the
 * next. Only the levels from the first that changed are worked out again.
 * Rows it gave before and gives no more lose its candidate. Throws what an
 * aggregate cannot combine.
 */
const refold = (run: Run, fold: Fold) => {
  const { support } = run;
  const { key, relation, rule, since } = fold;
  fold.since = NEVER;
  const versions = fold.versions.filter(([level]) => level < since);
  const before = new Map(
    fold.versions
      .slice(versions.length)
      .map((version) => [`${version[0]} ${version[2]}`, version])
  );
  const from = Math.max(0, versions.length - 1);
  let last = versions.at(-1)?.[1];
  const running = rule.aggregates.map((position) => last?.[position]);
  const levels = [...fold.levels.keys()].filter((level) => level >= since);
  for (const level of levels.sort((a, b) => a - b)) {
    const row = rowAt(fold, level, running, last === undefined);
    if (sameValue(last, row)) {
      continue;
    }
    last = row;
    const rowKey = valueKey(row);
    const name = `${level} ${rowKey}`;
    const had = before.get(name);
    before.delete(name);
    if (had === undefined) {
      ruleFor(run, relation, rowKey, rule);
      weigh(run, relation, row, rowKey, level, 1);
    }
    versions.push(had ?? [level, row, rowKey]);
  }
  for (const [level, tuple, rowKey] of before.values()) {
    const entry = entryAt(run, relation, rowKey);
    if (entry !== undefined) {
      support.ends.delete(entry);
    }
    weigh(run, relation, tuple, rowKey, level, -1);
  }
  fold.versions = versions;
  if (!support.flat) {
    endVersions(run, fold, from);
  }
  if (versions.length === 0) {
    support.folds.delete(foldName(relation, key));
  }
};

/** What names the answers of a rule that invents: what a row must hold. */
const watchKey = ({ call, order, positions }: Inventor, tuple: Tuple) =>
  `${order}\u0000${call}\u0000${valueKey(positions.map((at) => tuple[at]))}`;

/** The rule whose answers a row of a relation the group keeps for itself is. */
const ruleOf = ({ stratum }: Run, { relation }: Entry) =>
  stratum.rules[Number(relation.slice(TRIGGER.length))] as CompiledRule;

/** What an unknown says exists, as relation goals its own variables are free in. */
const saidBy = (unknown: unknown) => callsOf((unknown as Unknown).goal) ?? [];

/**
 * The rows the head of a rule that invents says exist for an answer, with
 * the unknowns the answer names in them: what its first unknown describes,
 * with each unknown in place of its variable.
 */
const headRows = (run: Run, asking: Entry) =>
  Effect.gen(function* () {
    const rule = ruleOf(run, asking);
    const own = new Map(
      (rule.invents?.names ?? []).map((name, at) => [name, asking.tuple[at]])
    );
    const rows: (readonly [string, Tuple])[] = [];
    for (const call of saidBy(asking.tuple[0])) {
      const tuple = yield* tupleOf(run.model, call.args, own);
      rows.push([call.relation.name, yield* derivedRow(rule, tuple)]);
    }
    return rows;
  });

/**
 * Counts an answer of a rule that invents as a candidate of the row that
 * names what it would invent: answers that name the same unknowns are one
 * row, and invent them once. The row is asked again whenever a row comes or
 * goes that could give its head.
 */
const trigger = (run: Run, rule: CompiledRule, vars: Vars, by: number) =>
  Effect.gen(function* () {
    const chase = run.support.chase as Chase;
    const order = run.order.get(rule) ?? 0;
    const named = yield* inventedBy(run.model, rule, vars);
    const key = named.map((unknown) => unknown.key).join("\u0000");
    const relation = `${TRIGGER}${order}`;
    const known = entryAt(run, relation, key) !== undefined;
    const entry = weigh(run, relation, named, key, levelOf(vars), by) as Entry;
    if (known) {
      return;
    }
    for (const [call, [name, tuple]] of (yield* headRows(
      run,
      entry
    )).entries()) {
      const inventor = run.inventors
        .get(name)
        ?.find((one) => one.order === order && one.call === call);
      if (inventor !== undefined) {
        addTo(chase.watching, watchKey(inventor, tuple), entry);
      }
    }
  });

/** Counts the pairs an equality rule's answer makes one. */
const equate = (run: Run, rule: CompiledRule, vars: Vars, by: number) =>
  Effect.map(tupleOf(run.model, rule.head.args, vars), ([left, right]) => {
    const pairs: (readonly [unknown, unknown])[] = [];
    for (const [a, b] of pairsOf(left, right, pairs) ? pairs : []) {
      weighPair(run, a, b, levelOf(vars), by);
    }
  });

/**
 * A sink that counts each answer of a rule as a candidate: of the row its
 * head gives, of what it would invent, or of the pairs its head makes one.
 * Fails once a row breaks a key.
 */
const give = (run: Run, rule: CompiledRule, by: number): Sink => {
  const { model } = run;
  const relation = rule.head.relation.name;
  /** Counts a row the head gives, and notes the rule that gave it. */
  const row = (tuple: Tuple, vars: Vars) => {
    const key = valueKey(tuple);
    if (by > 0) {
      ruleFor(run, relation, key, rule);
    }
    weigh(run, relation, tuple, key, levelOf(vars), by);
  };
  const one = (vars: Vars) =>
    Effect.gen(function* () {
      if (rule.equates) {
        return yield* equate(run, rule, vars, by);
      }
      if (rule.invents !== undefined) {
        return yield* trigger(run, rule, vars, by);
      }
      if (rule.aggregates.length > 0) {
        return yield* combine(run, rule, vars, by);
      }
      const made = yield* tupleOf(model, rule.head.args, vars);
      row(yield* derivedRow(rule, made), vars);
    });
  const plain = rule.aggregates.length === 0 && !makesValues(rule);
  return (answers) =>
    Effect.gen(function* () {
      for (const vars of answers) {
        // Most answers give a row with nothing to work out.
        const tuple = plain ? plainRow(rule, vars) : undefined;
        if (tuple === undefined) {
          yield* one(vars);
        } else {
          row(tuple, vars);
        }
      }
      if (run.problem !== undefined) {
        return yield* logicError(run.problem);
      }
    });
};

/** Where each goal of a planned body stood in the rule, and what it reads. */
interface Place {
  readonly index: number;
  readonly name: string | undefined;
}

const PLACES = new WeakMap<
  readonly Literal[],
  WeakMap<readonly Literal[], readonly Place[]>
>();

const placesOf = (body: readonly Literal[], planned: readonly Literal[]) => {
  let known = PLACES.get(body);
  if (known === undefined) {
    known = new WeakMap();
    PLACES.set(body, known);
  }
  let places = known.get(planned);
  if (places === undefined) {
    places = planned.map((literal) => ({
      index: body.indexOf(literal),
      name: literal instanceof Atom ? literal.relation.name : undefined,
    }));
    known.set(planned, places);
  }
  return places;
};

/** Rows that change together, by relation: as sets, and by the row itself. */
interface Batch {
  readonly ids: Map<string, Set<Tuple>>;
  readonly rows: Map<string, TupleSet>;
}

const batchOf = (
  rows: Iterable<readonly [name: string, tuple: Tuple, key?: string]>
): Batch => {
  const batch: Batch = { ids: new Map(), rows: new Map() };
  for (const [name, tuple, key] of rows) {
    let set = batch.rows.get(name);
    let ids = batch.ids.get(name);
    if (set === undefined || ids === undefined) {
      set = new TupleSet();
      ids = new Set();
      batch.rows.set(name, set);
      batch.ids.set(name, ids);
    }
    if (set.addKeyed(key ?? valueKey(tuple), tuple)) {
      ids.add(tuple);
    }
  }
  return batch;
};

/**
 * What the goals of a body read while its answers are counted: a goal of
 * the group being followed gives the answer the time of the row it
 * matched. With a batch, the goal at `delta` reads only the batch's rows,
 * and an answer is dropped when a goal that stood before it in the rule
 * matched a row of the batch: that goal finds the answer on its own turn,
 * so every answer that uses the batch is found once.
 */
const readerOf = (
  run: Run,
  body: readonly Literal[],
  planned: readonly Literal[] = body,
  batch?: Batch,
  delta = -1
): Reader => {
  const places = placesOf(body, planned);
  const changedAt = delta < 0 ? -1 : planned.indexOf(body[delta] as Literal);
  const owns = places.map(({ name }) =>
    name !== undefined && run.stratum.members.has(name) ? name : undefined
  );
  const rows: Reader["rows"] = (at) => {
    if (at === changedAt) {
      return batch?.rows.get((places[at] as Place).name ?? "");
    }
    const name = owns[at];
    return name === undefined ? undefined : everOf(run, name);
  };
  // A body that reads nothing of the group, and the batch through one goal
  // only, has no row to take a time from and no answer to find twice.
  const twice =
    places.filter(({ name }) => batch?.rows.has(name ?? "")).length > 1;
  if (!(twice || owns.some((name) => name !== undefined))) {
    return { rows };
  }
  return {
    meet: (at, tuple, vars, fresh) => {
      const { index, name } = places[at] as Place;
      if (index < delta && batch?.ids.get(name ?? "")?.has(tuple)) {
        return;
      }
      const entry = owns[at] === undefined ? undefined : entryOn(tuple);
      return entry === undefined ? vars : during(vars, entry, fresh);
    },
    rows,
  };
};

/**
 * Gives a sink every answer of a rule that uses a row of a batch, once:
 * the body runs from each goal that reads a relation of the batch.
 */
const using = (run: Run, rule: CompiledRule, batch: Batch, sink: Sink) =>
  Effect.gen(function* () {
    for (const [index, literal] of rule.body.entries()) {
      if (
        literal instanceof Atom &&
        (batch.rows.get(literal.relation.name)?.size ?? 0) > 0
      ) {
        const planned = deltaPlan(rule.body, index);
        yield* each(
          run.model,
          planned,
          sink,
          NO_VARS,
          readerOf(run, rule.body, planned, batch, index)
        );
      }
    }
  });

/** Counts the answers that use some rows of the group, for every rule. */
const count = (run: Run, entries: readonly Entry[], by: number) =>
  Effect.suspend(() => {
    const batch = batchOf(
      entries.flatMap(({ key, relation, tuple }): [string, Tuple, string][] =>
        isHidden(relation) ? [] : [[relation, tuple, key]]
      )
    );
    return batch.rows.size === 0
      ? Effect.void
      : Effect.forEach(
          run.stratum.rules,
          (rule) => using(run, rule, batch, give(run, rule, by)),
          { discard: true }
        );
  });

/** The rows of a relation a row is among: the ones that hold, or that ended. */
const homeOf = ({ model, support }: Run, entry: Entry) =>
  setOf(entry.until === NEVER ? model.relations : support.past, entry.relation);

/** True when two rows were both held at some level. */
const together = (a: Entry, b: Entry) =>
  Math.max(a.from, b.from) < Math.min(a.until, b.until);

/**
 * Counts what a row of a keyed relation and each other row with its key
 * make one: the values where the two differ. Two rows that cannot be made
 * one are noted, and fail the run when both still hold at its end.
 */
const pairUp = (run: Run, entry: Entry, by: number) => {
  for (const tuple of withKeyOf(run, entry)) {
    const other = entryOn(tuple);
    if (
      other === undefined ||
      other === entry ||
      !other.placed ||
      !together(entry, other)
    ) {
      continue;
    }
    const pairs: (readonly [unknown, unknown])[] = [];
    const one =
      pairsOf(entry.tuple, other.tuple, pairs) &&
      pairs.every(
        ([a, b]) =>
          (isFree(run, a) && !occurs(a, b)) || (isFree(run, b) && !occurs(b, a))
      );
    if (!one) {
      if (by > 0) {
        run.clashes.push([entry, other]);
      }
      continue;
    }
    const level = Math.max(entry.from, other.from) + 1;
    for (const [a, b] of pairs) {
      weighPair(run, a, b, level, by);
    }
  }
};

/** Notes the rows with a row's key: when they can be read depends on it. */
const beside = (run: Run, entry: Entry) => {
  for (const tuple of withKeyOf(run, entry)) {
    const other = entryOn(tuple);
    if (other !== undefined && other !== entry) {
      mark(run, other);
    }
  }
};

/** Asks the answers that invent again whose head a row could give. */
const watched = (run: Run, entry: Entry, level: number) => {
  const chase = run.support.chase;
  for (const inventor of run.inventors.get(entry.relation) ?? []) {
    const key = watchKey(inventor, entry.tuple);
    for (const asking of chase === undefined
      ? []
      : allOf(chase.watching, key)) {
      if (asking.n === 0 && !asking.placed) {
        // An answer nothing gives any more watches no longer.
        takeFrom(chase?.watching as Map<string, Some>, key, asking);
      } else if (asking.placed && stageOf(asking.from) >= stageOf(level)) {
        const stage = stageOf(asking.from);
        run.steps.set(stage, (run.steps.get(stage) ?? new Set()).add(asking));
      }
    }
  }
};

/** A pair's two values, by key. */
const endsOf = (entry: Entry) =>
  entry.tuple.map((value) => [valueKey(value), value] as const);

/** The first level of the stage after the one an answer is held in. */
const afterStage = (asking: Entry) => (stageOf(asking.from) + 1) * STAGE;

/** Takes a row from the rows goals read. */
const unplace = (run: Run, entry: Entry, level: number) => {
  const { chase } = run.support;
  if (entry.relation === EDGE) {
    for (const [key] of endsOf(entry)) {
      takeFrom(chase?.adjacent as Map<string, Some>, key, entry);
      run.links.add(key);
    }
  } else if (entry.relation.startsWith(MATCH)) {
    const answer = run.support.answers.get(entry);
    if (answer !== undefined) {
      tally(run, answer, entry.from, -1);
    }
  } else if (isHidden(entry.relation)) {
    if (chase?.inventing.delete(entry)) {
      run.retracting.push([entry, afterStage(entry)]);
    }
  } else {
    pairUp(run, entry, -1);
    homeOf(run, entry).deleteKeyed(entry.key);
    waitingOf(run.support, entry.relation).set(entry.key, entry);
    if (entry.until === NEVER) {
      moved(run, entry.relation, entry.key, entry.tuple, -1);
    }
    watched(run, entry, level);
  }
  entry.placed = false;
  if (!isHidden(entry.relation)) {
    beside(run, entry);
  }
};

/** Puts a row among the rows goals read. */
const place = (run: Run, entry: Entry, level: number) => {
  const { chase } = run.support;
  if (entry.relation === EDGE) {
    for (const [key, value] of endsOf(entry)) {
      addTo(chase?.adjacent as Map<string, Some>, key, entry);
      chase?.values.set(key, value);
      run.links.add(key);
    }
  } else if (entry.relation.startsWith(MATCH)) {
    const answer = run.support.answers.get(entry);
    if (answer !== undefined) {
      tally(run, answer, entry.from, 1);
    }
  } else if (isHidden(entry.relation)) {
    const stage = stageOf(entry.from);
    run.steps.set(stage, (run.steps.get(stage) ?? new Set()).add(entry));
  } else {
    pairUp(run, entry, 1);
    run.support.waiting.get(entry.relation)?.delete(entry.key);
    homeOf(run, entry).addKeyed(entry.key, entry.tuple);
    if (entry.until === NEVER) {
      moved(run, entry.relation, entry.key, entry.tuple, 1);
    }
    watched(run, entry, level);
  }
  entry.placed = true;
  if (!isHidden(entry.relation)) {
    beside(run, entry);
  }
};

/** The value an unknown is written as at a level, when it is another. */
const leastAt = (chase: Chase, unknown: Unknown, level: number) => {
  let found: unknown;
  for (const [at, least] of chase.history.get(unknown.key) ?? []) {
    if (at > level) {
      break;
    }
    found = least;
  }
  return found;
};

/**
 * A value as it is written at a level: every value in it as the least
 * member of its class, also inside what an unknown describes.
 */
const written = (chase: Chase, value: unknown, level: number): unknown => {
  const inner = (part: unknown) => written(chase, part, level);
  if (value instanceof Unknown) {
    const least = leastAt(chase, value, level);
    if (least !== undefined) {
      return inner(least);
    }
    const same = new Unknown(value.variable, replaceData(value.goal, inner));
    if (same.key === value.key) {
      return value;
    }
    if (chase.invented.has(value.key)) {
      chase.invented.add(same.key);
    }
    return inner(same);
  }
  if (Array.isArray(value)) {
    return value.map(inner);
  }
  return isPlainObject(value)
    ? Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, inner(item)])
      )
    : value;
};

/**
 * Gives the row a row became when it ended its candidate, and takes back
 * the one it gave before, when that is another row or another level.
 */
const image = (run: Run, entry: Entry) => {
  const chase = run.support.chase;
  if (chase === undefined || isHidden(entry.relation)) {
    return;
  }
  const ends = entry.from <= entry.until && entry.until !== NEVER;
  const tuple = ends
    ? (written(chase, entry.tuple, entry.until) as Tuple)
    : undefined;
  const key = tuple === undefined ? undefined : valueKey(tuple);
  const had = chase.images.get(entry);
  if (had !== undefined) {
    if (had[1] === entry.until && had[0].key === key) {
      return;
    }
    chase.images.delete(entry);
    bump(had[0], had[1], -1);
    mark(run, had[0]);
  }
  if (tuple !== undefined && key !== undefined) {
    const { relation, until } = entry;
    ruleFor(run, relation, key, run.rules.get(ruleName(relation, entry.key)));
    const became = weigh(run, relation, tuple, key, until, 1) as Entry;
    chase.images.set(entry, [became, until]);
  }
};

/** The values some values are joined to by pairs that hold, and those pairs. */
const joinedTo = (chase: Chase, keys: Iterable<string>) => {
  const members = new Map<string, unknown>();
  const edges = new Set<Entry>();
  const pending = [...keys];
  for (let key = pending.pop(); key !== undefined; key = pending.pop()) {
    if (members.has(key)) {
      continue;
    }
    members.set(key, chase.values.get(key));
    for (const edge of allOf(chase.adjacent, key)) {
      edges.add(edge);
      pending.push(...endsOf(edge).map(([end]) => end));
    }
  }
  return { edges, members };
};

/**
 * How each of some values is written over time, by the unknown's own key:
 * the pairs that hold are taken in the order of their levels, each makes
 * two classes one from its level on, and a class is written as its least
 * member. A pair of two values no class can write another way makes
 * nothing one.
 */
const historiesOf = (
  run: Run,
  members: ReadonlyMap<string, unknown>,
  edges: ReadonlySet<Entry>
) => {
  const classOf = new Map<string, { least: unknown; keys: string[] }>();
  for (const [key, value] of members) {
    classOf.set(key, { keys: [key], least: value });
  }
  const next = new Map<string, (readonly [number, unknown])[]>();
  for (const edge of [...edges].sort((a, b) => a.from - b.from)) {
    const [[first, a], [second, b]] = endsOf(edge) as [
      readonly [string, unknown],
      readonly [string, unknown],
    ];
    const [left, right] = [classOf.get(first), classOf.get(second)];
    const joins = isFree(run, a) || isFree(run, b);
    if (left === undefined || right === undefined || left === right || !joins) {
      continue;
    }
    const [winner, loser] = before(run, left.least, right.least)
      ? [left, right]
      : [right, left];
    for (const key of loser.keys) {
      classOf.set(key, winner);
      winner.keys.push(key);
      const value = members.get(key);
      if (isFree(run, value) && !occurs(value, winner.least)) {
        const history = (next.get(value.key) ?? []).filter(
          ([level]) => level !== edge.from
        );
        next.set(value.key, [...history, [edge.from, winner.least]]);
      }
    }
  }
  return next;
};

const sameHistory = (old: History | undefined, now: History | undefined) =>
  old?.length === now?.length &&
  (old ?? []).every(
    ([level, least], at) =>
      now?.[at]?.[0] === level && sameValue(now[at]?.[1], least)
  );

/**
 * Works out again how the values some pairs join are written, and notes
 * every row that holds a value whose writing changed. Every value has its
 * new writing before any row is looked at, since a row is written through
 * the whole class.
 */
const relink = (run: Run) => {
  const chase = run.support.chase;
  if (chase === undefined || run.links.size === 0) {
    return;
  }
  const { edges, members } = joinedTo(chase, run.links);
  run.links.clear();
  const next = historiesOf(run, members, edges);
  const changed = [...members.values()].flatMap((value) =>
    value instanceof Unknown &&
    !sameHistory(chase.history.get(value.key), next.get(value.key))
      ? [value.key]
      : []
  );
  for (const key of changed) {
    const now = next.get(key);
    if (now === undefined) {
      chase.history.delete(key);
    } else {
      chase.history.set(key, now);
    }
  }
  for (const key of changed) {
    for (const holder of allOf(chase.holders, key)) {
      // A row that ended is written with the value's new least member.
      image(run, holder);
      mark(run, holder);
    }
  }
};

/**
 * The rows of a level whose time is not what their candidates and values
 * say, each with the time it should have as far as the level tells. A row
 * that is off only higher up waits for that level.
 */
const movingAt = (run: Run, level: number, entries: readonly Entry[]) => {
  const moving: (readonly [Entry, number, number, number])[] = [];
  for (const entry of entries) {
    entry.queued = TAKEN;
  }
  for (const entry of entries) {
    if (entry.queued !== TAKEN) {
      // Listed twice: once is enough.
      continue;
    }
    entry.queued = NEVER;
    const time = timeOf(run, entry);
    if (offAt(entry, time) > level) {
      mark(run, entry);
    } else {
      const [from, until, seen] = time;
      const held = from <= level;
      moving.push([entry, held ? from : NEVER, until, held ? seen : NEVER]);
    }
  }
  return moving;
};

/**
 * Gives each moving row the time it should have, and puts it among the rows
 * goals read when that time is not empty.
 */
const join = (
  run: Run,
  level: number,
  moving: readonly (readonly [Entry, number, number, number])[]
) => {
  const joining: Entry[] = [];
  for (const [entry, from, until, seen] of moving) {
    entry.from = from;
    entry.until = until;
    entry.seen = seen;
    image(run, entry);
    if (from < until) {
      place(run, entry, level);
      joining.push(entry);
      // While a group is derived from nothing, a row that joins a keyed
      // relation beside another with its key ends the run.
      run.problem ??=
        run.fresh && until === NEVER
          ? keyProblem(run, entry.relation, entry.key)
          : undefined;
    }
  }
  return joining;
};

/** Takes back what answers that stopped inventing invented. */
const retract = (run: Run) =>
  Effect.gen(function* () {
    for (const [asking, level] of run.retracting.splice(0)) {
      for (const [relation, tuple] of yield* headRows(run, asking)) {
        weigh(run, relation, tuple, valueKey(tuple), level, -1);
      }
    }
  });

/**
 * Settles one level. A row whose time is not what its candidates and
 * values say leaves the rows goals read, and takes its answers' candidates
 * with it; it then joins again for the time it should have, and gives its
 * answers' candidates, all at higher levels.
 */
const settleLevel = (run: Run, level: number, entries: readonly Entry[]) =>
  Effect.gen(function* () {
    const moving = movingAt(run, level, entries);
    const leaving = moving.flatMap(([entry]) => (entry.placed ? [entry] : []));
    yield* count(run, leaving, -1);
    for (const entry of leaving) {
      unplace(run, entry, level);
    }
    yield* retract(run);
    const joining = join(run, level, moving);
    if (run.problem !== undefined) {
      return yield* logicError(run.problem);
    }
    yield* count(run, joining, 1);
    relink(run);
    for (const [entry] of moving) {
      // A row that left and has candidates higher up joins there.
      mark(run, entry);
      if (entry.from === NEVER && entry.n === 0) {
        drop(run, entry);
      }
    }
  });

/** True when a row held at the end of a stage gives the head of an answer. */
const givenBy = (run: Run, asking: Entry, last: number) =>
  Effect.gen(function* () {
    const check = saidBy(asking.tuple[0]);
    let holds = false;
    yield* each(
      run.model,
      check,
      () =>
        Effect.sync(() => {
          holds = true;
        }),
      NO_VARS,
      {
        meet: (_, tuple, vars) => {
          const found = entryOn(tuple);
          return found === undefined ||
            (found.placed && found.from <= last && found.until > last)
            ? vars
            : undefined;
        },
        rows: (at) => everOf(run, (check[at] as Atom).relation.name),
      }
    );
    return holds;
  });

/**
 * Asks the answers of rules that invent that are first held in a stage, at
 * its end: one invents when no row held by then gives its head, and each
 * row of its head is then a candidate at the first level of the next stage.
 * The unknowns it names are the group's own from then on.
 */
const step = (run: Run, stage: number, asked: ReadonlySet<Entry>) =>
  Effect.gen(function* () {
    const chase = run.support.chase as Chase;
    for (const asking of asked) {
      const due = asking.placed && stageOf(asking.from) === stage;
      const holds = due && (yield* givenBy(run, asking, endOf(stage)));
      if (!due || holds !== chase.inventing.has(asking)) {
        continue;
      }
      const by = holds ? -1 : 1;
      for (const [relation, tuple] of yield* headRows(run, asking)) {
        const key = valueKey(tuple);
        ruleFor(run, relation, key, ruleOf(run, asking));
        weigh(run, relation, tuple, key, afterStage(asking), by);
      }
      if (holds) {
        chase.inventing.delete(asking);
        continue;
      }
      chase.inventing.add(asking);
      for (const unknown of asking.tuple) {
        chase.invented.add((unknown as Unknown).key);
      }
    }
  });

/** The least of some levels, or `NEVER` when there are none. */
const least = (levels: Iterable<number>) => {
  let found = NEVER;
  for (const level of levels) {
    found = Math.min(found, level);
  }
  return found;
};

/** Why a group whose aggregates recurse cannot go on to a level. */
const improving = ({ stratum }: Run, level: number) => {
  const combines = stratum.rules.some((rule) => rule.aggregates.length > 0);
  if (!combines || level === NEVER || level <= MAX_LATTICE_ROUNDS) {
    return;
  }
  const names = [
    ...new Set(stratum.rules.map((rule) => `"${rule.head.relation.name}"`)),
  ];
  return `${names.join(" and ")} kept improving after ${MAX_LATTICE_ROUNDS} rounds, so evaluation stopped. A cycle can improve a value forever, such as a negative-weight cycle under aggregate/min.`;
};

/**
 * Settles every level that has something to settle, lowest first, and asks
 * the rules that invent at the end of each stage. The rows of a group of
 * candidates that changed are worked out before the next level is chosen.
 */
const settle = (run: Run) =>
  Effect.gen(function* () {
    const { dirty, folding, steps } = run;
    while (folding.size > 0 || dirty.size > 0 || steps.size > 0) {
      yield* Effect.try({
        catch: (error) => error as LogicError,
        try: () => {
          for (const fold of [...folding]) {
            folding.delete(fold);
            refold(run, fold);
          }
        },
      });
      const level = least(dirty.keys());
      const stage = least(steps.keys());
      const problem = run.problem ?? improving(run, level);
      if (problem !== undefined) {
        return yield* logicError(problem);
      }
      if (stage !== NEVER && endOf(stage) < level) {
        const asked = steps.get(stage) ?? new Set<Entry>();
        steps.delete(stage);
        yield* step(run, stage, asked);
        continue;
      }
      const entries = dirty.get(level) ?? [];
      dirty.delete(level);
      yield* settleLevel(run, level, entries);
    }
  });

/** True for a row that questions about the database can see. */
const shows = (entry: Entry) => entry.placed && entry.until === NEVER;

/** Why two rows with one key that could not be made one cannot both hold. */
const clash = (run: Run) => {
  for (const [entry, other] of run.clashes) {
    if (shows(entry) && shows(other)) {
      const rule = (one: Entry) =>
        run.rules.get(ruleName(one.relation, one.key));
      const [derived, held] =
        rule(entry) === undefined ? [other, entry] : [entry, other];
      return keyMessage(
        run.relations.get(entry.relation) as RelationInfo,
        rule(derived),
        derived.tuple,
        held.tuple
      );
    }
  }
  return;
};

/**
 * Ends a run: fails when rows that hold break a key, and returns what each
 * relation gained and lost.
 */
const finish = (run: Run) =>
  Effect.gen(function* () {
    const gained = new Map<string, TupleSet>();
    const lost = new Map<string, TupleSet>();
    let problem = clash(run);
    for (const [relation, rows] of run.net) {
      for (const [key, [tuple, net]] of rows) {
        problem ??= net > 0 ? keyProblem(run, relation, key) : undefined;
        if (net !== 0) {
          setOf(net > 0 ? gained : lost, relation).addKeyed(key, tuple);
        }
      }
    }
    return problem === undefined
      ? { gained, lost }
      : yield* logicError(problem);
  });

/**
 * Gives each fact of a group whose rows have levels an entry, held from the
 * lowest level. The rows are the group's own copies, since an entry is kept
 * on its row and a fact's row is the database's.
 */
const startFrom = (run: Run) => {
  for (const name of run.stratum.members) {
    const rows = new TupleSet();
    for (const [key, tuple] of rowsOf(run.model, name).keyed()) {
      const entry = entryOf(run, name, tuple, key, false);
      entry.from = 0;
      entry.seen = 0;
      entry.n = 1;
      entry.placed = true;
      run.support.waiting.get(name)?.delete(key);
      rows.addKeyed(key, entry.tuple);
    }
    run.model.relations.set(name, rows);
  }
};

const chaseOf = (): Chase => ({
  adjacent: new Map(),
  history: new Map(),
  holders: new Map(),
  images: new Map(),
  invented: new Set(),
  inventing: new Set(),
  values: new Map(),
  watching: new Map(),
});

/**
 * True for a group whose rules read nothing of its own, invent nothing,
 * make no values one, and share no head that combines: every candidate has
 * the lowest level, and counts as it comes.
 */
const isFlat = ({ members, rules }: Stratum) => {
  const shared = sharedHeads(rules);
  return rules.every(
    (rule) =>
      !(
        makesValues(rule) ||
        (shared.has(rule.head) && rule.aggregates.length > 0) ||
        rule.body.some(
          (literal) =>
            literal instanceof Atom && members.has(literal.relation.name)
        )
      )
  );
};

/**
 * Derives a group from nothing, on top of its facts: every answer of every
 * rule is a candidate, and the levels are settled lowest first.
 */
export const deriveRows = (model: Model, stratum: Stratum) =>
  Effect.gen(function* () {
    const support: Support = {
      answers: new Map(),
      chase: stratum.rules.some(makesValues) ? chaseOf() : undefined,
      ends: new Map(),
      flat: isFlat(stratum),
      folds: new Map(),
      past: new Map(),
      waiting: new Map(),
    };
    for (const name of stratum.members) {
      model.support.set(name, support);
    }
    const run = runOf(model, stratum, support, true);
    if (!support.flat) {
      startFrom(run);
    }
    for (const rule of stratum.rules) {
      yield* each(
        model,
        rule.body,
        give(run, rule, 1),
        NO_VARS,
        readerOf(run, rule.body)
      );
    }
    yield* settle(run);
    yield* finish(run);
  });

/** The rows a relation gained or lost, when it did. */
const rowsIn = (rows: ReadonlyMap<string, TupleSet>, name: string) => {
  const found = rows.get(name);
  return found === undefined || found.size === 0 ? undefined : found;
};

/**
 * A relation as it was before a change: its rows without the ones it
 * gained, and with the ones it lost.
 */
class Was implements Rows {
  readonly demand: Rows["demand"];
  private readonly gained: ReadonlySet<Tuple>;
  private readonly lost: TupleSet | undefined;
  private readonly now: Rows;

  constructor(now: Rows, gained: ReadonlySet<Tuple>, lost?: TupleSet) {
    this.now = now;
    this.gained = gained;
    this.lost = lost;
    this.demand = now.demand;
  }

  *lookup(positions: readonly number[], values: readonly unknown[]) {
    for (const tuple of this.now.lookup(positions, values)) {
      if (!this.gained.has(tuple)) {
        yield tuple;
      }
    }
    if (this.lost !== undefined) {
      yield* this.lost.lookup(positions, values);
    }
  }
}

const READ = new WeakMap<Stratum, ReadonlySet<string>>();

/** The relations a group's rules read and do not derive, by name. */
const readOutside = (stratum: Stratum) => {
  let read = READ.get(stratum);
  if (read === undefined) {
    read = new Set(
      stratum.rules
        .flatMap((rule) => readingOf(rule).uses.map((use) => use.relation))
        .filter((name) => !stratum.members.has(name))
    );
    READ.set(stratum, read);
  }
  return read;
};

/** What a change did to the relations a group reads and does not derive. */
interface Moved {
  /** Each changed relation with the rows it lost beside the ones it has. */
  readonly ever: (name: string) => Rows | undefined;
  readonly gained: Batch;
  readonly lost: Batch;
  /** Each changed relation as it was before the change. */
  readonly was: (name: string) => Rows | undefined;
}

const movedOf = (
  model: Model,
  stratum: Stratum,
  gained: ReadonlyMap<string, TupleSet>,
  lost: ReadonlyMap<string, TupleSet>
): Moved => {
  // Only what the group's rules read: a change to anything else is not its.
  const read = readOutside(stratum);
  const outside = function* (rows: ReadonlyMap<string, TupleSet>) {
    for (const name of read) {
      const now = rowsOf(model, name);
      for (const tuple of rows.get(name)?.values() ?? []) {
        yield [name, now.stored(tuple) ?? tuple] as const;
      }
    }
  };
  const plus = batchOf(outside(gained));
  const minus = batchOf(outside(lost));
  const views = new Map<string, Rows | undefined>();
  return {
    ever: (name) => {
      const taken = minus.rows.get(name);
      return taken === undefined
        ? undefined
        : new Both(rowsOf(model, name), taken);
    },
    gained: plus,
    lost: minus,
    was: (name) => {
      if (!views.has(name)) {
        const added = plus.ids.get(name);
        const taken = minus.rows.get(name);
        views.set(
          name,
          added === undefined && taken === undefined
            ? undefined
            : new Was(rowsOf(model, name), added ?? new Set(), taken)
        );
      }
      return views.get(name);
    },
  };
};

/**
 * The places of a head that name its row: the ones that neither combine,
 * nor compute, nor ask, nor invent, so their values are known before the
 * body runs and do not change with what is asked.
 */
const namedBy = (rule: CompiledRule, head: Atom = rule.head) =>
  head.args.flatMap((arg, position) =>
    rule.aggregates.includes(position) || holdsSome(arg) || !isPattern(arg)
      ? []
      : [position]
  );

/**
 * True for a head value that names a row: a variable, a value, or a record
 * or list made of those. A value the head computes, or asks a question for,
 * is worked out once the body has run, so it cannot stand in a goal before.
 */
const isPattern = (arg: unknown): boolean =>
  arg instanceof LogicVariable ||
  (patternParts(arg, false)?.every(isPattern) ?? isGroundValue(arg));

/**
 * Gives a sink the answers of a rule that give one of its heads some named
 * rows: the rule's body behind a goal that holds the names, read as `view`
 * says the relations around the group are.
 */
const naming = (
  run: Run,
  rule: CompiledRule,
  head: Atom,
  names: TupleSet,
  sinks: readonly (readonly [Model["view"], Sink])[]
) =>
  Effect.suspend(() => {
    const { model } = run;
    const positions = namedBy(rule, head);
    const { columns } = head.relation;
    const goal = new Atom(
      {
        columns: positions.map((position) => columns[position] as string),
        name: REACHED,
      },
      positions.map((position) => head.args[position])
    );
    const body = guarded(rule.body, goal);
    const reader = readerOf(run, rule.body, body);
    model.relations.set(REACHED, names);
    return Effect.forEach(
      sinks,
      ([view, sink]) => {
        model.view = view;
        return each(model, body, sink, NO_VARS, reader);
      },
      { discard: true }
    ).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          model.relations.delete(REACHED);
          model.view = undefined;
        })
      )
    );
  });

/**
 * What names the rows a change to what a rule asks about reaches: each use
 * of a changed relation finds the answers that could have used a changed
 * row, and each answer names a row by the head values that ask nothing.
 */
const reached = (
  run: Run,
  uses: readonly Use[],
  moved: Moved,
  args: readonly unknown[]
) =>
  Effect.gen(function* () {
    const { model } = run;
    const names = new TupleSet();
    const name: Sink = (answers) =>
      Effect.gen(function* () {
        for (const vars of answers) {
          names.add(
            plainTuple(args, vars) ?? (yield* tupleOf(model, args, vars))
          );
        }
      });
    // The other goals read every row that held before or holds now: that
    // finds every answer of either time, and some of neither, which name
    // rows whose answers are then counted as they were and as they are.
    model.view = moved.ever;
    for (const { at, body, relation } of uses) {
      for (const batch of [moved.lost, moved.gained]) {
        const rows = batch.rows.get(relation);
        yield* rows === undefined || body === undefined
          ? Effect.void
          : each(model, body, name, NO_VARS, {
              rows: (position) => (position === at ? rows : undefined),
            });
      }
    }
    return names;
  });

/**
 * Counts the answers of a rule that a change to what it asks about reaches.
 * Every answer that gave a row the change reaches, as things were, is taken
 * away, and every answer that gives one, as things are, is added: an answer
 * the change left alone is taken away and added.
 */
const asked = (
  run: Run,
  rule: CompiledRule,
  uses: readonly Use[],
  moved: Moved
) =>
  Effect.gen(function* () {
    const args = namedBy(rule).map((position) => rule.head.args[position]);
    const names = yield* reached(run, uses, moved, args);
    if (names.size > 0) {
      yield* naming(run, rule, rule.head, names, [
        [moved.was, give(run, rule, -1)],
        [undefined, give(run, rule, 1)],
      ]);
    }
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        run.model.view = undefined;
      })
    )
  );

/**
 * Counts what a change to the relations a group reads does to its
 * candidates: the answers that used a row a relation lost, as things were,
 * are taken away, and the answers that use a row a relation gained, as
 * things are, are added. A rule that asks about a changed relation counts
 * the answers the change reaches both ways itself.
 */
const outside = (run: Run, moved: Moved) =>
  Effect.gen(function* () {
    const { model, stratum } = run;
    const changes = (name: string) =>
      moved.lost.rows.has(name) || moved.gained.rows.has(name);
    for (const rule of stratum.rules) {
      const uses = readingOf(rule).uses.filter((use) => changes(use.relation));
      if (uses.some((use) => use.asked)) {
        yield* asked(run, rule, uses, moved);
        continue;
      }
      for (const [batch, by] of [
        [moved.lost, -1],
        [moved.gained, 1],
      ] as const) {
        model.view = by < 0 ? moved.was : undefined;
        yield* using(run, rule, batch, give(run, rule, by));
      }
    }
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        run.model.view = undefined;
      })
    )
  );

/**
 * Follows a change through a group: the facts it gained and lost are
 * candidates added and taken away, what the relations it reads gained and
 * lost changes the candidates its rules give, and the levels are settled
 * lowest first. Returns what each relation of the group gained and lost.
 * `regiven` says the unknowns that facts hold are not what they were, so
 * every class of values is worked out again.
 */
export const followRows = (
  model: Model,
  stratum: Stratum,
  gained: ReadonlyMap<string, TupleSet>,
  lost: ReadonlyMap<string, TupleSet>,
  regiven = false
): LogicEffect<{
  gained: Map<string, TupleSet>;
  lost: Map<string, TupleSet>;
}> =>
  Effect.gen(function* () {
    const [first] = stratum.members;
    const support = model.support.get(first ?? "") as Support;
    const run = runOf(model, stratum, support);
    for (const key of regiven ? (support.chase?.values.keys() ?? []) : []) {
      run.links.add(key);
    }
    relink(run);
    for (const name of stratum.members) {
      for (const [rows, by] of [
        [rowsIn(lost, name), -1],
        [rowsIn(gained, name), 1],
      ] as const) {
        for (const tuple of rows?.values() ?? []) {
          weigh(run, name, tuple, valueKey(tuple), 0, by, false);
        }
      }
    }
    yield* outside(run, movedOf(model, stratum, gained, lost));
    yield* settle(run);
    return yield* finish(run);
  });

/**
 * Says how the rows of a group that made values one came about, as the
 * rules give them from the rows there are, and keeps it until the group
 * changes.
 */
const retold = (run: Run, name: string) =>
  Effect.gen(function* () {
    const { model, stratum, support } = run;
    const chase = support.chase as Chase;
    if (!model.told.has(name)) {
      const equal = new Map<string, unknown>();
      for (const [key, history] of chase.history) {
        equal.set(key, history.at(-1)?.[1]);
      }
      const inventions: Inventions = {
        equal,
        invented: new Set(chase.invented),
      };
      yield* justify(model, stratum.rules, run.relations, inventions);
    }
    return model.told.get(name);
  });

/** The answers of a rule that give one of its heads a row, each with the row's level. */
const givers = (run: Run, rule: CompiledRule, head: Atom, tuple: Tuple) =>
  Effect.gen(function* () {
    const { model } = run;
    const found: Vars[] = [];
    const names = new TupleSet();
    names.add(namedBy(rule, head).map((position) => tuple[position]));
    yield* naming(run, rule, head, names, [
      [
        undefined,
        (answers) =>
          Effect.sync(() => {
            found.push(...answers);
          }),
      ],
    ]);
    const key = valueKey(tuple);
    const giving: (readonly [Vars, number])[] = [];
    for (const vars of found) {
      const row = yield* tupleOf(model, head.args, vars);
      if (valueKey(row) !== key) {
        continue;
      }
      let level = levelOf(vars);
      if (rule.invents !== undefined) {
        // What an answer invents comes a stage after the answer, if it did.
        const named = yield* inventedBy(model, rule, vars);
        const asking = entryAt(
          run,
          `${TRIGGER}${run.order.get(rule) ?? 0}`,
          named.map((unknown) => unknown.key).join("\u0000")
        );
        level =
          asking !== undefined && run.support.chase?.inventing.has(asking)
            ? afterStage(asking)
            : NEVER;
      }
      giving.push([bare(vars), level]);
    }
    return giving;
  });

/**
 * How a row a rule gave came about: of its candidates at the level it is
 * held from, the least answer of the first rule that has one.
 */
const givenFrom = (
  run: Run,
  rules: readonly CompiledRule[],
  name: string,
  tuple: Tuple
) =>
  Effect.gen(function* () {
    const level = run.support.flat
      ? 0
      : (entryAt(run, name, valueKey(tuple))?.from ?? NEVER);
    for (const rule of rules) {
      const first: Vars[] = [];
      for (const head of headsOf(rule)) {
        const giving =
          head.relation.name === name
            ? yield* givers(run, rule, head, tuple)
            : [];
        first.push(
          ...giving.flatMap(([vars, at]) => (at === level ? [vars] : []))
        );
      }
      const [vars] = first.sort((a, b) => compareAnswers(rule, a, b));
      if (vars !== undefined) {
        return { rule, vars };
      }
    }
    return;
  });

/**
 * How a row that combines came about: every answer of its group, or for a
 * row one answer picked, the least answer that gave its value.
 */
const combinedFrom = (run: Run, rules: readonly CompiledRule[], tuple: Tuple) =>
  Effect.gen(function* () {
    const { model } = run;
    const [pattern] = rules;
    const group = valueKey(
      tuple.map((value, at) =>
        pattern?.aggregates.includes(at) ? null : value
      )
    );
    const matches: (readonly [Match, readonly unknown[]])[] = [];
    const seen = new Map<Atom, Set<string>>();
    for (const rule of rules) {
      const found: Vars[] = [];
      const names = new TupleSet();
      names.add(namedBy(rule).map((position) => tuple[position]));
      yield* naming(run, rule, rule.head, names, [
        [
          undefined,
          (answers) =>
            Effect.sync(() => {
              found.push(...answers);
            }),
        ],
      ]);
      const once = seen.get(rule.head) ?? new Set<string>();
      seen.set(rule.head, once);
      for (const answer of found) {
        const vars = bare(answer);
        const id = answerKey(vars);
        const { key, values } = yield* matchValues(model, rule, vars);
        if (valueKey(key) === group && !once.has(id)) {
          once.add(id);
          matches.push([{ rule, vars }, values]);
        }
      }
    }
    const [first] = matches;
    if (first === undefined) {
      return;
    }
    const { rule } = first[0];
    const position = rule.aggregates[0] ?? 0;
    const picked = selectsAlone(rule)
      ? matches
          .filter(([, [value]]) => sameValue(value, tuple[position]))
          .map(([match]) => match)
          .sort(compareMatches(model.rules))[0]
      : undefined;
    return picked ?? { matches: matches.map(([match]) => match), rule };
  });

/**
 * How a row came about, for `why`: the answer that gave it, or for a row
 * that combines, the answers it combines. Nothing for a fact, and for a row
 * no rule gives. It is found when asked, from the candidates the row has:
 * of the ones at the level the row is held from, the least answer of the
 * first rule tells it, which is the one deriving from nothing finds first.
 */
export const derivationOf = (
  model: Model,
  name: string,
  tuple: Tuple
): LogicEffect<Derivation | undefined> =>
  Effect.gen(function* () {
    yield* complete(model, name);
    const stratum = model.strata.get(name);
    const support = model.support.get(name);
    if (
      stratum === undefined ||
      support === undefined ||
      startingFacts(model, name)?.has(tuple)
    ) {
      return;
    }
    const run = runOf(model, stratum, support);
    if ((support.chase?.history.size ?? 0) > 0) {
      // Where values were made one, a row is told as the rules give it
      // from the rows there are.
      const told = (yield* retold(run, name))?.get(valueKey(tuple));
      if (told !== undefined) {
        return told;
      }
    }
    const rules = stratum.rules.filter(
      (rule) =>
        !rule.equates &&
        headsOf(rule).some((head) => head.relation.name === name)
    );
    return rules.some((rule) => rule.aggregates.length > 0)
      ? yield* combinedFrom(run, rules, tuple)
      : yield* givenFrom(run, rules, name, tuple);
  });

/** What a model keeps of one row its rules gave. */
export interface Kept {
  /** The row's candidates by level, lowest first. */
  readonly candidates: readonly (readonly [number, number])[];
  readonly from: number;
  /** The first, in sort order, of the relations of the row's group. */
  readonly group: string;
  readonly key: string;
  readonly relation: string;
  readonly seen: number;
  readonly tuple: Tuple;
  readonly until: number;
}

/**
 * What a model keeps of each row its rules gave, for tests and tools: the
 * level the row is held from, the level it is held until, the level it can
 * be read from, and its candidates by level. A row of a group with one
 * level has the lowest. The rows of the relations a group keeps for itself
 * are told too.
 */
export const keptBy = (model: Model) => {
  const out: Kept[] = [];
  const seen = new Set<Support>();
  const say = (group: string, entry: Entry) => {
    if (entry.n > 0) {
      const more = [...(entry.more ?? [])].sort(([a], [b]) => a - b);
      const { from, key, relation, tuple, until } = entry;
      const candidates = [[entry.level, entry.n] as const, ...more];
      out.push({
        candidates,
        from,
        group,
        key,
        relation,
        seen: entry.seen,
        tuple,
        until,
      });
    }
  };
  for (const [member, support] of model.support) {
    const stratum = model.strata.get(member);
    if (seen.has(support) || stratum === undefined) {
      continue;
    }
    seen.add(support);
    const [group = member] = [...stratum.members].sort();
    for (const relation of stratum.members) {
      const rows = model.relations.get(relation);
      const past = support.past.get(relation);
      for (const [key, tuple] of [
        ...(rows?.keyed() ?? []),
        ...(past?.keyed() ?? []),
      ]) {
        const entry = entryOn(tuple);
        if (entry === undefined) {
          const candidates = [[0, rows?.weightOf(key) ?? 0] as const];
          const flat = { from: 0, seen: 0, until: NEVER };
          out.push({ ...flat, candidates, group, key, relation, tuple });
        } else {
          say(group, entry);
        }
      }
    }
    for (const entries of support.waiting.values()) {
      for (const entry of entries.values()) {
        say(group, entry);
      }
    }
  }
  return out;
};

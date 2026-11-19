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
 * goes: an answer is one whose rows were all held at one level.
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
  compareAnswers,
  compareKept,
  compareMatches,
  deltaPlan,
  depthOf,
  derivedRow,
  each,
  type Inventions,
  inventedBy,
  justify,
  type Kept,
  keyColumns,
  type LogicEffect,
  MAX_LATTICE_ROUNDS,
  type Match,
  type Model,
  matchValues,
  NO_VARS,
  occurs,
  packed,
  plainRow,
  plainTuple,
  type Reader,
  type Rows,
  replaceData,
  rowProblem,
  rowsOf,
  type Sink,
  selectsAlone,
  type Tuple,
  TupleSet,
  tupleOf,
  type Vars,
} from "@/logic/model";
import { mentioned, type Stratum } from "@/logic/strata";
import {
  Atom,
  compareValues,
  isForm,
  isPlainObject,
  LogicValue,
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
 * goals matched is held from, and the lowest level one of them is held
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

const isHidden = (relation: string) =>
  relation === EDGE ||
  relation.startsWith(TRIGGER) ||
  relation.startsWith(MATCH);

/** How a row was first given, while a group is derived from nothing. */
interface Told {
  readonly kept: Kept;
  readonly level: number;
  readonly order: number;
}

/** A row of a group, and the candidates that give it. */
export interface Entry {
  /** True for a row that is a fact, which needs no rule to tell it. */
  fact: boolean;
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
  /** A rule that gave the row, for a message about its key. */
  rule: CompiledRule | undefined;
  told: Told | undefined;
  readonly tuple: Tuple;
  /** The level the row is held until, when a value in it stops being least. */
  until: number;
}

/** An answer of a rule that invents: what it would invent, and whether it did. */
interface Trigger {
  active: boolean;
  /** The candidates it gave the rows it invented. */
  gave: (readonly [Entry, number])[];
  /** The rows its head says exist, with the unknowns it names. */
  readonly heads: readonly (readonly [Atom, Tuple])[];
  readonly rule: CompiledRule;
  /** The least answer that names these unknowns. */
  vars: Vars;
  /** What it is asked again under, when a row could give its head. */
  readonly watches: string[];
}

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
  /** Every answer, with what it gives, while how rows came is kept. */
  matches: (readonly [Match, readonly unknown[]])[];
  readonly relation: string;
  readonly rule: CompiledRule;
  /** The least level whose candidates changed since the rows were worked out. */
  since: number;
  versions: (readonly [number, Entry])[];
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
  /** The pairs that are held, by each value they join. */
  readonly adjacent: Map<string, Set<Entry>>;
  readonly history: Map<string, History>;
  /** The rows that hold each unknown, however deep. */
  readonly holders: Map<string, Set<Entry>>;
  /** The unknowns each row holds, however deep. */
  readonly holds: Map<Entry, readonly string[]>;
  /** The candidate each row that ended gives the row it became. */
  readonly images: Map<Entry, readonly [Entry, number]>;
  /** The unknowns the group's rules invented, by their own keys. */
  readonly invented: Set<string>;
  readonly triggers: Map<Entry, Trigger>;
  /** Each value a pair joins, by key. */
  readonly values: Map<string, unknown>;
  /** The answers that invent, by what a row must hold to give their head. */
  readonly watching: Map<string, Set<Entry>>;
}

/** What a group keeps of its rows between changes. */
export interface Support {
  /** What each answer that counts once gives, by its row. */
  readonly answers: Map<Entry, Answer>;
  /** The entry of each row, by the row itself. */
  readonly byRow: Map<Tuple, Entry>;
  readonly chase: Chase | undefined;
  /** The level a row that combines is held until, when a better one comes. */
  readonly ends: Map<Entry, number>;
  /** The entry of each row, by relation and the row's key. */
  readonly entries: Map<string, Map<string, Entry>>;
  /** The candidates of each row that combines, by relation and head values. */
  readonly folds: Map<string, Fold>;
  /** The rows that ended, by relation. */
  readonly past: Map<string, TupleSet>;
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
  /** The heads of rules that invent, by the relation they give rows of. */
  readonly inventors: Map<string, Inventor[]>;
  /** The values whose classes are to be worked out again. */
  readonly links: Set<string>;
  readonly model: Model;
  /** The order of each rule among the group's. */
  readonly order: Map<CompiledRule, number>;
  /** The relations the group's rules give rows of, by name. */
  readonly relations: Map<string, RelationInfo>;
  /** The heads that several rules of the group share. */
  readonly shared: Set<Atom>;
  /** The answers that invent to ask again, by the stage they are held in. */
  readonly steps: Map<number, Set<Entry>>;
  readonly stratum: Stratum;
  readonly support: Support;
  /** True while a group is derived from nothing: how rows came is kept. */
  readonly telling: boolean;
  /** Whether each row the run moved held before it. */
  readonly was: Map<Entry, boolean>;
}

/** True for a place of a head that holds something the rule invents. */
const holdsSome = (arg: unknown): boolean =>
  isForm(arg, "some") || (patternParts(arg, false)?.some(holdsSome) ?? false);

const runOf = (
  model: Model,
  stratum: Stratum,
  support: Support,
  telling: boolean
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
  const heads = new Set<Atom>();
  const shared = new Set<Atom>();
  for (const { head } of stratum.rules) {
    (heads.has(head) ? shared : heads).add(head);
  }
  return {
    clashes: [],
    dirty: new Map(),
    folding: new Set(),
    shared,
    inventors,
    links: new Set(),
    model,
    order: new Map(stratum.rules.map((rule, at) => [rule, at])),
    relations,
    steps: new Map(),
    stratum,
    support,
    telling,
    was: new Map(),
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

/**
 * The level a row is held until: the first at which a value it holds stops
 * being the least member of its class, or at which its group's combined
 * values change, or `NEVER`.
 */
const ending = ({ support }: Run, entry: Entry) => {
  const chase = support.chase;
  let until = support.ends.get(entry) ?? NEVER;
  for (const key of chase?.holds.get(entry) ?? []) {
    const [first] = chase?.history.get(key) ?? [];
    if (first !== undefined) {
      until = Math.min(until, first[0]);
    }
  }
  return until;
};

/** The first level at which a row's time is not what it should be. */
const offAt = (entry: Entry, from: number, until: number) => {
  const first = from === entry.from ? NEVER : Math.min(from, entry.from);
  const second = until === entry.until ? NEVER : Math.min(until, entry.until);
  return Math.min(first, second);
};

/** Notes an entry whose time is not what its candidates and values say. */
const mark = (run: Run, entry: Entry) => {
  const { chase, ends } = run.support;
  // Most rows never end: only their candidates say when they are held.
  if (chase === undefined && ends.size === 0 && wanted(entry) === entry.from) {
    return;
  }
  const level = offAt(entry, wanted(entry), ending(run, entry));
  if (level === NEVER) {
    return;
  }
  if (entry.queued === level) {
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

const entriesOf = ({ entries }: Support, relation: string) => {
  let found = entries.get(relation);
  if (found === undefined) {
    found = new Map();
    entries.set(relation, found);
  }
  return found;
};

/** The unknowns a value holds, however deep, also in what others describe. */
const unknownsIn = (value: unknown, into: Set<string>) => {
  if (value instanceof Unknown) {
    into.add(valueKey(value));
    unknownsIn(value.goal, into);
  } else if (value instanceof LogicValue) {
    for (const part of value.parts) {
      unknownsIn(part, into);
    }
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

/** The entry of a row, made when the row has none. */
const entryOf = (
  { support }: Run,
  relation: string,
  tuple: Tuple,
  key: string
) => {
  const entries = entriesOf(support, relation);
  let entry = entries.get(key);
  if (entry === undefined) {
    entry = {
      fact: false,
      from: NEVER,
      key,
      level: 0,
      more: undefined,
      n: 0,
      placed: false,
      queued: NEVER,
      relation,
      rule: undefined,
      told: undefined,
      tuple,
      until: NEVER,
    };
    entries.set(key, entry);
    support.byRow.set(tuple, entry);
    const chase = support.chase;
    const held =
      chase === undefined || isHidden(relation)
        ? []
        : [...unknownsIn(tuple, new Set())];
    if (chase !== undefined && held.length > 0) {
      chase.holds.set(entry, held);
      for (const unknown of held) {
        const holders = chase.holders.get(unknown) ?? new Set<Entry>();
        chase.holders.set(unknown, holders);
        holders.add(entry);
      }
    }
  }
  return entry;
};

/** Forgets an entry that nothing gives any more. */
const drop = ({ support }: Run, entry: Entry) => {
  const entries = support.entries.get(entry.relation);
  if (entries?.get(entry.key) === entry) {
    entries.delete(entry.key);
    support.byRow.delete(entry.tuple);
  }
  const chase = support.chase;
  for (const unknown of chase?.holds.get(entry) ?? []) {
    chase?.holders.get(unknown)?.delete(entry);
  }
  chase?.holds.delete(entry);
  for (const key of chase?.triggers.get(entry)?.watches ?? []) {
    chase?.watching.get(key)?.delete(entry);
  }
  chase?.triggers.delete(entry);
  support.answers.delete(entry);
  support.ends.delete(entry);
};

/**
 * The answer with the time of a row one of its goals matched: undefined
 * when the rows it matched were never all held at one level.
 */
const during = (
  vars: Vars,
  { from, until }: Entry,
  fresh: boolean
): Vars | undefined => {
  const since = (vars.get(FROM) as number | undefined) ?? -1;
  const before = (vars.get(UNTIL) as number | undefined) ?? NEVER;
  const first = Math.max(since, from);
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

/** Keeps the candidate that tells a row first: by level, rule, and answer. */
const tell = (
  run: Run,
  entry: Entry,
  level: number,
  rule: CompiledRule,
  vars: Vars
) => {
  const order = run.order.get(rule) ?? 0;
  const best = entry.told;
  if (best !== undefined) {
    if (level !== best.level) {
      if (level > best.level) {
        return;
      }
    } else if (order !== best.order) {
      if (order > best.order) {
        return;
      }
    } else if (compareKept(rule, vars, best.kept) >= 0) {
      return;
    }
  }
  entry.told = { kept: packed({ rule, vars }), level, order };
};

/** Gives a row a candidate at a level, or takes one away. */
const weigh = (
  run: Run,
  relation: string,
  tuple: Tuple,
  level: number,
  by: number
) => {
  const entry = entryOf(run, relation, tuple, valueKey(tuple));
  bump(entry, level, by);
  mark(run, entry);
  return entry;
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

/** The pair of two values, as a row: the same row whichever comes first. */
const pairRow = (a: unknown, b: unknown): Tuple =>
  valueKey(a) < valueKey(b) ? [a, b] : [b, a];

/**
 * A sink that counts each answer of a rule as a candidate: of the row its
 * head gives, of what it would invent, or of the pairs its head makes one.
 */
const give = (run: Run, rule: CompiledRule, by: number): Sink => {
  const { model } = run;
  if (rule.equates) {
    return (answers) =>
      Effect.gen(function* () {
        for (const vars of answers) {
          const [left, right] = yield* tupleOf(model, rule.head.args, vars);
          const pairs: (readonly [unknown, unknown])[] = [];
          for (const [a, b] of pairsOf(left, right, pairs) ? pairs : []) {
            weigh(run, EDGE, pairRow(a, b), levelOf(vars), by);
          }
        }
      });
  }
  if (rule.invents !== undefined) {
    return (answers) =>
      Effect.forEach(answers, (vars) => trigger(run, rule, vars, by), {
        discard: true,
      });
  }
  if (rule.aggregates.length > 0) {
    return (answers) =>
      Effect.forEach(answers, (vars) => combine(run, rule, vars, by), {
        discard: true,
      });
  }
  const relation = rule.head.relation.name;
  return (answers) =>
    Effect.gen(function* () {
      for (const vars of answers) {
        const tuple =
          plainRow(rule, vars) ??
          (yield* Effect.flatMap(tupleOf(model, rule.head.args, vars), (made) =>
            derivedRow(rule, made)
          ));
        const level = levelOf(vars);
        const entry = weigh(run, relation, tuple, level, by);
        if (by > 0) {
          entry.rule = rule;
          if (run.telling) {
            tell(run, entry, level, rule, vars);
          }
        }
      }
    });
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
    const name = `${relation}\u0000${valueKey(key)}`;
    let fold = support.folds.get(name);
    if (fold === undefined) {
      fold = {
        key,
        levels: new Map(),
        matches: [],
        relation,
        rule,
        since: NEVER,
        versions: [],
      };
      support.folds.set(name, fold);
    }
    const answer = { fold, values };
    const level = levelOf(vars);
    if (run.telling) {
      fold.matches.push([{ rule, vars: bare(vars) }, values]);
    }
    if (!run.shared.has(rule.head)) {
      tally(run, answer, level, by);
      return;
    }
    const order = run.stratum.rules.findIndex(
      (other) => other.head === rule.head
    );
    const row = weigh(run, `${MATCH}${order}`, answerRow(vars), level, by);
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
  for (const [at, [, entry]] of fold.versions.entries()) {
    const until = fold.versions[at + 1]?.[0];
    if (at < from) {
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
      .map(([level, entry]) => [`${level} ${entry.key}`, entry])
  );
  const from = Math.max(0, versions.length - 1);
  let last = versions.at(-1)?.[1].tuple;
  const running = rule.aggregates.map((position) => last?.[position]);
  const levels = [...fold.levels.keys()].filter((level) => level >= since);
  for (const level of levels.sort((a, b) => a - b)) {
    const row = rowAt(fold, level, running, last === undefined);
    if (sameValue(last, row)) {
      continue;
    }
    last = row;
    const name = `${level} ${valueKey(row)}`;
    const entry = before.get(name) ?? weigh(run, relation, row, level, 1);
    before.delete(name);
    entry.rule = rule;
    versions.push([level, entry]);
  }
  for (const [name, entry] of before) {
    support.ends.delete(entry);
    bump(entry, Number(name.slice(0, name.indexOf(" "))), -1);
    mark(run, entry);
  }
  fold.versions = versions;
  endVersions(run, fold, from);
  if (versions.length === 0) {
    support.folds.delete(`${relation}\u0000${valueKey(key)}`);
  }
};

/** What names the answers of a rule that invents: what a row must hold. */
const watchKey = ({ call, order, positions }: Inventor, tuple: Tuple) =>
  `${order}\u0000${call}\u0000${valueKey(positions.map((at) => tuple[at]))}`;

/**
 * Counts an answer of a rule that invents as a candidate of the row that
 * names what it would invent: answers that name the same unknowns are one
 * row, and invent them once.
 */
const trigger = (run: Run, rule: CompiledRule, vars: Vars, by: number) =>
  Effect.gen(function* () {
    const { model, support } = run;
    const chase = support.chase as Chase;
    const order = run.order.get(rule) ?? 0;
    const named = yield* inventedBy(model, rule, vars);
    const entry = weigh(run, `${TRIGGER}${order}`, named, levelOf(vars), by);
    const known = chase.triggers.get(entry);
    if (known !== undefined) {
      if (by > 0 && compareAnswers(rule, vars, known.vars) < 0) {
        known.vars = bare(vars);
      }
      return;
    }
    const heads: (readonly [Atom, Tuple])[] = [];
    const watches: string[] = [];
    for (const [call, head] of headsOf(rule).entries()) {
      const tuple = yield* derivedRow(
        rule,
        yield* tupleOf(model, head.args, vars)
      );
      heads.push([head, tuple]);
      const inventor = run.inventors
        .get(head.relation.name)
        ?.find((one) => one.order === order && one.call === call);
      if (inventor !== undefined) {
        const key = watchKey(inventor, tuple);
        watches.push(key);
        const watching = chase.watching.get(key) ?? new Set<Entry>();
        chase.watching.set(key, watching);
        watching.add(entry);
      }
    }
    chase.triggers.set(entry, {
      active: false,
      gave: [],
      heads,
      rule,
      vars: bare(vars),
      watches,
    });
  });

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
  const { stratum, support } = run;
  const places = placesOf(body, planned);
  const changedAt = delta < 0 ? -1 : planned.indexOf(body[delta] as Literal);
  const owns = places.map(({ name }) =>
    name !== undefined && stratum.members.has(name) ? name : undefined
  );
  const own = (at: number) => owns[at];
  const rows: Reader["rows"] = (at) => {
    if (at === changedAt) {
      return batch?.rows.get((places[at] as Place).name ?? "");
    }
    const name = own(at);
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
      const entry =
        own(at) === undefined ? undefined : support.byRow.get(tuple);
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

/** True for a row that questions about the database can see. */
const shows = (entry: Entry) => entry.placed && entry.until === NEVER;

const note = (run: Run, entry: Entry) => {
  if (!(run.telling || isHidden(entry.relation) || run.was.has(entry))) {
    run.was.set(entry, shows(entry));
  }
};

const setOf = (sets: Map<string, TupleSet>, relation: string) => {
  let rows = sets.get(relation);
  if (rows === undefined) {
    rows = new TupleSet();
    sets.set(relation, rows);
  }
  return rows;
};

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
  const relation = run.relations.get(entry.relation);
  const key = relation?.key;
  if (key === undefined || run.support.chase === undefined) {
    return;
  }
  const values = key.map((position) => entry.tuple[position]);
  const rows = everOf(run, entry.relation) ?? rowsOf(run.model, entry.relation);
  for (const tuple of rows.lookup(key, values)) {
    const other = run.support.byRow.get(tuple);
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
      weigh(run, EDGE, pairRow(a, b), level, by);
    }
  }
};

/** Asks the answers that invent again whose head a row could give. */
const watched = (run: Run, entry: Entry, level: number) => {
  const chase = run.support.chase;
  for (const inventor of run.inventors.get(entry.relation) ?? []) {
    for (const asking of chase?.watching.get(watchKey(inventor, entry.tuple)) ??
      []) {
      if (asking.placed && stageOf(asking.from) >= stageOf(level)) {
        const stage = stageOf(asking.from);
        run.steps.set(stage, (run.steps.get(stage) ?? new Set()).add(asking));
      }
    }
  }
};

/** A pair's two values, by key. */
const endsOf = (entry: Entry) =>
  entry.tuple.map((value) => [valueKey(value), value] as const);

/**
 * Takes back what an answer of a rule that invents invented, and notes
 * whether it invents now.
 */
const invent = (run: Run, asking: Trigger, active: boolean) => {
  for (const [entry, level] of asking.gave) {
    bump(entry, level, -1);
    mark(run, entry);
  }
  asking.gave = [];
  asking.active = active;
};

/** Takes a row from the rows goals read. */
const unplace = (run: Run, entry: Entry, level: number) => {
  const chase = run.support.chase;
  if (entry.relation === EDGE) {
    for (const [key] of endsOf(entry)) {
      chase?.adjacent.get(key)?.delete(entry);
      run.links.add(key);
    }
  } else if (entry.relation.startsWith(MATCH)) {
    const answer = run.support.answers.get(entry);
    if (answer !== undefined) {
      tally(run, answer, entry.from, -1);
    }
  } else if (isHidden(entry.relation)) {
    const asking = chase?.triggers.get(entry);
    if (asking?.active) {
      invent(run, asking, false);
    }
  } else {
    pairUp(run, entry, -1);
    homeOf(run, entry).delete(entry.tuple);
    watched(run, entry, level);
  }
  entry.placed = false;
};

/** Puts a row among the rows goals read. */
const place = (run: Run, entry: Entry, level: number) => {
  const chase = run.support.chase;
  if (entry.relation === EDGE) {
    for (const [key, value] of endsOf(entry)) {
      const edges = chase?.adjacent.get(key) ?? new Set<Entry>();
      chase?.adjacent.set(key, edges);
      edges.add(entry);
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
    homeOf(run, entry).addKeyed(entry.key, entry.tuple);
    watched(run, entry, level);
  }
  entry.placed = true;
};

/** The value a value is written as at a level, when it is another. */
const leastAt = (chase: Chase, key: string, level: number) => {
  let found: unknown;
  for (const [at, least] of chase.history.get(key) ?? []) {
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
    const least = leastAt(chase, valueKey(value), level);
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
  if (tuple !== undefined) {
    const became = weigh(run, entry.relation, tuple, entry.until, 1);
    became.rule ??= entry.rule;
    chase.images.set(entry, [became, entry.until]);
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
    for (const edge of chase.adjacent.get(key) ?? []) {
      edges.add(edge);
      pending.push(...endsOf(edge).map(([end]) => end));
    }
  }
  return { edges, members };
};

/**
 * How each of some values is written over time: the pairs that hold are
 * taken in the order of their levels, each makes two classes one from its
 * level on, and a class is written as its least member. A pair of two
 * values no class can write another way makes nothing one.
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
        const history = (next.get(key) ?? []).filter(
          ([level]) => level !== edge.from
        );
        next.set(key, [...history, [edge.from, winner.least]]);
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
  const changed = [...members.keys()].filter(
    (key) => !sameHistory(chase.history.get(key), next.get(key))
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
    for (const holder of chase.holders.get(key) ?? []) {
      // A row that ended is written with the value's new least member.
      image(run, holder);
      mark(run, holder);
    }
  }
};

const keyMessage = (
  relation: RelationInfo,
  rule: CompiledRule | undefined,
  tuple: Tuple,
  other: Tuple
) => {
  const shown = originalName(relation.name);
  return `"${shown}" is keyed by ${JSON.stringify(keyColumns(relation))}, but ${show(rule?.source)} derived ${show([shown, ...tuple])} while ${show([shown, ...other])} holds.`;
};

/**
 * Says why a row that joined a keyed relation cannot stay: another row has
 * its key. Where rules invent, rows with one key are made one instead.
 */
const keyProblem = (run: Run, entry: Entry) => {
  const relation = run.relations.get(entry.relation);
  const key = relation?.key;
  if (
    relation === undefined ||
    key === undefined ||
    run.support.chase !== undefined ||
    !shows(entry)
  ) {
    return;
  }
  const values = key.map((position) => entry.tuple[position]);
  for (const other of rowsOf(run.model, entry.relation).lookup(key, values)) {
    if (other !== entry.tuple) {
      const shown = originalName(relation.name);
      return (entry.rule?.aggregates.length ?? 0) > 0
        ? `"${shown}" is keyed by ${JSON.stringify(keyColumns(relation))}, but it would hold ${show([shown, ...entry.tuple])} and ${show([shown, ...other])}, which differ in a column that does not merge.`
        : keyMessage(relation, entry.rule, entry.tuple, other);
    }
  }
  return;
};

/**
 * The rows of a level whose time is not what their candidates and values
 * say, each with the time it should have as far as the level tells. A row
 * that is off only higher up waits for that level.
 */
const movingAt = (run: Run, level: number, entries: readonly Entry[]) => {
  const moving: (readonly [Entry, number, number])[] = [];
  for (const entry of entries) {
    entry.queued = TAKEN;
  }
  for (const entry of entries) {
    if (entry.queued !== TAKEN) {
      // Listed twice: once is enough.
      continue;
    }
    entry.queued = NEVER;
    const [from, until] = [wanted(entry), ending(run, entry)];
    if (offAt(entry, from, until) > level) {
      mark(run, entry);
    } else {
      note(run, entry);
      moving.push([entry, from <= level ? from : NEVER, until]);
    }
  }
  return moving;
};

/**
 * Gives each moving row the time it should have, and puts it among the rows
 * goals read when that time is not empty. While a group is derived from
 * nothing, a row that joins a keyed relation beside another with its key is
 * the problem returned.
 */
const join = (
  run: Run,
  level: number,
  moving: readonly (readonly [Entry, number, number])[]
) => {
  const joining: Entry[] = [];
  let problem: string | undefined;
  for (const [entry, from, until] of moving) {
    entry.from = from;
    entry.until = until;
    image(run, entry);
    if (from < until) {
      place(run, entry, level);
      joining.push(entry);
      problem ??= run.telling ? keyProblem(run, entry) : undefined;
    }
  }
  return { joining, problem };
};

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
    const { joining, problem } = join(run, level, moving);
    if (problem !== undefined) {
      return yield* logicError(problem);
    }
    yield* count(run, joining, 1);
    relink(run);
    for (const [entry] of moving) {
      // A row that left and has candidates higher up joins there.
      mark(run, entry);
      if (entry.from === NEVER && entry.n === 0 && !run.was.has(entry)) {
        drop(run, entry);
      }
    }
  });

/** True when a row held at the end of a stage gives the head of an answer. */
const givenBy = (run: Run, asking: Trigger, last: number) =>
  Effect.gen(function* () {
    const { model, support } = run;
    const check = asking.rule.invents?.check ?? [];
    const places = placesOf(check, check);
    let holds = false;
    yield* each(
      model,
      check,
      () =>
        Effect.sync(() => {
          holds = true;
        }),
      asking.vars,
      {
        meet: (_, tuple, vars) => {
          const found = support.byRow.get(tuple);
          return found === undefined ||
            (found.placed && found.from <= last && found.until > last)
            ? vars
            : undefined;
        },
        rows: (at) => everOf(run, (places[at] as Place).name ?? ""),
      }
    );
    return holds;
  });

/**
 * Invents what an answer says exists: each row of its head gets a candidate
 * at a level, and the unknowns it names are the group's own from then on.
 */
const inventAt = (run: Run, entry: Entry, asking: Trigger, level: number) => {
  for (const [head, tuple] of asking.heads) {
    const made = weigh(run, head.relation.name, tuple, level, 1);
    made.rule = asking.rule;
    asking.gave.push([made, level]);
    if (run.telling) {
      tell(run, made, level, asking.rule, asking.vars);
    }
  }
  for (const unknown of entry.tuple) {
    run.support.chase?.invented.add((unknown as Unknown).key);
  }
};

/**
 * Asks the answers of rules that invent that are first held in a stage, at
 * its end: one invents when no row held by then gives its head, and each
 * row of its head is then a candidate at the first level of the next stage.
 */
const step = (run: Run, stage: number, asked: ReadonlySet<Entry>) =>
  Effect.gen(function* () {
    const chase = run.support.chase as Chase;
    for (const entry of asked) {
      const asking = chase.triggers.get(entry);
      const due = entry.placed && stageOf(entry.from) === stage;
      if (asking === undefined || !due) {
        continue;
      }
      const holds = yield* givenBy(run, asking, endOf(stage));
      if (holds !== asking.active) {
        continue;
      }
      invent(run, asking, !holds);
      if (!holds) {
        inventAt(run, entry, asking, (stage + 1) * STAGE);
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
      if (stage !== NEVER && endOf(stage) < level) {
        const asked = steps.get(stage) ?? new Set<Entry>();
        steps.delete(stage);
        yield* step(run, stage, asked);
        continue;
      }
      const problem = improving(run, level);
      if (problem !== undefined) {
        return yield* logicError(problem);
      }
      const entries = dirty.get(level) ?? [];
      dirty.delete(level);
      yield* settleLevel(run, level, entries);
    }
  });

/** Why two rows with one key that could not be made one cannot both hold. */
const clash = (run: Run) => {
  for (const [entry, other] of run.clashes) {
    if (shows(entry) && shows(other)) {
      const [derived, held] =
        entry.rule === undefined ? [other, entry] : [entry, other];
      return keyMessage(
        run.relations.get(entry.relation) as RelationInfo,
        derived.rule,
        derived.tuple,
        held.tuple
      );
    }
  }
  return;
};

/**
 * Ends a run: fails when rows that hold break a key, forgets the entries
 * with no candidate left, and returns what each relation gained and lost.
 */
const finish = (run: Run) =>
  Effect.gen(function* () {
    const gained = new Map<string, TupleSet>();
    const lost = new Map<string, TupleSet>();
    let problem = clash(run);
    for (const [entry, was] of run.was) {
      const held = shows(entry);
      problem ??= held && !was ? keyProblem(run, entry) : undefined;
      if (held !== was) {
        setOf(held ? gained : lost, entry.relation).addKeyed(
          entry.key,
          entry.tuple
        );
      }
      if (entry.from === NEVER && entry.n === 0) {
        drop(run, entry);
      }
    }
    return problem === undefined
      ? { gained, lost }
      : yield* logicError(problem);
  });

/** The entries of a group's facts, each held from the lowest level. */
const startFrom = (run: Run) => {
  for (const name of run.stratum.members) {
    for (const tuple of rowsOf(run.model, name).values()) {
      const entry = entryOf(run, name, tuple, valueKey(tuple));
      entry.fact = true;
      entry.from = 0;
      entry.n = 1;
      entry.placed = true;
    }
  }
};

/** True for a rule that invents values, or makes values one. */
const makesValues = (rule: CompiledRule) =>
  rule.invents !== undefined || rule.equates === true;

/**
 * Says how the rows of a group that made values one came about, as the
 * rules give them from the rows there are.
 */
const retell = (run: Run) => {
  const chase = run.support.chase as Chase;
  const equal = new Map<string, unknown>();
  for (const [key, history] of chase.history) {
    const value = chase.values.get(key);
    const least = history.at(-1)?.[1];
    if (value instanceof Unknown && least !== undefined) {
      equal.set(value.key, least);
    }
  }
  const inventions: Inventions = {
    equal,
    invented: new Set(chase.invented),
  };
  return equal.size === 0
    ? Effect.void
    : justify(run.model, run.stratum.rules, run.relations, inventions);
};

const chaseOf = (): Chase => ({
  adjacent: new Map(),
  history: new Map(),
  holders: new Map(),
  holds: new Map(),
  images: new Map(),
  invented: new Set(),
  triggers: new Map(),
  values: new Map(),
  watching: new Map(),
});

/** Keeps how each row of a group was first given, for `why`. */
const keepTold = ({ model, support }: Run) => {
  for (const [name, entries] of support.entries) {
    const derivations = new Map<string, Kept>();
    for (const entry of entries.values()) {
      const { told } = entry;
      const first = told !== undefined && told.level === entry.from;
      if (told !== undefined && first && shows(entry) && !entry.fact) {
        derivations.set(entry.key, told.kept);
      }
      entry.told = undefined;
    }
    if (!isHidden(name)) {
      model.derivations.set(name, derivations);
    }
  }
};

/**
 * Keeps how each row that combines came about: every answer of its group,
 * or for a row one answer picked, the least answer that gave it.
 */
const keepCombined = ({ model, support }: Run) => {
  const order = compareMatches(model.rules);
  for (const fold of support.folds.values()) {
    const derivations = model.derivations.get(fold.relation);
    const position = fold.rule.aggregates[0] ?? 0;
    const all = {
      matches: fold.matches.map(([match]) => packed(match)),
      rule: fold.rule,
    };
    for (const [, entry] of fold.versions) {
      const picked = selectsAlone(fold.rule)
        ? fold.matches
            .filter(([, [value]]) => sameValue(value, entry.tuple[position]))
            .map(([match]) => match)
            .sort(order)[0]
        : undefined;
      derivations?.set(entry.key, picked === undefined ? all : packed(picked));
    }
    fold.matches = [];
  }
};

/**
 * Derives a group from nothing, on top of its facts: every answer of every
 * rule is a candidate, and the levels are settled lowest first. Keeps how
 * each row was first given, for `why`.
 */
export const deriveRows = (model: Model, stratum: Stratum) =>
  Effect.gen(function* () {
    const support: Support = {
      answers: new Map(),
      byRow: new Map(),
      chase: stratum.rules.some(makesValues) ? chaseOf() : undefined,
      ends: new Map(),
      entries: new Map(),
      folds: new Map(),
      past: new Map(),
    };
    for (const name of stratum.members) {
      model.support.set(name, support);
    }
    const run = runOf(model, stratum, support, true);
    startFrom(run);
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
    keepTold(run);
    keepCombined(run);
    if (support.chase !== undefined) {
      yield* retell(run);
    }
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

/** The name the rows a change reached go by while their answers are counted. */
const REACHED = "\u0000reached";

/**
 * The head places of a rule that name its row: the ones that neither
 * combine, nor ask, nor invent, so their values do not change with what is
 * asked.
 */
const namedBy = (rule: CompiledRule) =>
  rule.head.args.flatMap((arg, position) =>
    rule.aggregates.includes(position) ||
    mentioned(arg).length > 0 ||
    isForm(arg, "some")
      ? []
      : [position]
  );

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
    const { model } = run;
    const positions = namedBy(rule);
    const args = positions.map((position) => rule.head.args[position]);
    const names = yield* reached(run, uses, moved, args);
    if (names.size === 0) {
      return;
    }
    const { columns } = rule.head.relation;
    const goal = new Atom(
      {
        columns: positions.map((position) => columns[position] as string),
        name: REACHED,
      },
      args
    );
    const body = guarded(rule.body, goal);
    model.relations.set(REACHED, names);
    const reader = readerOf(run, rule.body, body);
    for (const [view, by] of [
      [moved.was, -1],
      [undefined, 1],
    ] as const) {
      model.view = view;
      yield* each(model, body, give(run, rule, by), NO_VARS, reader);
    }
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        run.model.relations.delete(REACHED);
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
    const run = runOf(model, stratum, support, false);
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
          weigh(run, name, tuple, 0, by);
        }
      }
    }
    yield* outside(run, movedOf(model, stratum, gained, lost));
    yield* settle(run);
    return yield* finish(run);
  });

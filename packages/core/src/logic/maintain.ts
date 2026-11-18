/**
 * Keeps what a model has derived when facts or rules change, instead of
 * deriving it again from nothing.
 *
 * One rule does it, a group of relations at a time, in the order the groups
 * depend on each other. A changed row reaches every row that an answer
 * using it gave, and every row such an answer would give. The rows it
 * reaches are taken out, and derived again from the facts as they now are.
 * What a group gained and lost is what the groups that read it start from.
 * A group followed this way forgets how its rows came about, which `why`
 * tells as a new derivation would.
 *
 * An answer uses a row when a relation goal matched it, wherever the goal
 * stands in the rule: in its body, under `not`, in a find, in a value, or
 * in its head. A row is named by the head values that ask nothing, so a
 * row whose other values a find or an aggregate gave is reached through
 * those, and its group is combined again. An aggregate that recurses goes
 * on from the rows it has: what is new joins them, round by round.
 *
 * A rule that invents gives a row where no fact holds its head, so a fact
 * of its relation is a row its answers use too.
 *
 * A group whose rules invent into a relation with a key, or beside other
 * rules, or make values one, is followed a component of values at a time
 * (see `components.ts`), when its rules join rows only through the values
 * their variables share.
 *
 * Some groups cannot be followed: one whose rules invent or make values one
 * and join rows some other way; a rule holds a function from the host,
 * which may read anything; or a rule reads a changed relation through
 * something other than a relation goal, such as a schema.
 * Such a group is derived again and compared with what it was, so the
 * groups that read it are still followed, when something has read it since
 * the last change. Otherwise nobody is waiting for it: it is forgotten,
 * with the groups that read it, until something reads it.
 */
import { Effect } from "effect";
import {
  type CompiledRule,
  compilable,
  headsOf,
  type Literal,
  planLiterals,
} from "@/logic/compile";
import { componentwise, followComponents } from "@/logic/components";
import { guarded } from "@/logic/magic";
import {
  type Change,
  changedEach,
  combined,
  derive,
  deriveHeads,
  each,
  forget,
  type Group,
  type Groups,
  inventFor,
  type LogicEffect,
  type Model,
  NO_VARS,
  plainTuple,
  rounds,
  rowsOf,
  type Sink,
  type Step,
  type Tuple,
  TupleSet,
  tupleOf,
  undo,
} from "@/logic/model";
import {
  dependencyEdges,
  isOpaque,
  mentioned,
  reads,
  type Stratum,
} from "@/logic/strata";
import {
  Atom,
  isForm,
  LogicValue,
  LogicVariable,
  ownVariables,
  type RelationInfo,
  valueKey,
} from "@/logic/terms";

/** Rows by the name of their relation. */
export type Rows = Map<string, TupleSet>;

/** What a change did to the rows of every relation, as far as it is known. */
export interface Pass {
  /** The rows each relation gained: facts, and then what groups derived. */
  readonly gained: Rows;
  /** The rows each relation lost. */
  readonly lost: Rows;
  readonly model: Model;
  /** Relations whose rules changed, so their rows are derived again. */
  readonly stale: ReadonlySet<string>;
  /** Relations that changed in a way nobody followed: they were forgotten. */
  readonly unknown: Set<string>;
}

const rowsIn = (rows: Rows, name: string) => {
  let set = rows.get(name);
  if (set === undefined) {
    set = new TupleSet();
    rows.set(name, set);
  }
  return set;
};

/** Adds rows to the rows there are, relation by relation. */
const addAll = (into: Rows, rows: ReadonlyMap<string, TupleSet>) => {
  for (const [name, more] of rows) {
    for (const row of more.values()) {
      rowsIn(into, name).add(row);
    }
  }
};

const some = (rows: Rows) => [...rows.values()].some((set) => set.size > 0);

const changed = ({ gained, lost }: Pass, name: string) =>
  (gained.get(name)?.size ?? 0) > 0 || (lost.get(name)?.size ?? 0) > 0;

/** True when a relation changed in a way that was not followed. */
const untracked = (pass: Pass, { computed, name }: RelationInfo) =>
  computed === undefined
    ? pass.unknown.has(name)
    : computed.dependencies.some(
        (input) => pass.unknown.has(input) || changed(pass, input)
      );

/** The terms of a rule that can read relations: its body and its heads. */
const termsOf = (rule: CompiledRule) => [
  ...rule.body,
  ...headsOf(rule).flatMap(({ args }) => args),
];

const READ = new WeakMap<readonly CompiledRule[], readonly RelationInfo[]>();

/** The relations a group's rules read, worked out once for the group. */
const readBy = (rules: readonly CompiledRule[]) => {
  let read = READ.get(rules);
  if (read === undefined) {
    read = rules.flatMap((rule) => reads(termsOf(rule) as Literal[]));
    READ.set(rules, read);
  }
  return read;
};

let fresh = 0;

/** A variable of its own, which fits any value. */
const anything = () => {
  fresh += 1;
  return new LogicVariable(`_any${fresh}`);
};

const asks = (term: unknown) => mentioned(term).length > 0;

/**
 * A relation goal of a rule's body as a changed row is matched against it:
 * an argument that asks a question fits any value, since what it asks may
 * have changed too.
 */
const relaxed = (goal: Atom) =>
  goal.args.some(asks)
    ? new Atom(
        goal.relation,
        goal.args.map((arg) => (asks(arg) ? anything() : arg))
      )
    : goal;

/**
 * A relation goal that stands inside a question, as a goal of a body: its
 * values and the variables the rule's body can bind stay, and everything
 * else fits any value. `own` are the variables an `exists` around it keeps
 * to itself.
 */
const lifted = (goal: Atom, own: ReadonlySet<string>) =>
  new Atom(
    goal.relation,
    goal.args.map((arg) => {
      if (arg instanceof LogicVariable) {
        return arg.anonymous || own.has(arg.name) ? anything() : arg;
      }
      return arg instanceof LogicValue || asks(arg) ? anything() : arg;
    })
  );

/** The relation goals that stand in a term, however deep, each lifted. */
const goalsIn = (
  term: unknown,
  own: ReadonlySet<string> = new Set()
): Atom[] => {
  if (!(term instanceof LogicValue)) {
    return [];
  }
  const inner = isForm(term, "exists", "some")
    ? new Set([...own, ...ownVariables(term)])
    : own;
  const below = term.read.flatMap((part) => goalsIn(part, inner));
  return term instanceof Atom ? [lifted(term, own), ...below] : below;
};

/**
 * A goal of a rule that a changed row can meet, and the body that finds
 * the answers the row is part of.
 */
interface Use {
  /**
   * True when the goal stands in a question: then a row the relation gains
   * changes what the rule gave, as a row it loses does.
   */
  readonly asked: boolean;
  /** Where the goal stands in `body`. */
  readonly at: number;
  /**
   * The goal, then what the rule's body matches and tests without asking:
   * an answer that another change has ended is still found. Undefined when
   * that cannot be ordered to run, so the goal cannot be followed.
   */
  readonly body: readonly Literal[] | undefined;
  readonly relation: string;
}

/** How a rule reads relations. */
interface Reading {
  /** The relations it mentions other than in a relation goal. */
  readonly loose: ReadonlySet<string>;
  readonly uses: readonly Use[];
}

const READINGS = new WeakMap<CompiledRule, Reading>();

/** A goal in front of some literals, ordered so each can run. */
const ordered = (goal: Atom, rest: readonly Literal[]) =>
  compilable(() =>
    goal.plain
      ? [goal, ...planLiterals(rest, goal.variables)]
      : planLiterals([goal, ...rest])
  );

const use = (goal: Atom, rest: readonly Literal[], asked: boolean): Use => {
  // Tests that cannot run once a question beside them is gone are left
  // out too: the goals alone still find every answer.
  const body =
    ordered(goal, rest) ??
    ordered(
      goal,
      rest.filter((literal) => literal instanceof Atom)
    );
  return {
    asked,
    at: body?.indexOf(goal) ?? 0,
    body,
    relation: goal.relation.name,
  };
};

const readingOf = (rule: CompiledRule): Reading => {
  const known = READINGS.get(rule);
  if (known !== undefined) {
    return known;
  }
  // What the body matches and tests without asking about a relation.
  const plain = new Map<Literal, Literal>();
  for (const literal of rule.body) {
    if (literal instanceof Atom) {
      plain.set(literal, relaxed(literal));
    } else if (!asks(literal)) {
      plain.set(literal, literal);
    }
  }
  const skeleton = [...plain.values()];
  const uses: Use[] = [];
  const goals = new Map<string, number>();
  const count = (goal: Atom) =>
    goals.set(goal.relation.name, (goals.get(goal.relation.name) ?? 0) + 1);
  const questions = (term: unknown) => {
    for (const goal of goalsIn(term)) {
      count(goal);
      uses.push(use(goal, skeleton, true));
    }
  };
  for (const literal of rule.body) {
    const goal = literal instanceof Atom ? plain.get(literal) : undefined;
    if (goal instanceof Atom) {
      count(goal);
      const rest = skeleton.filter((other) => other !== goal);
      uses.push(use(goal, rest, false));
      (literal as Atom).args.map(questions);
    } else {
      questions(literal);
    }
  }
  headsOf(rule)
    .flatMap(({ args }) => args)
    .map(questions);
  // A rule that invents asks whether its head holds already.
  const own = new Set(rule.invents?.names ?? []);
  for (const goal of (rule.invents?.check ?? []).flatMap((literal) =>
    goalsIn(literal, own)
  )) {
    uses.push(use(goal, skeleton, true));
  }
  // A relation mentioned more often than in goals is read some other way.
  const loose = new Set<string>();
  for (const { name } of termsOf(rule).flatMap(mentioned)) {
    goals.set(name, (goals.get(name) ?? 0) - 1);
    if ((goals.get(name) ?? 0) < 0) {
      loose.add(name);
    }
  }
  const reading = { loose, uses };
  READINGS.set(rule, reading);
  return reading;
};

/** True when some rule of a group reads a relation of the group. */
const recurses = ({ members, rules }: Stratum) =>
  rules.some((rule) => reads(rule.body).some(({ name }) => members.has(name)));

/**
 * True when what a group's rules invent can be followed: every rule
 * invents, for one relation call with no key, and none reads what the
 * group derives. Then a row is invented exactly where no fact gives the
 * head, whatever was invented beside it.
 */
const inventsAlone = (stratum: Stratum) =>
  !recurses(stratum) &&
  stratum.rules.every(
    (rule) =>
      rule.invents !== undefined &&
      headsOf(rule).length === 1 &&
      rule.head.relation.key === undefined
  );

/** True for a rule that invents values, or makes values one. */
const makesValues = (rule: CompiledRule) =>
  rule.invents !== undefined || rule.equates === true;

/** True when a group's rows can be followed through a change. */
const follows = (pass: Pass, stratum: Stratum) => {
  const { members, rules } = stratum;
  const moves = (name: string) => members.has(name) || changed(pass, name);
  return (
    rules.every((rule) => {
      const { loose, uses } = readingOf(rule);
      return (
        (makesValues(rule) === false ||
          inventsAlone(stratum) ||
          componentwise(stratum)) &&
        ![...loose].some(moves) &&
        uses.every(
          ({ body, relation }) => body !== undefined || !moves(relation)
        )
      );
    }) && readBy(rules).every((relation) => !untracked(pass, relation))
  );
};

/**
 * The head positions of a rule that name its row: the ones that neither
 * aggregate nor ask, so their values do not change with what is asked.
 */
const named = (rule: CompiledRule) =>
  rule.head.args.flatMap((arg, position) =>
    rule.aggregates.includes(position) || asks(arg) || isForm(arg, "some")
      ? []
      : [position]
  );

/** The name the reached rows go by while a group derives them again. */
const REACHED = "\u0000reached";

/** What a change reaches in a group. */
interface Reached {
  /**
   * For each rule, what names every row an answer that used a changed row
   * gave or would give: the values of the head positions that name a row.
   */
  readonly names: Map<CompiledRule, TupleSet>;
  /** The rows the group holds that those answers gave. */
  readonly rows: Rows;
}

/**
 * Where a search for what a change reaches starts: the rows a group's rules
 * can no longer use. A fact the group lost is reached at once, since a rule
 * may still give the row. The rows other relations lost are put back for
 * the search, so the other goals of a body match what they matched before;
 * `back` takes them out again.
 */
const startOf = (
  { lost, model }: Pass,
  { members, rules }: Stratum,
  reached: Reached,
  back: Change[]
) => {
  const read = new Set(readBy(rules).map(({ name }) => name));
  const wave: Rows = new Map();
  for (const [name, rows] of lost) {
    const own = members.has(name);
    for (const row of read.has(name) || own ? rows.values() : []) {
      if (!own) {
        rowsIn(wave, name).add(row);
        rowsOf(model, name).add(row, back);
      } else if (model.relations.get(name)?.has(row)) {
        rowsIn(reached.rows, name).add(row);
        rowsIn(wave, name).add(row);
      }
    }
  }
  return wave;
};

/**
 * The rows a group holds under a name an answer gave. A row that is a fact
 * holds whatever its rules lost.
 */
const heldAs = (model: Model, rule: CompiledRule, name: Tuple) => {
  const relation = rule.head.relation.name;
  const held = model.relations.get(relation);
  const facts = model.facts.get(relation);
  const positions = named(rule);
  const rows =
    positions.length === rule.head.args.length
      ? [...(held?.has(name) ? [name] : [])]
      : [...(held?.lookup(positions, name) ?? [])];
  return rule.aggregates.length > 0
    ? rows
    : rows.filter((row) => !facts?.has(row));
};

/** Notes what the answers of a rule reach, and passes on the rows they gave. */
const reach =
  (model: Model, rule: CompiledRule, reached: Reached, next: Rows): Sink =>
  (answers) =>
    Effect.gen(function* () {
      const relation = rule.head.relation.name;
      const args = named(rule).map((position) => rule.head.args[position]);
      let names = reached.names.get(rule);
      if (names === undefined) {
        names = new TupleSet();
        reached.names.set(rule, names);
      }
      for (const vars of answers) {
        const name: Tuple =
          plainTuple(args, vars) ?? (yield* tupleOf(model, args, vars));
        for (const row of names.add(name) ? heldAs(model, rule, name) : []) {
          rowsIn(reached.rows, relation).add(row);
          rowsIn(next, relation).add(row);
        }
      }
    });

/** Gives a sink the answers of a rule that used some rows, through one goal. */
const through = (
  model: Model,
  { at, body }: Use,
  rows: TupleSet | undefined,
  sink: Sink
) =>
  rows?.size && body !== undefined
    ? each(model, body, sink, NO_VARS, (position) =>
        position === at ? rows : undefined
      )
    : Effect.void;

/**
 * What one round of a search reaches: the answers that used a row of
 * `wave`, and in the first round, where a row a relation gained changes
 * what a rule gave, the answers that use one of those. `gains` says whether
 * a row a rule's own goals gain changes what the rule gave: it does where
 * the rule's rows are combined again from all their matches.
 */
const round = (
  { gained, model }: Pass,
  rules: readonly CompiledRule[],
  reached: Reached,
  wave: Rows,
  gains: boolean | undefined
) =>
  Effect.gen(function* () {
    const next: Rows = new Map();
    for (const rule of rules) {
      const sink = reach(model, rule, reached, next);
      for (const use of readingOf(rule).uses) {
        yield* through(model, use, wave.get(use.relation), sink);
        // What the relation gained counts once, where it changes what the
        // rule gave.
        const first = gains !== undefined && (use.asked || gains);
        yield* through(
          model,
          use,
          first ? gained.get(use.relation) : undefined,
          sink
        );
      }
    }
    return next;
  });

/**
 * What a change reaches in a group, found round by round: a row that is
 * reached reaches the rows it gave.
 */
const reachedIn = (pass: Pass, stratum: Stratum, gains: boolean) =>
  Effect.suspend(() => {
    const reached: Reached = { names: new Map(), rows: new Map() };
    const back: Change[] = [];
    const search = Effect.gen(function* () {
      let wave = startOf(pass, stratum, reached, back);
      let first: boolean | undefined = gains;
      while (first !== undefined || some(wave)) {
        wave = yield* round(pass, stratum.rules, reached, wave, first);
        first = undefined;
      }
      return reached;
    });
    return search.pipe(Effect.ensuring(Effect.sync(() => undo(back))));
  });

/**
 * A rule's body behind a goal that holds what a change reached of its head:
 * the names its own answers gave, and the names of the reached rows, which
 * another rule of the relation may have given. Undefined when it reached
 * nothing of the rule's.
 */
const reachedBody = (model: Model, rule: CompiledRule, reached: Reached) => {
  const positions = named(rule);
  const { columns, name } = rule.head.relation;
  const names = reached.names.get(rule) ?? new TupleSet();
  for (const row of reached.rows.get(name)?.values() ?? []) {
    names.add(positions.map((position) => row[position]));
  }
  if (names.size === 0) {
    return;
  }
  const goal = new Atom(
    {
      columns: positions.map((position) => columns[position] as string),
      name: `${REACHED}${model.relations.size}`,
    },
    positions.map((position) => rule.head.args[position])
  );
  model.relations.set(goal.relation.name, names);
  return guarded(rule.body, goal);
};

/** Forgets the goals `reachedBody` made. */
const clearReached = (model: Model) => {
  for (const name of [...model.relations.keys()]) {
    if (name.startsWith(REACHED)) {
      model.relations.delete(name);
    }
  }
};

/**
 * Takes the reached rows out of a group, and adds the facts the group
 * gained: a new fact is a row with nothing to explain it. Returns the rows
 * that are new.
 */
const replace = (
  { gained, model }: Pass,
  members: Iterable<string>,
  reached: Reached
) => {
  for (const [name, rows] of reached.rows) {
    for (const row of rows.values()) {
      model.relations.get(name)?.delete(row);
    }
  }
  const added: Rows = new Map();
  for (const name of members) {
    for (const row of gained.get(name)?.values() ?? []) {
      const key = valueKey(row);
      if (model.relations.get(name)?.addKeyed(key, row)) {
        rowsIn(added, name).addKeyed(key, row);
      }
    }
  }
  return added;
};

/**
 * Notes what a group gained and lost: a row that is new and was not there
 * before, and a row that was there and is not any more.
 */
const note = (
  { gained, lost, model }: Pass,
  members: Iterable<string>,
  was: Rows,
  added: Rows
) => {
  for (const name of members) {
    const plus = new TupleSet();
    const minus = new TupleSet();
    for (const row of added.get(name)?.values() ?? []) {
      if (!was.get(name)?.has(row) && model.relations.get(name)?.has(row)) {
        plus.add(row);
      }
    }
    for (const row of was.get(name)?.values() ?? []) {
      if (!model.relations.get(name)?.has(row)) {
        minus.add(row);
      }
    }
    gained.set(name, plus);
    lost.set(name, minus);
  }
};

/** What the rules of a group start from: the rows other groups gained. */
const startFrom = (
  { gained }: Pass,
  members: ReadonlySet<string>,
  added: Rows
) => {
  const start: Rows = new Map(added);
  for (const [name, rows] of gained) {
    if (!members.has(name)) {
      start.set(name, rows);
    }
  }
  return start;
};

/**
 * Follows a change through a group whose rules give a row for each answer:
 * the reached rows are derived again, and new rows go through the rules.
 */
const followRows = (pass: Pass, { members, rules }: Stratum) =>
  Effect.gen(function* () {
    const { model } = pass;
    const reached = yield* reachedIn(pass, { members, rules }, false);
    const added = replace(pass, members, reached);
    for (const rule of rules) {
      const body = reachedBody(model, rule, reached);
      yield* body === undefined
        ? Effect.void
        : deriveHeads(model, rule, (sink) => each(model, body, sink), added);
    }
    clearReached(model);
    const derive: Step = (rule, feed, into) =>
      deriveHeads(model, rule, feed, into);
    const start = startFrom(pass, members, added);
    yield* rounds(model, rules, derive, start, (more) =>
      Effect.sync(() => addAll(added, more))
    );
    note(pass, members, reached.rows, added);
  });

/**
 * Follows a change through a group whose rules invent. What the change
 * reached is taken out, and each rule invents again for the answers that
 * give it, where no fact holds the head.
 */
const followInvented = (pass: Pass, stratum: Stratum) =>
  Effect.gen(function* () {
    const { model } = pass;
    const reached = yield* reachedIn(pass, stratum, true);
    const added = replace(pass, stratum.members, reached);
    for (const rule of stratum.rules) {
      const body = reachedBody(model, rule, reached);
      yield* body === undefined
        ? Effect.void
        : inventFor(model, rule, (sink) => each(model, body, sink), added);
    }
    clearReached(model);
    note(pass, stratum.members, reached.rows, added);
  });

/**
 * Follows a change through a group that aggregates. A group of matches the
 * change reached is combined again from all its matches. Where the
 * aggregates recurse, a group goes on from the row it has: its value moves
 * one way, so what is new joins it, and only a reached group starts over.
 */
const followGroups = (pass: Pass, { members, rules }: Stratum) =>
  Effect.gen(function* () {
    const { model } = pass;
    const recursive = recurses({ members, rules });
    const reached = yield* reachedIn(pass, { members, rules }, !recursive);
    const added = replace(pass, members, reached);
    const was: Rows = new Map(reached.rows);
    const started: [Group, Tuple][] = [];
    const start = (rule: CompiledRule, key: Tuple): Group | undefined => {
      // The row of the group: the one with its head values.
      const row = heldAs(
        model,
        rule,
        named(rule).map((position) => key[position])
      ).find((held) =>
        key.every(
          (value, position) =>
            rule.aggregates.includes(position) ||
            valueKey(held[position]) === valueKey(value)
        )
      );
      if (row === undefined) {
        return;
      }
      const group: Group = {
        key,
        rule,
        tuple: row,
        values: rule.aggregates.map((position) => [row[position]]),
      };
      started.push([group, row]);
      return group;
    };
    const groups: Groups = {
      byKey: new Map(),
      changed: new Set(),
      seen: new Map(),
      ...(recursive ? { start } : {}),
    };
    const news = startFrom(pass, members, added);
    const first = (rule: CompiledRule, sink: Sink) =>
      Effect.gen(function* () {
        const body = reachedBody(model, rule, reached);
        yield* body === undefined ? Effect.void : each(model, body, sink);
        yield* recursive
          ? changedEach(model, rule.body, news, sink)
          : Effect.void;
      });
    addAll(added, yield* combined(model, rules, groups, first));
    clearReached(model);
    for (const [group, row] of started) {
      if (group.tuple !== row) {
        rowsIn(was, group.rule.head.relation.name).add(row);
      }
    }
    note(pass, members, was, added);
  });

/**
 * Derives a group again from nothing and compares it with what it was, so
 * the groups that read it can be followed.
 */
const deriveAgain = (pass: Pass, stratum: Stratum) =>
  Effect.gen(function* () {
    const { gained, lost, model } = pass;
    const was = new Map(
      [...stratum.members].map((name) => [name, rowsOf(model, name)] as const)
    );
    forget(model, stratum.members);
    yield* derive(model, stratum);
    for (const [name, before] of was) {
      const now = rowsOf(model, name);
      const plus = new TupleSet();
      const minus = new TupleSet();
      for (const row of now.values()) {
        if (!before.has(row)) {
          plus.add(row);
        }
      }
      for (const row of before.values()) {
        if (!now.has(row)) {
          minus.add(row);
        }
      }
      gained.set(name, plus);
      lost.set(name, minus);
    }
  });

const BLIND = new WeakMap<Stratum, boolean>();

/**
 * True for a group with a rule that holds a function from the host. What
 * such a function reads is not known, so the rule may read anything that
 * changed.
 */
const isBlind = (stratum: Stratum) => {
  let blind = BLIND.get(stratum);
  if (blind === undefined) {
    blind = stratum.rules.some((rule) => termsOf(rule).some(isOpaque));
    BLIND.set(stratum, blind);
  }
  return blind;
};

/** The order to bring a model's groups up to date in. */
interface Order {
  readonly strata: readonly Stratum[];
  /**
   * The blind groups whose rows can be derived again: every other blind
   * group reads it or is read by it, so when its turn comes, all it can
   * read is up to date.
   */
  readonly sure: ReadonlySet<Stratum>;
}

const ORDERS = new WeakMap<object, Order>();

/**
 * The groups in the order they depend on each other, with the blind ones,
 * and the groups that read those, after every group that does not read a
 * blind one: a blind group may read any of them.
 */
const orderOf = (model: Model): Order => {
  const known = ORDERS.get(model.strata);
  if (known !== undefined) {
    return known;
  }
  const strata = [...new Set(model.strata.values())];
  const edges = dependencyEdges(model.rules);
  const below = new Map<Stratum, Set<string>>();
  for (const stratum of strata) {
    const seen = new Set<string>();
    const pending = [...stratum.members];
    for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
      for (const read of edges.get(name) ?? []) {
        if (!seen.has(read)) {
          seen.add(read);
          pending.push(read);
        }
      }
    }
    below.set(stratum, seen);
  }
  const reads = (stratum: Stratum, other: Stratum) =>
    [...other.members].some((name) => below.get(stratum)?.has(name));
  const blind = strata.filter(isBlind);
  const late = (stratum: Stratum) =>
    blind.some((other) => other === stratum || reads(stratum, other));
  const order = {
    strata: [
      ...strata.filter((stratum) => !late(stratum)),
      ...strata.filter(late),
    ],
    sure: new Set(
      blind.filter((stratum) =>
        blind.every(
          (other) =>
            other === stratum || reads(stratum, other) || reads(other, stratum)
        )
      )
    ),
  };
  ORDERS.set(model.strata, order);
  return order;
};

/** True when a change reaches a group: something it reads is not as it was. */
const reaches = (pass: Pass, stratum: Stratum) =>
  isBlind(stratum) ||
  [...stratum.members].some(
    (name) => pass.stale.has(name) || changed(pass, name)
  ) ||
  readBy(stratum.rules).some(
    (relation) => untracked(pass, relation) || changed(pass, relation.name)
  );

/**
 * What to do with a group a change reaches: follow the change through its
 * rows, derive them again and compare, or forget them. Without the rows it
 * had there is nothing to compare, and when nobody has read it, nobody to
 * compare it for.
 */
const wayFor = (pass: Pass, stratum: Stratum) => {
  const { model, stale } = pass;
  const names = [...stratum.members];
  const blind = isBlind(stratum);
  const done = names.every((name) => model.state.get(name) === "done");
  const renewed = names.some((name) => stale.has(name));
  if (done && !blind && !renewed && follows(pass, stratum)) {
    return "followed";
  }
  const adrift = !done || (blind && !orderOf(model).sure.has(stratum));
  return !adrift && names.some((name) => model.read.has(name))
    ? "derived"
    : "forgotten";
};

/** Follows a change through a group, by what its rules do. */
const followed = (pass: Pass, stratum: Stratum) => {
  if (stratum.rules.some(makesValues)) {
    return inventsAlone(stratum)
      ? followInvented(pass, stratum)
      : followComponents(pass, stratum);
  }
  return stratum.rules.some((rule) => rule.aggregates.length > 0)
    ? followGroups(pass, stratum)
    : followRows(pass, stratum);
};

/** Brings one group up to date with a change, or forgets what it derived. */
const upkeep = (pass: Pass, stratum: Stratum) => {
  const { model, unknown } = pass;
  if (!reaches(pass, stratum)) {
    return Effect.void;
  }
  // What an algorithm computed is of no use once what it read has changed.
  for (const relation of readBy(stratum.rules)) {
    if (relation.computed !== undefined && untracked(pass, relation)) {
      model.computed.delete(relation.name);
      model.relations.delete(relation.name);
    }
  }
  const way = wayFor(pass, stratum);
  for (const name of stratum.members) {
    model.last.set(name, way);
  }
  if (way === "followed") {
    // What was found first before the change is not what a new derivation
    // finds first, so how the rows came about is told again when asked.
    return Effect.tap(followed(pass, stratum), () =>
      Effect.sync(() => {
        for (const name of stratum.members) {
          model.derivations.delete(name);
        }
      })
    );
  }
  if (way === "derived") {
    return deriveAgain(pass, stratum);
  }
  forget(model, stratum.members);
  for (const name of stratum.members) {
    unknown.add(name);
  }
  return Effect.void;
};

/**
 * Brings what a model has derived up to date with a change: the rows each
 * relation `gained` and `lost`, the relations whose rules are `stale`, and
 * the relations another model changed in a way that is `unknown`. Returns
 * what every relation gained and lost. Fails when a rule fails on the new
 * rows; the model is then not to be used again.
 */
export const maintain = (
  model: Model,
  gained: Rows,
  lost: Rows,
  stale: ReadonlySet<string> = new Set(),
  unknown: Iterable<string> = []
): LogicEffect<Pass> =>
  Effect.gen(function* () {
    const pass: Pass = {
      gained,
      lost,
      model,
      stale,
      unknown: new Set(unknown),
    };
    model.last.clear();
    for (const stratum of orderOf(model).strata) {
      yield* upkeep(pass, stratum);
    }
    for (const [name, inputs] of model.computed) {
      if (
        inputs.some((input) => pass.unknown.has(input) || changed(pass, input))
      ) {
        model.computed.delete(name);
        model.relations.delete(name);
      }
    }
    // What the upkeep read, nobody asked for.
    model.read.clear();
    return pass;
  });

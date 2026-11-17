/**
 * Keeps what a model has derived when facts change, instead of deriving it
 * again from nothing.
 *
 * One rule does it, a group of relations at a time, in the order the groups
 * depend on each other. A changed row reaches every row that an answer
 * using it gave, and every row such an answer would give. The rows it
 * reaches are taken out, and derived again from the facts as they now are.
 * What a group gained and lost is what the groups that read it start from.
 *
 * An answer uses a row when a relation goal matched it, and also when a
 * relation goal under `not` matches it, alone or among other goals and
 * tests: the row is why the answer is not one. An aggregated row is reached through its group, so the group is
 * combined again from its matches. New rows also go through the rules in
 * rounds, as they do when a relation is first derived, which is what
 * follows recursion.
 *
 * A group is forgotten instead, with every group that reads it, and derived
 * again the next time something reads it, when its rules ask a question
 * about a relation that changed other than relation goals under `not`,
 * such as a find, when a rule invents, when an aggregate recurses, and
 * when a rule holds a function from the host, which may read anything.
 */
import { Effect } from "effect";
import {
  type CompiledRule,
  compilable,
  headsOf,
  type Literal,
  questionPlans,
} from "@/logic/compile";
import { guarded } from "@/logic/magic";
import {
  addMatches,
  type Change,
  deltaPlan,
  deriveHeads,
  each,
  forget,
  type Groups,
  type LogicEffect,
  type Model,
  NO_VARS,
  plainTuple,
  rounds,
  rowsOf,
  type Sink,
  type Step,
  settle,
  type Tuple,
  TupleSet,
  tupleOf,
  undo,
} from "@/logic/model";
import {
  asked,
  isOpaque,
  mentioned,
  reads,
  type Stratum,
} from "@/logic/strata";
import {
  Atom,
  isForm,
  LogicValue,
  type RelationInfo,
  valueKey,
} from "@/logic/terms";

/** Rows by the name of their relation. */
export type Rows = Map<string, TupleSet>;

/** What a change did to the rows of every relation, as far as it is known. */
interface Pass {
  /** The rows each relation gained: facts, and then what groups derived. */
  readonly gained: Rows;
  /** The rows each relation lost. */
  readonly lost: Rows;
  readonly model: Model;
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

/** The relations a group's rules read. */
const readBy = (rules: readonly CompiledRule[]) =>
  rules.flatMap((rule) =>
    reads(
      rule.body,
      headsOf(rule).flatMap(({ args }) => args)
    )
  );

/**
 * The goals a rule's literal puts under `not`, as the bodies that answer
 * them, when a changed row can be followed through them: each is made of
 * relation goals, and of tests that ask nothing. Undefined otherwise, and
 * for a literal that is not a question under `not`.
 */
const refused = (
  rule: CompiledRule,
  literal: Literal
): readonly (readonly Literal[])[] | undefined => {
  const [goal] = isForm(literal, "not") ? literal.parts : [];
  if (!(goal instanceof LogicValue) || mentioned(goal).length === 0) {
    return;
  }
  // The variables the rest of the body binds are fixed when it is asked.
  const outer = new Set(
    rule.body.flatMap((other) => (other === literal ? [] : other.variables))
  );
  const bodies = compilable(() =>
    questionPlans(goal, (name) => outer.has(name))
  )?.map(({ body }) => body);
  const followed = bodies?.every((body) =>
    body.every((each) =>
      each instanceof Atom ? each.plain : mentioned(each).length === 0
    )
  );
  return followed ? bodies : undefined;
};

/**
 * A goal of a rule's body that a changed row can meet, and the body that
 * finds the answers the row is part of.
 */
interface Use {
  /** Where the goal stands in `body`. */
  readonly at: number;
  /**
   * The rule's body with the goal matching rows, beside the goals that
   * stood under `not` with it, and with no other goal under `not`: an
   * answer another change has ended is still found.
   */
  readonly body: readonly Literal[];
  /**
   * True when a row the relation gains changes what the rule gave, as a
   * row it loses does: the goal is under `not`, or the rule aggregates.
   */
  readonly gains: boolean;
  readonly relation: string;
}

const USES = new WeakMap<CompiledRule, readonly Use[]>();

const usesOf = (rule: CompiledRule) => {
  const known = USES.get(rule);
  if (known !== undefined) {
    return known;
  }
  const matched = rule.body.filter(
    (literal) => refused(rule, literal) === undefined
  );
  const uses = rule.body.flatMap((literal): Use[] => {
    const under = refused(rule, literal);
    const bodies = under?.map((goals) => [...goals, ...matched]) ?? [matched];
    const goals = under?.flat() ?? [literal];
    return bodies.flatMap((body) =>
      body.flatMap((goal, at) =>
        goal instanceof Atom && goals.includes(goal)
          ? [
              {
                at,
                body,
                gains: under !== undefined || rule.aggregates.length > 0,
                relation: goal.relation.name,
              },
            ]
          : []
      )
    );
  });
  USES.set(rule, uses);
  return uses;
};

/**
 * The relations a rule asks about in a way a changed row cannot be
 * followed through: anywhere but as a relation goal, alone or under `not`.
 */
const questions = (rule: CompiledRule) =>
  asked(
    rule.body.flatMap((literal) => refused(rule, literal)?.flat() ?? [literal]),
    headsOf(rule).flatMap(({ args }) => args)
  );

/** True when a group's rows can be followed through a change. */
const follows = (pass: Pass, { members, rules }: Stratum) => {
  const recursive = rules.some((rule) =>
    reads(rule.body).some(({ name }) => members.has(name))
  );
  return (
    rules.every(
      (rule) =>
        rule.invents === undefined &&
        !rule.equates &&
        !(recursive && rule.aggregates.length > 0) &&
        questions(rule).every(
          (relation) =>
            !(untracked(pass, relation) || changed(pass, relation.name))
        )
    ) && readBy(rules).every((relation) => !untracked(pass, relation))
  );
};

/** The head positions of a rule that do not aggregate: they name its row. */
const named = (rule: CompiledRule) =>
  rule.head.args.flatMap((_, position) =>
    rule.aggregates.includes(position) ? [] : [position]
  );

/** The name the reached rows go by while a group derives them again. */
const REACHED = "\u0000reached";

/** What a change reaches in a group. */
interface Reached {
  /**
   * For each relation, what names every row an answer that used a changed
   * row gave or would give: the row, or for an aggregated row, its group.
   */
  readonly names: Rows;
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
        rowsIn(reached.names, name).add(row);
        rowsIn(reached.rows, name).add(row);
        rowsIn(wave, name).add(row);
      }
    }
  }
  return wave;
};

/**
 * The rows a group holds under a name an answer gave: the row itself,
 * unless it is a fact, which holds whatever its rules lost, or for an
 * aggregated row, the row of its group.
 */
const heldAs = (model: Model, rule: CompiledRule, row: Tuple) => {
  const { name } = rule.head.relation;
  const held = model.relations.get(name);
  if (rule.aggregates.length > 0) {
    return [...(held?.lookup(named(rule), row) ?? [])];
  }
  return held?.has(row) && !model.facts.get(name)?.has(row) ? [row] : [];
};

/** Notes what the answers of a rule reach, and passes on the rows they gave. */
const reach =
  (model: Model, rule: CompiledRule, reached: Reached, next: Rows): Sink =>
  (answers) =>
    Effect.gen(function* () {
      const { name } = rule.head.relation;
      const args = named(rule).map((position) => rule.head.args[position]);
      for (const vars of answers) {
        const row: Tuple =
          plainTuple(args, vars) ?? (yield* tupleOf(model, args, vars));
        const fresh = rowsIn(reached.names, name).add(row);
        for (const each of fresh ? heldAs(model, rule, row) : []) {
          rowsIn(reached.rows, name).add(each);
          rowsIn(next, name).add(each);
        }
      }
    });

/** Gives a sink the answers of a rule that used some rows, through one goal. */
const through = (model: Model, use: Use, rows: TupleSet, sink: Sink) => {
  const planned = deltaPlan(use.body, use.at);
  const place = planned.indexOf(use.body[use.at] as Literal);
  return each(model, planned, sink, NO_VARS, (position) =>
    position === place ? rows : undefined
  );
};

/**
 * What one round of a search reaches: the answers that used a row of
 * `wave`, and in the first round, where a row a relation gained changes
 * what a rule gave, the answers that use one of those.
 */
const round = (
  { gained, model }: Pass,
  rules: readonly CompiledRule[],
  reached: Reached,
  wave: Rows,
  first: boolean
) =>
  Effect.gen(function* () {
    const next: Rows = new Map();
    for (const rule of rules) {
      const sink = reach(model, rule, reached, next);
      for (const use of usesOf(rule)) {
        const met = [
          wave.get(use.relation),
          first && use.gains ? gained.get(use.relation) : undefined,
        ];
        for (const rows of met) {
          yield* rows?.size ? through(model, use, rows, sink) : Effect.void;
        }
      }
    }
    return next;
  });

/**
 * What a change reaches in a group, found round by round: a row that is
 * reached reaches the rows it gave.
 */
const reachedIn = (pass: Pass, stratum: Stratum) =>
  Effect.suspend(() => {
    const reached: Reached = { names: new Map(), rows: new Map() };
    const back: Change[] = [];
    const search = Effect.gen(function* () {
      let wave = startOf(pass, stratum, reached, back);
      for (let first = true; first || some(wave); first = false) {
        wave = yield* round(pass, stratum.rules, reached, wave, first);
      }
      return reached;
    });
    return search.pipe(Effect.ensuring(Effect.sync(() => undo(back))));
  });

/** A goal that holds the reached rows of a rule's head, by what names them. */
const reachedGoal = (rule: CompiledRule) => {
  const positions = named(rule);
  const { columns } = rule.head.relation;
  return new Atom(
    {
      columns: positions.map((position) => columns[position] as string),
      name: REACHED,
    },
    positions.map((position) => rule.head.args[position])
  );
};

/**
 * Derives again what a change reached, from the rows as they now are: each
 * rule runs for the rows of its head that were reached, which a goal in
 * front of its body holds. A group of an aggregate gets all its matches,
 * and is combined once.
 */
const deriveAgain = (
  model: Model,
  rules: readonly CompiledRule[],
  names: Rows,
  into: Rows
) =>
  Effect.gen(function* () {
    const groups: Groups = {
      byKey: new Map(),
      changed: new Set(),
      seen: new Map(),
    };
    for (const rule of rules) {
      const reached = names.get(rule.head.relation.name);
      if (reached === undefined || reached.size === 0) {
        continue;
      }
      const body = guarded(rule.body, reachedGoal(rule));
      model.relations.set(REACHED, reached);
      yield* rule.aggregates.length === 0
        ? deriveHeads(model, rule, (sink) => each(model, body, sink), into)
        : each(model, body, (answers) =>
            addMatches(model, groups, rule, answers)
          );
    }
    model.relations.delete(REACHED);
    addAll(into, yield* settle(model, groups));
  });

/** Adds rows to the rows there are, relation by relation. */
const addAll = (into: Rows, rows: ReadonlyMap<string, TupleSet>) => {
  for (const [name, more] of rows) {
    for (const row of more.values()) {
      rowsIn(into, name).add(row);
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
      model.derivations.get(name)?.delete(valueKey(row));
    }
  }
  const added: Rows = new Map();
  for (const name of members) {
    for (const row of gained.get(name)?.values() ?? []) {
      const key = valueKey(row);
      if (model.relations.get(name)?.addKeyed(key, row)) {
        rowsIn(added, name).addKeyed(key, row);
      } else {
        model.derivations.get(name)?.delete(key);
      }
    }
  }
  return added;
};

/**
 * Notes what a group gained and lost: a row that is new and was not one of
 * the reached rows, and a reached row that was not derived again.
 */
const note = (
  { gained, lost, model }: Pass,
  members: Iterable<string>,
  reached: Reached,
  added: Rows
) => {
  for (const name of members) {
    const plus = new TupleSet();
    const minus = new TupleSet();
    for (const row of added.get(name)?.values() ?? []) {
      if (!reached.rows.get(name)?.has(row)) {
        plus.add(row);
      }
    }
    for (const row of reached.rows.get(name)?.values() ?? []) {
      if (!model.relations.get(name)?.has(row)) {
        minus.add(row);
      }
    }
    gained.set(name, plus);
    lost.set(name, minus);
  }
};

/** Follows a change through one group, and notes what the group gained and lost. */
const follow = (pass: Pass, stratum: Stratum) =>
  Effect.gen(function* () {
    const { gained, model } = pass;
    const { members, rules } = stratum;
    const reached = yield* reachedIn(pass, stratum);
    const added = replace(pass, members, reached);
    yield* deriveAgain(model, rules, reached.names, added);
    const start: Rows = new Map(added);
    for (const [name, rows] of gained) {
      if (!members.has(name)) {
        start.set(name, rows);
      }
    }
    // An aggregate does not recurse here, and its groups are combined.
    const derive: Step = (rule, feed, into) =>
      rule.aggregates.length === 0
        ? deriveHeads(model, rule, feed, into)
        : Effect.void;
    yield* rounds(model, rules, derive, start, (more) =>
      Effect.sync(() => addAll(added, more))
    );
    note(pass, members, reached, added);
  });

/** Brings one group up to date with a change, or forgets what it derived. */
const upkeep = (pass: Pass, stratum: Stratum) => {
  const { model, unknown } = pass;
  const { members, rules } = stratum;
  // What a function from the host reads is not known, so a rule that holds
  // one may read anything that changed.
  const blind = rules.some((rule) =>
    [...rule.body, ...rule.head.args].some(isOpaque)
  );
  const touched =
    blind ||
    [...members].some((name) => changed(pass, name)) ||
    readBy(rules).some(
      (relation) => untracked(pass, relation) || changed(pass, relation.name)
    );
  if (!touched) {
    return Effect.void;
  }
  if (
    !blind &&
    [...members].every((name) => model.state.get(name) === "done") &&
    follows(pass, stratum)
  ) {
    return follow(pass, stratum);
  }
  forget(model, members);
  for (const name of members) {
    unknown.add(name);
  }
  return Effect.void;
};

/**
 * Brings what a model has derived up to date with a change to facts: the
 * rows each relation `gained` and `lost`. Fails when a rule fails on the
 * new rows; the model is then not to be used again.
 */
export const maintain = (
  model: Model,
  gained: Rows,
  lost: Rows
): LogicEffect<void> =>
  Effect.gen(function* () {
    const pass: Pass = { gained, lost, model, unknown: new Set() };
    // The groups come in the order they depend on each other.
    for (const stratum of new Set(model.strata.values())) {
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
  });

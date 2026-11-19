/**
 * Keeps what a model has derived when facts or rules change, instead of
 * deriving it again from nothing.
 *
 * A change is followed a group of relations at a time, in the order the
 * groups depend on each other, and what a group gained and lost is what the
 * groups that read it start from. Following a group is the work of
 * `weights.ts`: the change adds and takes away candidates of rows, and the
 * levels rows are held from are settled lowest first. A group followed this
 * way forgets how its rows came about, which `why` tells as a new
 * derivation would.
 *
 * This file says which groups a change reaches, in which order, and what
 * to do with the ones that cannot be followed. An answer uses a row when a
 * relation goal matched it, wherever the goal stands in the rule: in its
 * body, under `not`, in a find, in a value, or in its head. `readingOf`
 * finds every such goal of a rule, with the body that finds the answers a
 * changed row could be part of.
 *
 * Two kinds of group cannot be followed: one that is blind, with a rule
 * that holds a function from the host, which may read anything, or that
 * asks `assuming`, which asks the database as it is now and never as it
 * was before the change, and one with a rule that reads a changed relation
 * through something other than a relation goal, such as a schema. Such a
 * group is derived again and compared with what it was, so the groups that
 * read it are still followed, when something has read it since the last
 * change. Otherwise nobody is waiting for it: it is forgotten, with the
 * groups that read it, until something reads it.
 */
import { Effect } from "effect";
import {
  type CompiledRule,
  compilable,
  headsOf,
  type Literal,
  planLiterals,
} from "@/logic/compile";
import {
  derive,
  forget,
  type LogicEffect,
  type Model,
  rowsOf,
  TupleSet,
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
} from "@/logic/terms";
import { followRows as followWeights, holdsUnknown } from "@/logic/weights";

/** Rows by the name of their relation. */
export type Rows = Map<string, TupleSet>;

/** What a change did to the rows of every relation, as far as it is known. */
export interface Pass {
  /** The rows each relation gained: facts, and then what groups derived. */
  readonly gained: Rows;
  /** The rows each relation lost. */
  readonly lost: Rows;
  readonly model: Model;
  /** True when a fact that holds an unknown came or went. */
  readonly regiven: boolean;
  /** Relations whose rules changed, so their rows are derived again. */
  readonly stale: ReadonlySet<string>;
  /** Relations that changed in a way nobody followed: they were forgotten. */
  readonly unknown: Set<string>;
}

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
export interface Use {
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

export const readingOf = (rule: CompiledRule): Reading => {
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

/** True when a group's rows can be followed through a change. */
const follows = (pass: Pass, stratum: Stratum) => {
  const { members, rules } = stratum;
  const moves = (name: string) => members.has(name) || changed(pass, name);
  return (
    rules.every((rule) => {
      const { loose, uses } = readingOf(rule);
      return (
        ![...loose].some(moves) &&
        uses.every(
          ({ body, relation }) => body !== undefined || !moves(relation)
        )
      );
    }) && readBy(rules).every((relation) => !untracked(pass, relation))
  );
};

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

/** True for a term that asks `assuming`, however deep. */
const assumes = (term: unknown): boolean =>
  isForm(term, "assuming") ||
  (term instanceof LogicValue && term.parts.some(assumes));

/**
 * True for a group with a rule that holds a function from the host, whose
 * reads are not known, so the rule may read anything that changed, or that
 * asks `assuming`, which asks a copy of the database as it is now. Neither
 * can be asked what it gave before the change.
 */
const isBlind = (stratum: Stratum) => {
  let blind = BLIND.get(stratum);
  if (blind === undefined) {
    blind = stratum.rules.some((rule) =>
      termsOf(rule).some((term) => isOpaque(term) || assumes(term))
    );
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
  // Which values a key or an equality rule writes as another depends on
  // which unknowns facts hold.
  (pass.regiven &&
    stratum.rules.some(
      (rule) => rule.invents !== undefined || rule.equates === true
    )) ||
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
  const kept = names.every((name) => model.support.has(name));
  if (done && kept && !blind && !renewed && follows(pass, stratum)) {
    return "followed";
  }
  const adrift = !done || (blind && !orderOf(model).sure.has(stratum));
  return !adrift && names.some((name) => model.read.has(name))
    ? "derived"
    : "forgotten";
};

/** Follows a change through a group, by what its rules do. */
const followed = (pass: Pass, stratum: Stratum) => {
  return Effect.map(
    followWeights(pass.model, stratum, pass.gained, pass.lost, pass.regiven),
    ({ gained, lost }) => {
      for (const name of stratum.members) {
        pass.gained.set(name, gained.get(name) ?? new TupleSet());
        pass.lost.set(name, lost.get(name) ?? new TupleSet());
      }
    }
  );
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
          model.told.delete(name);
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
    const facts = [...gained.values(), ...lost.values()];
    const regiven = facts.some((rows) => [...rows.values()].some(holdsUnknown));
    if (regiven) {
      (model.base ?? model).given = undefined;
    }
    const pass: Pass = {
      gained,
      lost,
      model,
      regiven,
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

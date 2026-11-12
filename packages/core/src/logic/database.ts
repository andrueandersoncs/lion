import { Effect } from "effect";
import { type LogicError, logicError } from "@/errors/evaluation";
import { aggregator, LATTICE_AGGREGATES } from "@/logic/aggregates";
import {
  bindVariables,
  type CompiledQuery,
  type CompiledRule,
  compiling,
  type Literal,
  questionPlans,
} from "@/logic/compile";
import { factsName, rewriteQueries } from "@/logic/magic";
import {
  aggregateKind,
  answer,
  collect,
  distinct,
  EMPTY,
  ensure,
  explain,
  holds,
  keyColumns,
  type LogicEffect,
  Model,
  matches,
  NO_VARS,
  type Tuple,
  TupleSet,
  type Vars,
} from "@/logic/model";
import { type Assertion, assertionProblem } from "@/logic/query-options";
import { asked, components, mentioned, reads } from "@/logic/strata";
import {
  Atom,
  isForm,
  isGroundValue,
  isWaiting,
  LogicValue,
  LogicVariable,
  logicKey,
  makeRelationValue,
  type RelationInfo,
  render,
  show,
  valueKey,
} from "@/logic/terms";
import { LionAskerService } from "@/services/asker";

export interface LogicDatabaseOptions {
  /**
   * Derive only what each query can reach (the default). When false, every
   * query derives every row of the relations it reads, which is useful to
   * compare results.
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
  readonly query: CompiledQuery;
}

/**
 * Relations, base facts, rules, and invariants for one evaluation. What the
 * rules derive is worked out when something reads it, and kept until a fact
 * or rule changes.
 */
export class LogicDatabase {
  readonly relations = new Map<string, RelationInfo>();
  readonly facts = new Map<string, TupleSet>();
  rules: readonly CompiledRule[] = [];
  invariants: readonly Invariant[] = [];
  /** The rows derived so far from the current facts and rules. */
  model: Model | undefined;
  /** Models for goal-directed queries, by query, for the same facts and rules. */
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

/** Forgets what was derived, after the facts or rules changed. */
const touch = (database: LogicDatabase) => {
  database.model = undefined;
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

/**
 * Changes facts with `write`, which gets the facts of a relation to write
 * to and says whether it changed any. While the database has invariants,
 * the change writes to a copy of each fact set it touches, so undoing it
 * puts back the very sets it replaced, with their facts in the same order.
 * Without invariants nothing can fail after the change, so it writes in
 * place.
 */
const changeFacts = (
  database: LogicDatabase,
  describe: string,
  write: (facts: (relation: string) => TupleSet | undefined) => boolean
) =>
  commit(database, describe, () => {
    const replaced = new Map<string, TupleSet>();
    const undo = () => {
      for (const [relation, original] of replaced) {
        database.facts.set(relation, original);
      }
    };
    const changed = write((relation) => {
      const facts = database.facts.get(relation);
      if (
        facts === undefined ||
        database.invariants.length === 0 ||
        replaced.has(relation)
      ) {
        return facts;
      }
      replaced.set(relation, facts);
      const copy = facts.clone();
      database.facts.set(relation, copy);
      return copy;
    });
    if (!changed) {
      undo();
    }
    return changed ? undo : undefined;
  });

const these = (atoms: readonly Atom[]) =>
  atoms.length === 1 ? "this fact" : "these facts";

/** Adds a fact. One whose key is already present replaces the old row. */
const addFact = (facts: TupleSet, { key }: RelationInfo, tuple: Tuple) => {
  let changed = false;
  if (key !== undefined) {
    const keyValues = key.map((position) => tuple[position]);
    for (const old of [...facts.lookup(key, keyValues)]) {
      if (valueKey(old) !== valueKey(tuple)) {
        changed = facts.delete(old) || changed;
      }
    }
  }
  return facts.add(tuple) || changed;
};

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
    yield* changeFacts(database, `Adding ${these(atoms)}`, (facts) => {
      let changed = false;
      for (const [{ relation }, tuple] of tuples) {
        const set = facts(relation.name);
        // The declared relation decides the key, as when the fact was checked.
        const declared = database.relations.get(relation.name) ?? relation;
        changed =
          (set !== undefined && addFact(set, declared, tuple)) || changed;
      }
      return changed;
    });
    return atoms.map(render);
  });

export const retractFacts = (database: LogicDatabase, atoms: readonly Atom[]) =>
  Effect.gen(function* () {
    // Every fact is checked before any is removed, so a retract that fails
    // removes nothing.
    const tuples: (readonly [Atom, Tuple])[] = [];
    for (const atom of atoms) {
      tuples.push([atom, yield* groundTuple(database, atom)] as const);
    }
    const removed: unknown[] = [];
    yield* changeFacts(database, `Retracting ${these(atoms)}`, (facts) => {
      for (const [atom, tuple] of tuples) {
        if (facts(atom.relation.name)?.delete(tuple)) {
          removed.push(render(atom));
        }
      }
      return removed.length > 0;
    });
    return removed;
  });

type Components = readonly Set<string>[];

const componentOf = (ordered: Components, relation: string) =>
  ordered.find((component) => component.has(relation));

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

const computedCycleProblem = (
  rules: readonly CompiledRule[],
  ordered: Components
) => {
  for (const rule of rules) {
    for (const goal of rule.body) {
      const others =
        goal instanceof Atom && goal.relation.computed !== undefined
          ? [...(componentOf(ordered, goal.relation.name) ?? [])].filter(
              (member) => member !== goal.relation.name
            )
          : [];
      if (others.length > 0) {
        return `${computedCall(goal as Atom)} reads relations that depend on its own results, through ${others.map((other) => `"${other}"`).join(", ")}. A computed relation cannot be part of a recursive cycle.`;
      }
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

/** Why a rule that reads its own relation's rows may never finish, if it may. */
const newValueProblem = (rule: CompiledRule) => {
  const fromData = dataBound(rule.body);
  const computed = rule.head.args.find((arg, position) =>
    arg instanceof LogicVariable
      ? !fromData.has(arg.name)
      : arg instanceof LogicValue && !rule.aggregates.includes(position)
  );
  if (computed === undefined) {
    return undefined;
  }
  const what =
    computed instanceof LogicVariable
      ? `a new value for ${show(computed)}`
      : "a new value";
  return `Rule ${show(rule.source)} computes ${what} in its head while recursing, which may never finish. Compute the value in a non-recursive rule, or aggregate it with ${latticeNames("or")}.`;
};

/** Checks one rule's recursion against the rest of the program. */
const recursionProblem = (
  rules: readonly CompiledRule[],
  rule: CompiledRule,
  ordered: Components
) => {
  const head = rule.head.relation.name;
  const component = componentOf(ordered, head) ?? new Set();
  const inCycle = ({ name }: RelationInfo) => component.has(name);
  const recursive = rule.body
    .flatMap((goal) => (goal instanceof Atom ? [goal.relation] : []))
    .find(inCycle);
  const question = asked(rule.body, rule.head.args).find(inCycle);
  if (question !== undefined) {
    return `Rule ${show(rule.source)} asks about "${question.name}", which depends on "${head}". A question, such as a goal under "not", cannot go through recursion.`;
  }
  if (recursive === undefined) {
    return undefined;
  }
  return (
    (rule.aggregates.length > 0
      ? recursiveAggregateProblem(rules, rule, component, recursive.name)
      : undefined) ?? newValueProblem(rule)
  );
};

const checkProgram = (rules: readonly CompiledRule[]) => {
  const ordered = components(rules);
  const problem =
    checkAggregateShapes(rules) ?? computedCycleProblem(rules, ordered);
  if (problem !== undefined) {
    return problem;
  }
  for (const rule of rules) {
    const recursion = recursionProblem(rules, rule, ordered);
    if (recursion !== undefined) {
      return recursion;
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

/**
 * Reads the database's model. While `use` runs, the model also answers the
 * questions that waiting forms ask when they run.
 */
const reading = <A>(
  database: LogicDatabase,
  use: (model: Model) => LogicEffect<A>
): LogicEffect<A> =>
  Effect.suspend(() => {
    database.model ??= new Model(database.facts, database.rules);
    const model = database.model;
    return use(model).pipe(
      Effect.provideService(LionAskerService, {
        answer: (question) => answer(model, question),
      })
    );
  });

/**
 * The model to answer some bodies with, and the bodies to run on it. A body
 * that asks a rule-defined relation about known arguments derives only what
 * it can reach, in a model of its own on top of the database's.
 */
const answering = (
  database: LogicDatabase,
  model: Model,
  bodies: readonly (readonly Literal[])[]
) => {
  const program = database.goalDirected
    ? rewriteQueries(
        database.rules,
        bodies,
        (relation) => (database.facts.get(relation)?.size ?? 0) > 0
      )
    : undefined;
  if (program === undefined) {
    return { bodies, model };
  }
  // A body with no key, one that holds a value with no written form, gets
  // a model that is not kept.
  const key = logicKey(bodies);
  let directed = key === undefined ? undefined : database.goals.get(key);
  if (directed === undefined) {
    directed = new Model(database.facts, program.rules, model);
    for (const relation of program.facts) {
      directed.relations.set(
        factsName(relation),
        database.facts.get(relation) ?? EMPTY
      );
    }
    if (key !== undefined) {
      database.goals.set(key, directed);
    }
  }
  return { bodies: program.bodies, model: directed };
};

/** Every answer of a goal's alternatives. */
const solve = (
  database: LogicDatabase,
  base: Model,
  alternatives: readonly (readonly Literal[])[]
) =>
  Effect.gen(function* () {
    const { bodies, model } = answering(database, base, alternatives);
    const found: Vars[] = [];
    for (const body of bodies) {
      for (const relation of reads(body)) {
        yield* ensure(model, relation);
      }
      for (const vars of yield* matches(model, body)) {
        found.push(vars);
      }
    }
    return found;
  });

/** Runs a query and returns one record per distinct answer. */
export const queryDatabase = (
  database: LogicDatabase,
  { bodies, outputs }: CompiledQuery
) =>
  reading(database, (model) =>
    Effect.gen(function* () {
      const rows = new Map<string, Record<string, unknown>>();
      for (const vars of yield* solve(database, model, bodies)) {
        // An alternative of "or" may leave some of the variables unbound.
        const row = Object.fromEntries(
          outputs.flatMap((name) =>
            vars.has(name) ? [[name, vars.get(name)]] : []
          )
        );
        if (!isGroundValue(row)) {
          return yield* logicError(
            `The query produced an answer that is not JSON data: ${show(row)}.`
          );
        }
        rows.set(valueKey(row), row);
      }
      return [...rows.values()];
    })
  );

/**
 * Answers a question asked outside of any rule or query, where no variable
 * has a value: whether a goal has a match, or what a find finds.
 */
export const askDatabase = (database: LogicDatabase, question: LogicValue) =>
  reading(database, (model) =>
    Effect.gen(function* () {
      const plans = yield* compiling(() =>
        questionPlans(question, () => false)
      );
      const found = yield* solve(
        database,
        model,
        plans.map(({ body }) => body)
      );
      if (!isForm(question, "find")) {
        return found.length > 0;
      }
      // The template may ask questions of its own.
      for (const relation of mentioned(question.parts[0])) {
        yield* ensure(model, relation);
      }
      return yield* collect(
        model,
        question,
        plans.length > 1 ? distinct(found) : found
      );
    })
  );

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
      const rows = yield* queryDatabase(database, invariant.query);
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

/** Explains how a fact was derived, or returns null when it does not hold. */
export const explainFact = (database: LogicDatabase, atom: Atom) =>
  reading(database, (model) =>
    Effect.gen(function* () {
      if (atom.relation.computed === undefined) {
        yield* groundTuple(database, atom);
      } else if (!atom.args.every(isGroundValue)) {
        return yield* logicError(
          `why expects a fact without variables: ${show(atom)}.`
        );
      }
      yield* ensure(model, atom.relation);
      return (yield* holds(model, atom, NO_VARS))
        ? yield* explain(model, atom.relation, atom.args)
        : null;
    })
  );

import { Effect } from "effect";
import {
  asString,
  type LogicError,
  logicError,
  takes,
} from "@/errors/evaluation";
import {
  AGGREGATORS,
  aggregateCall,
  aggregator,
  LATTICE_AGGREGATES,
} from "@/logic/aggregates";
import {
  aggregatesOf,
  type CompiledQuery,
  type CompiledRule,
  compileQuery,
  compileRule,
  compiling,
  equalityGoals,
  headsOf,
  type Literal,
  questionPlans,
  withMerge,
} from "@/logic/compile";
import { why } from "@/logic/explain";
import { checkOf, misfit } from "@/logic/fit";
import { factsName, originalName, rewriteQueries } from "@/logic/magic";
import { maintain, type Pass, type Rows } from "@/logic/maintain";
import {
  aggregateKind,
  answer,
  answerKey,
  type Change,
  changedAnswers,
  EMPTY,
  each,
  forgetBehind,
  found,
  keyColumns,
  type LogicEffect,
  Model,
  readable,
  type Sink,
  type Tuple,
  TupleSet,
  term,
  UNDIRECTED,
  undo,
  type Vars,
} from "@/logic/model";
import {
  type Assertion,
  assertionProblem,
  exampleOf,
} from "@/logic/query-options";
import {
  asked,
  components,
  dependencyEdges,
  equalityHome,
  type Flow,
  flowsOf,
  isOpaque,
  mentioned,
  stronglyConnected,
} from "@/logic/strata";
import {
  Atom,
  compareValues,
  type DeferredCall,
  isForm,
  isGroundValue,
  type LionFunction,
  LogicForm,
  type LogicValue,
  LogicVariable,
  logicKey,
  makeRelationValue,
  nameOf,
  type RelationInfo,
  relationOf,
  render,
  schemaOf,
  show,
  termVariables,
  valueKey,
} from "@/logic/terms";
import { holdsUnknown } from "@/logic/weights";
import { LionAskerService } from "@/services/asker";
import type { LionEnvironmentService } from "@/services/evaluation";

export interface LogicDatabaseOptions {
  /**
   * Derive only what each query can reach (the default). When false, every
   * query derives every row of the relations it reads, which is useful to
   * compare results.
   */
  readonly goalDirected?: boolean;
}

/** Bodies to answer a query with, and the model to run them on. */
interface Asked {
  readonly bodies: readonly (readonly Literal[])[];
  readonly model: Model;
}

/** A goal-directed query's rewritten bodies, and the model they run on. */
export interface GoalModel extends Asked {
  /** The relations whose facts the model's rules read, under other names. */
  readonly facts: ReadonlySet<string>;
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
 * Relations, schemas, base facts, rules, and invariants for one evaluation.
 * What the rules derive is worked out when something reads it, and kept
 * until a fact or rule changes.
 */
export class LogicDatabase {
  readonly relations = new Map<string, RelationInfo>();
  /** The schemas declared with a name, each a predicate on one value. */
  readonly schemas = new Map<string, LionFunction>();
  readonly facts = new Map<string, TupleSet>();
  rules: readonly CompiledRule[] = [];
  invariants: readonly Invariant[] = [];
  /** The rows derived so far from the current facts and rules. */
  model: Model | undefined;
  /**
   * Goal-directed queries, by query, for the same facts and rules: each
   * query's rewritten bodies, and the model they run on.
   */
  readonly goals = new Map<string, GoalModel>();
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

/** What a relation's merge says, as the option writes it: column to aggregate. */
export const mergeOption = (relation: RelationInfo) =>
  relation.merge === undefined
    ? undefined
    : Object.fromEntries(
        relation.merge.map(([position, kind]) => [
          relation.columns[position],
          `aggregate/${kind}`,
        ])
      );

const describeRelation = (relation: RelationInfo) => {
  const columns = `columns ${JSON.stringify(relation.columns)}`;
  const key =
    relation.key === undefined
      ? ""
      : ` and key ${JSON.stringify(keyColumns(relation))}`;
  const merge =
    relation.merge === undefined
      ? ""
      : ` and merge ${JSON.stringify(mergeOption(relation))}`;
  return `${columns}${key}${merge}`;
};

const MERGES = Object.keys(AGGREGATORS).map((kind) => `"aggregate/${kind}"`);

/**
 * What is wrong with a relation's merge: it needs a key, and names columns
 * outside the key, each with an aggregate. Every aggregate combines a key's
 * candidates counted, so what it gives does not depend on their order; only
 * a lattice aggregate can also go through recursion.
 */
const mergeProblem = (
  name: string,
  columns: readonly string[],
  key: readonly string[] | undefined,
  merge: readonly (readonly [string, string])[]
) => {
  if (key === undefined) {
    return `Relation "${name}" merges the rows a key gets, so it needs a key, as in {"key": ["id"], "merge": {...}}.`;
  }
  for (const [column, kind] of merge) {
    if (!columns.includes(column)) {
      return `Relation "${name}" has no column "${column}" to merge. Its columns are ${JSON.stringify(columns)}.`;
    }
    if (key.includes(column)) {
      return `Relation "${name}" cannot merge "${column}": it is part of the key, and the key says which rows merge.`;
    }
    if (!MERGES.includes(JSON.stringify(kind))) {
      return `Relation "${name}" merges "${column}" with ${JSON.stringify(kind)}, but a merge combines values with an aggregate, such as "aggregate/sum" or "aggregate/min".`;
    }
  }
  return;
};

/**
 * The rule that makes a relation's facts the candidates of its merge: it
 * reads them under `factsName`, and its head joins each merged column. Its
 * source is the relation's declaration, which is what makes facts combine.
 */
export const factsRule = (relation: RelationInfo): CompiledRule => {
  const vars = relation.columns.map(
    (_, position) => new LogicVariable(`_fact${position}`)
  );
  const kinds = new Map(relation.merge ?? []);
  const merge = mergeOption(relation);
  return {
    aggregates: [...kinds.keys()].sort((a, b) => a - b),
    body: [
      new Atom(
        { columns: relation.columns, name: factsName(relation.name) },
        vars
      ),
    ],
    given: true,
    head: new Atom(
      relation,
      vars.map((variable, position) => {
        const kind = kinds.get(position);
        return kind === undefined ? variable : aggregateCall(kind, variable);
      })
    ),
    source: [
      "relation",
      relation.name,
      relation.columns,
      { key: keyColumns(relation), ...(merge === undefined ? {} : { merge }) },
    ],
  };
};

export const declareRelation = (
  database: LogicDatabase,
  name: string,
  columns: readonly string[],
  key?: readonly string[],
  merge?: readonly (readonly [string, string])[]
): Effect.Effect<RelationInfo, LogicError> => {
  if (new Set(columns).size !== columns.length) {
    return logicError(`Relation "${name}" repeats a column name.`);
  }
  if (database.schemas.has(name)) {
    return logicError(
      `"${name}" is a schema here, so it cannot also name a relation.`
    );
  }
  const used = database.relations.has(name)
    ? undefined
    : usedAsString(database, name, "Relation");
  if (used !== undefined) {
    return logicError(used);
  }
  const problem =
    (key === undefined ? undefined : keyProblem(name, columns, key)) ??
    (merge === undefined || merge.length === 0
      ? undefined
      : mergeProblem(name, columns, key, merge));
  if (problem !== undefined) {
    return logicError(problem);
  }
  const relation: RelationInfo = {
    name,
    columns: [...columns],
    ...(key === undefined
      ? {}
      : { key: key.map((column) => columns.indexOf(column)) }),
    ...(merge === undefined || merge.length === 0
      ? {}
      : {
          merge: merge
            .map(
              ([column, kind]) =>
                [
                  columns.indexOf(column),
                  kind.slice("aggregate/".length),
                ] as const
            )
            .sort(([a], [b]) => a - b),
        }),
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
  if (relation.merge !== undefined) {
    database.rules = [...database.rules, factsRule(relation)];
    touch(database);
  }
  return Effect.succeed(relation);
};

/**
 * The Lion value bound to a relation's name: calling it with one term per
 * column builds a goal.
 */
export const relationValue = (relation: RelationInfo) =>
  makeRelationValue(
    relation,
    takes(
      relation.columns.length,
      (...args: unknown[]) => Effect.succeed(new Atom(relation, args)),
      relation.columns.join(", ")
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

/**
 * Why nothing can be declared under a name: a schema already uses it as a
 * string. What a shape's strings mean never changes, so the name stays free.
 */
const usedAsString = (
  database: LogicDatabase,
  name: string,
  kind: "Relation" | "Schema"
) => {
  for (const [user, schema] of database.schemas) {
    if (schemaOf(schema)?.strings.has(name)) {
      const together =
        kind === "Schema"
          ? `, or when the two name each other, declare them in one form: ["schema", "${user}", shape, "${name}", shape]`
          : "";
      return `${kind} "${name}" cannot be declared: schema "${user}" was declared with "${name}" as a plain string, since nothing had that name then. Declare "${name}" before "${user}"${together}. To keep the string, write ["quote", "${name}"] in the shape.`;
    }
  }
  return undefined;
};

/** A schema to declare: what its shape was written as, and evaluated to. */
export interface SchemaDeclaration {
  readonly definition: DeferredCall;
  readonly schema: LionFunction;
  readonly shape: unknown;
  /** The strings the shape uses as data. */
  readonly strings: readonly string[];
}

/**
 * Declares the schemas of one form, which can name each other. A schema the
 * database already holds under a name must have been written the same way,
 * and stays the one the name stands for, so declaring it again changes
 * nothing. Either every schema is declared, or none is.
 */
export const declareSchemas = (
  database: LogicDatabase,
  declarations: readonly SchemaDeclaration[]
): Effect.Effect<readonly LionFunction[], LogicError> => {
  const names = declarations.map(({ schema }) => schemaOf(schema)?.name ?? "");
  const fresh: SchemaDeclaration[] = [];
  for (const [index, declaration] of declarations.entries()) {
    const name = names[index] ?? "";
    if (database.relations.has(name)) {
      return logicError(
        `"${name}" is a relation here, so it cannot also name a schema.`
      );
    }
    const held = database.schemas.get(name);
    if (held === undefined) {
      const used = usedAsString(database, name, "Schema");
      if (used !== undefined) {
        return logicError(used);
      }
      fresh.push(declaration);
      continue;
    }
    const before = schemaOf(held)?.definition;
    const key = logicKey(before);
    if (key === undefined || key !== logicKey(declaration.definition)) {
      return logicError(
        `Schema "${name}" is already declared as ${show(before)}.`
      );
    }
  }
  // The schemas a form adds are written together by a snapshot. One the
  // database held before was written with the form that added it.
  const group = fresh.map(({ schema }) => schemaOf(schema)?.name ?? "");
  for (const { definition, schema, shape, strings } of fresh) {
    const info = schemaOf(schema);
    if (info !== undefined) {
      info.definition = definition;
      info.group = group;
      info.shape = shape;
      info.strings = new Set(strings);
      database.schemas.set(info.name, schema);
    }
  }
  return Effect.succeed(
    names.flatMap((name) => database.schemas.get(name) ?? [])
  );
};

/** A binding for every schema declared in the database. */
export const schemaBindings = (database: LogicDatabase) =>
  Object.fromEntries(database.schemas);

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
  const at = atom.args.findIndex((arg) => !isGroundValue(arg));
  return at < 0
    ? Effect.succeed(atom.args)
    : logicError(
        `Facts may only contain data, but the "${atom.relation.columns[at]}" of ${show(atom)} is ${notData(atom.args[at])}`
      );
};

/** The kind of function a name stands for. */
const kindOf = (fn: unknown) => {
  if (relationOf(fn) !== undefined) {
    return "relation";
  }
  return schemaOf(fn) === undefined ? "function" : "schema";
};

/**
 * What an argument is, when it is not data. A string that is a name is the
 * usual cause: it evaluated to what it names, so the message says how to
 * write the string itself.
 */
const notData = (arg: unknown) => {
  const [kind, name] =
    arg instanceof LogicVariable
      ? ["logic variable", `?${arg.name}`]
      : [kindOf(arg), nameOf(arg)];
  return name === undefined
    ? `${show(arg)}, which ${termVariables(arg).length > 0 ? "waits for a logic variable" : "is not data"}.`
    : `the ${kind} "${name}". ${asString(name)}`;
};

/** Forgets what was derived. */
const touch = (database: LogicDatabase) => {
  database.model = undefined;
  database.goals.clear();
};

const isAggregated = (rules: readonly CompiledRule[], relation: string) =>
  rules.some(
    (rule) => rule.head.relation.name === relation && rule.aggregates.length > 0
  );

const CANDIDATES = new WeakMap<readonly CompiledRule[], ReadonlySet<string>>();

/**
 * The relations whose facts are candidates of a merge, not rows: those the
 * rules give a rule that reads their facts, by a relation's declaration or
 * by the rules that aggregate into it.
 */
export const candidateRelations = (
  rules: readonly CompiledRule[]
): ReadonlySet<string> => {
  let names = CANDIDATES.get(rules);
  if (names === undefined) {
    names = new Set(
      rules.flatMap((rule) => (rule.given ? [rule.head.relation.name] : []))
    );
    CANDIDATES.set(rules, names);
  }
  return names;
};

/** The rules as written: without what a merge made of them. */
export const writtenRules = (rules: readonly CompiledRule[]) =>
  rules.flatMap((rule) => (rule.implied ? [] : [rule.written ?? rule]));

/**
 * The rules the database runs, from the rules as written. A relation whose
 * rules aggregate merges what each key gets with those aggregates, as a
 * relation that declares a merge does: every rule that gives it a row
 * gives a candidate, and so does every fact, which a rule of its own reads.
 * So the rules a relation has, and the order they came in, never decide
 * whether it can have facts or plain rules.
 */
const effectiveRules = (
  database: LogicDatabase,
  written: readonly CompiledRule[]
): CompiledRule[] | string => {
  const merges = new Map<string, Merge>();
  for (const rule of written) {
    const { name } = rule.head.relation;
    const declared = database.relations.get(name);
    if (
      rule.aggregates.length > 0 &&
      declared?.merge === undefined &&
      !merges.has(name)
    ) {
      merges.set(
        name,
        rule.aggregates.map(
          (position) => [position, aggregateKind(rule, position)] as const
        )
      );
    }
  }
  if (merges.size === 0) {
    return [...written];
  }
  const rules: CompiledRule[] = [];
  for (const rule of written) {
    const merge = merges.get(rule.head.relation.name);
    if (merge === undefined || rule.aggregates.length > 0 || rule.equates) {
      rules.push(rule);
    } else if (rule.invents === undefined) {
      rules.push(
        made(MERGED, rule, merge, () => {
          const head = withMerge(rule.head, merge);
          return {
            ...rule,
            aggregates: aggregatesOf(head),
            head,
            written: rule,
          };
        })
      );
    } else {
      return `Rule ${show(rule.source)} invents a value for "${rule.head.relation.name}", whose rules aggregate. A rule that invents values cannot give a row of a relation that aggregates.`;
    }
  }
  for (const [name, merge] of merges) {
    const relation = database.relations.get(name);
    if (relation !== undefined) {
      rules.push(
        made(IMPLIED, relation, merge, () => ({
          ...factsRule({ ...relation, merge }),
          implied: true,
        }))
      );
    }
  }
  return rules;
};

type Merge = readonly (readonly [number, string])[];

/**
 * The rules a merge makes, kept for what they are made from, so a change to
 * other rules leaves them the same rules, and a group of relations whose
 * rules are the same keeps what it derived.
 */
const MERGED = new WeakMap<object, Map<string, CompiledRule>>();
const IMPLIED = new WeakMap<object, Map<string, CompiledRule>>();

const made = (
  kept: WeakMap<object, Map<string, CompiledRule>>,
  from: object,
  merge: Merge,
  make: () => CompiledRule
) => {
  const key = JSON.stringify(merge);
  let byMerge = kept.get(from);
  if (byMerge === undefined) {
    byMerge = new Map();
    kept.set(from, byMerge);
  }
  let rule = byMerge.get(key);
  if (rule === undefined) {
    rule = make();
    byMerge.set(key, rule);
  }
  return rule;
};

/**
 * Undoes a change to the database, or is undefined when the change left the
 * database as it was.
 */
type Undo = (() => void) | undefined;

/** What a change to facts did. */
interface FactChange {
  /**
   * The rows each relation gained and lost. Worked out only when something
   * asks, so a change pays nothing for it otherwise.
   */
  readonly net: () => { readonly gained: Rows; readonly lost: Rows };
  /** The relations whose facts the change wrote to. */
  readonly touched: ReadonlySet<string>;
}

/**
 * The rows each relation gained and lost in a logged change. A row the
 * change added and removed again, or removed and added again, is neither.
 */
const netOf = (
  database: LogicDatabase,
  touched: ReadonlySet<string>,
  log: readonly Change[]
) => {
  const names = new Map<TupleSet, string>();
  for (const name of touched) {
    const facts = database.facts.get(name);
    if (facts !== undefined) {
      names.set(facts, name);
    }
  }
  const counts = new Map<string, Map<string, [Tuple, number]>>();
  for (const [set, tuple, , added] of log) {
    const name = names.get(set) ?? "";
    const rows = counts.get(name) ?? new Map<string, [Tuple, number]>();
    const key = valueKey(tuple);
    const [, count] = rows.get(key) ?? [tuple, 0];
    rows.set(key, [tuple, count + (added ? 1 : -1)]);
    counts.set(name, rows);
  }
  const gained: Rows = new Map();
  const lost: Rows = new Map();
  for (const [name, rows] of counts) {
    for (const [key, [tuple, count]] of rows) {
      const into = count > 0 ? gained : lost;
      if (count !== 0) {
        const set = into.get(name) ?? new TupleSet();
        set.addKeyed(key, tuple);
        into.set(name, set);
      }
    }
  }
  return { gained, lost };
};

/** What a change to facts did to the rows of the relations it wrote to. */
type Net = ReturnType<FactChange["net"]>;

/**
 * How many goal-directed queries a database follows through a change. With
 * more, following them all costs more than answering one again does.
 */
const MOST_GOALS = 32;

/**
 * Follows a change through the rows a goal-directed query derived, and says
 * whether it could. The query's rules read facts under names of their own,
 * and read what the database's model derived in full, which the change was
 * followed through first.
 */
const followGoal = (
  { facts, model }: GoalModel,
  pass: Pass,
  net: Net,
  touched: ReadonlySet<string>
) => {
  // A relation that got its first facts since the query's rules were made
  // has no rule here that reads them.
  const unread = [...touched].some(
    (name) =>
      !facts.has(name) &&
      [...model.strata.keys()].some((copy) => originalName(copy) === name)
  );
  if (unread) {
    return Effect.succeed(false);
  }
  const gained = new Map(pass.gained);
  const lost = new Map(pass.lost);
  for (const name of touched) {
    gained.set(factsName(name), net.gained.get(name) ?? new TupleSet());
    lost.set(factsName(name), net.lost.get(name) ?? new TupleSet());
  }
  return maintain(model, gained, lost, new Set(), pass.unknown).pipe(
    Effect.map(({ broken }) => broken === undefined),
    Effect.catch(() => Effect.succeed(false))
  );
};

/**
 * The goal-directed queries a change that gave rows breaking a key was not
 * followed through, kept aside while the change is checked, with the model
 * the change was followed through. When the change is refused, following it
 * back through the model gives what was derived before, and the queries are
 * what they were; when it is kept, they are forgotten.
 */
interface Aside {
  readonly goals: ReadonlyMap<string, GoalModel>;
  readonly model: Model;
}

/**
 * The rows a change gave each relation, under the names a model reads them
 * by: the facts of a relation that merges are the candidates its rule
 * reads, under their own name, and not its rows.
 */
const givenTo = (database: LogicDatabase, rows: Rows) => {
  const candidates = candidateRelations(database.rules);
  return new Map(
    [...rows].map(([name, set]) => [
      candidates.has(name) ? factsName(name) : name,
      set,
    ])
  );
};

/**
 * Brings what was derived up to date with a change to facts: the database's
 * model, and then each goal-directed query's. When a rule fails on the new
 * facts, what was derived is forgotten: the next reader derives it again,
 * and is the one a failing rule fails. Rows that break a key are kept, and
 * a question about them fails at once; the goal-directed queries, which
 * may read them, are set aside, so that a refusal can follow the change
 * back and find them as they were.
 */
const follow = (
  database: LogicDatabase,
  net: Net,
  touched: ReadonlySet<string>
): Effect.Effect<Aside | undefined, never, LionEnvironmentService> =>
  Effect.suspend(() => {
    const { goals, model } = database;
    // A change made while rules run finds their rows half derived.
    const running = [...(model?.state.values() ?? [])].includes("running");
    if (model === undefined || running) {
      touch(database);
      return Effect.succeed(undefined);
    }
    if (goals.size > MOST_GOALS) {
      goals.clear();
    }
    return Effect.gen(function* () {
      const pass = yield* maintain(
        model,
        givenTo(database, net.gained),
        givenTo(database, net.lost)
      );
      if (pass.broken !== undefined) {
        const aside = { goals: new Map(goals), model };
        goals.clear();
        return aside;
      }
      for (const [key, goal] of [...goals]) {
        if (!(yield* followGoal(goal, pass, net, touched))) {
          goals.delete(key);
        }
      }
      return undefined;
    }).pipe(
      Effect.catch(() =>
        Effect.sync(() => {
          touch(database);
          return undefined;
        })
      )
    );
  });

/**
 * Follows a refused change back through the model it was followed through,
 * so every row has the candidates it had, past the groups it set aside,
 * which are as they were, and gives back the goal-directed queries.
 */
const followBack = (database: LogicDatabase, aside: Aside, net: Net) =>
  Effect.suspend(() => {
    const { goals, model } = aside;
    database.goals.clear();
    if (database.model !== model) {
      touch(database);
      return Effect.void;
    }
    for (const [key, goal] of goals) {
      database.goals.set(key, goal);
    }
    return maintain(
      model,
      givenTo(database, net.gained),
      givenTo(database, net.lost),
      new Set(),
      [],
      true
    ).pipe(
      Effect.asVoid,
      Effect.catch(() => Effect.sync(() => touch(database)))
    );
  });

/**
 * Takes one relation's rows over to a model of new rules, when the old model
 * held them, and with them the candidates that give them, when its rules
 * are what they were.
 */
const keep = (
  before: Model,
  next: Model,
  name: string,
  held: boolean,
  same: boolean
) => {
  const rows = before.relations.get(name) ?? before.facts.get(name);
  if (held && rows !== undefined) {
    next.state.set(name, "done");
    next.relations.set(name, rows);
  }
  const support = before.support.get(name);
  if (held && same && support !== undefined) {
    next.support.set(name, support);
  }
  if (before.read.has(name)) {
    next.read.add(name);
  }
};

/**
 * Takes what a model derived over to a model of new rules, and returns the
 * relations whose rules are not what they were. A group of relations with
 * the rules it had keeps its rows, and `why` derives them again to tell how
 * they came about. A group whose rules changed takes its rows along to be
 * compared with what the new rules give.
 */
const carry = (before: Model, next: Model) => {
  const stale = new Set<string>();
  for (const { members, rules } of new Set(next.strata.values())) {
    const names = [...members];
    const old = before.strata.get(names[0] ?? "");
    const same =
      old !== undefined &&
      old.members.size === members.size &&
      names.every((name) => old.members.has(name)) &&
      old.rules.length === rules.length &&
      old.rules.every((rule, at) => rule === rules[at]);
    // A relation that had no rules held its facts, which it still has.
    const held = names.every(
      (name) => before.state.get(name) === "done" || !before.strata.has(name)
    );
    for (const name of names) {
      if (!same) {
        stale.add(name);
      }
      keep(before, next, name, held, same);
    }
  }
  for (const [name, inputs] of before.computed) {
    next.computed.set(name, inputs);
    next.relations.set(name, before.relations.get(name) ?? EMPTY);
  }
  return stale;
};

/**
 * Brings what was derived up to date with a change to rules: a relation
 * whose rules changed is derived again and compared with what it was, and
 * what it gained and lost is followed through the relations that read it.
 */
const renew = (database: LogicDatabase, before: Model | undefined) =>
  Effect.suspend(() => {
    const running = [...(before?.state.values() ?? [])].includes("running");
    touch(database);
    if (before === undefined || running) {
      return Effect.void;
    }
    const next = modelOf(database);
    const stale = carry(before, next);
    database.model = next;
    return maintain(next, new Map(), new Map(), stale).pipe(
      Effect.asVoid,
      Effect.catch(() => Effect.sync(() => touch(database)))
    );
  });

/** How what was derived keeps up with a change, and with its undoing. */
interface Upkeep {
  readonly after: Effect.Effect<void, never, LionEnvironmentService>;
  readonly undone: Effect.Effect<void, never, LionEnvironmentService>;
}

/**
 * Makes a change, then checks the invariants it can break: all of them, or
 * for a change to facts, the ones that read what `facts` says it touched.
 * When a check fails, or an invariant does not hold, the change is undone,
 * so a form that changes the database either completes or leaves the
 * database as it was. `describe` starts the message, such as "Adding this
 * rule".
 */
const commit = (
  database: LogicDatabase,
  describe: string,
  change: () => Undo,
  upkeep: Upkeep,
  facts?: FactChange
) =>
  Effect.suspend(() => {
    const undo = change();
    if (undo === undefined) {
      return Effect.void;
    }
    return upkeep.after.pipe(
      Effect.andThen(
        checkInvariants(
          database,
          database.invariants,
          `${describe} breaks an invariant, so nothing changed.`,
          facts
        )
      ),
      // Kept, the change leaves the rows it was not followed through stale.
      Effect.tap(() =>
        Effect.sync(() => {
          if (database.model !== undefined) {
            forgetBehind(database.model);
          }
        })
      ),
      Effect.onError(() =>
        Effect.suspend(() => {
          undo();
          return upkeep.undone;
        })
      )
    );
  });

/** The rules and invariants a change gives the database. */
interface Program {
  readonly invariants: readonly Invariant[];
  readonly rules: readonly CompiledRule[];
}

/**
 * Makes one change: to facts with `write`, which gets the facts of a
 * relation to write to and says whether it changed any, and with `program`
 * to the rules and invariants. Each tuple the change adds or removes is
 * logged: undoing the change takes it back tuple by tuple, which leaves
 * every fact where it was. What was derived is brought up to date with just
 * those tuples, and the relations whose rules changed are derived again; a
 * change to both forgets what was derived. With no invariant that could
 * refuse the change and nothing derived, nobody asks what changed, so
 * nothing is logged.
 */
const changeDatabase = (
  database: LogicDatabase,
  describe: string,
  write: (
    facts: (relation: string) => TupleSet | undefined,
    log: Change[] | undefined
  ) => boolean,
  program?: Program
) => {
  const touched = new Set<string>();
  const { invariants, model: before, rules } = database;
  let log: Change[] | undefined;
  let net: Net | undefined;
  const change = () => {
    log =
      (program?.invariants ?? invariants).length === 0 &&
      database.model === undefined
        ? undefined
        : [];
    const changed = write((relation) => {
      const facts = database.facts.get(relation);
      if (!touched.has(relation)) {
        touched.add(relation);
        facts?.tidy();
      }
      return facts;
    }, log);
    database.rules = program?.rules ?? rules;
    database.invariants = program?.invariants ?? invariants;
    return changed || program !== undefined
      ? () => {
          database.rules = rules;
          database.invariants = invariants;
          undo(log ?? []);
        }
      : undefined;
  };
  const facts = {
    net: () => {
      net ??= netOf(database, touched, log ?? []);
      return net;
    },
    touched,
  };
  // What the change gained is what undoing it loses.
  const back = () => ({ gained: facts.net().lost, lost: facts.net().gained });
  let aside: Aside | undefined;
  const upkeep =
    program === undefined
      ? {
          after: Effect.map(
            Effect.suspend(() => follow(database, facts.net(), touched)),
            (kept) => {
              aside = kept;
            }
          ),
          undone: Effect.suspend(() =>
            aside === undefined
              ? Effect.asVoid(follow(database, back(), touched))
              : followBack(database, aside, back())
          ),
        }
      : {
          after: Effect.suspend(() =>
            touched.size > 0
              ? Effect.sync(() => touch(database))
              : renew(database, before)
          ),
          undone: Effect.sync(() => touch(database)),
        };
  return commit(
    database,
    describe,
    change,
    upkeep,
    program === undefined ? facts : undefined
  );
};

const these = (atoms: readonly Atom[]) =>
  atoms.length === 1 ? "this fact" : "these facts";

/**
 * Adds a fact. One whose key is already present replaces the old row,
 * unless the relation declares a merge: then every fact is a candidate, and
 * the key holds their join. Only the declaration decides, so what a fact
 * form keeps never depends on the rules there are when it comes.
 */
const addFact = (
  facts: TupleSet,
  { key, merge }: RelationInfo,
  tuple: Tuple,
  log: Change[] | undefined
) => {
  let changed = false;
  if (key !== undefined && merge === undefined) {
    const keyValues = key.map((position) => tuple[position]);
    for (const old of [...facts.lookup(key, keyValues)]) {
      if (valueKey(old) !== valueKey(tuple)) {
        changed = facts.delete(old, log) || changed;
      }
    }
  }
  return facts.add(tuple, log) || changed;
};

/**
 * The rows a fact form writes: of the rows it gives one key of a keyed
 * relation, only the last, and the same row again. So a form that repeats
 * a key says what its last row for the key says, and changes nothing that
 * row holds already.
 */
const stated = (
  database: LogicDatabase,
  tuples: readonly (readonly [Atom, Tuple])[]
) => {
  // The last row each key of a keyed relation gets, by relation and key.
  const last = new Map<string, Tuple>();
  const ids: (string | undefined)[] = [];
  let keyed = 0;
  for (const [atom, tuple] of tuples.length < 2 ? [] : tuples) {
    const { key, merge, name } =
      database.relations.get(atom.relation.name) ?? atom.relation;
    const id =
      key === undefined || merge !== undefined
        ? undefined
        : valueKey([name, ...key.map((position) => tuple[position])]);
    ids.push(id);
    if (id !== undefined) {
      keyed += 1;
      last.set(id, tuple);
    }
  }
  if (last.size === keyed) {
    return tuples;
  }
  return tuples.filter(([, tuple], at) => {
    const kept = last.get(ids[at] ?? "");
    return kept === undefined || valueKey(kept) === valueKey(tuple);
  });
};

export const assertFacts = (database: LogicDatabase, atoms: readonly Atom[]) =>
  Effect.gen(function* () {
    const tuples: (readonly [Atom, Tuple])[] = [];
    for (const atom of atoms) {
      tuples.push([atom, yield* groundTuple(database, atom)] as const);
    }
    const write = (
      facts: (relation: string) => TupleSet | undefined,
      log: Change[] | undefined
    ) => {
      let changed = false;
      for (const [{ relation }, tuple] of stated(database, tuples)) {
        const set = facts(relation.name);
        // The declared relation decides the key, as when the fact was checked.
        const declared = database.relations.get(relation.name) ?? relation;
        changed =
          (set !== undefined && addFact(set, declared, tuple, log)) || changed;
      }
      return changed;
    };
    yield* changeDatabase(database, `Adding ${these(atoms)}`, write);
    return atoms.map(render);
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
    const shape = aggregateShape(rule);
    for (const { relation } of headsOf(rule)) {
      const earlier = shapes.get(relation.name);
      if (earlier !== undefined && earlier !== shape) {
        const merge = mergeOption(relation);
        return merge === undefined
          ? `Every rule that aggregates into "${relation.name}" must aggregate the same columns in the same way, since they say how the candidates of each key combine, but ${show(rule.source)} differs from an earlier rule.`
          : `"${relation.name}" merges ${show(merge)}, so a rule for it gives each of those columns plainly or with that aggregate, and aggregates nothing else, but ${show(rule.source)} differs.`;
      }
      shapes.set(relation.name, shape);
    }
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

/** The strongly connected group of columns each column is in, by number. */
const componentsOf = (flows: readonly Flow[]) => {
  const targets = new Map<string, string[]>();
  for (const { from, to } of flows) {
    const list = targets.get(from);
    if (list === undefined) {
      targets.set(from, [to]);
    } else {
      list.push(to);
    }
  }
  const component = new Map<string, number>();
  for (const [at, members] of stronglyConnected(
    targets.keys(),
    (column) => targets.get(column) ?? []
  ).entries()) {
    for (const member of members) {
      component.set(member, at);
    }
  }
  return component;
};

/** How a rule's head makes a new value, for a message. */
const making = (arg: unknown) => {
  if (arg instanceof LogicVariable) {
    return `computes a new value for ${show(arg)}`;
  }
  return isForm(arg, "some")
    ? `invents a value for ${show(arg.parts[0])}`
    : "computes a new value";
};

/**
 * Why a program may never finish, if it may. Values flow from the columns a
 * rule's body reads to the columns of its head. A rule that makes a value
 * for a column, by computing it or inventing it, can go on without end only
 * when the value flows back, through the rules, into making another one: a
 * cycle of columns that a made value passes through. Without such a cycle
 * every value is made from finitely many others, so evaluation finishes.
 * (This is weak acyclicity, from data exchange and Datalog±.)
 */
const newValueProblem = (
  recursive: readonly (readonly [CompiledRule, ReadonlySet<string>])[]
) => {
  // Only a rule whose body reads a relation that depends on its head can
  // carry a value back, and only into the relations that do.
  const flows = recursive.flatMap(([rule, group]) =>
    flowsOf(rule).filter(({ source }) => group.has(source))
  );
  const component = componentsOf(flows);
  const cycle = flows.find(
    ({ from, made, to }) =>
      made &&
      component.get(from) !== undefined &&
      component.get(from) === component.get(to)
  );
  if (cycle === undefined) {
    return undefined;
  }
  const advice = isForm(cycle.arg, "some")
    ? "Invent the value in a rule that does not recurse."
    : `Compute the value in a non-recursive rule, or aggregate it with ${latticeNames("or")}.`;
  return `Rule ${show(cycle.rule.source)} ${making(cycle.arg)} in its head while recursing, which may never finish. ${advice}`;
};

/** Checks one rule's recursion against the rest of the program. */
const recursionProblem = (
  rules: readonly CompiledRule[],
  rule: CompiledRule,
  ordered: Components,
  recursive: [CompiledRule, ReadonlySet<string>][]
) => {
  const head = rule.head.relation.name;
  const component = componentOf(ordered, head) ?? new Set();
  const inCycle = ({ name }: RelationInfo) => component.has(name);
  const reads = rule.body
    .flatMap((goal) => (goal instanceof Atom ? [goal.relation] : []))
    .find(inCycle);
  if (reads !== undefined) {
    recursive.push([rule, component]);
  }
  const question = asked(
    rule.body,
    rule.invents === undefined
      ? rule.head.args
      : headsOf(rule).flatMap((head) => head.args)
  ).find(inCycle);
  if (question !== undefined) {
    return `Rule ${show(rule.source)} asks about "${question.name}", which depends on "${head}". A question, such as a goal under "not", cannot go through recursion.`;
  }
  return reads === undefined || rule.aggregates.length === 0
    ? undefined
    : recursiveAggregateProblem(rules, rule, component, reads.name);
};

/**
 * An equality rule runs with the group that invents the unknowns it can
 * meet (see `equalityHome`), so a question it asks about that group could
 * not be answered in full yet.
 */
const equalityProblem = (
  rule: CompiledRule,
  rules: readonly CompiledRule[],
  ordered: Components
) => {
  const home = equalityHome(rule, rules);
  const group = home === undefined ? undefined : componentOf(ordered, home);
  const question = asked(rule.body, rule.head.args).find(({ name }) =>
    group?.has(name)
  );
  return question === undefined
    ? undefined
    : `Rule ${show(rule.source)} asks about "${question.name}", which depends on "${home}". A question, such as a goal under "not", cannot go through recursion.`;
};

const checkProgram = (rules: readonly CompiledRule[]) => {
  const ordered = components(rules);
  const problem =
    checkAggregateShapes(rules) ?? computedCycleProblem(rules, ordered);
  if (problem !== undefined) {
    return problem;
  }
  const recursive: [CompiledRule, ReadonlySet<string>][] = [];
  for (const rule of rules) {
    const recursion = rule.equates
      ? equalityProblem(rule, rules, ordered)
      : recursionProblem(rules, rule, ordered, recursive);
    if (recursion !== undefined) {
      return recursion;
    }
  }
  return newValueProblem(recursive);
};

/**
 * Adds rules. A rule the database already holds, one a snapshot would write
 * the same way, is not added again, so adding it changes nothing.
 */
const addRules = (
  database: LogicDatabase,
  added: readonly CompiledRule[],
  kept: readonly Omit<Invariant, "key">[] = []
): LogicEffect<void> => {
  const held = new Set(database.rules.map((rule) => rule.key));
  const rules = added.filter(
    (rule) => rule.key === undefined || !held.has(rule.key)
  );
  if (rules.length === 0) {
    return Effect.void;
  }
  for (const head of rules.flatMap((rule) =>
    rule.equates ? [] : headsOf(rule)
  )) {
    const { computed, name } = head.relation;
    if (computed !== undefined) {
      return logicError(
        `Rules cannot add to ${computedCall(head)}: it is computed from its inputs.`
      );
    }
    if (!database.relations.has(name)) {
      return logicError(`Relation "${name}" is not declared here.`);
    }
  }
  const next = effectiveRules(database, [
    ...writtenRules(database.rules),
    ...rules,
  ]);
  if (typeof next === "string") {
    return logicError(next);
  }
  const problem = checkProgram(next);
  if (problem !== undefined) {
    return logicError(problem);
  }
  // An equality rule is kept as the invariant it stands for too, in the
  // same change, so a rule that does not hold is not added.
  const invariants = database.invariants;
  const keyed = kept.flatMap((invariant) => {
    const key = logicKey([invariant.assert, invariant.goal]);
    return invariants.some((each) => key !== undefined && each.key === key)
      ? []
      : [{ ...invariant, ...(key === undefined ? {} : { key }) }];
  });
  return changeDatabase(database, "Adding this rule", () => false, {
    invariants: [...invariants, ...keyed],
    rules: next,
  });
};

/**
 * Adds the rule a `rule` form states, from the values of its head and body.
 * A head that says two values are the same holds as an invariant too.
 */
export const addRule = (
  database: LogicDatabase,
  head: unknown,
  body: readonly unknown[]
) =>
  Effect.gen(function* () {
    const rules = yield* compileRule(head, body);
    const invariants = yield* Effect.forEach(
      equalityGoals(head, body),
      (goal) =>
        Effect.map(compileQuery(goal), (query) => ({
          assert: "none" as const,
          goal,
          query,
        }))
    );
    yield* addRules(database, rules, invariants);
  });

/**
 * What taking back some `rule` and `invariant` forms gives the database,
 * by the keys of the forms that would add them: the rule a snapshot writes
 * the same way, with the invariant a rule that says two values are the
 * same holds as, and the invariant asserting the same of the same goal.
 * Gives the rules and invariants that stay, and the forms taken back, or
 * undefined when the database holds none of them.
 */
const takenBack = (database: LogicDatabase, forms: readonly LogicForm[]) =>
  Effect.gen(function* () {
    const rules = new Set<string | undefined>();
    const invariants = new Set<string | undefined>();
    for (const { form, parts } of forms) {
      const [first, ...rest] = parts;
      if (form === "invariant") {
        invariants.add(logicKey([rest[0], first]));
      } else {
        const [rule] = yield* compileRule(first, rest);
        rules.add(rule?.key);
        for (const goal of equalityGoals(first, rest)) {
          invariants.add(logicKey(["none", goal]));
        }
      }
    }
    const gone = (key: string | undefined, keys: ReadonlySet<unknown>) =>
      key !== undefined && keys.has(key);
    const written = writtenRules(database.rules);
    const taken = [
      ...new Set(
        written.flatMap((rule) => (gone(rule.key, rules) ? [rule.source] : []))
      ),
      ...database.invariants.flatMap(({ assert, goal, key }) =>
        gone(key, invariants) ? [["invariant", render(goal), { assert }]] : []
      ),
    ];
    if (taken.length === 0) {
      return;
    }
    const next = effectiveRules(
      database,
      written.filter((rule) => !gone(rule.key, rules))
    );
    if (typeof next === "string") {
      return yield* logicError(next);
    }
    const program: Program = {
      invariants: database.invariants.filter(
        (invariant) => !gone(invariant.key, invariants)
      ),
      rules: next,
    };
    return { program, taken };
  });

/**
 * Takes back what a `retract` form names, in one change: facts, by their
 * relation calls, and rules and invariants, held as `rule` and `invariant`
 * forms with their parts' values. A change that fails, or breaks an
 * invariant that stays, changes nothing. Gives the facts it removed and
 * the forms it took back.
 */
export const retract = (
  database: LogicDatabase,
  items: readonly unknown[]
): LogicEffect<readonly unknown[]> =>
  Effect.gen(function* () {
    const atoms = items.filter((item) => item instanceof Atom);
    const forms = items.filter((item) => item instanceof LogicForm);
    const back =
      forms.length === 0 ? undefined : yield* takenBack(database, forms);
    // Every fact is checked before anything changes.
    const tuples: (readonly [Atom, Tuple])[] = [];
    for (const atom of atoms) {
      tuples.push([atom, yield* groundTuple(database, atom)] as const);
    }
    const removed: unknown[] = [];
    yield* changeDatabase(
      database,
      back === undefined
        ? `Retracting ${these(atoms)}`
        : "Retracting this rule",
      (facts, log) => {
        for (const [atom, tuple] of tuples) {
          if (facts(atom.relation.name)?.delete(tuple, log)) {
            removed.push(render(atom));
          }
        }
        return removed.length > 0;
      },
      back?.program
    );
    return [...removed, ...(back?.taken ?? [])];
  });

/**
 * A database that starts as this one is and goes its own way: it shares
 * the declarations and rules, and the facts of each relation until it
 * changes them, when it changes its own copy. A rule it adds or takes back
 * changes only its own list of rules. It keeps no invariants: an
 * invariant keeps the database itself, and a change made here is only
 * assumed. So an invariant that asks with `assuming` does not ask itself
 * again, and holds of the same facts in whatever order they came.
 */
const copyOf = (database: LogicDatabase, changing: Iterable<string>) => {
  const copy = new LogicDatabase({ goalDirected: database.goalDirected });
  for (const [name, relation] of database.relations) {
    copy.relations.set(name, relation);
  }
  for (const [name, schema] of database.schemas) {
    copy.schemas.set(name, schema);
  }
  for (const [name, facts] of database.facts) {
    copy.facts.set(name, facts);
  }
  for (const name of changing) {
    const facts = database.facts.get(name);
    if (facts !== undefined) {
      copy.facts.set(name, facts.clone());
    }
  }
  copy.rules = database.rules;
  return copy;
};

/**
 * Makes a change as the form it is held as would make it: a `fact` form
 * adds its facts, a `rule` form its rule, and a `retract` form takes back
 * the facts, rules, and invariants it names.
 */
const makeChange = (database: LogicDatabase, change: LogicForm) => {
  const [head, ...body] = change.parts;
  // An assumed database keeps no invariants, not even the one a rule that
  // says two values are the same holds as.
  if (change.form === "rule") {
    return Effect.flatMap(compileRule(head, body), (rules) =>
      addRules(database, rules)
    );
  }
  return change.form === "fact"
    ? assertFacts(database, change.parts as readonly Atom[])
    : retract(database, change.parts);
};

/**
 * What an expression gives in the database as it would be after some
 * changes, each a `fact`, `retract`, or `rule` form with its parts' values,
 * made in order as the form would make it, with keys and merges and no
 * invariant to refuse it. The database itself does not
 * change.
 */
const assumeIn =
  (database: LogicDatabase) =>
  (changes: readonly LogicForm[], expression: unknown): LogicEffect<unknown> =>
    Effect.gen(function* () {
      // The facts a change writes to are its own copy's.
      const copy = copyOf(
        database,
        changes.flatMap((change) =>
          change.form === "rule"
            ? []
            : change.parts.flatMap((part) =>
                part instanceof Atom ? [part.relation.name] : []
              )
        )
      );
      for (const change of changes) {
        yield* makeChange(copy, change);
      }
      return yield* reading(copy, (model) => answer(model, expression));
    });

/** A model of the database's facts and rules, which can ask what it assumes. */
const modelOf = (database: LogicDatabase) => {
  const model = new Model(database.facts, database.rules);
  model.assume = assumeIn(database);
  return model;
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
    database.model ??= modelOf(database);
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
 * it can reach, in a model of its own on top of the database's, and reads
 * there what the database's model has already derived in full.
 */
const answering = (
  database: LogicDatabase,
  model: Model,
  bodies: readonly (readonly Literal[])[]
): Asked => {
  if (!database.goalDirected) {
    return { bodies, model };
  }
  // A body with no key, one that holds a value with no written form, gets
  // a model that is not kept.
  const key = logicKey(bodies);
  const known = key === undefined ? undefined : database.goals.get(key);
  if (known !== undefined) {
    return known;
  }
  const program = rewriteQueries(
    database.rules,
    bodies,
    (relation) => (database.facts.get(relation)?.size ?? 0) > 0,
    (relation) => readable(model, relation)
  );
  if (program === undefined) {
    return { bodies, model };
  }
  const directed = new Model(database.facts, program.rules, model);
  for (const relation of program.facts) {
    directed.relations.set(
      factsName(relation),
      database.facts.get(relation) ?? EMPTY
    );
  }
  const answered = {
    bodies: program.bodies,
    facts: program.facts,
    model: directed,
  };
  if (key !== undefined) {
    database.goals.set(key, answered);
  }
  return answered;
};

/**
 * Gives the answers of a goal's alternatives to what `taking` makes, a
 * batch at a time, and returns it. A query that asks about an argument that
 * is not data cannot be directed by it, so it is answered from every row
 * instead, into something `taking` makes anew.
 */
const solve = <A>(
  database: LogicDatabase,
  base: Model,
  alternatives: readonly (readonly Literal[])[],
  taking: () => readonly [A, Sink]
) =>
  Effect.suspend(() => {
    const run = ({ bodies, model }: Asked) =>
      Effect.gen(function* () {
        const [taken, sink] = taking();
        for (const body of bodies) {
          yield* each(model, body, sink);
        }
        return taken;
      });
    return run(answering(database, base, alternatives)).pipe(
      Effect.catchIf(
        (error) => error === UNDIRECTED,
        () => run({ bodies: alternatives, model: base })
      )
    );
  });

/** Runs a query and returns one record per distinct answer. */
export const queryDatabase = (
  database: LogicDatabase,
  { bodies, outputs }: CompiledQuery
) =>
  reading(database, (model) =>
    Effect.map(
      solve(database, model, bodies, () => {
        const rows = new Map<string, Record<string, unknown>>();
        const sink: Sink = (answers) => {
          for (const vars of answers) {
            // An alternative of "or" may leave some of the variables unbound.
            const row = Object.fromEntries(
              outputs.flatMap((name) =>
                vars.has(name) ? [[name, vars.get(name)]] : []
              )
            );
            if (!isGroundValue(row)) {
              return logicError(
                `The query produced an answer that is not data: ${show(row)}.`
              );
            }
            rows.set(valueKey(row), row);
          }
          return Effect.void;
        };
        return [rows, sink] as const;
      }),
      (rows) => [...rows.values()]
    )
  );

/**
 * Answers a question asked outside of any rule or query, where no variable
 * has a value: whether a goal has a match, or what a find finds.
 */
export const askDatabase = (database: LogicDatabase, question: LogicValue) =>
  reading(database, (model) =>
    Effect.gen(function* () {
      if (isForm(question, "assuming")) {
        return yield* term(model, question, new Map());
      }
      const plans = yield* compiling(() =>
        questionPlans(question, () => false)
      );
      const bodies = plans.map(({ body }) => body);
      if (!isForm(question, "find")) {
        const found = yield* solve(database, model, bodies, () => {
          const count = { answers: 0 };
          const sink: Sink = (answers) =>
            Effect.sync(() => {
              count.answers += answers.length;
            });
          return [count, sink] as const;
        });
        return found.answers > 0;
      }
      // Answers that several alternatives find count once.
      const values = yield* solve(database, model, bodies, () => {
        const values: unknown[] = [];
        const seen = new Set<string>();
        const sink: Sink = (answers) =>
          Effect.map(
            found(
              model,
              question,
              plans.length > 1
                ? answers.filter((vars) => {
                    const key = answerKey(vars);
                    return !seen.has(key) && seen.add(key).size > 0;
                  })
                : answers
            ),
            (batch) => {
              for (const value of batch) {
                values.push(value);
              }
            }
          );
        return [values, sink] as const;
      });
      return values.sort(compareValues);
    })
  );

/** The schema checks a goal says its answers fail: those under "not". */
const refuted = (goal: unknown): NonNullable<ReturnType<typeof checkOf>>[] => {
  if (isForm(goal, "and")) {
    return goal.parts.flatMap(refuted);
  }
  const check = isForm(goal, "not") ? checkOf(goal.parts[0]) : undefined;
  return check === undefined ? [] : [check];
};

/**
 * Where an answer does not fit a schema that its goal says it fails, as a
 * sentence to end a message with; empty when the goal checks no schema.
 */
const misfitOf = (
  database: LogicDatabase,
  goal: unknown,
  row: Record<string, unknown>
) =>
  reading(database, (model) =>
    Effect.gen(function* () {
      const vars: Vars = new Map(Object.entries(row));
      for (const check of refuted(goal)) {
        const schema = yield* term(model, check.schema, vars);
        const value = yield* term(model, check.value, vars);
        const message = yield* misfit(schema, value);
        if (message !== undefined) {
          return ` ${message}`;
        }
      }
      return "";
    })
  ).pipe(Effect.orElseSucceed(() => ""));

/**
 * Fails when a goal's answers break an assertion, in the words every
 * assertion uses. `subject` names what made the assertion, such as "query"
 * or "invariant", and `context` starts the message. When the goal says an
 * answer fails a schema, the message ends with where it does not fit.
 */
export const checkAssertion = (
  database: LogicDatabase,
  subject: string,
  assert: Assertion | undefined,
  rows: readonly Record<string, unknown>[],
  goal: unknown,
  context = ""
) =>
  Effect.gen(function* () {
    const problem = assertionProblem(subject, assert, rows, goal);
    if (problem === undefined) {
      return;
    }
    const where =
      rows.length === 0 ? "" : yield* misfitOf(database, goal, exampleOf(rows));
    return yield* logicError(`${context}${problem}${where}`);
  });

/** What an invariant reads, which says what changes to facts can break it. */
interface Footprint {
  /**
   * The relations that hold only facts, and whose rows a goal of the
   * invariant matches.
   */
  readonly direct: ReadonlySet<string>;
  /**
   * True when what the invariant reads cannot be told: its goal, or a rule
   * behind a relation it reads, holds a function that may read anything.
   */
  readonly opaque: boolean;
  /**
   * Every relation the invariant reads any other way: asked about, under
   * "not" or by a schema, derived by rules or computed, or read by those.
   */
  readonly others: ReadonlySet<string>;
}

const FOOTPRINTS = new WeakMap<
  Invariant,
  { readonly footprint: Footprint; readonly rules: readonly CompiledRule[] }
>();

/** What an invariant reads, worked out once for each set of rules. */
const footprintOf = (database: LogicDatabase, invariant: Invariant) => {
  const known = FOOTPRINTS.get(invariant);
  if (known?.rules === database.rules) {
    return known.footprint;
  }
  const edges = dependencyEdges(database.rules);
  const direct = new Set<string>();
  const pending: RelationInfo[] = [];
  for (const literal of invariant.query.bodies.flat()) {
    const relation = literal instanceof Atom ? literal.relation : undefined;
    if (
      relation === undefined ||
      relation.computed !== undefined ||
      edges.has(relation.name)
    ) {
      pending.push(...mentioned(literal));
    } else {
      direct.add(relation.name);
      pending.push(...(literal as Atom).args.flatMap(mentioned));
    }
  }
  const others = new Set<string>();
  const names = pending.flatMap(({ computed, name }) => [
    name,
    ...(computed?.dependencies ?? []),
  ]);
  for (let name = names.pop(); name !== undefined; name = names.pop()) {
    if (!others.has(name)) {
      others.add(name);
      names.push(...(edges.get(name) ?? []));
    }
  }
  const opaque =
    invariant.query.bodies.flat().some(isOpaque) ||
    database.rules.some((rule) =>
      headsOf(rule).some(
        (head) =>
          others.has(head.relation.name) &&
          (rule.body.some(isOpaque) || head.args.some(isOpaque))
      )
    );
  const footprint = { direct, opaque, others };
  FOOTPRINTS.set(invariant, { footprint, rules: database.rules });
  return footprint;
};

const REGIVES = new WeakMap<FactChange, boolean>();

/** True when a change adds or takes away a fact that holds an unknown. */
const regives = (change: FactChange) => {
  let found = REGIVES.get(change);
  if (found === undefined) {
    const { gained, lost } = change.net();
    found = [...gained.values(), ...lost.values()].some((rows) =>
      [...rows.values()].some(holdsUnknown)
    );
    REGIVES.set(change, found);
  }
  return found;
};

/**
 * True when a change to facts cannot have broken an invariant that held
 * before it, so the invariant need not be asked again.
 *
 * - A change to relations the invariant does not read changes none of its
 *   answers. That takes knowing what it reads: an invariant that holds a
 *   function which may read anything is always asked.
 * - For an invariant that expects no answers: when the change touched only
 *   relations whose rows a goal of the invariant matches, removing rows
 *   cannot give it an answer, and an answer that is new uses a row that is
 *   new. So it is enough to run the goal on the new rows. When they give
 *   answers, those are all the invariant has, and they are returned for
 *   its message instead of true or false.
 * - A fact that holds an unknown says the unknown is given, which a key or
 *   an equality rule then cannot write as another value. So a change that
 *   adds or takes away such a fact can change rows of relations it does not
 *   name, and every invariant is asked.
 */
const unaffected = (
  database: LogicDatabase,
  invariant: Invariant,
  change: FactChange
) =>
  Effect.suspend(() => {
    const { net, touched } = change;
    const { direct, opaque, others } = footprintOf(database, invariant);
    const reaches = (names: ReadonlySet<string>) =>
      [...touched].some((name) => names.has(name));
    if (opaque || reaches(others) || regives(change)) {
      return Effect.succeed(false);
    }
    if (!reaches(direct)) {
      return Effect.succeed(true);
    }
    if (invariant.assert !== "none") {
      return Effect.succeed(false);
    }
    const rows = net().gained;
    const { bodies, outputs } = invariant.query;
    return reading(database, (model) =>
      Effect.gen(function* () {
        // The invariant had no answers, so the ones that use a new row are
        // all it has now.
        const found = new Map<string, Record<string, unknown>>();
        for (const body of bodies) {
          for (const vars of yield* changedAnswers(model, body, rows)) {
            const row = Object.fromEntries(
              outputs.flatMap((name) =>
                vars.has(name) ? [[name, vars.get(name)]] : []
              )
            );
            found.set(valueKey(row), row);
          }
        }
        const answers = [...found.values()];
        return (
          answers.length === 0 || (answers.every(isGroundValue) && answers)
        );
      })
    ).pipe(
      // Whatever went wrong, asking the invariant in full says it best.
      Effect.orElseSucceed(() => false)
    );
  });

/**
 * Answers each invariant's goal as a query would, and fails with the first
 * one whose answers break its assertion. `context` starts the message.
 * After a change to facts, an invariant the change cannot have broken is
 * not asked.
 */
const checkInvariants = (
  database: LogicDatabase,
  invariants: readonly Invariant[],
  context: string,
  change?: FactChange
) =>
  Effect.gen(function* () {
    for (const invariant of invariants) {
      const { assert, goal, query } = invariant;
      const found =
        change !== undefined &&
        (yield* unaffected(database, invariant, change));
      if (found === true) {
        continue;
      }
      const rows = found || (yield* queryDatabase(database, query));
      yield* checkAssertion(
        database,
        "invariant",
        assert,
        rows,
        goal,
        `${context} `
      );
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

/** Explains how a fact holds, or why it does not. */
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
      return yield* why(model, atom);
    })
  );

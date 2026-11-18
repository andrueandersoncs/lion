/**
 * Follows a change through a group whose rules invent or make values one,
 * a component of values at a time.
 *
 * When every relation goal of a group's rules has a variable or a value in
 * each argument, the goals of each body share variables, and nothing else
 * asks a question, an answer combines only rows that share values. So do
 * the checks of rules that invent, which ask the head's relation about the
 * values the answer gives it, the keys, which meet rows that share a key,
 * and equality rules, whose answers are answers like any other. The rows
 * of such a group are what each connected component of its values derives
 * on its own, since the value a class of values made one keeps depends only
 * on the class. A change is followed by deriving again the one component it
 * touched: the values of the changed rows, and every value that a row of
 * the group, or a row the group's goals read, joins to them. The component
 * is derived from its own rows alone, so what it invents is its own too.
 */
import { Effect } from "effect";
import { type CompiledRule, headsOf } from "@/logic/compile";
import type { Pass } from "@/logic/maintain";
import { derive, Model, rowsOf, type Tuple, TupleSet } from "@/logic/model";
import { mentioned, type Stratum } from "@/logic/strata";
import {
  Atom,
  isForm,
  LogicValue,
  LogicVariable,
  valueKey,
} from "@/logic/terms";

/** The relation goals of a rule's body. */
const goalsOf = (rule: CompiledRule) =>
  rule.body.filter((literal): literal is Atom => literal instanceof Atom);

const variablesOf = (goal: Atom) =>
  goal.args.flatMap((arg) => (arg instanceof LogicVariable ? [arg.name] : []));

/**
 * A goal that reads stored rows through the values of its variables: each
 * argument a variable or a value, at least one variable, and no algorithm.
 */
const readsByValue = (goal: Atom) =>
  goal.plain &&
  goal.relation.computed === undefined &&
  variablesOf(goal).length > 0;

/** A head that writes values the body gave it, or the ones it invents. */
const writesByValue = (head: Atom) =>
  head.args.every(
    (arg) =>
      !(arg instanceof LogicValue) ||
      arg instanceof LogicVariable ||
      isForm(arg, "some")
  );

/** True when every goal can be reached from the first through shared variables. */
const connected = (goals: readonly Atom[]) => {
  const reached = new Set(variablesOf(goals[0] as Atom));
  const left = new Set(goals.slice(1));
  for (let grew = true; grew; ) {
    grew = false;
    for (const goal of left) {
      const names = variablesOf(goal);
      if (names.some((name) => reached.has(name))) {
        for (const name of names) {
          reached.add(name);
        }
        left.delete(goal);
        grew = true;
      }
    }
  }
  return left.size === 0;
};

/**
 * True when a rule's answers join rows only through the values its
 * variables share: every relation goal reads by value and the goals are
 * connected, every head writes by value, every variable of the heads is
 * one a goal binds or one the rule invents, and the rest of the body asks
 * nothing.
 */
const joinsByValue = (rule: CompiledRule) => {
  const goals = goalsOf(rule);
  const bound = new Set(goals.flatMap(variablesOf));
  const invented = new Set(rule.invents?.names ?? []);
  return (
    rule.aggregates.length === 0 &&
    goals.length > 0 &&
    goals.every(readsByValue) &&
    headsOf(rule).every(writesByValue) &&
    headsOf(rule)
      .flatMap(variablesOf)
      .every((name) => bound.has(name) || invented.has(name)) &&
    rule.body.every(
      (literal) => literal instanceof Atom || mentioned(literal).length === 0
    ) &&
    connected(goals)
  );
};

const WISE = new WeakMap<Stratum, boolean>();

/** True when a change to a group can be followed a component at a time. */
export const componentwise = (stratum: Stratum) => {
  let wise = WISE.get(stratum);
  if (wise === undefined) {
    wise = stratum.rules.every(joinsByValue);
    WISE.set(stratum, wise);
  }
  return wise;
};

/**
 * The positions through which each relation the group reads joins values:
 * every argument of a goal or head of the group's own relations, and the
 * arguments of the others where a goal holds a variable.
 */
const joinsOf = ({ members, rules }: Stratum) => {
  const joins = new Map<string, Set<number>>();
  const add = (name: string, position: number) => {
    joins.set(name, (joins.get(name) ?? new Set<number>()).add(position));
  };
  for (const rule of rules) {
    for (const atom of [...headsOf(rule), ...goalsOf(rule)]) {
      const { name } = atom.relation;
      atom.args.forEach((arg, position) => {
        if (members.has(name) || arg instanceof LogicVariable) {
          add(name, position);
        }
      });
    }
  }
  return joins;
};

/** Adds a row to the rows kept for its relation. */
const collect = (into: Map<string, TupleSet>, name: string, row: Tuple) => {
  const held = into.get(name) ?? new TupleSet();
  into.set(name, held);
  held.add(row);
};

/** The rows a change touched, of every relation the group reads or writes. */
const touched = ({ gained, lost }: Pass, name: string) => [
  ...(gained.get(name)?.values() ?? []),
  ...(lost.get(name)?.values() ?? []),
];

/**
 * The values a change touched, and every value that a row of the group, or
 * a row its goals read, joins to them; with every row that holds them: the
 * group's rows and facts, and the rows of what it reads.
 */
const componentOf = (pass: Pass, stratum: Stratum) => {
  const { model } = pass;
  const joins = joinsOf(stratum);
  const values = new Set<string>();
  const waiting: unknown[] = [];
  const see = (row: Tuple, positions: Iterable<number>) => {
    for (const position of positions) {
      const key = valueKey(row[position]);
      if (!values.has(key)) {
        values.add(key);
        waiting.push(row[position]);
      }
    }
  };
  for (const [name, positions] of joins) {
    for (const row of touched(pass, name)) {
      see(row, positions);
    }
  }
  const rows = new Map<string, TupleSet>();
  const facts = new Map<string, TupleSet>();
  const sources = [...joins].flatMap(([name, positions]) => {
    const kept = [{ into: rows, name, positions, set: rowsOf(model, name) }];
    return stratum.members.has(name)
      ? [...kept, { into: facts, name, positions, set: model.facts.get(name) }]
      : kept;
  });
  while (waiting.length > 0) {
    const value = waiting.pop();
    for (const { into, name, positions, set } of sources) {
      for (const position of positions) {
        for (const row of set?.lookup([position], [value]) ?? []) {
          collect(into, name, row);
          see(row, positions);
        }
      }
    }
  }
  return { facts, joins, rows };
};

/**
 * What a group derives from the rows of one component: beside the model,
 * from the group's facts in the component, reading only the component's
 * rows of every relation its goals read.
 */
const deriveComponent = (
  model: Model,
  stratum: Stratum,
  { facts, joins, rows }: ReturnType<typeof componentOf>
) =>
  Effect.gen(function* () {
    const { members } = stratum;
    // Only the component's rows: what holds them is all the group can meet,
    // and a fact elsewhere would cost a look at every one when unknowns are
    // made one.
    const given = new Map<string, TupleSet>();
    for (const name of joins.keys()) {
      given.set(
        name,
        (members.has(name) ? facts.get(name) : rows.get(name)) ?? new TupleSet()
      );
    }
    const beside = new Model(given, model.rules, model.base);
    for (const name of joins.keys()) {
      if (!members.has(name)) {
        beside.relations.set(name, given.get(name) as TupleSet);
        beside.state.set(name, "done");
      }
    }
    yield* derive(beside, stratum);
    return beside;
  });

/**
 * Puts a component's rows in place of the ones it had, and returns the rows
 * that are new and the rows that are gone.
 */
const swap = (rows: TupleSet, before: TupleSet, after: TupleSet) => {
  const plus = new TupleSet();
  const minus = new TupleSet();
  for (const row of before.values()) {
    if (!after.has(row) && rows.delete(row)) {
      minus.add(row);
    }
  }
  for (const row of after.values()) {
    if (!before.has(row) && rows.addKeyed(valueKey(row), row)) {
      plus.add(row);
    }
  }
  return { minus, plus };
};

/**
 * Follows a change through a group a component at a time: the component the
 * change touched is derived again beside the model, and its rows replace the
 * ones it had.
 */
export const followComponents = (pass: Pass, stratum: Stratum) =>
  Effect.gen(function* () {
    const { gained, lost, model } = pass;
    const component = componentOf(pass, stratum);
    const beside = yield* deriveComponent(model, stratum, component);
    for (const name of stratum.members) {
      const rows = model.relations.get(name) ?? new TupleSet();
      model.relations.set(name, rows);
      const { minus, plus } = swap(
        rows,
        component.rows.get(name) ?? new TupleSet(),
        beside.relations.get(name) ?? new TupleSet()
      );
      gained.set(name, plus);
      lost.set(name, minus);
    }
  });

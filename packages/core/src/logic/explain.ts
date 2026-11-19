/**
 * `why`: how a goal holds, or why it does not.
 *
 * The two are told by one rule, in which `not` changes sides. A goal that
 * holds is told by what it rested on: the row a relation call matched,
 * explained in turn, the goal under a `not` as it is absent, and any other
 * goal as a check that held. A goal that is absent is told by every way it
 * could have held and what stood in each one's way: for a relation call,
 * each rule whose head could give a matching row, and for a goal made of
 * others, each of its alternatives. A way is a body, and it is told once
 * for each answer of its first goals that its next goal stops: the goals
 * that held, and the goal that did not.
 *
 * Lion is closed-world: what is not known does not hold. Most of what is
 * absent stays absent whatever is learned about an unknown, but not all: an
 * unknown mother is not known to be eve, and may be. A goal whose answer
 * could change once an unknown is known says so, with `assumed`.
 */

import { Effect } from "effect";
import {
  type CompiledRule,
  compilable,
  compiling,
  headsOf,
  type Literal,
  planLiterals,
  questionPlans,
} from "@/logic/compile";
import {
  answerKey,
  compareMatches,
  complete,
  ensure,
  hasFree,
  holds,
  type LogicEffect,
  lookup,
  type Match,
  type Model,
  match,
  matches,
  matchRow,
  NO_VARS,
  rowsOf,
  type Tuple,
  term,
  tupleOf,
  type Vars,
} from "@/logic/model";
import { dependencyEdges, mentioned } from "@/logic/strata";
import {
  Atom,
  compareValues,
  instantiate,
  isData,
  isForm,
  isGroundValue,
  isJson,
  isQuestion,
  isRelational,
  LogicForm,
  LogicValue,
  LogicVariable,
  patternParts,
  type RelationInfo,
  sameValue,
  termVariables,
  valueKey,
} from "@/logic/terms";
import { derivationOf } from "@/logic/weights";

/** What one `why` has worked out so far. */
interface Telling {
  /** Whether a relation that a relation reads holds an unknown, by name. */
  readonly fed: Map<string, boolean>;
  /** The goals being asked whether they could come to hold, each with its depth. */
  readonly looking: Map<string, number>;
  readonly model: Model;
  /** Whether a goal could come to hold, as it reads. */
  readonly opened: Map<string, boolean>;
  /**
   * Goals that cannot come to hold unless a goal still being asked can,
   * each with that goal's depth.
   */
  readonly resting: Map<string, number>;
  /**
   * The depth of the highest goal still being asked that the goal being
   * asked now was found to rest on.
   */
  rests: number;
  /** The absent goals told so far, as they read: each is told once. */
  readonly told: Set<string>;
}

/** A body to run, from the values some of its variables have. */
interface Route {
  readonly body: readonly Literal[];
  /** The relation call of the rule's head that the goal asks about. */
  readonly head?: Atom;
  readonly rule?: CompiledRule;
  readonly start: Vars;
}

/** True for data with an unknown in it. */
const isOpen = (value: unknown) => isGroundValue(value) && !isJson(value);

/** True for a term that names an unknown, whatever its variables are. */
const namesUnknown = (item: unknown): boolean =>
  item instanceof LogicValue
    ? isForm(item, "some") || item.parts.some(namesUnknown)
    : isOpen(item);

/** A variable, a value, or a record or list of those: nothing to compute. */
const isStructure = (item: unknown): boolean =>
  !(item instanceof LogicValue) ||
  item instanceof LogicVariable ||
  (patternParts(item, false)?.every(isStructure) ?? false);

const isComputed = (item: unknown) => !isStructure(item);

/** An "=" or "in" between values, which holds whatever an unknown is. */
const comparesValues = (goal: unknown) =>
  isForm(goal, "=", "in") && goal.parts.every(isStructure);

/** The relation calls in a term, however deep. */
const callsIn = (item: unknown): readonly Atom[] => {
  if (!(item instanceof LogicValue)) {
    return [];
  }
  const inner = item.parts.flatMap(callsIn);
  return item instanceof Atom ? [item, ...inner] : inner;
};

/** The rows of a relation that hold an unknown. */
const openRows = (telling: Telling, name: string) =>
  rowsOf(telling.model, name).keeping("open", (tuple) => tuple.some(isOpen));

/**
 * True when a relation that a relation's rows are made from, however far,
 * holds an unknown: its rows can then change once the unknown is known.
 */
const isFed = (telling: Telling, relation: RelationInfo) =>
  Effect.gen(function* () {
    const known = telling.fed.get(relation.name);
    if (known !== undefined) {
      return known;
    }
    const edges = dependencyEdges(telling.model.rules);
    const reached = new Set(
      relation.computed?.dependencies ?? edges.get(relation.name)
    );
    let found = false;
    for (const name of reached) {
      yield* complete(telling.model, name);
      if (openRows(telling, name).length > 0) {
        found = true;
        break;
      }
      for (const next of edges.get(name) ?? []) {
        reached.add(next);
      }
    }
    telling.fed.set(relation.name, found);
    return found;
  });

/**
 * True when a row that holds an unknown could match a relation call for an
 * answer, were the unknown the value the call asks for.
 */
const couldMatch = (telling: Telling, call: Atom, vars: Vars) =>
  openRows(telling, call.relation.name).some((tuple) =>
    call.args.every((arg, at) => {
      // An argument that asks for no value yet fits any row.
      const value = arg instanceof LogicVariable ? vars.get(arg.name) : arg;
      return !isData(value) || isOpen(tuple[at]) || sameValue(tuple[at], value);
    })
  );

/**
 * True when some terms read an unknown for an answer: a value the answer
 * gives them holds one, a row one of their relation calls could match
 * holds one, or a relation they are handed holds one or is made from one
 * that does. With `far`, so does a relation they call that is made from
 * one that holds an unknown: what the terms give can then change either
 * way once the unknown is known.
 */
const readsUnknown = (
  telling: Telling,
  terms: readonly unknown[],
  vars: Vars,
  far: boolean
): LogicEffect<boolean> =>
  Effect.gen(function* () {
    const given = terms
      .flatMap(termVariables)
      .some((name) => isOpen(vars.get(name)));
    if (given || terms.some(namesUnknown)) {
      return true;
    }
    const calls = terms.flatMap(callsIn);
    const called = new Set(calls.map((call) => call.relation.name));
    for (const relation of terms.flatMap(mentioned)) {
      yield* ensure(telling.model, relation);
      const handed = !called.has(relation.name);
      if (handed && openRows(telling, relation.name).length > 0) {
        return true;
      }
      if ((handed || far) && (yield* isFed(telling, relation))) {
        return true;
      }
    }
    return calls.some((call) => couldMatch(telling, call, vars));
  });

/** A node of the tree, marked when what it says could change. */
const marked = <A extends object>(node: A, assumed: boolean) =>
  assumed ? { ...node, assumed: true } : node;

/**
 * The values a goal gives a rule's variables through one relation call of
 * the rule's head: where the head has a variable, a value, or a record or
 * list of those, and the goal asks for a value. Undefined when the head
 * cannot give a row the goal matches. What the head computes, combines, or
 * invents is compared once the body has an answer.
 */
const startOf = (
  model: Model,
  rule: CompiledRule,
  head: Atom,
  goal: Atom,
  vars: Vars
) =>
  Effect.gen(function* () {
    let start: Vars = NO_VARS;
    for (const [at, arg] of goal.args.entries()) {
      const part = head.args[at];
      const fixed =
        isStructure(part) && !(rule.aggregates.includes(at) || rule.invents);
      if (
        !(fixed || part instanceof LogicVariable) ||
        hasFree(arg, vars, true)
      ) {
        continue;
      }
      const value = yield* term(model, arg, vars);
      if (!isData(value)) {
        continue;
      }
      const [next] = yield* match(model, part, value, start, true);
      if (next === undefined) {
        return undefined;
      }
      start = next;
    }
    return start;
  });

const PLANNED = new WeakMap<CompiledRule, Map<string, readonly Literal[]>>();

/**
 * A rule's body in the order to run it once the head has given some of its
 * variables their values: the goals those values reach come first, so the
 * body stops where the goal asked about first parts from what is known.
 */
const bodyFor = (rule: CompiledRule, start: Vars) => {
  const names = [...start.keys()].sort();
  const key = names.join(" ");
  let plans = PLANNED.get(rule);
  if (plans === undefined) {
    plans = new Map();
    PLANNED.set(rule, plans);
  }
  let body = plans.get(key);
  if (body === undefined) {
    body = compilable(() => planLiterals(rule.body, names)) ?? rule.body;
    plans.set(key, body);
  }
  return body;
};

/** True for a goal that can hold in several ways, which `routes` gives. */
const hasRoutes = (goal: unknown): goal is Atom | LogicForm =>
  goal instanceof Atom
    ? goal.relation.computed === undefined
    : isForm(goal, "and", "or", "exists") && isRelational(goal);

/**
 * Every way a goal can hold for an answer, as a body to run. A relation
 * call can hold through each rule whose head can give a row it matches,
 * and a goal made of others through each of its alternatives.
 */
const routes = (model: Model, goal: Atom | LogicForm, vars: Vars) =>
  Effect.gen(function* () {
    if (!(goal instanceof Atom)) {
      const plans = yield* compiling(() =>
        questionPlans(goal, (name) => vars.has(name))
      );
      return plans.map(({ body }): Route => ({ body, start: vars }));
    }
    const out: Route[] = [];
    for (const rule of model.rules.filter(({ equates }) => !equates)) {
      for (const head of headsOf(rule)) {
        const start =
          head.relation.name === goal.relation.name
            ? yield* startOf(model, rule, head, goal, vars)
            : undefined;
        if (start !== undefined) {
          out.push({ body: bodyFor(rule, start), head, rule, start });
        }
      }
    }
    return out;
  });

type Stop = readonly [at: number, vars: Vars];

/**
 * Runs a body one goal at a time. `stops` holds each answer of the goals
 * before one that the goal gives no answer for, with the goal's place, and
 * `full` the answers of the whole body. `visit` is handed every answer that
 * reaches a goal, and whether the goal has an answer for it. The order of
 * the rows a relation holds does not show: the answers a goal stops are
 * sorted.
 */
const run = (
  model: Model,
  { body, start }: Route,
  visit?: (literal: Literal, vars: Vars, passed: boolean) => LogicEffect<void>
) =>
  Effect.gen(function* () {
    const stops: Stop[] = [];
    let answers: readonly Vars[] = [start];
    for (const [at, literal] of body.entries()) {
      const next: Vars[] = [];
      const stopped: [string, Vars][] = [];
      for (const vars of answers) {
        const found = yield* matches(model, [literal], vars);
        if (found.length === 0) {
          stopped.push([answerKey(vars), vars]);
        }
        yield* visit?.(literal, vars, found.length > 0) ?? Effect.void;
        next.push(...found);
      }
      stopped.sort(([a], [b]) => (a < b ? -1 : Number(a > b)));
      stops.push(...stopped.map(([, vars]): Stop => [at, vars]));
      answers = next;
    }
    return { full: answers, stops };
  });

/**
 * Settles whether a goal that was asked could come to hold. One that could
 * not, as long as a goal still being asked above it cannot, waits for that
 * goal with everything that waited for it. One that could not on its own
 * settles what waited for it as well, and one that could sends what waited
 * for it to be asked again.
 */
const settle = (
  telling: Telling,
  key: string,
  depth: number,
  open: boolean,
  rests: number
) => {
  const waits = !open && rests < depth;
  if (waits) {
    telling.resting.set(key, rests);
  } else {
    telling.opened.set(key, open);
  }
  for (const [other, at] of telling.resting) {
    if (at >= depth && other !== key) {
      telling.resting.delete(other);
      if (waits) {
        telling.resting.set(other, rests);
      } else if (!open) {
        telling.opened.set(other, false);
      }
    }
  }
};

/**
 * True when a goal could come to have a match, or another match, for an
 * answer once an unknown is known: it reads an unknown itself, or along one
 * of the ways it can hold, a goal that was reached could gain a match, a
 * goal that stopped the way could come to hold, or what a goal computes
 * could change. A goal that would need itself to gain a match gains none.
 */
const opens = (
  telling: Telling,
  goal: unknown,
  vars: Vars
): LogicEffect<boolean> =>
  Effect.gen(function* () {
    const key = JSON.stringify(instantiate(goal, vars));
    const known = telling.opened.get(key);
    if (known !== undefined) {
      return known;
    }
    const above = telling.looking.get(key) ?? telling.resting.get(key);
    if (above !== undefined) {
      telling.rests = Math.min(telling.rests, above);
      return false;
    }
    if (!hasRoutes(goal)) {
      return yield* readsUnknown(telling, [goal], vars, true);
    }
    const depth = telling.looking.size;
    const outer = telling.rests;
    telling.rests = Number.POSITIVE_INFINITY;
    telling.looking.set(key, depth);
    let open = yield* readsUnknown(telling, [goal], vars, false);
    const visit = (literal: Literal, reached: Vars, passed: boolean) =>
      Effect.gen(function* () {
        if (open) {
          return;
        }
        if (literal instanceof Atom) {
          open = yield* opens(telling, literal, reached);
        } else if (
          !(comparesValues(literal) || (passed && isForm(literal, "not")))
        ) {
          // What a goal under "not" denies holds here, and could cease to.
          open = yield* readsUnknown(telling, [literal], reached, true);
        }
      });
    for (const route of open ? [] : yield* routes(telling.model, goal, vars)) {
      yield* run(telling.model, route, visit);
    }
    telling.looking.delete(key);
    settle(telling, key, depth, open, telling.rests);
    telling.rests = Math.min(outer, open ? outer : telling.rests);
    return open;
  });

/**
 * The row a relation goal matched for an answer. The answer says what the
 * goal's variables are, and the row is the one that fits its arguments with
 * them. Where several do, since a variable of the goal is its own or an
 * argument is a schema, it is the one that sorts first, whatever order the
 * rows were added in.
 */
const matchedRow = (model: Model, atom: Atom, vars: Vars) =>
  Effect.gen(function* () {
    const found = yield* lookup(
      model,
      atom,
      vars,
      rowsOf(model, atom.relation.name)
    );
    const one = found.free.length === 0 && found.patterns.length === 0;
    let first: Tuple | undefined;
    for (const tuple of found.tuples) {
      if ((yield* matchRow(model, found, tuple, vars)).length === 0) {
        continue;
      }
      if (one) {
        return tuple;
      }
      if (first === undefined || compareValues(tuple, first) < 0) {
        first = tuple;
      }
    }
    return first ?? (yield* tupleOf(model, atom.args, vars));
  });

/**
 * How a goal held for an answer: the row a relation call matched, the goal
 * under a `not` as it is absent, and any other goal as a check, with the
 * answer's values in place of its variables. A goal that computed a value,
 * such as `["=", "?ratio", ["number/divide", "?a", "?b"]]`, shows the
 * arithmetic on the values it was given. A relation call, and an "=" or
 * "in" between values, hold whatever an unknown is. Anything that computes
 * with one may not.
 */
const held = (
  telling: Telling,
  goal: unknown,
  vars: Vars
): LogicEffect<unknown> =>
  Effect.gen(function* () {
    if (isForm(goal, "not")) {
      return yield* missing(telling, goal.parts[0], vars);
    }
    if (!(goal instanceof Atom)) {
      return marked(
        { check: instantiate(goal, vars) },
        !comparesValues(goal) &&
          (yield* readsUnknown(telling, [goal], vars, true))
      );
    }
    const tuple = yield* matchedRow(telling.model, goal, vars);
    const row = yield* explain(telling, goal.relation, tuple);
    const computed = goal.plain ? [] : goal.args.filter(isComputed);
    return marked(row, yield* readsUnknown(telling, computed, vars, true));
  });

/**
 * What a rule's body rested on for one answer: each goal as it held, and
 * what a key or an equality rule made equal.
 */
const premises = (telling: Telling, { rule, same, vars }: Match) =>
  Effect.gen(function* () {
    // A candidate of a relation's merge is one of its facts.
    if (rule.given) {
      return [
        {
          fact: [
            rule.head.relation.name,
            ...rule.head.relation.columns.map((_, at) =>
              vars.get(`_fact${at}`)
            ),
          ],
          given: true,
        },
      ];
    }
    const out: unknown[] = [];
    for (const literal of rule.body) {
      out.push(yield* held(telling, literal, vars));
    }
    for (const [unknown, value] of same ?? []) {
      out.push({ same: [unknown, value] });
    }
    return out;
  });

/**
 * True when what a rule combines for a row could change once an unknown is
 * known: the rule's body, asked for the row, reads an unknown. A match that
 * holds one took it from such a row, and could be another match once the
 * unknown is known.
 */
const combinesUnknown = (
  telling: Telling,
  rule: CompiledRule,
  found: readonly Match[]
) => {
  const [first] = found;
  if (rule.aggregates.length === 0 || first === undefined) {
    return Effect.succeed(false);
  }
  const group = new Map(
    rule.head.args.flatMap((arg, at): [string, unknown][] =>
      arg instanceof LogicVariable && !rule.aggregates.includes(at)
        ? [[arg.name, first.vars.get(arg.name)]]
        : []
    )
  );
  return opens(telling, new LogicForm("and", rule.body), group);
};

/**
 * Explains a row that holds: a fact, a computed row, or what derived it, as
 * deriving it from the facts as they now are finds it first. A row that
 * combines matches tells them in order, and counts what is known.
 */
const explain = (
  telling: Telling,
  { computed, name }: RelationInfo,
  tuple: Tuple
): LogicEffect<object> =>
  Effect.gen(function* () {
    if (computed !== undefined) {
      return { fact: computed.form(tuple), computed: true };
    }
    const fact = [name, ...tuple];
    const derivation = yield* derivationOf(telling.model, name, tuple);
    if (derivation === undefined) {
      return { fact, given: true };
    }
    const rule = derivation.rule.source;
    const found =
      "vars" in derivation
        ? [derivation]
        : [...derivation.matches].sort(compareMatches(telling.model.rules));
    const told = yield* Effect.forEach(found, (one) => premises(telling, one));
    return marked(
      "vars" in derivation
        ? { fact, rule, because: told[0] }
        : { fact, rule, matches: told },
      yield* combinesUnknown(telling, derivation.rule, found)
    );
  });

/**
 * Tells each place a way stopped: the goals that held under `because`, and
 * under `but` the goal that did not.
 */
const stopped = (
  telling: Telling,
  { body, rule }: Route,
  stops: readonly Stop[]
) =>
  Effect.forEach(stops, ([at, vars]) =>
    Effect.gen(function* () {
      const because: unknown[] = [];
      for (const literal of body.slice(0, at)) {
        because.push(yield* held(telling, literal, vars));
      }
      const but = yield* missing(telling, body[at], vars);
      return rule === undefined
        ? { because, but }
        : { rule: rule.source, because, but };
    })
  );

/**
 * The rows a rule gave for the answers its whole body has: other rows than
 * the goal asked about, since it is absent. A row is looked up by what the
 * head says of it for the answer, apart from what the head combines or
 * invents, and is told once.
 */
const gave = (
  telling: Telling,
  rule: CompiledRule,
  head: Atom,
  answers: readonly Vars[]
) =>
  Effect.gen(function* () {
    const rows = new Map<string, Tuple>();
    for (const vars of answers) {
      const positions: number[] = [];
      const values: unknown[] = [];
      for (const [at, arg] of head.args.entries()) {
        const made = rule.invents !== undefined && isComputed(arg);
        if (!(made || rule.aggregates.includes(at))) {
          positions.push(at);
          values.push(yield* term(telling.model, arg, vars));
        }
      }
      const found = rowsOf(telling.model, head.relation.name);
      for (const tuple of found.lookup(positions, values)) {
        rows.set(valueKey(tuple), tuple);
      }
    }
    const sorted = [...rows].sort(([a], [b]) => (a < b ? -1 : Number(a > b)));
    return yield* Effect.forEach(sorted, ([, tuple]) =>
      Effect.map(explain(telling, head.relation, tuple), (but) => ({
        rule: rule.source,
        but,
      }))
    );
  });

/**
 * Every way an absent goal could have held, and what stood in its way: the
 * way's body stopped, or its rule gave another row.
 */
const ways = (telling: Telling, goal: Atom | LogicForm, vars: Vars) =>
  Effect.gen(function* () {
    const out: object[] = [];
    for (const route of yield* routes(telling.model, goal, vars)) {
      const { full, stops } = yield* run(telling.model, route);
      out.push(...(yield* stopped(telling, route, stops)));
      if (route.rule !== undefined && route.head !== undefined) {
        out.push(...(yield* gave(telling, route.rule, route.head, full)));
      }
    }
    return out;
  });

/**
 * A goal as it reads with an answer's values, so that asking it again asks
 * the same. A goal with a relation in it is a question, and the variables
 * the answer does not bind are its own. A goal with none, such as an "in"
 * that found nothing for its variable to be, says so with `exists`.
 */
const asAsked = (goal: unknown, vars: Vars) => {
  const read = instantiate(goal, vars);
  const own =
    goal instanceof LogicValue && !isQuestion(goal)
      ? goal.variables
          .filter((name) => !(vars.has(name) || name.startsWith("_")))
          .map((name) => instantiate(new LogicVariable(name), vars))
      : [];
  return own.length === 0 ? read : ["exists", [...new Set(own)], read];
};

/**
 * Why a goal does not hold for an answer. A goal under `not` does not hold
 * because what it denies does. Any other goal is absent, as it reads with
 * the answer's values, and one that could hold in several ways says what
 * stood in the way of each, the first time the tree comes to it. It is
 * `assumed` when it could come to hold once an unknown is known.
 */
const missing = (
  telling: Telling,
  goal: unknown,
  vars: Vars
): LogicEffect<unknown> =>
  Effect.gen(function* () {
    if (isForm(goal, "not")) {
      return yield* held(telling, goal.parts[0], vars);
    }
    const absent = asAsked(goal, vars);
    const node = marked({ absent }, yield* opens(telling, goal, vars));
    const key = JSON.stringify(absent);
    if (!hasRoutes(goal) || telling.told.has(key)) {
      return node;
    }
    telling.told.add(key);
    return { ...node, because: yield* ways(telling, goal, vars) };
  });

/** How a fact holds, or why it does not. */
export const why = (model: Model, atom: Atom): LogicEffect<unknown> =>
  Effect.gen(function* () {
    const telling: Telling = {
      fed: new Map(),
      looking: new Map(),
      model,
      opened: new Map(),
      rests: Number.POSITIVE_INFINITY,
      resting: new Map(),
      told: new Set(),
    };
    return (yield* holds(model, atom, NO_VARS))
      ? yield* explain(telling, atom.relation, atom.args)
      : yield* missing(telling, atom, NO_VARS);
  });

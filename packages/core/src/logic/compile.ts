/**
 * Compiles goals into bodies the engine can run: the alternatives of a goal,
 * each a list of literals in an order in which every literal has what it
 * needs when its turn comes.
 */
import { Effect } from "effect";
import { LogicError } from "@/errors/evaluation";
import { aggregateCall } from "@/logic/aggregates";
import {
  Atom,
  callsOf,
  containsNestedLogic,
  DeferredCall,
  type Goal,
  isForm,
  isGoal,
  isQuestion,
  isRelational,
  isWaitingForm,
  LogicForm,
  LogicValue,
  LogicVariable,
  logicKey,
  ownVariables,
  patternParts,
  type RelationInfo,
  render,
  replaceVariables,
  show,
  termVariables,
} from "@/logic/terms";

/**
 * One step of a compiled body, in the order the engine runs it. A relation
 * call matches the relation's rows and binds its variables, "=", "in", and
 * "schema/fits?" bind variables or test, and any other goal is a test: a
 * filter, or a question such as a goal under "not".
 */
export type Literal = Exclude<Goal, boolean>;

export interface CompiledRule {
  /** Head positions that hold an aggregate; empty for an ordinary rule. */
  readonly aggregates: readonly number[];
  readonly body: readonly Literal[];
  /**
   * The rule's evaluated head and goals, before compiling, so a snapshot can
   * write the rule back out. Rules made by the query rewrite leave it out.
   */
  readonly definition?: readonly unknown[];
  /**
   * Set for a rule the query rewrite makes to say which arguments a
   * goal-directed query asks a relation about.
   */
  readonly demand?: true;
  /**
   * Set for an equality rule: a head that says two values are the same,
   * held as the two arguments of `head`, a call of `EQUALITY`. It adds no
   * row. While the relations its body reads are derived, it makes an
   * unknown the rules there invented take the value it equals.
   */
  readonly equates?: true;
  /**
   * Set for the rule that reads a relation's facts as candidates of its
   * merge, which the relation's declaration makes. A snapshot writes the
   * declaration, and not this rule.
   */
  readonly given?: true;
  readonly head: Atom;
  /**
   * Set for a rule whose head says `exists`. Such a rule adds every
   * relation call of its head at once, for each answer of its body, and
   * only when the head does not hold already.
   */
  readonly invents?: Invention;
  /**
   * Equal for rule forms a snapshot would write the same way, so adding a
   * rule the database already holds changes nothing. Alternatives of one `or`
   * share it. Undefined for rules that hold a value with no written form,
   * such as a lambda that calls itself, and for rules made by the query
   * rewrite.
   */
  readonly key?: string;
  /** The rendered `rule` form. Alternatives of one `or` share it. */
  readonly source: unknown;
}

/** How a rule whose head says `exists` invents values. */
export interface Invention {
  /**
   * The head's relation calls as a body, with the variables `exists` lists
   * free: an answer of the rule's body that has a match of it already holds
   * the head, and invents nothing.
   */
  readonly check: readonly Literal[];
  /** What `exists` says holds: a relation call, or an `and` of them. */
  readonly goal: unknown;
  /**
   * Every relation call of the head, the first being the rule's `head`,
   * with the unknown that `some` names in place of each listed variable.
   */
  readonly heads: readonly Atom[];
  /** The variables `exists` lists, without the `?`. */
  readonly names: readonly string[];
}

const HEADS = new WeakMap<CompiledRule, readonly Atom[]>();

/** Every relation call a rule adds rows to. */
export const headsOf = (rule: CompiledRule): readonly Atom[] => {
  if (rule.invents !== undefined) {
    return rule.invents.heads;
  }
  let heads = HEADS.get(rule);
  if (heads === undefined) {
    heads = [rule.head];
    HEADS.set(rule, heads);
  }
  return heads;
};

export interface CompiledQuery {
  /** The goal's alternatives, each in the order the engine runs it. */
  readonly bodies: readonly (readonly Literal[])[];
  /** The variables an answer can bind, in the order the goal mentions them. */
  readonly outputs: readonly string[];
}

/** One alternative of a goal, and the variables it binds. */
interface Plan {
  readonly body: readonly Literal[];
  readonly bound: ReadonlySet<string>;
}

/** Why a goal cannot be compiled. `compiling` reports it as a LogicError. */
class Problem extends Error {}

const problem = (message: string): never => {
  throw new Problem(message);
};

/** Runs the compiler, which fails with why a goal cannot be compiled. */
export const compiling = <A>(compile: () => A) =>
  Effect.try({
    try: compile,
    catch: (error) => {
      if (error instanceof Problem) {
        return new LogicError({ message: error.message });
      }
      throw error;
    },
  });

/** Runs the compiler, and gives undefined when a goal cannot be compiled. */
export const compilable = <A>(compile: () => A): A | undefined => {
  try {
    return compile();
  } catch (error) {
    if (error instanceof Problem) {
      return undefined;
    }
    throw error;
  }
};

const MAX_ALTERNATIVES = 64;

let anonymous = 0;

/**
 * Gives an anonymous variable a name of its own, so its occurrences stay
 * independent of each other, and of the variables of every other body.
 */
const fresh = (term: unknown) => {
  if (!(term instanceof LogicVariable && term.anonymous)) {
    return term;
  }
  anonymous += 1;
  return new LogicVariable(`_${anonymous}`);
};

const isBinder = (goal: unknown): goal is Atom | LogicForm =>
  goal instanceof Atom || isForm(goal, "=", "in", "schema/fits?");

/**
 * The variables a value binds when it is matched against a term: the term
 * itself when it is a variable, and the variables that stand in a pattern,
 * a record or list that waits, or for a schema, what a `schema` function
 * waits to build. An anonymous variable inside a pattern fits any value and
 * binds nothing.
 */
const holes = (
  term: unknown,
  asSchema: boolean,
  inside = false
): readonly string[] => {
  if (term instanceof LogicVariable) {
    return inside && term.anonymous ? [] : [term.name];
  }
  const parts = patternParts(term, asSchema);
  return parts === undefined
    ? []
    : parts.flatMap((part) => holes(part, asSchema, true));
};

let local = 0;

/**
 * The goal of an `exists`, with the variables it lists renamed apart from
 * every other, so they are its own wherever it stands. A name that no
 * program can write keeps them from meeting a variable of the program.
 */
const opened = (exists: LogicForm) => {
  const [names, goal] = exists.parts as [readonly string[], unknown];
  local += 1;
  const renamed = new Map(
    names.map((name) => [name, new LogicVariable(`${name}#${local}`)])
  );
  return replaceVariables(goal, ({ name }) => renamed.get(name));
};

/**
 * Readies a goal to be expanded: names its anonymous variables, opens an
 * `exists`, and takes a goal out from under two `not`s, where it is a goal
 * of the body again instead of a question.
 */
const prepare = (goal: unknown): unknown => {
  if (isForm(goal, "and", "or")) {
    return goal.map(prepare);
  }
  if (isForm(goal, "exists")) {
    return prepare(opened(goal));
  }
  const [inner] = isForm(goal, "not") ? goal.parts : [];
  if (isForm(inner, "not")) {
    return prepare(inner.parts[0]);
  }
  return isBinder(goal) ? goal.map(fresh) : goal;
};

/** Logic values must be whole arguments, never inside a list or record. */
const checkNested = (owner: unknown, terms: readonly unknown[]): void => {
  for (const term of terms) {
    if (term instanceof DeferredCall) {
      checkNested(owner, term.parts);
    } else if (containsNestedLogic(term)) {
      problem(
        `Logic variables must be direct arguments, not nested inside arrays or records: ${show(owner)}`
      );
    }
  }
};

/**
 * Expands a goal into alternatives, each a list of literals to satisfy. An
 * `or` of relation goals gives one alternative for each. A choice between
 * filters stays one test, so like the plain `or` it stops at the first
 * filter that holds. A goal under `not` stays whole: it is a question.
 */
const alternatives = (goal: unknown): Literal[][] => {
  if (typeof goal === "boolean") {
    return goal ? [[]] : [];
  }
  if (!isGoal(goal)) {
    return problem(
      `Expected a goal but found ${show(goal)}. Goals are relation calls, not/and/or/=/in forms, or function calls on logic variables.`
    );
  }
  if (isForm(goal, "or") && isRelational(goal)) {
    return goal.parts.flatMap(alternatives);
  }
  if (!isForm(goal, "and")) {
    checkNested(goal, isBinder(goal) ? goal.parts : [goal]);
    return [[goal as Literal]];
  }
  return goal.parts.reduce<Literal[][]>(
    (all, part) => {
      const expanded = alternatives(part);
      const combined = all.flatMap((prefix) =>
        expanded.map((suffix) => [...prefix, ...suffix])
      );
      return combined.length > MAX_ALTERNATIVES
        ? problem(
            `Goal expands to more than ${MAX_ALTERNATIVES} alternatives; split it into separate rules.`
          )
        : combined;
    },
    [[]]
  );
};

/**
 * The variables a term needs bound before it can be evaluated. A question
 * needs only the variables that `scope`, the body around it, can bind: the
 * rest are the question's own. So does a form that waits, such as a `cond`,
 * since it may ask questions when it runs.
 */
const wants = (
  term: unknown,
  scope: ReadonlySet<string>
): readonly string[] => {
  if (term instanceof LogicVariable) {
    return [term.name];
  }
  if (!(term instanceof LogicValue)) {
    return [];
  }
  // Like a question, `exists` and `some` have variables of their own.
  if (isQuestion(term) || isForm(term, "exists", "some")) {
    return term.variables.filter((name) => scope.has(name));
  }
  if (isForm(term, "=", "in", "schema/fits?")) {
    // As a test, a goal that could bind needs its variables bound, except
    // the anonymous ones in a pattern, which fit anything.
    const [first, second] = term.parts;
    const asSchema = term.form === "schema/fits?";
    return [
      ...(asSchema ? wants(first, scope) : needs(first, false, scope, true)),
      ...(term.form === "in"
        ? wants(second, scope)
        : needs(second, asSchema, scope, true)),
    ];
  }
  const asks = term instanceof DeferredCall && isWaitingForm(term);
  return term.parts.flatMap((part) =>
    asks && part instanceof LogicVariable && !scope.has(part.name)
      ? []
      : wants(part, scope)
  );
};

/**
 * The variables a pattern needs bound before a value can be matched against
 * it: those of everything in it that is not itself a variable or a pattern.
 * With `tested`, the pattern binds nothing, so its variables are needed
 * too, except the anonymous ones.
 */
function needs(
  term: unknown,
  asSchema: boolean,
  scope: ReadonlySet<string>,
  tested = false
): readonly string[] {
  if (term instanceof LogicVariable) {
    return tested && !term.anonymous ? [term.name] : [];
  }
  const parts = patternParts(term, asSchema);
  return parts === undefined
    ? wants(term, scope)
    : parts.flatMap((part) => needs(part, asSchema, scope, tested));
}

/** The questions a term asks: goals with a relation in them, and finds. */
const questionsIn = (term: unknown): readonly LogicValue[] => {
  // What `some` describes is not asked.
  if (!(term instanceof LogicValue) || isForm(term, "some")) {
    return [];
  }
  // A goal under `not` is asked the same question, and then turned around.
  return isQuestion(term) && !isForm(term, "not")
    ? [term]
    : term.parts.flatMap(questionsIn);
};

/**
 * The variables a goal's relation goals, "=", "in", and "schema/fits?" can
 * bind.
 */
const binders = (goal: unknown): readonly string[] => {
  if (isForm(goal, "and", "or")) {
    return goal.parts.flatMap(binders);
  }
  if (isForm(goal, "exists")) {
    const own = ownVariables(goal);
    return binders(goal.parts[1]).filter((name) => !own.includes(name));
  }
  if (!isBinder(goal)) {
    return [];
  }
  if (isForm(goal, "schema/fits?")) {
    return holes(goal.parts[1], true);
  }
  // The arguments of a relation goal are schemas for its columns.
  return goal.parts.flatMap((part) => holes(part, goal instanceof Atom));
};

/**
 * The variables some literals can bind: the scope of the questions among
 * them, whose other variables are their own.
 */
export const scopeOf = (
  literals: readonly Literal[],
  bound: Iterable<string> = []
): ReadonlySet<string> => new Set([...bound, ...literals.flatMap(binders)]);

/**
 * True when a term can be evaluated once the variables in `bound` are, in a
 * body whose literals bind `scope`. A question in it waits only for the
 * variables of the scope, since the rest are the question's own.
 */
export const isEvaluable = (
  term: unknown,
  bound: ReadonlySet<string>,
  scope: ReadonlySet<string>
) => wants(term, scope).every((name) => bound.has(name));

const isReady = (
  literal: Literal,
  bound: ReadonlySet<string>,
  scope: ReadonlySet<string>
) => {
  const known = (term: unknown) => isEvaluable(term, bound, scope);
  // A value can be matched against a variable, or against a pattern once
  // everything in it but its variables is known.
  const free = (term: unknown, asSchema = false) =>
    (term instanceof LogicVariable ||
      patternParts(term, asSchema) !== undefined) &&
    needs(term, asSchema, scope).every((name) => bound.has(name));
  if (literal instanceof Atom) {
    // A relation goal binds its variables, except the inputs of a computed
    // relation, which another goal must bind first.
    const inputs = literal.relation.computed?.inputs ?? 0;
    return literal.args.every(
      (arg, position) => (free(arg, true) && position >= inputs) || known(arg)
    );
  }
  const [first, second] = literal.parts;
  if (isForm(literal, "in")) {
    return known(second) && (free(first) || known(first));
  }
  if (isForm(literal, "=")) {
    const [left, right] = [known(first), known(second)];
    return (left || free(first)) && (right || free(second)) && (left || right);
  }
  if (isForm(literal, "schema/fits?")) {
    return known(first) && (free(second, true) || known(second));
  }
  // Anything else is a test, which needs every variable it waits for.
  return known(literal);
};

/**
 * Adds the variables a literal binds. With `fromData`, only variables whose
 * values come from facts rather than from computation: bound by a relation
 * goal, or by "=" or "in" from such variables or plain values.
 */
export const bindVariables = (
  literal: Literal,
  bound: Set<string>,
  fromData = false
) => {
  const known = (term: unknown) =>
    !fromData ||
    (term instanceof LogicVariable
      ? bound.has(term.name)
      : !(term instanceof LogicValue));
  const bind = (term: unknown, when: boolean, asSchema = false) => {
    for (const name of when ? holes(term, asSchema) : []) {
      bound.add(name);
    }
  };
  const [first, second] = literal.parts;
  if (literal instanceof Atom) {
    for (const arg of literal.args) {
      bind(arg, true, true);
    }
  } else if (isForm(literal, "=")) {
    const [left, right] = [known(first), known(second)];
    bind(first, right);
    bind(second, left);
  } else if (isForm(literal, "in")) {
    bind(first, known(second));
  } else if (isForm(literal, "schema/fits?")) {
    bind(second, known(first), true);
  }
};

/**
 * Where a value comes from: the columns of relations it is read from, and
 * whether it is made, by a function, a record or list, or `some`, rather
 * than read as it is or taken apart.
 */
export interface Origin {
  /** Each column, named by `columnOf`, with the relation it belongs to. */
  readonly columns: ReadonlyMap<string, string>;
  readonly made: boolean;
}

const NOWHERE: Origin = { columns: new Map(), made: false };

/** Names a column of a relation, for the graph that follows values. */
export const columnOf = (relation: string, position: number) =>
  `${relation}\u0000${position}`;

/**
 * Where the value of each variable a body binds comes from. A variable that
 * a relation goal of the body binds is read from the columns it stands in,
 * whatever binds it first, since its value is one those columns hold. Any
 * other variable comes from the term "=", "in", or "schema/fits?" takes it
 * from: taking a part of a value makes nothing new, and computing does.
 */
export const valueOrigins = (body: readonly Literal[]) => {
  const origins = new Map<string, Origin>();
  for (const literal of body) {
    if (!(literal instanceof Atom)) {
      continue;
    }
    for (const [position, arg] of literal.args.entries()) {
      for (const name of holes(arg, true)) {
        const columns = new Map(origins.get(name)?.columns);
        const { name: relation } = literal.relation;
        origins.set(name, {
          columns: columns.set(columnOf(relation, position), relation),
          made: false,
        });
      }
    }
  }
  const of = (term: unknown) => originOf(term, origins);
  const take = (pattern: unknown, from: Origin, asSchema = false) => {
    for (const name of holes(pattern, asSchema)) {
      if (!origins.has(name)) {
        origins.set(name, from);
      }
    }
  };
  for (const literal of body) {
    const [first, second] = literal.parts;
    if (isForm(literal, "=")) {
      take(first, of(second));
      take(second, of(first));
    } else if (isForm(literal, "in")) {
      const items = patternParts(second, false);
      take(first, items === undefined ? of(second) : joined(items.map(of)));
    } else if (isForm(literal, "schema/fits?")) {
      take(second, of(first), true);
    }
  }
  return origins;
};

const joined = (origins: readonly Origin[]): Origin => ({
  columns: new Map(origins.flatMap(({ columns }) => [...columns])),
  made: origins.some(({ made }) => made),
});

/**
 * Where a term's value comes from, once the variables it needs have theirs:
 * a variable's value comes from where the variable's does, a value written
 * in the program from nowhere, and anything else is made from its
 * variables.
 */
export const originOf = (
  term: unknown,
  origins: ReadonlyMap<string, Origin>
): Origin => {
  if (term instanceof LogicVariable) {
    return origins.get(term.name) ?? NOWHERE;
  }
  if (!(term instanceof LogicValue)) {
    return NOWHERE;
  }
  return {
    ...joined(term.variables.map((name) => origins.get(name) ?? NOWHERE)),
    made: true,
  };
};

const boundArguments = (atom: Atom, bound: ReadonlySet<string>) =>
  atom.args.filter(
    (arg) => !(arg instanceof LogicVariable) || bound.has(arg.name)
  ).length;

const RENAMED = /#\d+$/;

/** Variables as the program wrote them, without what `exists` adds. */
const variableNames = (names: readonly string[]) =>
  [...new Set(names.map((name) => `?${name.replace(RENAMED, "")}`))].join(", ");

/**
 * The next literal that can run: the first filter that is ready, in the
 * order written, or else the relation goal with the most known arguments.
 */
const nextReady = (
  remaining: readonly Literal[],
  bound: ReadonlySet<string>,
  scope: ReadonlySet<string>
) => {
  const ready = remaining.filter((literal) => isReady(literal, bound, scope));
  return (
    ready.find((literal) => !(literal instanceof Atom)) ??
    ready.reduce<Literal | undefined>(
      (best, atom) =>
        best !== undefined &&
        boundArguments(best as Atom, bound) >=
          boundArguments(atom as Atom, bound)
          ? best
          : atom,
      undefined
    )
  );
};

/** Checks that the questions some terms ask can be asked once `bound` is. */
const checkQuestions = (
  terms: readonly unknown[],
  bound: ReadonlySet<string>
) => {
  for (const question of terms.flatMap(questionsIn)) {
    questionPlans(question, (name) => bound.has(name));
  }
};

/**
 * Orders literals so each one runs only after the variables it needs are
 * bound: filters as early as possible, in the order written, then the most
 * constrained relation. Fails when a literal can never run, or asks a
 * question that cannot be asked.
 */
export const planLiterals = (
  literals: readonly Literal[],
  initiallyBound: Iterable<string> = []
): Literal[] => {
  const remaining = [...literals];
  const ordered: Literal[] = [];
  const bound = new Set<string>(initiallyBound);
  const scope = scopeOf(literals, bound);
  for (let [stuck] = remaining; stuck !== undefined; [stuck] = remaining) {
    const next = nextReady(remaining, bound, scope);
    if (next === undefined) {
      const unbound = (isBinder(stuck) ? stuck.parts : [stuck])
        .flatMap((part) => wants(part, scope))
        .filter((name) => !(bound.has(name) || name.startsWith("_")));
      return problem(
        `Unsafe goal ${show(stuck)}: ${variableNames(unbound) || "its inputs"} must first be bound by a relation, "=", "in", or "schema/fits?".`
      );
    }
    checkQuestions(next instanceof Atom ? next.args : [next], bound);
    remaining.splice(remaining.indexOf(next), 1);
    ordered.push(next);
    bindVariables(next, bound);
  }
  return ordered;
};

/** A goal's alternatives, each planned, with the variables it binds. */
const plan = (goal: unknown, outer: readonly string[] = []) =>
  alternatives(prepare(goal)).map((literals): Plan => {
    const body = planLiterals(literals, outer);
    const bound = new Set(outer);
    for (const literal of body) {
      bindVariables(literal, bound);
    }
    return { body, bound };
  });

/**
 * Checks that values can be computed from a body's answers: no logic value
 * hides in a list, the body binds every variable they need, and their
 * questions can be asked. `unbound` words the message for missing variables.
 */
const checkValues = (
  owner: unknown,
  terms: readonly unknown[],
  bound: ReadonlySet<string>,
  unbound: (names: string) => string
) => {
  checkNested(owner, terms);
  const missing = terms
    .flatMap((term) => wants(term, bound))
    .filter((name) => !bound.has(name));
  if (missing.length > 0) {
    problem(unbound(variableNames(missing)));
  }
  checkQuestions(terms, bound);
};

const planQuestion = (question: LogicValue, outer: readonly string[]) => {
  if (isForm(question, "assuming")) {
    return planAssuming(question, outer);
  }
  if (!isForm(question, "find")) {
    return plan(question, outer);
  }
  const [template, goal] = question.parts;
  const planned = plan(goal, outer);
  for (const { bound } of planned) {
    checkValues(
      question,
      [template],
      bound,
      (names) =>
        `Unsafe find ${show(question)}: its goal does not bind ${names}.`
    );
  }
  return planned;
};

/**
 * An `assuming` is asked of another database, so here it has nothing to
 * match: what its changes state must be known when it is asked, and the
 * questions of its expression must be ones that can be asked there, with
 * the variables the rule or query around it binds.
 */
const planAssuming = (
  question: LogicValue,
  outer: readonly string[]
): readonly Plan[] => {
  const bound = new Set(outer);
  const changes = (question as LogicForm).parts.slice(0, -1);
  checkValues(
    question,
    changes.flatMap((change) =>
      (change as LogicForm).parts.flatMap((call) => (call as Atom).args)
    ),
    bound,
    (names) =>
      `Unsafe assuming ${show(question)}: what its changes state must be known, but ${names} is not bound by the rule or query around it.`
  );
  checkQuestions([(question as LogicForm).parts.at(-1)], bound);
  return [{ body: [], bound }];
};

const PLANS = new WeakMap<LogicValue, Map<string, readonly Plan[]>>();

/**
 * How to answer a question, a find or a goal with a relation in it, for an
 * answer that has bound some of its variables. Those variables are fixed and
 * every other variable is the question's own, so the question plans like a
 * query that starts with them bound. Fails when it cannot be asked.
 */
export const questionPlans = (
  question: LogicValue,
  isBound: (name: string) => boolean
): readonly Plan[] => {
  const outer = [...new Set(question.variables.filter(isBound))];
  const key = outer.join(" ");
  let plans = PLANS.get(question);
  if (plans === undefined) {
    plans = new Map();
    PLANS.set(question, plans);
  }
  let planned = plans.get(key);
  if (planned === undefined) {
    planned = planQuestion(question, outer);
    plans.set(key, planned);
  }
  return planned;
};

const NOTHING: ReadonlySet<string> = new Set();

const aggregatesOf = (head: Atom) =>
  head.args.flatMap((arg, position) =>
    arg instanceof DeferredCall && arg.aggregate !== undefined ? [position] : []
  );

/**
 * A head of a relation that merges what a key gets: each column it merges
 * joins its values with its aggregate, as if the head said so. A head that
 * aggregates there already keeps what it says, and must say the same.
 */
const merging = (head: Atom): Atom => {
  const { merge } = head.relation;
  if (merge === undefined) {
    return head;
  }
  const kinds = new Map(merge);
  return new Atom(
    head.relation,
    head.args.map((arg, position) => {
      const kind = kinds.get(position);
      return kind === undefined ||
        (arg instanceof DeferredCall && arg.aggregate !== undefined)
        ? arg
        : aggregateCall(kind, arg);
    })
  );
};

/**
 * What a rule's head says: its relation calls, and the variables `exists`
 * lists, for which the rule invents values.
 */
/**
 * Where an equality rule's head stands: a relation named "=", which no
 * program can declare, since "=" is the name of a form.
 */
export const EQUALITY: RelationInfo = { name: "=", columns: ["left", "right"] };

/** The relation calls and the "=" goals a head joins with "and". */
const headParts = (
  goal: unknown
): { calls: Atom[]; equals: LogicForm[] } | undefined => {
  if (goal instanceof Atom) {
    return { calls: [goal], equals: [] };
  }
  if (isForm(goal, "=")) {
    return { calls: [], equals: [goal] };
  }
  if (!isForm(goal, "and")) {
    return undefined;
  }
  const parts = { calls: [] as Atom[], equals: [] as LogicForm[] };
  for (const part of goal.parts) {
    const inner = headParts(part);
    if (inner === undefined) {
      return undefined;
    }
    parts.calls.push(...inner.calls);
    parts.equals.push(...inner.equals);
  }
  return parts;
};

/**
 * What a rule's head says: its relation calls, the values it says are the
 * same, and the variables `exists` lists, for which the rule invents
 * values. `exists` goes over relation calls only.
 */
const headOf = (head: unknown) => {
  const [invented, goal] = isForm(head, "exists")
    ? (head.parts as [readonly string[], unknown])
    : [[], head];
  const parts =
    invented.length === 0
      ? headParts(goal)
      : { calls: callsOf(goal), equals: [] };
  if (parts?.calls === undefined) {
    return problem(
      `A rule head must be a relation call or "=", an "and" of those, or "exists" over relation calls, but found ${show(head)}.`
    );
  }
  return { calls: parts.calls, equals: parts.equals, goal, invented };
};

/**
 * The invariant an equality rule stands for: no answer of its body gives
 * the two sides different values. Each "=" of the head gives one.
 */
export const equalityGoals = (head: unknown, body: readonly unknown[]) =>
  (headParts(head)?.equals ?? []).map(
    (equal) => new LogicForm("and", [...body, new LogicForm("not", [equal])])
  );

/**
 * Where an unknown can stand: as a whole argument, or inside a record or
 * list, but not where something computes with it. Fails when the head
 * computes with a variable that `exists` lists.
 */
const planHeld = (
  head: unknown,
  calls: readonly Atom[],
  bound: ReadonlySet<string>
) => {
  const check = compilable(() => planLiterals(calls, bound));
  if (check === undefined) {
    return problem(
      `Rule head ${show(head)} computes with a variable that "exists" lists. An unknown can stand as an argument, or inside a record or list, but nothing can compute with it.`
    );
  }
  return check;
};

export const compileRule = (head: unknown, body: readonly unknown[]) =>
  compiling(() => {
    const { calls, equals, goal, invented } = headOf(head);
    const sides = equals.map((equal) => new Atom(EQUALITY, equal.parts));
    const direct = [...calls, ...sides].flatMap((call) =>
      call.args.flatMap((arg) => wants(arg, NOTHING))
    );
    if (direct.some((name) => name.startsWith("_"))) {
      problem(
        `A rule head cannot use the anonymous variable "?_": ${show(head)}.`
      );
    }
    // Each variable `exists` lists stands for the unknown that `some` names.
    const heads = calls.map((call) =>
      invented.length === 0
        ? call
        : (replaceVariables(call, (variable) =>
            invented.includes(variable.name)
              ? new LogicForm("some", [variable, goal])
              : undefined
          ) as Atom)
    );
    const planned = plan(new LogicForm("and", body));
    for (const { bound } of planned) {
      const taken = invented.find((name) => bound.has(name));
      if (taken !== undefined) {
        problem(
          `Rule head ${show(head)} lists "?${taken}" in "exists", but the body binds it too. Give one of them another name.`
        );
      }
      checkValues(
        head,
        [...heads, ...sides].flatMap((call) => call.args),
        bound,
        (names) =>
          `Unsafe rule head ${show(head)}: ${names} never appears in a relation in the body. To say the head holds for some value nobody has given, list it in "exists": ["exists", [${names
            .split(", ")
            .map((name) => JSON.stringify(name))
            .join(", ")}], head].`
      );
    }
    if (
      invented.length > 0 &&
      heads.some((call) => aggregatesOf(call).length)
    ) {
      problem(
        `Rule head ${show(head)} both aggregates and lists variables in "exists". A rule that invents values cannot aggregate.`
      );
    }
    const definition = [head, ...body];
    const key = logicKey(definition);
    const rule = {
      definition,
      source: ["rule", render(head), ...body.map(render)],
      ...(key === undefined ? {} : { key }),
    };
    if (invented.length === 0) {
      // Each relation call and each "=" of the head is a rule of its own.
      return planned.flatMap(({ body: literals }) => [
        ...heads.map(merging).map(
          (call): CompiledRule => ({
            ...rule,
            aggregates: aggregatesOf(call),
            body: literals,
            head: call,
          })
        ),
        ...sides.map(
          (side): CompiledRule => ({
            ...rule,
            aggregates: [],
            body: literals,
            equates: true,
            head: side,
          })
        ),
      ]);
    }
    return planned.map(
      ({ body: literals, bound }): CompiledRule => ({
        ...rule,
        aggregates: [],
        body: literals,
        head: heads[0] as Atom,
        invents: {
          check: planHeld(head, calls, bound),
          goal,
          heads,
          names: invented,
        },
      })
    );
  });

/**
 * Compiles a goal for a query. An answer can bind the variables that the
 * goal's own relation goals, "=", and "in" mention; a variable that only a
 * question inside the goal mentions is the question's own.
 */
export const compileQuery = (goal: unknown) =>
  compiling((): CompiledQuery => {
    const bindable = new Set(binders(goal));
    return {
      bodies: plan(goal).map(({ body }) => body),
      outputs: [...new Set(termVariables(goal))].filter(
        (name) => bindable.has(name) && !name.startsWith("_")
      ),
    };
  });

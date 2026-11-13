/**
 * Compiles goals into bodies the engine can run: the alternatives of a goal,
 * each a list of literals in an order in which every literal has what it
 * needs when its turn comes.
 */
import { Effect } from "effect";
import { LogicError } from "@/errors/evaluation";
import {
  Atom,
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
  patternParts,
  render,
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
  readonly head: Atom;
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

/**
 * Readies a goal to be expanded: names its anonymous variables, and takes a
 * goal out from under two `not`s, where it is a goal of the body again
 * instead of a question.
 */
const prepare = (goal: unknown): unknown => {
  if (isForm(goal, "and", "or")) {
    return goal.map(prepare);
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
  if (isQuestion(term)) {
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
  if (!(term instanceof LogicValue)) {
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
  if (!isBinder(goal)) {
    return [];
  }
  if (isForm(goal, "schema/fits?")) {
    return holes(goal.parts[1], true);
  }
  // The arguments of a relation goal are schemas for its columns.
  return goal.parts.flatMap((part) => holes(part, goal instanceof Atom));
};

const isReady = (
  literal: Literal,
  bound: ReadonlySet<string>,
  scope: ReadonlySet<string>
) => {
  const known = (term: unknown) =>
    wants(term, scope).every((name) => bound.has(name));
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

const boundArguments = (atom: Atom, bound: ReadonlySet<string>) =>
  atom.args.filter(
    (arg) => !(arg instanceof LogicVariable) || bound.has(arg.name)
  ).length;

const variableNames = (names: readonly string[]) =>
  [...new Set(names)].map((name) => `?${name}`).join(", ");

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
  const scope = new Set([...bound, ...literals.flatMap(binders)]);
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

export const compileRule = (head: unknown, body: readonly unknown[]) =>
  compiling(() => {
    if (!(head instanceof Atom)) {
      return problem(
        `A rule head must be a relation call, but found ${show(head)}.`
      );
    }
    const direct = head.args.flatMap((arg) => wants(arg, NOTHING));
    if (direct.some((name) => name.startsWith("_"))) {
      problem(
        `A rule head cannot use the anonymous variable "?_": ${show(head)}.`
      );
    }
    const planned = plan(new LogicForm("and", body));
    for (const { bound } of planned) {
      checkValues(
        head,
        head.args,
        bound,
        (names) =>
          `Unsafe rule head ${show(head)}: ${names} never appears in a relation in the body.`
      );
    }
    const definition = [head, ...body];
    const key = logicKey(definition);
    const rule = {
      aggregates: head.args.flatMap((arg, position) =>
        arg instanceof DeferredCall && arg.aggregate !== undefined
          ? [position]
          : []
      ),
      head,
      definition,
      source: ["rule", render(head), ...body.map(render)],
      ...(key === undefined ? {} : { key }),
    };
    return planned.map(
      (alternative): CompiledRule => ({ ...rule, body: alternative.body })
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

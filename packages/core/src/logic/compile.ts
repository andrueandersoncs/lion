import { Effect } from "effect";
import { logicError } from "@/errors/evaluation";
import {
  Atom,
  Conjunction,
  containsNestedLogic,
  DeferredCall,
  Disjunction,
  type Goal,
  isGoal,
  isWaiting,
  LogicVariable,
  logicKey,
  Membership,
  Negation,
  render,
  show,
  termVariables,
  Unification,
} from "@/logic/terms";

/**
 * One step of a compiled body, in the order the engine runs it. An atom
 * matches a relation's tuples, "=" and "in" bind a variable or test, and any
 * other goal is a test: a filter, or a choice between filters. With
 * `negated`, the goal must not hold.
 */
export interface Literal {
  readonly goal: Exclude<Goal, Negation | boolean>;
  readonly negated: boolean;
}

export interface CompiledRule {
  /** Head positions that hold an aggregate; empty for an ordinary rule. */
  readonly aggregates: readonly number[];
  readonly body: readonly Literal[];
  /**
   * The rule's evaluated head and goals, before compiling, so a snapshot can
   * write the rule back out. Rules made by the query rewrite leave it out.
   */
  readonly definition?: readonly unknown[];
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
  readonly body: readonly Literal[];
  readonly outputs: readonly string[];
}

const MAX_ALTERNATIVES = 64;

/** Gives every anonymous variable its own name so occurrences stay independent. */
const renameAnonymous = () => {
  let count = 0;
  const term = (value: unknown): unknown => {
    if (value instanceof LogicVariable && value.anonymous) {
      count += 1;
      return new LogicVariable(`_${count}`);
    }
    return value;
  };
  const goal = (value: unknown): unknown => {
    if (value instanceof Atom) {
      return new Atom(value.relation, value.args.map(term));
    }
    if (value instanceof Negation) {
      return new Negation(goal(value.goal) as Goal);
    }
    if (value instanceof Conjunction) {
      return new Conjunction(value.goals.map(goal) as Goal[]);
    }
    if (value instanceof Disjunction) {
      return new Disjunction(value.goals.map(goal) as Goal[]);
    }
    if (value instanceof Unification) {
      return new Unification(term(value.left), term(value.right));
    }
    return value instanceof Membership
      ? new Membership(term(value.element), term(value.list))
      : value;
  };
  return goal;
};

/** Logic values must be whole arguments, never inside a list or record. */
const nestedProblem = (
  owner: unknown,
  terms: readonly unknown[]
): string | undefined => {
  for (const term of terms) {
    if (term instanceof DeferredCall) {
      const problem = nestedProblem(owner, [term.fn, ...term.args]);
      if (problem !== undefined) {
        return problem;
      }
    } else if (containsNestedLogic(term)) {
      return `Logic variables must be direct arguments, not nested inside arrays or records: ${show(owner)}`;
    }
  }
  return undefined;
};

const leafTerms = (goal: Goal): readonly unknown[] => {
  if (goal instanceof Atom) {
    return goal.args;
  }
  if (goal instanceof Unification) {
    return [goal.left, goal.right];
  }
  return goal instanceof Membership ? [goal.element, goal.list] : [goal];
};

type Alternatives = readonly Literal[][] | string;

const anyOf = (goals: readonly Goal[], negated: boolean): Alternatives => {
  const result: Literal[][] = [];
  for (const branch of goals) {
    const expanded = alternatives(branch, negated);
    if (typeof expanded === "string") {
      return expanded;
    }
    result.push(...expanded);
  }
  return result;
};

const allOf = (goals: readonly Goal[], negated: boolean): Alternatives => {
  let result: Literal[][] = [[]];
  for (const part of goals) {
    const expanded = alternatives(part, negated);
    if (typeof expanded === "string") {
      return expanded;
    }
    result = result.flatMap((prefix) =>
      expanded.map((suffix) => [...prefix, ...suffix])
    );
    if (result.length > MAX_ALTERNATIVES) {
      return `Goal expands to more than ${MAX_ALTERNATIVES} alternatives; split it into separate rules.`;
    }
  }
  return result;
};

/**
 * Expands a goal into alternatives, each a list of literals to satisfy.
 * `negated` asks for the goal not to hold, which swaps `and` with `or` on
 * the way down. A choice between filters stays one test, so like the plain
 * `or` it stops at the first filter that holds.
 */
const alternatives = (goal: unknown, negated = false): Alternatives => {
  if (typeof goal === "boolean") {
    return goal === negated ? [] : [[]];
  }
  if (!isGoal(goal)) {
    return `Expected a goal but found ${show(goal)}. Goals are relation calls, not/and/or/=/in forms, or function calls on logic variables.`;
  }
  if (goal instanceof Negation) {
    return alternatives(goal.goal, !negated);
  }
  if (goal instanceof Conjunction || goal instanceof Disjunction) {
    if (goal instanceof Conjunction !== negated) {
      return allOf(goal.goals, negated);
    }
    return isWaiting(goal) ? [[{ goal, negated }]] : anyOf(goal.goals, negated);
  }
  const leaf = goal as Literal["goal"];
  return nestedProblem(leaf, leafTerms(leaf)) ?? [[{ goal: leaf, negated }]];
};

const allBound = (term: unknown, bound: ReadonlySet<string>) =>
  termVariables(term).every((name) => bound.has(name));

const isReady = ({ goal, negated }: Literal, bound: ReadonlySet<string>) => {
  if (goal instanceof Atom) {
    // An atom binds its variables, except the inputs of a computed relation
    // and, under `not`, every variable but the anonymous one.
    const inputs = goal.relation.computed?.inputs ?? 0;
    return goal.args.every(
      (arg, position) =>
        (arg instanceof LogicVariable &&
          position >= inputs &&
          (arg.anonymous || !negated)) ||
        allBound(arg, bound)
    );
  }
  if (!negated && goal instanceof Membership) {
    return (
      allBound(goal.list, bound) &&
      (goal.element instanceof LogicVariable || allBound(goal.element, bound))
    );
  }
  if (!negated && goal instanceof Unification) {
    const left = allBound(goal.left, bound);
    const right = allBound(goal.right, bound);
    return (
      (left || goal.left instanceof LogicVariable) &&
      (right || goal.right instanceof LogicVariable) &&
      (left || right)
    );
  }
  // Anything else is a test, which needs every variable it mentions.
  return allBound(goal, bound);
};

/**
 * Adds the variables a literal binds. With `fromData`, only variables whose
 * values come from facts rather than from computation: bound by a relation
 * goal, or by "=" or "in" from such variables or plain values.
 */
export const bindVariables = (
  { goal, negated }: Literal,
  bound: Set<string>,
  fromData = false
) => {
  const known = (term: unknown) =>
    !fromData ||
    (term instanceof LogicVariable
      ? bound.has(term.name)
      : termVariables(term).length === 0);
  const bind = (term: unknown, when: boolean) => {
    if (when && !negated && term instanceof LogicVariable) {
      bound.add(term.name);
    }
  };
  if (goal instanceof Atom) {
    for (const arg of goal.args) {
      bind(arg, true);
    }
  } else if (goal instanceof Unification) {
    const [left, right] = [known(goal.left), known(goal.right)];
    bind(goal.left, right);
    bind(goal.right, left);
  } else if (goal instanceof Membership) {
    bind(goal.element, known(goal.list));
  }
};

const boundArguments = (atom: Atom, bound: ReadonlySet<string>) =>
  atom.args.filter(
    (arg) => !(arg instanceof LogicVariable) || bound.has(arg.name)
  ).length;

/** The goal a literal came from, for messages. */
export const literalGoal = ({ goal, negated }: Literal): Goal =>
  negated ? new Negation(goal) : goal;

/** True for a literal that matches a relation's tuples. */
export const matchesAtom = (
  literal: Literal
): literal is { readonly goal: Atom; readonly negated: false } =>
  literal.goal instanceof Atom && !literal.negated;

/**
 * Orders literals so each one runs only after the variables it needs are
 * bound: filters as early as possible, in the order written, then the most
 * constrained relation.
 */
export const planLiterals = (
  literals: readonly Literal[],
  initiallyBound: Iterable<string> = []
): Literal[] | string => {
  const remaining = [...literals];
  const ordered: Literal[] = [];
  const bound = new Set<string>(initiallyBound);
  while (remaining.length > 0) {
    let index = remaining.findIndex(
      (literal) => !matchesAtom(literal) && isReady(literal, bound)
    );
    if (index === -1) {
      let most = -1;
      for (const [position, literal] of remaining.entries()) {
        if (matchesAtom(literal) && isReady(literal, bound)) {
          const count = boundArguments(literal.goal, bound);
          if (count > most) {
            most = count;
            index = position;
          }
        }
      }
    }
    const next = remaining[index];
    if (next === undefined) {
      const stuck = literalGoal(remaining[0] as Literal);
      const unbound = [
        ...new Set(
          termVariables(stuck).filter(
            (name) => !(bound.has(name) || name.startsWith("_"))
          )
        ),
      ].map((name) => `?${name}`);
      return `Unsafe goal ${show(stuck)}: ${unbound.join(", ") || "its inputs"} must first be bound by a relation, "=", or "in".`;
    }
    remaining.splice(index, 1);
    ordered.push(next);
    bindVariables(next, bound);
  }
  return ordered;
};

/** What is wrong with a rule's head before its body is planned, if anything. */
const headProblem = (head: unknown) => {
  if (!(head instanceof Atom)) {
    return `A rule head must be a relation call, but found ${show(head)}.`;
  }
  return termVariables(head).some((name) => name.startsWith("_"))
    ? `A rule head cannot use the anonymous variable "?_": ${show(head)}.`
    : nestedProblem(head, head.args);
};

/** A goal's alternatives, each planned, with the variables it binds. */
const plan = (goal: unknown) => {
  const expanded = alternatives(renameAnonymous()(goal));
  if (typeof expanded === "string") {
    return expanded;
  }
  const planned: { body: Literal[]; bound: Set<string> }[] = [];
  for (const literals of expanded) {
    const body = planLiterals(literals);
    if (typeof body === "string") {
      return body;
    }
    const bound = new Set<string>();
    for (const literal of body) {
      bindVariables(literal, bound);
    }
    planned.push({ body, bound });
  }
  return planned;
};

export const compileRule = (head: unknown, body: readonly unknown[]) =>
  Effect.gen(function* () {
    const planned = headProblem(head) ?? plan(new Conjunction(body as Goal[]));
    if (typeof planned === "string") {
      return yield* logicError(planned);
    }
    const atom = head as Atom;
    const unbound = planned
      .map(({ bound }) =>
        termVariables(atom).filter((name) => !bound.has(name))
      )
      .find((names) => names.length > 0);
    if (unbound !== undefined) {
      return yield* logicError(
        `Unsafe rule head ${show(head)}: ${[...new Set(unbound)].map((name) => `?${name}`).join(", ")} never appears in a relation in the body.`
      );
    }
    const definition = [head, ...body];
    const key = logicKey(definition);
    const rule = {
      aggregates: atom.args.flatMap((arg, position) =>
        arg instanceof DeferredCall && arg.aggregate !== undefined
          ? [position]
          : []
      ),
      head: atom,
      definition,
      source: ["rule", render(head), ...body.map(render)],
      ...(key === undefined ? {} : { key }),
    };
    return planned.map(
      (alternative): CompiledRule => ({ ...rule, body: alternative.body })
    );
  });

/** The variables a query answers with: every named one its goal mentions. */
export const queryOutputs = (goal: unknown) => [
  ...new Set(termVariables(goal).filter((name) => !name.startsWith("_"))),
];

export const compileQuery = (goal: unknown) => {
  const planned = plan(goal);
  const outputs = queryOutputs(goal);
  return typeof planned === "string"
    ? logicError(planned)
    : Effect.succeed(
        planned.map(({ body }): CompiledQuery => ({ body, outputs }))
      );
};

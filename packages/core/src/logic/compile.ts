import { Effect } from "effect";
import { LogicError } from "@/errors/evaluation";
import {
  Aggregate,
  Atom,
  Conjunction,
  containsNestedLogic,
  DeferredCall,
  Disjunction,
  type Goal,
  isGoal,
  LogicVariable,
  Membership,
  Negation,
  render,
  termVariables,
  Unification,
} from "@/logic/terms";

/** One step of a compiled rule body, in the order the engine runs it. */
export type Literal =
  | { readonly kind: "atom"; readonly atom: Atom }
  | { readonly kind: "absent"; readonly atom: Atom }
  | { readonly kind: "check"; readonly call: DeferredCall }
  | { readonly kind: "unify"; readonly left: unknown; readonly right: unknown }
  | {
      readonly kind: "member";
      readonly element: unknown;
      readonly list: unknown;
    };

export interface CompiledRule {
  /** Head positions that hold an aggregate; empty for an ordinary rule. */
  readonly aggregates: readonly number[];
  readonly body: readonly Literal[];
  readonly head: Atom;
  /** The rendered `rule` form. Alternatives of one `or` share it. */
  readonly source: unknown;
}

export interface CompiledQuery {
  readonly body: readonly Literal[];
  readonly outputs: readonly string[];
}

const MAX_ALTERNATIVES = 64;

const fail = (message: string) => Effect.fail(new LogicError({ message }));

const show = (value: unknown) => JSON.stringify(render(value));

/** Gives every anonymous variable its own name so occurrences stay independent. */
const renameAnonymous = (counter: { next: number }) => {
  const renameTerm = (term: unknown): unknown => {
    if (term instanceof LogicVariable && term.anonymous) {
      counter.next += 1;
      return new LogicVariable(`_${counter.next}`);
    }
    if (term instanceof DeferredCall) {
      return new DeferredCall(term.fn, term.name, term.args.map(renameTerm));
    }
    return term;
  };
  const renameGoal = (goal: unknown): unknown => {
    if (goal instanceof Atom) {
      return new Atom(goal.relation, goal.args.map(renameTerm));
    }
    if (goal instanceof Negation) {
      return new Negation(renameGoal(goal.atom) as Atom);
    }
    if (goal instanceof Conjunction) {
      return new Conjunction(goal.goals.map(renameGoal) as Goal[]);
    }
    if (goal instanceof Disjunction) {
      return new Disjunction(goal.goals.map(renameGoal) as Goal[]);
    }
    if (goal instanceof Unification) {
      return new Unification(renameTerm(goal.left), renameTerm(goal.right));
    }
    if (goal instanceof Membership) {
      return new Membership(renameTerm(goal.element), renameTerm(goal.list));
    }
    return renameTerm(goal);
  };
  return renameGoal;
};

/**
 * Checks that logic values are direct arguments. Aggregates are allowed only
 * when `inHead` is set, and only as direct arguments of the head.
 */
const checkTerms = (
  owner: unknown,
  terms: readonly unknown[],
  inHead = false
): string | undefined => {
  for (const term of terms) {
    let nested: string | undefined;
    if (term instanceof Aggregate) {
      nested = inHead
        ? checkTerms(owner, [term.arg])
        : `Aggregates such as "aggregate/${term.kind}" can only be arguments of a rule head, but found one in ${show(owner)}.`;
    } else if (term instanceof DeferredCall) {
      nested = checkTerms(owner, term.args);
    } else if (!(term instanceof LogicVariable) && containsNestedLogic(term)) {
      nested = `Logic variables must be direct arguments, not nested inside arrays or records: ${show(owner)}`;
    }
    if (nested !== undefined) {
      return nested;
    }
  }
  return undefined;
};

type Alternatives = readonly Literal[][] | string;

const literalAlternatives = (
  goal: Atom | Negation | DeferredCall | Unification | Membership
): Alternatives => {
  if (goal instanceof Membership) {
    return (
      checkTerms(goal, [goal.element, goal.list]) ?? [
        [{ kind: "member", element: goal.element, list: goal.list }],
      ]
    );
  }
  if (goal instanceof Atom) {
    return checkTerms(goal, goal.args) ?? [[{ kind: "atom", atom: goal }]];
  }
  if (goal instanceof Negation) {
    return (
      checkTerms(goal, goal.atom.args) ?? [
        [{ kind: "absent", atom: goal.atom }],
      ]
    );
  }
  if (goal instanceof DeferredCall) {
    return checkTerms(goal, goal.args) ?? [[{ kind: "check", call: goal }]];
  }
  return (
    checkTerms(goal, [goal.left, goal.right]) ?? [
      [{ kind: "unify", left: goal.left, right: goal.right }],
    ]
  );
};

const anyOf = (goals: readonly Goal[]): Alternatives => {
  const result: Literal[][] = [];
  for (const branch of goals) {
    const expanded = alternatives(branch);
    if (typeof expanded === "string") {
      return expanded;
    }
    result.push(...expanded);
  }
  return result;
};

const allOf = (goals: readonly Goal[]): Alternatives => {
  let result: Literal[][] = [[]];
  for (const part of goals) {
    const expanded = alternatives(part);
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

/** Expands a goal into alternatives, each a list of literals to satisfy. */
const alternatives = (goal: unknown): Alternatives => {
  if (typeof goal === "boolean") {
    return goal ? [[]] : [];
  }
  if (!isGoal(goal)) {
    return `Expected a goal but found ${show(goal)}. Goals are relation calls, not/and/or/= forms, or pure function calls on logic variables.`;
  }
  if (goal instanceof Disjunction) {
    return anyOf(goal.goals);
  }
  if (goal instanceof Conjunction) {
    return allOf(goal.goals);
  }
  return literalAlternatives(goal);
};

const allBound = (term: unknown, bound: ReadonlySet<string>) =>
  termVariables(term).every((name) => bound.has(name));

const isReady = (literal: Literal, bound: ReadonlySet<string>): boolean => {
  switch (literal.kind) {
    case "atom":
      return literal.atom.args.every(
        (arg) => !(arg instanceof DeferredCall) || allBound(arg, bound)
      );
    case "absent":
      return literal.atom.args.every((arg) =>
        arg instanceof LogicVariable
          ? arg.anonymous || bound.has(arg.name)
          : allBound(arg, bound)
      );
    case "check":
      return allBound(literal.call, bound);
    case "unify": {
      const left = allBound(literal.left, bound);
      const right = allBound(literal.right, bound);
      return (
        (left && right) ||
        (left && literal.right instanceof LogicVariable) ||
        (right && literal.left instanceof LogicVariable)
      );
    }
    case "member":
      return (
        allBound(literal.list, bound) &&
        (literal.element instanceof LogicVariable ||
          allBound(literal.element, bound))
      );
    default:
      return false;
  }
};

const bindVariables = (literal: Literal, bound: Set<string>) => {
  if (literal.kind === "atom") {
    for (const arg of literal.atom.args) {
      if (arg instanceof LogicVariable) {
        bound.add(arg.name);
      }
    }
  }
  if (literal.kind === "unify") {
    for (const side of [literal.left, literal.right]) {
      if (side instanceof LogicVariable) {
        bound.add(side.name);
      }
    }
  }
  if (literal.kind === "member" && literal.element instanceof LogicVariable) {
    bound.add(literal.element.name);
  }
};

const boundArguments = (atom: Atom, bound: ReadonlySet<string>) =>
  atom.args.filter(
    (arg) => !(arg instanceof LogicVariable) || bound.has(arg.name)
  ).length;

const literalGoal = (literal: Literal): unknown => {
  switch (literal.kind) {
    case "atom":
      return literal.atom;
    case "absent":
      return new Negation(literal.atom);
    case "check":
      return literal.call;
    case "unify":
      return new Unification(literal.left, literal.right);
    case "member":
      return new Membership(literal.element, literal.list);
    default:
      return undefined;
  }
};

/**
 * Orders literals so each one runs only after the variables it needs are
 * bound: filters as early as possible, then the most constrained relation.
 */
const plan = (literals: readonly Literal[]): Literal[] | string => {
  const remaining = [...literals];
  const ordered: Literal[] = [];
  const bound = new Set<string>();
  while (remaining.length > 0) {
    let index = remaining.findIndex(
      (literal) => literal.kind !== "atom" && isReady(literal, bound)
    );
    if (index === -1) {
      let best = -1;
      remaining.forEach((literal, position) => {
        if (literal.kind !== "atom" || !isReady(literal, bound)) {
          return;
        }
        const current = remaining[best];
        if (
          current === undefined ||
          current.kind !== "atom" ||
          boundArguments(literal.atom, bound) >
            boundArguments(current.atom, bound)
        ) {
          best = position;
        }
      });
      index = best;
    }
    const next = remaining[index];
    if (next === undefined) {
      const stuck = remaining[0] as Literal;
      const unbound = [
        ...new Set(
          literalVariables(stuck).filter(
            (name) => !(bound.has(name) || name.startsWith("_"))
          )
        ),
      ].map((name) => `?${name}`);
      return `Unsafe goal ${show(literalGoal(stuck))}: ${unbound.join(", ") || "its inputs"} must first be bound by a relation, "=", or "in".`;
    }
    remaining.splice(index, 1);
    ordered.push(next);
    bindVariables(next, bound);
  }
  return ordered;
};

const literalVariables = (literal: Literal): readonly string[] => {
  switch (literal.kind) {
    case "atom":
    case "absent":
      return literal.atom.args.flatMap(termVariables);
    case "check":
      return termVariables(literal.call);
    case "unify":
      return [...termVariables(literal.left), ...termVariables(literal.right)];
    case "member":
      return [
        ...termVariables(literal.element),
        ...termVariables(literal.list),
      ];
    default:
      return [];
  }
};

const boundBy = (literals: readonly Literal[]) => {
  const bound = new Set<string>();
  for (const literal of literals) {
    bindVariables(literal, bound);
  }
  return bound;
};

export const compileRule = (head: unknown, body: readonly unknown[]) =>
  Effect.gen(function* () {
    const rename = renameAnonymous({ next: 0 });
    const source = ["rule", render(head), ...body.map(render)];
    if (!(head instanceof Atom)) {
      return yield* fail(
        `A rule head must be a relation call, but found ${show(head)}.`
      );
    }
    const headIssue = checkTerms(head, head.args, true);
    if (headIssue !== undefined) {
      return yield* fail(headIssue);
    }
    const isAnonymous = (arg: unknown): boolean =>
      (arg instanceof LogicVariable && arg.anonymous) ||
      (arg instanceof Aggregate && isAnonymous(arg.arg));
    if (head.args.some(isAnonymous)) {
      return yield* fail(
        `A rule head cannot use the anonymous variable "?_": ${show(head)}.`
      );
    }
    const expanded = alternatives(rename(new Conjunction(body as Goal[])));
    if (typeof expanded === "string") {
      return yield* fail(expanded);
    }
    const aggregates = head.args.flatMap((arg, position) =>
      arg instanceof Aggregate ? [position] : []
    );
    const rules: CompiledRule[] = [];
    for (const literals of expanded) {
      const ordered = plan(literals);
      if (typeof ordered === "string") {
        return yield* fail(ordered);
      }
      const bound = boundBy(ordered);
      const unbound = head.args
        .flatMap(termVariables)
        .filter((name) => !bound.has(name));
      if (unbound.length > 0) {
        return yield* fail(
          `Unsafe rule head ${show(head)}: ${[...new Set(unbound)].map((name) => `?${name}`).join(", ")} never appears in a relation in the body.`
        );
      }
      rules.push({ aggregates, head, body: ordered, source });
    }
    return rules;
  });

export const compileQuery = (goal: unknown) =>
  Effect.gen(function* () {
    const renamed = renameAnonymous({ next: 0 })(goal);
    const expanded = alternatives(renamed);
    if (typeof expanded === "string") {
      return yield* fail(expanded);
    }
    const outputs = [
      ...new Set(goalVariables(goal).filter((name) => !name.startsWith("_"))),
    ];
    const queries: CompiledQuery[] = [];
    for (const literals of expanded) {
      const ordered = plan(literals);
      if (typeof ordered === "string") {
        return yield* fail(ordered);
      }
      queries.push({ body: ordered, outputs });
    }
    return queries;
  });

/** Variable names in a goal, in reading order. */
const goalVariables = (goal: unknown): readonly string[] => {
  if (goal instanceof Atom) {
    return goal.args.flatMap(termVariables);
  }
  if (goal instanceof Negation) {
    return goalVariables(goal.atom);
  }
  if (goal instanceof Conjunction || goal instanceof Disjunction) {
    return goal.goals.flatMap(goalVariables);
  }
  if (goal instanceof Unification) {
    return [...termVariables(goal.left), ...termVariables(goal.right)];
  }
  if (goal instanceof Membership) {
    return [...termVariables(goal.element), ...termVariables(goal.list)];
  }
  return termVariables(goal);
};

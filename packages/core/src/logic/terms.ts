/**
 * Values that make up Lion's logic layer.
 *
 * Logic variables, deferred calls, and goals are ordinary Lion values: they are
 * produced by evaluating expressions and can be passed to functions, stored in
 * bindings, and combined. Relations, rules, and queries consume them.
 */

export type LionFunction = (...args: unknown[]) => unknown;

const LOGIC_VARIABLE_PATTERN = /^\?[A-Za-z_][\w-]*$/;

/** `"?x"` is a logic variable name; `"?_"` and `"?_x"` are anonymous. */
export const isLogicVariableName = (name: string): boolean =>
  LOGIC_VARIABLE_PATTERN.test(name);

export class LogicVariable {
  readonly _tag = "LogicVariable";
  /** The variable name without the leading `?`. */
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  get anonymous(): boolean {
    return this.name.startsWith("_");
  }

  toJSON() {
    return render(this);
  }
}

/**
 * A call to a pure function whose arguments include logic variables. The call
 * runs later, once the engine has bound every variable it mentions.
 */
export class DeferredCall {
  readonly _tag = "DeferredCall";
  readonly fn: LionFunction;
  readonly name: string;
  readonly args: readonly unknown[];

  constructor(fn: LionFunction, name: string, args: readonly unknown[]) {
    this.fn = fn;
    this.name = name;
    this.args = args;
  }

  toJSON() {
    return render(this);
  }
}

export interface RelationInfo {
  readonly columns: readonly string[];
  readonly name: string;
}

/** A relation applied to terms, such as `["dep", "?x", "?y"]`. */
export class Atom {
  readonly _tag = "Atom";
  readonly relation: RelationInfo;
  readonly args: readonly unknown[];

  constructor(relation: RelationInfo, args: readonly unknown[]) {
    this.relation = relation;
    this.args = args;
  }

  toJSON() {
    return render(this);
  }
}

export class Negation {
  readonly _tag = "Negation";
  readonly atom: Atom;

  constructor(atom: Atom) {
    this.atom = atom;
  }

  toJSON() {
    return render(this);
  }
}

export class Conjunction {
  readonly _tag = "Conjunction";
  readonly goals: readonly Goal[];

  constructor(goals: readonly Goal[]) {
    this.goals = goals;
  }

  toJSON() {
    return render(this);
  }
}

export class Disjunction {
  readonly _tag = "Disjunction";
  readonly goals: readonly Goal[];

  constructor(goals: readonly Goal[]) {
    this.goals = goals;
  }

  toJSON() {
    return render(this);
  }
}

export class Unification {
  readonly _tag = "Unification";
  readonly left: unknown;
  readonly right: unknown;

  constructor(left: unknown, right: unknown) {
    this.left = left;
    this.right = right;
  }

  toJSON() {
    return render(this);
  }
}

export type Goal =
  | Atom
  | Negation
  | Conjunction
  | Disjunction
  | Unification
  | DeferredCall;

export const isGoal = (value: unknown): value is Goal =>
  value instanceof Atom ||
  value instanceof Negation ||
  value instanceof Conjunction ||
  value instanceof Disjunction ||
  value instanceof Unification ||
  value instanceof DeferredCall;

/** True for values that stand in for something not yet known. */
export const isLogicTerm = (
  value: unknown
): value is LogicVariable | DeferredCall =>
  value instanceof LogicVariable || value instanceof DeferredCall;

const RELATION = Symbol.for("lion/relation");
const PURE = Symbol.for("lion/pure");

export type RelationValue = LionFunction & {
  readonly [RELATION]: RelationInfo;
};

export const isRelationValue = (value: unknown): value is RelationValue =>
  typeof value === "function" && RELATION in value;

export const relationInfo = (value: RelationValue): RelationInfo =>
  value[RELATION];

export const makeRelationValue = (
  relation: RelationInfo,
  call: LionFunction
): RelationValue => Object.assign(call, { [RELATION]: relation });

/**
 * Marks every function in a module as pure. A pure function called with a
 * logic variable returns a {@link DeferredCall} instead of running.
 */
export const markPure = <T extends Record<string, unknown>>(module: T): T => {
  for (const value of Object.values(module)) {
    if (typeof value === "function" && !(PURE in value)) {
      Object.defineProperty(value, PURE, { value: true });
    }
  }
  return module;
};

export const isPureFunction = (value: unknown): value is LionFunction =>
  typeof value === "function" && PURE in value;

/** Converts logic values back into the Lion JSON that would produce them. */
export const render = (value: unknown): unknown => {
  if (value instanceof LogicVariable) {
    return value.anonymous ? "?_" : `?${value.name}`;
  }
  if (value instanceof DeferredCall) {
    return [value.name, ...value.args.map(render)];
  }
  if (value instanceof Atom) {
    return [value.relation.name, ...value.args.map(render)];
  }
  if (value instanceof Negation) {
    return ["not", render(value.atom)];
  }
  if (value instanceof Conjunction) {
    return ["and", ...value.goals.map(render)];
  }
  if (value instanceof Disjunction) {
    return ["or", ...value.goals.map(render)];
  }
  if (value instanceof Unification) {
    return ["=", render(value.left), render(value.right)];
  }
  return value;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/** Facts may only contain JSON data. */
export const isGroundValue = (value: unknown): boolean => {
  if (value === null) {
    return true;
  }
  switch (typeof value) {
    case "string":
    case "boolean":
      return true;
    case "number":
      return Number.isFinite(value);
    default:
      break;
  }
  if (Array.isArray(value)) {
    return value.every(isGroundValue);
  }
  return isPlainObject(value) && Object.values(value).every(isGroundValue);
};

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])])
    );
  }
  return value;
};

/** A key that is equal for structurally equal JSON values. */
export const valueKey = (value: unknown): string =>
  JSON.stringify(canonical(value)) ?? "undefined";

/** Structural equality for JSON data, identity for everything else. */
export const sameValue = (a: unknown, b: unknown): boolean =>
  isGroundValue(a) && isGroundValue(b)
    ? valueKey(a) === valueKey(b)
    : Object.is(a, b);

/** Variable names mentioned by a term, including inside deferred calls. */
export const termVariables = (term: unknown): readonly string[] => {
  if (term instanceof LogicVariable) {
    return [term.name];
  }
  if (term instanceof DeferredCall) {
    return term.args.flatMap(termVariables);
  }
  return [];
};

/** True when a logic value hides inside an array or record. */
export const containsNestedLogic = (term: unknown): boolean => {
  if (isLogicTerm(term) || isGoal(term)) {
    return true;
  }
  if (Array.isArray(term)) {
    return term.some(containsNestedLogic);
  }
  if (isPlainObject(term)) {
    return Object.values(term).some(containsNestedLogic);
  }
  return false;
};

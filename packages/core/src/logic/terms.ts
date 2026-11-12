/**
 * Values that make up Lion's logic layer.
 *
 * Logic variables, waiting calls, and goals are ordinary Lion values: they are
 * produced by evaluating expressions and can be passed to functions, stored in
 * bindings, and combined. Relations, rules, and queries consume them.
 */
import { Effect } from "effect";
import type { Environment } from "@/schemas/environment";

export type LionFunction = (...args: unknown[]) => unknown;

/**
 * Runs a function that returns a value, or an Effect that makes one. What
 * the Effect can fail with and needs is the caller's to say.
 */
export const invoke = (
  fn: LionFunction,
  args: readonly unknown[]
): Effect.Effect<unknown> => {
  const result = fn(...args);
  return Effect.isEffect(result)
    ? (result as Effect.Effect<unknown>)
    : Effect.succeed(result);
};

const LOGIC_VARIABLE_PATTERN = /^\?[A-Za-z_][\w-]*$/;

/** `"?x"` is a logic variable name; `"?_"` and `"?_x"` are anonymous. */
export const isLogicVariableName = (name: string): boolean =>
  LOGIC_VARIABLE_PATTERN.test(name);

/** Every logic value shows as the Lion expression that evaluates to it. */
export abstract class LogicValue {
  private mentioned: readonly string[] | undefined;

  /** The terms the value is made of, in the order they are written. */
  abstract readonly parts: readonly unknown[];

  /** The logic variables the value mentions, in reading order. */
  get variables(): readonly string[] {
    this.mentioned ??= this.parts.flatMap(termVariables);
    return this.mentioned;
  }

  toJSON(): unknown {
    return render(this);
  }
}

export class LogicVariable extends LogicValue {
  /** The variable name without the leading `?`. */
  readonly name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }

  get anonymous(): boolean {
    return this.name.startsWith("_");
  }

  get parts(): readonly unknown[] {
    return [];
  }

  override get variables(): readonly string[] {
    return [this.name];
  }
}

/**
 * A call that waits: it runs once the engine has bound the variables it
 * needs, and asked the questions among its arguments. A `cond`, `match`,
 * `eval`, or record that waits is a call to a lambda that holds the form.
 */
export class DeferredCall extends LogicValue {
  /** The function to call, or a term that evaluates to one. */
  readonly fn: unknown;
  /** The callee as the program wrote it, shown for a function with no name. */
  readonly callee: unknown;
  readonly args: readonly unknown[];
  /**
   * The kind of an aggregate call, such as `"sum"`. As a whole argument of a
   * rule head it aggregates over the rule's matches; anywhere else it
   * combines a list.
   */
  readonly aggregate: string | undefined;

  constructor(
    fn: unknown,
    callee: unknown,
    args: readonly unknown[],
    aggregate?: string
  ) {
    super();
    this.fn = fn;
    this.callee = callee;
    this.args = args;
    this.aggregate = aggregate;
  }

  get parts(): readonly unknown[] {
    return [this.fn, ...this.args];
  }
}

/**
 * A relation whose rows a host function computes from other relations, such
 * as `["graph/shortestPath", "road", "a", "?to", "?cost", "?path"]`.
 */
export interface ComputedRelation {
  /** The function that builds it, such as `"graph/shortestPath"`. */
  readonly callee: string;
  /** Returns the rows for some input values, or a message when it cannot. */
  readonly compute: (
    tuples: (relation: string) => readonly (readonly unknown[])[],
    inputs: readonly unknown[]
  ) => readonly (readonly unknown[])[] | string;
  /** Relations whose tuples the computation reads. */
  readonly dependencies: readonly string[];
  /** The call that builds a goal: the callee, then its inputs and columns. */
  readonly form: (args: readonly unknown[]) => unknown[];
  /** How many leading columns are inputs, bound before the goal runs. */
  readonly inputs: number;
}

export interface RelationInfo {
  readonly columns: readonly string[];
  /** Set for relations computed from other relations instead of declared. */
  readonly computed?: ComputedRelation;
  /** Positions of the key columns; a keyed relation has one row per key. */
  readonly key?: readonly number[];
  readonly name: string;
}

const isPlainTerm = (term: unknown) =>
  !(term instanceof LogicValue) || term instanceof LogicVariable;

/** A relation applied to terms, such as `["dep", "?x", "?y"]`. */
export class Atom extends LogicValue {
  readonly relation: RelationInfo;
  readonly args: readonly unknown[];
  /** True when every argument is a variable or a value, with nothing to run. */
  readonly plain: boolean;

  constructor(relation: RelationInfo, args: readonly unknown[]) {
    super();
    this.relation = relation;
    this.args = args;
    this.plain = args.every(isPlainTerm);
  }

  get parts(): readonly unknown[] {
    return this.args;
  }

  map(change: (part: unknown) => unknown): Atom {
    return new Atom(this.relation, this.args.map(change));
  }
}

/** The logic forms, by the name each is written with. */
export type FormName = "not" | "and" | "or" | "=" | "in" | "find";

/**
 * A logic form, held the way it is written: its name, then its parts.
 *
 * - `["not", goal]`: the goal has no match.
 * - `["and", goal, ...]` and `["or", goal, ...]`: all, or any, of the goals.
 * - `["=", term, term]`: the two terms are the same value.
 * - `["in", element, list]`: the element is one of the list's items.
 * - `["find", template, goal]`: the template's value for every match of
 *   the goal, as a sorted list.
 */
export class LogicForm extends LogicValue {
  readonly form: FormName;
  readonly parts: readonly unknown[];

  constructor(form: FormName, parts: readonly unknown[]) {
    super();
    this.form = form;
    this.parts = parts;
  }

  map(change: (part: unknown) => unknown): LogicForm {
    return new LogicForm(this.form, this.parts.map(change));
  }
}

/** True for a logic form written with one of the given names. */
export const isForm = (
  value: unknown,
  ...names: readonly FormName[]
): value is LogicForm =>
  value instanceof LogicForm && names.includes(value.form);

/**
 * What a rule or query can ask. A variable, a waiting call, or a find is a
 * filter: it must turn out true or false.
 */
export type Goal = Atom | LogicForm | DeferredCall | LogicVariable | boolean;

export const isGoal = (value: unknown): value is Goal =>
  typeof value === "boolean" || value instanceof LogicValue;

/** True for a goal that matches the rows of a relation somewhere in it. */
export const isRelational = (value: unknown): boolean =>
  value instanceof Atom ||
  (isForm(value, "not", "and", "or") && value.parts.some(isRelational));

/**
 * True for a question: a value that the database answers. A goal with a
 * relation in it is true when it has a match and false when it has none, and
 * a find is the list of what it found.
 */
export const isQuestion = (value: unknown): boolean =>
  isForm(value, "find") || isRelational(value);

/**
 * True for a value that is not known until logic variables are bound: a
 * variable, a waiting call, or a goal with no relation in it, which is true
 * or false once its variables are.
 */
export const isWaiting = (value: unknown): boolean =>
  value instanceof LogicValue && !isQuestion(value);

const LOGIC_FUNCTIONS = new WeakSet<object>();

/**
 * Marks a function that takes logic values as they are and builds logic
 * values from them: relations, aggregates, algorithms, and lambdas. Every
 * other function waits until its arguments are known.
 */
export const logicFunction = <F extends LionFunction>(fn: F): F => {
  LOGIC_FUNCTIONS.add(fn);
  return fn;
};

export const isLogicFunction = (value: unknown): boolean =>
  typeof value === "function" && LOGIC_FUNCTIONS.has(value);

const RELATIONS = new WeakMap<object, RelationInfo>();

/** The relation a function builds goals for, when it is a relation's value. */
export const relationOf = (value: unknown): RelationInfo | undefined =>
  typeof value === "function" ? RELATIONS.get(value) : undefined;

export const makeRelationValue = <F extends LionFunction>(
  relation: RelationInfo,
  call: F
): F => {
  RELATIONS.set(call, relation);
  return logicFunction(call);
};

const FUNCTION_NAMES = new WeakMap<object, string>();

/**
 * Remembers the name each function is bound to, so a waiting call is written
 * with a name that evaluates to its function. A function keeps its first name.
 */
export const nameFunctions = (bindings: Readonly<Record<string, unknown>>) => {
  for (const [name, value] of Object.entries(bindings)) {
    if (typeof value === "function" && !FUNCTION_NAMES.has(value)) {
      FUNCTION_NAMES.set(value, name);
    }
  }
};

/** What a lambda was made from. */
export interface LambdaInfo {
  readonly body: unknown;
  /** The scope the lambda closes over; undefined when it closes over none. */
  readonly environment: Environment | undefined;
  readonly parameters: readonly string[];
}

const LAMBDAS = new WeakMap<object, LambdaInfo>();

export const registerLambda = <F extends LionFunction>(
  fn: F,
  info: LambdaInfo
): F => {
  LAMBDAS.set(fn, info);
  return logicFunction(fn);
};

export const lambdaInfo = (value: unknown): LambdaInfo | undefined =>
  typeof value === "function" ? LAMBDAS.get(value) : undefined;

/**
 * True for a call to a lambda that closes over nothing: a `cond`, `match`,
 * record, or lambda that waits. Its body runs as plain Lion once the call
 * does, so it can ask questions of its own.
 */
export const isWaitingForm = (call: DeferredCall): boolean => {
  const info = lambdaInfo(call.fn);
  return info !== undefined && info.environment === undefined;
};

/** Decides how `write` shows the parts that depend on who is reading. */
export interface Writer {
  /** Writes JSON data. */
  readonly data: (value: unknown) => unknown;
  /**
   * Writes a value with no Lion form, such as a function the environment
   * does not name. `callee` is how the program wrote it, when it called it.
   */
  readonly opaque: (value: unknown, callee?: unknown) => unknown;
  /** Writes a variable; by default its name. */
  readonly variable?: (variable: LogicVariable) => unknown;
}

const lambdaForm = ({ body, parameters }: LambdaInfo) => [
  "lambda",
  parameters,
  body,
];

const writeFunction = (fn: LionFunction, writer: Writer, callee?: unknown) => {
  const info = LAMBDAS.get(fn);
  return (
    RELATIONS.get(fn)?.name ??
    FUNCTION_NAMES.get(fn) ??
    (info !== undefined && info.environment === undefined
      ? lambdaForm(info)
      : writer.opaque(fn, callee))
  );
};

const writeCall = (call: DeferredCall, writer: Writer) => {
  const args = call.args.map((arg) => write(arg, writer));
  const info = lambdaInfo(call.fn);
  if (info === undefined || info.environment !== undefined) {
    const head =
      typeof call.fn === "function"
        ? writeFunction(call.fn as LionFunction, writer, call.callee)
        : write(call.fn, writer);
    return [head, ...args];
  }
  // A waiting form is written as it was, with a lambda around it for the
  // names that would not evaluate to the same values again.
  const kept = info.parameters.flatMap((name, at) =>
    args[at] === name ? [] : [at]
  );
  return kept.length === 0
    ? info.body
    : [
        ["lambda", kept.map((at) => info.parameters[at]), info.body],
        ...kept.map((at) => args[at]),
      ];
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const variableName = (variable: LogicVariable) =>
  `?${variable.anonymous ? "_" : variable.name}`;

/**
 * Writes a logic value as the Lion expression that evaluates to it. Every
 * reader shares this one shape: messages and `why`, the keys that tell rules
 * apart, and snapshots.
 */
export const write = (item: unknown, writer: Writer): unknown => {
  const inner = (value: unknown) => write(value, writer);
  if (item instanceof LogicVariable) {
    return (writer.variable ?? variableName)(item);
  }
  if (item instanceof DeferredCall) {
    return writeCall(item, writer);
  }
  if (item instanceof Atom) {
    const args = item.args.map(inner);
    return item.relation.computed?.form(args) ?? [item.relation.name, ...args];
  }
  if (item instanceof LogicForm) {
    return [item.form, ...item.parts.map(inner)];
  }
  if (typeof item === "function") {
    return writeFunction(item as LionFunction, writer);
  }
  if (isGroundValue(item)) {
    return writer.data(item);
  }
  if (Array.isArray(item)) {
    return item.map(inner);
  }
  return isPlainObject(item)
    ? Object.fromEntries(
        Object.entries(item).map(([key, value]) => [key, inner(value)])
      )
    : writer.opaque(item);
};

/**
 * Writes JSON data so that it evaluates to itself: lists, records, and
 * strings that would evaluate to something else go inside `quote`. Logic
 * variable names and namespaced names such as "number/add" always do;
 * `isBound` says which other strings are names.
 */
export const quoted =
  (isBound: (text: string) => boolean = () => false) =>
  (value: unknown): unknown => {
    if (typeof value === "string") {
      return isLogicVariableName(value) || value.includes("/") || isBound(value)
        ? ["quote", value]
        : value;
    }
    return typeof value === "object" && value !== null
      ? ["quote", value]
      : value;
  };

const DISPLAY: Writer = {
  data: quoted(),
  opaque: (value, callee) => {
    const info = lambdaInfo(value);
    if (info !== undefined) {
      return lambdaForm(info);
    }
    return callee ?? (typeof value === "function" ? "<function>" : value);
  },
};

/**
 * Shows a value to people, in messages and results: data as it is, and a
 * logic value as the Lion expression that evaluates to it.
 */
export const render = (value: unknown): unknown =>
  isGroundValue(value) ? value : write(value, DISPLAY);

export const show = (value: unknown): string =>
  JSON.stringify(render(value)) ?? String(value);

/**
 * Writes a goal with the values an answer gave its variables. A variable the
 * answer does not bind, such as one a question inside the goal binds for
 * itself, stays a variable.
 */
export const instantiate = (
  goal: unknown,
  vars: ReadonlyMap<string, unknown>
): unknown =>
  write(goal, {
    ...DISPLAY,
    variable: (variable) =>
      vars.has(variable.name)
        ? DISPLAY.data(vars.get(variable.name))
        : variableName(variable),
  });

/** Raised by a writer for a value with no Lion form. */
export class Unwritable extends Error {}

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

// Quoting every string keeps data apart from the names, variables, and
// forms around it.
const KEYED: Writer = {
  data: quoted(() => true),
  opaque: () => {
    throw new Unwritable();
  },
};

/**
 * A key that is equal for logic values a snapshot would write the same way:
 * JSON data by value, variables apart from strings that look like them, and
 * functions and relations by name. Undefined for a value with no written
 * form, such as a lambda that closes over a scope, so it is never taken for
 * another value.
 */
export const logicKey = (value: unknown): string | undefined => {
  try {
    return valueKey(write(value, KEYED));
  } catch (error) {
    if (error instanceof Unwritable) {
      return undefined;
    }
    throw error;
  }
};

/** Structural equality for JSON data, identity for everything else. */
export const sameValue = (a: unknown, b: unknown): boolean => {
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  ) {
    // JSON writes -0 as 0, so the two are the same number.
    return a === b || Object.is(a, b);
  }
  return isGroundValue(a) && isGroundValue(b)
    ? valueKey(a) === valueKey(b)
    : Object.is(a, b);
};

const typeRank = (value: unknown): number => {
  if (value === null) {
    return 0;
  }
  switch (typeof value) {
    case "boolean":
      return 1;
    case "number":
      return 2;
    case "string":
      return 3;
    default:
      break;
  }
  if (Array.isArray(value)) {
    return 4;
  }
  return isPlainObject(value) ? 5 : 6;
};

const compareLists = (a: readonly unknown[], b: readonly unknown[]): number => {
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const order = compareValues(a[index], b[index]);
    if (order !== 0) {
      return order;
    }
  }
  return a.length - b.length;
};

/**
 * A total order on JSON data: null, then booleans, numbers, strings, arrays,
 * and records. Arrays compare element by element and records by their sorted
 * entries, so sorting never depends on how an answer was found.
 */
export const compareValues = (a: unknown, b: unknown): number => {
  const rank = typeRank(a) - typeRank(b);
  if (rank !== 0) {
    return Math.sign(rank);
  }
  if (typeof a === "number" && typeof b === "number") {
    return Math.sign(a - b);
  }
  if (typeof a === "boolean" || typeof a === "string") {
    if (a === b) {
      return 0;
    }
    return (a as string) < (b as string) ? -1 : 1;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return compareLists(a, b);
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const entries = (record: Record<string, unknown>) =>
      Object.keys(record)
        .sort()
        .map((key) => [key, record[key]]);
    return compareLists(entries(a), entries(b));
  }
  return 0;
};

/** Variable names a term or goal mentions, in reading order. */
export function termVariables(term: unknown): readonly string[] {
  return term instanceof LogicValue ? term.variables : [];
}

/** True when a logic value hides inside an array or record. */
export const containsNestedLogic = (term: unknown): boolean => {
  const hides = (item: unknown) =>
    item instanceof LogicValue || containsNestedLogic(item);
  return Array.isArray(term)
    ? term.some(hides)
    : isPlainObject(term) && Object.values(term).some(hides);
};

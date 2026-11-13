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

const NAMESPACED_NAME_PATTERN = /^[a-z][a-z0-9-]*\/[A-Za-z][\w-]*[?!]?$/;

/**
 * `"number/add"` has the form of a namespaced name: a module in lowercase, a
 * slash, and a name. Such a string is always a name, never data, unless it
 * is inside `quote`.
 */
export const isNamespacedName = (name: string): boolean =>
  NAMESPACED_NAME_PATTERN.test(name);

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
 * needs, and asked the questions among its arguments. A `cond`, `match`, or
 * `eval` that waits is a call to a lambda that holds the form, and a record
 * that waits is a call to the function that makes it from its values.
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
export type FormName =
  | "not"
  | "and"
  | "or"
  | "="
  | "in"
  | "find"
  | "schema/fits?";

/**
 * A logic form, held the way it is written: its name, then its parts.
 *
 * - `["not", goal]`: the goal has no match.
 * - `["and", goal, ...]` and `["or", goal, ...]`: all, or any, of the goals.
 * - `["=", term, term]`: the two terms are the same value.
 * - `["in", element, list]`: the element is one of the list's items.
 * - `["find", template, goal]`: the template's value for every match of
 *   the goal, as a sorted list.
 * - `["schema/fits?", value, schema]`: the value fits the schema.
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

const RECORD_KEYS = new WeakMap<object, readonly string[]>();

const RECORD_MAKERS = new Map<string, LionFunction>();

/**
 * A function that makes a record of some keys from one value for each. A
 * record that waits for a logic variable is a call to one, so the record is
 * a term like any other: its values are the call's arguments.
 */
export const recordMaker = (keys: readonly string[]): LionFunction => {
  // One maker for each list of keys, so two records that wait for the same
  // values are the same term.
  const id = JSON.stringify(keys);
  let make = RECORD_MAKERS.get(id);
  if (make === undefined) {
    make = (...values: unknown[]) =>
      Object.fromEntries(keys.map((key, at) => [key, values[at]]));
    RECORD_MAKERS.set(id, make);
    RECORD_KEYS.set(make, keys);
    ARGUMENTS_ONLY.add(make);
  }
  return make;
};

/** The keys of the record a function makes, when it is a record maker. */
export const recordKeys = (value: unknown): readonly string[] | undefined =>
  typeof value === "function" ? RECORD_KEYS.get(value) : undefined;

const LIST_MAKERS = new WeakSet<object>();

/**
 * Marks a function that makes a list of its arguments, as `array/make`
 * does. A call to one that waits is a list term: its items are its
 * arguments.
 */
export const listMaker = <F extends LionFunction>(fn: F): F => {
  LIST_MAKERS.add(fn);
  return fn;
};

const SCHEMA_BUILDERS = new WeakMap<object, boolean>();

/**
 * Marks a function that builds a schema out of the schemas it is given.
 * `ofPattern` marks one that looks at what its schema is made of, as
 * `schema/open` looks at the keys of a record: a call to it that waits is a
 * pattern only when its argument is one.
 */
export const schemaBuilder = <F extends LionFunction>(
  fn: F,
  ofPattern: boolean
): F => {
  SCHEMA_BUILDERS.set(fn, ofPattern);
  return fn;
};

/**
 * What a pattern is made of, when a term is one: the values of a record or
 * the items of a list that waits, and for a schema, the arguments of a call
 * that builds one. A value can be matched against such a term part by part,
 * which binds the variables that stand in it. Any other term is a value
 * once its variables are bound.
 */
export const patternParts = (
  term: unknown,
  asSchema: boolean
): readonly unknown[] | undefined => {
  if (!(term instanceof DeferredCall && typeof term.fn === "function")) {
    return undefined;
  }
  if (RECORD_KEYS.has(term.fn) || LIST_MAKERS.has(term.fn)) {
    return term.args;
  }
  const ofPattern = asSchema ? SCHEMA_BUILDERS.get(term.fn) : undefined;
  const isPattern =
    ofPattern === false || patternParts(term.args[0], true) !== undefined;
  return ofPattern !== undefined && isPattern ? term.args : undefined;
};

/** True for a call that waits to make a list of its arguments. */
export const isListTerm = (term: unknown): boolean =>
  term instanceof DeferredCall &&
  typeof term.fn === "function" &&
  LIST_MAKERS.has(term.fn);

const ARGUMENTS_ONLY = new WeakSet<object>();

/**
 * Marks functions that read nothing but their arguments, as every function
 * of the standard library does. Lion can then tell what a goal that calls
 * one depends on: the relations among its arguments. Any other function a
 * host adds may read anything, a database included.
 */
export const readsOnlyArguments = (
  bindings: Readonly<Record<string, unknown>>
) => {
  for (const value of Object.values(bindings)) {
    if (typeof value === "function") {
      ARGUMENTS_ONLY.add(value);
    }
  }
};

export const isArgumentsOnly = (value: unknown): boolean =>
  typeof value === "function" && ARGUMENTS_ONLY.has(value);

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

/** What a named schema was declared with. */
export interface SchemaInfo {
  /**
   * The shape's form, closed over the values its names had when the schema
   * was declared: what a snapshot writes, and what tells declarations apart.
   * Undefined while the schema is being declared.
   */
  definition: DeferredCall | undefined;
  /**
   * The names of the schemas declared in one form with this one, in the
   * order written. They can name each other, so a snapshot writes them
   * together.
   */
  group: readonly string[];
  readonly name: string;
  /** The evaluated shape: what a value must fit. */
  shape: unknown;
  /**
   * The strings the shape uses as data: those it mentions outside `quote`
   * that named nothing when the schema was declared. What they mean must
   * not change, so nothing can be declared under one of them afterwards.
   */
  strings: ReadonlySet<string>;
}

const SCHEMAS = new WeakMap<object, SchemaInfo>();

export const registerSchema = <F extends LionFunction>(
  fn: F,
  info: SchemaInfo
): F => {
  SCHEMAS.set(fn, info);
  return fn;
};

/** The named schema a function checks values against, when it is one. */
export const schemaOf = (value: unknown): SchemaInfo | undefined =>
  typeof value === "function" ? SCHEMAS.get(value) : undefined;

/** The call that built a function, such as `["schema/arrayOf", item]`. */
export interface Built {
  readonly args: readonly unknown[];
  readonly by: LionFunction;
}

const BUILT = new WeakMap<object, Built>();

/**
 * Remembers the call that built a function, so the function is written as
 * that call, and whoever is handed it can see what it was built from.
 */
export const builtBy = <F extends LionFunction>(
  fn: F,
  by: LionFunction,
  args: readonly unknown[]
): F => {
  BUILT.set(fn, { args, by });
  return fn;
};

export const buildOf = (value: unknown): Built | undefined =>
  typeof value === "function" ? BUILT.get(value) : undefined;

/**
 * True for a call to a lambda that closes over nothing: a `cond`, `match`,
 * `eval`, or lambda that waits. Its body runs as plain Lion once the call
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

const writeFunction = (
  fn: LionFunction,
  writer: Writer,
  callee?: unknown
): unknown => {
  const name =
    RELATIONS.get(fn)?.name ?? SCHEMAS.get(fn)?.name ?? FUNCTION_NAMES.get(fn);
  if (name !== undefined) {
    return name;
  }
  const built = BUILT.get(fn);
  if (built !== undefined) {
    return [
      writeFunction(built.by, writer),
      ...built.args.map((arg) => write(arg, writer)),
    ];
  }
  const info = LAMBDAS.get(fn);
  return info !== undefined && info.environment === undefined
    ? lambdaForm(info)
    : writer.opaque(fn, callee);
};

const writeCall = (call: DeferredCall, writer: Writer) => {
  const args = call.args.map((arg) => write(arg, writer));
  const keys = recordKeys(call.fn);
  if (keys !== undefined) {
    // A record that waits is written as the record it will be.
    return Object.fromEntries(keys.map((key, at) => [key, args[at]]));
  }
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

export const isPlainObject = (
  value: unknown
): value is Record<string, unknown> => {
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
    // A bare list would read as a call, so it is written as the call that
    // makes it.
    return ["array/make", ...item.map(inner)];
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
 * The Lion expression that evaluates to a value. Unlike `render`, data is
 * written so that it stays data: a string that would evaluate to something
 * else, a list, or a record goes inside `quote`. So the string
 * `"value/number?"` reads differently from the function of that name.
 * `isBound` says which other strings are names where the expression is read.
 */
export const expression = (
  value: unknown,
  isBound?: (text: string) => boolean
): unknown =>
  write(
    value,
    isBound === undefined ? DISPLAY : { ...DISPLAY, data: quoted(isBound) }
  );

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

/** Lists and records known to be JSON data, so each is looked at once. */
const DATA = new WeakSet<object>();

/**
 * True for JSON data: what a row holds, and so what a row's value can
 * equal. Anything else among the arguments of a relation call, such as a
 * function, is a schema for the column.
 */
export const isData = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null) {
    return isGroundValue(value);
  }
  if (!DATA.has(value) && isGroundValue(value)) {
    DATA.add(value);
  }
  return DATA.has(value);
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

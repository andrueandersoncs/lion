/**
 * Fitting: whether a value fits a schema, where it does not, and what it
 * binds.
 *
 * Anything can be a schema, and one rule says what fits it:
 * - a function is a predicate: a value fits when the function answers true.
 *   A relation is one, and so is a schema with a name, or one that a
 *   function in the `schema` module built;
 * - a record fits a record with the same keys, with values that fit;
 * - a list fits a list of the same length, item by item;
 * - any other value fits a value equal to it.
 *
 * So data is a schema for itself: it fits exactly the values equal to it.
 * A function in it makes room for every value the function accepts. A
 * record or list names some parts of a value, and what it leaves over must
 * fit the schema of its rest: nothing on its own, anything in `schema/open`,
 * or the schema `schema/open` is given beside it.
 *
 * A logic variable in a schema stands for a value. Once it is bound it is
 * that value, and until then any value fits it, and binds it. So a value is
 * checked under an answer, the values its variables have so far, and the
 * check gives the answers under which the value fits: none when it does
 * not, and more than one when a schema that offers a choice fits in more
 * than one way.
 *
 * `match`, the functions of the `schema` module, the schema of a relation's
 * rows, and every goal that binds a variable all go through this one rule.
 */
import { Effect, Option } from "effect";
import {
  atLeast,
  type Count,
  logicError,
  takes,
  UnboundNameError,
  WaitingError,
} from "@/errors/evaluation";
import { answer, known } from "@/evaluation/asking";
import { boundNames } from "@/evaluation/environment";
import { apply, call } from "@/evaluation/special-forms/function";
import { suspendArguments } from "@/evaluation/special-forms/lambda";
import type { Vars } from "@/logic/model";
import {
  buildOf,
  builtBy,
  compareValues,
  DeferredCall,
  expression,
  isArgumentsOnly,
  isForm,
  isListTerm,
  isPlainObject,
  isQuestion,
  type LionFunction,
  LogicForm,
  LogicValue,
  LogicVariable,
  logicFunction,
  nameFunctions,
  patternParts,
  readsOnlyArguments,
  recordKeys,
  registerSchema,
  relationOf,
  render,
  type SchemaInfo,
  sameValue,
  schemaBuilder,
  schemaOf,
  show,
  Unknown,
  valueKey,
} from "@/logic/terms";
import { type Checking, LionCheckingService } from "@/services/checking";
import { LionEnvironmentService } from "@/services/evaluation";
import type { EvaluateResult } from "@/types/evaluation";

/** Where a part of a value is: the keys and positions that lead to it. */
export type Path = readonly (number | string)[];

/**
 * One place where a value does not fit. A part that has the wrong value has
 * both `expected` and `found`; a part that is missing has only `expected`,
 * and a part that should not be there has only `found`.
 */
export interface Problem {
  readonly expected?: unknown;
  readonly found?: unknown;
  readonly path: Path;
}

type Step = number | string;

/** The answers under which a value fits: none when it does not. */
type Fitting = Effect.Effect<readonly Vars[], WaitingError | Error, never>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Unknown);

const NOT_OPEN: ReadonlySet<SchemaInfo> = new Set();

const NO_VARS: Vars = new Map();

const NONE: readonly Vars[] = [];

/** How a check is made, where it is, and where its problems go. */
interface Check {
  /**
   * True when the two sides must be equal, as for "=": a record matches a
   * record with the same keys, and a function is a value like any other.
   */
  readonly equal: boolean;
  /**
   * The named schemas being checked against this very value. A schema that
   * comes back to itself without moving into the value meets what it
   * assumes of that value, which is first that it does not fit, so a schema
   * defined by itself alone fits nothing, as a rule that derives a row only
   * from that row derives nothing.
   */
  readonly open: ReadonlySet<SchemaInfo>;
  readonly out: Problem[];
  readonly path: Path;
  /**
   * The value of a term for an answer, where a rule or query runs the
   * check. Without it, in plain code, no variable is left to bind.
   */
  readonly term?: (
    term: LogicValue,
    vars: Vars
  ) => Effect.Effect<unknown, WaitingError | Error, never>;
  /**
   * Writes a schema as the expression that makes it, for a problem to show.
   * Undefined when only the answers matter, and no problem is kept.
   */
  readonly write: ((schema: unknown) => unknown) | undefined;
}

/**
 * Says the value does not fit, and keeps the problem at the place being
 * checked, or one `step` further in, when problems are kept. A part with
 * the wrong value shows the schema and the value; a part that is missing
 * shows only the schema, and a part that should not be there shows only the
 * value.
 */
const fail = (
  { out, path, write }: Check,
  { schema, value }: { readonly schema?: unknown; readonly value?: unknown },
  step?: Step
) => {
  if (write !== undefined) {
    out.push({
      path: step === undefined ? path : [...path, step],
      ...(schema === undefined ? {} : { expected: write(schema) }),
      ...(value === undefined ? {} : { found: render(value) }),
    });
  }
  return NONE;
};

/** One step further into the value. */
const inside = (at: Check, step: Step): Check => ({
  ...at,
  open: NOT_OPEN,
  path: at.write === undefined ? at.path : [...at.path, step],
});

/** A key that is equal for answers that bind the same variables alike. */
const answerKey = (vars: Vars) =>
  valueKey([...vars].sort(([a], [b]) => (a < b ? -1 : 1)));

/**
 * Fits each part in turn, under every answer of the parts before it. When
 * problems are kept, a part that does not fit does not stop the parts after
 * it from being checked, so every problem is found.
 */
const every = <P>(
  parts: Iterable<P>,
  at: Check,
  vars: Vars,
  check: (part: P, vars: Vars) => Fitting
): Fitting =>
  Effect.gen(function* () {
    let answers: readonly Vars[] = [vars];
    let fits = true;
    for (const part of parts) {
      const next: Vars[] = [];
      for (const answered of answers) {
        next.push(...(yield* check(part, answered)));
      }
      if (next.length > 0) {
        answers = next;
      } else if (at.write === undefined) {
        return NONE;
      } else {
        fits = false;
      }
    }
    return fits ? answers : NONE;
  });

/**
 * A predicate that fails on the value, or answers anything but true, is not
 * fit. One that cannot answer yet, because it asks while a rule is being
 * written, makes whatever checks the value wait. And one that names
 * something nothing is bound to is not a predicate at all: that fails the
 * check, since no value could fit a misspelled function.
 *
 * Where a rule or query runs the check, what the predicate answers may
 * still wait for one of its variables, as the answer of a function made by
 * `func/partial` from a variable does. It is then worked out for the answer
 * the check runs under.
 */
const holds = (
  predicate: LionFunction,
  value: unknown,
  { term }: Check,
  vars: Vars
) =>
  (term === undefined
    ? call(predicate, value)
    : Effect.flatMap(apply(predicate, [value]), (result) =>
        result instanceof LogicValue
          ? term(result, vars)
          : Effect.succeed(result)
      )
  ).pipe(
    Effect.flatMap((result) =>
      result instanceof LogicValue
        ? Effect.fail(new WaitingError({ value: result }))
        : Effect.succeed(result === true)
    ),
    Effect.catchIf(
      (error) =>
        !(error instanceof WaitingError || error instanceof UnboundNameError),
      () => Effect.succeed(false)
    )
  ) as Effect.Effect<boolean, WaitingError | UnboundNameError, never>;

/**
 * How a value is checked against what a function of the `schema` module
 * builds: the schemas it is built from, then the value.
 */
type CheckBuilt = (
  parts: readonly unknown[],
  value: unknown,
  at: Check,
  schema: unknown,
  vars: Vars
) => Fitting;

const BUILT = new WeakMap<object, CheckBuilt>();

/**
 * What a named schema stands for: its shape, through every name. Names that
 * only lead back to each other stand for nothing more than themselves.
 */
const unnamed = (schema: unknown, seen = new Set<unknown>()): unknown => {
  const named = schemaOf(schema);
  return named?.definition === undefined || seen.has(schema)
    ? schema
    : unnamed(named.shape, seen.add(schema));
};

/**
 * The schemas a schema is built from, when `by` builds it: for a schema
 * that is built, also under a name, and for a call that waits to build one.
 */
const partsOf = (schema: unknown, by: LionFunction) => {
  if (schema instanceof DeferredCall) {
    return schema.fn === by ? schema.args : undefined;
  }
  const built = buildOf(unnamed(schema));
  return built?.by === by ? built.args : undefined;
};

/**
 * The keys and the schemas of a record of schemas: a record, a schema that
 * names one, or a record that waits. Undefined for anything else.
 */
const recordOf = (schema: unknown) => {
  if (schema instanceof DeferredCall) {
    const keys = recordKeys(schema.fn);
    return keys === undefined ? undefined : { keys, parts: schema.args };
  }
  const record = unnamed(schema);
  return isPlainObject(record)
    ? { keys: Object.keys(record), parts: Object.values(record) }
    : undefined;
};

/**
 * What a record or a list leaves to the schema of its rest: nothing, which
 * is what a record or list of schemas leaves on its own, or anything, which
 * is what `schema/open` leaves with no schema for the rest.
 */
const NOTHING_LEFT: unknown = Symbol("nothing left");
const ANYTHING_LEFT: unknown = Symbol("anything left");

/**
 * Checks what a record or list leaves over against the schema of its rest.
 * A part of the rest that does not fit is shown where it stands in the
 * value, `shift` steps further on for a list, and the rest as a whole that
 * does not fit is the whole value not fitting the schema `whole`.
 */
const checkRest = (
  rest: unknown,
  left: unknown,
  at: Check,
  vars: Vars,
  whole: { readonly schema: unknown; readonly value: unknown },
  shift = 0
): Fitting => {
  if (at.write === undefined) {
    return check(rest, left, { ...at, open: NOT_OPEN }, vars);
  }
  const out: Problem[] = [];
  return Effect.map(
    check(rest, left, { ...at, open: NOT_OPEN, out }, vars),
    (answers) => {
      let shown = false;
      for (const problem of out) {
        const [step, ...more] = problem.path.slice(at.path.length);
        if (step === undefined) {
          if (!shown) {
            fail(at, whole);
            shown = true;
          }
        } else {
          at.out.push({
            ...problem,
            path: [
              ...at.path,
              typeof step === "number" ? step + shift : step,
              ...more,
            ],
          });
        }
      }
      return answers;
    }
  );
};

/**
 * Fits the parts a record or list names under every answer, then what it
 * leaves over against the schema of its rest. Where problems are kept, the
 * rest is checked once, so each of its problems is shown once.
 */
const andRest = (
  named: Fitting,
  differs: boolean,
  rest: unknown,
  left: unknown,
  at: Check,
  vars: Vars,
  whole: { readonly schema: unknown; readonly value: unknown },
  shift = 0
): Fitting =>
  Effect.gen(function* () {
    const answers = yield* named;
    if (rest === ANYTHING_LEFT) {
      return differs ? NONE : answers;
    }
    let under = answers;
    if (at.write !== undefined) {
      under = answers.length > 0 ? answers.slice(0, 1) : [vars];
    }
    const found: Vars[] = [];
    for (const answered of under) {
      found.push(...(yield* checkRest(rest, left, at, answered, whole, shift)));
    }
    if (differs || answers.length === 0 || found.length === 0) {
      return NONE;
    }
    return at.write === undefined ? found : answers;
  });

/**
 * A record fits a record of schemas that names some of its keys, with
 * values that fit, when the record of its other keys fits the schema of the
 * rest: `{}` for a record of schemas on its own, so it has no other keys,
 * and what `schema/open` was given. A key whose schema is optional can be
 * left out, and a key the schema names never belongs to the rest.
 */
const checkRecord = (
  schema: unknown,
  value: unknown,
  at: Check,
  vars: Vars,
  rest: unknown = NOTHING_LEFT,
  whole: unknown = schema
): Fitting => {
  const record = recordOf(schema);
  if (record === undefined || !isRecord(value)) {
    return Effect.succeed(fail(at, { schema, value }));
  }
  const { keys, parts } = record;
  const present: (readonly [string, unknown])[] = [];
  let differs = false;
  for (const [index, key] of keys.entries()) {
    const part = parts[index];
    const optional = at.equal ? undefined : partsOf(part, builders.optional);
    if (Object.hasOwn(value, key)) {
      present.push([key, optional === undefined ? part : optional[0]]);
    } else if (optional === undefined) {
      fail(at, { schema: part }, key);
      differs = true;
    }
  }
  const others = Object.keys(value).filter((key) => !keys.includes(key));
  if (rest === NOTHING_LEFT) {
    for (const key of others) {
      fail(at, { value: value[key] }, key);
      differs = true;
    }
  }
  if (differs && at.write === undefined) {
    return Effect.succeed(NONE);
  }
  const named = every(present, at, vars, ([key, part], answered) =>
    check(part, value[key], inside(at, key), answered)
  );
  return rest === NOTHING_LEFT
    ? Effect.map(named, (answers) => (differs ? NONE : answers))
    : andRest(
        named,
        differs,
        rest,
        Object.fromEntries(others.map((key) => [key, value[key]])),
        at,
        vars,
        { schema: whole, value }
      );
};

/**
 * A list fits a list of schemas item by item, when the list of the items
 * after them fits the schema of the rest: `[]` for a list of schemas on its
 * own, so the two have the same length, and what `schema/open` was given.
 */
const checkList = (
  parts: readonly unknown[],
  schema: unknown,
  value: unknown,
  at: Check,
  vars: Vars,
  rest: unknown = NOTHING_LEFT
): Fitting => {
  if (
    !Array.isArray(value) ||
    value.length < parts.length ||
    (rest === NOTHING_LEFT && value.length > parts.length)
  ) {
    return Effect.succeed(fail(at, { schema, value }));
  }
  const named = every(
    value.slice(0, parts.length).entries(),
    at,
    vars,
    ([index, item], answered) =>
      check(parts[index], item, inside(at, index), answered)
  );
  return rest === NOTHING_LEFT
    ? named
    : andRest(
        named,
        false,
        rest,
        value.slice(parts.length),
        at,
        vars,
        { schema, value },
        parts.length
      );
};

/**
 * Whether a schema, through the names in it, holds a predicate that runs
 * Lion code, such as a lambda or a relation, and so can ask about a schema
 * again while a value is checked. Data, what the `schema` functions build,
 * and library functions that read only their arguments ask nothing.
 */
const asks = (schema: unknown, seen: Set<SchemaInfo>): boolean => {
  if (schema instanceof LogicValue) {
    return true;
  }
  if (typeof schema === "function") {
    const named = schemaOf(schema);
    if (named !== undefined) {
      if (seen.has(named)) {
        return false;
      }
      seen.add(named);
      return asks(named.shape, seen);
    }
    const built = buildOf(schema);
    return built === undefined
      ? !isArgumentsOnly(schema)
      : built.args.some((part) => asks(part, seen));
  }
  if (Array.isArray(schema)) {
    return schema.some((part) => asks(part, seen));
  }
  return (
    isPlainObject(schema) &&
    Object.values(schema).some((part) => asks(part, seen))
  );
};

const ASKS = new WeakMap<SchemaInfo, boolean>();

/** Whether a named schema's shape can ask about a schema while it checks. */
const asksBack = (named: SchemaInfo) => {
  let known = ASKS.get(named);
  if (known === undefined) {
    known = asks(named.shape, new Set([named]));
    ASKS.set(named, known);
  }
  return known;
};

const SIZES = new WeakMap<object, number>();

/**
 * How large a value is: one for each value in it, and one for each
 * character of a string. A part of a value, such as a list's tail or a
 * record's value, is smaller than the value, so a schema that asks about
 * itself only about smaller values asks a finite number of times.
 */
const sizeOf = (value: unknown): number => {
  if (typeof value === "string") {
    return 1 + value.length;
  }
  const record = isPlainObject(value);
  if (!(record || Array.isArray(value))) {
    return 1;
  }
  let size = SIZES.get(value as object);
  if (size === undefined) {
    size = 1;
    for (const part of record ? Object.values(value) : value) {
      size += sizeOf(part);
    }
    SIZES.set(value as object, size);
  }
  return size;
};

const NOT_CHECKING: ReadonlyMap<SchemaInfo, Checking> = new Map();

/**
 * Checks a value against the shape of a named schema that can ask about a
 * schema again, as the schemas being checked. Until the shape is checked,
 * asking about it again for the same value answers that the value does not
 * fit. When the shape answers that it fits, that disagrees, and the shape is
 * checked again assuming that it fits. If that disagrees too, whether the
 * value fits has no answer. And if the schema was asked about a value that
 * is no smaller, the check may never end, so it is refused.
 */
const settle = (
  named: SchemaInfo,
  value: unknown,
  at: Check,
  vars: Vars,
  checking: ReadonlyMap<SchemaInfo, Checking>
): Fitting =>
  Effect.gen(function* () {
    const entry: Checking = {
      assumed: false,
      refused: undefined,
      used: false,
      value,
    };
    const shape = check(
      named.shape,
      value,
      { ...at, open: new Set([...at.open, named]) },
      vars
    ).pipe(
      Effect.provideService(
        LionCheckingService,
        new Map(checking).set(named, entry)
      )
    );
    const kept = at.out.length;
    let answers = yield* shape;
    if (entry.refused === undefined && entry.used && answers.length > 0) {
      entry.assumed = true;
      entry.used = false;
      at.out.splice(kept);
      answers = yield* shape;
      if (entry.refused === undefined && answers.length === 0) {
        return yield* logicError(
          `Whether ${show(value)} fits "${named.name}" has no answer: checking it asks the same question again, and the value would fit exactly when it does not.`
        );
      }
    }
    if (entry.refused !== undefined) {
      return yield* logicError(
        `Schema "${named.name}" asks whether ${show(entry.refused.value)} fits it while checking ${show(value)}. A schema may ask about itself again only about a smaller value, so that its check ends.`
      );
    }
    return answers;
  });

/**
 * A value against a named schema. A schema that asks about itself again,
 * through its shape or a predicate in it, meets the check under way: about
 * the same value it gets what that check assumes, about a smaller value it
 * is checked as any schema is, and about any other value it is refused.
 */
const checkNamed = (
  schema: LionFunction,
  named: SchemaInfo,
  value: unknown,
  at: Check,
  vars: Vars
): Fitting => {
  const again = at.open.has(named);
  if (!asksBack(named)) {
    return again
      ? Effect.succeed(fail(at, { schema, value }))
      : check(
          named.shape,
          value,
          { ...at, open: new Set([...at.open, named]) },
          vars
        );
  }
  return Effect.flatMap(Effect.serviceOption(LionCheckingService), (found) => {
    const checking = Option.getOrElse(found, () => NOT_CHECKING);
    const earlier = checking.get(named);
    if (
      earlier === undefined ||
      (!again && sizeOf(value) < sizeOf(earlier.value))
    ) {
      return settle(named, value, at, vars, checking);
    }
    if (again || sameValue(value, earlier.value)) {
      earlier.used = true;
      return Effect.succeed(
        earlier.assumed ? [vars] : fail(at, { schema, value })
      );
    }
    earlier.refused ??= { value };
    return Effect.succeed(fail(at, { schema, value }));
  });
};

/** A function is a predicate: a named schema, a built one, or any other. */
const checkFunction = (
  schema: LionFunction,
  value: unknown,
  at: Check,
  vars: Vars
): Fitting => {
  const named = schemaOf(schema);
  if (named !== undefined) {
    if (named.definition === undefined) {
      return logicError(
        `Schema "${named.name}" is still being declared, so nothing can be checked against it yet. Its shape can name it, but cannot call it.`
      );
    }
    return checkNamed(schema, named, value, at, vars);
  }
  const built = buildOf(schema);
  const checkBuilt = built === undefined ? undefined : BUILT.get(built.by);
  if (built !== undefined && checkBuilt !== undefined) {
    return checkBuilt(built.args, value, at, schema, vars);
  }
  const relation = relationOf(schema);
  if (relation !== undefined && relation.columns.length !== 1) {
    return logicError(
      `"${relation.name}" has ${relation.columns.length} columns, so it cannot be the schema of one value: a relation is a schema when it has one column. To mean the string, write ["quote", "${relation.name}"].`
    );
  }
  return Effect.map(holds(schema, value, at, vars), (fit) =>
    fit ? [vars] : fail(at, { schema, value })
  );
};

/**
 * A logic value in a schema. A variable is its value once it is bound, and
 * until then any value fits it and binds it. A record or list that waits
 * fits part by part, and so does what a `schema` function waits to build.
 * Anything else is a value once its variables are bound: a call that waits
 * runs, and a goal is asked.
 */
const checkTerm = (
  term: LogicValue,
  value: unknown,
  at: Check,
  vars: Vars
): Fitting => {
  if (term instanceof LogicVariable) {
    if (vars.has(term.name)) {
      return check(vars.get(term.name), value, at, vars);
    }
    return Effect.succeed([
      term.anonymous ? vars : new Map(vars).set(term.name, value),
    ]);
  }
  if (term instanceof DeferredCall) {
    if (recordKeys(term.fn) !== undefined) {
      return checkRecord(term, value, at, vars);
    }
    if (isListTerm(term)) {
      return checkList(term.args, term, value, at, vars);
    }
    const checkBuilt =
      patternParts(term, !at.equal) === undefined
        ? undefined
        : BUILT.get(term.fn as object);
    if (checkBuilt !== undefined) {
      return checkBuilt(term.args, value, at, term, vars);
    }
  }
  let valued: Effect.Effect<unknown, WaitingError | Error, never>;
  if (at.term === undefined) {
    valued = isQuestion(term)
      ? (answer(term) as Effect.Effect<unknown, WaitingError, never>)
      : Effect.fail(new WaitingError({ value: term }));
  } else {
    valued = at.term(term, vars);
  }
  return Effect.flatMap(valued, (schema) =>
    schema instanceof LogicValue
      ? Effect.fail(new WaitingError({ value: schema }))
      : check(schema, value, at, vars)
  );
};

/** The answers under which the value fits the schema. */
const check = (
  schema: unknown,
  value: unknown,
  at: Check,
  vars: Vars
): Fitting => {
  if (schema instanceof LogicValue) {
    return checkTerm(schema, value, at, vars);
  }
  if (!at.equal) {
    if (typeof schema === "function") {
      return checkFunction(schema as LionFunction, value, at, vars);
    }
    if (isPlainObject(schema)) {
      return checkRecord(schema, value, at, vars);
    }
    if (Array.isArray(schema)) {
      return checkList(schema, schema, value, at, vars);
    }
  }
  return Effect.succeed(
    sameValue(schema, value) ? [vars] : fail(at, { schema, value })
  );
};

const byPath = (a: Problem, b: Problem) =>
  compareValues(a.path, b.path) || compareValues(a, b);

/**
 * Writes a schema as the expression that makes it where the check runs: a
 * string that is a name there, and is meant as data, goes inside `quote`.
 */
const writer = Effect.gen(function* () {
  const names = boundNames(yield* LionEnvironmentService);
  return (schema: unknown) => expression(schema, (text) => names.has(text));
});

const plain = (out: Problem[], write: Check["write"]): Check => ({
  equal: false,
  open: NOT_OPEN,
  out,
  path: [],
  write,
});

/**
 * Every place where a value does not fit a schema, in the order of their
 * paths; none when the value fits.
 */
export const problemsOf = (schema: unknown, value: unknown) =>
  Effect.flatMap(writer, (write) => {
    const out: Problem[] = [];
    return Effect.map(check(schema, value, plain(out, write), NO_VARS), () =>
      out.sort(byPath)
    );
  }) as EvaluateResult;

/** Whether a value fits a schema. */
export const fits = (schema: unknown, value: unknown) =>
  Effect.map(
    Effect.suspend(() => check(schema, value, plain([], undefined), NO_VARS)),
    (answers) => answers.length > 0
  ) as EvaluateResult;

/**
 * The answers under which a value matches a pattern, for a rule or query:
 * each is `vars` with the variables the match bound. `equal` asks for the
 * two to be the same value, as "=" does, and otherwise the pattern is a
 * schema. `term` gives the value of a term for an answer.
 */
export const matching = (
  pattern: unknown,
  value: unknown,
  vars: Vars,
  how: Pick<Check, "equal" | "term">
) => check(pattern, value, { ...plain([], undefined), ...how }, vars);

const MAX_SHOWN = 5;

const text = (value: unknown) => JSON.stringify(value) ?? "nothing";

const describe = ({ expected, found, path }: Problem) => {
  const where = path.length === 0 ? "it" : JSON.stringify(path.join("."));
  if (expected === undefined) {
    return `${where} is ${text(found)}, where nothing is expected`;
  }
  return found === undefined
    ? `${where} must fit ${text(expected)} but is missing`
    : `${where} must fit ${text(expected)} but is ${text(found)}`;
};

/**
 * Says that a value does not fit a schema, and where; undefined when the
 * value fits.
 */
export const misfit = (schema: unknown, value: unknown) =>
  Effect.gen(function* () {
    const found = (yield* problemsOf(schema, value)) as Problem[];
    const [first] = found;
    if (first === undefined) {
      return undefined;
    }
    const written = text((yield* writer)(schema));
    const summary = `${show(value)} does not fit ${written}`;
    if (
      found.length === 1 &&
      first.path.length === 0 &&
      text(first.expected) === written
    ) {
      return `${summary}.`;
    }
    const more =
      found.length > MAX_SHOWN ? `; and ${found.length - MAX_SHOWN} more` : "";
    return `${summary}: ${found.slice(0, MAX_SHOWN).map(describe).join("; ")}${more}.`;
  });

/** A schema as a function: called with the one value to check. */
const checker = () => {
  const schema: LionFunction = takes(
    1,
    (value: unknown) => fits(schema, value),
    "the value to check"
  );
  return schema;
};

/**
 * A schema with a name. Until it is declared it has no shape, so its own
 * shape can hold it.
 */
export const makeSchema = (name: string) =>
  registerSchema(checker(), {
    definition: undefined,
    group: [name],
    name,
    shape: undefined,
    strings: new Set(),
  });

/**
 * A function of the `schema` module that builds a schema from others, with
 * how many it takes and how a value is checked against what it builds. What
 * it builds is a predicate like any other, and remembers what it was built
 * from, so a misfit can say where it is and a snapshot can write the schema.
 */
const builder = (
  name: string,
  count: Count,
  checkBuilt: CheckBuilt,
  refuses?: (part: unknown) => string | undefined,
  what = "a schema"
) => {
  const build: LionFunction = schemaBuilder(
    takes(
      count,
      (...parts: unknown[]) => {
        const wrong = refuses?.(parts[0]);
        return wrong === undefined
          ? Effect.succeed(builtBy(checker(), build, parts))
          : logicError(`${name} ${wrong}.`);
      },
      what
    ),
    refuses !== undefined
  );
  BUILT.set(build, checkBuilt);
  nameFunctions({ [name]: build });
  readsOnlyArguments({ build });
  return build;
};

const notRecord = (found: unknown) =>
  `expects a record or a list of schemas, or a schema that names one, but found ${show(found)}`;

/**
 * The schemas of a list of schemas: a list, a schema that names one, or a
 * list that waits. Undefined for anything else.
 */
const listOf = (schema: unknown): readonly unknown[] | undefined => {
  if (isListTerm(schema)) {
    return (schema as DeferredCall).args;
  }
  const list = unnamed(schema);
  return Array.isArray(list) ? list : undefined;
};

const ANY = atLeast(0);

export const builders = {
  /** Fits a value that fits every one of the schemas. */
  allOf: builder("schema/allOf", ANY, (parts, value, at, _, vars) =>
    every(parts, at, vars, (part, answered) => check(part, value, at, answered))
  ),
  /**
   * Fits a value that fits at least one of the schemas. In plain code the
   * first that fits decides. Where variables can be bound, every schema
   * that fits gives its answers, each once.
   */
  anyOf: builder("schema/anyOf", ANY, (parts, value, at, schema, vars) =>
    Effect.gen(function* () {
      const quiet = { ...at, out: [], write: undefined };
      const found = new Map<string, Vars>();
      for (const part of parts) {
        const answers = yield* check(part, value, quiet, vars);
        if (answers.length > 0 && at.term === undefined) {
          return answers;
        }
        for (const answered of answers) {
          found.set(answerKey(answered), answered);
        }
      }
      return found.size === 0
        ? fail(at, { schema, value })
        : [...found.values()];
    })
  ),
  /** Fits a list whose every item fits the schema. */
  arrayOf: builder("schema/arrayOf", 1, ([item], value, at, schema, vars) =>
    Array.isArray(value)
      ? every(value.entries(), at, vars, ([index, part], answered) =>
          check(item, part, inside(at, index), answered)
        )
      : Effect.succeed(fail(at, { schema, value }))
  ),
  /** Fits a record whose every value fits the schema. */
  recordOf: builder("schema/recordOf", 1, ([item], value, at, schema, vars) =>
    isRecord(value)
      ? every(Object.entries(value), at, vars, ([key, part], answered) =>
          check(item, part, inside(at, key), answered)
        )
      : Effect.succeed(fail(at, { schema, value }))
  ),
  /** As the schema of a record's key, lets the key be left out. */
  optional: builder("schema/optional", 1, ([inner], value, at, _, vars) =>
    check(inner, value, at, vars)
  ),
  /**
   * Fits a record that fits the record of schemas, when the record of its
   * other keys fits the schema of the rest, or whatever other keys it has
   * when there is none. A list of schemas works the same way: the items
   * after the ones it names are the rest. A schema that is still being
   * declared has no shape to look at yet, so its name is taken as it is,
   * and a check finds out what it names.
   */
  open: builder(
    "schema/open",
    [1, 2],
    ([shape, ...rest], value, at, schema, vars) => {
      const left = rest.length === 0 ? ANYTHING_LEFT : rest[0];
      const items = listOf(shape);
      if (items !== undefined) {
        return checkList(items, schema, value, at, vars, left);
      }
      return recordOf(shape) === undefined
        ? logicError(`schema/open ${notRecord(shape)}.`)
        : checkRecord(shape, value, at, vars, left, schema);
    },
    (shape) => {
      const named = schemaOf(shape);
      return (named !== undefined && named.definition === undefined) ||
        recordOf(shape) !== undefined ||
        listOf(shape) !== undefined
        ? undefined
        : notRecord(shape);
    },
    "a record or list of schemas, and the schema of its rest"
  ),
};

/** A function of the `schema` module that checks a value against a schema. */
export const checking = <B, E, R>(
  check: (value: unknown, schema: unknown) => Effect.Effect<B, E, R>
) => takes(2, check, "a value and a schema");

/**
 * `["schema/fits?", value, schema]`: whether the value fits the schema.
 * Like "=" and "in", it is a goal when a logic variable is in it: in a rule
 * or query it tests the value, and binds the variables that stand in the
 * schema.
 */
export const fitsValue: LionFunction = logicFunction(
  checking((...args) =>
    Effect.gen(function* () {
      const goal = () =>
        Effect.map(
          suspendArguments(args),
          (parts) => new LogicForm("schema/fits?", parts)
        );
      const values = yield* known(args);
      return values === undefined
        ? yield* goal()
        : yield* fits(values[1], values[0]).pipe(
            Effect.catchTag("WaitingError", goal)
          );
    })
  )
);

nameFunctions({ "schema/fits?": fitsValue });
readsOnlyArguments({ fitsValue });

/**
 * The schema and the value that a goal checks, when the goal is a schema
 * check: `schema/fits?`, or a call of a schema.
 */
export const checkOf = (goal: unknown) => {
  if (isForm(goal, "schema/fits?")) {
    const [value, schema] = goal.parts;
    return { schema, value };
  }
  if (!(goal instanceof DeferredCall)) {
    return undefined;
  }
  const built = buildOf(goal.fn);
  const isSchema =
    schemaOf(goal.fn) !== undefined || (built && BUILT.has(built.by));
  return isSchema && goal.args.length === 1
    ? { schema: goal.fn, value: goal.args[0] }
    : undefined;
};

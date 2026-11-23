/**
 * Symbolic values: what a variable that a schema types, and that no goal
 * binds, stands for, and the constraints the goals about it make.
 *
 * A schema that cannot list the values it allows can still give them a
 * shape: `value/integer?` stands for a whole number, `value/number?` for
 * any number, a record or list of schemas for a record or list of what its
 * parts stand for, `schema/anyOf` for any of its schemas' shapes, and a list
 * of at most so many items for a list of each length up to that. Each
 * number in a shape is a variable of the solver.
 *
 * A goal about such values is worked out on them: arithmetic makes sums,
 * comparisons and `=` make constraints, `cond`, `number/min`,
 * `number/max`, `number/absolute`, `boolean/and`, `boolean/or`, and `not`
 * make choices between cases, and a lambda is run on the values by its body.
 * What the solver cannot decide, such as a product of two unknowns or a
 * string function on one, is refused by name.
 */
import { Effect } from "effect";
import {
  KeyNotFoundError,
  LogicError,
  logicError,
  notTruth,
} from "@/errors/evaluation";
import { type Environment, lookup, UNBOUND } from "@/evaluation/environment";
import { call } from "@/evaluation/special-forms/function";
import { fits } from "@/logic/fit";
import {
  type Constraint,
  constant,
  type Linear,
  minus,
  plus,
  type Sort,
  satisfiable,
  times,
  variable,
} from "@/logic/solver";
import {
  ANY_REST_SCHEMA,
  and,
  atom,
  type Cases,
  equal,
  FALSE,
  type Formula,
  fieldsOf,
  fromValue,
  isConcrete,
  itemsOf,
  MOST_WAYS,
  not,
  numberSym,
  one,
  opaqueKindOf,
  or,
  plainOf,
  product,
  Shapeless,
  type Sym,
  shapeOf,
  TRUE,
  throughNames,
  tooManyWays,
  truthSym,
} from "@/logic/symbols";
import {
  Atom,
  allowedBy,
  buildOf,
  DeferredCall,
  isListTerm,
  isLogicVariableName,
  isPlainObject,
  type LambdaInfo,
  type LogicForm,
  LogicValue,
  LogicVariable,
  lambdaInfo,
  nameOf,
  recordKeys,
  show,
} from "@/logic/terms";
import {
  DIGITS,
  divide,
  floor as exactFloor,
  isZero,
  multiply,
  negate,
  ONE,
  type Rational,
  ratio,
  ZERO,
} from "@/numbers/exact";
import { isMatchCase } from "@/schemas/evaluation";

/** Sentinel schema that allows no values, used to test inhabitedness. */
export const EMPTY_SCHEMA = Symbol("empty schema");

/** The context a goal is worked out in. */
export interface Context {
  /** Maps concrete values of opaque kinds (such as strings) to unique integer ids. */
  readonly atoms?: Map<unknown, number>;
  /** True when deciding schema inclusion across broad shapes (opaque kinds, open/unbounded collections). */
  readonly broad?: boolean;
  /** Recursive schema inclusion check for open/unbounded rest schemas. */
  readonly checkIncludes?: (
    inner: unknown,
    outer: unknown
  ) => Effect.Effect<boolean, Error>;
  /** Defining constraints of Skolem integer variables (such as floor), keyed by variable name. */
  readonly definitions: Map<string, readonly Constraint[]>;
  /** The value of a term with no symbolic variable in it, for this answer. */
  readonly evaluate: (term: unknown) => Effect.Effect<unknown, Error>;
  /** Memoizes floor(u) -> integer variable name for a canonical linear expression. */
  readonly floors: Map<string, string>;
  /** Whether each of the solver's variables is a whole number or any number. */
  readonly sorts: Map<string, Sort>;
  /** What each symbolic variable stands for. */
  readonly symbols: ReadonlyMap<string, Cases>;
}

const LEAF_PARTS = /[.#/]/;

/** Canonical text for a linear expression, so equal expressions share one floor variable. */
const linearKey = (linear: Linear) =>
  `${linear.constant.n}/${linear.constant.d}|${[...linear.coefficients]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, c]) => `${name}:${c.n}/${c.d}`)
    .join(",")}`;

/**
 * The exact floor of a linear expression: a whole variable `q` pinned in
 * `context.definitions` by `q <= u < q + 1`. Because every number has one
 * unique floor, these defining constraints hold under both positive and
 * negated formulas, and are attached outside any `not`.
 */
const floorLinear = (linear: Linear, context: Context): Linear => {
  if (linear.coefficients.size === 0) {
    return constant(ratio(exactFloor(linear.constant)));
  }
  if (integral(linear, context.sorts)) {
    return linear;
  }
  const key = linearKey(linear);
  const existing = context.floors.get(key);
  if (existing !== undefined) {
    return variable(existing);
  }
  const [first] = linear.coefficients.keys();
  const owner = (first ?? "v").split(LEAF_PARTS)[0] || "v";
  const name = `${owner}#floor_${context.floors.size}`;
  const q = variable(name);
  context.sorts.set(name, "integer");
  context.floors.set(key, name);
  context.definitions.set(name, [
    { linear: minus(linear, q), relation: ">=" },
    { linear: minus(plus(q, constant(ONE)), linear), relation: ">" },
  ]);
  return q;
};

/**
 * Appends every defining constraint for auxiliary variables referenced
 * (transitively) by `constraints` or `extra`.
 */
export const withDefinitions = (
  constraints: readonly Constraint[],
  definitions: ReadonlyMap<string, readonly Constraint[]>,
  extra: readonly string[] = []
): readonly Constraint[] => {
  if (definitions.size === 0) {
    return constraints;
  }
  const seen = new Set<string>();
  const queue: string[] = [
    ...extra,
    ...constraints.flatMap((c) => [...c.linear.coefficients.keys()]),
  ];
  const added: Constraint[] = [];
  for (const name of queue) {
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    const defs = definitions.get(name);
    if (defs !== undefined) {
      for (const c of defs) {
        added.push(c);
        for (const dep of c.linear.coefficients.keys()) {
          if (!seen.has(dep)) {
            queue.push(dep);
          }
        }
      }
    }
  }
  return added.length === 0 ? constraints : [...added, ...constraints];
};

const MOST_DEPTH = 64;

const refused = (what: string) =>
  logicError(
    `The solver cannot reason about ${what}: it decides sums of numbers times known numbers, comparisons of them, and equality of values.`
  );

/** A symbolic value as a truth: false and true, or a formula. */
const truthOf = (sym: Sym, what: unknown) => {
  if (sym.kind === "truth") {
    return Effect.succeed(sym.formula);
  }
  return sym.kind === "value"
    ? logicError(notTruth(what, sym.value))
    : logicError(notTruth(what, sym, `a ${sym.kind}`));
};

type Result = Effect.Effect<Cases, Error>;

/** A sum of numbers, or a refusal. */
const linearOf = (sym: Sym, what: string) => {
  if (sym.kind === "number") {
    return Effect.succeed(sym.linear);
  }
  const kind = sym.kind === "value" ? show(sym.value) : `a ${sym.kind}`;
  return refused(`${what} of ${kind}`);
};

const compareWith =
  (relation: ">=" | ">", flip: boolean) =>
  (a: Linear, b: Linear): Formula =>
    atom({ linear: flip ? minus(b, a) : minus(a, b), relation });

const ANY = Number.POSITIVE_INFINITY;

/**
 * How many arguments each function the solver runs takes, as the library
 * says: a call with any other number is not run on symbolic values.
 */
const ARITIES: Readonly<Record<string, readonly [number, number]>> = {
  "array/concat": [0, ANY],
  "array/every?": [2, 2],
  "array/filter": [2, 2],
  "array/flat-map": [2, 2],
  "array/head": [1, 1],
  "array/includes?": [2, 2],
  "array/length": [1, 1],
  "array/map": [2, 2],
  "array/reduce": [3, 3],
  "array/reductions": [3, 3],
  "array/reverse": [1, 1],
  "array/slice": [2, 3],
  "array/some?": [2, 2],
  "array/sort": [1, 2],
  "array/tail": [1, 1],
  "array/zip": [1, ANY],
  "boolean/and": [2, 2],
  "boolean/not": [1, 1],
  "boolean/or": [2, 2],
  "number/absolute": [1, 1],
  "number/add": [0, ANY],
  "number/ceiling": [1, 1],
  "number/divide": [2, 2],
  "number/equals?": [2, 2],
  "number/floor": [1, 1],
  "number/greaterThan": [2, 2],
  "number/greaterThanOrEqualTo": [2, 2],
  "number/lessThan": [2, 2],
  "number/lessThanOrEqualTo": [2, 2],
  "number/max": [1, ANY],
  "number/min": [1, ANY],
  "number/multiply": [0, ANY],
  "number/remainder": [2, 2],
  "number/round": [1, 2],
  "number/subtract": [2, 2],
  "object/get": [2, 3],
  "object/has?": [2, 2],
  "schema/fits?": [2, 2],
  "value/integer?": [1, 1],
  "value/number?": [1, 1],
};

/** How a library function works on symbolic values, by its name. */
const LIBRARY: Readonly<
  Record<
    string,
    (
      args: readonly Sym[],
      name: string,
      context: Context,
      depth: number
    ) => Effect.Effect<Cases, Error>
  >
> = {
  "number/add": (args, name) =>
    Effect.map(
      Effect.forEach(args, (arg) => linearOf(arg, name)),
      (sums) =>
        one(numberSym(sums.reduce((a, b) => plus(a, b), constant(ZERO))))
    ),
  "number/subtract": (args, name) =>
    Effect.map(
      Effect.forEach(args, (arg) => linearOf(arg, name)),
      ([first, ...rest]) =>
        one(
          numberSym(
            rest.length === 0
              ? times(first as Linear, negate(ONE))
              : rest.reduce((a, b) => minus(a, b), first as Linear)
          )
        )
    ),
  "number/multiply": (args, name) =>
    Effect.flatMap(
      Effect.forEach(args, (arg) => linearOf(arg, name)),
      (sums) => {
        const unknown = sums.filter((sum) => sum.coefficients.size > 0);
        if (unknown.length > 1) {
          return refused(`${name} of two unknowns`);
        }
        const known = sums
          .filter((sum) => sum.coefficients.size === 0)
          .reduce((k, sum) => multiply(k, sum.constant), ONE);
        return Effect.succeed(
          one(numberSym(times(unknown[0] ?? constant(ONE), known)))
        );
      }
    ),
  "number/divide": (args, name) =>
    Effect.flatMap(
      Effect.forEach(args, (arg) => linearOf(arg, name)),
      ([a, b]) => {
        if (b === undefined || b.coefficients.size > 0) {
          return refused(`${name} by an unknown`);
        }
        return isZero(b.constant)
          ? logicError(`${name} by zero has no finite result.`)
          : Effect.succeed(
              one(numberSym(times(a as Linear, divide(ONE, b.constant))))
            );
      }
    ),
  "number/floor": (args, name, context) =>
    Effect.map(linearOf(args[0] as Sym, name), (x) =>
      one(numberSym(floorLinear(x, context)))
    ),
  "number/ceiling": (args, name, context) =>
    Effect.map(linearOf(args[0] as Sym, name), (x) =>
      one(
        numberSym(
          times(floorLinear(times(x, negate(ONE)), context), negate(ONE))
        )
      )
    ),
  "number/round": (args, name, context) =>
    Effect.flatMap(
      Effect.forEach(args, (arg) => linearOf(arg, name)),
      ([x, places]) => {
        if (places !== undefined) {
          if (places.coefficients.size > 0) {
            return refused(name);
          }
          if (
            places.constant.d !== 1n ||
            places.constant.n > BigInt(DIGITS) ||
            places.constant.n < -BigInt(DIGITS)
          ) {
            return refused(name);
          }
        }
        const p = places === undefined ? 0n : places.constant.n;
        const subject = x as Linear;
        if (p >= 0n && integral(subject, context.sorts)) {
          return Effect.succeed(one(numberSym(subject)));
        }
        const scale: Rational =
          p >= 0n ? ratio(10n ** p) : ratio(1n, 10n ** -p);
        const rounded = floorLinear(
          plus(times(subject, scale), constant(ratio(1n, 2n))),
          context
        );
        return Effect.succeed(
          one(numberSym(times(rounded, divide(ONE, scale))))
        );
      }
    ),
  "number/remainder": (args, name, context) =>
    Effect.flatMap(
      Effect.forEach(args, (arg) => linearOf(arg, name)),
      ([a, b]) => {
        if (b === undefined || b.coefficients.size > 0) {
          return refused(`${name} by an unknown`);
        }
        if (isZero(b.constant)) {
          return logicError(`${name} by zero has no finite result.`);
        }
        const k: Rational = b.constant.n < 0n ? negate(b.constant) : b.constant;
        const dividend = a as Linear;
        const scaled = times(dividend, divide(ONE, k));
        const posQ = floorLinear(scaled, context);
        const negQ = floorLinear(times(scaled, negate(ONE)), context);
        const posWhen = atom({ linear: dividend, relation: ">=" });
        const negWhen = atom({
          linear: times(dividend, negate(ONE)),
          relation: ">",
        });
        return Effect.succeed<Cases>([
          ...(posWhen.length === 0
            ? []
            : [
                {
                  sym: numberSym(minus(dividend, times(posQ, k))),
                  when: posWhen,
                },
              ]),
          ...(negWhen.length === 0
            ? []
            : [
                {
                  sym: numberSym(plus(dividend, times(negQ, k))),
                  when: negWhen,
                },
              ]),
        ]);
      }
    ),
  "number/absolute": (args, name) =>
    Effect.map(linearOf(args[0] as Sym, name), (x) => [
      { sym: numberSym(x), when: atom({ linear: x, relation: ">=" }) },
      {
        sym: numberSym(times(x, negate(ONE))),
        when: atom({ linear: times(x, negate(ONE)), relation: ">" }),
      },
    ]),
  "number/min": (args, name) => extremum(args, name, false),
  "number/max": (args, name) => extremum(args, name, true),
  "number/lessThan": (args, name) =>
    comparison(args, name, compareWith(">", true)),
  "number/lessThanOrEqualTo": (args, name) =>
    comparison(args, name, compareWith(">=", true)),
  "number/greaterThan": (args, name) =>
    comparison(args, name, compareWith(">", false)),
  "number/greaterThanOrEqualTo": (args, name) =>
    comparison(args, name, compareWith(">=", false)),
  "number/equals?": (args) =>
    Effect.succeed(one(truthSym(equal(args[0] as Sym, args[1] as Sym)))),
  "boolean/and": (args) =>
    Effect.map(
      Effect.forEach(args, (arg) => truthOf(arg, arg)),
      (formulas) => one(truthSym(formulas.reduce(and, TRUE)))
    ),
  "boolean/or": (args) =>
    Effect.map(
      Effect.forEach(args, (arg) => truthOf(arg, arg)),
      (formulas) => one(truthSym(formulas.reduce(or, FALSE)))
    ),
  "boolean/not": (args) =>
    Effect.map(truthOf(args[0] as Sym, args[0]), (f) => one(truthSym(not(f)))),
  // A record of a known shape has its keys known, so these are known too:
  // a missing key fails, as in plain code, unless a value is given for it.
  "object/get": (args) => {
    const [record, key, missing] = args;
    const fields = fieldsOf(record as Sym);
    if (
      fields === undefined ||
      key?.kind !== "value" ||
      typeof key.value !== "string"
    ) {
      return refused("object/get");
    }
    const found = fields.get(key.value) ?? missing;
    return found === undefined
      ? Effect.fail(new KeyNotFoundError({ key: key.value }))
      : Effect.succeed(one(found));
  },
  "object/has?": (args) => {
    const [record, key] = args;
    const fields = fieldsOf(record as Sym);
    if (
      fields === undefined ||
      key?.kind !== "value" ||
      typeof key.value !== "string"
    ) {
      return refused("object/has?");
    }
    return Effect.succeed(one(truthSym(fields.has(key.value) ? TRUE : FALSE)));
  },
  "schema/fits?": (args, _name, context, depth) =>
    isConcrete(args[1] as Sym)
      ? Effect.map(
          fitsOf(args[0] as Sym, plainOf(args[1] as Sym), context, depth),
          (f) => one(truthSym(f))
        )
      : refused("a schema made from a value no goal binds"),
  "value/number?": (args) =>
    Effect.succeed(one(truthSym(args[0]?.kind === "number" ? TRUE : FALSE))),
  "value/integer?": (args, _name, context) =>
    Effect.map(fitsInteger(args[0] as Sym, context), (f) => one(truthSym(f))),
};

/** What the solver says of a list it goes over whose length it does not know. */
const unknownLength = (name: string) =>
  refused(`${name} over a list whose length the solver does not know`);

/** What the solver says of a function no goal binds that something calls. */
const unboundFunction = (name: string) =>
  refused(`${name} of a function no goal binds`);

/** The items of a list, or a refusal when the value is not one of known length. */
const listOf = (sym: Sym | undefined, name: string) => {
  const items = sym === undefined ? undefined : itemsOf(sym);
  return items === undefined ? unknownLength(name) : Effect.succeed(items);
};

/** A function a library call is given: a known one, or a lambda the solver runs. */
const functionOf = (sym: Sym | undefined, name: string) => {
  if (sym?.kind === "closure") {
    return Effect.succeed<unknown>(sym);
  }
  return sym?.kind === "value" && typeof sym.value === "function"
    ? Effect.succeed<unknown>(sym.value)
    : unboundFunction(name);
};

const isClosure = (fn: unknown): fn is Extract<Sym, { kind: "closure" }> =>
  typeof fn === "object" &&
  fn !== null &&
  (fn as { kind?: unknown }).kind === "closure";

/** What a call's head is as something to call: a function, or a lambda the solver holds. */
const callableOf = (sym: Sym): unknown => {
  if (sym.kind === "closure") {
    return sym;
  }
  return sym.kind === "value" && typeof sym.value === "function"
    ? sym.value
    : undefined;
};

/** Calls a known function, or runs a lambda the solver holds by its body. */
const applyCallable = (
  fn: unknown,
  args: readonly Sym[],
  context: Context,
  depth: number
): Result => {
  if (!isClosure(fn)) {
    return applyFunction(fn, args, context, depth);
  }
  return depth > MOST_DEPTH
    ? refused("a function that calls itself")
    : (fn.apply(args, depth + 1) as Result);
};

const listSym = (items: readonly Sym[]): Sym => ({ items, kind: "list" });

/**
 * Every way a fold over a list of known length can go: the values it passes
 * through, starting with `initial`, each way with when it holds.
 */
const fold = (
  items: readonly Sym[],
  initial: Sym,
  fn: unknown,
  context: Context,
  depth: number
) =>
  Effect.gen(function* () {
    let ways: { when: Formula; states: Sym[] }[] = [
      { states: [initial], when: TRUE },
    ];
    for (const item of items) {
      const next: { when: Formula; states: Sym[] }[] = [];
      for (const way of ways) {
        const last = way.states.at(-1) as Sym;
        for (const each of yield* applyCallable(
          fn,
          [last, item],
          context,
          depth
        )) {
          const both = and(way.when, each.when);
          if (both.length > 0) {
            next.push({ states: [...way.states, each.sym], when: both });
          }
          if (next.length > MOST_WAYS) {
            return yield* Effect.fail(tooManyWays());
          }
        }
      }
      ways = next;
    }
    return ways;
  });

/** The cases of a function called on each item of a list, as the list of results. */
const mapped = (
  items: readonly Sym[],
  fn: unknown,
  context: Context,
  depth: number
) =>
  Effect.map(
    Effect.forEach(items, (item) => applyCallable(fn, [item], context, depth)),
    (each) => product(each)
  );

/** Whether a function holds for some item of a list, or, with `some` false, for each. */
const quantified = (
  [list, fn]: readonly Sym[],
  name: string,
  context: Context,
  depth: number,
  some: boolean
) =>
  Effect.flatMap(
    Effect.all([listOf(list, name), functionOf(fn, name)]),
    ([items, f]) =>
      Effect.map(
        Effect.forEach(items, (item) =>
          Effect.flatMap(applyCallable(f, [item], context, depth), formulaOf)
        ),
        (holds) =>
          one(
            truthSym(some ? holds.reduce(or, FALSE) : holds.reduce(and, TRUE))
          )
      )
  );

interface ListWay {
  readonly items: Sym[];
  readonly when: Formula;
}

const filterStep = (
  ways: readonly ListWay[],
  item: Sym,
  holds: Formula
): Effect.Effect<ListWay[], Error> => {
  const fails = not(holds);
  const next: ListWay[] = [];
  for (const way of ways) {
    const kept = and(way.when, holds);
    if (kept.length > 0) {
      next.push({ items: [...way.items, item], when: kept });
    }
    const dropped = and(way.when, fails);
    if (dropped.length > 0) {
      next.push({ items: way.items, when: dropped });
    }
    if (next.length > MOST_WAYS) {
      return Effect.fail(tooManyWays());
    }
  }
  return Effect.succeed(next);
};

const filterSymbolic = (
  items: readonly Sym[],
  fn: unknown,
  context: Context,
  depth: number
): Result =>
  Effect.gen(function* () {
    let ways: ListWay[] = [{ items: [], when: TRUE }];
    for (const item of items) {
      const holds = yield* Effect.flatMap(
        applyCallable(fn, [item], context, depth),
        formulaOf
      );
      ways = yield* filterStep(ways, item, holds);
    }
    return ways.map(({ items: kept, when }) => ({ sym: listSym(kept), when }));
  });

const prependWays = (
  head: Sym,
  rest: readonly ListWay[],
  out: ListWay[]
): Effect.Effect<void, Error> => {
  for (const each of rest) {
    out.push({ items: [head, ...each.items], when: each.when });
    if (out.length > MOST_WAYS) {
      return Effect.fail(tooManyWays());
    }
  }
  return Effect.void;
};

const mergeSymbolic = (
  left: readonly Sym[],
  right: readonly Sym[],
  guard: Formula,
  compareSym: (a: Sym, b: Sym) => Effect.Effect<Formula, Error>,
  context: Context
): Effect.Effect<ListWay[], Error> => {
  if (left.length === 0) {
    return Effect.succeed([{ items: [...right], when: guard }]);
  }
  if (right.length === 0) {
    return Effect.succeed([{ items: [...left], when: guard }]);
  }
  return Effect.gen(function* () {
    const rightFirst = yield* compareSym(right[0] as Sym, left[0] as Sym);
    const out: ListWay[] = [];
    const takeRight = pruneFormula(and(guard, rightFirst), context);
    if (takeRight.length > 0) {
      const rest = yield* mergeSymbolic(
        left,
        right.slice(1),
        takeRight,
        compareSym,
        context
      );
      yield* prependWays(right[0] as Sym, rest, out);
    }
    const takeLeft = pruneFormula(and(guard, not(rightFirst)), context);
    if (takeLeft.length > 0) {
      const rest = yield* mergeSymbolic(
        left.slice(1),
        right,
        takeLeft,
        compareSym,
        context
      );
      yield* prependWays(left[0] as Sym, rest, out);
    }
    return out;
  });
};

const sortSlice = (
  slice: readonly Sym[],
  guard: Formula,
  compareSym: (a: Sym, b: Sym) => Effect.Effect<Formula, Error>,
  context: Context
): Effect.Effect<ListWay[], Error> => {
  if (slice.length < 2) {
    return Effect.succeed([{ items: [...slice], when: guard }]);
  }
  const mid = Math.floor(slice.length / 2);
  return Effect.gen(function* () {
    const lefts = yield* sortSlice(
      slice.slice(0, mid),
      guard,
      compareSym,
      context
    );
    const out: ListWay[] = [];
    for (const l of lefts) {
      const rights = yield* sortSlice(
        slice.slice(mid),
        l.when,
        compareSym,
        context
      );
      for (const r of rights) {
        out.push(
          ...(yield* mergeSymbolic(
            l.items,
            r.items,
            r.when,
            compareSym,
            context
          ))
        );
        if (out.length > MOST_WAYS) {
          return yield* Effect.fail(tooManyWays());
        }
      }
    }
    return out;
  });
};

const sortSymbolic = (
  items: readonly Sym[],
  before: Sym | undefined,
  name: string,
  context: Context,
  depth: number
): Result => {
  if (items.length < 2) {
    return Effect.succeed(one(listSym(items)));
  }
  const compareSym = (a: Sym, b: Sym): Effect.Effect<Formula, Error> => {
    if (before !== undefined) {
      return Effect.flatMap(functionOf(before, name), (f) =>
        Effect.flatMap(applyCallable(f, [a, b], context, depth), formulaOf)
      );
    }
    return a.kind === "number" && b.kind === "number"
      ? Effect.succeed(compareWith(">", true)(a.linear, b.linear))
      : refused(name);
  };
  return Effect.map(sortSlice(items, TRUE, compareSym, context), (ways) =>
    ways.map(({ items: sorted, when }) => ({ sym: listSym(sorted), when }))
  );
};

/** How the array functions work on lists of known length whose items the solver works out. */
const ARRAYS: Readonly<
  Record<
    string,
    (
      args: readonly Sym[],
      name: string,
      context: Context,
      depth: number
    ) => Effect.Effect<Cases, Error>
  >
> = {
  "array/length": ([list], name) =>
    Effect.map(listOf(list, name), (items) => one(fromValue(items.length))),
  "array/head": ([list], name) =>
    Effect.flatMap(listOf(list, name), (items) =>
      items.length === 0 ? refused(name) : Effect.succeed(one(items[0] as Sym))
    ),
  "array/tail": ([list], name) =>
    Effect.flatMap(listOf(list, name), (items) =>
      items.length === 0
        ? refused(name)
        : Effect.succeed(one(listSym(items.slice(1))))
    ),
  "array/slice": ([list, start, end], name) =>
    Effect.flatMap(listOf(list, name), (items) => {
      if (start === undefined || !isConcrete(start)) {
        return refused(name);
      }
      const from = plainOf(start);
      let to: unknown;
      if (end !== undefined) {
        to = isConcrete(end) ? plainOf(end) : null;
      }
      if (
        typeof from !== "number" ||
        !Number.isInteger(from) ||
        (to !== undefined && (typeof to !== "number" || !Number.isInteger(to)))
      ) {
        return refused(name);
      }
      return Effect.succeed(one(listSym(items.slice(from, to))));
    }),
  "array/zip": (lists, name) =>
    Effect.map(
      Effect.forEach(lists, (list) => listOf(list, name)),
      (all) =>
        one(
          listSym(
            Array.from(
              { length: Math.min(...all.map((items) => items.length)) },
              (_, at) => listSym(all.map((items) => items[at] as Sym))
            )
          )
        )
    ),
  "array/concat": (lists, name) =>
    Effect.map(
      Effect.forEach(lists, (list) => listOf(list, name)),
      (all) => one(listSym(all.flat()))
    ),
  "array/includes?": ([list, item], name) =>
    Effect.map(listOf(list, name), (items) =>
      one(
        truthSym(
          items.reduce<Formula>(
            (f, each) => or(f, equal(each, item as Sym)),
            FALSE
          )
        )
      )
    ),
  "array/map": ([list, fn], name, context, depth) =>
    Effect.flatMap(
      Effect.all([listOf(list, name), functionOf(fn, name)]),
      ([items, f]) =>
        Effect.map(mapped(items, f, context, depth), (ways) =>
          ways.map(({ syms, when }) => ({ sym: listSym(syms), when }))
        )
    ),
  "array/flat-map": ([list, fn], name, context, depth) =>
    Effect.flatMap(
      Effect.all([listOf(list, name), functionOf(fn, name)]),
      ([items, f]) =>
        Effect.flatMap(mapped(items, f, context, depth), (ways) =>
          Effect.forEach(ways, ({ syms, when }) =>
            Effect.map(
              Effect.forEach(syms, (each) => listOf(each, name)),
              (lists) => ({ sym: listSym(lists.flat()), when })
            )
          )
        )
    ),
  "array/reduce": ([list, initial, fn], name, context, depth) =>
    Effect.flatMap(
      Effect.all([listOf(list, name), functionOf(fn, name)]),
      ([items, f]) =>
        Effect.map(fold(items, initial as Sym, f, context, depth), (ways) =>
          ways.map(({ states, when }) => ({ sym: states.at(-1) as Sym, when }))
        )
    ),
  "array/some?": (args, name, context, depth) =>
    quantified(args, name, context, depth, true),
  "array/every?": (args, name, context, depth) =>
    quantified(args, name, context, depth, false),
  "array/filter": ([list, fn], name, context, depth) =>
    Effect.flatMap(
      Effect.all([listOf(list, name), functionOf(fn, name)]),
      ([items, f]) => filterSymbolic(items, f, context, depth)
    ),
  "array/reverse": ([list], name) =>
    Effect.map(listOf(list, name), (items) =>
      one(listSym([...items].reverse()))
    ),
  "array/sort": ([list, before], name, context, depth) =>
    Effect.flatMap(listOf(list, name), (items) =>
      sortSymbolic(items, before, name, context, depth)
    ),
  "array/reductions": ([list, initial, fn], name, context, depth) =>
    Effect.flatMap(
      Effect.all([listOf(list, name), functionOf(fn, name)]),
      ([items, f]) =>
        Effect.map(fold(items, initial as Sym, f, context, depth), (ways) =>
          ways.map(({ states, when }) => ({ sym: listSym(states), when }))
        )
    ),
};

/**
 * What a variable that `in` takes from a list of known length stands for:
 * one case for each item, told apart by a whole number the solver works
 * out, so that the cases never overlap, and asking about the variable
 * under `not` asks about the one item it is.
 */
export const members = (name: string, lists: Cases, context: Context) => {
  const index = `${name}#in`;
  context.sorts.set(index, "integer");
  const out: { when: Formula; sym: Sym }[] = [];
  for (const { sym, when } of lists) {
    const items = itemsOf(sym);
    if (items === undefined) {
      return unknownLength("in");
    }
    for (const [at, item] of items.entries()) {
      const pinned = and(when, [
        [
          {
            linear: minus(variable(index), constant(ratio(BigInt(at)))),
            relation: "=" as const,
          },
        ],
      ]);
      if (pinned.length > 0) {
        out.push({ sym: item, when: pinned });
      }
    }
  }
  return Effect.succeed(out as Cases);
};

/** Whether a sum is whole whenever its variables are: whole variables, whole coefficients. */
const integral = (linear: Linear, sorts: ReadonlyMap<string, Sort>) =>
  linear.constant.d === 1n &&
  [...linear.coefficients].every(
    ([name, c]) => c.d === 1n && sorts.get(name) === "integer"
  );

const comparison = (
  args: readonly Sym[],
  name: string,
  make: (a: Linear, b: Linear) => Formula
) =>
  Effect.map(
    Effect.all([
      linearOf(args[0] as Sym, name),
      linearOf(args[1] as Sym, name),
    ]),
    ([a, b]) => one(truthSym(make(a, b)))
  );

const extremum = (args: readonly Sym[], name: string, greatest: boolean) =>
  Effect.map(
    Effect.forEach(args, (arg) => linearOf(arg, name)),
    (sums): Cases =>
      sums.map((chosen, at) => ({
        sym: numberSym(chosen),
        when: [
          sums.flatMap((other, index): Constraint[] => {
            if (index === at) {
              return [];
            }
            // The chosen one wins every other, ties to the first.
            const ahead = greatest
              ? minus(chosen, other)
              : minus(other, chosen);
            return [{ linear: ahead, relation: index < at ? ">" : ">=" }];
          }),
        ],
      }))
  );

/**
 * Applies a function to symbolic values: a library function by what it
 * does to them, a lambda by its body, and any function to values that hold
 * no unknown by calling it.
 */
const applyFunction = (
  fn: unknown,
  args: readonly Sym[],
  context: Context,
  depth: number
): Result => {
  if (args.every(isConcrete)) {
    return Effect.map(
      call(fn, ...args.map(plainOf)) as Effect.Effect<unknown, Error>,
      (value) => one(fromValue(value))
    );
  }
  const info = lambdaInfo(fn);
  if (info !== undefined) {
    return inline(info, args, context, depth);
  }
  const keys = recordKeys(fn);
  if (keys !== undefined) {
    return Effect.succeed(
      one({
        fields: new Map(keys.map((key, at) => [key, args[at] as Sym])),
        kind: "record",
      })
    );
  }
  const name = nameOf(fn) ?? show(fn);
  if (name === "array/make") {
    return Effect.succeed(one({ items: args, kind: "list" }));
  }
  const rule = LIBRARY[name] ?? ARRAYS[name];
  const [least, most] = ARITIES[name] ?? [0, Number.POSITIVE_INFINITY];
  if (args.length < least || args.length > most) {
    // As plain code does, which then says so when the goal runs on values.
    return refused(`${name} with ${args.length} arguments`);
  }
  return rule === undefined ? refused(name) : rule(args, name, context, depth);
};

/** Each case of each argument, applied. */
const applyCases = (
  fn: unknown,
  args: readonly Cases[],
  context: Context,
  depth: number
): Result =>
  Effect.map(
    Effect.forEach(product(args), ({ syms, when }) =>
      Effect.map(applyCallable(fn, syms, context, depth), (cases) =>
        cases.flatMap((each) => {
          const both = and(when, each.when);
          return both.length === 0 ? [] : [{ sym: each.sym, when: both }];
        })
      )
    ),
    (all) => all.flat()
  );

/** Whether a lambda form's parameters hold a contract. */
const contracted = (parameters: unknown) =>
  Array.isArray(parameters) &&
  parameters.some((parameter) => typeof parameter !== "string");

/**
 * What a lambda's parameters stand for, given the arguments of a call: each
 * name its argument, or one name, written in place of the list, the list of
 * every argument.
 */
const bound = (parameters: unknown, args: readonly Sym[]): [string, Cases][] =>
  typeof parameters === "string"
    ? [[parameters, one(listSym(args))]]
    : (parameters as readonly string[]).map((name, at) => [
        name,
        one(args[at] ?? fromValue(null)),
      ]);

/** Runs a lambda's body on symbolic values. */
const inline = (
  info: LambdaInfo,
  args: readonly Sym[],
  context: Context,
  depth: number
): Result => {
  if (depth > MOST_DEPTH) {
    return refused("a function that calls itself");
  }
  if (Array.isArray(info.written)) {
    return refused("a lambda with a contract");
  }
  const scope = new Map<string, Cases>(
    bound(info.written ?? info.parameters, args)
  );
  return expression(info.body, scope, info.environment, context, depth + 1);
};

const isName = (
  text: string,
  scope: ReadonlyMap<string, Cases>,
  environment: Environment | undefined
) =>
  scope.has(text) ||
  (environment !== undefined && lookup(environment, text) !== UNBOUND);

/** Each case, held only where `when` holds too. */
const under = (when: Formula, cases: Cases): Cases =>
  cases.flatMap((each) => {
    const both = and(when, each.when);
    return both.length === 0 ? [] : [{ sym: each.sym, when: both }];
  });

interface Where {
  readonly context: Context;
  readonly depth: number;
  readonly environment: Environment | undefined;
  readonly guard: Formula;
  readonly scope: ReadonlyMap<string, Cases>;
}

const sortsForConstraints = (
  constraints: readonly Constraint[],
  sorts: ReadonlyMap<string, Sort>
) =>
  new Map(
    constraints
      .flatMap((c) => [...c.linear.coefficients.keys()])
      .map((name) => [name, sorts.get(name) ?? "real"] as const)
  );

/** Drops conjunctions whose linear constraints are unsatisfiable together. */
const pruneFormula = (formula: Formula, context: Context): Formula => {
  if (formula.length === 0) {
    return formula;
  }
  const kept: (readonly Constraint[])[] = [];
  for (const conj of formula) {
    if (conj.length <= 1) {
      kept.push(conj);
      continue;
    }
    const all = withDefinitions(conj, context.definitions);
    try {
      if (satisfiable(all, sortsForConstraints(all, context.sorts))) {
        kept.push(conj);
      }
    } catch (error) {
      if (error instanceof LogicError) {
        kept.push(conj);
      } else {
        throw error;
      }
    }
  }
  return kept;
};

const each = (parts: readonly unknown[], where: Where) =>
  Effect.forEach(parts, (part) => expressionAt(part, where));

/** A name: a parameter, a definition, a logic variable, or a string. */
const named = (code: string, where: Where): Result => {
  const held = where.scope.get(code);
  if (held !== undefined) {
    return Effect.succeed(held);
  }
  if (where.environment !== undefined) {
    const value = lookup(where.environment, code);
    if (value !== UNBOUND) {
      return Effect.succeed(one(fromValue(value)));
    }
  }
  if (isLogicVariableName(code)) {
    return term(new LogicVariable(code.slice(1)), where.context, where.depth);
  }
  return Effect.succeed(one(fromValue(code)));
};

const recordOf = (code: Record<string, unknown>, where: Where): Result =>
  Effect.map(each(Object.values(code), where), (parts) =>
    product(parts).map(({ syms, when }) => ({
      sym: {
        fields: new Map(
          Object.keys(code).map((key, at) => [key, syms[at] as Sym])
        ),
        kind: "record" as const,
      },
      when,
    }))
  );

/** A lambda called where it is written: its body, its parameters bound. */
const lambdaCall = (
  [, parameters, body]: [string, string[] | string, unknown],
  rest: readonly unknown[],
  where: Where
): Result =>
  Effect.flatMap(each(rest, where), (args) =>
    Effect.map(
      Effect.forEach(product(args), ({ syms, when }) =>
        Effect.map(
          expressionAt(body, {
            ...where,
            depth: where.depth + 1,
            guard: and(where.guard, when),
            scope: new Map([...where.scope, ...bound(parameters, syms)]),
          }),
          (cases) => under(when, cases)
        )
      ),
      (all) => all.flat()
    )
  );

/** A call of a function, whichever function each case of its head is. */
const callOf = (
  head: unknown,
  rest: readonly unknown[],
  where: Where
): Result =>
  Effect.flatMap(expressionAt(head, where), (heads) =>
    Effect.flatMap(each(rest, where), (args) =>
      Effect.map(
        Effect.forEach(heads, ({ sym, when }) => {
          const fn = callableOf(sym);
          return fn === undefined
            ? refused(`a call of ${show(head)}`)
            : Effect.map(
                applyCases(fn, args, where.context, where.depth),
                (cases) => under(when, cases)
              );
        }),
        (all) => all.flat()
      )
    )
  );

/** A lambda written where the solver runs: its body runs, when it is called, in the scope it was written in. */
const closureOf = (
  [parameters, body]: readonly unknown[],
  where: Where
): Sym => ({
  apply: (args, depth) =>
    expressionAt(body, {
      ...where,
      depth,
      scope: new Map([...where.scope, ...bound(parameters, args)]),
    }),
  kind: "closure",
});

/** Equality inside a lambda body, as `=` works in a goal. */
const equalityExpr = (
  [first, second]: readonly unknown[],
  where: Where
): Result =>
  Effect.map(
    Effect.all([expressionAt(first, where), expressionAt(second, where)]),
    ([a, b]) =>
      one(
        truthSym(
          product([a, b]).reduce<Formula>(
            (sofar, { syms: [x, y], when }) =>
              or(
                sofar,
                and(when, equal(x as Sym, y as Sym, where.context.atoms))
              ),
            FALSE
          )
        )
      )
  );

/** Short-circuiting `and` inside a lambda body. */
const logicalAndExpr = (parts: readonly unknown[], where: Where): Result =>
  Effect.gen(function* () {
    let holds: Formula = TRUE;
    for (const part of parts) {
      const reachable = and(where.guard, holds);
      if (reachable.length === 0) {
        return one(truthSym(FALSE));
      }
      const next = yield* holdsWhere(part, { ...where, guard: reachable });
      holds = and(holds, next);
      if (holds.length === 0) {
        return one(truthSym(FALSE));
      }
    }
    return one(truthSym(holds));
  });

/** Short-circuiting `or` inside a lambda body. */
const logicalOrExpr = (parts: readonly unknown[], where: Where): Result =>
  Effect.gen(function* () {
    let holds: Formula = FALSE;
    for (const part of parts) {
      const remaining = and(where.guard, not(holds));
      if (remaining.length === 0) {
        return one(truthSym(holds));
      }
      const next = yield* holdsWhere(part, { ...where, guard: remaining });
      holds = or(holds, next);
      if (holds.some((conj) => conj.length === 0)) {
        return one(truthSym(TRUE));
      }
    }
    return one(truthSym(holds));
  });

/** Membership `in` inside a lambda body. */
const membershipExpr = (
  [element, list]: readonly unknown[],
  where: Where
): Result =>
  Effect.flatMap(
    Effect.all([expressionAt(element, where), expressionAt(list, where)]),
    ([elements, lists]) =>
      Effect.map(
        Effect.forEach(product([elements, lists]), ({ syms, when }) =>
          Effect.map(listOf(syms[1], "in"), (items) =>
            and(
              when,
              items.reduce<Formula>(
                (f, item) =>
                  or(f, equal(syms[0] as Sym, item, where.context.atoms)),
                FALSE
              )
            )
          )
        ),
        (fs) => one(truthSym(fs.reduce(or, FALSE)))
      )
  );

/** Sequential `begin` with local `define` bindings inside a lambda body. */
const sequenceExpr = (parts: readonly unknown[], where: Where): Result =>
  Effect.gen(function* () {
    if (parts.length === 0) {
      return one(fromValue([]));
    }
    const scope = new Map(where.scope);
    const local: Where = { ...where, scope };
    let last: Cases = one(fromValue([]));
    for (const part of parts) {
      if (
        Array.isArray(part) &&
        part[0] === "define" &&
        !isName("define", scope, where.environment) &&
        typeof part[1] === "string" &&
        part.length === 3
      ) {
        const value = yield* expressionAt(part[2], local);
        scope.set(part[1], value);
        last = value;
      } else {
        last = yield* expressionAt(part, local);
      }
    }
    return last;
  });

/** Whether `sym` fits a schema expression evaluated inside a lambda (`match`). */
const fitsMatchSchema = (
  sym: Sym,
  schemaCases: Cases,
  where: Where
): Effect.Effect<Formula, Error> =>
  Effect.gen(function* () {
    let formula: Formula = FALSE;
    for (const { sym: schemaSym, when } of schemaCases) {
      let fit: Formula;
      if (isConcrete(schemaSym)) {
        fit = yield* fitsOf(
          sym,
          plainOf(schemaSym),
          where.context,
          where.depth
        );
      } else if (schemaSym.kind === "closure") {
        fit = yield* Effect.flatMap(
          applyCallable(schemaSym, [sym], where.context, where.depth),
          formulaOf
        );
      } else if (
        schemaSym.kind === "number" ||
        schemaSym.kind === "truth" ||
        schemaSym.kind === "value"
      ) {
        fit = equal(sym, schemaSym, where.context.atoms);
      } else {
        return yield* refused("a schema made from a value no goal binds");
      }
      formula = or(formula, and(when, fit));
    }
    return formula;
  });

const applyMatchHandler = (
  fnExpr: unknown,
  sym: Sym,
  when: Formula,
  guard: Formula,
  where: Where
): Result =>
  Effect.gen(function* () {
    const handlers = yield* expressionAt(fnExpr, { ...where, guard });
    const out: { when: Formula; sym: Sym }[] = [];
    for (const { sym: fnSym, when: fnWhen } of handlers) {
      const fn = callableOf(fnSym);
      if (fn === undefined) {
        return yield* refused(`a call of ${show(fnExpr)}`);
      }
      const applied = yield* applyCallable(
        fn,
        [sym],
        where.context,
        where.depth
      );
      out.push(...under(and(when, fnWhen), applied));
    }
    return out;
  });

const matchSubject = (
  sym: Sym,
  when: Formula,
  clauses: readonly (readonly [unknown, unknown])[],
  fallback: { readonly has: boolean; readonly expr: unknown },
  where: Where
): Result =>
  Effect.gen(function* () {
    const out: { when: Formula; sym: Sym }[] = [];
    let before = when;
    for (const [schemaExpr, fnExpr] of clauses) {
      const schemaCases = yield* expressionAt(schemaExpr, where);
      const fits = yield* fitsMatchSchema(sym, schemaCases, where);
      const here = and(before, fits);
      const reachable =
        where.depth > 1
          ? pruneFormula(and(where.guard, here), where.context)
          : and(where.guard, here);
      if (reachable.length > 0) {
        out.push(
          ...(yield* applyMatchHandler(fnExpr, sym, here, reachable, where))
        );
      }
      before = and(before, not(fits));
      if (before.length === 0) {
        return out;
      }
    }
    const remaining = pruneFormula(and(where.guard, before), where.context);
    if (remaining.length === 0) {
      return out;
    }
    if (!fallback.has) {
      return yield* refused("match");
    }
    out.push(
      ...(yield* applyMatchHandler(
        fallback.expr,
        sym,
        before,
        remaining,
        where
      ))
    );
    return out;
  });

/** Pattern `match` inside a lambda body. */
const matchExpr = (parts: readonly unknown[], where: Where): Result =>
  Effect.gen(function* () {
    if (parts.length < 2) {
      return yield* refused("match");
    }
    const [subjectExpr, ...rest] = parts;
    const last = rest.at(-1);
    const hasFallback = !isMatchCase(last);
    const clauses = (hasFallback ? rest.slice(0, -1) : rest) as readonly [
      unknown,
      unknown,
    ][];
    const subjects = yield* expressionAt(subjectExpr, where);
    const out: { when: Formula; sym: Sym }[] = [];
    for (const { sym, when } of subjects) {
      out.push(
        ...(yield* matchSubject(
          sym,
          when,
          clauses,
          { expr: last, has: hasFallback },
          where
        ))
      );
    }
    return out;
  });

const expressionAt = (code: unknown, where: Where): Result => {
  if (typeof code === "string") {
    return named(code, where);
  }
  if (isPlainObject(code)) {
    return recordOf(code, where);
  }
  if (!Array.isArray(code)) {
    return Effect.succeed(one(fromValue(code)));
  }
  if (code.length === 0) {
    return Effect.succeed(one(fromValue([])));
  }
  const [head, ...rest] = code as unknown[];
  if (Array.isArray(head) && head[0] === "lambda") {
    return contracted(head[1])
      ? refused("a lambda with a contract")
      : lambdaCall(head as [string, string[] | string, unknown], rest, where);
  }
  const special =
    typeof head === "string" && !isName(head, where.scope, where.environment);
  if (!special) {
    return callOf(head, rest, where);
  }
  switch (head) {
    case "quote":
      return Effect.succeed(one(fromValue(rest[0])));
    case "cond":
      return conditional(rest, where);
    case "match":
      return matchExpr(rest, where);
    case "begin":
      return sequenceExpr(rest, where);
    case "=":
      return equalityExpr(rest, where);
    case "and":
      return logicalAndExpr(rest, where);
    case "or":
      return logicalOrExpr(rest, where);
    case "not":
      return Effect.map(holdsWhere(rest[0], where), (f) =>
        one(truthSym(not(f)))
      );
    case "in":
      return membershipExpr(rest, where);
    case "lambda":
      return contracted(rest[0])
        ? refused("a lambda with a contract")
        : Effect.succeed(one(closureOf(rest, where)));
    default:
      return head.includes("/")
        ? callOf(head, rest, where)
        : refused(`the form ${show(head)}`);
  }
};

/** The cases of an expression of Lion code, run on symbolic values. */
const expression = (
  code: unknown,
  scope: ReadonlyMap<string, Cases>,
  environment: Environment | undefined,
  context: Context,
  depth: number
): Result =>
  expressionAt(code, { context, depth, environment, guard: TRUE, scope });

/** Where a `cond` test holds: the cases in which it is true. */
const holdsWhere = (test: unknown, where: Where) =>
  Effect.gen(function* () {
    let holds: Formula = FALSE;
    for (const { sym, when } of yield* expressionAt(test, where)) {
      holds = or(holds, and(when, yield* truthOf(sym, test)));
    }
    return holds;
  });

/** A `cond`: each case under its test, and that no earlier test held. */
const conditional = (clauses: readonly unknown[], where: Where): Result =>
  Effect.gen(function* () {
    let before: Formula = TRUE;
    const out: { when: Formula; sym: Sym }[] = [];
    for (const clause of clauses) {
      const [test, result] = clause as [unknown, unknown];
      const otherwise =
        test === "else" && !isName("else", where.scope, where.environment);
      const holds = otherwise ? TRUE : yield* holdsWhere(test, where);
      const here = and(before, holds);
      const reachable =
        where.depth > 1
          ? pruneFormula(and(where.guard, here), where.context)
          : and(where.guard, here);
      if (reachable.length > 0) {
        out.push(
          ...under(
            here,
            yield* expressionAt(result, { ...where, guard: reachable })
          )
        );
      }
      before = and(before, not(holds));
      if (
        before.length === 0 ||
        and(where.guard, before).length === 0 ||
        otherwise
      ) {
        return out;
      }
    }
    return [...out, { sym: fromValue(null), when: before }];
  });

/** Whether a term needs the value of a variable the solver reasons about. */
const mentions = (value: unknown, context: Context) =>
  value instanceof LogicVariable
    ? context.symbols.has(value.name)
    : value instanceof LogicValue &&
      value.variables.some((name) => context.symbols.has(name));

/** The cases of a term of the engine: a goal, a call that waits, or a value. */
export const term = (value: unknown, context: Context, depth = 0): Result => {
  if (!(value instanceof LogicValue)) {
    return Effect.succeed(one(fromValue(value)));
  }
  if (value instanceof LogicVariable) {
    const held = context.symbols.get(value.name);
    return held === undefined
      ? Effect.map(context.evaluate(value), (v) => one(fromValue(v)))
      : Effect.succeed(held);
  }
  if (!value.variables.some((name) => context.symbols.has(name))) {
    return Effect.map(context.evaluate(value), (v) => one(fromValue(v)));
  }
  if (value instanceof Atom) {
    return refused(`the relation goal ${show(value)}`);
  }
  if (value instanceof DeferredCall) {
    if (isListTerm(value)) {
      return Effect.map(
        Effect.forEach(value.args, (arg) => term(arg, context, depth)),
        (parts) =>
          product(parts).map(({ syms, when }) => ({
            sym: { items: syms, kind: "list" as const },
            when,
          }))
      );
    }
    if (mentions(value.fn, context)) {
      return Effect.flatMap(term(value.fn, context, depth), (fns) =>
        fns.some(({ sym }) => callableOf(sym) === undefined)
          ? unboundFunction("a call")
          : Effect.flatMap(
              Effect.forEach(value.args, (arg) => term(arg, context, depth)),
              (args) =>
                Effect.map(
                  Effect.forEach(fns, ({ sym, when }) =>
                    Effect.map(
                      applyCases(callableOf(sym), args, context, depth),
                      (cases) => under(when, cases)
                    )
                  ),
                  (all) => all.flat()
                )
            )
      );
    }
    return Effect.flatMap(
      Effect.forEach(value.args, (arg) => term(arg, context, depth)),
      (args) =>
        Effect.flatMap(
          value.fn instanceof LogicValue
            ? context.evaluate(value.fn)
            : Effect.succeed(value.fn),
          (fn) => applyCases(fn, args, context, depth)
        )
    );
  }
  return goal(value as LogicForm, context, depth);
};

/** The formula a goal holds under, as one truth. */
const goal = (form: LogicForm, context: Context, depth: number): Result => {
  const [first, second] = form.parts;
  const truths = (parts: readonly unknown[]) =>
    Effect.forEach(parts, (part) =>
      Effect.flatMap(term(part, context, depth), formulaOf)
    );
  switch (form.form) {
    case "=":
      return Effect.map(
        Effect.all([term(first, context, depth), term(second, context, depth)]),
        ([a, b]) =>
          one(
            truthSym(
              product([a, b]).reduce<Formula>(
                (sofar, { syms: [x, y], when }) =>
                  or(sofar, and(when, equal(x as Sym, y as Sym))),
                FALSE
              )
            )
          )
      );
    case "not":
      return Effect.map(truths([first]), ([f]) =>
        one(truthSym(not(f as Formula)))
      );
    case "and":
      return Effect.map(truths(form.parts), (fs) =>
        one(truthSym(fs.reduce(and, TRUE)))
      );
    case "or":
      return Effect.map(truths(form.parts), (fs) =>
        one(truthSym(fs.reduce(or, FALSE)))
      );
    case "in":
      return Effect.flatMap(
        Effect.all([term(first, context, depth), term(second, context, depth)]),
        ([elements, lists]) =>
          Effect.map(
            Effect.forEach(product([elements, lists]), ({ syms, when }) =>
              Effect.map(listOf(syms[1], "in"), (items) =>
                and(
                  when,
                  items.reduce<Formula>(
                    (f, item) => or(f, equal(syms[0] as Sym, item)),
                    FALSE
                  )
                )
              )
            ),
            (fs) => one(truthSym(fs.reduce(or, FALSE)))
          )
      );
    case "schema/fits?":
      if (mentions(second, context)) {
        return refused("a schema made from a value no goal binds");
      }
      return Effect.flatMap(term(first, context, depth), (values) =>
        Effect.flatMap(context.evaluate(second), (schema) =>
          Effect.map(
            Effect.forEach(values, ({ sym, when }) =>
              Effect.map(fitsOf(sym, schema, context, depth), (f) =>
                and(when, f)
              )
            ),
            (fs) => one(truthSym(fs.reduce(or, FALSE)))
          )
        )
      );
    default:
      return refused(`the form ${form.form}`);
  }
};

/** The formula under which the cases of a truth hold. */
export const formulaOf = (cases: Cases) =>
  Effect.gen(function* () {
    let formula: Formula = FALSE;
    for (const { sym, when } of cases) {
      formula = or(formula, and(when, yield* truthOf(sym, "a goal")));
    }
    return formula;
  });

type Fit = Effect.Effect<Formula, Error>;

/** That each value fits its schema. */
const allFit = (
  pairs: readonly (readonly [Sym, unknown])[],
  context: Context,
  depth: number
): Fit =>
  Effect.gen(function* () {
    let f: Formula = TRUE;
    for (const [sym, schema] of pairs) {
      f = and(f, yield* fitsOf(sym, schema, context, depth));
    }
    return f;
  });

/** That a value fits one of the schemas. */
const anyFit = (
  sym: Sym,
  schemas: readonly unknown[],
  context: Context,
  depth: number
): Fit =>
  Effect.gen(function* () {
    let f: Formula = FALSE;
    for (const schema of schemas) {
      f = or(f, yield* fitsOf(sym, schema, context, depth));
    }
    return f;
  });

const fitsInteger = (sym: Sym, context: Context): Fit => {
  if (sym.kind !== "number") {
    return Effect.succeed(FALSE);
  }
  if (integral(sym.linear, context.sorts)) {
    return Effect.succeed(TRUE);
  }
  const q = floorLinear(sym.linear, context);
  return Effect.succeed(atom({ linear: minus(sym.linear, q), relation: "=" }));
};

/** Whether `sub` is included in `sup`, using the context's recursive inclusion check. */
const subschema = (
  sub: unknown,
  sup: unknown,
  context: Context
): Effect.Effect<boolean, Error> =>
  context.checkIncludes === undefined
    ? refused("a schema")
    : context.checkIncludes(sub, sup);

/** Whether `schema` allows at least one value (`!(schema <= EMPTY)`). */
const isInhabited = (
  schema: unknown,
  context: Context
): Effect.Effect<boolean, Error> =>
  schema === ANY_REST_SCHEMA
    ? Effect.succeed(true)
    : Effect.map(subschema(schema, EMPTY_SCHEMA, context), (empty) => !empty);

const OPAQUE_PREDICATES: Readonly<Record<string, string>> = {
  "value/function?": "function",
  "value/promise?": "promise",
  "value/string?": "string",
  "value/symbol?": "symbol",
  "value/unknown?": "unknown",
};

const fitsOpaque = (sym: Sym, want: string): Fit =>
  Effect.succeed(
    (sym.kind === "opaque" && sym.of === want) ||
      (sym.kind === "closure" && want === "function") ||
      (sym.kind === "value" && opaqueKindOf(sym.value) === want)
      ? TRUE
      : FALSE
  );

const VALUE_PREDICATES: Readonly<
  Record<string, (sym: Sym, context: Context) => Fit>
> = {
  "value/any?": () => Effect.succeed(TRUE),
  "value/array?": (sym) =>
    Effect.succeed(
      sym.kind === "list" || (sym.kind === "value" && Array.isArray(sym.value))
        ? TRUE
        : FALSE
    ),
  "value/integer?": fitsInteger,
  "value/number?": (sym) =>
    Effect.succeed(sym.kind === "number" ? TRUE : FALSE),
  "value/object?": (sym) =>
    Effect.succeed(
      sym.kind === "record" ||
        (sym.kind === "value" && isPlainObject(sym.value))
        ? TRUE
        : FALSE
    ),
  "value/undefined?": (sym) =>
    Effect.succeed(
      sym.kind === "value" && sym.value === undefined ? TRUE : FALSE
    ),
};

/** That a value fits a schema that is a function: a predicate or a built schema. */
const fitsFunction = (
  sym: Sym,
  shape: unknown,
  context: Context,
  depth: number
): Fit => {
  const allowed = allowedBy(shape);
  if (allowed !== undefined) {
    return Effect.succeed(
      allowed.reduce<Formula>(
        (f, v) => or(f, equal(sym, fromValue(v), context.atoms)),
        FALSE
      )
    );
  }
  const fnName = nameOf(shape);
  if (fnName !== undefined) {
    const direct = VALUE_PREDICATES[fnName];
    if (direct !== undefined) {
      return direct(sym, context);
    }
    const want = OPAQUE_PREDICATES[fnName];
    if (want !== undefined) {
      return fitsOpaque(sym, want);
    }
  }
  const built = buildOf(shape);
  if (built !== undefined) {
    return fitsBuilt(sym, nameOf(built.by), built.args, context, depth);
  }
  // Any other predicate is run on the value.
  return Effect.flatMap(applyFunction(shape, [sym], context, depth), formulaOf);
};

/** The formula that a symbolic value fits a schema. */
export const fitsOf = (
  sym: Sym,
  schema: unknown,
  context: Context,
  depth: number
): Fit => {
  if (schema === ANY_REST_SCHEMA) {
    return Effect.succeed(TRUE);
  }
  if (schema === EMPTY_SCHEMA) {
    return Effect.succeed(FALSE);
  }
  if (isConcrete(sym)) {
    const fit = fits(schema, plainOf(sym)) as unknown as Effect.Effect<
      unknown,
      Error
    >;
    return Effect.map(fit, (holds) => (holds === true ? TRUE : FALSE));
  }
  const shape = throughNames(schema);
  if (typeof shape === "function") {
    return fitsFunction(sym, shape, context, depth);
  }
  if (isPlainObject(shape)) {
    if (sym.kind === "record" && sym.rest !== undefined) {
      return fitsRecordWithRest(
        sym.fields,
        sym.rest,
        Object.entries(shape),
        undefined,
        context,
        depth
      );
    }
    const fields = fieldsOf(sym);
    return fields === undefined
      ? Effect.succeed(FALSE)
      : fitsRecord(fields, Object.entries(shape), undefined, context, depth);
  }
  if (Array.isArray(shape)) {
    if (sym.kind === "list" && sym.rest !== undefined) {
      return Effect.flatMap(isInhabited(sym.rest, context), (alive) =>
        alive || sym.items.length !== shape.length
          ? Effect.succeed(FALSE)
          : allFit(
              shape.map((part, at) => [sym.items[at] as Sym, part] as const),
              context,
              depth
            )
      );
    }
    const items = itemsOf(sym);
    return items === undefined || items.length !== shape.length
      ? Effect.succeed(FALSE)
      : allFit(
          shape.map((part, at) => [items[at] as Sym, part] as const),
          context,
          depth
        );
  }
  return Effect.succeed(equal(sym, fromValue(shape), context.atoms));
};

/** The schema inside a schema/optional; undefined for any other schema. */
const optionalOf = (part: unknown) => {
  const built = buildOf(throughNames(part));
  return built !== undefined && nameOf(built.by) === "schema/optional"
    ? built.args[0]
    : undefined;
};

const fitsRecordWithRest = (
  fields: ReadonlyMap<string, Sym>,
  symRest: unknown,
  named: readonly (readonly [string, unknown])[],
  outerRest: unknown,
  context: Context,
  depth: number
): Fit =>
  Effect.gen(function* () {
    const alive = yield* isInhabited(symRest, context);
    if (!alive) {
      return yield* fitsRecord(fields, named, outerRest, context, depth);
    }
    if (outerRest === undefined) {
      return FALSE;
    }
    const pairs: (readonly [Sym, unknown])[] = [];
    for (const [key, part] of named) {
      const inner = optionalOf(part);
      const field = fields.get(key);
      if (field !== undefined) {
        pairs.push([field, inner ?? part]);
      } else if (inner === undefined) {
        return FALSE;
      } else if (!(yield* subschema(symRest, inner, context))) {
        return FALSE;
      }
    }
    if (outerRest !== ANY_REST) {
      const others = [...fields.keys()].filter(
        (key) => !named.some(([k]) => k === key)
      );
      const left: Sym = {
        fields: new Map(others.map((key) => [key, fields.get(key) as Sym])),
        kind: "record",
        rest: symRest,
      };
      pairs.push([left, outerRest]);
    }
    return yield* allFit(pairs, context, depth);
  });

const fitsRecord = (
  fields: ReadonlyMap<string, Sym>,
  named: readonly (readonly [string, unknown])[],
  rest: unknown,
  context: Context,
  depth: number
): Fit => {
  const pairs: (readonly [Sym, unknown])[] = [];
  for (const [key, part] of named) {
    const inner = optionalOf(part);
    const field = fields.get(key);
    if (field !== undefined) {
      pairs.push([field, inner ?? part]);
    } else if (inner === undefined) {
      return Effect.succeed(FALSE);
    }
  }
  const others = [...fields.keys()].filter(
    (key) => !named.some(([k]) => k === key)
  );
  if (rest === undefined && others.length > 0) {
    return Effect.succeed(FALSE);
  }
  if (rest !== undefined && rest !== ANY_REST) {
    const left: Sym = {
      fields: new Map(others.map((key) => [key, fields.get(key) as Sym])),
      kind: "record",
    };
    pairs.push([left, rest]);
  }
  return allFit(pairs, context, depth);
};

const ANY_REST = Symbol("any rest");

const fitsOpen = (
  sym: Sym,
  [shape, ...rest]: readonly unknown[],
  context: Context,
  depth: number
): Fit => {
  const items = throughNames(shape);
  if (!Array.isArray(items)) {
    if (!isPlainObject(items)) {
      return Effect.succeed(FALSE);
    }
    const outerRest = rest.length === 0 ? ANY_REST : rest[0];
    if (sym.kind === "record" && sym.rest !== undefined) {
      return fitsRecordWithRest(
        sym.fields,
        sym.rest,
        Object.entries(items),
        outerRest,
        context,
        depth
      );
    }
    const fields = fieldsOf(sym);
    return fields === undefined
      ? Effect.succeed(FALSE)
      : fitsRecord(fields, Object.entries(items), outerRest, context, depth);
  }
  if (sym.kind === "list" && sym.rest !== undefined) {
    if (sym.items.length < items.length) {
      return Effect.succeed(FALSE);
    }
    const pairs: (readonly [Sym, unknown])[] = items.map(
      (part, at) => [sym.items[at] as Sym, part] as const
    );
    if (rest.length > 0) {
      pairs.push([
        {
          items: sym.items.slice(items.length),
          kind: "list",
          rest: sym.rest,
        },
        rest[0],
      ]);
    }
    return allFit(pairs, context, depth);
  }
  const list = itemsOf(sym);
  if (list === undefined || list.length < items.length) {
    return Effect.succeed(FALSE);
  }
  const pairs: (readonly [Sym, unknown])[] = items.map(
    (part, at) => [list[at] as Sym, part] as const
  );
  if (rest.length > 0) {
    pairs.push([{ items: list.slice(items.length), kind: "list" }, rest[0]]);
  }
  return allFit(pairs, context, depth);
};

const fitsBuilt = (
  sym: Sym,
  name: string | undefined,
  args: readonly unknown[],
  context: Context,
  depth: number
): Fit => {
  switch (name) {
    case "schema/anyOf":
      return anyFit(sym, args, context, depth);
    case "schema/allOf":
      return allFit(
        args.map((part) => [sym, part] as const),
        context,
        depth
      );
    case "schema/optional":
      return fitsOf(sym, args[0], context, depth);
    case "schema/arrayOf": {
      const most = args[1] as number | undefined;
      if (sym.kind === "list" && sym.rest !== undefined) {
        const symRest = sym.rest;
        return Effect.gen(function* () {
          const alive = yield* isInhabited(symRest, context);
          if (most !== undefined && (sym.items.length > most || alive)) {
            return FALSE;
          }
          if (alive && !(yield* subschema(symRest, args[0], context))) {
            return FALSE;
          }
          return yield* allFit(
            sym.items.map((item) => [item, args[0]] as const),
            context,
            depth
          );
        });
      }
      const items = itemsOf(sym);
      return items === undefined || (most !== undefined && items.length > most)
        ? Effect.succeed(FALSE)
        : allFit(
            items.map((item) => [item, args[0]] as const),
            context,
            depth
          );
    }
    case "schema/recordOf": {
      if (sym.kind === "record" && sym.rest !== undefined) {
        const symRest = sym.rest;
        return Effect.gen(function* () {
          const alive = yield* isInhabited(symRest, context);
          if (alive && !(yield* subschema(symRest, args[0], context))) {
            return FALSE;
          }
          return yield* allFit(
            [...sym.fields.values()].map((field) => [field, args[0]] as const),
            context,
            depth
          );
        });
      }
      const fields = fieldsOf(sym);
      return fields === undefined
        ? Effect.succeed(FALSE)
        : allFit(
            [...fields.values()].map((field) => [field, args[0]] as const),
            context,
            depth
          );
    }
    case "schema/open":
      return fitsOpen(sym, args, context, depth);
    default:
      return refused(name ?? "a schema");
  }
};

/** What a variable a schema types stands for: its cases, the checks its schema adds, and the sorts of its numbers. */
export const shapeFor = (
  name: string,
  schema: unknown,
  context: Context
): Effect.Effect<{ cases: Cases; sorts: ReadonlyMap<string, Sort> }, Error> =>
  Effect.gen(function* () {
    const sorts = new Map<string, Sort>();
    const shaped = shapeOf(
      schema,
      name,
      sorts,
      new Set(),
      context.broad ?? false
    );
    if (shaped instanceof Shapeless) {
      return yield* logicError(
        `?${name} is a value no goal binds, and its schema cannot stand for it: ${shaped.why}.`
      );
    }
    for (const [solverName, sort] of sorts) {
      context.sorts.set(solverName, sort);
    }
    // Each value the shape stands for must still fit the schema, which
    // keeps what allOf and predicates in it say.
    const cases: { when: Formula; sym: Sym }[] = [];
    for (const each of shaped.cases) {
      const fits = yield* fitsOf(each.sym, schema, context, 0);
      const when = and(each.when, fits);
      if (when.length > 0) {
        cases.push({ sym: each.sym, when });
      }
    }
    return { cases, sorts };
  });

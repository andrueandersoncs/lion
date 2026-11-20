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
import { KeyNotFoundError, logicError } from "@/errors/evaluation";
import { type Environment, lookup, UNBOUND } from "@/evaluation/environment";
import { call } from "@/evaluation/special-forms/function";
import { fits } from "@/logic/fit";
import {
  type Constraint,
  constant,
  divide,
  isZero,
  type Linear,
  minus,
  multiply,
  negate,
  ONE,
  plus,
  ratio,
  type Sort,
  times,
  variable,
  ZERO,
} from "@/logic/solver";
import {
  and,
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

/** The context a goal is worked out in. */
export interface Context {
  /** The value of a term with no symbolic variable in it, for this answer. */
  readonly evaluate: (term: unknown) => Effect.Effect<unknown, Error>;
  /** Whether each of the solver's variables is a whole number or any number. */
  readonly sorts: Map<string, Sort>;
  /** What each symbolic variable stands for. */
  readonly symbols: ReadonlyMap<string, Cases>;
}

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
  return logicError(
    `A condition must be true or false, but ${show(what)} is ${sym.kind === "value" ? show(sym.value) : `a ${sym.kind}`}.`
  );
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
  (a: Linear, b: Linear): Formula => [
    [{ linear: flip ? minus(b, a) : minus(a, b), relation }],
  ];

const ANY = Number.POSITIVE_INFINITY;

/**
 * How many arguments each function the solver runs takes, as the library
 * says: a call with any other number is not run on symbolic values.
 */
const ARITIES: Readonly<Record<string, readonly [number, number]>> = {
  "array/concat": [1, ANY],
  "array/every?": [2, 2],
  "array/flat-map": [2, 2],
  "array/head": [1, 1],
  "array/includes?": [2, 2],
  "array/length": [1, 1],
  "array/map": [2, 2],
  "array/reduce": [3, 3],
  "array/reductions": [3, 3],
  "array/some?": [2, 2],
  "array/tail": [1, 1],
  "boolean/and": [2, 2],
  "boolean/not": [1, 1],
  "boolean/or": [2, 2],
  "number/absolute": [1, 1],
  "number/add": [1, ANY],
  "number/divide": [2, 2],
  "number/equals?": [2, 2],
  "number/greaterThan": [2, 2],
  "number/greaterThanOrEqualTo": [2, 2],
  "number/lessThan": [2, 2],
  "number/lessThanOrEqualTo": [2, 2],
  "number/max": [1, ANY],
  "number/min": [1, ANY],
  "number/multiply": [1, ANY],
  "number/subtract": [2, 2],
  "object/get": [2, 3],
  "object/has?": [2, 2],
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
          ? logicError(`${name} by zero has no number for its result.`)
          : Effect.succeed(
              one(numberSym(times(a as Linear, divide(ONE, b.constant))))
            );
      }
    ),
  "number/absolute": (args, name) =>
    Effect.map(linearOf(args[0] as Sym, name), (x) => [
      { sym: numberSym(x), when: [[{ linear: x, relation: ">=" }]] },
      {
        sym: numberSym(times(x, negate(ONE))),
        when: [[{ linear: times(x, negate(ONE)), relation: ">" }]],
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
  "value/number?": (args) =>
    Effect.succeed(one(truthSym(args[0]?.kind === "number" ? TRUE : FALSE))),
  "value/integer?": (args, name, context) => {
    const [arg] = args;
    if (arg?.kind !== "number") {
      return Effect.succeed(one(truthSym(FALSE)));
    }
    return integral(arg.linear, context.sorts)
      ? Effect.succeed(one(truthSym(TRUE)))
      : refused(name);
  },
};

/** The items of a list, or a refusal when the value is not one of known length. */
const listOf = (sym: Sym | undefined, name: string) => {
  const items = sym === undefined ? undefined : itemsOf(sym);
  return items === undefined
    ? refused(`${name} of a list whose length the solver does not know`)
    : Effect.succeed(items);
};

/** A function a library call is given: a known one, or a lambda the solver runs. */
const functionOf = (sym: Sym | undefined, name: string) => {
  if (sym?.kind === "closure") {
    return Effect.succeed<unknown>(sym);
  }
  return sym?.kind === "value" && typeof sym.value === "function"
    ? Effect.succeed<unknown>(sym.value)
    : refused(`${name} of a function no goal binds`);
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
    Effect.map(listOf(list, name), (items) => one(items[0] ?? fromValue(null))),
  "array/tail": ([list], name) =>
    Effect.map(listOf(list, name), (items) => one(listSym(items.slice(1)))),
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
      return refused("in over a list whose length the solver does not know");
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
  const scope = new Map<string, Cases>(
    info.parameters.map((name, at) => [name, one(args[at] ?? fromValue(null))])
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
  readonly scope: ReadonlyMap<string, Cases>;
}

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
  [, parameters, body]: [string, string[], unknown],
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
            scope: new Map([
              ...where.scope,
              ...parameters.map((p, at): [string, Cases] => [
                p,
                one(syms[at] as Sym),
              ]),
            ]),
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
      scope: new Map([
        ...where.scope,
        ...(parameters as readonly string[]).map(
          (name, at): [string, Cases] => [
            name,
            one(args[at] ?? fromValue(null)),
          ]
        ),
      ]),
    }),
  kind: "closure",
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
  const [head, ...rest] = code as unknown[];
  if (Array.isArray(head) && head[0] === "lambda") {
    return lambdaCall(head as [string, string[], unknown], rest, where);
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
    case "lambda":
      return Effect.succeed(one(closureOf(rest, where)));
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
): Result => expressionAt(code, { context, depth, environment, scope });

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
      if (here.length > 0) {
        out.push(...under(here, yield* expressionAt(result, where)));
      }
      before = and(before, not(holds));
      if (before.length === 0 || otherwise) {
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
      return refused("a call of a function made from a value no goal binds");
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
  return integral(sym.linear, context.sorts)
    ? Effect.succeed(TRUE)
    : refused("value/integer?");
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
      allowed.reduce<Formula>((f, v) => or(f, equal(sym, fromValue(v))), FALSE)
    );
  }
  switch (nameOf(shape)) {
    case "value/number?":
      return Effect.succeed(sym.kind === "number" ? TRUE : FALSE);
    case "value/integer?":
      return fitsInteger(sym, context);
    case "value/any?":
      return Effect.succeed(TRUE);
    default:
      break;
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
    const fields = fieldsOf(sym);
    return fields === undefined
      ? Effect.succeed(FALSE)
      : fitsRecord(fields, Object.entries(shape), undefined, context, depth);
  }
  if (Array.isArray(shape)) {
    const items = itemsOf(sym);
    return items === undefined || items.length !== shape.length
      ? Effect.succeed(FALSE)
      : allFit(
          shape.map((part, at) => [items[at] as Sym, part] as const),
          context,
          depth
        );
  }
  return Effect.succeed(equal(sym, fromValue(shape)));
};

/** The schema inside a schema/optional; undefined for any other schema. */
const optionalOf = (part: unknown) => {
  const built = buildOf(throughNames(part));
  return built !== undefined && nameOf(built.by) === "schema/optional"
    ? built.args[0]
    : undefined;
};

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
    const fields = fieldsOf(sym);
    return fields === undefined || !isPlainObject(items)
      ? Effect.succeed(FALSE)
      : fitsRecord(
          fields,
          Object.entries(items),
          rest.length === 0 ? ANY_REST : rest[0],
          context,
          depth
        );
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
      const items = itemsOf(sym);
      const most = args[1] as number | undefined;
      return items === undefined || (most !== undefined && items.length > most)
        ? Effect.succeed(FALSE)
        : allFit(
            items.map((item) => [item, args[0]] as const),
            context,
            depth
          );
    }
    case "schema/recordOf": {
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
    const shaped = shapeOf(schema, name, sorts, new Set());
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

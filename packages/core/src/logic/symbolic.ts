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
import { lambdaOf } from "@/evaluation/special-forms/lambda";
import { fits } from "@/logic/fit";
import {
  type NumberSym,
  numberSym,
  type PolyComparison,
  polyAdd,
  polyIntegral,
  polyPow,
  polyScale,
  polySub,
  polySubstitute,
  polyTryAdd,
  polyTryMul,
  polyTrySub,
  polyWithinLimits,
} from "@/logic/polynomial";
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
  compareNumbers,
  FALSE,
  type Formula,
  fieldsOf,
  fromValue,
  isConcrete,
  itemsOf,
  MOST_WAYS,
  not,
  one,
  opaqueKindOf,
  or,
  plainOf,
  polyFormula,
  product,
  quadraticFormula,
  Shapeless,
  type Sym,
  shapeOf,
  solverRefusedMessage,
  TRUE,
  throughNames,
  tooManyWays,
  truthSym,
  tryEqual,
} from "@/logic/symbols";
import {
  Atom,
  allowedBy,
  buildOf,
  compareValues,
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
  type SchemaInfo,
  schemaOf,
  show,
} from "@/logic/terms";
import { differentUnitsError, wrongUnitError } from "@/modules/quantity";
import {
  DIGITS,
  divide,
  floor as exactFloor,
  isZero,
  negate,
  ONE,
  type Rational,
  ratio,
  ZERO,
} from "@/numbers/exact";
import {
  isMatchCase,
  parameterNames,
  parameterSchemas,
} from "@/schemas/evaluation";

/** Sentinel schema that allows no values, used to test inhabitedness. */
export const EMPTY_SCHEMA = Symbol("empty schema");

/** Hooks used by the inductive prover during structural and numeric induction. */
export interface InductiveContext {
  /**
   * Intercepts a recursive call to a guarded lambda when its argument is an
   * inductive sub-value or a strictly smaller integer; returns a memoized
   * symbolic result, or undefined to fall through to normal inlining.
   */
  readonly call: (
    fn: unknown,
    info: LambdaInfo,
    args: readonly Sym[],
    context: Context,
    guard?: Formula
  ) => Effect.Effect<Cases | undefined, Error>;
  /**
   * Optional hook invoked when comparing two polynomials whose nonlinear terms
   * do not cancel: returns a linear formula (or TRUE) if an IH equation was
   * captured, or undefined to refuse.
   */
  readonly polyEqual?: (a: NumberSym, b: NumberSym) => Formula | undefined;
  /** Polynomial substitutions (`var -> poly`) learned from IH equalities. */
  readonly substitutions?: ReadonlyMap<string, NumberSym>;
}

/** The context a goal is worked out in. */
export interface Context {
  /** Maps concrete values of opaque kinds (such as strings) to unique integer ids. */
  readonly atoms?: Map<unknown, number>;
  /** True when deciding schema inclusion across broad shapes (opaque kinds, open/unbounded collections). */
  readonly broad?: boolean;
  /** Recursive schema inclusion check for open/unbounded/inductive schemas. */
  readonly checkIncludes?: (
    inner: unknown,
    outer: unknown,
    step?: number
  ) => Effect.Effect<boolean, Error>;
  /** Defining constraints of Skolem integer variables (such as floor), keyed by variable name. */
  readonly definitions: Map<string, readonly Constraint[]>;
  /** The value of a term with no symbolic variable in it, for this answer. */
  readonly evaluate: (term: unknown) => Effect.Effect<unknown, Error>;
  /** Memoizes floor(u) -> integer variable name for a canonical linear expression. */
  readonly floors: Map<string, string>;
  /** Current path guard (constraints known to hold where a call is evaluated). */
  guard?: Formula;
  /** Optional hooks active during inductive proofs. */
  readonly inductive?: InductiveContext;
  /** Whether each of the solver's variables is a whole number or any number. */
  readonly sorts: Map<string, Sort>;
  /** What each symbolic variable stands for. */
  readonly symbols: ReadonlyMap<string, Cases>;
}

const LEAF_PARTS = /[.#/]/;
const DIGIT_INDEX = /^\d+$/;

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

const refused = (what: string) => logicError(solverRefusedMessage(what));

const twoUnknowns = (op = "number/multiply") =>
  refused(`${op} of two unknowns`);

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

/** Applies any active IH polynomial substitutions to a symbolic number. */
const applySubstitutions = (sym: NumberSym, context: Context): NumberSym => {
  const subs = context.inductive?.substitutions;
  if (subs === undefined || subs.size === 0) {
    return sym;
  }
  let out = sym;
  for (const [name, replacement] of subs) {
    out = polySubstitute(out, name, replacement);
  }
  return out;
};

/** A symbolic number (linear or polynomial), or a refusal. */
const polyOf = (sym: Sym, what: string, context: Context) => {
  if (sym.kind === "number") {
    return Effect.succeed(applySubstitutions(sym, context));
  }
  const kind = sym.kind === "value" ? show(sym.value) : `a ${sym.kind}`;
  return refused(`${what} of ${kind}`);
};

/** A sum of numbers (purely linear), or a refusal. */
const linearOf = (sym: Sym, what: string, context?: Context) => {
  if (sym.kind === "number") {
    const resolved =
      context === undefined ? sym : applySubstitutions(sym, context);
    if (resolved.denominator !== undefined) {
      return refused(`${what} of a ratio`);
    }
    if (resolved.nonlinear !== undefined) {
      return twoUnknowns("number/multiply");
    }
    return Effect.succeed(resolved.linear);
  }
  const kind = sym.kind === "value" ? show(sym.value) : `a ${sym.kind}`;
  return refused(`${what} of ${kind}`);
};

const equalRecordSyms = (
  a: Sym,
  b: Sym,
  context: Context
): Effect.Effect<Formula, Error> =>
  Effect.gen(function* () {
    const [left, right] = [fieldsOf(a), fieldsOf(b)];
    if (
      left === undefined ||
      right === undefined ||
      left.size !== right.size ||
      ![...left.keys()].every((key) => right.has(key))
    ) {
      return FALSE;
    }
    let f: Formula = TRUE;
    for (const [key, field] of left) {
      f = and(f, yield* equalSym(field, right.get(key) as Sym, context));
    }
    return f;
  });

const equalListSyms = (
  a: Sym,
  b: Sym,
  context: Context
): Effect.Effect<Formula, Error> =>
  Effect.gen(function* () {
    const [left, right] = [itemsOf(a), itemsOf(b)];
    if (
      left === undefined ||
      right === undefined ||
      left.length !== right.length
    ) {
      return FALSE;
    }
    let f: Formula = TRUE;
    for (let at = 0; at < left.length; at += 1) {
      f = and(f, yield* equalSym(left[at] as Sym, right[at] as Sym, context));
    }
    return f;
  });

/** Equality between two symbolic values, cancelling matching nonlinear terms and solving univariate quadratics. */
const equalSym = (
  a: Sym,
  b: Sym,
  context: Context
): Effect.Effect<Formula, Error> => {
  if (a.kind === "number" && b.kind === "number") {
    const pa = applySubstitutions(a, context);
    const pb = applySubstitutions(b, context);
    if (pa.denominator !== undefined || pb.denominator !== undefined) {
      const f = compareNumbers(pa, pb, "=", context.sorts);
      return f === undefined ? twoUnknowns("number/divide") : Effect.succeed(f);
    }
    const diff = polySub(pa, pb);
    if (diff.nonlinear === undefined) {
      return Effect.succeed(atom({ linear: diff.linear, relation: "=" }));
    }
    const captured = context.inductive?.polyEqual?.(pa, pb);
    if (captured !== undefined) {
      return Effect.succeed(captured);
    }
    const quad = quadraticFormula(diff, "=", context.sorts);
    if (quad !== undefined) {
      return Effect.succeed(quad);
    }
    return twoUnknowns("number/multiply");
  }
  if (a.kind === "record" || b.kind === "record") {
    return equalRecordSyms(a, b, context);
  }
  if (a.kind === "list" || b.kind === "list") {
    return equalListSyms(a, b, context);
  }
  const f = tryEqual(a, b, context.atoms, context.sorts);
  return f === undefined ? twoUnknowns() : Effect.succeed(f);
};

const orEqualAny = (
  target: Sym,
  candidates: readonly Sym[],
  context: Context
): Effect.Effect<Formula, Error> =>
  Effect.map(
    Effect.forEach(candidates, (item) => equalSym(target, item, context)),
    (fs) => fs.reduce(or, FALSE)
  );

const comparePoly = (
  a: Sym,
  b: Sym,
  op: PolyComparison,
  name: string,
  context: Context
): Effect.Effect<Formula, Error> =>
  Effect.flatMap(
    Effect.all([polyOf(a, name, context), polyOf(b, name, context)]),
    ([pa, pb]) => {
      const f = compareNumbers(pa, pb, op, context.sorts);
      return f === undefined ? twoUnknowns(name) : Effect.succeed(f);
    }
  );

const ANY = Number.POSITIVE_INFINITY;

/**
 * How many arguments each function the solver runs takes, as the library
 * says: a call with any other number is not run on symbolic values.
 */
const ARITIES: Readonly<Record<string, readonly [number, number]>> = {
  "aggregate/argMax": [1, 1],
  "aggregate/argMin": [1, 1],
  "aggregate/collect": [1, 1],
  "aggregate/count": [1, 1],
  "aggregate/countUnique": [1, 1],
  "aggregate/max": [1, 1],
  "aggregate/mean": [1, 1],
  "aggregate/median": [1, 1],
  "aggregate/min": [1, 1],
  "aggregate/sum": [1, 1],
  "aggregate/union": [1, 1],
  "aggregate/unique": [1, 1],
  "array/at": [2, 3],
  "array/concat": [0, ANY],
  "array/every?": [2, 2],
  "array/filter": [2, 2],
  "array/find": [2, 3],
  "array/flat-map": [2, 2],
  "array/head": [1, 1],
  "array/includes?": [2, 2],
  "array/indexOf": [2, 2],
  "array/length": [1, 1],
  "array/map": [2, 2],
  "array/range": [2, 2],
  "array/reduce": [3, 3],
  "array/reductions": [3, 3],
  "array/reverse": [1, 1],
  "array/slice": [2, 3],
  "array/some?": [2, 2],
  "array/sort": [1, 2],
  "array/tail": [1, 1],
  "array/zip": [1, ANY],
  "boolean/and": [2, 2],
  "boolean/equals?": [2, 2],
  "boolean/nand": [2, 2],
  "boolean/nor": [2, 2],
  "boolean/not": [1, 1],
  "boolean/or": [2, 2],
  "boolean/xor": [2, 2],
  "func/partial": [1, ANY],
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
  "number/power": [2, 2],
  "number/remainder": [2, 2],
  "number/round": [1, 2],
  "number/subtract": [2, 2],
  "object/entries": [1, 1],
  "object/fromEntries": [1, 1],
  "object/get": [2, 3],
  "object/get-path": [2, 2],
  "object/has?": [2, 2],
  "object/keys": [1, 1],
  "object/merge": [0, ANY],
  "object/remove": [2, 2],
  "object/set": [3, 3],
  "object/values": [1, 1],
  "quantity/add": [0, ANY],
  "quantity/divide": [2, 2],
  "quantity/in": [2, 2],
  "quantity/multiply": [0, ANY],
  "quantity/power": [2, 2],
  "quantity/subtract": [2, 2],
  "schema/assert": [2, 2],
  "schema/fits?": [2, 2],
  "time/add": [3, 3],
  "time/diff": [2, 3],
  "time/fromParts": [3, 7],
  "value/any?": [1, 1],
  "value/array?": [1, 1],
  "value/boolean?": [1, 1],
  "value/compare": [2, 2],
  "value/equals?": [2, 2],
  "value/function?": [1, 1],
  "value/identity": [1, 1],
  "value/integer?": [1, 1],
  "value/null?": [1, 1],
  "value/number?": [1, 1],
  "value/object?": [1, 1],
  "value/promise?": [1, 1],
  "value/string?": [1, 1],
  "value/symbol?": [1, 1],
  "value/undefined?": [1, 1],
  "value/unknown?": [1, 1],
};

type LibraryFn = (
  args: readonly Sym[],
  name: string,
  context: Context,
  depth: number
) => Effect.Effect<Cases, Error>;

/** How a library function works on symbolic values, by its name. */
const LIBRARY: Readonly<Record<string, LibraryFn>> = {
  "number/add": (args, name, context) =>
    Effect.flatMap(
      Effect.forEach(args, (arg) => polyOf(arg, name, context)),
      (polys) => {
        let total: NumberSym = numberSym(constant(ZERO));
        for (const p of polys) {
          const next = polyTryAdd(total, p);
          if (next === undefined || !polyWithinLimits(next)) {
            return refused(`${name} of two unknowns`);
          }
          total = next;
        }
        return Effect.succeed(one(total));
      }
    ),
  "number/subtract": (args, name, context) =>
    Effect.flatMap(
      Effect.forEach(args, (arg) => polyOf(arg, name, context)),
      ([first, ...rest]) => {
        if (rest.length === 0) {
          return Effect.succeed(
            one(polyScale(first as NumberSym, negate(ONE)))
          );
        }
        let total = first as NumberSym;
        for (const p of rest) {
          const next = polyTrySub(total, p);
          if (next === undefined || !polyWithinLimits(next)) {
            return refused(`${name} of two unknowns`);
          }
          total = next;
        }
        return Effect.succeed(one(total));
      }
    ),
  "number/multiply": (args, name, context) =>
    Effect.flatMap(
      Effect.forEach(args, (arg) => polyOf(arg, name, context)),
      (polys) => {
        let total: NumberSym = numberSym(constant(ONE));
        for (const p of polys) {
          const next = polyTryMul(total, p);
          if (next === undefined || !polyWithinLimits(next)) {
            return refused(`${name} of two unknowns`);
          }
          total = next;
        }
        return Effect.succeed(one(total));
      }
    ),
  "number/power": (args, name, context) =>
    Effect.flatMap(
      Effect.all([
        polyOf(args[0] as Sym, name, context),
        linearOf(args[1] as Sym, name, context),
      ]),
      ([base, exp]) => {
        if (exp.coefficients.size > 0 || exp.constant.d !== 1n) {
          return refused(name);
        }
        if (base.denominator !== undefined) {
          if (exp.constant.n === 0n) {
            return Effect.succeed(one(numberSym(constant(ONE))));
          }
          if (exp.constant.n === 1n) {
            return Effect.succeed(one(base));
          }
          return refused(name);
        }
        const powered = polyPow(base, Number(exp.constant.n));
        return powered === undefined
          ? refused(name)
          : Effect.succeed(one(powered));
      }
    ),
  "number/divide": (args, name, context) =>
    Effect.flatMap(
      Effect.all([
        polyOf(args[0] as Sym, name, context),
        linearOf(args[1] as Sym, name, context),
      ]),
      ([a, b]) => {
        if (b.coefficients.size > 0) {
          if (a.denominator !== undefined) {
            return refused(`${name} by an unknown`);
          }
          const posWhen = atom({ linear: b, relation: ">" });
          const negWhen = atom({
            linear: times(b, negate(ONE)),
            relation: ">",
          });
          const ratioSym = numberSym(a.linear, a.nonlinear, b);
          return Effect.succeed<Cases>([
            ...(posWhen.length === 0 ? [] : [{ sym: ratioSym, when: posWhen }]),
            ...(negWhen.length === 0 ? [] : [{ sym: ratioSym, when: negWhen }]),
          ]);
        }
        return isZero(b.constant)
          ? logicError(`${name} by zero has no finite result.`)
          : Effect.succeed(one(polyScale(a, divide(ONE, b.constant))));
      }
    ),
  "number/floor": (args, name, context) =>
    Effect.flatMap(polyOf(args[0] as Sym, name, context), (p) => {
      if (p.denominator !== undefined) {
        return refused(name);
      }
      if (p.nonlinear !== undefined) {
        return polyIntegral(p, context.sorts)
          ? Effect.succeed(one(p))
          : twoUnknowns("number/multiply");
      }
      return Effect.succeed(one(numberSym(floorLinear(p.linear, context))));
    }),
  "number/ceiling": (args, name, context) =>
    Effect.flatMap(polyOf(args[0] as Sym, name, context), (p) => {
      if (p.denominator !== undefined) {
        return refused(name);
      }
      if (p.nonlinear !== undefined) {
        return polyIntegral(p, context.sorts)
          ? Effect.succeed(one(p))
          : twoUnknowns("number/multiply");
      }
      return Effect.succeed(
        one(
          numberSym(
            times(
              floorLinear(times(p.linear, negate(ONE)), context),
              negate(ONE)
            )
          )
        )
      );
    }),
  "number/round": (args, name, context) =>
    Effect.flatMap(
      Effect.all([
        polyOf(args[0] as Sym, name, context),
        args[1] === undefined
          ? Effect.succeed(undefined)
          : linearOf(args[1], name, context),
      ]),
      ([subject, places]) => {
        if (subject.denominator !== undefined) {
          return refused(name);
        }
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
        if (p >= 0n && polyIntegral(subject, context.sorts)) {
          return Effect.succeed(one(subject));
        }
        if (subject.nonlinear !== undefined) {
          return refused(name);
        }
        const scale: Rational =
          p >= 0n ? ratio(10n ** p) : ratio(1n, 10n ** -p);
        const rounded = floorLinear(
          plus(times(subject.linear, scale), constant(ratio(1n, 2n))),
          context
        );
        return Effect.succeed(
          one(numberSym(times(rounded, divide(ONE, scale))))
        );
      }
    ),
  "number/remainder": (args, name, context) =>
    Effect.flatMap(
      Effect.forEach(args, (arg) => linearOf(arg, name, context)),
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
  "number/absolute": (args, name, context) =>
    Effect.flatMap(polyOf(args[0] as Sym, name, context), (x) => {
      const ge = polyFormula(x, ">=", context.sorts);
      const lt = polyFormula(x, "<", context.sorts);
      if (ge === undefined || lt === undefined) {
        return twoUnknowns();
      }
      const cases: { sym: Sym; when: Formula }[] = [];
      if (ge.length > 0) {
        cases.push({ sym: x, when: ge });
      }
      if (lt.length > 0) {
        cases.push({ sym: polyScale(x, negate(ONE)), when: lt });
      }
      return Effect.succeed<Cases>(cases);
    }),
  "number/min": (args, name, context) => extremum(args, name, false, context),
  "number/max": (args, name, context) => extremum(args, name, true, context),
  "number/lessThan": (args, name, context) =>
    Effect.map(
      comparePoly(args[0] as Sym, args[1] as Sym, "<", name, context),
      (f) => one(truthSym(f))
    ),
  "number/lessThanOrEqualTo": (args, name, context) =>
    Effect.map(
      comparePoly(args[0] as Sym, args[1] as Sym, "<=", name, context),
      (f) => one(truthSym(f))
    ),
  "number/greaterThan": (args, name, context) =>
    Effect.map(
      comparePoly(args[0] as Sym, args[1] as Sym, ">", name, context),
      (f) => one(truthSym(f))
    ),
  "number/greaterThanOrEqualTo": (args, name, context) =>
    Effect.map(
      comparePoly(args[0] as Sym, args[1] as Sym, ">=", name, context),
      (f) => one(truthSym(f))
    ),
  "number/equals?": (args, _name, context) =>
    Effect.map(equalSym(args[0] as Sym, args[1] as Sym, context), (f) =>
      one(truthSym(f))
    ),
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
  "boolean/xor": (args) =>
    Effect.map(
      Effect.all([
        truthOf(args[0] as Sym, args[0]),
        truthOf(args[1] as Sym, args[1]),
      ]),
      ([a, b]) => one(truthSym(or(and(a, not(b)), and(not(a), b))))
    ),
  "boolean/nand": (args) =>
    Effect.map(
      Effect.all([
        truthOf(args[0] as Sym, args[0]),
        truthOf(args[1] as Sym, args[1]),
      ]),
      ([a, b]) => one(truthSym(not(and(a, b))))
    ),
  "boolean/nor": (args) =>
    Effect.map(
      Effect.all([
        truthOf(args[0] as Sym, args[0]),
        truthOf(args[1] as Sym, args[1]),
      ]),
      ([a, b]) => one(truthSym(not(or(a, b))))
    ),
  "boolean/equals?": (args) =>
    Effect.map(
      Effect.all([
        truthOf(args[0] as Sym, args[0]),
        truthOf(args[1] as Sym, args[1]),
      ]),
      ([a, b]) => one(truthSym(or(and(a, b), and(not(a), not(b)))))
    ),
  "func/partial": ([target, ...fixed], name, context) =>
    Effect.map(functionOf(target, name), (fn) =>
      one({
        apply: (more, depth, callGuard) =>
          applyCallable(
            fn,
            [...fixed, ...more],
            callGuard === undefined
              ? context
              : { ...context, guard: and(context.guard ?? TRUE, callGuard) },
            depth
          ),
        kind: "closure" as const,
      })
    ),
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
  "object/set": ([record, key, value]) => {
    const fields = fieldsOf(record as Sym);
    if (
      fields === undefined ||
      key?.kind !== "value" ||
      typeof key.value !== "string" ||
      key.value === "__proto__"
    ) {
      return refused("object/set");
    }
    const next = new Map(fields);
    next.set(key.value, value as Sym);
    return Effect.succeed(one({ fields: next, kind: "record" }));
  },
  "object/remove": ([record, key]) => {
    const fields = fieldsOf(record as Sym);
    if (
      fields === undefined ||
      key?.kind !== "value" ||
      typeof key.value !== "string" ||
      key.value === "__proto__"
    ) {
      return refused("object/remove");
    }
    const next = new Map(fields);
    next.delete(key.value);
    return Effect.succeed(one({ fields: next, kind: "record" }));
  },
  "object/merge": (records) => {
    const out = new Map<string, Sym>();
    for (const record of records) {
      const fields = fieldsOf(record);
      if (fields === undefined) {
        return refused("object/merge");
      }
      for (const [k, v] of fields) {
        if (k !== "__proto__") {
          out.set(k, v);
        }
      }
    }
    return Effect.succeed(one({ fields: out, kind: "record" }));
  },
  "object/keys": ([record]) => {
    const fields = fieldsOf(record as Sym);
    return fields === undefined
      ? refused("object/keys")
      : Effect.succeed(one(listSym([...fields.keys()].map(fromValue))));
  },
  "object/values": ([record]) => {
    const fields = fieldsOf(record as Sym);
    return fields === undefined
      ? refused("object/values")
      : Effect.succeed(one(listSym([...fields.values()])));
  },
  "object/entries": ([record]) => {
    const fields = fieldsOf(record as Sym);
    return fields === undefined
      ? refused("object/entries")
      : Effect.succeed(
          one(
            listSym(
              [...fields.entries()].map(([k, v]) => listSym([fromValue(k), v]))
            )
          )
        );
  },
  "object/fromEntries": ([pairs]) => {
    const items = itemsOf(pairs as Sym);
    if (items === undefined) {
      return refused("object/fromEntries");
    }
    const fields = new Map<string, Sym>();
    for (const pair of items) {
      const parts = itemsOf(pair);
      const key = parts?.[0];
      if (
        parts === undefined ||
        parts.length !== 2 ||
        key?.kind !== "value" ||
        typeof key.value !== "string" ||
        key.value === "__proto__"
      ) {
        return refused("object/fromEntries");
      }
      fields.set(key.value, parts[1] as Sym);
    }
    return Effect.succeed(one({ fields, kind: "record" }));
  },
  "object/get-path": ([obj, pathSym]) => {
    if (pathSym?.kind !== "value" || typeof pathSym.value !== "string") {
      return refused("object/get-path");
    }
    let current = obj as Sym;
    for (const key of pathSym.value.split(".")) {
      const isIndex = DIGIT_INDEX.test(key);
      if (isIndex) {
        const items = itemsOf(current);
        const idx = Number.parseInt(key, 10);
        if (items === undefined || idx < 0 || idx >= items.length) {
          return refused("object/get-path");
        }
        current = items[idx] as Sym;
      } else {
        const fields = fieldsOf(current);
        const found = fields?.get(key);
        if (found === undefined) {
          return refused("object/get-path");
        }
        current = found;
      }
    }
    return Effect.succeed(one(current));
  },
  "schema/fits?": ([val, schemaSym], _name, context, depth) => {
    const schema = schemaSym as Sym;
    if (isConcrete(schema)) {
      return Effect.map(
        fitsOf(val as Sym, plainOf(schema), context, depth),
        (f) => one(truthSym(f))
      );
    }
    return schema.kind === "closure"
      ? Effect.map(
          Effect.flatMap(
            applyCallable(schema, [val as Sym], context, depth),
            formulaOf
          ),
          (f) => one(truthSym(f))
        )
      : refused("a schema made from a value no goal binds");
  },
  "schema/assert": ([val, schemaSym], name, context, depth) => {
    const schema = schemaSym as Sym;
    let target: unknown;
    if (isConcrete(schema)) {
      target = plainOf(schema);
    } else if (schema.kind === "closure") {
      target = schema;
    }
    return target === undefined
      ? refused("a schema made from a value no goal binds")
      : Effect.flatMap(
          provenFits(val as Sym, target, context, depth, name),
          () => Effect.succeed(one(val as Sym))
        );
  },
  "value/identity": ([arg]) => Effect.succeed(one(arg as Sym)),
  "value/equals?": ([a, b], _name, context) =>
    Effect.map(equalSym(a as Sym, b as Sym, context), (f) => one(truthSym(f))),
  "value/compare": ([a, b], name, context) => {
    const left = a as Sym;
    const right = b as Sym;
    if (isConcrete(left) && isConcrete(right)) {
      return Effect.succeed(
        one(fromValue(Math.sign(compareValues(plainOf(left), plainOf(right)))))
      );
    }
    if (left.kind === "number" && right.kind === "number") {
      return Effect.all([
        comparePoly(left, right, "<", name, context),
        comparePoly(left, right, "=", name, context),
        comparePoly(left, right, ">", name, context),
      ]).pipe(
        Effect.map(([lt, eq, gt]) =>
          [
            { sym: fromValue(-1), when: lt },
            { sym: fromValue(0), when: eq },
            { sym: fromValue(1), when: gt },
          ].filter(({ when }) => when.length > 0)
        )
      );
    }
    return refused(name);
  },
  "value/any?": () => Effect.succeed(one(truthSym(TRUE))),
  "value/boolean?": ([arg]) =>
    Effect.succeed(one(truthSym(arg?.kind === "truth" ? TRUE : FALSE))),
  "value/null?": ([arg]) =>
    Effect.succeed(
      one(truthSym(arg?.kind === "value" && arg.value === null ? TRUE : FALSE))
    ),
  "value/array?": ([arg], _name, context) =>
    Effect.map(
      (VALUE_PREDICATES["value/array?"] as (s: Sym, c: Context) => Fit)(
        arg as Sym,
        context
      ),
      (f) => one(truthSym(f))
    ),
  "value/object?": ([arg], _name, context) =>
    Effect.map(
      (VALUE_PREDICATES["value/object?"] as (s: Sym, c: Context) => Fit)(
        arg as Sym,
        context
      ),
      (f) => one(truthSym(f))
    ),
  "value/undefined?": ([arg], _name, context) =>
    Effect.map(
      (VALUE_PREDICATES["value/undefined?"] as (s: Sym, c: Context) => Fit)(
        arg as Sym,
        context
      ),
      (f) => one(truthSym(f))
    ),
  "value/string?": ([arg]) =>
    Effect.map(fitsOpaque(arg as Sym, "string"), (f) => one(truthSym(f))),
  "value/function?": ([arg]) =>
    Effect.map(fitsOpaque(arg as Sym, "function"), (f) => one(truthSym(f))),
  "value/promise?": ([arg]) =>
    Effect.map(fitsOpaque(arg as Sym, "promise"), (f) => one(truthSym(f))),
  "value/symbol?": ([arg]) =>
    Effect.map(fitsOpaque(arg as Sym, "symbol"), (f) => one(truthSym(f))),
  "value/unknown?": ([arg]) =>
    Effect.map(fitsOpaque(arg as Sym, "unknown"), (f) => one(truthSym(f))),
  "value/number?": (args) =>
    Effect.succeed(one(truthSym(args[0]?.kind === "number" ? TRUE : FALSE))),
  "value/integer?": (args, _name, context) =>
    Effect.map(fitsInteger(args[0] as Sym, context), (f) => one(truthSym(f))),
  "aggregate/count": ([list], name) =>
    Effect.map(listOf(list, name), (items) => one(fromValue(items.length))),
  "aggregate/sum": ([list], name, context, depth) =>
    Effect.flatMap(listOf(list, name), (items) =>
      (LIBRARY["number/add"] as LibraryFn)(items, name, context, depth)
    ),
  "aggregate/mean": ([list], name, context, depth) =>
    Effect.flatMap(listOf(list, name), (items) =>
      items.length === 0
        ? Effect.succeed(one(fromValue(null)))
        : Effect.flatMap(
            (LIBRARY["number/add"] as LibraryFn)(items, name, context, depth),
            (sums) =>
              Effect.map(
                Effect.forEach(sums, ({ sym, when }) =>
                  Effect.map(polyOf(sym, name, context), (p) => ({
                    sym: polyScale(p, divide(ONE, ratio(BigInt(items.length)))),
                    when,
                  }))
                ),
                (out) => out
              )
          )
    ),
  "aggregate/median": ([list], name, context, depth) =>
    Effect.flatMap(listOf(list, name), (items) => {
      if (items.length === 0) {
        return Effect.succeed(one(fromValue(null)));
      }
      return Effect.flatMap(
        Effect.forEach(items, (item) => polyOf(item, name, context)),
        () =>
          Effect.flatMap(
            sortSymbolic(items, undefined, name, context, depth),
            (ways) =>
              Effect.forEach(ways, ({ sym, when }) =>
                Effect.flatMap(listOf(sym, name), (ordered) => {
                  const mid = Math.floor(ordered.length / 2);
                  if (ordered.length % 2 === 1) {
                    return Effect.succeed({
                      sym: ordered[mid] as Sym,
                      when,
                    });
                  }
                  return Effect.all([
                    polyOf(ordered[mid - 1] as Sym, name, context),
                    polyOf(ordered[mid] as Sym, name, context),
                  ]).pipe(
                    Effect.map(([a, b]) => ({
                      sym: polyScale(polyAdd(a, b), divide(ONE, ratio(2n))),
                      when,
                    }))
                  );
                })
              )
          )
      );
    }),
  "aggregate/argMin": ([list], name, context) =>
    argExtremum(list as Sym, name, false, context),
  "aggregate/argMax": ([list], name, context) =>
    argExtremum(list as Sym, name, true, context),
  "aggregate/min": ([list], name, context) =>
    Effect.flatMap(listOf(list, name), (items) =>
      items.length === 0
        ? Effect.succeed(one(fromValue(null)))
        : extremum(items, name, false, context)
    ),
  "aggregate/max": ([list], name, context) =>
    Effect.flatMap(listOf(list, name), (items) =>
      items.length === 0
        ? Effect.succeed(one(fromValue(null)))
        : extremum(items, name, true, context)
    ),
  "aggregate/collect": ([list], name, context, depth) =>
    Effect.flatMap(listOf(list, name), (items) =>
      sortSymbolic(items, undefined, name, context, depth)
    ),
  "aggregate/unique": ([list], name, context, depth) =>
    Effect.flatMap(listOf(list, name), (items) =>
      uniqueSymbolic(items, name, context, depth, false)
    ),
  "aggregate/countUnique": ([list], name, context, depth) =>
    Effect.flatMap(listOf(list, name), (items) =>
      uniqueSymbolic(items, name, context, depth, true)
    ),
  "aggregate/union": ([list], name, context, depth) =>
    Effect.flatMap(listOf(list, name), (items) =>
      Effect.flatMap(
        Effect.forEach(items, (each) => listOf(each, name)),
        (nested) => uniqueSymbolic(nested.flat(), name, context, depth, false)
      )
    ),
  "quantity/add": (args, name, context, depth) =>
    quantitySameUnit(args, "number/add", name, context, depth, 0),
  "quantity/subtract": (args, name, context, depth) =>
    quantitySameUnit(args, "number/subtract", name, context, depth),
  "quantity/multiply": (args, name, context, depth) =>
    quantityMultiply(args, name, context, depth),
  "quantity/divide": ([a, b], name, context, depth) =>
    quantityDivide(a as Sym, b as Sym, name, context, depth),
  "quantity/power": ([a, exp], name, context, depth) =>
    quantityPower(a as Sym, exp as Sym, name, context, depth),
  "quantity/in": ([a, unitSym], name) =>
    quantityIn(a as Sym, unitSym as Sym, name),
  "time/add": ([instantSym, amountSym, unitSym], name, context) =>
    Effect.gen(function* () {
      const unitMs = timeUnitMs(unitSym);
      if (unitMs === undefined) {
        return yield* refused(name);
      }
      const instant = yield* polyOf(instantSym as Sym, name, context);
      if (!polyIntegral(instant, context.sorts)) {
        return yield* refused(name);
      }
      const amount = yield* polyOf(amountSym as Sym, name, context);
      const next = polyTryAdd(instant, polyScale(amount, ratio(unitMs)));
      if (next === undefined || !polyWithinLimits(next)) {
        return yield* refused(name);
      }
      return one(next);
    }),
  "time/diff": ([aSym, bSym, unitSym], name, context) =>
    Effect.gen(function* () {
      const unitMs = unitSym === undefined ? 1n : timeUnitMs(unitSym);
      if (unitMs === undefined) {
        return yield* refused(name);
      }
      const a = yield* polyOf(aSym as Sym, name, context);
      const b = yield* polyOf(bSym as Sym, name, context);
      if (!(polyIntegral(a, context.sorts) && polyIntegral(b, context.sorts))) {
        return yield* refused(name);
      }
      const diff = polyTrySub(a, b);
      if (diff === undefined || !polyWithinLimits(diff)) {
        return yield* refused(name);
      }
      return one(polyScale(diff, ratio(1n, unitMs)));
    }),
  "time/fromParts": (args, name, context) =>
    timeFromPartsSymbolic(args, name, context),
};

const TIME_UNIT_MS: Readonly<Record<string, bigint>> = {
  days: 86_400_000n,
  hours: 3_600_000n,
  minutes: 60_000n,
  ms: 1n,
  seconds: 1000n,
};

const timeUnitMs = (unitSym: Sym | undefined): bigint | undefined =>
  unitSym?.kind === "value" && typeof unitSym.value === "string"
    ? TIME_UNIT_MS[unitSym.value]
    : undefined;

const DAYS_IN_MONTH_SYM = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const daysFromCivilSym = (year: bigint, month: number, day: number): bigint => {
  const y = month <= 2 ? year - 1n : year;
  const era = y >= 0n ? y / 400n : (y - 399n) / 400n;
  const yoe = y - era * 400n;
  const m = BigInt(month);
  const doy = (153n * (m + (m > 2n ? -3n : 9n)) + 2n) / 5n + BigInt(day) - 1n;
  const doe = yoe * 365n + yoe / 4n - yoe / 100n + doy;
  return era * 146_097n + doe - 719_468n;
};

const exactIntOf = (sym: Sym | undefined): bigint | undefined =>
  sym?.kind === "number" &&
  sym.nonlinear === undefined &&
  sym.denominator === undefined &&
  sym.linear.coefficients.size === 0 &&
  sym.linear.constant.d === 1n
    ? sym.linear.constant.n
    : undefined;

const validCivilDate = (year: bigint, month: number, day: number): boolean => {
  const leap = (year % 4n === 0n && year % 100n !== 0n) || year % 400n === 0n;
  const maxDay = month === 2 && leap ? 29 : (DAYS_IN_MONTH_SYM[month] ?? 0);
  return month >= 1 && month <= 12 && day >= 1 && day <= maxDay;
};

const guaranteedIntPart = (
  part: NumberSym,
  lo: bigint,
  hi: bigint,
  context: Context
): boolean =>
  polyIntegral(part, context.sorts) &&
  isGuaranteed(
    and(
      atom({ linear: minus(part.linear, constant(ratio(lo))), relation: ">=" }),
      atom({ linear: minus(constant(ratio(hi)), part.linear), relation: ">=" })
    ),
    context
  );

const optionalTimePart = (
  arg: Sym | undefined,
  name: string,
  context: Context
): Effect.Effect<NumberSym, Error> =>
  arg === undefined
    ? Effect.succeed(numberSym(constant(ZERO)))
    : polyOf(arg, name, context);

const timeFromPartsSymbolic = (
  args: readonly Sym[],
  name: string,
  context: Context
): Effect.Effect<Cases, Error> =>
  Effect.gen(function* () {
    const year = exactIntOf(args[0]);
    const monthBig = exactIntOf(args[1]);
    const dayBig = exactIntOf(args[2]);
    if (year === undefined || monthBig === undefined || dayBig === undefined) {
      return yield* refused(name);
    }
    const month = Number(monthBig);
    const day = Number(dayBig);
    if (!validCivilDate(year, month, day)) {
      return yield* refused(name);
    }
    const hour = yield* optionalTimePart(args[3], name, context);
    const minute = yield* optionalTimePart(args[4], name, context);
    const second = yield* optionalTimePart(args[5], name, context);
    const offset = yield* optionalTimePart(args[6], name, context);
    const ranges: readonly (readonly [NumberSym, bigint, bigint])[] = [
      [hour, 0n, 23n],
      [minute, 0n, 59n],
      [second, 0n, 59n],
      [offset, -840n, 840n],
    ];
    if (!ranges.every(([p, lo, hi]) => guaranteedIntPart(p, lo, hi, context))) {
      return yield* refused(name);
    }
    const baseMs = daysFromCivilSym(year, month, day) * 86_400_000n;
    let total = numberSym(constant(ratio(baseMs)));
    total = polyAdd(total, polyScale(hour, ratio(3_600_000n)));
    total = polyAdd(total, polyScale(minute, ratio(60_000n)));
    total = polyAdd(total, polyScale(second, ratio(1000n)));
    total = polySub(total, polyScale(offset, ratio(60_000n)));
    return one(total);
  });

/** Whether `fit` holds everywhere under `context.guard` (i.e. `guard & !fit` is unsat). */
const isGuaranteed = (fit: Formula, context: Context): boolean => {
  const violation = and(context.guard ?? TRUE, not(fit));
  for (const conj of violation) {
    if (conj.length === 0) {
      return false;
    }
    const all = withDefinitions(conj, context.definitions);
    try {
      if (satisfiable(all, sortsForConstraints(all, context.sorts))) {
        return false;
      }
    } catch (error) {
      if (error instanceof LogicError) {
        return false;
      }
      throw error;
    }
  }
  return true;
};

/** Proves that `sym` fits `schema` (concrete or closure) under `context.guard`, or refuses with `what`. */
const provenFits = (
  sym: Sym,
  schema: unknown,
  context: Context,
  depth: number,
  what: string
): Effect.Effect<true, Error> =>
  Effect.flatMap(
    isClosure(schema)
      ? Effect.flatMap(applyCallable(schema, [sym], context, depth), formulaOf)
      : fitsOf(sym, schema, context, depth),
    (fit) => (isGuaranteed(fit, context) ? Effect.succeed(true) : refused(what))
  );

/** Deduplicates an already-sorted symbolic list by branching on adjacent equality. */
const dedupSorted = (
  items: readonly Sym[],
  when: Formula,
  context: Context
): Effect.Effect<{ items: Sym[]; when: Formula }[], Error> =>
  Effect.gen(function* () {
    if (items.length < 2) {
      return [{ items: [...items], when }];
    }
    let ways: { items: Sym[]; when: Formula }[] = [
      { items: [items[0] as Sym], when },
    ];
    for (let at = 1; at < items.length; at += 1) {
      const curr = items[at] as Sym;
      const next: { items: Sym[]; when: Formula }[] = [];
      for (const way of ways) {
        const prev = way.items.at(-1) as Sym;
        const eq = yield* equalSym(prev, curr, context);
        const same = pruneFormula(and(way.when, eq), context);
        if (same.length > 0) {
          next.push({ items: way.items, when: same });
        }
        const diff = pruneFormula(and(way.when, not(eq)), context);
        if (diff.length > 0) {
          next.push({ items: [...way.items, curr], when: diff });
        }
        if (next.length > MOST_WAYS) {
          return yield* Effect.fail(tooManyWays());
        }
      }
      ways = next;
    }
    return ways;
  });

const uniqueSymbolic = (
  items: readonly Sym[],
  name: string,
  context: Context,
  depth: number,
  countOnly: boolean
): Result =>
  Effect.gen(function* () {
    if (items.length === 0) {
      return one(countOnly ? fromValue(0) : listSym([]));
    }
    const sorted = yield* sortSymbolic(items, undefined, name, context, depth);
    const out: { sym: Sym; when: Formula }[] = [];
    for (const { sym, when } of sorted) {
      const list = itemsOf(sym) as readonly Sym[];
      for (const way of yield* dedupSorted(list, when, context)) {
        out.push({
          sym: countOnly ? fromValue(way.items.length) : listSym(way.items),
          when: way.when,
        });
      }
    }
    return out;
  });

type SymUnit = Readonly<Record<string, number>>;

interface SymQuantity {
  readonly unit: SymUnit;
  readonly value: Sym;
}

const normalUnit = (raw: Record<string, unknown>): SymUnit | undefined => {
  const entries: [string, number][] = [];
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== "number" || !Number.isInteger(v)) {
      return undefined;
    }
    if (v !== 0) {
      entries.push([k, v]);
    }
  }
  return Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : 1)));
};

const quantityOfSym = (
  sym: Sym,
  name: string
): Effect.Effect<SymQuantity, Error> => {
  if (sym.kind === "number") {
    return Effect.succeed({ unit: {}, value: sym });
  }
  const fields = fieldsOf(sym);
  if (fields === undefined || fields.size !== 2) {
    return refused(name);
  }
  const value = fields.get("value");
  const unitSym = fields.get("unit");
  if (
    value === undefined ||
    unitSym === undefined ||
    value.kind !== "number" ||
    !isConcrete(unitSym)
  ) {
    return refused(name);
  }
  const raw = plainOf(unitSym);
  const unit = isPlainObject(raw) ? normalUnit(raw) : undefined;
  return unit === undefined ? refused(name) : Effect.succeed({ unit, value });
};

const sameSymUnit = (a: SymUnit, b: SymUnit) =>
  JSON.stringify(a) === JSON.stringify(b);

const multiplyUnits = (a: SymUnit, b: SymUnit, scale = 1): SymUnit => {
  const out: Record<string, number> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = (out[k] ?? 0) + scale * v;
  }
  return normalUnit(out) as SymUnit;
};

const wrapQuantity = (value: Sym, unit: SymUnit): Sym =>
  Object.keys(unit).length === 0
    ? value
    : {
        fields: new Map([
          ["value", value],
          ["unit", fromValue(unit)],
        ]),
        kind: "record",
      };

const quantitySameUnit = (
  args: readonly Sym[],
  numOp: string,
  name: string,
  context: Context,
  depth: number,
  empty?: number
): Result =>
  Effect.gen(function* () {
    if (args.length === 0 && empty !== undefined) {
      return one(fromValue(empty));
    }
    const qs = yield* Effect.forEach(args, (arg) => quantityOfSym(arg, name));
    const [first] = qs as [SymQuantity, ...SymQuantity[]];
    const other = qs.find((q) => !sameSymUnit(q.unit, first.unit));
    if (other !== undefined) {
      return yield* Effect.fail(
        differentUnitsError(
          name.replace("quantity/", ""),
          JSON.stringify(first.unit),
          JSON.stringify(other.unit)
        )
      );
    }
    const results = yield* (LIBRARY[numOp] as LibraryFn)(
      qs.map((q) => q.value),
      name,
      context,
      depth
    );
    return results.map(({ sym, when }) => ({
      sym: wrapQuantity(sym, first.unit),
      when,
    }));
  });

const quantityMultiply = (
  args: readonly Sym[],
  name: string,
  context: Context,
  depth: number
): Result =>
  Effect.gen(function* () {
    if (args.length === 0) {
      return one(fromValue(1));
    }
    const qs = yield* Effect.forEach(args, (arg) => quantityOfSym(arg, name));
    const unit = qs.reduce<SymUnit>((acc, q) => multiplyUnits(acc, q.unit), {});
    const results = yield* (LIBRARY["number/multiply"] as LibraryFn)(
      qs.map((q) => q.value),
      name,
      context,
      depth
    );
    return results.map(({ sym, when }) => ({
      sym: wrapQuantity(sym, unit),
      when,
    }));
  });

const quantityDivide = (
  a: Sym,
  b: Sym,
  name: string,
  context: Context,
  depth: number
): Result =>
  Effect.gen(function* () {
    const [top, bottom] = yield* Effect.all([
      quantityOfSym(a, name),
      quantityOfSym(b, name),
    ]);
    const unit = multiplyUnits(top.unit, bottom.unit, -1);
    const results = yield* (LIBRARY["number/divide"] as LibraryFn)(
      [top.value, bottom.value],
      name,
      context,
      depth
    );
    return results.map(({ sym, when }) => ({
      sym: wrapQuantity(sym, unit),
      when,
    }));
  });

const quantityPower = (
  a: Sym,
  expSym: Sym,
  name: string,
  context: Context,
  depth: number
): Result =>
  Effect.gen(function* () {
    if (!isConcrete(expSym)) {
      return yield* refused(name);
    }
    const exp = plainOf(expSym);
    if (typeof exp !== "number" || !Number.isInteger(exp)) {
      return yield* refused(name);
    }
    const base = yield* quantityOfSym(a, name);
    const unit = normalUnit(
      Object.fromEntries(
        Object.entries(base.unit).map(([k, v]) => [k, v * exp])
      )
    ) as SymUnit;
    const results = yield* (LIBRARY["number/power"] as LibraryFn)(
      [base.value, expSym],
      name,
      context,
      depth
    );
    return results.map(({ sym, when }) => ({
      sym: wrapQuantity(sym, unit),
      when,
    }));
  });

const quantityIn = (a: Sym, unitSym: Sym, name: string): Result =>
  Effect.gen(function* () {
    if (!isConcrete(unitSym)) {
      return yield* refused(name);
    }
    const raw = plainOf(unitSym);
    const target = isPlainObject(raw) ? normalUnit(raw) : undefined;
    if (target === undefined) {
      return yield* refused(name);
    }
    const q = yield* quantityOfSym(a, name);
    if (!sameSymUnit(q.unit, target)) {
      return yield* Effect.fail(
        wrongUnitError(JSON.stringify(q.unit), JSON.stringify(target))
      );
    }
    return one(q.value);
  });

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
const withGuard = (context: Context, guard: Formula): Context =>
  guard === TRUE
    ? context
    : { ...context, guard: and(context.guard ?? TRUE, guard) };

const applyCallable = (
  fn: unknown,
  args: readonly Sym[],
  context: Context,
  depth: number,
  guard: Formula = TRUE
): Result => {
  const ctx = withGuard(context, guard);
  if (!isClosure(fn)) {
    return applyFunction(fn, args, ctx, depth, ctx.guard ?? TRUE);
  }
  if (depth > MOST_DEPTH) {
    return refused("a function that calls itself");
  }
  if (ctx.inductive !== undefined && fn.info !== undefined) {
    return Effect.flatMap(
      ctx.inductive.call(fn, fn.info, args, ctx, ctx.guard ?? TRUE),
      (intercepted) =>
        intercepted === undefined
          ? (fn.apply(args, depth + 1, ctx.guard) as Result)
          : Effect.succeed(intercepted)
    );
  }
  return fn.apply(args, depth + 1, ctx.guard) as Result;
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
      ? comparePoly(a, b, "<", name, context)
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
  "array/length": ([list], name) => {
    if (list?.kind === "inductive" && list.length !== undefined) {
      return Effect.succeed(one(numberSym(list.length)));
    }
    if (
      list?.kind === "list" &&
      list.tail !== undefined &&
      list.tail.length !== undefined
    ) {
      return Effect.succeed(
        one(
          numberSym(
            plus(constant(ratio(BigInt(list.items.length))), list.tail.length)
          )
        )
      );
    }
    return Effect.map(listOf(list, name), (items) =>
      one(fromValue(items.length))
    );
  },
  "array/head": ([list], name) => {
    if (list?.kind === "list" && list.tail !== undefined) {
      return list.items.length === 0
        ? refused(name)
        : Effect.succeed(one(list.items[0] as Sym));
    }
    return Effect.flatMap(listOf(list, name), (items) =>
      items.length === 0 ? refused(name) : Effect.succeed(one(items[0] as Sym))
    );
  },
  "array/tail": ([list], name) => {
    if (list?.kind === "list" && list.tail !== undefined) {
      if (list.items.length === 0) {
        return refused(name);
      }
      if (list.items.length === 1) {
        return Effect.succeed(one(list.tail));
      }
      return Effect.succeed(
        one({
          items: list.items.slice(1),
          kind: "list",
          ...(list.rest === undefined ? {} : { rest: list.rest }),
          tail: list.tail,
        })
      );
    }
    return Effect.flatMap(listOf(list, name), (items) =>
      items.length === 0
        ? refused(name)
        : Effect.succeed(one(listSym(items.slice(1))))
    );
  },
  "array/at": ([list, index, fallback], name, context) =>
    Effect.flatMap(listOf(list, name), (items) => {
      if (index === undefined) {
        return refused(name);
      }
      if (isConcrete(index)) {
        const raw = plainOf(index);
        if (typeof raw !== "number" || !Number.isInteger(raw)) {
          return refused(name);
        }
        const resolved = raw < 0 ? items.length + raw : raw;
        if (resolved >= 0 && resolved < items.length) {
          return Effect.succeed(one(items[resolved] as Sym));
        }
        return fallback === undefined
          ? refused(name)
          : Effect.succeed(one(fallback));
      }
      return Effect.gen(function* () {
        const idx = yield* linearOf(index, name, context);
        if (!integral(idx, context.sorts)) {
          return yield* refused(name);
        }
        const len = BigInt(items.length);
        const out: { sym: Sym; when: Formula }[] = [];
        for (let at = 0; at < items.length; at += 1) {
          const pos = atom({
            linear: minus(idx, constant(ratio(BigInt(at)))),
            relation: "=",
          });
          const neg = atom({
            linear: minus(idx, constant(ratio(BigInt(at) - len))),
            relation: "=",
          });
          const when = pruneFormula(or(pos, neg), context);
          if (when.length > 0) {
            out.push({ sym: items[at] as Sym, when });
          }
        }
        const oob = or(
          atom({
            linear: minus(constant(ratio(-len)), idx),
            relation: ">",
          }),
          atom({
            linear: minus(idx, constant(ratio(len))),
            relation: ">=",
          })
        );
        const reachableOob = pruneFormula(
          and(context.guard ?? TRUE, oob),
          context
        );
        if (reachableOob.length > 0) {
          if (fallback === undefined) {
            return yield* refused(name);
          }
          out.push({ sym: fallback, when: oob });
        }
        return out;
      });
    }),
  "array/indexOf": ([list, target], name, context) =>
    Effect.flatMap(listOf(list, name), (items) =>
      Effect.gen(function* () {
        const out: { sym: Sym; when: Formula }[] = [];
        let notYet: Formula = TRUE;
        for (let at = 0; at < items.length; at += 1) {
          const eq = yield* equalSym(items[at] as Sym, target as Sym, context);
          const hit = pruneFormula(and(notYet, eq), context);
          if (hit.length > 0) {
            out.push({ sym: fromValue(at), when: hit });
          }
          notYet = pruneFormula(and(notYet, not(eq)), context);
          if (notYet.length === 0) {
            return out;
          }
        }
        out.push({ sym: fromValue(-1), when: notYet });
        return out;
      })
    ),
  "array/find": ([list, fn, fallback], name, context, depth) =>
    Effect.flatMap(
      Effect.all([listOf(list, name), functionOf(fn, name)]),
      ([items, f]) =>
        Effect.gen(function* () {
          const out: { sym: Sym; when: Formula }[] = [];
          let notYet: Formula = TRUE;
          for (const item of items) {
            const holds = yield* Effect.flatMap(
              applyCallable(
                f,
                [item],
                { ...context, guard: and(context.guard ?? TRUE, notYet) },
                depth
              ),
              formulaOf
            );
            const hit = pruneFormula(and(notYet, holds), context);
            if (hit.length > 0) {
              out.push({ sym: item, when: hit });
            }
            notYet = pruneFormula(and(notYet, not(holds)), context);
            if (notYet.length === 0) {
              return out;
            }
          }
          const reachable = pruneFormula(
            and(context.guard ?? TRUE, notYet),
            context
          );
          if (reachable.length > 0) {
            if (fallback === undefined) {
              return yield* refused(name);
            }
            out.push({ sym: fallback, when: notYet });
          }
          return out;
        })
    ),
  "array/range": ([start, end], name) => {
    if (!(start && end && isConcrete(start) && isConcrete(end))) {
      return refused(name);
    }
    const from = plainOf(start);
    const to = plainOf(end);
    if (
      typeof from !== "number" ||
      !Number.isInteger(from) ||
      typeof to !== "number" ||
      !Number.isInteger(to) ||
      to - from > 256
    ) {
      return refused(name);
    }
    return Effect.succeed(
      one(
        listSym(
          Array.from({ length: Math.max(0, to - from) }, (_, at) =>
            fromValue(from + at)
          )
        )
      )
    );
  },
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
  "array/concat": (lists, name) => {
    if (lists.length === 0) {
      return Effect.succeed(one(listSym([])));
    }
    const last = lists.at(-1);
    const prefix = lists.slice(0, -1);
    if (
      last !== undefined &&
      ((last.kind === "inductive" && last.length !== undefined) ||
        (last.kind === "list" && last.tail !== undefined))
    ) {
      const tail = last.kind === "list" ? last.tail : last;
      return Effect.map(
        Effect.forEach(prefix, (list) => listOf(list, name)),
        (all) =>
          one({
            items: [...all.flat(), ...(last.kind === "list" ? last.items : [])],
            kind: "list",
            ...(tail === undefined ? {} : { tail }),
          })
      );
    }
    return Effect.map(
      Effect.forEach(lists, (list) => listOf(list, name)),
      (all) => one(listSym(all.flat()))
    );
  },
  "array/includes?": ([list, item], name, context) =>
    Effect.flatMap(listOf(list, name), (items) =>
      Effect.map(orEqualAny(item as Sym, items, context), (f) =>
        one(truthSym(f))
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

const extremumGuard = (
  polys: readonly NumberSym[],
  at: number,
  greatest: boolean,
  context: Context
): Effect.Effect<Formula, Error> =>
  Effect.gen(function* () {
    const chosen = polys[at] as NumberSym;
    let when: Formula = TRUE;
    for (let index = 0; index < polys.length; index += 1) {
      if (index === at) {
        continue;
      }
      const other = polys[index] as NumberSym;
      const ahead = greatest ? polySub(chosen, other) : polySub(other, chosen);
      const f = polyFormula(ahead, index < at ? ">" : ">=", context.sorts);
      if (f === undefined) {
        return yield* twoUnknowns();
      }
      when = and(when, f);
    }
    return when;
  });

const extremum = (
  args: readonly Sym[],
  name: string,
  greatest: boolean,
  context: Context
): Result =>
  Effect.gen(function* () {
    const polys = yield* Effect.forEach(args, (arg) =>
      polyOf(arg, name, context)
    );
    const cases: { sym: Sym; when: Formula }[] = [];
    for (let at = 0; at < polys.length; at += 1) {
      const when = yield* extremumGuard(polys, at, greatest, context);
      if (when.length > 0) {
        cases.push({ sym: polys[at] as NumberSym, when });
      }
    }
    return cases;
  });

const argExtremum = (
  list: Sym,
  name: string,
  greatest: boolean,
  context: Context
): Result =>
  Effect.gen(function* () {
    const items = yield* listOf(list, name);
    if (items.length === 0) {
      return one(fromValue(null));
    }
    const pairs = yield* Effect.forEach(items, (item) =>
      Effect.flatMap(listOf(item, name), (parts) =>
        parts.length === 2
          ? Effect.succeed([parts[0] as Sym, parts[1] as Sym] as const)
          : refused(name)
      )
    );
    const keys = yield* Effect.forEach(pairs, ([key]) =>
      polyOf(key, name, context)
    );
    if (!pairs.every(([, val]) => isConcrete(val))) {
      return yield* refused(name);
    }
    const ordered = pairs
      .map(([, val], at) => ({ key: keys[at] as NumberSym, val }))
      .sort((a, b) => compareValues(plainOf(a.val), plainOf(b.val)));
    const orderedKeys = ordered.map((each) => each.key);
    const cases: { sym: Sym; when: Formula }[] = [];
    for (let at = 0; at < ordered.length; at += 1) {
      const when = yield* extremumGuard(orderedKeys, at, greatest, context);
      if (when.length > 0) {
        cases.push({ sym: (ordered[at] as { readonly val: Sym }).val, when });
      }
    }
    return cases;
  });

/**
 * Applies a function to symbolic values: a library function by what it
 * does to them, a lambda by its body, and any function to values that hold
 * no unknown by calling it.
 */
const applyFunction = (
  fn: unknown,
  args: readonly Sym[],
  context: Context,
  depth: number,
  guard: Formula = TRUE
): Result => {
  const ctx = withGuard(context, guard);
  if (args.every(isConcrete)) {
    return Effect.map(
      call(fn, ...args.map(plainOf)) as Effect.Effect<unknown, Error>,
      (value) => one(fromValue(value))
    );
  }
  const info = lambdaInfo(fn);
  if (info !== undefined) {
    if (ctx.inductive !== undefined) {
      return Effect.flatMap(
        ctx.inductive.call(fn, info, args, ctx, ctx.guard ?? TRUE),
        (intercepted) =>
          intercepted === undefined
            ? inline(fn, info, args, ctx, depth, ctx.guard ?? TRUE)
            : Effect.succeed(intercepted)
      );
    }
    return inline(fn, info, args, ctx, depth, ctx.guard ?? TRUE);
  }
  const built = buildOf(fn);
  if (built !== undefined && nameOf(built.by) === "func/partial") {
    const [target, ...fixed] = built.args;
    return applyCallable(
      target,
      [...fixed.map(fromValue), ...args],
      ctx,
      depth,
      ctx.guard ?? TRUE
    );
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
  return rule === undefined ? refused(name) : rule(args, name, ctx, depth);
};

/** Each case of each argument, applied. */
const applyCases = (
  fn: unknown,
  args: readonly Cases[],
  context: Context,
  depth: number,
  guard: Formula = TRUE
): Result =>
  Effect.map(
    Effect.forEach(product(args), ({ syms, when }) =>
      Effect.map(
        applyCallable(fn, syms, withGuard(context, and(guard, when)), depth),
        (cases) =>
          cases.flatMap((each) => {
            const both = and(when, each.when);
            return both.length === 0 ? [] : [{ sym: each.sym, when: both }];
          })
      )
    ),
    (all) => all.flat()
  );

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

/** Runs a lambda's body on symbolic values, with an optional extra lexical scope. */
export const inlineLambda = (
  info: LambdaInfo,
  args: readonly Sym[],
  context: Context,
  depth: number,
  guard: Formula = TRUE,
  extraScope?: ReadonlyMap<string, Cases>
): Result => inline(undefined, info, args, context, depth, guard, extraScope);

/** Checks every parameter contract against `args` under `context.guard`. */
const checkContracts = (
  checks: readonly unknown[],
  args: readonly Sym[],
  context: Context,
  depth: number
): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    for (let at = 0; at < checks.length; at += 1) {
      const schema = checks[at];
      if (schema !== undefined) {
        yield* provenFits(
          args[at] ?? fromValue(null),
          schema,
          context,
          depth,
          "a lambda with a contract"
        );
      }
    }
  });

/** Runs a lambda's body on symbolic values. */
const inline = (
  fn: unknown,
  info: LambdaInfo,
  args: readonly Sym[],
  context: Context,
  depth: number,
  guard: Formula = TRUE,
  extraScope?: ReadonlyMap<string, Cases>
): Result => {
  if (depth > MOST_DEPTH) {
    return refused("a function that calls itself");
  }
  const ctx = withGuard(context, guard);
  const contract = fn === undefined ? undefined : lambdaOf(fn)?.contract;
  if (Array.isArray(info.written) && contract === undefined) {
    return refused("a lambda with a contract");
  }
  const runBody = () => {
    const scope = new Map<string, Cases>([
      ...(extraScope ?? []),
      ...bound(
        typeof info.written === "string" ? info.written : info.parameters,
        args
      ),
    ]);
    return expression(
      info.body,
      scope,
      info.environment,
      ctx,
      depth + 1,
      ctx.guard ?? TRUE
    );
  };
  return contract === undefined
    ? runBody()
    : Effect.flatMap(
        checkContracts(contract.checks, args, ctx, depth),
        runBody
      );
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
  [, parameters, body]: [string, readonly unknown[] | string, unknown],
  rest: readonly unknown[],
  where: Where
): Result =>
  Effect.flatMap(makeClosure([parameters, body], where), (fns) =>
    Effect.flatMap(each(rest, where), (args) =>
      applyCases(
        callableOf((fns[0] as { readonly sym: Sym }).sym),
        args,
        { ...where.context, guard: where.guard },
        where.depth
      )
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
                applyCases(
                  fn,
                  args,
                  { ...where.context, guard: and(where.guard, when) },
                  where.depth
                ),
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
  where: Where,
  checks?: readonly unknown[]
): Sym => {
  const params =
    typeof parameters === "string"
      ? parameters
      : parameterNames(parameters as readonly unknown[]);
  return {
    apply: (args, depth, callGuard) => {
      const mergedGuard =
        callGuard === undefined ? where.guard : and(where.guard, callGuard);
      const runBody = () =>
        expressionAt(body, {
          ...where,
          depth,
          guard: mergedGuard,
          scope: new Map([...where.scope, ...bound(params, args)]),
        });
      return checks === undefined
        ? runBody()
        : Effect.flatMap(
            checkContracts(
              checks,
              args,
              { ...where.context, guard: mergedGuard },
              depth
            ),
            runBody
          );
    },
    info: {
      body,
      environment: where.environment,
      parameters: Array.isArray(params) ? params : [params],
      ...(typeof parameters === "string" ? { written: parameters } : {}),
    },
    kind: "closure",
    scope: where.scope,
  };
};

const makeClosure = (parts: readonly unknown[], where: Where): Result => {
  const [parameters, body] = parts;
  const schemas = parameterSchemas(parameters as readonly unknown[] | string);
  if (schemas.every((s) => s === undefined)) {
    return Effect.succeed(one(closureOf([parameters, body], where)));
  }
  return Effect.gen(function* () {
    const evaluated: unknown[] = [];
    for (const schemaExpr of schemas) {
      if (schemaExpr === undefined) {
        evaluated.push(undefined);
        continue;
      }
      const cases = yield* expressionAt(schemaExpr, where);
      const first = cases[0];
      if (
        cases.length !== 1 ||
        first === undefined ||
        !(isConcrete(first.sym) || first.sym.kind === "closure")
      ) {
        return yield* refused("a lambda with a contract");
      }
      evaluated.push(
        first.sym.kind === "closure" ? first.sym : plainOf(first.sym)
      );
    }
    return one(closureOf([parameters, body], where, evaluated));
  });
};

/** Equality inside a lambda body, as `=` works in a goal. */
const equalityExpr = (
  [first, second]: readonly unknown[],
  where: Where
): Result =>
  Effect.flatMap(
    Effect.all([expressionAt(first, where), expressionAt(second, where)]),
    ([a, b]) =>
      Effect.map(
        Effect.forEach(product([a, b]), ({ syms: [x, y], when }) =>
          Effect.map(equalSym(x as Sym, y as Sym, where.context), (f) =>
            and(when, f)
          )
        ),
        (fs) => one(truthSym(fs.reduce(or, FALSE)))
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
          Effect.flatMap(listOf(syms[1], "in"), (items) =>
            Effect.map(orEqualAny(syms[0] as Sym, items, where.context), (f) =>
              and(when, f)
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
        fit = yield* equalSym(sym, schemaSym, where.context);
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
        { ...where.context, guard: and(guard, fnWhen) },
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
    return lambdaCall(
      head as [string, readonly unknown[] | string, unknown],
      rest,
      where
    );
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
      return makeClosure(rest, where);
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
  depth: number,
  guard: Formula = context.guard ?? TRUE
): Result => expressionAt(code, { context, depth, environment, guard, scope });

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
      const holds = otherwise
        ? TRUE
        : yield* holdsWhere(test, {
            ...where,
            guard: and(where.guard, before),
          });
      const here = and(before, holds);
      const hasGuard = where.guard.some((conj) => conj.length > 0);
      const reachable =
        where.depth > 1 || hasGuard
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
      return Effect.flatMap(
        Effect.all([term(first, context, depth), term(second, context, depth)]),
        ([a, b]) =>
          Effect.map(
            Effect.forEach(product([a, b]), ({ syms: [x, y], when }) =>
              Effect.map(equalSym(x as Sym, y as Sym, context), (f) =>
                and(when, f)
              )
            ),
            (fs) => one(truthSym(fs.reduce(or, FALSE)))
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
              Effect.flatMap(listOf(syms[1], "in"), (items) =>
                Effect.map(orEqualAny(syms[0] as Sym, items, context), (f) =>
                  and(when, f)
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

const NO_OPEN: ReadonlySet<SchemaInfo> = new Set();

/** That each value fits its schema. */
const allFit = (
  pairs: readonly (readonly [Sym, unknown])[],
  context: Context,
  depth: number,
  open: ReadonlySet<SchemaInfo> = NO_OPEN
): Fit =>
  Effect.gen(function* () {
    let f: Formula = TRUE;
    for (const [sym, schema] of pairs) {
      f = and(f, yield* fitsOf(sym, schema, context, depth, open));
      if (f.length === 0) {
        return FALSE;
      }
    }
    return f;
  });

/** That a value fits one of the schemas. */
const anyFit = (
  sym: Sym,
  schemas: readonly unknown[],
  context: Context,
  depth: number,
  open: ReadonlySet<SchemaInfo> = NO_OPEN
): Fit =>
  Effect.gen(function* () {
    let f: Formula = FALSE;
    for (const schema of schemas) {
      f = or(f, yield* fitsOf(sym, schema, context, depth, open));
    }
    return f;
  });

const fitsInteger = (sym: Sym, context: Context): Fit => {
  if (sym.kind !== "number") {
    return Effect.succeed(FALSE);
  }
  const resolved = applySubstitutions(sym, context);
  if (resolved.denominator !== undefined) {
    return refused(`${"value/integer?"} of a ratio`);
  }
  if (resolved.nonlinear !== undefined) {
    return polyIntegral(resolved, context.sorts)
      ? Effect.succeed(TRUE)
      : twoUnknowns("value/integer?");
  }
  if (integral(resolved.linear, context.sorts)) {
    return Effect.succeed(TRUE);
  }
  const q = floorLinear(resolved.linear, context);
  return Effect.succeed(
    atom({ linear: minus(resolved.linear, q), relation: "=" })
  );
};

/** Whether `sub` is included in `sup`, using the context's recursive inclusion check. */
const subschema = (
  sub: unknown,
  sup: unknown,
  context: Context,
  step = 0
): Effect.Effect<boolean, Error> =>
  context.checkIncludes === undefined
    ? refused("a schema")
    : context.checkIncludes(sub, sup, step);

/** Whether `schema` allows at least one value (`!(schema <= EMPTY)`). */
const isInhabited = (
  schema: unknown,
  context: Context,
  step = 1
): Effect.Effect<boolean, Error> =>
  schema === ANY_REST_SCHEMA
    ? Effect.succeed(true)
    : Effect.map(
        subschema(schema, EMPTY_SCHEMA, context, step),
        (empty) => !empty
      );

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
      sym.kind === "list" ||
        (sym.kind === "inductive" && sym.length !== undefined) ||
        (sym.kind === "value" && Array.isArray(sym.value))
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
  depth: number,
  open: ReadonlySet<SchemaInfo>
): Fit => {
  const allowed = allowedBy(shape);
  if (allowed !== undefined) {
    return orEqualAny(
      sym,
      allowed.map((v) => fromValue(v)),
      context
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
    return fitsBuilt(sym, nameOf(built.by), built.args, context, depth, open);
  }
  // Any other predicate is run on the value.
  return Effect.flatMap(applyFunction(shape, [sym], context, depth), formulaOf);
};

/** The formula that a symbolic value fits a schema. */
const fitsInductive = (
  sym: Extract<Sym, { readonly kind: "inductive" }>,
  schema: unknown,
  context: Context
): Fit => {
  const symNamed = schemaOf(sym.schema);
  const targetNamed = schemaOf(schema);
  if (
    schema === sym.schema ||
    (symNamed !== undefined && symNamed === targetNamed) ||
    nameOf(throughNames(schema)) === "value/any?"
  ) {
    return Effect.succeed(TRUE);
  }
  if (context.checkIncludes !== undefined) {
    return Effect.map(
      context.checkIncludes(sym.schema, schema, sym.depth),
      (ok) => (ok ? TRUE : FALSE)
    );
  }
  if (
    sym.length !== undefined &&
    nameOf(throughNames(schema)) === "value/array?"
  ) {
    return Effect.succeed(TRUE);
  }
  return refused("an inductive value");
};

export const fitsOf = (
  sym: Sym,
  schema: unknown,
  context: Context,
  depth: number,
  open: ReadonlySet<SchemaInfo> = NO_OPEN
): Fit => {
  if (schema === ANY_REST_SCHEMA) {
    return Effect.succeed(TRUE);
  }
  if (schema === EMPTY_SCHEMA) {
    return Effect.succeed(FALSE);
  }
  if (sym.kind === "inductive") {
    return fitsInductive(sym, schema, context);
  }
  if (isConcrete(sym)) {
    const fit = fits(schema, plainOf(sym)) as unknown as Effect.Effect<
      unknown,
      Error
    >;
    return Effect.map(fit, (holds) => (holds === true ? TRUE : FALSE));
  }
  const named = schemaOf(schema);
  if (named !== undefined && named.shape !== undefined) {
    if (open.has(named)) {
      return Effect.succeed(FALSE);
    }
    const next = new Set(open);
    next.add(named);
    return fitsOf(sym, named.shape, context, depth, next);
  }
  const shape = throughNames(schema);
  if (typeof shape === "function") {
    return fitsFunction(sym, shape, context, depth, open);
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
    return fitsTupleShape(sym, shape, context, depth);
  }
  return equalSym(sym, fromValue(shape), context);
};

const fitsTupleShape = (
  sym: Sym,
  shape: readonly unknown[],
  context: Context,
  depth: number
): Fit => {
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
      } else if (!(yield* subschema(symRest, inner, context, 1))) {
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
  depth: number,
  open: ReadonlySet<SchemaInfo>
): Fit => {
  switch (name) {
    case "schema/anyOf":
      return anyFit(sym, args, context, depth, open);
    case "schema/allOf":
      return allFit(
        args.map((part) => [sym, part] as const),
        context,
        depth,
        open
      );
    case "schema/optional":
      return fitsOf(sym, args[0], context, depth, open);
    case "schema/arrayOf": {
      const most = args[1] as number | undefined;
      if (sym.kind === "list" && sym.rest !== undefined) {
        const symRest = sym.rest;
        return Effect.gen(function* () {
          const alive = yield* isInhabited(symRest, context);
          if (most !== undefined && (sym.items.length > most || alive)) {
            return FALSE;
          }
          if (alive && !(yield* subschema(symRest, args[0], context, 1))) {
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
          if (alive && !(yield* subschema(symRest, args[0], context, 1))) {
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

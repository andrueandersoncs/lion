/**
 * Exact multivariate polynomials over Lion's rationals, for the symbolic
 * solver and inductive prover. Multiplying symbolic numbers builds a `NumberSym`
 * with higher-degree monomials in `nonlinear`; when additions or subtractions
 * cancel every nonlinear term (as in `(n + 1)^2 - n^2 = 2n + 1`), `nonlinear`
 * disappears and the result is purely linear. A remaining univariate quadratic
 * `a*x^2 + b*x + c op 0` is reduced into exact linear bounds via rational roots
 * and exact BigInt integer-root bracketing.
 */
import {
  type Constraint,
  constant,
  type Linear,
  minus,
  type Sort,
  times,
  variable,
} from "@/logic/solver";
import {
  add,
  compare,
  divide,
  isZero,
  multiply,
  negate,
  ONE,
  type Rational,
  ratio,
  subtract,
  ZERO,
} from "@/numbers/exact";

/** A symbolic number: linear part plus optional higher-degree monomials (`"a*b"` keys) and optional linear denominator. */
export interface NumberSym {
  readonly denominator?: Linear;
  readonly kind: "number";
  readonly linear: Linear;
  readonly nonlinear?: ReadonlyMap<string, Rational>;
}

/** True when two linear expressions have identical constants and coefficients. */
export const sameLinear = (a: Linear, b: Linear): boolean => {
  if (
    compare(a.constant, b.constant) !== 0 ||
    a.coefficients.size !== b.coefficients.size
  ) {
    return false;
  }
  for (const [name, k] of a.coefficients) {
    const other = b.coefficients.get(name);
    if (other === undefined || compare(k, other) !== 0) {
      return false;
    }
  }
  return true;
};

export const numberSym = (
  linear: Linear,
  nonlinear?: ReadonlyMap<string, Rational>,
  denominator?: Linear
): NumberSym => {
  const hasNl = nonlinear !== undefined && nonlinear.size > 0;
  if (denominator !== undefined) {
    if (denominator.coefficients.size === 0 && !isZero(denominator.constant)) {
      const inv = divide(ONE, denominator.constant);
      const scaled = polyScale(
        hasNl
          ? { kind: "number", linear, nonlinear }
          : { kind: "number", linear },
        inv
      );
      return scaled;
    }
    return hasNl
      ? { denominator, kind: "number", linear, nonlinear }
      : { denominator, kind: "number", linear };
  }
  return hasNl
    ? { kind: "number", linear, nonlinear }
    : { kind: "number", linear };
};

export const numeratorOf = (sym: NumberSym): NumberSym =>
  numberSym(sym.linear, sym.nonlinear);

const MAX_DEGREE = 8;
const MAX_TERMS = 64;

const monomialKey = (factors: readonly string[]): string =>
  [...factors].sort().join("*");

const polyTerms = (sym: NumberSym): [readonly string[], Rational][] => {
  const out: [readonly string[], Rational][] = [];
  if (!isZero(sym.linear.constant)) {
    out.push([[], sym.linear.constant]);
  }
  for (const [name, k] of sym.linear.coefficients) {
    if (!isZero(k)) {
      out.push([[name], k]);
    }
  }
  if (sym.nonlinear !== undefined) {
    for (const [key, k] of sym.nonlinear) {
      if (!isZero(k)) {
        out.push([key.split("*"), k]);
      }
    }
  }
  return out;
};

const fromPolyTerms = (
  terms: Iterable<readonly [readonly string[], Rational]>
): NumberSym => {
  let constantVal: Rational = ZERO;
  const coeffs = new Map<string, Rational>();
  const nonlinear = new Map<string, Rational>();
  for (const [factors, k] of terms) {
    if (isZero(k)) {
      continue;
    }
    if (factors.length === 0) {
      constantVal = add(constantVal, k);
    } else if (factors.length === 1) {
      const name = factors[0] as string;
      const next = add(coeffs.get(name) ?? ZERO, k);
      if (isZero(next)) {
        coeffs.delete(name);
      } else {
        coeffs.set(name, next);
      }
    } else {
      const key = monomialKey(factors);
      const next = add(nonlinear.get(key) ?? ZERO, k);
      if (isZero(next)) {
        nonlinear.delete(key);
      } else {
        nonlinear.set(key, next);
      }
    }
  }
  return numberSym(
    { coefficients: coeffs, constant: constantVal },
    nonlinear.size > 0 ? nonlinear : undefined
  );
};

export const polyAdd = (a: NumberSym, b: NumberSym): NumberSym => {
  if (a.nonlinear === undefined && b.nonlinear === undefined) {
    const coeffs = new Map(a.linear.coefficients);
    for (const [name, k] of b.linear.coefficients) {
      const next = add(coeffs.get(name) ?? ZERO, k);
      if (isZero(next)) {
        coeffs.delete(name);
      } else {
        coeffs.set(name, next);
      }
    }
    return numberSym({
      coefficients: coeffs,
      constant: add(a.linear.constant, b.linear.constant),
    });
  }
  return fromPolyTerms([...polyTerms(a), ...polyTerms(b)]);
};

export const polySub = (a: NumberSym, b: NumberSym): NumberSym =>
  a.nonlinear === undefined && b.nonlinear === undefined
    ? numberSym(minus(a.linear, b.linear))
    : fromPolyTerms([
        ...polyTerms(a),
        ...polyTerms(b).map(([f, k]) => [f, negate(k)] as const),
      ]);

export const polyScale = (a: NumberSym, factor: Rational): NumberSym => {
  if (isZero(factor)) {
    return numberSym(constant(ZERO));
  }
  if (a.nonlinear === undefined) {
    return numberSym(times(a.linear, factor), undefined, a.denominator);
  }
  const nonlinear = new Map<string, Rational>();
  for (const [key, k] of a.nonlinear) {
    const next = multiply(k, factor);
    if (!isZero(next)) {
      nonlinear.set(key, next);
    }
  }
  return numberSym(times(a.linear, factor), nonlinear, a.denominator);
};

/** Ratio-aware addition: returns undefined when two distinct unknown denominators cannot stay linear. */
export const polyTryAdd = (
  a: NumberSym,
  b: NumberSym
): NumberSym | undefined => {
  if (a.denominator === undefined && b.denominator === undefined) {
    return polyAdd(a, b);
  }
  if (a.denominator !== undefined && b.denominator === undefined) {
    const sum = polyAdd(numeratorOf(a), polyMul(b, numberSym(a.denominator)));
    return numberSym(sum.linear, sum.nonlinear, a.denominator);
  }
  if (a.denominator === undefined && b.denominator !== undefined) {
    const sum = polyAdd(polyMul(a, numberSym(b.denominator)), numeratorOf(b));
    return numberSym(sum.linear, sum.nonlinear, b.denominator);
  }
  if (
    a.denominator !== undefined &&
    b.denominator !== undefined &&
    sameLinear(a.denominator, b.denominator)
  ) {
    const sum = polyAdd(numeratorOf(a), numeratorOf(b));
    return numberSym(sum.linear, sum.nonlinear, a.denominator);
  }
  return undefined;
};

/** Ratio-aware subtraction: returns undefined when two distinct unknown denominators cannot stay linear. */
export const polyTrySub = (a: NumberSym, b: NumberSym): NumberSym | undefined =>
  polyTryAdd(a, polyScale(b, negate(ONE)));

/** Ratio-aware multiplication: returns undefined when multiplying two unknown denominators. */
export const polyTryMul = (
  a: NumberSym,
  b: NumberSym
): NumberSym | undefined => {
  if (a.denominator === undefined && b.denominator === undefined) {
    return polyMul(a, b);
  }
  if (a.denominator !== undefined && b.denominator === undefined) {
    const prod = polyMul(numeratorOf(a), b);
    return numberSym(prod.linear, prod.nonlinear, a.denominator);
  }
  if (a.denominator === undefined && b.denominator !== undefined) {
    const prod = polyMul(a, numeratorOf(b));
    return numberSym(prod.linear, prod.nonlinear, b.denominator);
  }
  return undefined;
};

export const polyMul = (a: NumberSym, b: NumberSym): NumberSym => {
  const ta = polyTerms(a);
  const tb = polyTerms(b);
  const prod: [readonly string[], Rational][] = [];
  for (const [fa, ka] of ta) {
    for (const [fb, kb] of tb) {
      prod.push([[...fa, ...fb], multiply(ka, kb)]);
    }
  }
  return fromPolyTerms(prod);
};

export const polySubstitute = (
  sym: NumberSym,
  varName: string,
  replacement: NumberSym
): NumberSym => {
  let acc: NumberSym = numberSym(constant(ZERO));
  for (const [factors, k] of polyTerms(sym)) {
    let termVal: NumberSym = numberSym(constant(k));
    const kept: string[] = [];
    for (const f of factors) {
      if (f === varName) {
        termVal = polyMul(termVal, replacement);
      } else {
        kept.push(f);
      }
    }
    if (kept.length > 0) {
      termVal = polyMul(termVal, fromPolyTerms([[kept, ONE]]));
    }
    acc = polyAdd(acc, termVal);
  }
  return acc;
};

/** Whether a polynomial stays within the solver's degree and term bounds. */
export const polyWithinLimits = (sym: NumberSym): boolean => {
  const totalTerms = sym.linear.coefficients.size + (sym.nonlinear?.size ?? 0);
  if (totalTerms > MAX_TERMS) {
    return false;
  }
  if (sym.nonlinear === undefined) {
    return true;
  }
  for (const key of sym.nonlinear.keys()) {
    if (key.split("*").length > MAX_DEGREE) {
      return false;
    }
  }
  return true;
};

export const polyPow = (
  base: NumberSym,
  exponent: number
): NumberSym | undefined => {
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > MAX_DEGREE) {
    return undefined;
  }
  let result: NumberSym = numberSym(constant(ONE));
  let factor: NumberSym = base;
  let e = exponent;
  while (e > 0) {
    if (e % 2 === 1) {
      result = polyMul(result, factor);
      if (!polyWithinLimits(result)) {
        return undefined;
      }
    }
    e = Math.floor(e / 2);
    if (e > 0) {
      factor = polyMul(factor, factor);
      if (!polyWithinLimits(factor)) {
        return undefined;
      }
    }
  }
  return result;
};

/** True when every variable in `sym` is an integer and every coefficient is an integer (and no unknown denominator). */
export const polyIntegral = (
  sym: NumberSym,
  sorts: ReadonlyMap<string, Sort>
): boolean =>
  sym.denominator === undefined &&
  sym.linear.constant.d === 1n &&
  [...sym.linear.coefficients].every(
    ([name, c]) => c.d === 1n && sorts.get(name) === "integer"
  ) &&
  (sym.nonlinear === undefined ||
    [...sym.nonlinear].every(
      ([key, c]) =>
        c.d === 1n &&
        key.split("*").every((name) => sorts.get(name) === "integer")
    ));

/** Exact floor(sqrt(n)) for n >= 0n via Newton's method. */
export const isqrt = (n: bigint): bigint => {
  if (n < 2n) {
    return n;
  }
  let x = 2n ** BigInt(Math.floor((n.toString(2).length + 1) / 2));
  for (;;) {
    const next = (x + n / x) / 2n;
    if (next >= x) {
      return x;
    }
    x = next;
  }
};

const floorDiv = (a: bigint, b: bigint): bigint => {
  const q = a / b;
  return a < 0n && q * b !== a ? q - 1n : q;
};

const exactSqrt = (r: Rational): Rational | undefined => {
  if (r.n < 0n) {
    return undefined;
  }
  const sn = isqrt(r.n);
  const sd = isqrt(r.d);
  return sn * sn === r.n && sd * sd === r.d ? ratio(sn, sd) : undefined;
};

export type PolyComparison = "=" | ">" | ">=" | "<" | "<=";

export const flipOp = (op: PolyComparison): PolyComparison => {
  switch (op) {
    case ">":
      return "<";
    case ">=":
      return "<=";
    case "<":
      return ">";
    case "<=":
      return ">=";
    default:
      return "=";
  }
};

const bound = (
  x: string,
  op: "=" | "!=" | ">" | ">=" | "<" | "<=",
  value: Rational
): Constraint => {
  const v = variable(x);
  const c = constant(value);
  if (op === "<") {
    return { linear: minus(c, v), relation: ">" };
  }
  if (op === "<=") {
    return { linear: minus(c, v), relation: ">=" };
  }
  return { linear: minus(v, c), relation: op };
};

const rationalQuadratic = (
  x: string,
  r1: Rational,
  r2: Rational,
  op: PolyComparison
): readonly (readonly Constraint[])[] => {
  switch (op) {
    case "=":
      return [[bound(x, "=", r1)], [bound(x, "=", r2)]];
    case "<":
      return [[bound(x, ">", r1), bound(x, "<", r2)]];
    case "<=":
      return [[bound(x, ">=", r1), bound(x, "<=", r2)]];
    case ">":
      return [[bound(x, "<", r1)], [bound(x, ">", r2)]];
    default:
      return [[bound(x, "<=", r1)], [bound(x, ">=", r2)]];
  }
};

const integerIrrationalQuadratic = (
  x: string,
  a: Rational,
  b: Rational,
  c: Rational,
  op: PolyComparison
): readonly (readonly Constraint[])[] => {
  if (op === "=") {
    return [];
  }
  const scale = a.d * b.d * c.d;
  const A = (a.n * scale) / a.d;
  const B = (b.n * scale) / b.d;
  const C = (c.n * scale) / c.d;
  const sInt = isqrt(B * B - 4n * A * C);
  const twoA = 2n * A;
  const m = floorDiv(-B - sInt - 1n, twoA);
  const k = floorDiv(-B + sInt, twoA);
  if (op === "<" || op === "<=") {
    return m + 1n > k
      ? []
      : [[bound(x, ">=", ratio(m + 1n)), bound(x, "<=", ratio(k))]];
  }
  return [[bound(x, "<=", ratio(m))], [bound(x, ">=", ratio(k + 1n))]];
};

const quadraticCoeffs = (sym: NumberSym) => {
  if (sym.nonlinear === undefined || sym.nonlinear.size !== 1) {
    return undefined;
  }
  const entry = [...sym.nonlinear][0];
  if (entry === undefined) {
    return undefined;
  }
  const [key, a] = entry;
  const factors = key.split("*");
  if (factors.length !== 2 || factors[0] !== factors[1] || isZero(a)) {
    return undefined;
  }
  const x = factors[0] as string;
  for (const name of sym.linear.coefficients.keys()) {
    if (name !== x) {
      return undefined;
    }
  }
  return {
    a,
    b: sym.linear.coefficients.get(x) ?? ZERO,
    c: sym.linear.constant,
    x,
  };
};

const doubleRootResult = (
  x: string,
  root: Rational,
  op: PolyComparison
): readonly (readonly Constraint[])[] => {
  if (op === ">=") {
    return [[]];
  }
  if (op === "<") {
    return [];
  }
  return op === ">" ? [[bound(x, "!=", root)]] : [[bound(x, "=", root)]];
};

/**
 * Reduces a univariate quadratic `a*x^2 + b*x + c op 0` into equivalent linear
 * constraints (in DNF), or returns undefined if `sym` is not a univariate
 * quadratic or has irrational real roots on a non-integer variable.
 */
export const solveUnivariateQuadratic = (
  sym: NumberSym,
  rawOp: PolyComparison,
  sorts?: ReadonlyMap<string, Sort>
): readonly (readonly Constraint[])[] | undefined => {
  const coeffs = quadraticCoeffs(sym);
  if (coeffs === undefined) {
    return undefined;
  }
  const neg = compare(coeffs.a, ZERO) < 0;
  const a = neg ? negate(coeffs.a) : coeffs.a;
  const b = neg ? negate(coeffs.b) : coeffs.b;
  const c = neg ? negate(coeffs.c) : coeffs.c;
  const op = neg ? flipOp(rawOp) : rawOp;
  const { x } = coeffs;
  const delta = subtract(multiply(b, b), multiply(ratio(4n), multiply(a, c)));
  const deltaSign = compare(delta, ZERO);
  if (deltaSign < 0) {
    return op === ">" || op === ">=" ? [[]] : [];
  }
  const twoA = multiply(ratio(2n), a);
  if (deltaSign === 0) {
    return doubleRootResult(x, divide(negate(b), twoA), op);
  }
  const s = exactSqrt(delta);
  if (s !== undefined) {
    const r1 = divide(subtract(negate(b), s), twoA);
    const r2 = divide(add(negate(b), s), twoA);
    return rationalQuadratic(x, r1, r2, op);
  }
  return sorts?.get(x) === "integer"
    ? integerIrrationalQuadratic(x, a, b, c, op)
    : undefined;
};

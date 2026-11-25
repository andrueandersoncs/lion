/**
 * The solver: whether some values meet a set of linear constraints, and
 * values that do.
 *
 * A variable is a whole number or any number. A constraint says that a sum
 * of variables times exact numbers, plus a number, is at least, above,
 * equal to, or not equal to zero. Numbers are exact: rationals of big
 * integers, so a question gets the same answer on every machine and never
 * "unknown".
 *
 * Variables that may be any number are eliminated first, by Fourier and
 * Motzkin's method, which is exact for them. Whole numbers are decided by
 * Pugh's Omega test: an equation is solved for a variable, after its
 * coefficients are made small enough that one is plus or minus one, and an
 * inequality's variable is eliminated exactly when it can be, and otherwise
 * through the real and the dark shadow and, when those disagree, the finitely
 * many planes of the grey shadow. A constraint that a value is not some other
 * splits into above and below. Every set of constraints is satisfiable or
 * not, so every question gets yes or no.
 *
 * Values that meet the constraints are found one variable at a time: the
 * range the others leave a variable, a value in it near zero, and a check
 * that the rest can still be met.
 */
import { LogicError } from "@/errors/evaluation";
import {
  add,
  ceiling,
  compare,
  divide,
  floor,
  fromRational,
  gcd,
  isNumber,
  isZero,
  type LionNumber,
  multiply,
  negate,
  ONE,
  type Rational,
  ratio,
  subtract,
  toRational,
  ZERO,
} from "@/numbers/exact";

/**
 * A Lion number as the rational it stands for: a JavaScript number is the
 * decimal its shortest digits write, so 0.1 is one tenth.
 */
export const fromNumber = (value: LionNumber): Rational => {
  if (!isNumber(value)) {
    throw new RangeError(`${value} is not a finite number`);
  }
  return toRational(value);
};

const abs = (a: bigint) => (a < 0n ? -a : a);

/** A rational as the Lion number it is, in its one form. */
export const toNumber = (a: Rational): LionNumber => fromRational(a);

/** A sum of variables times numbers, plus a number. */
export interface Linear {
  readonly coefficients: ReadonlyMap<string, Rational>;
  readonly constant: Rational;
}

export const constant = (value: Rational): Linear => ({
  coefficients: new Map(),
  constant: value,
});

export const variable = (name: string): Linear => ({
  coefficients: new Map([[name, ONE]]),
  constant: ZERO,
});

export const plus = (a: Linear, b: Linear): Linear => {
  const coefficients = new Map(a.coefficients);
  for (const [name, c] of b.coefficients) {
    const sum = add(coefficients.get(name) ?? ZERO, c);
    if (isZero(sum)) {
      coefficients.delete(name);
    } else {
      coefficients.set(name, sum);
    }
  }
  return { coefficients, constant: add(a.constant, b.constant) };
};

export const times = (a: Linear, k: Rational): Linear =>
  isZero(k)
    ? constant(ZERO)
    : {
        coefficients: new Map(
          [...a.coefficients].map(([name, c]) => [name, multiply(c, k)])
        ),
        constant: multiply(a.constant, k),
      };

export const minus = (a: Linear, b: Linear) => plus(a, times(b, negate(ONE)));

/** What a constraint says of its sum: at least, above, equal to, or not equal to zero. */
export type Relation = ">=" | ">" | "=" | "!=";

export interface Constraint {
  readonly linear: Linear;
  readonly relation: Relation;
}

/** Whether a variable is a whole number or any number. */
export type Sort = "integer" | "real";

/** Values for some variables. */
export type Values = ReadonlyMap<string, Rational>;

/** The value of a sum for some values; undefined when one is missing. */
export const valueAt = (linear: Linear, values: Values) => {
  let sum = linear.constant;
  for (const [name, c] of linear.coefficients) {
    const value = values.get(name);
    if (value === undefined) {
      return undefined;
    }
    sum = add(sum, multiply(c, value));
  }
  return sum;
};

/** Whether values meet a constraint. */
export const meets = (constraint: Constraint, values: Values) => {
  const value = valueAt(constraint.linear, values);
  if (value === undefined) {
    return false;
  }
  const sign = compare(value, ZERO);
  switch (constraint.relation) {
    case ">=":
      return sign >= 0;
    case ">":
      return sign > 0;
    case "=":
      return sign === 0;
    default:
      return sign !== 0;
  }
};

/**
 * The most work one question may take: constraints made while eliminating,
 * and cases split from constraints that say "not equal". Past it, the
 * question is refused, so that every question ends soon.
 */
export const MOST_CONSTRAINTS = 20_000;
export const MOST_CASES = 4096;

class TooHard extends Error {}

const tooHard = () =>
  new LogicError({
    message: `These constraints are too many to decide soon: more than ${MOST_CONSTRAINTS.toLocaleString("en")} arise while eliminating their variables, or more than ${MOST_CASES.toLocaleString("en")} cases split from "not equal". Narrow the question.`,
  });

// Whole-number constraints for the Omega test: a sum with whole
// coefficients and constant that is at least zero, or equal to zero.

interface Whole {
  readonly coefficients: ReadonlyMap<string, bigint>;
  readonly constant: bigint;
}

interface Problem {
  readonly equations: readonly Whole[];
  readonly inequalities: readonly Whole[];
}

let made = 0;

const count = (n = 1) => {
  made += n;
  if (made > MOST_CONSTRAINTS) {
    throw new TooHard();
  }
};

const wholePlus = (a: Whole, b: Whole, ka = 1n, kb = 1n): Whole => {
  const coefficients = new Map<string, bigint>();
  for (const [name, c] of a.coefficients) {
    coefficients.set(name, c * ka);
  }
  for (const [name, c] of b.coefficients) {
    const sum = (coefficients.get(name) ?? 0n) + c * kb;
    if (sum === 0n) {
      coefficients.delete(name);
    } else {
      coefficients.set(name, sum);
    }
  }
  return { coefficients, constant: a.constant * ka + b.constant * kb };
};

/** Replaces a variable by a sum of others. */
const substitute = (into: Whole, name: string, by: Whole): Whole => {
  const c = into.coefficients.get(name);
  if (c === undefined) {
    return into;
  }
  const rest = new Map(into.coefficients);
  rest.delete(name);
  return wholePlus({ coefficients: rest, constant: into.constant }, by, 1n, c);
};

const coefficientGcd = (w: Whole) => {
  let g = 0n;
  for (const c of w.coefficients.values()) {
    g = gcd(g, c);
  }
  return g;
};

const floorDiv = (a: bigint, b: bigint) => {
  const q = a / b;
  return a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q;
};

/**
 * An inequality with its coefficients divided by their gcd, the constant
 * rounded down, as whole values allow; undefined when it always holds, and
 * false when it never does.
 */
const normalInequality = (w: Whole): Whole | undefined | false => {
  const g = coefficientGcd(w);
  if (g === 0n) {
    return w.constant >= 0n ? undefined : false;
  }
  return {
    coefficients: new Map([...w.coefficients].map(([n, c]) => [n, c / g])),
    constant: floorDiv(w.constant, g),
  };
};

/** An equation divided by its gcd; undefined when it holds, false when it cannot. */
const normalEquation = (w: Whole): Whole | undefined | false => {
  const g = coefficientGcd(w);
  if (g === 0n) {
    return w.constant === 0n ? undefined : false;
  }
  if (w.constant % g !== 0n) {
    return false;
  }
  return {
    coefficients: new Map([...w.coefficients].map(([n, c]) => [n, c / g])),
    constant: w.constant / g,
  };
};

let fresh = 0;

/** a "mod hat" m: a minus the multiple of m nearest it, ties rounded up. */
const modHat = (a: bigint, m: bigint) => a - m * floorDiv(2n * a + m, 2n * m);

/**
 * Solves an equation for a variable, as a sum of the others and perhaps a
 * new variable: directly when some coefficient is plus or minus one, and
 * otherwise by Pugh's step, which brings in a new whole variable that makes
 * the coefficients smaller, until one is.
 */
const solveEquation = (
  equation: Whole
): { readonly name: string; readonly value: Whole } => {
  for (const [name, c] of equation.coefficients) {
    if (c === 1n || c === -1n) {
      // c·x + rest = 0, so x = -rest / c.
      const rest = new Map(equation.coefficients);
      rest.delete(name);
      return {
        name,
        value: wholePlus(
          { coefficients: new Map(), constant: 0n },
          { coefficients: rest, constant: equation.constant },
          1n,
          -c
        ),
      };
    }
  }
  // The variable with the smallest coefficient, k, and m one more than it.
  let [name, ak] = [...equation.coefficients][0] as [string, bigint];
  for (const [other, c] of equation.coefficients) {
    if (abs(c) < abs(ak)) {
      [name, ak] = [other, c];
    }
  }
  const m = abs(ak) + 1n;
  fresh += 1;
  const sigma = `σ${fresh}`;
  // Pugh: x_k = -sign(a_k)·m·σ + Σ_{i≠k} sign(a_k)·(a_i mod̂ m)·x_i + sign(a_k)·(c mod̂ m).
  const sign = ak < 0n ? -1n : 1n;
  const coefficients = new Map<string, bigint>([[sigma, -sign * m]]);
  for (const [other, c] of equation.coefficients) {
    if (other !== name) {
      const hat = modHat(c, m);
      if (hat !== 0n) {
        coefficients.set(other, sign * hat);
      }
    }
  }
  return {
    name,
    value: { coefficients, constant: sign * modHat(equation.constant, m) },
  };
};

/**
 * Solves the equations of a problem for its variables, one at a time, and
 * puts what each variable equals into the inequalities. An equation solved
 * through a new variable stays, with smaller coefficients, until it can be
 * solved directly. False when an equation cannot hold.
 */
const withoutEquations = (problem: Problem): Problem | false => {
  let equations = [...problem.equations];
  let inequalities = [...problem.inequalities];
  for (let guard = 0; ; guard += 1) {
    if (guard > MOST_CONSTRAINTS) {
      throw new TooHard();
    }
    const normal: Whole[] = [];
    for (const equation of equations) {
      const n = normalEquation(equation);
      if (n === false) {
        return false;
      }
      if (n !== undefined) {
        normal.push(n);
      }
    }
    const [first] = normal;
    if (first === undefined) {
      return { equations: [], inequalities };
    }
    const { name, value } = solveEquation(first);
    count(normal.length + inequalities.length);
    equations = normal.map((e) => substitute(e, name, value));
    inequalities = inequalities.map((i) => substitute(i, name, value));
  }
};

const key = (w: Whole) =>
  [...w.coefficients]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([n, c]) => `${n}:${c}`)
    .join(",");

/**
 * Each inequality made normal, the tightest of those over the same sum
 * kept; false when one can never hold.
 */
const tightestBySum = (inequalities: readonly Whole[]) => {
  const tightest = new Map<string, Whole>();
  for (const inequality of inequalities) {
    const n = normalInequality(inequality);
    if (n === false) {
      return false;
    }
    if (n === undefined) {
      continue;
    }
    const k = key(n);
    const held = tightest.get(k);
    if (held === undefined || n.constant < held.constant) {
      tightest.set(k, n);
    }
  }
  return tightest;
};

const negated = (w: Whole): Whole => ({
  coefficients: new Map([...w.coefficients].map(([n, c]) => [n, -c])),
  constant: 0n,
});

/**
 * The inequalities, each normal, with the tightest of those over the same
 * sum kept; false when two say the sum is at least more than at most. Two
 * that meet exactly make an equation.
 */
const tightened = (
  inequalities: readonly Whole[]
): { equations: Whole[]; inequalities: Whole[] } | false => {
  const tightest = tightestBySum(inequalities);
  if (tightest === false) {
    return false;
  }
  const equations: Whole[] = [];
  const kept: Whole[] = [];
  for (const [k, w] of tightest) {
    const opposite = tightest.get(key(negated(w)));
    // e + a ≥ 0 and -e + b ≥ 0: -a ≤ e ≤ b.
    const sum =
      opposite === undefined ? undefined : w.constant + opposite.constant;
    if (sum !== undefined && sum < 0n) {
      return false;
    }
    if (sum === 0n) {
      if (k < key(negated(w))) {
        equations.push(w);
      }
    } else {
      kept.push(w);
    }
  }
  return { equations, inequalities: kept };
};

type Bound = readonly [bigint, Whole];

/**
 * The inequalities about a variable, as its lower bounds a·x ≥ -L and its
 * upper bounds b·x ≤ U, each with a and b at least one, and the others.
 */
const boundsOf = (name: string, inequalities: readonly Whole[]) => {
  const lower: Bound[] = [];
  const upper: Bound[] = [];
  const others: Whole[] = [];
  for (const w of inequalities) {
    const c = w.coefficients.get(name);
    if (c === undefined) {
      others.push(w);
      continue;
    }
    const rest = new Map(w.coefficients);
    rest.delete(name);
    const bound: Bound = [
      c > 0n ? c : -c,
      { coefficients: rest, constant: w.constant },
    ];
    (c > 0n ? lower : upper).push(bound);
  }
  return { lower, others, upper };
};

/**
 * What the bounds say of the other variables once the variable is gone:
 * a·U + b·L ≥ gap for every lower bound a·x ≥ -L and upper bound b·x ≤ U.
 */
const shadowOf = (
  lower: readonly Bound[],
  upper: readonly Bound[],
  others: readonly Whole[],
  gap: (a: bigint, b: bigint) => bigint
) => {
  count(lower.length * upper.length);
  const out = [...others];
  for (const [a, l] of lower) {
    for (const [b, u] of upper) {
      const combined = wholePlus(u, l, a, b);
      out.push({
        coefficients: combined.coefficients,
        constant: combined.constant - gap(a, b),
      });
    }
  }
  return out;
};

/**
 * The grey shadow: a solution the dark shadow misses has a·x = -L + i for
 * some lower bound and a small i, so each is tried.
 */
const greyShadow = (
  name: string,
  lower: readonly Bound[],
  upper: readonly Bound[],
  inequalities: readonly Whole[]
) => {
  const most = upper.reduce((m, [b]) => (b > m ? b : m), 0n);
  for (const [a, l] of lower) {
    const last = (a * most - a - most) / most;
    for (let i = 0n; i <= last; i += 1n) {
      // a·x + L - i = 0.
      const equation = wholePlus(
        { coefficients: new Map([[name, a]]), constant: -i },
        l
      );
      count();
      if (omega({ equations: [equation], inequalities })) {
        return true;
      }
    }
  }
  return false;
};

/** Whether whole values meet inequalities and equations: Pugh's Omega test. */
const omega = (problem: Problem): boolean => {
  const solved = withoutEquations(problem);
  const tight = solved === false ? false : tightened(solved.inequalities);
  if (tight === false) {
    return false;
  }
  if (tight.equations.length > 0) {
    return omega(tight);
  }
  const { inequalities } = tight;
  if (inequalities.length === 0) {
    return true;
  }
  const name = pickVariable(inequalities);
  const { lower, others, upper } = boundsOf(name, inequalities);
  if (lower.length === 0 || upper.length === 0) {
    return omega({ equations: [], inequalities: others });
  }
  const real = shadowOf(lower, upper, others, () => 0n);
  if (lower.every(([a]) => a === 1n) || upper.every(([b]) => b === 1n)) {
    return omega({ equations: [], inequalities: real });
  }
  if (!omega({ equations: [], inequalities: real })) {
    return false;
  }
  const dark = shadowOf(lower, upper, others, (a, b) => (a - 1n) * (b - 1n));
  return (
    omega({ equations: [], inequalities: dark }) ||
    greyShadow(name, lower, upper, inequalities)
  );
};

/** The variable whose elimination is exact or makes the fewest new constraints. */
const pickVariable = (inequalities: readonly Whole[]) => {
  const stats = new Map<
    string,
    { lower: number; upper: number; unitLower: boolean; unitUpper: boolean }
  >();
  for (const w of inequalities) {
    for (const [name, c] of w.coefficients) {
      const s = stats.get(name) ?? {
        lower: 0,
        unitLower: true,
        unitUpper: true,
        upper: 0,
      };
      if (c > 0n) {
        s.lower += 1;
        s.unitLower &&= c === 1n;
      } else {
        s.upper += 1;
        s.unitUpper &&= c === -1n;
      }
      stats.set(name, s);
    }
  }
  let best: string | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const [name, s] of [...stats].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const pairs = s.lower * s.upper;
    const exact = s.unitLower || s.unitUpper || pairs === 0;
    const score = (exact ? 0 : 1_000_000) + pairs;
    if (score < bestScore) {
      [best, bestScore] = [name, score];
    }
  }
  return best as string;
};

// Constraints over rationals, any number or whole: Fourier and Motzkin for
// the variables that may be any number, then the Omega test.

/** Splits each "not equal" into above and below, every way. */
export const cases = (constraints: readonly Constraint[]): Constraint[][] => {
  let out: Constraint[][] = [[]];
  for (const c of constraints) {
    if (c.relation === "!=") {
      if (out.length * 2 > MOST_CASES) {
        throw new TooHard();
      }
      out = out.flatMap((chosen) => [
        [...chosen, { linear: c.linear, relation: ">" as const }],
        [
          ...chosen,
          { linear: times(c.linear, negate(ONE)), relation: ">" as const },
        ],
      ]);
    } else {
      out = out.map((chosen) => [...chosen, c]);
    }
  }
  return out;
};

const isTrue = (relation: Relation, value: Rational) =>
  meets({ linear: constant(value), relation }, new Map());

/**
 * Eliminates the variables that may be any number, which Fourier and
 * Motzkin's method does exactly: an equation is solved for one of them, and
 * an inequality's variable is replaced by every lower bound below every
 * upper bound. False when what remains of the constants fails.
 */
const withoutReals = (
  constraints: readonly Constraint[],
  sorts: ReadonlyMap<string, Sort>
): Constraint[] | false => {
  let current: Constraint[] | false = withoutConstants(constraints);
  while (current !== false) {
    const real = realIn(current, sorts);
    if (real === undefined) {
      return current;
    }
    current = withoutConstants(eliminateReal(current, real));
  }
  return false;
};

/** The constraints with a variable, or false when one without fails. */
const withoutConstants = (
  constraints: readonly Constraint[]
): Constraint[] | false => {
  const kept: Constraint[] = [];
  for (const c of constraints) {
    if (c.linear.coefficients.size > 0) {
      kept.push(c);
    } else if (!isTrue(c.relation, c.linear.constant)) {
      return false;
    }
  }
  return kept;
};

/** The first variable that may be any number, by name. */
const realIn = (
  constraints: readonly Constraint[],
  sorts: ReadonlyMap<string, Sort>
) =>
  [...new Set(constraints.flatMap((c) => [...c.linear.coefficients.keys()]))]
    .filter((name) => sorts.get(name) === "real")
    .sort()[0];

/** What the constraints say once a variable that may be any number is gone. */
const eliminateReal = (
  constraints: readonly Constraint[],
  real: string
): Constraint[] => {
  const equation = constraints.find(
    (c) => c.relation === "=" && c.linear.coefficients.has(real)
  );
  if (equation !== undefined) {
    // c·x + rest = 0: x = -rest / c.
    const c = equation.linear.coefficients.get(real) as Rational;
    const rest = minus(equation.linear, times(variable(real), c));
    const value = times(rest, negate(divide(ONE, c)));
    count(constraints.length - 1);
    return constraints
      .filter((other) => other !== equation)
      .map((other) => ({
        linear: replace(other.linear, real, value),
        relation: other.relation,
      }));
  }
  const lower: Constraint[] = [];
  const upper: Constraint[] = [];
  const others: Constraint[] = [];
  for (const c of constraints) {
    const k = c.linear.coefficients.get(real);
    if (k === undefined) {
      others.push(c);
    } else {
      (compare(k, ZERO) > 0 ? lower : upper).push(c);
    }
  }
  count(lower.length * upper.length);
  for (const l of lower) {
    for (const u of upper) {
      // a·x + L ≥ 0 (a > 0) and -b·x + U ≥ 0 (b > 0): b·L + a·U ≥ 0.
      const a = l.linear.coefficients.get(real) as Rational;
      const b = negate(u.linear.coefficients.get(real) as Rational);
      others.push({
        linear: plus(times(l.linear, b), times(u.linear, a)),
        relation: l.relation === ">" || u.relation === ">" ? ">" : ">=",
      });
    }
  }
  return others;
};

const replace = (linear: Linear, name: string, by: Linear): Linear => {
  const c = linear.coefficients.get(name);
  if (c === undefined) {
    return linear;
  }
  return plus(minus(linear, times(variable(name), c)), times(by, c));
};

const lcm = (a: bigint, b: bigint) => (a / (gcd(a, b) || 1n)) * b;

/** A constraint over whole variables as whole numbers, a strict one made at least one. */
const toWhole = (c: Constraint): Whole => {
  let scale = c.linear.constant.d;
  for (const k of c.linear.coefficients.values()) {
    scale = lcm(scale, k.d);
  }
  const coefficients = new Map(
    [...c.linear.coefficients].map(([n, k]) => [n, (k.n * scale) / k.d])
  );
  const value = (c.linear.constant.n * scale) / c.linear.constant.d;
  return { coefficients, constant: c.relation === ">" ? value - 1n : value };
};

/** Whether values of the given sorts meet every constraint, without splitting. */
const decideCase = (
  constraints: readonly Constraint[],
  sorts: ReadonlyMap<string, Sort>
) => {
  const whole = withoutReals(constraints, sorts);
  if (whole === false) {
    return false;
  }
  return omega({
    equations: whole.filter((c) => c.relation === "=").map(toWhole),
    inequalities: whole.filter((c) => c.relation !== "=").map(toWhole),
  });
};

/** Whether values of the given sorts meet every constraint. */
const decide = (
  constraints: readonly Constraint[],
  sorts: ReadonlyMap<string, Sort>
) => cases(constraints).some((each) => decideCase(each, sorts));

/**
 * The range a variable may take for some constraints, eliminating every
 * other unknown as if it could be any number: the least and the greatest,
 * each with whether it may be reached. Undefined ends are open.
 */
const rangeOf = (
  name: string,
  constraints: readonly Constraint[],
  sorts: ReadonlyMap<string, Sort>
) => {
  const relaxed = new Map(
    [...sorts].map(([n]) => [
      n,
      n === name ? ("integer" as const) : ("real" as const),
    ])
  );
  const projected = withoutReals(
    constraints.filter((c) => c.relation !== "!="),
    relaxed
  );
  let low: { value: Rational; strict: boolean } | undefined;
  let high: { value: Rational; strict: boolean } | undefined;
  for (const c of projected === false ? [] : projected) {
    const k = c.linear.coefficients.get(name);
    if (k === undefined) {
      continue;
    }
    // k·x + c ≥ 0: x ≥ -c/k when k > 0, x ≤ -c/k when k < 0.
    const bound = negate(divide(c.linear.constant, k));
    const strict = c.relation === ">";
    if (
      (c.relation === "=" || compare(k, ZERO) > 0) &&
      (low === undefined ||
        compare(bound, low.value) > 0 ||
        (compare(bound, low.value) === 0 && strict))
    ) {
      low = { strict, value: bound };
    }
    if (
      (c.relation === "=" || compare(k, ZERO) < 0) &&
      (high === undefined ||
        compare(bound, high.value) < 0 ||
        (compare(bound, high.value) === 0 && strict))
    ) {
      high = { strict, value: bound };
    }
  }
  return { high, low };
};

const MOST_TRIES = 10_000;

type Range = ReturnType<typeof rangeOf>;

type End = Range["low"];

/** Whether a value is above an end, or at it when the end may be reached. */
const beyond = (value: Rational, end: End, side: 1 | -1) =>
  end === undefined ||
  compare(value, end.value) * side > 0 ||
  (!end.strict && compare(value, end.value) === 0);

const within =
  ({ high, low }: Range) =>
  (value: Rational) =>
    beyond(value, low, 1) && beyond(value, high, -1);

/** The whole number nearest zero between the ends, or an end's nearest. */
const startOf = ({ high, low }: Range) => {
  let start = 0n;
  if (low !== undefined && start < ceiling(low.value)) {
    start = ceiling(low.value);
  }
  if (high !== undefined && start > floor(high.value)) {
    start = floor(high.value);
  }
  return start;
};

/**
 * The ends, a whole step inside each, and points ever closer together
 * between them: a value is ruled out only at the finitely many points a
 * "not equal" names, so one of these meets it.
 */
const pointsIn = ({ high, low }: Range) => {
  const points: Rational[] = [];
  if (low !== undefined) {
    points.push(low.value, add(low.value, ONE));
  }
  if (high !== undefined) {
    points.push(high.value, subtract(high.value, ONE));
  }
  if (low !== undefined && high !== undefined) {
    const width = subtract(high.value, low.value);
    for (let parts = 2n; parts <= 256n; parts *= 2n) {
      for (let k = 1n; k < parts; k += 2n) {
        points.push(add(low.value, multiply(width, ratio(k, parts))));
      }
    }
  }
  return points;
};

/**
 * Candidates for a variable's value: the whole number nearest zero in its
 * range, then, for one that may be any number, its ends and points between
 * them, then the other whole numbers in the range, nearest that one first.
 */
function* candidatesIn(range: Range, sort: Sort): Generator<Rational> {
  const inRange = within(range);
  const start = startOf(range);
  if (inRange(ratio(start))) {
    yield ratio(start);
  }
  if (sort === "real") {
    yield* pointsIn(range).filter(inRange);
  }
  for (let step = 1n; step < BigInt(MOST_TRIES); step += 1n) {
    for (const value of [start + step, start - step]) {
      if (inRange(ratio(value))) {
        yield ratio(value);
      }
    }
  }
}

const fix = (
  constraints: readonly Constraint[],
  name: string,
  value: Rational
) =>
  constraints.map((c) => ({
    linear: replace(c.linear, name, constant(value)),
    relation: c.relation,
  }));

/**
 * Values that meet the constraints, one for each variable, each near zero;
 * undefined when none do. Fails when deciding would take too long.
 */
export const solve = (
  constraints: readonly Constraint[],
  sorts: ReadonlyMap<string, Sort>
): Values | undefined => {
  made = 0;
  try {
    if (!decide(constraints, sorts)) {
      return undefined;
    }
    const values = new Map<string, Rational>();
    let left = [...constraints];
    // Whole variables first: once they have values, what is left may be any
    // number, and the range each of those may take is then exact.
    const names = [...sorts.keys()].sort((a, b) => {
      const whole =
        Number(sorts.get(b) === "integer") - Number(sorts.get(a) === "integer");
      return whole || (a < b ? -1 : 1);
    });
    for (const name of names) {
      const sort = sorts.get(name) as Sort;
      const remaining = new Map([...sorts].filter(([n]) => !values.has(n)));
      let chosen: Rational | undefined;
      for (const value of candidatesIn(rangeOf(name, left, remaining), sort)) {
        made = 0;
        const after = fix(left, name, value);
        remaining.delete(name);
        if (decide(after, remaining)) {
          chosen = value;
          left = after;
          break;
        }
        remaining.set(name, sort);
      }
      if (chosen === undefined) {
        throw new TooHard();
      }
      values.set(name, chosen);
    }
    return values;
  } catch (error) {
    if (error instanceof TooHard) {
      throw tooHard();
    }
    throw error;
  }
};

/** Whether values of the given sorts meet every constraint. */
export const satisfiable = (
  constraints: readonly Constraint[],
  sorts: ReadonlyMap<string, Sort>
) => {
  made = 0;
  try {
    return decide(constraints, sorts);
  } catch (error) {
    if (error instanceof TooHard) {
      throw tooHard();
    }
    throw error;
  }
};

/** The most solutions one question may list, as a schema may list values. */
export const MOST_SOLUTIONS = 100_000;

/** What `enumerate` gives: every solution, or a variable with infinitely many values. */
export type Enumerated =
  | { readonly solutions: readonly Values[] }
  | { readonly infinite: string };

const firstWhole = (bound: { value: Rational; strict: boolean }) =>
  bound.strict ? floor(bound.value) + 1n : ceiling(bound.value);

const lastWhole = (bound: { value: Rational; strict: boolean }) =>
  bound.strict ? ceiling(bound.value) - 1n : floor(bound.value);

function* wholesBetween(first: bigint, last: bigint): Generator<Rational> {
  for (let value = first; value <= last; value += 1n) {
    yield ratio(value);
  }
}

/**
 * The values a variable can take in its range: every whole number in it,
 * or the one number a range that may be any number closes on. Undefined
 * when they are infinitely many.
 */
const choicesIn = (
  { high, low }: Range,
  sort: Sort
): Iterable<Rational> | undefined => {
  if (low === undefined || high === undefined) {
    return undefined;
  }
  if (sort === "integer") {
    return wholesBetween(firstWhole(low), lastWhole(high));
  }
  const closed =
    compare(low.value, high.value) === 0 && !low.strict && !high.strict;
  return closed ? [low.value] : undefined;
};

/**
 * The values `name` can take: from its own range, or, when a real variable
 * is equated to a bounded whole variable (such as `value/integer?`), from
 * that whole variable's range.
 */
const choicesFor = (
  name: string,
  left: readonly Constraint[],
  remaining: ReadonlyMap<string, Sort>
): Iterable<Rational> | undefined => {
  const sort = remaining.get(name) ?? "real";
  const direct = choicesIn(rangeOf(name, left, remaining), sort);
  if (direct !== undefined || sort !== "real") {
    return direct;
  }
  for (const c of left) {
    if (
      c.relation !== "=" ||
      c.linear.coefficients.size !== 2 ||
      !c.linear.coefficients.has(name)
    ) {
      continue;
    }
    const entries = [...c.linear.coefficients];
    const [other, cOther] = entries.find(([n]) => n !== name) as [
      string,
      Rational,
    ];
    if (remaining.get(other) !== "integer") {
      continue;
    }
    const wholes = choicesIn(rangeOf(other, left, remaining), "integer");
    if (wholes !== undefined) {
      const cName = c.linear.coefficients.get(name) as Rational;
      return (function* () {
        for (const v of wholes) {
          yield negate(
            divide(add(multiply(cOther, v), c.linear.constant), cName)
          );
        }
      })();
    }
  }
  return undefined;
};

/**
 * Every combination of values that the variables in `keep` take in some
 * solution, the other variables being any values that meet the constraints
 * with them; or the first variable of `keep` that takes infinitely many. A
 * whole variable takes finitely many when the constraints bound it on both
 * sides; one that may be any number, only when they fix it to one value or
 * equate it to a bounded whole variable.
 */
export const enumerate = (
  constraints: readonly Constraint[],
  sorts: ReadonlyMap<string, Sort>,
  keep: readonly string[]
): Enumerated => {
  const solutions: Values[] = [];
  let infinite: string | undefined;
  const visit = (
    left: readonly Constraint[],
    at: number,
    fixed: Map<string, Rational>,
    remaining: ReadonlyMap<string, Sort>
  ): void => {
    made = 0;
    if (infinite !== undefined || !decide(left, remaining)) {
      return;
    }
    const name = keep[at];
    if (name === undefined) {
      solutions.push(new Map(fixed));
      if (solutions.length > MOST_SOLUTIONS) {
        throw new LogicError({
          message: `A question may give at most ${MOST_SOLUTIONS.toLocaleString("en")} answers from values no goal binds. Narrow it.`,
        });
      }
      return;
    }
    const choices = choicesFor(name, left, remaining);
    if (choices === undefined) {
      infinite = name;
      return;
    }
    const rest = new Map(remaining);
    rest.delete(name);
    for (const value of choices) {
      visit(
        fix(left, name, value),
        at + 1,
        new Map(fixed).set(name, value),
        rest
      );
      if (infinite !== undefined) {
        return;
      }
    }
  };
  try {
    visit(constraints, 0, new Map(), sorts);
  } catch (error) {
    if (error instanceof TooHard) {
      throw tooHard();
    }
    throw error;
  }
  return infinite === undefined ? { solutions } : { infinite };
};

/** One endpoint of an exact symbolic interval, with a witness when attained. */
export interface BoundEnd {
  readonly strict: boolean;
  readonly value: Rational;
  readonly witness?: Values;
}

/** Exact lower and upper bounds of a linear or linear-fractional target. */
export interface Bounds {
  readonly high?: BoundEnd;
  readonly low?: BoundEnd;
}

const stripVar = (
  values: Values | undefined,
  name: string
): Values | undefined => {
  if (values === undefined) {
    return undefined;
  }
  const out = new Map(values);
  out.delete(name);
  return out;
};

const freshName = (sorts: ReadonlyMap<string, Sort>, base: string): string => {
  let name = base;
  let at = 0;
  while (sorts.has(name)) {
    at += 1;
    name = `${base}_${at}`;
  }
  return name;
};

const lcmBig = (a: bigint, b: bigint): bigint =>
  a === 0n || b === 0n ? 0n : (abs(a) / gcd(a, b)) * abs(b);

const exactIntegerBound = (
  branch: readonly Constraint[],
  sorts: ReadonlyMap<string, Sort>,
  targetName: string,
  relEnd: { value: Rational; strict: boolean },
  start: bigint,
  findMin: boolean
): BoundEnd => {
  let lo = findMin ? firstWhole(relEnd) : start;
  let hi = findMin ? start : lastWhole(relEnd);
  while (lo < hi) {
    const mid = findMin ? lo + (hi - lo) / 2n : hi - (hi - lo) / 2n;
    const probe: Constraint = findMin
      ? {
          linear: minus(constant(ratio(mid)), variable(targetName)),
          relation: ">=",
        }
      : {
          linear: minus(variable(targetName), constant(ratio(mid))),
          relation: ">=",
        };
    made = 0;
    if (decide([...branch, probe], sorts)) {
      if (findMin) {
        hi = mid;
      } else {
        lo = mid;
      }
    } else if (findMin) {
      lo = mid + 1n;
    } else {
      hi = mid - 1n;
    }
  }
  const best = ratio(findMin ? lo : hi);
  const witness = stripVar(
    solve(
      [
        ...branch,
        { linear: minus(variable(targetName), constant(best)), relation: "=" },
      ],
      sorts
    ),
    targetName
  );
  return witness === undefined
    ? { strict: false, value: best }
    : { strict: false, value: best, witness };
};

const realEndWithWitness = (
  branch: readonly Constraint[],
  sorts: ReadonlyMap<string, Sort>,
  targetName: string,
  end: { value: Rational; strict: boolean }
): BoundEnd => {
  if (end.strict) {
    return { strict: true, value: end.value };
  }
  const witness = stripVar(
    solve(
      [
        ...branch,
        {
          linear: minus(variable(targetName), constant(end.value)),
          relation: "=",
        },
      ],
      sorts
    ),
    targetName
  );
  return witness === undefined
    ? { strict: false, value: end.value }
    : { strict: false, value: end.value, witness };
};

const mergeLow = (
  current: BoundEnd | undefined,
  next: BoundEnd | undefined
): BoundEnd | undefined => {
  if (current === undefined || next === undefined) {
    return undefined;
  }
  const cmp = compare(next.value, current.value);
  if (cmp < 0) {
    return next;
  }
  if (cmp === 0 && current.strict && !next.strict) {
    return next;
  }
  return current;
};

const mergeHigh = (
  current: BoundEnd | undefined,
  next: BoundEnd | undefined
): BoundEnd | undefined => {
  if (current === undefined || next === undefined) {
    return undefined;
  }
  const cmp = compare(next.value, current.value);
  if (cmp > 0) {
    return next;
  }
  if (cmp === 0 && current.strict && !next.strict) {
    return next;
  }
  return current;
};

/** Accumulator for merging exact lower/upper bounds across disjunctive branches. */
export interface BoundsAcc {
  anySat: boolean;
  high: BoundEnd | undefined;
  highUnbounded: boolean;
  low: BoundEnd | undefined;
  lowUnbounded: boolean;
}

export const makeBoundsAcc = (): BoundsAcc => ({
  anySat: false,
  high: undefined,
  highUnbounded: false,
  low: undefined,
  lowUnbounded: false,
});

export const mergeBoundsInto = (
  acc: BoundsAcc,
  branchLow: BoundEnd | undefined,
  branchHigh: BoundEnd | undefined
): void => {
  if (!acc.anySat) {
    acc.anySat = true;
    acc.low = branchLow;
    acc.lowUnbounded = branchLow === undefined;
    acc.high = branchHigh;
    acc.highUnbounded = branchHigh === undefined;
    return;
  }
  if (branchLow === undefined) {
    acc.lowUnbounded = true;
    acc.low = undefined;
  } else if (!acc.lowUnbounded) {
    acc.low = mergeLow(acc.low, branchLow);
  }
  if (branchHigh === undefined) {
    acc.highUnbounded = true;
    acc.high = undefined;
  } else if (!acc.highUnbounded) {
    acc.high = mergeHigh(acc.high, branchHigh);
  }
};

export const finishBounds = (
  acc: BoundsAcc,
  mapEnd: (end: BoundEnd | undefined) => BoundEnd | undefined = (e) => e
): Bounds | undefined => {
  if (!acc.anySat) {
    return undefined;
  }
  const low = acc.lowUnbounded ? undefined : mapEnd(acc.low);
  const high = acc.highUnbounded ? undefined : mapEnd(acc.high);
  return {
    ...(low === undefined ? {} : { low }),
    ...(high === undefined ? {} : { high }),
  };
};

const MAX_BNB_NODES = 256;
const MAX_DINKELBACH_STEPS = 64;
const MAX_BILINEAR_INT_SLICE = 500n;

const isIntegralRational = (r: Rational): boolean => r.d === 1n;

const lpOptimum = (
  branch: readonly Constraint[],
  realSorts: ReadonlyMap<string, Sort>,
  targetName: string,
  isLow: boolean
): BoundEnd | undefined => {
  made = 0;
  if (!decide(branch, realSorts)) {
    return undefined;
  }
  const range = rangeOf(targetName, branch, realSorts);
  const end = isLow ? range.low : range.high;
  if (end === undefined) {
    return undefined;
  }
  return realEndWithWitness(branch, realSorts, targetName, end);
};

const betterBound = (
  candidate: BoundEnd,
  incumbent: BoundEnd | undefined,
  isLow: boolean
): boolean => {
  if (incumbent === undefined) {
    return true;
  }
  const cmp = compare(candidate.value, incumbent.value);
  return isLow ? cmp < 0 : cmp > 0;
};

const makeBoundEnd = (
  value: Rational,
  strict: boolean,
  witness: Values | undefined
): BoundEnd =>
  witness === undefined || strict
    ? { strict, value }
    : { strict, value, witness };

/**
 * Exact branch-and-bound for mixed-integer linear optimization when the LP
 * relaxation optimum is not attained by integer values.
 */
const fallbackMixedCandidate = (
  cur: readonly Constraint[],
  extSorts: ReadonlyMap<string, Sort>,
  targetName: string
): BoundEnd | undefined => {
  const feas = solve(cur, extSorts);
  const fVal = feas?.get(targetName);
  if (feas === undefined || fVal === undefined) {
    return undefined;
  }
  return makeBoundEnd(fVal, false, stripVar(feas, targetName));
};

const pushIntegerBranch = (
  stack: (readonly Constraint[])[],
  cur: readonly Constraint[],
  fracVar: string,
  fracVal: Rational
): void => {
  const fl = floor(fracVal);
  stack.push(
    [
      ...cur,
      {
        linear: minus(constant(ratio(fl)), variable(fracVar)),
        relation: ">=",
      },
    ],
    [
      ...cur,
      {
        linear: minus(variable(fracVar), constant(ratio(fl + 1n))),
        relation: ">=",
      },
    ]
  );
};

const mixedBranchAndBound = (
  branch: readonly Constraint[],
  extSorts: ReadonlyMap<string, Sort>,
  targetName: string,
  isLow: boolean
): BoundEnd | undefined => {
  const realSorts = new Map<string, Sort>(
    [...extSorts.keys()].map((k) => [k, "real"])
  );
  const intVars = [...extSorts.entries()]
    .filter(([k, s]) => k !== targetName && s === "integer")
    .map(([k]) => k);

  let incumbent = fallbackMixedCandidate(branch, extSorts, targetName);
  if (incumbent === undefined && solve(branch, extSorts) === undefined) {
    return undefined;
  }

  const stack: (readonly Constraint[])[] = [branch];
  let nodes = 0;
  while (stack.length > 0) {
    nodes += 1;
    if (nodes > MAX_BNB_NODES) {
      throw new LogicError({
        message:
          "proof/bounds exceeded branch-and-bound limit on mixed-integer constraints.",
      });
    }
    const cur = stack.pop() as readonly Constraint[];
    const lp = lpOptimum(cur, realSorts, targetName, isLow);
    if (lp === undefined || !betterBound(lp, incumbent, isLow)) {
      continue;
    }
    if (lp.witness === undefined) {
      const cand = fallbackMixedCandidate(cur, extSorts, targetName);
      if (cand !== undefined && betterBound(cand, incumbent, isLow)) {
        incumbent = cand;
      }
      continue;
    }
    const fracVar = intVars.find((name) => {
      const v = lp.witness?.get(name);
      return v !== undefined && !isIntegralRational(v);
    });
    if (fracVar === undefined) {
      incumbent = lp;
    } else {
      pushIntegerBranch(
        stack,
        cur,
        fracVar,
        lp.witness.get(fracVar) as Rational
      );
    }
  }
  return incumbent;
};

const mixedEndpoint = (
  branch: readonly Constraint[],
  extSorts: ReadonlyMap<string, Sort>,
  targetName: string,
  end: { readonly strict: boolean; readonly value: Rational } | undefined,
  targetSort: Sort,
  initTarget: bigint,
  isLow: boolean
): BoundEnd | undefined => {
  if (end === undefined) {
    return undefined;
  }
  if (targetSort === "integer") {
    return exactIntegerBound(
      branch,
      extSorts,
      targetName,
      end,
      initTarget,
      isLow
    );
  }
  const direct = realEndWithWitness(branch, extSorts, targetName, end);
  if (direct.witness !== undefined || direct.strict) {
    return direct;
  }
  return mixedBranchAndBound(branch, extSorts, targetName, isLow);
};

const branchLinearBounds = (
  branch: readonly Constraint[],
  extSorts: ReadonlyMap<string, Sort>,
  targetName: string,
  targetSort: Sort,
  allReal: boolean
):
  | { readonly high: BoundEnd | undefined; readonly low: BoundEnd | undefined }
  | undefined => {
  made = 0;
  if (!decide(branch, extSorts)) {
    return undefined;
  }
  const range = rangeOf(targetName, branch, extSorts);
  if (allReal) {
    return {
      high:
        range.high === undefined
          ? undefined
          : realEndWithWitness(branch, extSorts, targetName, range.high),
      low:
        range.low === undefined
          ? undefined
          : realEndWithWitness(branch, extSorts, targetName, range.low),
    };
  }
  const init = solve(branch, extSorts);
  if (init === undefined) {
    return undefined;
  }
  const t0 = (init.get(targetName) as Rational).n;
  return {
    high: mixedEndpoint(
      branch,
      extSorts,
      targetName,
      range.high,
      targetSort,
      t0,
      false
    ),
    low: mixedEndpoint(
      branch,
      extSorts,
      targetName,
      range.low,
      targetSort,
      t0,
      true
    ),
  };
};

/**
 * Exact tight lower and upper bounds of a linear expression `target` over
 * `constraints` and `sorts` (undefined when unsatisfiable). Uses exact
 * Fourier-Motzkin projection for reals and exact binary-search Omega over
 * integer/scaled-integer targets, returning concrete witnesses when attained.
 */
export const linearBoundsOf = (
  constraints: readonly Constraint[],
  sorts: ReadonlyMap<string, Sort>,
  target: Linear
): Bounds | undefined => {
  const targetName = freshName(sorts, "__bound");
  const allTargetVarsInt = [...target.coefficients.keys()].every(
    (name) => sorts.get(name) === "integer"
  );
  const scaleDen = allTargetVarsInt
    ? [...target.coefficients.values(), target.constant].reduce(
        (acc, r) => lcmBig(acc, r.d),
        1n
      )
    : 1n;
  const scaledTarget =
    allTargetVarsInt && scaleDen > 1n ? times(target, ratio(scaleDen)) : target;
  const targetSort: Sort = allTargetVarsInt ? "integer" : "real";
  const extSorts = new Map(sorts);
  extSorts.set(targetName, targetSort);
  const eqTarget: Constraint = {
    linear: minus(scaledTarget, variable(targetName)),
    relation: "=",
  };
  const allReal = [...extSorts.values()].every((s) => s === "real");
  const unscaleEnd = (end: BoundEnd | undefined): BoundEnd | undefined => {
    if (end === undefined || scaleDen === 1n) {
      return end;
    }
    const value = divide(end.value, ratio(scaleDen));
    return end.witness === undefined
      ? { strict: end.strict, value }
      : { strict: end.strict, value, witness: end.witness };
  };

  try {
    const acc = makeBoundsAcc();
    for (const branch of cases([...constraints, eqTarget])) {
      const b = branchLinearBounds(
        branch,
        extSorts,
        targetName,
        targetSort,
        allReal
      );
      if (b !== undefined) {
        mergeBoundsInto(acc, b.low, b.high);
      }
    }
    return finishBounds(acc, unscaleEnd);
  } catch (error) {
    if (error instanceof TooHard) {
      throw tooHard();
    }
    throw error;
  }
};

const evalRatioAt = (
  bNum: Linear,
  bDen: Linear,
  values: Values
): Rational | undefined => {
  const n = valueAt(bNum, values);
  const d = valueAt(bDen, values);
  if (n === undefined || d === undefined || isZero(d)) {
    return undefined;
  }
  return divide(n, d);
};

/**
 * Exact Dinkelbach parametric optimization for a linear-fractional ratio
 * `bNum / bDen` with `bDen > 0` over integer or mixed-integer linear constraints.
 */
const dinkelbachEnd = (
  branchConstraints: readonly Constraint[],
  sorts: ReadonlyMap<string, Sort>,
  bNum: Linear,
  bDen: Linear,
  findMax: boolean
): BoundEnd | undefined => {
  const init = solve(branchConstraints, sorts);
  if (init === undefined) {
    return undefined;
  }
  let witness = init;
  let lambda = evalRatioAt(bNum, bDen, witness);
  if (lambda === undefined) {
    return undefined;
  }
  for (let iter = 0; iter < MAX_DINKELBACH_STEPS; iter += 1) {
    const obj = findMax
      ? minus(bNum, times(bDen, lambda))
      : minus(times(bDen, lambda), bNum);
    const res = linearBoundsOf(branchConstraints, sorts, obj);
    if (res?.high === undefined) {
      return undefined;
    }
    if (compare(res.high.value, ZERO) <= 0) {
      return { strict: false, value: lambda, witness };
    }
    const nextWitness = res.high.witness;
    if (nextWitness === undefined) {
      return { strict: true, value: lambda };
    }
    const nextLambda = evalRatioAt(bNum, bDen, nextWitness);
    const improved =
      nextLambda !== undefined &&
      (findMax
        ? compare(nextLambda, lambda) > 0
        : compare(nextLambda, lambda) < 0);
    if (!improved || nextLambda === undefined) {
      return { strict: false, value: lambda, witness };
    }
    lambda = nextLambda;
    witness = nextWitness;
  }
  throw new LogicError({
    message:
      "proof/bounds exceeded iteration limit on integer ratio constraints.",
  });
};

/**
 * Exact tight lower and upper bounds of a linear-fractional ratio `num / den`
 * via Charnes-Cooper over continuous variables and exact Dinkelbach parametric
 * optimization when any variable is integer-sorted.
 */
export const ratioBoundsOf = (
  constraints: readonly Constraint[],
  sorts: ReadonlyMap<string, Sort>,
  num: Linear,
  den: Linear
): Bounds | undefined => {
  if ([...sorts.values()].some((s) => s !== "real")) {
    const acc = makeBoundsAcc();
    const signBranches: readonly [Linear, Linear][] = [
      [num, den],
      [times(num, negate(ONE)), times(den, negate(ONE))],
    ];
    for (const [bNum, bDen] of signBranches) {
      const branchConstraints: Constraint[] = [
        ...constraints,
        { linear: bDen, relation: ">" },
      ];
      if (solve(branchConstraints, sorts) === undefined) {
        continue;
      }
      const low = dinkelbachEnd(branchConstraints, sorts, bNum, bDen, false);
      const high = dinkelbachEnd(branchConstraints, sorts, bNum, bDen, true);
      mergeBoundsInto(acc, low, high);
    }
    return finishBounds(acc);
  }
  const sName = freshName(sorts, "__cc_s");
  const ccSorts = new Map(sorts);
  ccSorts.set(sName, "real");

  const homogenize = (lin: Linear): Linear => {
    const coefficients = new Map(lin.coefficients);
    if (!isZero(lin.constant)) {
      coefficients.set(sName, lin.constant);
    }
    return { coefficients, constant: ZERO };
  };

  const mapEnd = (end: BoundEnd | undefined): BoundEnd | undefined => {
    if (end === undefined) {
      return undefined;
    }
    const sVal = end.witness?.get(sName);
    if (end.witness === undefined || sVal === undefined || isZero(sVal)) {
      return { strict: end.strict, value: end.value };
    }
    const witness = new Map<string, Rational>();
    for (const [name, val] of end.witness) {
      if (name !== sName) {
        witness.set(name, divide(val, sVal));
      }
    }
    return { strict: end.strict, value: end.value, witness };
  };

  const acc = makeBoundsAcc();
  const signBranches: readonly [Linear, Linear][] = [
    [num, den],
    [times(num, negate(ONE)), times(den, negate(ONE))],
  ];

  for (const [bNum, bDen] of signBranches) {
    const ccConstraints: Constraint[] = [
      ...constraints.map((c) => ({
        linear: homogenize(c.linear),
        relation: c.relation,
      })),
      { linear: variable(sName), relation: ">" },
      { linear: minus(homogenize(bDen), constant(ONE)), relation: "=" },
    ];
    const res = linearBoundsOf(ccConstraints, ccSorts, homogenize(bNum));
    if (res !== undefined) {
      mergeBoundsInto(acc, mapEnd(res.low), mapEnd(res.high));
    }
  }
  return finishBounds(acc);
};

/** Finds all variables transitively coupled with `seeds` through `constraints`. */
const coupledVariables = (
  constraints: readonly Constraint[],
  seeds: readonly string[]
): Set<string> => {
  const adj = new Map<string, Set<string>>();
  for (const c of constraints) {
    const vars = [...c.linear.coefficients.keys()];
    for (const u of vars) {
      let set = adj.get(u);
      if (set === undefined) {
        set = new Set();
        adj.set(u, set);
      }
      for (const v of vars) {
        if (v !== u) {
          set.add(v);
        }
      }
    }
  }
  const visited = new Set<string>(seeds);
  const queue = [...seeds];
  for (const u of queue) {
    for (const v of adj.get(u) ?? []) {
      if (!visited.has(v)) {
        visited.add(v);
        queue.push(v);
      }
    }
  }
  return visited;
};

const evalQuad1 = (a: Rational, b: Rational, c: Rational, x: Rational) =>
  add(add(multiply(a, multiply(x, x)), multiply(b, x)), c);

const evalBilin = (
  k: Rational,
  a: Rational,
  b: Rational,
  c: Rational,
  x: Rational,
  y: Rational
) =>
  add(add(add(multiply(k, multiply(x, y)), multiply(a, x)), multiply(b, y)), c);

const mergeWitnessMaps = (
  a: Values | undefined,
  b: Values | undefined
): Values | undefined => {
  if (a === undefined && b === undefined) {
    return undefined;
  }
  const merged = new Map<string, Rational>(a ?? []);
  if (b !== undefined) {
    for (const [k, v] of b) {
      if (!merged.has(k)) {
        merged.set(k, v);
      }
    }
  }
  return merged;
};

const addBounds = (
  first: Bounds | undefined,
  second: Bounds | undefined
): Bounds | undefined => {
  if (first === undefined || second === undefined) {
    return undefined;
  }
  const low =
    first.low === undefined || second.low === undefined
      ? undefined
      : makeBoundEnd(
          add(first.low.value, second.low.value),
          first.low.strict || second.low.strict,
          mergeWitnessMaps(first.low.witness, second.low.witness)
        );
  const high =
    first.high === undefined || second.high === undefined
      ? undefined
      : makeBoundEnd(
          add(first.high.value, second.high.value),
          first.high.strict || second.high.strict,
          mergeWitnessMaps(first.high.witness, second.high.witness)
        );
  return {
    ...(low === undefined ? {} : { low }),
    ...(high === undefined ? {} : { high }),
  };
};

const withinBounds1d = (vBounds: Bounds, pt: Rational): boolean => {
  const insideLow =
    vBounds.low === undefined ||
    (vBounds.low.strict
      ? compare(pt, vBounds.low.value) > 0
      : compare(pt, vBounds.low.value) >= 0);
  const insideHigh =
    vBounds.high === undefined ||
    (vBounds.high.strict
      ? compare(pt, vBounds.high.value) < 0
      : compare(pt, vBounds.high.value) <= 0);
  return insideLow && insideHigh;
};

const univariateQuadraticBounds = (
  branch: readonly Constraint[],
  sorts: ReadonlyMap<string, Sort>,
  v: string,
  a: Rational,
  b: Rational,
  c: Rational
): Bounds | undefined => {
  const vBounds = linearBoundsOf(branch, sorts, variable(v));
  if (vBounds === undefined) {
    return undefined;
  }
  const candidates: { readonly strict: boolean; readonly x: Rational }[] = [];
  if (vBounds.low !== undefined) {
    candidates.push({ strict: vBounds.low.strict, x: vBounds.low.value });
  }
  if (vBounds.high !== undefined) {
    candidates.push({ strict: vBounds.high.strict, x: vBounds.high.value });
  }
  const vertex = divide(negate(b), multiply(ratio(2n), a));
  const vertexPts =
    sorts.get(v) === "integer"
      ? [ratio(floor(vertex)), ratio(ceiling(vertex))]
      : [vertex];
  for (const pt of vertexPts) {
    if (
      withinBounds1d(vBounds, pt) &&
      solve(
        [
          ...branch,
          { linear: minus(variable(v), constant(pt)), relation: "=" },
        ],
        sorts
      ) !== undefined
    ) {
      candidates.push({ strict: false, x: pt });
    }
  }
  const acc = makeBoundsAcc();
  for (const { strict, x } of candidates) {
    const val = evalQuad1(a, b, c, x);
    const witness = strict
      ? undefined
      : solve(
          [
            ...branch,
            { linear: minus(variable(v), constant(x)), relation: "=" },
          ],
          sorts
        );
    const end = makeBoundEnd(val, strict, witness);
    mergeBoundsInto(acc, end, end);
  }
  if (vBounds.low === undefined || vBounds.high === undefined) {
    if (compare(a, ZERO) > 0) {
      acc.highUnbounded = true;
      acc.high = undefined;
    } else {
      acc.lowUnbounded = true;
      acc.low = undefined;
    }
  }
  return finishBounds(acc);
};

const pointSatisfies2d = (
  poly: readonly Constraint[],
  xName: string,
  yName: string,
  x: Rational,
  y: Rational
): { readonly ok: boolean; readonly strictBoundary: boolean } => {
  const vals = new Map<string, Rational>([
    [xName, x],
    [yName, y],
  ]);
  let strictBoundary = false;
  for (const c of poly) {
    const v = valueAt(c.linear, vals);
    if (v === undefined) {
      continue;
    }
    const s = compare(v, ZERO);
    if (c.relation === "=" && s !== 0) {
      return { ok: false, strictBoundary: false };
    }
    if (c.relation === ">=" && s < 0) {
      return { ok: false, strictBoundary: false };
    }
    if (c.relation === ">") {
      if (s < 0) {
        return { ok: false, strictBoundary: false };
      }
      if (s === 0) {
        strictBoundary = true;
      }
    }
  }
  return { ok: true, strictBoundary };
};

interface BilinearTerms {
  readonly a: Rational;
  readonly b: Rational;
  readonly c: Rational;
  readonly k: Rational;
  readonly xName: string;
  readonly yName: string;
}

const bilinearIntegerSlice = (
  branch: readonly Constraint[],
  sorts: ReadonlyMap<string, Sort>,
  terms: BilinearTerms,
  xInt: boolean
): Bounds | undefined => {
  const sliceVar = xInt ? terms.xName : terms.yName;
  const otherVar = xInt ? terms.yName : terms.xName;
  const sBounds = linearBoundsOf(branch, sorts, variable(sliceVar));
  if (sBounds === undefined) {
    return undefined;
  }
  if (
    sBounds.low === undefined ||
    sBounds.high === undefined ||
    sBounds.high.value.n - sBounds.low.value.n > MAX_BILINEAR_INT_SLICE
  ) {
    throw new LogicError({
      message:
        "proof/bounds requires bounded integer ranges (span <= 500) for integer bilinear products.",
    });
  }
  const acc = makeBoundsAcc();
  for (let m = sBounds.low.value.n; m <= sBounds.high.value.n; m += 1n) {
    const mr = ratio(m);
    const sliced = [
      ...branch,
      {
        linear: minus(variable(sliceVar), constant(mr)),
        relation: "=" as const,
      },
    ];
    const otherCoeff = xInt
      ? add(multiply(terms.k, mr), terms.b)
      : add(multiply(terms.k, mr), terms.a);
    const constTerm = xInt
      ? add(multiply(terms.a, mr), terms.c)
      : add(multiply(terms.b, mr), terms.c);
    const linTarget: Linear = {
      coefficients: isZero(otherCoeff)
        ? new Map()
        : new Map([[otherVar, otherCoeff]]),
      constant: constTerm,
    };
    const sub = linearBoundsOf(sliced, sorts, linTarget);
    if (sub !== undefined) {
      mergeBoundsInto(acc, sub.low, sub.high);
    }
  }
  return finishBounds(acc);
};

interface Candidate2d {
  readonly strict: boolean;
  readonly x: Rational;
  readonly y: Rational;
}

const collectBilinearCandidates = (
  poly: readonly Constraint[],
  lines: readonly Constraint[],
  terms: BilinearTerms
): Candidate2d[] => {
  const candidates: Candidate2d[] = [];
  const { a, b, k, xName, yName } = terms;
  const maybePush = (x: Rational, y: Rational): void => {
    const chk = pointSatisfies2d(poly, xName, yName, x, y);
    if (chk.ok) {
      candidates.push({ strict: chk.strictBoundary, x, y });
    }
  };
  for (let i = 0; i < lines.length; i += 1) {
    const li = lines[i] as Constraint;
    const a1 = li.linear.coefficients.get(xName) ?? ZERO;
    const b1 = li.linear.coefficients.get(yName) ?? ZERO;
    const c1 = li.linear.constant;
    for (let j = i + 1; j < lines.length; j += 1) {
      const lj = lines[j] as Constraint;
      const a2 = lj.linear.coefficients.get(xName) ?? ZERO;
      const b2 = lj.linear.coefficients.get(yName) ?? ZERO;
      const c2 = lj.linear.constant;
      const det = subtract(multiply(a1, b2), multiply(a2, b1));
      if (!isZero(det)) {
        maybePush(
          divide(subtract(multiply(b1, c2), multiply(b2, c1)), det),
          divide(subtract(multiply(a2, c1), multiply(a1, c2)), det)
        );
      }
    }
    if (!(isZero(a1) || isZero(b1))) {
      const denom = multiply(ratio(2n), multiply(k, a1));
      const xs = divide(
        subtract(subtract(multiply(a, b1), multiply(k, c1)), multiply(b, a1)),
        denom
      );
      maybePush(xs, divide(negate(add(multiply(a1, xs), c1)), b1));
    }
  }
  return candidates;
};

const bilinearBounds2d = (
  branch: readonly Constraint[],
  sorts: ReadonlyMap<string, Sort>,
  terms: BilinearTerms
): Bounds | undefined => {
  const { a, b, c, k, xName, yName } = terms;
  const xInt = sorts.get(xName) === "integer";
  if (xInt || sorts.get(yName) === "integer") {
    return bilinearIntegerSlice(branch, sorts, terms, xInt);
  }
  const xRange = linearBoundsOf(branch, sorts, variable(xName));
  const yRange = linearBoundsOf(branch, sorts, variable(yName));
  if (xRange === undefined || yRange === undefined) {
    return undefined;
  }
  if (
    xRange.low === undefined ||
    xRange.high === undefined ||
    yRange.low === undefined ||
    yRange.high === undefined
  ) {
    throw new LogicError({
      message:
        "proof/bounds requires bounded variables for continuous bilinear products.",
    });
  }
  const relaxed = new Map<string, Sort>(
    [...sorts.keys()].map((n) => [
      n,
      n === xName || n === yName ? "integer" : "real",
    ])
  );
  const poly = withoutReals(branch, relaxed);
  if (poly === false) {
    return undefined;
  }
  const lines = poly.filter(
    (con) =>
      con.linear.coefficients.has(xName) || con.linear.coefficients.has(yName)
  );
  const candidates = collectBilinearCandidates(poly, lines, terms);
  if (candidates.length === 0) {
    return undefined;
  }
  const acc = makeBoundsAcc();
  for (const pt of candidates) {
    const val = evalBilin(k, a, b, c, pt.x, pt.y);
    const witness = pt.strict
      ? undefined
      : solve(
          [
            ...branch,
            { linear: minus(variable(xName), constant(pt.x)), relation: "=" },
            { linear: minus(variable(yName), constant(pt.y)), relation: "=" },
          ],
          sorts
        );
    const end = makeBoundEnd(val, pt.strict, witness);
    mergeBoundsInto(acc, end, end);
  }
  return finishBounds(acc);
};

const parseQuadraticTarget = (
  constraints: readonly Constraint[],
  linear: Linear,
  nonlinear: ReadonlyMap<string, Rational>
): {
  readonly hasRest: boolean;
  readonly restLinear: Linear;
  readonly terms: BilinearTerms;
} => {
  if (nonlinear.size !== 1) {
    throw new LogicError({
      message:
        "proof/bounds supports linear, linear-fractional, univariate quadratic, and single bilinear products.",
    });
  }
  const [[monomial, k]] = [...nonlinear.entries()] as [[string, Rational]];
  const factors = monomial.split("*");
  if (factors.length !== 2) {
    throw new LogicError({
      message:
        "proof/bounds supports linear, linear-fractional, univariate quadratic, and single bilinear products.",
    });
  }
  const [xName, yName] = factors as [string, string];
  const coupled = coupledVariables(
    constraints,
    xName === yName ? [xName] : [xName, yName]
  );
  const restCoeffs = new Map<string, Rational>();
  for (const [name, coeff] of linear.coefficients) {
    if (name === xName || name === yName) {
      continue;
    }
    if (coupled.has(name)) {
      throw new LogicError({
        message:
          "proof/bounds cannot optimize a bilinear product coupled with an additional linear variable in the same target.",
      });
    }
    restCoeffs.set(name, coeff);
  }
  const a = linear.coefficients.get(xName) ?? ZERO;
  const b = xName === yName ? ZERO : (linear.coefficients.get(yName) ?? ZERO);
  return {
    hasRest: restCoeffs.size > 0,
    restLinear: { coefficients: restCoeffs, constant: ZERO },
    terms: { a, b, c: linear.constant, k, xName, yName },
  };
};

/**
 * Exact tight bounds for univariate quadratic (`a*x^2 + b*x + c`) and bilinear
 * (`k*x*y + a*x + b*y + c`) targets, optionally plus an independent linear sum
 * over disconnected variables (e.g. `direct + stakeA * stakeB`).
 */
export const quadraticBoundsOf = (
  constraints: readonly Constraint[],
  sorts: ReadonlyMap<string, Sort>,
  linear: Linear,
  nonlinear: ReadonlyMap<string, Rational>
): Bounds | undefined => {
  const { hasRest, restLinear, terms } = parseQuadraticTarget(
    constraints,
    linear,
    nonlinear
  );
  try {
    const acc = makeBoundsAcc();
    for (const branch of cases(constraints)) {
      const mainBounds =
        terms.xName === terms.yName
          ? univariateQuadraticBounds(
              branch,
              sorts,
              terms.xName,
              terms.k,
              terms.a,
              terms.c
            )
          : bilinearBounds2d(branch, sorts, terms);
      if (mainBounds === undefined) {
        continue;
      }
      if (hasRest) {
        const restBounds = linearBoundsOf(branch, sorts, restLinear);
        const combined = addBounds(mainBounds, restBounds);
        if (combined !== undefined) {
          mergeBoundsInto(acc, combined.low, combined.high);
        }
      } else {
        mergeBoundsInto(acc, mainBounds.low, mainBounds.high);
      }
    }
    return finishBounds(acc);
  } catch (error) {
    if (error instanceof TooHard) {
      throw tooHard();
    }
    throw error;
  }
};

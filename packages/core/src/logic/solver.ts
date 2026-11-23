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

/**
 * Certificates for the solver's proofs that no values meet some
 * constraints. A certificate is a list of lines, each a constraint with
 * whole-number coefficients: first the constraints themselves, then lines
 * made from earlier ones. A made line adds earlier lines, each multiplied
 * by a whole number, which is not negative unless the line is an equation;
 * where every variable is a whole number it may also be tightened: divided
 * by the greatest common divisor of its coefficients, with its constant
 * rounded down. The last line has no variables and is false. So whoever
 * holds a certificate can check the proof with plain arithmetic, without
 * trusting the solver: Farkas' lemma for numbers that may be any number,
 * and the rounding of Chvátal and Gomory for whole numbers.
 *
 * The certificate comes from eliminating the variables one at a time, as
 * Fourier and Motzkin do, keeping how each line was made. That always
 * refutes constraints over numbers that may be any number. Over whole
 * numbers, a few problems have no solution only because of the Omega test's
 * dark and grey shadows, and get no certificate here.
 */

import {
  type Constraint,
  constant,
  minus,
  type Sort,
  solve,
  variable,
} from "@/logic/solver";
import {
  compareNumbers,
  floor as floorRat,
  fromRational,
  gcd,
  isNumber,
  type LionNumber,
  ratio,
  toRational,
} from "@/numbers/exact";

/** A line of a certificate: whole-number coefficients by variable, a constant, and a relation to 0. */
export interface Line {
  readonly constant: LionNumber;
  readonly relation: ">=" | ">" | "=";
  readonly sum: Readonly<Record<string, LionNumber>>;
}

/** How a line is made: earlier lines, each with its multiplier, added, and maybe tightened. */
export interface Step {
  readonly from: readonly (readonly [number, LionNumber])[];
  readonly tightened: boolean;
}

/** A proof that some constraints have no solution, line by line. */
export interface Certificate {
  readonly constraints: readonly Line[];
  readonly steps: readonly Step[];
}

/**
 * An integer dichotomy proof: splits an integer linear expression `expr` at
 * `bound` into `expr <= bound` (`low`) and `expr >= bound + 1` (`high`),
 * certifying Omega dark/grey shadow integer refutations.
 */
export interface SplitCertificate {
  readonly bound: LionNumber;
  readonly constraints: readonly Line[];
  readonly expr: Readonly<Record<string, LionNumber>>;
  readonly high: ProofCertificate;
  readonly kind: "split";
  readonly low: ProofCertificate;
}

export type ProofCertificate = Certificate | SplitCertificate;

/** The most lines a certificate may make, so that looking for one ends soon. */
const MOST_LINES = 20_000;

interface Whole {
  readonly coefficients: ReadonlyMap<string, bigint>;
  readonly constant: bigint;
  readonly relation: ">=" | ">" | "=";
}

const lcm = (a: bigint, b: bigint) => (a / (gcd(a, b) || 1n)) * b;

/** A constraint as whole numbers: multiplied by a positive whole number. */
const wholeOf = (c: Constraint): Whole => {
  let scale = c.linear.constant.d;
  for (const k of c.linear.coefficients.values()) {
    scale = lcm(scale, k.d);
  }
  const coefficients = new Map(
    [...c.linear.coefficients]
      .map(([name, k]): [string, bigint] => [name, (k.n * scale) / k.d])
      .filter(([, k]) => k !== 0n)
  );
  const relation = c.relation as Whole["relation"];
  return {
    coefficients,
    constant: (c.linear.constant.n * scale) / c.linear.constant.d,
    relation,
  };
};

/** Lines added, each multiplied: what a step makes before tightening. */
export const combine = <W extends Whole>(
  lines: readonly W[],
  from: readonly (readonly [number, bigint])[]
): Whole => {
  const coefficients = new Map<string, bigint>();
  let constant = 0n;
  let inequality = false;
  let strict = false;
  for (const [at, m] of from) {
    const line = lines[at] as W;
    if (m === 0n) {
      continue;
    }
    for (const [name, k] of line.coefficients) {
      coefficients.set(name, (coefficients.get(name) ?? 0n) + m * k);
    }
    constant += m * line.constant;
    if (line.relation !== "=") {
      inequality = true;
      strict ||= line.relation === ">";
    }
  }
  for (const [name, k] of [...coefficients]) {
    if (k === 0n) {
      coefficients.delete(name);
    }
  }
  let relation: Whole["relation"] = "=";
  if (inequality) {
    relation = strict ? ">" : ">=";
  }
  return { coefficients, constant, relation };
};

const floorDiv = (a: bigint, b: bigint) => {
  const q = a / b;
  return a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q;
};

/**
 * A line over whole numbers tightened: a strict one made at least one, then
 * divided by the greatest common divisor of its coefficients, its constant
 * rounded down; an equation whose constant the divisor does not divide is
 * false. Undefined for that false equation.
 */
export const tighten = (line: Whole): Whole | undefined => {
  let { constant } = line;
  let relation = line.relation;
  if (relation === ">") {
    constant -= 1n;
    relation = ">=";
  }
  const g = [...line.coefficients.values()].reduce(
    (a, k) => gcd(a, k < 0n ? -k : k),
    0n
  );
  if (g <= 1n) {
    return { coefficients: line.coefficients, constant, relation };
  }
  if (relation === "=" && constant % g !== 0n) {
    return undefined;
  }
  return {
    coefficients: new Map(
      [...line.coefficients].map(([name, k]) => [name, k / g])
    ),
    constant: relation === "=" ? constant / g : floorDiv(constant, g),
    relation,
  };
};

/** Whether a line with no variables is false. */
export const isFalse = (line: Whole | undefined) => {
  if (line === undefined) {
    return true;
  }
  if (line.coefficients.size > 0) {
    return false;
  }
  switch (line.relation) {
    case ">=":
      return line.constant < 0n;
    case ">":
      return line.constant <= 0n;
    default:
      return line.constant !== 0n;
  }
};

interface Made extends Whole {
  readonly at: number;
}

/**
 * A certificate that the constraints, none of them "not equal", have no
 * solution; undefined when elimination does not refute them.
 */
export const refute = (
  constraints: readonly Constraint[],
  sorts: ReadonlyMap<string, Sort>
): Certificate | undefined => {
  if (constraints.some((c) => c.relation === "!=")) {
    return undefined;
  }
  const lines: Whole[] = constraints.map(wholeOf);
  const steps: { from: (readonly [number, bigint])[]; tightened: boolean }[] =
    [];
  const whole = (line: Whole) =>
    [...line.coefficients.keys()].every(
      (name) => sorts.get(name) === "integer"
    );
  // Adds a line made of earlier ones, tightened when it can be; says
  // whether it is false.
  const make = (from: (readonly [number, bigint])[]): Made | "false" => {
    const combined = combine(lines, from);
    const tightened = whole(combined) ? tighten(combined) : combined;
    const used = tightened !== combined;
    steps.push({ from, tightened: used });
    if (tightened === undefined || isFalse(tightened)) {
      lines.push(tightened ?? combined);
      return "false";
    }
    lines.push(tightened);
    return { ...tightened, at: lines.length - 1 };
  };
  let current: Made[] = [];
  for (const [at, line] of lines.slice(0, constraints.length).entries()) {
    if (isFalse(line)) {
      return finish(constraints.length, lines, steps, at);
    }
    // A strict constraint, or one whose coefficients share a divisor, over
    // whole numbers is tightened before anything is made from it.
    const tightens =
      whole(line) &&
      line.coefficients.size > 0 &&
      (line.relation === ">" || tighten(line)?.constant !== line.constant);
    if (!tightens) {
      current.push({ ...line, at });
      continue;
    }
    const made = make([[at, 1n]]);
    if (made === "false") {
      return finish(constraints.length, lines, steps, lines.length - 1);
    }
    current.push(made);
  }
  // Numbers that may be any number go first, so that every line left over
  // whole numbers can be tightened.
  const order = (names: Iterable<string>) =>
    [...new Set(names)].sort((a, b) => {
      const real = (n: string) => (sorts.get(n) === "integer" ? 1 : 0);
      return real(a) - real(b) || (a < b ? -1 : 1);
    });
  for (;;) {
    const [name] = order(current.flatMap((l) => [...l.coefficients.keys()]));
    if (name === undefined) {
      return undefined;
    }
    const next = eliminate(current, name, make);
    if (next === "false") {
      return finish(constraints.length, lines, steps, lines.length - 1);
    }
    if (next === undefined || lines.length > MOST_LINES) {
      return undefined;
    }
    current = next;
  }
};

/** The lines without one variable, made from those with it. */
const eliminate = (
  current: readonly Made[],
  name: string,
  make: (from: (readonly [number, bigint])[]) => Made | "false"
): Made[] | "false" | undefined => {
  const out: Made[] = current.filter((l) => !l.coefficients.has(name));
  const about = current.filter((l) => l.coefficients.has(name));
  const equation = about.find((l) => l.relation === "=");
  if (equation !== undefined) {
    // e·x + E = 0 removes x from k·x + L by e·(k·x + L) - k·(e·x + E),
    // with e made positive so that an inequality keeps its direction.
    const e = equation.coefficients.get(name) as bigint;
    const sign = e < 0n ? -1n : 1n;
    for (const line of about) {
      if (line === equation) {
        continue;
      }
      const k = line.coefficients.get(name) as bigint;
      const made = make([
        [line.at, e * sign],
        [equation.at, -k * sign],
      ]);
      if (made === "false") {
        return "false";
      }
      out.push(made);
    }
    return out;
  }
  const lower = about.filter((l) => (l.coefficients.get(name) as bigint) > 0n);
  const upper = about.filter((l) => (l.coefficients.get(name) as bigint) < 0n);
  for (const l of lower) {
    for (const u of upper) {
      const a = l.coefficients.get(name) as bigint;
      const b = -(u.coefficients.get(name) as bigint);
      const made = make([
        [l.at, b],
        [u.at, a],
      ]);
      if (made === "false") {
        return "false";
      }
      out.push(made);
    }
  }
  return out;
};

/** A whole number as the Lion number it is, written exactly however large. */
const whole = (n: bigint) => fromRational(ratio(n));

/**
 * The certificate up to the false line, with only the steps that line
 * needs; undefined when a number in it is too large to write exactly.
 */
const finish = (
  given: number,
  lines: readonly Whole[],
  steps: readonly {
    from: readonly (readonly [number, bigint])[];
    tightened: boolean;
  }[],
  last: number
): Certificate | undefined => {
  if (last < given) {
    // A constraint that is false by itself: one step that takes it.
    return written(lines.slice(0, given), [
      { from: [[last, 1n]], tightened: false },
    ]);
  }
  // Keep the steps the last line rests on, numbered anew.
  const needed = new Set<number>();
  const visit = (at: number) => {
    if (at < given || needed.has(at)) {
      return;
    }
    needed.add(at);
    for (const [from] of steps[at - given]?.from ?? []) {
      visit(from);
    }
  };
  visit(last);
  const kept = [...needed].sort((a, b) => a - b);
  const renumber = new Map<number, number>();
  for (const [index, at] of kept.entries()) {
    renumber.set(at, given + index);
  }
  const at = (n: number) => (n < given ? n : (renumber.get(n) as number));
  return written(
    lines.slice(0, given),
    kept.map((n) => {
      const step = steps[n - given] as (typeof steps)[number];
      return {
        from: step.from.map(([f, m]) => [at(f), m] as const),
        tightened: step.tightened,
      };
    })
  );
};

const toWholeLine = (l: Whole): Line => ({
  constant: whole(l.constant),
  relation: l.relation,
  sum: Object.fromEntries(
    [...l.coefficients].map(([name, k]) => [name, whole(k)])
  ),
});

const written = (
  constraints: readonly Whole[],
  steps: readonly {
    from: readonly (readonly [number, bigint])[];
    tightened: boolean;
  }[]
): Certificate | undefined => {
  return {
    constraints: constraints.map(toWholeLine),
    steps: steps.map((s) => ({
      from: s.from.map(([f, m]) => [f, whole(m)] as const),
      tightened: s.tightened,
    })),
  };
};

const MAX_SPLIT_DEPTH = 6;

/**
 * Refutes constraints using Farkas/Chvátal-Gomory elimination first, and falls
 * back to bounded integer branch-and-bound dichotomy splits (`expr <= b` vs
 * `expr >= b + 1`) to certify Omega dark/grey shadow integer refutations.
 */
export const refuteWithSplits = (
  constraints: readonly Constraint[],
  sorts: ReadonlyMap<string, Sort>,
  depth = 0
): ProofCertificate | undefined => {
  const linear = refute(constraints, sorts);
  if (linear !== undefined) {
    return linear;
  }
  if (
    depth >= MAX_SPLIT_DEPTH ||
    constraints.some((c) => c.relation === "!=")
  ) {
    return undefined;
  }
  const intVars = [...sorts]
    .filter(([, sort]) => sort === "integer")
    .map(([name]) => name);
  if (intVars.length === 0) {
    return undefined;
  }
  const realSorts = new Map<string, Sort>(
    [...sorts.keys()].map((name) => [name, "real"] as const)
  );
  const relaxed = solve(constraints, realSorts);
  if (relaxed === undefined) {
    return undefined;
  }
  // Prefer an integer variable whose real-relaxation value is fractional.
  let splitVar: string | undefined;
  let bound = 0n;
  for (const name of intVars) {
    const val = relaxed.get(name);
    if (val !== undefined && val.d > 1n) {
      splitVar = name;
      bound = floorRat(val);
      break;
    }
  }
  if (splitVar === undefined) {
    return undefined;
  }
  // low: -v + bound >= 0 (v <= bound)
  const lowC: Constraint = {
    linear: minus(constant(ratio(bound)), variable(splitVar)),
    relation: ">=",
  };
  // high: v - (bound + 1) >= 0 (v >= bound + 1)
  const highC: Constraint = {
    linear: minus(variable(splitVar), constant(ratio(bound + 1n))),
    relation: ">=",
  };
  const low = refuteWithSplits([...constraints, lowC], sorts, depth + 1);
  if (low === undefined) {
    return undefined;
  }
  const high = refuteWithSplits([...constraints, highC], sorts, depth + 1);
  if (high === undefined) {
    return undefined;
  }
  return {
    bound: whole(bound),
    constraints: constraints.map((c) => toWholeLine(wholeOf(c))),
    expr: { [splitVar]: 1 },
    high,
    kind: "split",
    low,
  };
};

/** A minimal valid linear certificate for a trivially false (0 > 0) contradiction. */
export const contradictionCertificate = (): Certificate => ({
  constraints: [{ constant: 0, relation: ">", sum: {} }],
  steps: [{ from: [[0, 1]], tightened: false }],
});

const parseIntBig = (v: unknown): bigint | undefined => {
  if (!isNumber(v)) {
    return undefined;
  }
  const r = toRational(v);
  return r.d === 1n ? r.n : undefined;
};

const parseLine = (raw: unknown): Whole | undefined => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const rec = raw as Record<string, unknown>;
  const rel = rec.relation;
  if (rel !== ">=" && rel !== ">" && rel !== "=") {
    return undefined;
  }
  const c = parseIntBig(rec.constant);
  if (c === undefined) {
    return undefined;
  }
  const sum = rec.sum;
  if (typeof sum !== "object" || sum === null || Array.isArray(sum)) {
    return undefined;
  }
  const coefficients = new Map<string, bigint>();
  for (const [name, val] of Object.entries(sum as Record<string, unknown>)) {
    const k = parseIntBig(val);
    if (k === undefined) {
      return undefined;
    }
    if (k !== 0n) {
      coefficients.set(name, k);
    }
  }
  return { coefficients, constant: c, relation: rel };
};

const sameWholeLine = (a: Whole, b: Whole): boolean => {
  if (
    a.relation !== b.relation ||
    a.constant !== b.constant ||
    a.coefficients.size !== b.coefficients.size
  ) {
    return false;
  }
  for (const [name, k] of a.coefficients) {
    if (b.coefficients.get(name) !== k) {
      return false;
    }
  }
  return true;
};

const parseLines = (raw: unknown): Whole[] | undefined => {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const lines: Whole[] = [];
  for (const item of raw) {
    const parsed = parseLine(item);
    if (parsed === undefined) {
      return undefined;
    }
    lines.push(parsed);
  }
  return lines;
};

const parseStepFrom = (
  step: unknown,
  lines: readonly Whole[]
):
  | {
      readonly from: readonly (readonly [number, bigint])[];
      readonly tightened: boolean;
    }
  | undefined => {
  if (
    typeof step !== "object" ||
    step === null ||
    !Array.isArray((step as { from?: unknown }).from) ||
    typeof (step as { tightened?: unknown }).tightened !== "boolean"
  ) {
    return undefined;
  }
  const { from, tightened } = step as { from: unknown[]; tightened: boolean };
  const parsedFrom: (readonly [number, bigint])[] = [];
  for (const pair of from) {
    if (!Array.isArray(pair) || pair.length !== 2) {
      return undefined;
    }
    const [rawAt, rawM] = pair;
    if (
      typeof rawAt !== "number" ||
      !Number.isInteger(rawAt) ||
      rawAt < 0 ||
      rawAt >= lines.length
    ) {
      return undefined;
    }
    const line = lines[rawAt];
    const m = parseIntBig(rawM);
    if (
      line === undefined ||
      m === undefined ||
      (compareNumbers(rawM as LionNumber, 0) < 0 && line.relation !== "=")
    ) {
      return undefined;
    }
    parsedFrom.push([rawAt, m]);
  }
  return { from: parsedFrom, tightened };
};

/** Whether a linear certificate proves its constraints have no solution, checked with whole numbers alone. */
export const checks = (certificate: Certificate): boolean => {
  if (
    typeof certificate !== "object" ||
    certificate === null ||
    !Array.isArray(certificate.steps) ||
    certificate.steps.length === 0
  ) {
    return false;
  }
  const lines = parseLines(certificate.constraints);
  if (lines === undefined) {
    return false;
  }
  for (let at = 0; at < certificate.steps.length; at += 1) {
    const parsed = parseStepFrom(certificate.steps[at], lines);
    if (parsed === undefined) {
      return false;
    }
    const combined = combine(lines, parsed.from);
    const next = parsed.tightened ? tighten(combined) : combined;
    if (next === undefined) {
      return at === certificate.steps.length - 1;
    }
    lines.push(next);
  }
  return isFalse(lines.at(-1));
};

const parseExprCoeffs = (
  raw: unknown
):
  | {
      readonly pos: Map<string, bigint>;
      readonly neg: Map<string, bigint>;
    }
  | undefined => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const pos = new Map<string, bigint>();
  const neg = new Map<string, bigint>();
  for (const [name, val] of Object.entries(raw as Record<string, unknown>)) {
    const k = parseIntBig(val);
    if (k === undefined) {
      return undefined;
    }
    if (k !== 0n) {
      pos.set(name, k);
      neg.set(name, -k);
    }
  }
  return pos.size === 0 ? undefined : { neg, pos };
};

const parseBranchLines = (
  branch: unknown,
  expectedLength: number
): Whole[] | undefined => {
  if (typeof branch !== "object" || branch === null || Array.isArray(branch)) {
    return undefined;
  }
  const list = (branch as Record<string, unknown>).constraints;
  if (!Array.isArray(list) || list.length !== expectedLength) {
    return undefined;
  }
  return parseLines(list);
};

const checkSplitCertificate = (rec: Record<string, unknown>): boolean => {
  const bound = parseIntBig(rec.bound);
  const baseLines = parseLines(rec.constraints);
  const coeffs = parseExprCoeffs(rec.expr);
  if (bound === undefined || baseLines === undefined || coeffs === undefined) {
    return false;
  }
  const lowExtra: Whole = {
    coefficients: coeffs.neg,
    constant: bound,
    relation: ">=",
  };
  const highExtra: Whole = {
    coefficients: coeffs.pos,
    constant: -(bound + 1n),
    relation: ">=",
  };
  const lowLines = parseBranchLines(rec.low, baseLines.length + 1);
  const highLines = parseBranchLines(rec.high, baseLines.length + 1);
  if (lowLines === undefined || highLines === undefined) {
    return false;
  }
  const basesMatch = baseLines.every(
    (base, i) =>
      sameWholeLine(lowLines[i] as Whole, base) &&
      sameWholeLine(highLines[i] as Whole, base)
  );
  return (
    basesMatch &&
    sameWholeLine(lowLines[baseLines.length] as Whole, lowExtra) &&
    sameWholeLine(highLines[baseLines.length] as Whole, highExtra) &&
    checksProof(rec.low) &&
    checksProof(rec.high)
  );
};

/** Checks either a linear Farkas/CG certificate or an integer dichotomy split tree. */
export const checksProof = (cert: unknown): boolean => {
  if (typeof cert !== "object" || cert === null || Array.isArray(cert)) {
    return false;
  }
  const rec = cert as Record<string, unknown>;
  if (rec.kind === "split") {
    return checkSplitCertificate(rec);
  }
  return checks(cert as Certificate);
};

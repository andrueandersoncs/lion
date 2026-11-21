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

import type { Constraint, Sort } from "@/logic/solver";
import {
  compareNumbers,
  fromRational,
  gcd,
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

const written = (
  constraints: readonly Whole[],
  steps: readonly {
    from: readonly (readonly [number, bigint])[];
    tightened: boolean;
  }[]
): Certificate | undefined => {
  return {
    constraints: constraints.map((l) => ({
      constant: whole(l.constant),
      relation: l.relation,
      sum: Object.fromEntries(
        [...l.coefficients].map(([name, k]) => [name, whole(k)])
      ),
    })),
    steps: steps.map((s) => ({
      from: s.from.map(([f, m]) => [f, whole(m)] as const),
      tightened: s.tightened,
    })),
  };
};

/** Whether a certificate proves its constraints have no solution, checked with whole numbers alone. */
export const checks = (certificate: Certificate): boolean => {
  const lines: (Whole | undefined)[] = certificate.constraints.map((l) => ({
    coefficients: new Map(
      Object.entries(l.sum).map(([name, k]) => [name, toRational(k).n])
    ),
    constant: toRational(l.constant).n,
    relation: l.relation,
  }));
  for (const step of certificate.steps) {
    if (
      step.from.some(
        ([at, m]) =>
          lines[at] === undefined ||
          (compareNumbers(m, 0) < 0 && (lines[at] as Whole).relation !== "=")
      )
    ) {
      return false;
    }
    const combined = combine(
      lines as Whole[],
      step.from.map(([at, m]) => [at, toRational(m).n] as const)
    );
    lines.push(step.tightened ? tighten(combined) : combined);
  }
  const last = lines.at(-1);
  return certificate.steps.length > 0 && isFalse(last);
};

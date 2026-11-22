/**
 * Lion's numbers. Every number is exact: a rational, an integer of any size
 * or a fraction, as Scheme's exact numbers are. A JavaScript number stands
 * for the decimal its shortest digits write, the digits `JSON.stringify`
 * writes, so `0.1` is one tenth and `2 ** 60` is 1152921504606847000.
 *
 * Each number has one form. It is the JavaScript number whose shortest
 * digits write it, when one does, and otherwise an `Exact`, a numerator and a
 * denominator in lowest terms, kept once for each value. So `===` tells
 * numbers apart, `JSON.stringify` writes every number a JavaScript number
 * writes, and a host mostly sees plain numbers. One third is an `Exact`, and
 * so is 2^53 + 1.
 *
 * The solver works on the same rationals, so what it proves about numbers
 * holds of what plain code computes.
 */

/** A rational: a numerator and a positive denominator with no common factor. */
export interface Rational {
  readonly d: bigint;
  readonly n: bigint;
}

const abs = (a: bigint) => (a < 0n ? -a : a);

export const gcd = (a: bigint, b: bigint): bigint => {
  let [x, y] = [abs(a), abs(b)];
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x;
};

/** The rational n / d, in lowest terms. */
export const ratio = (n: bigint, d = 1n): Rational => {
  if (d === 0n) {
    throw new RangeError("A rational's denominator cannot be 0");
  }
  const g = gcd(n, d) || 1n;
  const sign = d < 0n ? -1n : 1n;
  return { d: (sign * d) / g, n: (sign * n) / g };
};

export const ZERO = ratio(0n);
export const ONE = ratio(1n);

export const add = (a: Rational, b: Rational) =>
  a.d === 1n && b.d === 1n
    ? { d: 1n, n: a.n + b.n }
    : ratio(a.n * b.d + b.n * a.d, a.d * b.d);
export const negate = (a: Rational): Rational => ({ d: a.d, n: -a.n });
export const subtract = (a: Rational, b: Rational) => add(a, negate(b));
export const multiply = (a: Rational, b: Rational) =>
  a.d === 1n && b.d === 1n
    ? { d: 1n, n: a.n * b.n }
    : ratio(a.n * b.n, a.d * b.d);
export const divide = (a: Rational, b: Rational) => ratio(a.n * b.d, a.d * b.n);
export const compare = (a: Rational, b: Rational) => {
  const difference = a.n * b.d - b.n * a.d;
  if (difference === 0n) {
    return 0;
  }
  return difference < 0n ? -1 : 1;
};
export const isZero = (a: Rational) => a.n === 0n;
export const isWhole = (a: Rational) => a.d === 1n;
const same = (a: Rational, b: Rational) => a.n === b.n && a.d === b.d;

/** The greatest whole number at most `a`. */
export const floor = (a: Rational): bigint => {
  const q = a.n / a.d;
  return a.n < 0n && q * a.d !== a.n ? q - 1n : q;
};

/** The least whole number at least `a`. */
export const ceiling = (a: Rational): bigint => -floor(negate(a));

/**
 * The most digits a number read from text may have in its numerator or its
 * denominator, as Python limits the digits of an integer it reads, so text
 * cannot make a number that takes long to build or to write.
 */
export const DIGITS = 4300;

/** Decimal digits: a sign, a whole part, a fraction, and an exponent. */
const DECIMAL = /^([-+]?)(\d*)(?:\.(\d*))?(?:[eE]([-+]?\d+))?$/;
const LEADING_ZEROS = /^0+/;
const LEADING_ZEROS_BEFORE_A_DIGIT = /^0+(?=\d)/;
const TRAILING_ZEROS = /0+$/;
const SIGN_AND_POINT = /[-.]/g;

/** The rational decimal digits write, or undefined when they write none or too many. */
export const parseDecimal = (text: string): Rational | undefined => {
  const found = DECIMAL.exec(text);
  if (found === null) {
    return undefined;
  }
  const [, sign = "", whole = "", fraction = "", exponent = "0"] = found;
  const digits = `${whole}${fraction}`.replace(
    LEADING_ZEROS_BEFORE_A_DIGIT,
    ""
  );
  if (digits === "" || (whole === "" && fraction === "")) {
    return undefined;
  }
  const power = Number(exponent) - fraction.length;
  const significant = digits.replace(LEADING_ZEROS, "").length;
  if (
    !Number.isSafeInteger(power) ||
    significant + Math.max(0, power) > DIGITS ||
    -power > DIGITS
  ) {
    return undefined;
  }
  const n = BigInt(`${sign === "-" ? "-" : ""}${digits}`);
  return power >= 0
    ? ratio(n * 10n ** BigInt(power))
    : ratio(n, 10n ** BigInt(-power));
};

/** The nearest JavaScript number to a rational, as decimal digits read. */
const nearest = (a: Rational): number => {
  if (a.d === 1n) {
    return Number(a.n);
  }
  const exponent = BigInt(a.d.toString().length + 20);
  return Number(`${(a.n * 10n ** exponent) / a.d}e-${exponent}`);
};

/** The finite decimal a rational is, as digits with a point, or undefined. */
export const decimalDigits = (a: Rational): string | undefined => {
  if (a.d === 1n) {
    return a.n.toString();
  }
  let rest = a.d;
  let twos = 0;
  let fives = 0;
  while (rest % 2n === 0n) {
    rest /= 2n;
    twos += 1;
  }
  while (rest % 5n === 0n) {
    rest /= 5n;
    fives += 1;
  }
  if (rest !== 1n) {
    return undefined;
  }
  const places = Math.max(twos, fives);
  const scaled = (a.n * 10n ** BigInt(places)) / a.d;
  const digits = abs(scaled)
    .toString()
    .padStart(places + 1, "0");
  const point = digits.length - places;
  return `${scaled < 0n ? "-" : ""}${digits.slice(0, point)}.${digits.slice(point)}`;
};

const rawJson = (JSON as { rawJSON?: (text: string) => unknown }).rawJSON;

/**
 * A number no JavaScript number writes. Each value is made once, so two
 * `Exact`s are the same value exactly when they are the same object.
 */
export class Exact implements Rational {
  readonly d: bigint;
  readonly n: bigint;

  private constructor(n: bigint, d: bigint) {
    this.n = n;
    this.d = d;
    Object.freeze(this);
  }

  /** The one `Exact` for a rational in lowest terms. */
  static of(a: Rational): Exact {
    const key = `${a.n}/${a.d}`;
    const kept = MADE.get(key)?.deref();
    if (kept !== undefined) {
      return kept;
    }
    const made = new Exact(a.n, a.d);
    MADE.set(key, new WeakRef(made));
    FORGET.register(made, key);
    return made;
  }

  /**
   * As JSON: its decimal digits as they are, when it is a finite decimal.
   * A fraction no decimal writes, such as 1/3, has no JSON form.
   */
  toJSON(): unknown {
    const digits = decimalDigits(this);
    if (digits === undefined) {
      throw new NotJson(this);
    }
    return rawJson === undefined ? Number(digits) : rawJson(digits);
  }

  toString(): string {
    return numberText(this);
  }
}

const MADE = new Map<string, WeakRef<Exact>>();
const FORGET = new FinalizationRegistry<string>((key) => {
  if (MADE.get(key)?.deref() === undefined) {
    MADE.delete(key);
  }
});

/** Raised when a value with a number no decimal writes is written as JSON. */
export class NotJson extends RangeError {
  override readonly name = "ArithmeticError";
  readonly number: Exact;

  constructor(number: Exact) {
    super(
      `${numberText(number)} is a fraction no decimal writes, so JSON cannot hold it: round it with ["number/round", value, places], or write it as text with number/toString.`
    );
    this.number = number;
  }
}

/** A Lion number: a finite JavaScript number, or an `Exact`. */
export type LionNumber = number | Exact;

export const isNumber = (value: unknown): value is LionNumber =>
  (typeof value === "number" && Number.isFinite(value)) ||
  value instanceof Exact;

export const isInteger = (value: unknown): boolean =>
  typeof value === "number"
    ? Number.isInteger(value)
    : value instanceof Exact && value.d === 1n;

/** Rationals of doubles read lately, so a double used again is not read again. */
const READ = new Map<number, Rational>();

/** The rational a number is: a double is the decimal its shortest digits write. */
export const toRational = (value: LionNumber): Rational => {
  if (typeof value !== "number") {
    return value;
  }
  if (Number.isSafeInteger(value)) {
    return { d: 1n, n: BigInt(value) };
  }
  let read = READ.get(value);
  if (read === undefined) {
    read = parseDecimal(String(value)) as Rational;
    if (READ.size >= 4096) {
      READ.clear();
    }
    READ.set(value, read);
  }
  return read;
};

/** The digits of a decimal that count: those between its first and last nonzero ones. */
const significant = (digits: string) =>
  digits
    .replace(SIGN_AND_POINT, "")
    .replace(LEADING_ZEROS, "")
    .replace(TRAILING_ZEROS, "").length;

/** The smallest double that has every digit a double can have. */
const NORMAL = 2.225_073_858_507_201_4e-308;

/**
 * The one form of a rational: the JavaScript number that writes it, or an
 * `Exact`. A double's shortest digits always end, so a fraction whose
 * decimal repeats, such as 1/3, is an `Exact`; a decimal of at most 15
 * significant digits is the double that reads it, as every double in the
 * normal range holds 15 digits.
 */
export const fromRational = (a: Rational): LionNumber => {
  if (
    a.d === 1n &&
    a.n <= BigInt(Number.MAX_SAFE_INTEGER) &&
    a.n >= -BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return Number(a.n);
  }
  const digits = decimalDigits(a);
  if (digits === undefined) {
    return Exact.of(a);
  }
  const near = Number(digits);
  const count = significant(digits);
  if (count <= 15 && Number.isFinite(near) && Math.abs(near) >= NORMAL) {
    return near + 0;
  }
  if (count <= 17 && Number.isFinite(near) && same(toRational(near), a)) {
    return near + 0;
  }
  return Exact.of(a);
};

/** The number decimal digits write, or undefined when they write none or too many. */
export const readNumberText = (text: string): LionNumber | undefined => {
  const value = parseDecimal(text);
  return value === undefined ? undefined : fromRational(value);
};

/**
 * A number as text: as JSON writes it, and a fraction no decimal writes as
 * Scheme writes it, `1/3`.
 */
export const numberText = (value: LionNumber): string => {
  if (typeof value === "number") {
    return JSON.stringify(value + 0);
  }
  return decimalDigits(value) ?? `${value.n}/${value.d}`;
};

const isSafe = (value: LionNumber): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

const through =
  (exact: (a: Rational, b: Rational) => Rational) =>
  (a: LionNumber, b: LionNumber): LionNumber =>
    fromRational(exact(toRational(a), toRational(b)));

const exactSum = through(add);
const exactDifference = through(subtract);
const exactProduct = through(multiply);

/** A double's decimal as a whole number of units of 10^-places, when its digits have no exponent and fit a safe integer. */
interface Scaled {
  readonly places: number;
  readonly units: number;
}

const SCALED = new Map<number, Scaled | null>();

const scaledOf = (x: number): Scaled | undefined => {
  let found = SCALED.get(x);
  if (found === undefined) {
    found = null;
    const text = String(x);
    if (!text.includes("e")) {
      const point = text.indexOf(".");
      const units = Number(
        point < 0 ? text : `${text.slice(0, point)}${text.slice(point + 1)}`
      );
      if (Number.isSafeInteger(units)) {
        found = { places: point < 0 ? 0 : text.length - point - 1, units };
      }
    }
    if (SCALED.size >= 4096) {
      SCALED.clear();
    }
    SCALED.set(x, found);
  }
  return found ?? undefined;
};

/** Powers of ten a double holds exactly. */
const TENS = Array.from({ length: 16 }, (_, at) => 10 ** at);

/**
 * The double units × 10^-places writes, when it has at most 15 digits: the
 * quotient by a power of ten a double holds, rounded once as reading the
 * digits rounds. It is kept with its units, so it is not read again.
 */
const fromScaled = (units: number, places: number): number | undefined => {
  if (!Number.isSafeInteger(units) || Math.abs(units) >= 1e15) {
    return;
  }
  const made = units / (TENS[places] as number) + 0;
  if (!SCALED.has(made)) {
    if (SCALED.size >= 4096) {
      SCALED.clear();
    }
    SCALED.set(made, { places, units });
  }
  return made;
};

/** a + b or a - b of decimals with few digits, on whole numbers of their units. */
const scaledSum = (a: number, b: number, sign: number) => {
  const x = scaledOf(a);
  const y = scaledOf(b);
  if (x === undefined || y === undefined) {
    return;
  }
  const places = Math.max(x.places, y.places);
  if (places > 15) {
    return;
  }
  return fromScaled(
    x.units * (TENS[places - x.places] as number) +
      sign * y.units * (TENS[places - y.places] as number),
    places
  );
};

/** a × b of decimals with few digits, on whole numbers of their units. */
const scaledProduct = (a: number, b: number) => {
  const x = scaledOf(a);
  const y = scaledOf(b);
  return x === undefined || y === undefined || x.places + y.places > 15
    ? undefined
    : fromScaled(x.units * y.units, x.places + y.places);
};

export const sum = (a: LionNumber, b: LionNumber): LionNumber => {
  if (typeof a === "number" && typeof b === "number") {
    const result = a + b;
    if (
      Number.isSafeInteger(a) &&
      Number.isSafeInteger(b) &&
      Number.isSafeInteger(result)
    ) {
      return result;
    }
    const scaled = scaledSum(a, b, 1);
    if (scaled !== undefined) {
      return scaled;
    }
  }
  return exactSum(a, b);
};

export const difference = (a: LionNumber, b: LionNumber): LionNumber => {
  if (typeof a === "number" && typeof b === "number") {
    const result = a - b;
    if (
      Number.isSafeInteger(a) &&
      Number.isSafeInteger(b) &&
      Number.isSafeInteger(result)
    ) {
      return result;
    }
    const scaled = scaledSum(a, b, -1);
    if (scaled !== undefined) {
      return scaled;
    }
  }
  return exactDifference(a, b);
};

export const product = (a: LionNumber, b: LionNumber): LionNumber => {
  if (typeof a === "number" && typeof b === "number") {
    const result = a * b;
    if (
      Number.isSafeInteger(a) &&
      Number.isSafeInteger(b) &&
      Number.isSafeInteger(result)
    ) {
      return result + 0;
    }
    const scaled = scaledProduct(a, b);
    if (scaled !== undefined) {
      return scaled;
    }
  }
  return exactProduct(a, b);
};

/** a / b, or undefined when b is 0. */
export const quotient = (
  a: LionNumber,
  b: LionNumber
): LionNumber | undefined => {
  if (isSafe(a) && isSafe(b) && b !== 0 && a % b === 0) {
    return a / b + 0;
  }
  const divisor = toRational(b);
  return isZero(divisor)
    ? undefined
    : fromRational(divide(toRational(a), divisor));
};

/** What is left of a after taking b out as many whole times as fit toward 0, with a's sign; undefined when b is 0. */
export const remainder = (
  a: LionNumber,
  b: LionNumber
): LionNumber | undefined => {
  if (isSafe(a) && isSafe(b)) {
    return b === 0 ? undefined : (a % b) + 0;
  }
  const x = toRational(a);
  const y = toRational(b);
  if (isZero(y)) {
    return undefined;
  }
  const q = divide(x, y);
  const whole = q.n / q.d;
  return fromRational(subtract(x, multiply(y, ratio(whole))));
};

/** -1, 0, or 1 as a is below, equal to, or above b. */
export const compareNumbers = (a: LionNumber, b: LionNumber): number => {
  if (typeof a === "number" && typeof b === "number") {
    if (a === b) {
      return 0;
    }
    return a < b ? -1 : 1;
  }
  return compare(toRational(a), toRational(b));
};

export const absolute = (a: LionNumber): LionNumber =>
  typeof a === "number"
    ? Math.abs(a) + 0
    : fromRational({ d: a.d, n: abs(a.n) });

export const floorOf = (a: LionNumber): LionNumber =>
  typeof a === "number" && Number.isInteger(a)
    ? a
    : fromRational(ratio(floor(toRational(a))));

export const ceilingOf = (a: LionNumber): LionNumber =>
  typeof a === "number" && Number.isInteger(a)
    ? a
    : fromRational(ratio(ceiling(toRational(a))));

/** The nearest number with `places` digits after the point; a half rounds up. */
export const roundTo = (a: LionNumber, places = 0): LionNumber => {
  if (places === 0 && typeof a === "number" && Number.isInteger(a)) {
    return a;
  }
  const scale =
    places >= 0
      ? ratio(10n ** BigInt(places))
      : ratio(1n, 10n ** BigInt(-places));
  const scaled = multiply(toRational(a), scale);
  const rounded = ratio(floor(add(scaled, ratio(1n, 2n))));
  return fromRational(divide(rounded, scale));
};

/** The base-10 logarithm of a whole number, from its digits. */
const log10 = (n: bigint) => {
  const digits = abs(n).toString();
  const lead = Math.min(digits.length, 15);
  return digits.length - lead + Math.log10(Number(digits.slice(0, lead)) || 1);
};

/**
 * a to the power b. A whole power is exact; a power past `DIGITS` digits
 * is refused. Any other power is the nearest JavaScript number, which
 * stands for its digits as every JavaScript number does. Undefined when
 * there is no finite result, or it would be too large.
 */
export const power = (a: LionNumber, b: LionNumber): LionNumber | undefined => {
  if (isInteger(b)) {
    const base = toRational(a);
    const exponent = toRational(b).n;
    // The digits of the numerator or denominator of the power.
    const size = Math.max(log10(base.n), log10(base.d));
    if (Math.floor(Number(abs(exponent)) * size) + 1 > DIGITS) {
      return undefined;
    }
    if (exponent < 0n && isZero(base)) {
      return undefined;
    }
    const e = abs(exponent);
    const raised = ratio(base.n ** e, base.d ** e);
    return fromRational(exponent < 0n ? divide(ONE, raised) : raised);
  }
  const result = toNearest(a) ** toNearest(b);
  return Number.isFinite(result) ? result + 0 : undefined;
};

/** The nearest JavaScript number to a Lion number. */
export const toNearest = (a: LionNumber): number =>
  typeof a === "number" ? a : nearest(a);

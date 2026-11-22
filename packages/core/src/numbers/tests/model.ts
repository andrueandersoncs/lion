/**
 * A model of Lion's numbers for properties, written apart from
 * `numbers/exact.ts`: a number is the fraction its shortest digits write, or
 * an `Exact`'s numerator and denominator, and fractions are compared by
 * multiplying across, never reduced.
 */
import { Exact } from "@/numbers/exact";

/** A fraction, not reduced: a numerator and a positive denominator. */
export type Fraction = readonly [bigint, bigint];

/** The fraction a Lion number is, read from the digits that write it. */
export const asFraction = (value: unknown): Fraction => {
  if (value instanceof Exact) {
    return [value.n, value.d];
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`not a Lion number: ${String(value)}`);
  }
  const [mantissa = "", exponent = "0"] = value.toString().split("e");
  const [whole = "", part = ""] = mantissa.split(".");
  const shift = Number(exponent) - part.length;
  const digits = BigInt(`${whole}${part}`);
  return shift >= 0
    ? [digits * 10n ** BigInt(shift), 1n]
    : [digits, 10n ** BigInt(-shift)];
};

export const plus = ([a, b]: Fraction, [c, d]: Fraction): Fraction => [
  a * d + c * b,
  b * d,
];
export const minus = ([a, b]: Fraction, [c, d]: Fraction): Fraction => [
  a * d - c * b,
  b * d,
];
export const times = ([a, b]: Fraction, [c, d]: Fraction): Fraction => [
  a * c,
  b * d,
];
/** a / b, with the denominator kept positive; b must not be 0. */
export const over = ([a, b]: Fraction, [c, d]: Fraction): Fraction =>
  c < 0n ? [-a * d, -b * c] : [a * d, b * c];

export const same = ([a, b]: Fraction, [c, d]: Fraction) => a * d === c * b;

/** -1, 0, or 1 as a is below, equal to, or above b. */
export const order = ([a, b]: Fraction, [c, d]: Fraction) => {
  const difference = a * d - c * b;
  if (difference === 0n) {
    return 0;
  }
  return difference < 0n ? -1 : 1;
};

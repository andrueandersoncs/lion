/**
 * Aggregates combine the values a rule body matches into one value per group,
 * such as a count or a sum. The same functions back the `aggregate` module,
 * so `["aggregate/sum", list]` also works on a plain list.
 */
import { compareValues, render, valueKey } from "@/logic/terms";

export interface Aggregator {
  /** Describes why the values cannot be combined, or undefined when they can. */
  readonly check: (values: readonly unknown[]) => string | undefined;
  /** Combines the values. Runs only after `check` accepts them. */
  readonly fold: (values: readonly unknown[]) => unknown;
  /**
   * Lattice aggregates combine one more value into a result that only moves
   * one way, so a recursive rule can aggregate with them and still settle.
   * `join(fold(values), value)` equals `fold([...values, value])`.
   */
  readonly join?: (current: unknown, value: unknown) => unknown;
  /**
   * The result is one of the values, so the match that produced it explains
   * the result on its own.
   */
  readonly selects: boolean;
}

const show = (value: unknown) => JSON.stringify(render(value));

const anyValues = () => undefined;

const onlyNumbers = (values: readonly unknown[]) => {
  const bad = values.find(
    (value) => typeof value !== "number" || !Number.isFinite(value)
  );
  return bad === undefined
    ? undefined
    : `expects numbers, but found ${show(bad)}`;
};

/** Numbers and strings both have a natural order; mixing them does not. */
const onlyComparable = (values: readonly unknown[]) => {
  const first = values[0];
  const type = typeof first;
  if (first === undefined) {
    return;
  }
  const bad = values.find(
    (value) =>
      typeof value !== type ||
      !(type === "string" || (type === "number" && Number.isFinite(value)))
  );
  return bad === undefined
    ? undefined
    : `expects all numbers or all strings, but found ${show(first)} and ${show(bad)}`;
};

const onlyLists = (values: readonly unknown[]) => {
  const bad = values.find(
    (value) => !(Array.isArray(value) || typeof value === "string")
  );
  return bad === undefined
    ? undefined
    : `expects lists or strings, but found ${show(bad)}`;
};

const onlyArrays = (values: readonly unknown[]) => {
  const bad = values.find((value) => !Array.isArray(value));
  return bad === undefined
    ? undefined
    : `expects lists, but found ${show(bad)}`;
};

const sum = (values: readonly unknown[]) =>
  (values as readonly number[]).reduce((total, value) => total + value, 0);

const distinct = (values: readonly unknown[]) => {
  const unique = new Map<string, unknown>();
  for (const value of values) {
    unique.set(valueKey(value), value);
  }
  return [...unique.values()];
};

const sorted = (values: readonly unknown[]) => [...values].sort(compareValues);

/** A lattice aggregate that keeps whichever value `better` prefers. */
const selecting = (
  check: Aggregator["check"],
  better: (value: unknown, current: unknown) => boolean
): Aggregator => {
  const join = (current: unknown, value: unknown) =>
    better(value, current) ? value : current;
  return {
    check,
    fold: (values) => (values.length === 0 ? null : values.reduce(join)),
    join,
    selects: true,
  };
};

const length = (value: unknown) => (value as string | unknown[]).length;

const union = (values: readonly unknown[]) =>
  sorted(distinct((values as readonly unknown[][]).flat()));

export const AGGREGATORS: Readonly<Record<string, Aggregator>> = {
  count: { check: anyValues, fold: (values) => values.length, selects: false },
  countUnique: {
    check: anyValues,
    fold: (values) => distinct(values).length,
    selects: false,
  },
  sum: { check: onlyNumbers, fold: sum, selects: false },
  mean: {
    check: onlyNumbers,
    fold: (values) =>
      values.length === 0 ? null : sum(values) / values.length,
    selects: false,
  },
  min: selecting(
    onlyComparable,
    (value, current) => compareValues(value, current) < 0
  ),
  max: selecting(
    onlyComparable,
    (value, current) => compareValues(value, current) > 0
  ),
  // Ties go to the smaller value, so the result never depends on match order.
  shortest: selecting(
    onlyLists,
    (value, current) =>
      length(value) < length(current) ||
      (length(value) === length(current) && compareValues(value, current) < 0)
  ),
  union: {
    check: onlyArrays,
    fold: union,
    join: (current, value) => union([current, value]),
    selects: false,
  },
  collect: { check: anyValues, fold: sorted, selects: false },
  unique: {
    check: anyValues,
    fold: (values) => sorted(distinct(values)),
    selects: false,
  },
};

/** Aggregates that can go through recursion. */
export const LATTICE_AGGREGATES = Object.keys(AGGREGATORS).filter(
  (kind) => AGGREGATORS[kind]?.join !== undefined
);

export const aggregator = (kind: string): Aggregator => {
  const found = AGGREGATORS[kind];
  if (found === undefined) {
    throw new Error(`Unknown aggregate "${kind}".`);
  }
  return found;
};

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

const extreme =
  (direction: 1 | -1) =>
  (values: readonly unknown[]): unknown =>
    values.reduce<unknown>(
      (best, value) =>
        best === undefined || compareValues(value, best) * direction > 0
          ? value
          : best,
      undefined
    ) ?? null;

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
  min: { check: onlyComparable, fold: extreme(-1), selects: true },
  max: { check: onlyComparable, fold: extreme(1), selects: true },
  collect: { check: anyValues, fold: sorted, selects: false },
  unique: {
    check: anyValues,
    fold: (values) => sorted(distinct(values)),
    selects: false,
  },
};

export const aggregator = (kind: string): Aggregator => {
  const found = AGGREGATORS[kind];
  if (found === undefined) {
    throw new Error(`Unknown aggregate "${kind}".`);
  }
  return found;
};

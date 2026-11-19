/**
 * Aggregates combine the values a rule body matches into one value per group,
 * such as a count or a sum. The same functions back the `aggregate` module,
 * so `["aggregate/sum", list]` also works on a plain list.
 */
import { compareValues, DeferredCall, render, valueKey } from "@/logic/terms";

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

/**
 * The partials of a sum: numbers that do not overlap, whose exact sum is the
 * exact sum of the values added so far (Shewchuk's algorithm).
 */
const addExactly = (partials: number[], value: number) => {
  let x = value;
  let kept = 0;
  for (const partial of partials) {
    const [big, small] =
      Math.abs(x) < Math.abs(partial) ? [partial, x] : [x, partial];
    const high = big + small;
    const low = small - (high - big);
    if (low !== 0) {
      partials[kept] = low;
      kept += 1;
    }
    x = high;
  }
  partials.length = kept;
  partials.push(x);
};

const UNIT = 2n ** 52n;

/** A finite number as a whole count of the smallest step, 2^-1074. */
const steps = (value: number) => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0);
  const exponent = Number((bits / UNIT) % 2048n);
  const fraction = bits % UNIT;
  const magnitude =
    exponent === 0 ? fraction : (fraction + UNIT) * 2n ** BigInt(exponent - 1);
  return bits >= 2n ** 63n ? -magnitude : magnitude;
};

/**
 * The exact sum of numbers whose partial sums overflow, rounded once, a tie
 * going to the even number: an infinity when it is beyond every number.
 */
const exactSum = (values: readonly number[]) => {
  const total = values.reduce((sum, value) => sum + steps(value), 0n);
  const size = total < 0n ? -total : total;
  const dropped = Math.max(0, size.toString(2).length - 53);
  const step = 2n ** BigInt(dropped);
  let kept = size / step;
  const rest = size % step;
  if (
    dropped > 0 &&
    (rest * 2n > step || (rest * 2n === step && kept % 2n === 1n))
  ) {
    kept += 1n;
  }
  const value = Number(kept) * 2 ** (dropped - 1074);
  return total < 0n ? -value : value;
};

/**
 * The sum of numbers rounded once, to the number nearest their exact sum, as
 * Python's math.fsum gives it, so it is the same in whatever order the values
 * come: a rule's matches, or the candidates of a key.
 */
const sum = (values: readonly unknown[]) => {
  const partials: number[] = [];
  for (const value of values as readonly number[]) {
    addExactly(partials, value);
  }
  let at = partials.length - 1;
  let high = partials[at] ?? 0;
  let low = 0;
  while (at > 0) {
    at -= 1;
    const x = high;
    const y = partials[at] as number;
    high = x + y;
    low = y - (high - x);
    if (low !== 0) {
      break;
    }
  }
  // Round half to even when the rest of the partials lean the same way.
  const rest = partials[at - 1] ?? 0;
  if (at > 0 && ((low < 0 && rest < 0) || (low > 0 && rest > 0))) {
    const doubled = low * 2;
    const rounded = high + doubled;
    if (doubled === rounded - high) {
      high = rounded;
    }
  }
  return Number.isFinite(high) ? high : exactSum(values as readonly number[]);
};

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

const ON_LIST = new Map<string, unknown>();

/** Registers the function an aggregate of a kind calls on a list. */
export const registerAggregate = (kind: string, onList: unknown) => {
  ON_LIST.set(kind, onList);
};

/**
 * An aggregate of a kind over a term, as a rule head holds one, such as
 * `["aggregate/min", "?d"]`.
 */
export const aggregateCall = (kind: string, term: unknown) =>
  new DeferredCall(ON_LIST.get(kind), `aggregate/${kind}`, [term], kind);

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

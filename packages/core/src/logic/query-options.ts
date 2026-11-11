/**
 * Options for `["query", goal, options]`: sort, page, and assert on the
 * answers. Options are read as written, like a relation's column list.
 *
 * An invariant, `["invariant", goal, {"assert": "none"}]`, is the same
 * assertion kept by the database, so it reads its option here too.
 */
import { Effect } from "effect";
import { LogicError } from "@/errors/evaluation";
import { compareValues, render } from "@/logic/terms";

interface SortKey {
  readonly descending: boolean;
  readonly name: string;
}

/** A goal must have at least one answer ("some"), or none ("none"). */
export type Assertion = "some" | "none";

export interface QueryOptions {
  readonly assert?: Assertion;
  readonly limit?: number;
  readonly offset?: number;
  readonly order: readonly SortKey[];
}

const OPTION_NAMES = ["order", "limit", "offset", "assert"];

const fail = (message: string) => Effect.fail(new LogicError({ message }));

const show = (value: unknown) => JSON.stringify(render(value));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isAssertion = (value: unknown): value is Assertion =>
  value === "some" || value === "none";

/** `"-points"` sorts by `?points` in descending order; a `?` is optional. */
const SORT_KEY = /^(-?)\??([A-Za-z_][\w-]*)$/;

const parseOrder = (order: unknown, outputs: readonly string[]) =>
  Effect.gen(function* () {
    const specs = typeof order === "string" ? [order] : order;
    if (
      !(Array.isArray(specs) && specs.every((spec) => typeof spec === "string"))
    ) {
      return yield* fail(
        `The query option "order" must be a variable name or a list of them, such as ["-points", "name"], but found ${show(order)}.`
      );
    }
    const keys: SortKey[] = [];
    for (const spec of specs) {
      const match = SORT_KEY.exec(spec);
      const name = match?.[2];
      if (name === undefined || !outputs.includes(name)) {
        return yield* fail(
          `Cannot order by ${JSON.stringify(spec)}: the query's variables are ${outputs.map((output) => `?${output}`).join(", ") || "none"}.`
        );
      }
      keys.push({ descending: match?.[1] === "-", name });
    }
    return keys;
  });

/** Describes what is wrong with an options record, if anything. */
const optionsProblem = (options: Record<string, unknown>) => {
  const unknown = Object.keys(options).find(
    (key) => !OPTION_NAMES.includes(key)
  );
  if (unknown !== undefined) {
    return `Unknown query option "${unknown}". Query options are ${OPTION_NAMES.map((name) => `"${name}"`).join(", ")}.`;
  }
  const count = (["limit", "offset"] as const).find(
    (name) => options[name] !== undefined && !isCount(options[name])
  );
  if (count !== undefined) {
    return `The query option "${count}" must be a whole number of at least 0, but found ${show(options[count])}.`;
  }
  const { assert } = options;
  if (!(assert === undefined || isAssertion(assert))) {
    return `The query option "assert" must be "some" or "none", but found ${show(assert)}.`;
  }
  return undefined;
};

/**
 * Reads an invariant's options record. Its one option, "assert", is required,
 * since an invariant with no assertion would check nothing.
 */
export const parseInvariantOptions = (
  options: unknown
): Effect.Effect<Assertion, LogicError> => {
  if (!isRecord(options)) {
    return fail(
      `Invariant options must be a record such as {"assert": "none"}, but found ${show(options)}.`
    );
  }
  const unknown = Object.keys(options).find((key) => key !== "assert");
  if (unknown !== undefined) {
    return fail(
      `Unknown invariant option "${unknown}". The only invariant option is "assert".`
    );
  }
  const { assert } = options;
  if (assert === undefined) {
    return fail(
      `An invariant needs the option "assert", set to "some" or "none", such as {"assert": "none"}.`
    );
  }
  return isAssertion(assert)
    ? Effect.succeed(assert)
    : fail(
        `The invariant option "assert" must be "some" or "none", but found ${show(assert)}.`
      );
};

/**
 * Describes how a goal's answers break an assertion, or returns undefined.
 * `subject` names what made the assertion, such as "query" or "invariant".
 */
export const assertionProblem = (
  subject: string,
  assert: Assertion | undefined,
  rows: readonly Record<string, unknown>[],
  goal: unknown
) => {
  if (assert === "some" && rows.length === 0) {
    return `The ${subject} expected at least one answer but found none: ${show(goal)}.`;
  }
  if (assert === "none" && rows.length > 0) {
    return `The ${subject} expected no answers but found ${rows.length}, such as ${JSON.stringify(rows[0])}: ${show(goal)}.`;
  }
  return undefined;
};

/** Reads and checks a query's options record. */
export const parseQueryOptions = (
  options: unknown,
  outputs: readonly string[]
): Effect.Effect<QueryOptions, LogicError> =>
  Effect.gen(function* () {
    if (options === undefined) {
      return { order: [] };
    }
    if (!isRecord(options)) {
      return yield* fail(
        `Query options must be a record such as {"order": "-points", "limit": 10}, but found ${show(options)}.`
      );
    }
    const problem = optionsProblem(options);
    if (problem !== undefined) {
      return yield* fail(problem);
    }
    const { assert, limit, offset } = options as {
      readonly assert?: Assertion;
      readonly limit?: number;
      readonly offset?: number;
    };
    const order =
      options.order === undefined
        ? []
        : yield* parseOrder(options.order, outputs);
    return {
      order,
      ...(assert === undefined ? {} : { assert }),
      ...(limit === undefined ? {} : { limit }),
      ...(offset === undefined ? {} : { offset }),
    };
  });

const compareRows =
  (keys: readonly SortKey[]) =>
  (a: Record<string, unknown>, b: Record<string, unknown>) => {
    for (const { descending, name } of keys) {
      const order = compareValues(a[name], b[name]);
      if (order !== 0) {
        return descending ? -order : order;
      }
    }
    return 0;
  };

/** Checks the assertion on every answer, then sorts and pages them. */
export const applyQueryOptions = (
  rows: readonly Record<string, unknown>[],
  options: QueryOptions,
  goal: unknown
) =>
  Effect.gen(function* () {
    const problem = assertionProblem("query", options.assert, rows, goal);
    if (problem !== undefined) {
      return yield* fail(problem);
    }
    const sorted =
      options.order.length === 0
        ? rows
        : [...rows].sort(compareRows(options.order));
    const start = options.offset ?? 0;
    return sorted.slice(
      start,
      options.limit === undefined ? undefined : start + options.limit
    );
  });

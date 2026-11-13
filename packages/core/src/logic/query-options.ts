/**
 * Options for `["query", goal, options]`: sort, page, and assert on the
 * answers. Options are read as written, like a relation's column list.
 *
 * An invariant, `["invariant", goal, {"assert": "none"}]`, is the same
 * assertion kept by the database, so it reads its option here too, and so
 * does a relation, whose options are its key and the schema of its rows.
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

/** The options each form takes, and an options record to show in messages. */
const FORMS = {
  query: {
    names: ["order", "limit", "offset", "assert"],
    example: '{"order": "-points", "limit": 10}',
  },
  invariant: { names: ["assert"], example: '{"assert": "none"}' },
  relation: { names: ["key", "schema"], example: '{"key": ["id"]}' },
};

const fail = (message: string) => Effect.fail(new LogicError({ message }));

const show = (value: unknown) => JSON.stringify(render(value));

const isCount = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/**
 * Reads the options record of a form, and fails with what is wrong with it:
 * it is not a record, it has an option the form does not take, or an option
 * has a value it cannot have.
 */
export const readOptions = (form: keyof typeof FORMS, options: unknown) => {
  const { example, names } = FORMS[form];
  const subject = `${form[0]?.toUpperCase()}${form.slice(1)}`;
  if (
    typeof options !== "object" ||
    options === null ||
    Array.isArray(options)
  ) {
    return fail(
      `${subject} options must be a record such as ${example}, but found ${show(options)}.`
    );
  }
  const record = options as Record<string, unknown>;
  const unknown = Object.keys(record).find((key) => !names.includes(key));
  if (unknown !== undefined) {
    const known =
      names.length === 1
        ? `The only ${form} option is "${names[0]}".`
        : `${subject} options are ${names.map((name) => `"${name}"`).join(", ")}.`;
    return fail(`Unknown ${form} option "${unknown}". ${known}`);
  }
  const count = ["limit", "offset"].find(
    (name) => record[name] !== undefined && !isCount(record[name])
  );
  if (count !== undefined) {
    return fail(
      `The ${form} option "${count}" must be a whole number of at least 0, but found ${show(record[count])}.`
    );
  }
  const { assert } = record;
  return assert === undefined || assert === "some" || assert === "none"
    ? Effect.succeed(record)
    : fail(
        `The ${form} option "assert" must be "some" or "none", but found ${show(assert)}.`
      );
};

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

/**
 * Reads an invariant's options record. Its one option, "assert", is required,
 * since an invariant with no assertion would check nothing.
 */
export const parseInvariantOptions = (options: unknown) =>
  Effect.flatMap(readOptions("invariant", options), ({ assert }) =>
    assert === undefined
      ? fail(
          `An invariant needs the option "assert", set to "some" or "none", such as {"assert": "none"}.`
        )
      : Effect.succeed(assert as Assertion)
  );

/** Reads and checks a query's options record. */
export const parseQueryOptions = (
  options: unknown,
  outputs: readonly string[]
): Effect.Effect<QueryOptions, LogicError> =>
  options === undefined
    ? Effect.succeed({ order: [] })
    : Effect.gen(function* () {
        const { order, ...rest } = yield* readOptions("query", options);
        return {
          ...(rest as Omit<QueryOptions, "order">),
          order: order === undefined ? [] : yield* parseOrder(order, outputs),
        };
      });

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

/** Sorts and pages a query's answers. Its assertion is checked before. */
export const applyQueryOptions = (
  rows: readonly Record<string, unknown>[],
  options: QueryOptions
) => {
  const sorted =
    options.order.length === 0
      ? rows
      : [...rows].sort(compareRows(options.order));
  const start = options.offset ?? 0;
  return sorted.slice(
    start,
    options.limit === undefined ? undefined : start + options.limit
  );
};

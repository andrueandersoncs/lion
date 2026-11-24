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
import { AGGREGATORS } from "@/logic/aggregates";
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
  relation: {
    names: ["key", "schema", "merge"],
    example: '{"key": ["id"]}',
  },
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

const parseOrder = (order: unknown, outputs: readonly string[] | undefined) =>
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
      if (
        name === undefined ||
        (outputs !== undefined && !outputs.includes(name))
      ) {
        const available =
          outputs === undefined
            ? "none"
            : outputs.map((output) => `?${output}`).join(", ") || "none";
        return yield* fail(
          `Cannot order by ${JSON.stringify(spec)}: the query's variables are ${available}.`
        );
      }
      keys.push({ descending: match?.[1] === "-", name });
    }
    return keys;
  });

/** Checks a query's options shape and sort-key syntax without requiring goal variables. */
export const parseQueryOptionsShape = (
  options: unknown
): Effect.Effect<QueryOptions, LogicError> =>
  options === undefined
    ? Effect.succeed({ order: [] })
    : Effect.gen(function* () {
        const { order, ...rest } = yield* readOptions("query", options);
        return {
          ...(rest as Omit<QueryOptions, "order">),
          order: order === undefined ? [] : yield* parseOrder(order, undefined),
        };
      });

/** The first name a list repeats. */
const repeatedIn = (names: readonly string[]) =>
  names.find((name, at) => names.indexOf(name) !== at);

const repeats = (name: string, column: string, where: string) =>
  `Relation "${name}" repeats the column "${column}"${where}.`;

const noColumn = (
  name: string,
  column: string,
  use: "key" | "merge",
  columns: readonly string[]
) =>
  `Relation "${name}" has no column "${column}" for its ${use}. Its columns are ${JSON.stringify(columns)}.`;

const keyProblem = (
  name: string,
  columns: readonly string[],
  key: readonly string[]
) => {
  if (key.length === 0) {
    return `Relation "${name}" needs at least one key column.`;
  }
  const unknown = key.find((column) => !columns.includes(column));
  if (unknown !== undefined) {
    return noColumn(name, unknown, "key", columns);
  }
  const repeated = repeatedIn(key);
  return repeated === undefined
    ? undefined
    : repeats(name, repeated, " in its key");
};

const MERGES = Object.keys(AGGREGATORS).map((kind) => `"aggregate/${kind}"`);

const mergeProblem = (
  name: string,
  columns: readonly string[],
  key: readonly string[] | undefined,
  merge: readonly (readonly [string, string])[]
) => {
  if (key === undefined) {
    return `Relation "${name}" merges the rows a key gets, so it needs a key, as in {"key": ["id"], "merge": {...}}.`;
  }
  for (const [column, kind] of merge) {
    if (!columns.includes(column)) {
      return noColumn(name, column, "merge", columns);
    }
    if (key.includes(column)) {
      return `Relation "${name}" cannot merge "${column}": it is part of the key, and the key says which rows merge.`;
    }
    if (!MERGES.includes(JSON.stringify(kind))) {
      return `Relation "${name}" merges "${column}" with ${JSON.stringify(kind)}, but a merge combines values with an aggregate, such as "aggregate/sum" or "aggregate/min".`;
    }
  }
  return;
};

/** Checks a relation's columns, key, and merge against each other; undefined if valid. */
export const validateRelationParts = (
  name: string,
  columns: readonly string[],
  key?: readonly string[],
  merge?: readonly (readonly [string, string])[]
): string | undefined => {
  const repeated = repeatedIn(columns);
  if (repeated !== undefined) {
    return repeats(name, repeated, "");
  }
  const badKey = key === undefined ? undefined : keyProblem(name, columns, key);
  if (badKey !== undefined) {
    return badKey;
  }
  return merge === undefined || merge.length === 0
    ? undefined
    : mergeProblem(name, columns, key, merge);
};

/** Parses and validates a relation's options record (`key`, `schema`, `merge`). */
export const parseRelationOptions = (name: string, options: unknown) =>
  Effect.gen(function* () {
    const {
      key: given,
      merge,
      schema,
    } = options === undefined ? {} : yield* readOptions("relation", options);
    const key = typeof given === "string" ? [given] : given;
    const isKey =
      Array.isArray(key) && key.every((column) => typeof column === "string");
    if (!(key === undefined || isKey)) {
      return yield* fail(
        `The key of "${name}" must be a column name or a list of them, but found ${show(given)}.`
      );
    }
    if (!(schema === undefined || typeof schema === "string")) {
      return yield* fail(
        `The schema of "${name}" must be the name of a declared schema, but found ${show(schema)}.`
      );
    }
    const merges =
      typeof merge === "object" && merge !== null && !Array.isArray(merge)
        ? Object.entries(merge as Record<string, unknown>)
        : undefined;
    if (
      !(
        merge === undefined ||
        merges?.every(([, kind]) => typeof kind === "string")
      )
    ) {
      return yield* fail(
        `The merge of "${name}" must be a record from a column to the aggregate that joins its values, as in {"price": "aggregate/min"}, but found ${show(merge)}.`
      );
    }
    return {
      key: key as readonly string[] | undefined,
      merge: merges as readonly (readonly [string, string])[] | undefined,
      schema,
    };
  });

/** Validates a relation declaration's options, columns, key, and merge together. */
export const parseRelationDeclaration = (
  name: string,
  columns: readonly string[],
  options: unknown
) =>
  Effect.flatMap(parseRelationOptions(name, options), (parsed) => {
    const problem = validateRelationParts(
      name,
      columns,
      parsed.key,
      parsed.merge
    );
    return problem === undefined ? Effect.succeed(parsed) : fail(problem);
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
 * The answer a message shows as an example: the first in sort order, so the
 * message does not depend on the order the answers were found in.
 */
export const exampleOf = (rows: readonly Record<string, unknown>[]) =>
  rows.reduce((least, row) => (compareValues(row, least) < 0 ? row : least));

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
    return `The ${subject} expected no answers but found ${rows.length}, such as ${JSON.stringify(exampleOf(rows))}: ${show(goal)}.`;
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

/**
 * Options for `["query", goal, options]`: sort, page, and assert on the
 * answers. Options are read as written, like a relation's column list.
 */
import { Effect } from "effect";
import { LogicError } from "@/errors/evaluation";
import { compareValues, render } from "@/logic/terms";

interface SortKey {
  readonly descending: boolean;
  readonly name: string;
}

export interface QueryOptions {
  readonly assert?: "some" | "none";
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
  if (!(assert === undefined || assert === "some" || assert === "none")) {
    return `The query option "assert" must be "some" or "none", but found ${show(assert)}.`;
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
      readonly assert?: "some" | "none";
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
    if (options.assert === "some" && rows.length === 0) {
      return yield* fail(
        `The query expected at least one answer but found none: ${show(goal)}.`
      );
    }
    if (options.assert === "none" && rows.length > 0) {
      return yield* fail(
        `The query expected no answers but found ${rows.length}, such as ${JSON.stringify(rows[0])}: ${show(goal)}.`
      );
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

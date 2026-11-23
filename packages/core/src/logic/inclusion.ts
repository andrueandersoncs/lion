/**
 * Whether one schema includes another: every value the first allows fits
 * the second. A schema that lists its values is checked value by value, as
 * a schema check binds a value to each; any other stands for its values
 * symbolically, and the solver decides whether some value of its shape
 * fails the second schema. Anything the solver cannot decide is refused by
 * name, so every answer is exact.
 */
import { Effect } from "effect";
import { LogicError } from "@/errors/evaluation";
import { fits } from "@/logic/fit";
import { candidatesOf, unlisted } from "@/logic/listing";
import { type Constraint, type Sort, satisfiable } from "@/logic/solver";
import {
  type Context,
  EMPTY_SCHEMA,
  fitsOf,
  shapeFor,
  withDefinitions,
} from "@/logic/symbolic";
import {
  ANY_REST_SCHEMA,
  and,
  type Cases,
  not,
  product,
  type Sym,
  throughNames,
} from "@/logic/symbols";
import { buildOf, nameOf, show } from "@/logic/terms";

const failure = (error: unknown) =>
  error instanceof LogicError
    ? error
    : new LogicError({
        message: error instanceof Error ? error.message : String(error),
      });

/** Whether a value fits a schema, as schema/fits? says. */
const fitting = (schema: unknown, value: unknown) =>
  Effect.map(
    fits(schema, value) as unknown as Effect.Effect<unknown, Error>,
    (fit) => fit === true
  );

/** Whether two schemas are written the same way. */
const sameWritten = (a: unknown, b: unknown) => {
  try {
    return show(a) === show(b);
  } catch {
    return false;
  }
};

const sortsOf = (
  constraints: readonly Constraint[],
  sorts: ReadonlyMap<string, Sort>
) =>
  new Map(
    constraints
      .flatMap((c) => [...c.linear.coefficients.keys()])
      .map((name) => [name, sorts.get(name) ?? "real"] as const)
  );

const sameSchema = (inner: unknown, outer: unknown) =>
  inner === outer || sameWritten(inner, outer);

/**
 * Whether every value `inner` allows fits `outer`. A schema includes
 * itself, as one written the same way does, whatever it allows.
 */
export const includes = (
  inner: unknown,
  outer: unknown
): Effect.Effect<boolean, LogicError> =>
  inner === EMPTY_SCHEMA ||
  outer === ANY_REST_SCHEMA ||
  sameSchema(inner, outer)
    ? Effect.succeed(true)
    : decided(inner, outer);

const MAX_SPLIT = 8;

const NO_SPLIT = { hasUnion: false, max: -1 } as const;

const splitBuilt = (
  name: string | undefined,
  args: readonly unknown[],
  seen: Set<unknown>
): { readonly hasUnion: boolean; readonly max: number } => {
  if (name === "schema/anyOf" || name === "schema/allOf") {
    let max = -1;
    let hasUnion = name === "schema/anyOf";
    for (const part of args) {
      const sub = listSplitOf(part, seen);
      hasUnion ||= sub.hasUnion;
      max = Math.max(max, sub.max);
    }
    return { hasUnion, max };
  }
  if (name === "schema/optional") {
    return listSplitOf(args[0], seen);
  }
  if (name === "schema/arrayOf") {
    return { hasUnion: false, max: (args[1] as number | undefined) ?? -1 };
  }
  if (name === "schema/open") {
    const prefix = throughNames(args[0]);
    const rest = args.length > 1 ? listSplitOf(args[1], seen) : undefined;
    const prefixLen = Array.isArray(prefix) ? prefix.length : -1;
    const total =
      prefixLen >= 0 && rest !== undefined && rest.max >= 0
        ? prefixLen + rest.max
        : prefixLen;
    return { hasUnion: rest?.hasUnion ?? false, max: total };
  }
  return NO_SPLIT;
};

/** Largest fixed tuple or open-list prefix length mentioned inside an `anyOf` schema. */
const listSplitOf = (
  schema: unknown,
  seen = new Set<unknown>()
): { readonly hasUnion: boolean; readonly max: number } => {
  const shape = throughNames(schema);
  if (
    shape === null ||
    (typeof shape !== "object" && typeof shape !== "function") ||
    seen.has(shape)
  ) {
    return NO_SPLIT;
  }
  seen.add(shape);
  if (Array.isArray(shape)) {
    return { hasUnion: false, max: shape.length };
  }
  const built = buildOf(shape);
  return built === undefined
    ? NO_SPLIT
    : splitBuilt(nameOf(built.by), built.args, seen);
};

/**
 * Splits an unbounded list case into exact lengths up to `max` plus a tail of
 * length `> max`, so an `anyOf` partitioning by length (such as `[]` or
 * non-empty lists) is decided exactly.
 */
const expandList = (
  sym: Extract<Sym, { kind: "list" }>,
  when: Cases[number]["when"],
  max: number,
  tag: string,
  context: Context
): Effect.Effect<Cases, Error> =>
  Effect.gen(function* () {
    const needed = Math.min(max, MAX_SPLIT) - sym.items.length + 1;
    if (needed <= 0) {
      return [{ sym, when }];
    }
    const extras: Cases[] = [];
    for (let at = 0; at < needed; at += 1) {
      extras.push((yield* shapeFor(`${tag}#${at}`, sym.rest, context)).cases);
    }
    const out: { when: Cases[number]["when"]; sym: Sym }[] = [];
    for (let extra = 0; extra < needed; extra += 1) {
      for (const { syms, when: extraWhen } of product(extras.slice(0, extra))) {
        const both = and(when, extraWhen);
        if (both.length > 0) {
          out.push({
            sym: { items: [...sym.items, ...syms], kind: "list" },
            when: both,
          });
        }
      }
    }
    for (const { syms, when: extraWhen } of product(extras)) {
      const both = and(when, extraWhen);
      if (both.length > 0) {
        out.push({
          sym: {
            items: [...sym.items, ...syms],
            kind: "list",
            rest: sym.rest,
          },
          when: both,
        });
      }
    }
    return out;
  });

const expandCases = (
  cases: Cases,
  split: { readonly hasUnion: boolean; readonly max: number },
  context: Context
) =>
  Effect.gen(function* () {
    const expanded: { when: Cases[number]["when"]; sym: Sym }[] = [];
    for (const [at, each] of cases.entries()) {
      if (
        split.hasUnion &&
        each.sym.kind === "list" &&
        each.sym.rest !== undefined &&
        split.max >= each.sym.items.length
      ) {
        expanded.push(
          ...(yield* expandList(
            each.sym,
            each.when,
            split.max,
            `value#${at}`,
            context
          ))
        );
      } else {
        expanded.push(each);
      }
    }
    return expanded;
  });

const listedIncluded = (inner: unknown, outer: unknown) =>
  Effect.gen(function* () {
    const values = yield* Effect.try({
      try: () => candidatesOf(inner),
      catch: failure,
    });
    for (const value of values) {
      if ((yield* fitting(inner, value)) && !(yield* fitting(outer, value))) {
        return false;
      }
    }
    return true;
  });

/** Whether every value `inner` allows fits `outer`, by listing or the solver. */
const decided = (
  inner: unknown,
  outer: unknown
): Effect.Effect<boolean, LogicError> =>
  Effect.gen(function* () {
    if (
      inner !== ANY_REST_SCHEMA &&
      inner !== EMPTY_SCHEMA &&
      unlisted(inner) === undefined
    ) {
      return yield* listedIncluded(inner, outer);
    }
    const sorts = new Map<string, Sort>();
    const context: Context = {
      atoms: new Map(),
      broad: true,
      checkIncludes: (a, b) => includes(a, b),
      definitions: new Map(),
      evaluate: (part) =>
        Effect.fail(
          new LogicError({ message: `${show(part)} has no value here.` })
        ),
      floors: new Map(),
      sorts,
      symbols: new Map(),
    };
    const { cases } = yield* shapeFor("value", inner, context);
    const split = listSplitOf(outer);
    const expanded = yield* expandCases(cases, split, context);
    for (const { sym, when } of expanded) {
      const fit = yield* fitsOf(sym, outer, context, 0);
      for (const raw of and(when, not(fit))) {
        const constraints = withDefinitions(raw, context.definitions);
        if (satisfiable(constraints, sortsOf(constraints, sorts))) {
          return false;
        }
      }
    }
    return true;
  }).pipe(
    Effect.mapError(
      (error) =>
        new LogicError({
          message: `schema/includes? cannot say whether every value ${show(inner)} allows fits ${show(outer)}: ${failure(error).message}`,
        })
    ),
    Effect.catchDefect((defect) =>
      Effect.fail(
        new LogicError({
          message: `schema/includes? cannot say whether every value ${show(inner)} allows fits ${show(outer)}: ${failure(defect).message}`,
        })
      )
    )
  );

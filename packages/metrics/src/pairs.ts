/**
 * Pairs of the interop grid's rows: one kind of expression written where
 * another has its variable, such as a `match` inside a call, in each place
 * the grid has. The grid's rule holds of a pair as of a row: in every place
 * it gives what plain code gives with the variable's value written in.
 *
 * A pair's cell that is an exception where neither of its rows has one in
 * that place is a surprise: the two features work alone and fail together.
 * That is what someone who knows each feature would not expect, so each
 * surprise is a bug to fix or a rule to document.
 */
import { Effect } from "effect";
import { type Cell, cellOf, isException, modelOf, substitute } from "./grid.ts";
import {
  EXPRESSIONS,
  type Expression,
  POSITIONS,
  WORLD,
  type World,
  X,
} from "./grid-cases.ts";
import type { Lion } from "./lion.ts";

/** The relations a row's setup declares. */
const declared = (setup: readonly unknown[]): ReadonlySet<string> =>
  new Set(
    setup.flatMap((form) =>
      Array.isArray(form) &&
      form[0] === "relation" &&
      typeof form[1] === "string"
        ? [form[1]]
        : []
    )
  );

/**
 * A form with its logic variables other than `?x` and `?_`, and the
 * relations its row declares, renamed apart, so that neither an inner
 * expression's own variables nor its relations meet the outer's words. A
 * string names what is bound by that name, so a relation the inner row
 * declares would otherwise turn a word of the outer row into a relation.
 */
export const apart = (
  form: unknown,
  relations: ReadonlySet<string> = new Set()
): unknown => {
  if (typeof form === "string") {
    const variable = form.startsWith("?") && form !== X && form !== "?_";
    return variable || relations.has(form) ? `${form}_inner` : form;
  }
  if (Array.isArray(form)) {
    return form.map((item) => apart(item, relations));
  }
  if (typeof form === "object" && form !== null) {
    return Object.fromEntries(
      Object.entries(form).map(([key, item]) => [key, apart(item, relations)])
    );
  }
  return form;
};

/** The expression `outer` with `inner` written where `outer` has its variable. */
export const composed = (outer: Expression, inner: Expression): Expression => {
  const own = declared(inner.setup ?? []);
  const setup = [
    ...(outer.setup ?? []),
    ...(inner.setup ?? []).map((form) => apart(form, own)),
  ];
  return {
    ...(outer.boolean === true ? { boolean: true } : {}),
    form: substitute(outer.form, apart(inner.form, own)),
    name: `${outer.name} of ${inner.name}`,
    ...(setup.length === 0 ? {} : { setup }),
  };
};

/**
 * Whether a value is data a relation can hold: JSON's values, with finite
 * numbers, or a logic value, which JSON writes as the expression it shows
 * as, but not a fraction JSON cannot write. A host function given what it does not take can give NaN, and plain
 * code then gives no data for a place to give back.
 */
export const isData = (value: unknown): boolean => {
  if (value === null || typeof value === "string") {
    return true;
  }
  if (typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isData);
  }
  if (typeof value !== "object") {
    return false;
  }
  if (Object.getPrototypeOf(value) === Object.prototype) {
    return Object.values(value).every(isData);
  }
  // An exact fraction no decimal writes, as 4/3, is a value JSON cannot
  // hold, and its JSON fails.
  try {
    const written = JSON.stringify(value);
    return written !== undefined && written !== "null";
  } catch {
    return false;
  }
};

/** A pair's cell, with the rows it was made of. */
export interface PairCell extends Cell {
  readonly inner: string;
  readonly outer: string;
}

/** The verdicts of the single rows, by row and place. */
export type Singles = ReadonlyMap<string, Cell["verdict"]>;

const key = (expression: string, position: string) =>
  `${expression}\n${position}`;

/** The single rows' verdicts, from the grid's cells. */
export const singlesOf = (cells: readonly Cell[]): Singles =>
  new Map(
    cells.map((cell) => [key(cell.expression, cell.position), cell.verdict])
  );

/**
 * A surprise: a pair's exception where each of its rows gives plain code's
 * answer, or is skipped for a place it cannot stand, but neither is an
 * exception nor absent there.
 */
export const isSurprise = (cell: PairCell, singles: Singles): boolean => {
  if (!isException(cell)) {
    return false;
  }
  return [cell.outer, cell.inner].every((row) => {
    const verdict = singles.get(key(row, cell.position));
    return verdict === "same" || verdict === "skipped";
  });
};

/**
 * The cells of one pair, in every place. Where plain code cannot evaluate
 * the pair, or gives what is no data, every cell is absent.
 */
export const pairOf = (
  lion: Lion,
  outer: Expression,
  inner: Expression,
  world: World = WORLD
): Effect.Effect<PairCell[]> =>
  Effect.gen(function* () {
    const expression = composed(outer, inner);
    const model = yield* modelOf(lion, expression, world);
    const names = { inner: inner.name, outer: outer.name };
    if (typeof model === "string" || !model.every(([, v]) => isData(v))) {
      return POSITIONS.map(
        (position): PairCell => ({
          ...names,
          expression: expression.name,
          position: position.name,
          verdict: "absent",
        })
      );
    }
    const cells = yield* Effect.forEach(POSITIONS, (position) =>
      cellOf(lion, expression, position, model, world)
    );
    return cells.map((cell) => ({ ...cell, ...names }));
  });

/** Every pair of rows, or those `chosen` names, outer first. */
export const pairsOf = (
  chosen?: readonly (readonly [string, string])[]
): (readonly [Expression, Expression])[] => {
  const byName = new Map(EXPRESSIONS.map((row) => [row.name, row]));
  if (chosen !== undefined) {
    return chosen.flatMap(([outer, inner]) => {
      const a = byName.get(outer);
      const b = byName.get(inner);
      return a === undefined || b === undefined ? [] : [[a, b] as const];
    });
  }
  return EXPRESSIONS.flatMap((outer) =>
    EXPRESSIONS.map((inner) => [outer, inner] as const)
  );
};

/** What the pairs gave, by verdict, and how many cells surprise. */
export interface PairsSummary {
  readonly absent: number;
  readonly cells: number;
  readonly exceptions: number;
  readonly pairs: number;
  readonly same: number;
  readonly surprises: number;
}

export const summarizePairs = (
  cells: readonly PairCell[],
  singles: Singles
): PairsSummary => ({
  absent: cells.filter((cell) => cell.verdict === "absent").length,
  cells: cells.length,
  exceptions: cells.filter(isException).length,
  pairs: new Set(cells.map((cell) => `${cell.outer}\n${cell.inner}`)).size,
  same: cells.filter((cell) => cell.verdict === "same").length,
  surprises: cells.filter((cell) => isSurprise(cell, singles)).length,
});

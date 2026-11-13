/**
 * Runs the interop grid: every kind of expression in every place, compared
 * with what plain code gives. The cells that differ are the exceptions to
 * Lion's two rules, and their number is the measure of how much a Lion
 * programmer has to remember beyond the rules.
 */
import { Effect } from "effect";
import {
  EXPRESSIONS,
  type Expression,
  HOST,
  KNOWN,
  type Model,
  POSITIONS,
  type Position,
  prelude,
  WORLD,
  type World,
  X,
} from "./grid-cases.ts";
import { canonical, evaluate, type Lion, type Outcome } from "./lion.ts";

/**
 * How a cell compares with plain code.
 *
 * - `same`: it gives what plain code gives.
 * - `refused`: the program fails.
 * - `different`: it runs and gives something else.
 * - `skipped`: the place takes only goals, and the expression is not one.
 * - `absent`: plain code cannot evaluate the expression in this version.
 */
export type Verdict = "same" | "refused" | "different" | "skipped" | "absent";

export interface Cell {
  /** What went wrong: the error, or what was expected and what came. */
  readonly detail?: string;
  readonly expression: string;
  /** The documented rule behind the exception, when it is a known one. */
  readonly known?: string;
  readonly position: string;
  readonly verdict: Verdict;
}

/** Writes a value in place of the variable, everywhere in a form. */
export const substitute = (form: unknown, value: unknown): unknown => {
  if (form === X) {
    return value;
  }
  if (Array.isArray(form)) {
    return form.map((item) => substitute(item, value));
  }
  if (typeof form === "object" && form !== null) {
    return Object.fromEntries(
      Object.entries(form).map(([key, item]) => [key, substitute(item, value)])
    );
  }
  return form;
};

const run = (lion: Lion, forms: readonly unknown[]) =>
  evaluate(lion, ["begin", ...forms], { environment: HOST });

/**
 * What plain code gives the expression for each value of `?x`, or the error
 * when plain code cannot evaluate it. A record holds the value, since a
 * record's values are asked.
 */
export const modelOf = (
  lion: Lion,
  expression: Expression,
  world: World
): Effect.Effect<Model | string> =>
  Effect.gen(function* () {
    const model: [number, unknown][] = [];
    for (const x of [...world.n].sort((a, b) => a - b)) {
      const outcome = yield* run(lion, [
        ...prelude(world),
        ...(expression.setup ?? []),
        { value: substitute(expression.form, x) },
      ]);
      if (!outcome.ok) {
        return outcome.error;
      }
      model.push([x, (outcome.value as { readonly value: unknown }).value]);
    }
    return model;
  });

/** Saves the database the forms build, and asks the question of a copy. */
const reloaded = (
  lion: Lion,
  forms: readonly unknown[],
  question: unknown
): Effect.Effect<Outcome> =>
  Effect.flatMap(run(lion, [...forms, ["snapshot"]]), (saved) =>
    saved.ok ? run(lion, [saved.value, question]) : Effect.succeed(saved)
  );

const knownRule = (expression: string, position: string) =>
  KNOWN.find(
    (known) => known.expression === expression && known.position === position
  )?.why;

const SHOWN = 160;

const shorten = (text: string) =>
  text.length > SHOWN ? `${text.slice(0, SHOWN)}…` : text;

/** Fills in one cell of the grid. */
export const cellOf = (
  lion: Lion,
  expression: Expression,
  position: Position,
  model: Model,
  world: World
): Effect.Effect<Cell> =>
  Effect.gen(function* () {
    const cell = { expression: expression.name, position: position.name };
    if (position.booleanOnly && !expression.boolean) {
      return { ...cell, verdict: "skipped" };
    }
    const forms = [
      ...prelude(world),
      ...(expression.setup ?? []),
      ...(position.setup?.(expression.form, model) ?? []),
    ];
    const question = position.question(expression.form, model);
    const outcome = position.reload
      ? yield* reloaded(lion, forms, question)
      : yield* run(lion, [...forms, question]);
    const known = knownRule(expression.name, position.name);
    const exception = known === undefined ? {} : { known };
    if (!outcome.ok) {
      return {
        ...cell,
        ...exception,
        detail: shorten(outcome.error),
        verdict: "refused",
      };
    }
    const actual = canonical(position.read?.(outcome.value) ?? outcome.value);
    const expected = canonical(position.expected(model));
    return actual === expected
      ? { ...cell, verdict: "same" }
      : {
          ...cell,
          ...exception,
          detail: shorten(`expected ${expected} but got ${actual}`),
          verdict: "different",
        };
  });

/** Fills in the row of one expression. */
export const rowOf = (
  lion: Lion,
  expression: Expression,
  world: World
): Effect.Effect<Cell[]> =>
  Effect.gen(function* () {
    const model = yield* modelOf(lion, expression, world);
    if (typeof model === "string") {
      return POSITIONS.map(
        (position): Cell => ({
          detail: shorten(model),
          expression: expression.name,
          position: position.name,
          verdict: "absent",
        })
      );
    }
    return yield* Effect.forEach(POSITIONS, (position) =>
      cellOf(lion, expression, position, model, world)
    );
  });

/** Fills in the whole grid, row by row. */
export const runGrid = (
  lion: Lion,
  world: World = WORLD
): Effect.Effect<Cell[]> =>
  Effect.map(
    Effect.forEach(EXPRESSIONS, (expression) => rowOf(lion, expression, world)),
    (grid) => grid.flat()
  );

export interface GridSummary {
  readonly absent: number;
  readonly different: number;
  /** Cells that are refused or different: what there is to remember. */
  readonly exceptions: number;
  readonly refused: number;
  readonly same: number;
  readonly skipped: number;
}

export const summarize = (cells: readonly Cell[]): GridSummary => {
  const count = (verdict: Verdict) =>
    cells.filter((cell) => cell.verdict === verdict).length;
  const refused = count("refused");
  const different = count("different");
  return {
    absent: count("absent"),
    different,
    exceptions: refused + different,
    refused,
    same: count("same"),
    skipped: count("skipped"),
  };
};

/** True for a cell that is an exception: it is refused, or gives something else. */
export const isException = (cell: Cell): boolean =>
  cell.verdict === "refused" || cell.verdict === "different";

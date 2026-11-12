/**
 * The interop grid as a property: for any facts, every kind of expression
 * gives in every place what plain code gives, except where Lion documents
 * that it does not.
 */
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect } from "effect";
import { type Cell, isException, runGrid, substitute } from "../grid.ts";
import { EXPRESSIONS, KNOWN, POSITIONS, type World, X } from "../grid-cases.ts";
import { load } from "../lion.ts";
import { CORE, REPOSITORY } from "../sources.ts";
import { between, element, oneOf, word } from "./generators.ts";

const OPTIONS = { timeout: 300_000, arbitrary: { runs: 100 } };

/** The evaluator of the working tree, loaded once. */
const lion = Effect.runPromise(load(join(REPOSITORY, CORE)));

const value = between(0, 4);

const subset = Arbitrary.map(
  Arbitrary.array(value, { maxLength: 5 }),
  (items) => [...new Set(items)].sort((a, b) => a - b)
);

const world: Arbitrary.Arbitrary<World> = Arbitrary.all({
  link: Arbitrary.array(Arbitrary.all([value, value]), { maxLength: 5 }),
  n: subset,
  small: subset,
});

const gridOf = (facts: World) =>
  Effect.flatMap(
    Effect.promise(() => lion),
    (evaluator) => runGrid(evaluator, facts)
  );

const isKnown = ({ expression, position }: Cell) =>
  KNOWN.some(
    (known) => known.expression === expression && known.position === position
  );

describe("the interop grid", () => {
  it.effect.prop(
    "gives in every place what plain code gives, or is a documented exception",
    { facts: world },
    ({ facts }) =>
      Effect.gen(function* () {
        const cells = yield* gridOf(facts);
        expect(cells).toHaveLength(EXPRESSIONS.length * POSITIONS.length);
        expect(
          cells.filter(
            (cell) =>
              cell.verdict !== "same" &&
              cell.verdict !== "skipped" &&
              !isKnown(cell)
          )
        ).toEqual([]);
      }),
    OPTIONS
  );

  it.effect.prop(
    "skips exactly the places that take a goal, for expressions that are not one",
    { facts: world },
    ({ facts }) =>
      Effect.gen(function* () {
        const cells = yield* gridOf(facts);
        const goals = new Set(
          EXPRESSIONS.filter(({ boolean }) => boolean).map(({ name }) => name)
        );
        const tests = new Set(
          POSITIONS.filter(({ booleanOnly }) => booleanOnly).map(
            ({ name }) => name
          )
        );
        for (const cell of cells) {
          expect(cell.verdict === "skipped").toBe(
            tests.has(cell.position) && !goals.has(cell.expression)
          );
        }
      }),
    { ...OPTIONS, arbitrary: { runs: 20 } }
  );

  it.effect.prop(
    "lists as known only cells that are exceptions",
    { facts: world, x: value },
    ({ facts, x }) =>
      Effect.gen(function* () {
        // An exception shows once the variable has a value to take.
        const cells = yield* gridOf({
          ...facts,
          n: [...new Set([...facts.n, x])],
        });
        const known = cells.filter(isKnown);
        expect(known).toHaveLength(KNOWN.length);
        expect(known.filter((cell) => !isException(cell))).toEqual([]);
      }),
    { ...OPTIONS, arbitrary: { runs: 20 } }
  );
});

/** A form, or a place where the variable goes. */
type Shape =
  | { readonly kind: "hole" }
  | { readonly kind: "leaf"; readonly value: string | number | boolean | null }
  | { readonly items: readonly Shape[]; readonly kind: "list" }
  | {
      readonly entries: readonly (readonly [string, Shape])[];
      readonly kind: "record";
    };

const leafShape: Arbitrary.Arbitrary<Shape> = oneOf<Shape>(
  element<Shape>([{ kind: "hole" }, { kind: "leaf", value: null }]),
  Arbitrary.map(word, (text) => ({ kind: "leaf", value: text })),
  Arbitrary.map(value, (number) => ({ kind: "leaf", value: number }))
);

const shape = (depth: number): Arbitrary.Arbitrary<Shape> =>
  depth === 0
    ? leafShape
    : oneOf<Shape>(
        leafShape,
        Arbitrary.map(
          Arbitrary.array(shape(depth - 1), { maxLength: 3 }),
          (items) => ({ items, kind: "list" })
        ),
        Arbitrary.map(
          Arbitrary.array(Arbitrary.all([word, shape(depth - 1)]), {
            maxLength: 3,
          }),
          (entries) => ({ entries, kind: "record" })
        )
      );

/** Builds the form a shape describes, with `hole` where the variable goes. */
const build = (item: Shape, hole: unknown): unknown => {
  switch (item.kind) {
    case "hole":
      return hole;
    case "leaf":
      return item.value;
    case "list":
      return item.items.map((inner) => build(inner, hole));
    default:
      return Object.fromEntries(
        item.entries.map(([key, inner]) => [key, build(inner, hole)])
      );
  }
};

describe("substitute", () => {
  it.prop(
    "writes the value wherever the variable stands, and changes nothing else",
    { form: shape(3), replacement: value },
    ({ form, replacement }) => {
      expect(substitute(build(form, X), replacement)).toEqual(
        build(form, replacement)
      );
    }
  );
});

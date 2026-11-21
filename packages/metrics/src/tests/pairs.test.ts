import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { type Cell, runGrid } from "../grid.ts";
import { EXPRESSIONS, X } from "../grid-cases.ts";
import { load } from "../lion.ts";
import {
  apart,
  composed,
  isSurprise,
  type PairCell,
  pairOf,
  singlesOf,
} from "../pairs.ts";
import { CORE, REPOSITORY } from "../sources.ts";
import { element } from "./generators.ts";

/** The evaluator of the working tree, loaded once, and its grid's verdicts. */
const lion = Effect.runPromise(load(join(REPOSITORY, CORE)));
const singles = lion.then((loaded) =>
  Effect.runPromise(runGrid(loaded)).then(singlesOf)
);

const row = element(EXPRESSIONS);

/** The strings of a form, everywhere in it. */
const words = (form: unknown): string[] => {
  if (typeof form === "string") {
    return [form];
  }
  if (Array.isArray(form)) {
    return form.flatMap(words);
  }
  if (typeof form === "object" && form !== null) {
    return Object.values(form).flatMap(words);
  }
  return [];
};

const declaredBy = (setup: readonly unknown[] = []) =>
  setup.flatMap((form) =>
    Array.isArray(form) && form[0] === "relation" ? [form[1] as string] : []
  );

const verdict = element<Cell["verdict"]>([
  "same",
  "refused",
  "different",
  "skipped",
  "absent",
]);

describe("pairs of the grid's rows", () => {
  it.prop(
    "write the inner row where the outer has ?x, and the row that is ?x alone leaves either as it was",
    { inner: row, outer: row },
    ({ inner, outer }) => {
      const identity = { form: X, name: "x" };
      expect(composed(outer, identity).form).toStrictEqual(outer.form);
      expect(composed(identity, inner).form).toStrictEqual(
        apart(inner.form, new Set(declaredBy(inner.setup)))
      );
    }
  );

  it.prop(
    "keep the inner row's own variables and relations apart from every word of the outer row",
    { inner: row, outer: row },
    ({ inner, outer }) => {
      const own = new Set(declaredBy(inner.setup));
      const moved = words(apart(inner.form, own));
      const outerWords = new Set(words(outer.form));
      for (const word of moved) {
        if (word !== X && word !== "?_" && outerWords.has(word)) {
          expect(word.startsWith("?") || own.has(word)).toBe(false);
        }
        expect(own.has(word)).toBe(false);
      }
    }
  );

  it.prop(
    "call a cell surprising when it is an exception where each row gives plain code's answer or cannot stand",
    { inner: verdict, it: verdict, outer: verdict },
    ({ inner, it: own, outer }) => {
      const cell: PairCell = {
        expression: "o of i",
        inner: "i",
        outer: "o",
        position: "p",
        verdict: own,
      };
      const given = new Map([
        ["o\np", outer],
        ["i\np", inner],
      ]);
      const fine = (v: Cell["verdict"]) => v === "same" || v === "skipped";
      expect(isSurprise(cell, given)).toBe(
        (own === "refused" || own === "different") && fine(outer) && fine(inner)
      );
    }
  );

  it.effect.prop(
    "give what plain code gives wherever both of their rows do, in every place",
    { inner: row, outer: row },
    ({ inner, outer }) =>
      Effect.gen(function* () {
        const cells = yield* pairOf(
          yield* Effect.promise(() => lion),
          outer,
          inner
        );
        const known = yield* Effect.promise(() => singles);
        expect(
          cells
            .filter((cell) => isSurprise(cell, known))
            .map(
              (cell) => `${cell.expression} in ${cell.position}: ${cell.detail}`
            )
        ).toStrictEqual([]);
      }),
    { arbitrary: { runs: 60 } }
  );
});

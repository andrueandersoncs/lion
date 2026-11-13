/**
 * Lion's modules import each other in circles: the evaluator imports the
 * special forms, and the forms import the evaluator. So nothing may be
 * built from another module's exports while a module loads, or what it
 * builds depends on which module happened to load first, and a bundler is
 * free to choose. Whichever modules load first, in whatever order, a
 * program must evaluate to the same value.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { vi } from "vitest";

declare global {
  interface ImportMeta {
    /** Vite's glob import: each matching module, by path, with its loader. */
    glob(patterns: readonly string[]): Record<string, () => Promise<unknown>>;
  }
}

/** Every source module of the package, by path, with how to load it. */
const MODULES = Object.entries(
  import.meta.glob(["/src/**/*.ts", "!/src/**/*.test.ts", "!/src/**/tests/**"])
).sort(([a], [b]) => (a < b ? -1 : 1));

const index = Arbitrary.schema(
  Schema.Int.check(
    Schema.isBetween({ minimum: 0, maximum: MODULES.length - 1 })
  )
);

/** A program that uses every kind of special form, and what it gives. */
const PROGRAM = [
  "begin",
  ["define", "double", ["lambda", ["n"], ["number/multiply", "n", 2]]],
  ["relation", "edge", ["from", "to"]],
  ["relation", "path", ["from", "to"]],
  ["schema", "Step", { from: "value/integer?", to: "value/integer?" }],
  ["fact", ["edge", 1, 2], ["edge", 2, 3]],
  ["rule", ["path", "?x", "?y"], ["edge", "?x", "?y"]],
  ["rule", ["path", "?x", "?z"], ["path", "?x", "?y"], ["edge", "?y", "?z"]],
  ["invariant", ["edge", "?x", "?x"], { assert: "none" }],
  ["retract", ["edge", 9, 9]],
  {
    called: ["double", 4],
    cond: [
      "cond",
      [["and", true, ["not", false], ["or", false, ["=", 1, 1]]], "yes"],
      ["else", "no"],
    ],
    matched: [
      "match",
      ["quote", { from: 1, to: 2 }],
      ["Step", ["lambda", ["step"], "a step"]],
      ["lambda", ["other"], "not a step"],
    ],
    evaluated: ["eval", ["quote", ["number/add", 1, 2]]],
    paths: ["find", "?to", ["path", 1, "?to"]],
    asked: ["query", ["in", "?n", ["array/make", 1, 2]]],
    explained: ["why", ["edge", 1, 2]],
    saved: ["array/length", ["snapshot"]],
  },
];

const EXPECTED = {
  called: 8,
  cond: "yes",
  matched: "a step",
  evaluated: 3,
  paths: [2, 3],
  asked: [{ n: 1 }, { n: 2 }],
  explained: { fact: ["edge", 1, 2], given: true },
  saved: 8,
};

describe("the order modules load in", () => {
  it.effect.prop(
    "does not change what a program evaluates to",
    { first: Arbitrary.array(index, { minLength: 1, maxLength: 3 }) },
    ({ first }) =>
      Effect.gen(function* () {
        // A fresh copy of every module, loaded in the order drawn.
        vi.resetModules();
        for (const at of first) {
          const [, load] = MODULES[at] as (typeof MODULES)[number];
          yield* Effect.promise(() => load());
        }
        const { run } = yield* Effect.promise(
          () => import("@/evaluation/evaluate")
        );
        const { stdlib } = yield* Effect.promise(() => import("@/modules"));
        expect(yield* run(PROGRAM, stdlib)).toEqual(EXPECTED);
      }),
    { timeout: 120_000, arbitrary: { runs: 150 } }
  );
});

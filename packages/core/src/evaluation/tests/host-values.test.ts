/**
 * A host function may give any value, also one JSON cannot hold, such as
 * undefined, a bigint, a Map, a Date, or an instance of a class. Plain code
 * carries such a value as it is, and every place that needs data, a fact, a
 * derived row, an answer, a condition, or a library function's argument,
 * fails with Lion's own error, which shows the value as its kind in angle
 * brackets, as it shows a function as `<function>`.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Exit, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";

class Point {
  readonly x: number;
  readonly y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}

/** A regular expression, copied fresh for each run. */
const PATTERN = /a+/u;

/** A value JSON cannot hold, made fresh, with what a message calls it. */
interface Opaque {
  readonly kind: string;
  readonly make: () => unknown;
}

const OPAQUE: readonly Opaque[] = [
  { kind: "undefined", make: () => undefined },
  { kind: "bigint", make: () => 10n ** 30n },
  { kind: "symbol", make: () => Symbol("handle") },
  { kind: "NaN", make: () => Number.NaN },
  { kind: "Infinity", make: () => Number.POSITIVE_INFINITY },
  { kind: "-Infinity", make: () => Number.NEGATIVE_INFINITY },
  { kind: "Map", make: () => new Map([["a", 1]]) },
  { kind: "Set", make: () => new Set([1]) },
  { kind: "Date", make: () => new Date(0) },
  { kind: "RegExp", make: () => new RegExp(PATTERN.source, PATTERN.flags) },
  { kind: "Uint8Array", make: () => new Uint8Array([1, 2]) },
  { kind: "Point", make: () => new Point(1, 2) },
];

const opaque = Arbitrary.map(
  Arbitrary.schema(Schema.Literals(OPAQUE.map((each) => each.kind))),
  (kind) => OPAQUE.find((each) => each.kind === kind) as Opaque
);

/** Where plain code carries a value, each giving back what it was given. */
const CARRIED: Record<string, (give: unknown) => unknown> = {
  "a call's result": (give) => give,
  "a name": (give) => ["begin", ["define", "v", give], "v"],
  "a lambda's argument": (give) => [["lambda", ["v"], "v"], give],
  "a list's item": (give) => ["array/head", ["array/make", give, 1]],
  "a record's value": (give) => ["object/get", { k: give }, "k"],
  "a function's result": (give) => [
    ["func/partial", ["lambda", ["v", "w"], "v"], give],
    2,
  ],
};

/** Where a value must be data, or a truth, or of a schema. */
const NEEDS_DATA: Record<string, (give: unknown) => unknown> = {
  "a fact": (give) => [
    "begin",
    ["relation", "r", ["x"]],
    ["fact", ["r", give]],
    true,
  ],
  "a derived row": (give) => [
    "begin",
    ["relation", "n", ["x"]],
    ["relation", "g", ["x"]],
    ["fact", ["n", 1]],
    ["rule", ["g", "?x"], ["n", "?y"], ["=", "?x", give]],
    ["query", ["g", "?x"]],
  ],
  "an answer of find": (give) => ["find", "?x", ["=", "?x", give]],
  "a condition": (give) => ["cond", [give, 1], ["else", 2]],
  "a library function's argument": (give) => ["string/length", give],
};

const places = (table: Record<string, unknown>) =>
  Arbitrary.schema(Schema.Literals(Object.keys(table)));

const hostOf = (value: unknown) => ({ ...stdlib, "host/give": () => value });

describe("a value a host function gives that JSON cannot hold", () => {
  it.effect.prop(
    "plain code carries it as it is, and it equals itself",
    { kind: opaque, place: places(CARRIED) },
    ({ kind, place }) =>
      Effect.gen(function* () {
        const value = kind.make();
        const host = hostOf(value);
        const program = CARRIED[place]?.(["host/give"]);
        expect(Object.is(yield* run(program, host), value)).toBe(true);
        expect(
          yield* run(
            ["begin", ["define", "v", ["host/give"]], ["=", "v", "v"]],
            host
          )
        ).toBe(true);
      })
  );

  it.effect.prop(
    "two of them are equal only when they are the same value",
    { kind: opaque },
    ({ kind }) =>
      Effect.gen(function* () {
        const left = kind.make();
        const right = kind.make();
        const host = {
          ...stdlib,
          "host/left": () => left,
          "host/right": () => right,
        };
        expect(yield* run(["=", ["host/left"], ["host/right"]], host)).toBe(
          Object.is(left, right)
        );
      })
  );

  it.effect.prop(
    "where data is needed, it fails with Lion's error, naming the value's kind",
    { kind: opaque, place: places(NEEDS_DATA) },
    ({ kind, place }) =>
      Effect.gen(function* () {
        const program = NEEDS_DATA[place]?.(["host/give"]);
        const exit = yield* Effect.exit(run(program, hostOf(kind.make())));
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          const error = yield* Effect.flip(Effect.suspend(() => exit));
          expect(error).not.toBeInstanceOf(TypeError);
          expect((error as { _tag?: unknown })._tag).toBeTypeOf("string");
          expect(String((error as Error).message)).toContain(`<${kind.kind}>`);
        }
      }),
    // Twelve kinds in five places: enough runs to meet each pair.
    { arbitrary: { runs: 400 } }
  );
});

/**
 * Every function waits when it is called with a logic variable: standard
 * functions, host functions as they are, and functions made while a program
 * runs. A function marked with `logicFunction` takes the variable itself.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { logicFunction, Unification } from "@/logic/terms";
import { stdlib } from "@/modules";
import { element } from "./programs";

const small = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: -9, maximum: 9 }))
);

const inputs = Arbitrary.map(
  Arbitrary.array(small, { minLength: 1, maxLength: 5 }),
  (items) => [...new Set(items)].sort((a, b) => a - b)
);

const host = {
  ...stdlib,
  // A plain function, a native one, one that returns an Effect, and one
  // that builds a goal from the terms it is given.
  "host/double": (value: number) => value * 2,
  max: Math.max,
  "host/later": (value: number) => Effect.succeed(value + 0.5),
  "host/same": logicFunction((left: unknown, right: unknown) =>
    Effect.succeed(new Unification(left, right))
  ),
};

/** Calls on `?x`, each with what JavaScript says it is. */
const CALLS: Record<string, { call: unknown; model: (x: number) => unknown }> =
  {
    "a plain host function": {
      call: ["host/double", "?x"],
      model: (x) => x * 2,
    },
    "a native function": {
      call: ["max", "?x", 0],
      model: (x) => Math.max(x, 0),
    },
    "a host function that returns an Effect": {
      call: ["host/later", "?x"],
      model: (x) => x + 0.5,
    },
    "a method of the value": {
      call: ["object/call-method", "?x", "toFixed", 1],
      model: (x) => x.toFixed(1),
    },
    "a key of a record": {
      call: [
        "object/get",
        { double: ["host/double", "?x"], x: "?x" },
        "double",
      ],
      model: (x) => x * 2,
    },
    "a function made by func/partial": {
      call: [["func/partial", "number/subtract", 10], "?x"],
      model: (x) => 10 - x,
    },
    "a function made by func/partial from the variable": {
      call: [["func/partial", "number/subtract", "?x"], 10],
      model: (x) => x - 10,
    },
  };

const OPTIONS = { timeout: 120_000 };

const each = (values: readonly unknown[]) => ["in", "?x", ["quote", values]];

const message = (program: unknown) =>
  run(program, host).pipe(
    Effect.flip,
    Effect.map((error) => String((error as { message?: unknown }).message))
  );

describe("a function called with a logic variable", () => {
  it.effect.prop(
    "waits and then computes what it computes on the value",
    { inputs, name: element(Object.keys(CALLS)) },
    ({ inputs: values, name }) =>
      Effect.gen(function* () {
        const { call, model } = CALLS[name] as (typeof CALLS)[string];
        const rows = yield* run(
          ["query", ["and", each(values), ["=", "?y", call]], { order: "x" }],
          host
        );
        expect(rows).toEqual(values.map((x) => ({ x, y: model(x) })));
      }),
    OPTIONS
  );

  it.effect.prop(
    "takes the variable itself when it is marked as a logic function",
    { inputs, by: small },
    ({ by, inputs: values }) =>
      Effect.gen(function* () {
        const ask = (bind: string) =>
          run(
            [
              "query",
              ["and", each(values), [bind, "?y", ["number/add", "?x", by]]],
              { order: "x" },
            ],
            host
          );
        expect(yield* ask("host/same")).toEqual(yield* ask("="));
      }),
    OPTIONS
  );

  it.effect.prop(
    "must give a query and a rule JSON data",
    {
      inputs,
      bad: element([Number.NaN, undefined, () => 1, Symbol("s"), new Map()]),
    },
    ({ bad, inputs: values }) =>
      Effect.gen(function* () {
        const environment = { ...host, "host/bad": () => bad };
        const fail = (program: unknown) =>
          run(program, environment).pipe(
            Effect.flip,
            Effect.map((error) =>
              String((error as { message?: unknown }).message)
            )
          );
        const call = ["host/bad", "?x"];
        expect(
          yield* fail(["query", ["and", each(values), ["=", "?y", call]]])
        ).toContain("The query produced an answer that is not JSON data");
        expect(
          yield* fail([
            "begin",
            ["relation", "out", ["x", "y"]],
            ["rule", ["out", "?x", call], each(values)],
            ["query", ["out", "?x", "?y"]],
          ])
        ).toContain("produced a value that is not JSON data");
      }),
    OPTIONS
  );
});

const text = element(["a", "b", "lion"]);

/** Numbers with strings among them. */
const mixed = Arbitrary.array(
  Arbitrary.flatMap(
    element([0, 0, 1]),
    (kind): Arbitrary.Arbitrary<number | string> => (kind === 0 ? small : text)
  ),
  { minLength: 1, maxLength: 6 }
);

describe("a filter over values it cannot take", () => {
  it.effect.prop(
    "fails naming the call and its values, unless a guard written first holds it back",
    { values: mixed, limit: small },
    ({ limit, values }) =>
      Effect.gen(function* () {
        const distinct = [
          ...new Map(values.map((v) => [JSON.stringify(v), v])).values(),
        ];
        const isNumber = ["value/number?", "?x"];
        const above = ["number/greaterThan", "?x", limit];
        const ask = (...goals: unknown[]) => [
          "query",
          ["and", each(values), ...goals],
        ];
        const guarded = yield* run(ask(isNumber, above), host);
        expect(guarded).toEqual(
          distinct
            .filter((x) => typeof x === "number" && x > limit)
            .map((x) => ({ x }))
        );
        const firstText = distinct.find((x) => typeof x === "string");
        if (firstText === undefined) {
          expect(yield* run(ask(above, isNumber), host)).toEqual(guarded);
        } else {
          expect(yield* message(ask(above, isNumber))).toContain(
            `["number/greaterThan","${firstText}",${limit}] failed: Expected number`
          );
        }
      }),
    OPTIONS
  );
});

describe("func/partial", () => {
  it.effect.prop(
    "of a relation still builds goals",
    {
      pairs: Arbitrary.array(Arbitrary.all([small, small]), {
        minLength: 1,
        maxLength: 6,
      }),
      from: small,
    },
    ({ from, pairs }) =>
      Effect.gen(function* () {
        const [direct, partial] = (yield* run(
          [
            "begin",
            ["relation", "edge", ["from", "to"]],
            ["fact", ...pairs.map(([a, b]) => ["edge", a, b])],
            [
              "array/make",
              ["query", ["edge", from, "?to"], { order: "to" }],
              [
                "query",
                [["func/partial", "edge", from], "?to"],
                { order: "to" },
              ],
            ],
          ],
          host
        )) as [unknown, unknown];
        expect(partial).toEqual(direct);
      }),
    OPTIONS
  );
});

const numbers = Arbitrary.array(small, { maxLength: 6 });

/** The same functions, returning a value and returning an Effect. */
const PLAIN = {
  ...stdlib,
  double: (value: number) => value * 2,
  twice: (value: number) => [value, value],
  larger: Math.max,
  even: (value: number) => value % 2 === 0,
};

const EFFECTS = {
  ...stdlib,
  double: (value: number) => Effect.succeed(value * 2),
  twice: (value: number) => Effect.succeed([value, value]),
  larger: (a: number, b: number) => Effect.succeed(Math.max(a, b)),
  even: (value: number) => Effect.succeed(value % 2 === 0),
};

describe("a function that calls another", () => {
  it.effect.prop(
    "takes a host function as it is, whether it returns a value or an Effect",
    { list: numbers, value: small },
    ({ list, value }) =>
      Effect.gen(function* () {
        const program = {
          map: ["array/map", ["quote", list], "double"],
          flatMap: ["array/flat-map", ["quote", list], "twice"],
          reduce: ["array/reduce", ["quote", list], -100, "larger"],
          match: ["match", value, ["even", "double"], "value/identity"],
        };
        const expected = {
          map: list.map((item) => item * 2),
          flatMap: list.flatMap((item) => [item, item]),
          reduce: Math.max(-100, ...list),
          match: value % 2 === 0 ? value * 2 : value,
        };
        expect(yield* run(program, PLAIN)).toEqual(expected);
        expect(yield* run(program, EFFECTS)).toEqual(expected);
      }),
    OPTIONS
  );

  it.effect.prop(
    "takes the last part of match as the fallback, whatever its shape",
    { value: small },
    ({ value }) =>
      Effect.gen(function* () {
        // A two-item fallback looks like a pattern, but it comes last.
        const result = yield* run(
          [
            "match",
            value,
            ["value/string?", "value/identity"],
            ["func/partial", "double"],
          ],
          PLAIN
        );
        expect(result).toBe(value * 2);
      }),
    OPTIONS
  );
});

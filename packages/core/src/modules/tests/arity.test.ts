/**
 * Every function of the standard library takes a set number of arguments,
 * and a call with any other number fails and says how many the function
 * takes. No argument is dropped. The table below is the model: how many
 * arguments each function takes, written down apart from the library.
 *
 * `number/add`, `number/multiply`, `number/min`, `number/max`,
 * `string/concat`, and `array/concat` combine one or more arguments, as the
 * same function of two would, applied from left to right.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { afterAll, beforeAll, vi } from "vitest";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";

const OPTIONS = { timeout: 120_000, arbitrary: { runs: 300 } };

const ANY = Number.POSITIVE_INFINITY;

/** The fewest and the most arguments each function takes. */
const TAKES: Record<string, readonly [least: number, most: number]> = {
  "aggregate/collect": [1, 1],
  "aggregate/count": [1, 1],
  "aggregate/countUnique": [1, 1],
  "aggregate/max": [1, 1],
  "aggregate/mean": [1, 1],
  "aggregate/min": [1, 1],
  "aggregate/shortest": [1, 1],
  "aggregate/sum": [1, 1],
  "aggregate/union": [1, 1],
  "aggregate/unique": [1, 1],
  "array/concat": [1, ANY],
  "array/flat-map": [2, 2],
  "array/head": [1, 1],
  "array/includes?": [2, 2],
  "array/length": [1, 1],
  "array/make": [0, ANY],
  "array/map": [2, 2],
  "array/range": [2, 2],
  "array/reduce": [3, 3],
  "array/tail": [1, 1],
  "boolean/and": [2, 2],
  "boolean/equals?": [2, 2],
  "boolean/nand": [2, 2],
  "boolean/nor": [2, 2],
  "boolean/not": [1, 1],
  "boolean/or": [2, 2],
  "boolean/xor": [2, 2],
  "console/log": [1, 1],
  "console/log-json": [1, 1],
  "func/apply": [2, ANY],
  "func/bind": [2, ANY],
  "func/callback": [1, 1],
  "func/partial": [1, ANY],
  "graph/components": [3, 3],
  "graph/pageRank": [3, 3],
  "graph/shortestPath": [5, 5],
  "graph/stronglyConnected": [3, 3],
  "graph/topologicalOrder": [3, 3],
  "number/absolute": [1, 1],
  "number/add": [1, ANY],
  "number/ceiling": [1, 1],
  "number/divide": [2, 2],
  "number/equals?": [2, 2],
  "number/floor": [1, 1],
  "number/greaterThan": [2, 2],
  "number/greaterThanOrEqualTo": [2, 2],
  "number/lessThan": [2, 2],
  "number/lessThanOrEqualTo": [2, 2],
  "number/max": [1, ANY],
  "number/min": [1, ANY],
  "number/multiply": [1, ANY],
  "number/power": [2, 2],
  "number/remainder": [2, 2],
  "number/round": [1, 1],
  "number/subtract": [2, 2],
  "number/toString": [1, 2],
  "object/call-method": [2, ANY],
  "object/call-method-path": [2, ANY],
  "object/get": [2, 2],
  "object/get-method": [2, 2],
  "object/get-method-path": [2, 2],
  "object/get-path": [2, 2],
  "object/json-stringify": [1, 3],
  "object/keys": [1, 1],
  "object/new": [1, ANY],
  "object/values": [1, 1],
  "schema/allOf": [0, ANY],
  "schema/anyOf": [0, ANY],
  "schema/arrayOf": [1, 1],
  "schema/assert": [2, 2],
  "schema/fits?": [2, 2],
  "schema/open": [1, 1],
  "schema/optional": [1, 1],
  "schema/problems": [2, 2],
  "schema/recordOf": [1, 1],
  "string/concat": [1, ANY],
  "string/endsWith": [2, 2],
  "string/equals?": [2, 2],
  "string/includes": [2, 2],
  "string/indexOf": [2, 2],
  "string/join": [2, 3],
  "string/length": [1, 1],
  "string/padEnd": [3, 3],
  "string/padStart": [3, 3],
  "string/split": [2, 2],
  "string/startsWith": [2, 2],
  "value/any?": [1, 1],
  "value/array?": [1, 1],
  "value/boolean?": [1, 1],
  "value/function?": [1, 1],
  "value/identity": [1, 1],
  "value/integer?": [1, 1],
  "value/null?": [1, 1],
  "value/number?": [1, 1],
  "value/object?": [1, 1],
  "value/string?": [1, 1],
  "value/symbol?": [1, 1],
  "value/undefined?": [1, 1],
};

/** Every function of the library, as the library has it. */
const FUNCTIONS = Object.keys(stdlib).filter(
  (key) => typeof (stdlib as Record<string, unknown>)[key] === "function"
);

const integer = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

const small = integer(-9, 9);

const MOST_ARGUMENTS = 7;

/** The arguments of a call: none, a few, or more than any function takes. */
const someArguments = Arbitrary.array(small, { maxLength: MOST_ARGUMENTS });

const plural = (count: number) => `${count} argument${count === 1 ? "" : "s"}`;

/** How a message says what a function takes. */
const describeTakes = ([least, most]: readonly [number, number]) => {
  if (least === most) {
    return plural(least);
  }
  return most === ANY
    ? `${least} or more arguments`
    : `${least} to ${plural(most)}`;
};

/** Text with the characters a pattern reads as its own taken as they are. */
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/**
 * What a call with the wrong number of arguments fails with. Some functions
 * also say, in brackets, what their arguments are.
 */
const refusal = (fn: string, got: number) =>
  new RegExp(
    `${literal(`"${fn}" takes ${describeTakes(TAKES[fn] as [number, number])}`)}( \\([^)]*\\))? but got ${got}\\.`
  );

const SAYS_HOW_MANY = /takes .*arguments? .*but got \d+\./;

/** The message a program fails with, also when it throws; null when it runs. */
const failure = (program: unknown) =>
  run(program, stdlib).pipe(
    Effect.as<string | null>(null),
    Effect.catchCause((cause) => Effect.succeed(String(cause)))
  );

/**
 * The places a call can stand: plain code, and where it waits for the logic
 * variable that is its first argument, in a query, a rule, and a find.
 */
const PLACES: Record<
  string,
  (fn: string, args: readonly unknown[]) => unknown
> = {
  "plain code": (fn, args) => [fn, ...args],
  query: (fn, [first, ...rest]) => [
    "query",
    ["and", ["=", "?x", first], ["=", "?r", [fn, "?x", ...rest]]],
  ],
  rule: (fn, [first, ...rest]) => [
    "begin",
    ["relation", "given", ["x"]],
    ["relation", "result", ["x", "r"]],
    ["fact", ["given", first]],
    [
      "rule",
      ["result", "?x", "?r"],
      ["given", "?x"],
      ["=", "?r", [fn, "?x", ...rest]],
    ],
    ["query", ["result", "?x", "?r"]],
  ],
  find: (fn, [first, ...rest]) => [
    "find",
    "?r",
    ["and", ["=", "?x", first], ["=", "?r", [fn, "?x", ...rest]]],
  ],
};

describe("how many arguments a library function takes", () => {
  // `console/log` writes what it is given; the property calls it often.
  beforeAll(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterAll(() => {
    vi.restoreAllMocks();
  });

  it.effect.prop(
    "a call with any other number fails and says how many, wherever it stands",
    { args: someArguments },
    ({ args }) =>
      Effect.gen(function* () {
        // The table says what every function takes, and nothing else.
        expect(Object.keys(TAKES).sort()).toEqual([...FUNCTIONS].sort());
        for (const fn of FUNCTIONS) {
          const [least, most] = TAKES[fn] as [number, number];
          const fits = args.length >= least && args.length <= most;
          for (const [place, write] of Object.entries(PLACES)) {
            // Only a call with an argument can wait for a variable in it.
            if (place !== "plain code" && args.length === 0) {
              continue;
            }
            const message = yield* failure(write(fn, args));
            const where = `${fn} in ${place}`;
            if (fits) {
              expect(message ?? "", where).not.toMatch(SAYS_HOW_MANY);
            } else {
              expect(message ?? "it ran", where).toMatch(
                refusal(fn, args.length)
              );
            }
          }
        }
      }),
    { timeout: 120_000 }
  );
});

/** Numbers small enough that sums and products of a few stay exact. */
const numbers = Arbitrary.array(small, { minLength: 1, maxLength: 5 });

const words = Arbitrary.array(
  Arbitrary.schema(Schema.String.check(Schema.isPattern(/^[a-c ]{0,3}$/))),
  { minLength: 1, maxLength: 5 }
);

const lists = Arbitrary.array(Arbitrary.array(small, { maxLength: 3 }), {
  minLength: 1,
  maxLength: 5,
});

const quote = (value: unknown) => ["quote", value];

/** The call of a function of two, applied to the arguments left to right. */
const nested = (fn: string, [first, ...rest]: readonly unknown[]) =>
  rest.reduce((made, next) => [fn, made, next], first);

/** What each function that combines its arguments gives for a list of them. */
const COMBINES = {
  "number/add": (values: number[]) => values.reduce((a, b) => a + b),
  "number/multiply": (values: number[]) => values.reduce((a, b) => a * b),
  "number/min": (values: number[]) => Math.min(...values),
  "number/max": (values: number[]) => Math.max(...values),
};

describe("functions that combine their arguments", () => {
  it.effect.prop(
    "combine any number of numbers, as the function of two does one by one",
    { values: numbers },
    ({ values }) =>
      Effect.gen(function* () {
        for (const [fn, model] of Object.entries(COMBINES)) {
          const expected = model(values);
          expect(yield* run([fn, ...values], stdlib), fn).toBe(expected);
          expect(yield* run(nested(fn, values), stdlib), fn).toBe(expected);
          // The same call waits for a logic variable, and gives the same.
          const [first, ...rest] = values;
          expect(
            yield* run(
              [
                "find",
                "?r",
                ["and", ["=", "?x", first], ["=", "?r", [fn, "?x", ...rest]]],
              ],
              stdlib
            ),
            fn
          ).toEqual([expected]);
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "join any number of strings, and of lists",
    { texts: words, items: lists },
    ({ texts, items }) =>
      Effect.gen(function* () {
        const text = texts.map(quote);
        const list = items.map(quote);
        expect(yield* run(["string/concat", ...text], stdlib)).toBe(
          texts.join("")
        );
        expect(yield* run(nested("string/concat", text), stdlib)).toBe(
          texts.join("")
        );
        expect(yield* run(["array/concat", ...list], stdlib)).toEqual(
          items.flat()
        );
        expect(yield* run(nested("array/concat", list), stdlib)).toEqual(
          items.flat()
        );
        expect(
          yield* run(
            [
              "find",
              "?r",
              [
                "and",
                ["=", "?x", text[0]],
                ["=", "?r", ["string/concat", "?x", ...text.slice(1)]],
              ],
            ],
            stdlib
          )
        ).toEqual([texts.join("")]);
      }),
    OPTIONS
  );
});

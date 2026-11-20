/**
 * A variable that a schema types and no goal binds is solved for. The same
 * goal is asked twice: with the variables whole numbers the solver works out,
 * and with each variable listed from a box of whole numbers, as a schema
 * that lists its values binds it. Inside the box the two agree, wherever
 * the goal stands, and outside it the solver says what plain code says.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { LogicDatabase } from "@/logic/database";
import { loadDatabase, saveDatabase } from "@/logic/snapshot";
import {
  type Cases,
  fromValue,
  MOST_WAYS,
  product,
  TRUE,
} from "@/logic/symbols";
import { stdlib } from "@/modules";
import { attempt, element, type Outcome, oneOf } from "./programs";
import { keyOf } from "./shapes";

const OPTIONS = { timeout: 120_000, arbitrary: { runs: 250 } };

/** The box the listed variables come from. */
const BOX = 3;

const int = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

type Code = unknown;

const VARIABLES = ["?x", "?y"] as const;

/** A number, as Lion code over the variables: sums, products by a number, choices. */
const number = (depth: number): Arbitrary.Arbitrary<Code> => {
  const leaf = oneOf<Code>(int(-4, 4), element<Code>([...VARIABLES]));
  if (depth === 0) {
    return leaf;
  }
  const inner = number(depth - 1);
  return oneOf<Code>(
    leaf,
    leaf,
    Arbitrary.map(Arbitrary.all([inner, inner]), ([a, b]) => [
      "number/add",
      a,
      b,
    ]),
    Arbitrary.map(Arbitrary.all([inner, inner]), ([a, b]) => [
      "number/subtract",
      a,
      b,
    ]),
    Arbitrary.map(Arbitrary.all([int(-3, 3), inner]), ([k, a]) => [
      "number/multiply",
      k,
      a,
    ]),
    // A product of two unknowns, which the solver cannot decide, so the
    // goal waits for the values it lists.
    Arbitrary.map(Arbitrary.all([inner, inner]), ([a, b]) => [
      "number/multiply",
      a,
      b,
    ]),
    Arbitrary.map(inner, (a) => ["number/absolute", a]),
    Arbitrary.map(Arbitrary.all([inner, inner]), ([a, b]) => [
      "number/min",
      a,
      b,
    ]),
    Arbitrary.map(Arbitrary.all([inner, inner]), ([a, b]) => [
      "number/max",
      a,
      b,
    ]),
    Arbitrary.map(
      Arbitrary.all([test(depth - 1), inner, inner]),
      ([t, a, b]) => ["cond", [t, a], ["else", b]]
    ),
    // A lambda run on the value, by its body.
    Arbitrary.map(Arbitrary.all([inner, int(-2, 2)]), ([a, k]) => [
      ["lambda", ["v"], ["number/add", "v", k]],
      a,
    ])
  );
};

/** A truth about numbers, as Lion code over the variables. */
function test(depth: number): Arbitrary.Arbitrary<Code> {
  const inner = number(depth);
  const compared = Arbitrary.map(
    Arbitrary.all([
      element([
        "number/lessThan",
        "number/lessThanOrEqualTo",
        "number/greaterThan",
        "number/equals?",
      ]),
      inner,
      inner,
    ]),
    ([op, a, b]): Code => [op, a, b]
  );
  if (depth === 0) {
    return compared;
  }
  const smaller = test(depth - 1);
  return oneOf<Code>(
    compared,
    compared,
    // A schema that holds a number the solver works out, inside an
    // expression, where it is not a pattern that binds.
    Arbitrary.map(
      Arbitrary.all([int(-3, 3), element<Code>([...VARIABLES]), int(-3, 3)]),
      ([k, v, j]) => [
        "boolean/or",
        ["schema/fits?", k, ["schema/anyOf", v, j]],
        false,
      ]
    ),
    // A schema made from a number the solver works out, which waits for it.
    // The number is computed, so the schema is not a pattern that binds.
    Arbitrary.map(
      Arbitrary.all([int(-3, 3), inner, int(-3, 3)]),
      ([k, a, j]) => [
        "schema/fits?",
        k,
        ["schema/anyOf", ["number/add", a, 0], j],
      ]
    ),
    Arbitrary.map(smaller, (t) => ["boolean/not", t]),
    Arbitrary.map(Arbitrary.all([smaller, smaller]), ([a, b]) => [
      "boolean/and",
      a,
      b,
    ]),
    Arbitrary.map(Arbitrary.all([smaller, smaller]), ([a, b]) => [
      "boolean/or",
      a,
      b,
    ])
  );
}

/** Filters, each a goal of the body. */
const filters = Arbitrary.array(test(1), { minLength: 1, maxLength: 3 });

const range = Array.from({ length: 2 * BOX + 1 }, (_, at) => at - BOX);

/** The goals that keep a variable in the box. */
const inBox = (name: string): Code[] => [
  ["number/greaterThanOrEqualTo", name, -BOX],
  ["number/lessThanOrEqualTo", name, BOX],
];

/** A variable the solver works out: a whole number, kept in the box. */
const solved = (name: string): Code[] => [
  ["schema/fits?", name, "value/integer?"],
  ...inBox(name),
];

/** A variable listed from the box, as a schema that lists its values binds it. */
const listed = (name: string): Code[] => [
  ["schema/fits?", name, ["schema/anyOf", ...range]],
];

const evaluate = (form: Code, database = new LogicDatabase()) =>
  attempt(form, database);

const resultOf = (outcome: Outcome) => {
  expect(outcome).toMatchObject({ ok: true });
  return outcome.ok ? outcome.value : undefined;
};

const keys = (values: unknown) =>
  [...new Set((values as unknown[]).map(keyOf))].sort();

const PAIR = ["array/make", "?x", "?y"];

describe("solving for a variable a schema types", () => {
  it.effect.prop(
    "gives in a box what listing the box gives",
    { tests: filters },
    ({ tests }) =>
      Effect.gen(function* () {
        const bySolver = yield* evaluate([
          "find",
          PAIR,
          ["and", ...solved("?x"), ...solved("?y"), ...tests],
        ]);
        const byListing = yield* evaluate([
          "find",
          PAIR,
          ["and", ...listed("?x"), ...listed("?y"), ...tests],
        ]);
        expect(keys(resultOf(bySolver))).toEqual(keys(resultOf(byListing)));
      }),
    OPTIONS
  );

  it.effect.prop(
    "says whether a value exists, and that none does, as listing the box says",
    { tests: filters },
    ({ tests }) =>
      Effect.gen(function* () {
        const listedAnswers = resultOf(
          yield* evaluate([
            "find",
            PAIR,
            ["and", ...listed("?x"), ...listed("?y"), ...tests],
          ])
        ) as unknown[];
        const body = ["and", ...solved("?x"), ...solved("?y"), ...tests];
        const exists = resultOf(
          yield* evaluate([
            "query",
            ["and", ["=", "?asked", true], ["exists", ["?x", "?y"], body]],
          ])
        ) as unknown[];
        const none = resultOf(
          yield* evaluate([
            "query",
            [
              "and",
              ["=", "?asked", true],
              ["not", ["exists", ["?x", "?y"], body]],
            ],
          ])
        ) as unknown[];
        expect(exists.length).toBe(listedAnswers.length > 0 ? 1 : 0);
        expect(none.length).toBe(listedAnswers.length > 0 ? 0 : 1);
      }),
    OPTIONS
  );

  it.effect.prop(
    "gives each answer values that plain code says meet every filter",
    { tests: filters },
    ({ tests }) =>
      Effect.gen(function* () {
        const answers = resultOf(
          yield* evaluate([
            "find",
            PAIR,
            ["and", ...solved("?x"), ...solved("?y"), ...tests],
          ])
        ) as [number, number][];
        for (const [x, y] of answers) {
          for (const t of tests) {
            const plain = yield* evaluate([["lambda", ["?x", "?y"], t], x, y]);
            expect(plain, JSON.stringify([t, x, y])).toEqual({
              ok: true,
              value: true,
            });
          }
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "gives a rule's rows from the solver, as a query does, goal-directed, and after a snapshot",
    { tests: filters, pick: int(0, 50) },
    ({ pick, tests }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        const setup = yield* evaluate(
          [
            "begin",
            ["relation", "found", ["x", "y"]],
            [
              "rule",
              ["found", "?x", "?y"],
              ...solved("?x"),
              ...solved("?y"),
              ...tests,
            ],
            true,
          ],
          database
        );
        expect(setup).toEqual({ ok: true, value: true });
        const expected = resultOf(
          yield* evaluate([
            "find",
            PAIR,
            ["and", ...listed("?x"), ...listed("?y"), ...tests],
          ])
        ) as [number, number][];
        const rows = resultOf(
          yield* evaluate(["find", PAIR, ["found", "?x", "?y"]], database)
        );
        expect(keys(rows)).toEqual(keys(expected));
        const one = expected[pick % Math.max(expected.length, 1)];
        if (one !== undefined) {
          const asked = resultOf(
            yield* evaluate(["query", ["found", one[0], "?y"]], database)
          ) as { y: number }[];
          expect(asked.map(({ y }) => y).sort()).toEqual(
            expected
              .filter(([x]) => x === one[0])
              .map(([, y]) => y)
              .sort()
          );
        }
        const loaded = yield* loadDatabase(
          yield* saveDatabase(database),
          stdlib
        );
        const again = resultOf(
          yield* attempt(["find", PAIR, ["found", "?x", "?y"]], loaded)
        );
        expect(keys(again)).toEqual(keys(expected));
      }),
    OPTIONS
  );

  it.effect.prop(
    "explains a row the solver gave with an example that plain code says meets every filter",
    { tests: filters },
    ({ tests }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        const asked = resultOf(
          yield* evaluate(
            [
              "begin",
              ["relation", "some_pair", ["ok"]],
              [
                "rule",
                ["some_pair", true],
                [
                  "exists",
                  ["?x", "?y"],
                  ["and", ...solved("?x"), ...solved("?y"), ...tests],
                ],
              ],
              ["find", "?ok", ["some_pair", "?ok"]],
            ],
            database
          )
        ) as boolean[];
        if (asked.length === 0) {
          return;
        }
        const why = resultOf(
          yield* evaluate(["why", ["some_pair", true]], database)
        ) as { because: { example?: Record<string, number> }[] };
        const example = why.because.find(
          (p) => p.example !== undefined
        )?.example;
        expect(example).toBeDefined();
        const { "?x": x, "?y": y } = example as Record<string, number>;
        for (const t of [...inBox("?x"), ...inBox("?y"), ...tests]) {
          expect(
            yield* evaluate([["lambda", ["?x", "?y"], t], x, y]),
            JSON.stringify([t, example])
          ).toEqual({ ok: true, value: true });
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "solves for the numbers of a record a schema shapes",
    { tests: filters },
    ({ tests }) =>
      Effect.gen(function* () {
        // The same filters, about the fields of a record instead.
        const fieldOf: Record<string, unknown> = {
          "?x": ["object/get", "?r", "a"],
          "?y": ["object/get", "?r", "b"],
        };
        const over = (code: unknown): unknown => {
          if (Array.isArray(code)) {
            return code.map(over);
          }
          return typeof code === "string" && code in fieldOf
            ? fieldOf[code]
            : code;
        };
        const fields = [
          ["number/greaterThanOrEqualTo", ["object/get", "?r", "a"], -BOX],
          ["number/lessThanOrEqualTo", ["object/get", "?r", "a"], BOX],
          ["number/greaterThanOrEqualTo", ["object/get", "?r", "b"], -BOX],
          ["number/lessThanOrEqualTo", ["object/get", "?r", "b"], BOX],
        ];
        const record = yield* evaluate([
          "find",
          "?r",
          [
            "and",
            [
              "schema/fits?",
              "?r",
              { a: "value/integer?", b: "value/integer?" },
            ],
            ...fields,
            ...tests.map(over),
          ],
        ]);
        const pairs = resultOf(
          yield* evaluate([
            "find",
            PAIR,
            ["and", ...listed("?x"), ...listed("?y"), ...tests],
          ])
        ) as [number, number][];
        expect(keys(resultOf(record))).toEqual(
          keys(pairs.map(([a, b]) => ({ a, b })))
        );
      }),
    OPTIONS
  );

  it.effect.prop(
    "counts every goal about a variable '=' defines, not only the first",
    { a: int(-3, 3), c: int(-6, 6), tests: filters },
    ({ a, c, tests }) =>
      Effect.gen(function* () {
        const goals: Code[] = [
          ["=", "?v", ["number/add", ["number/multiply", a, "?x"], "?y"]],
          ["=", "?v", c],
          ...tests,
        ];
        const bySolver = yield* evaluate([
          "find",
          PAIR,
          ["and", ...solved("?x"), ...solved("?y"), ...goals],
        ]);
        const byListing = yield* evaluate([
          "find",
          PAIR,
          ["and", ...listed("?x"), ...listed("?y"), ...goals],
        ]);
        expect(keys(resultOf(bySolver))).toEqual(keys(resultOf(byListing)));
      }),
    OPTIONS
  );

  it.effect.prop(
    "lets what it cannot decide wait for the values it lists, and fails, saying why, when they are infinitely many",
    { boxed: element([true, false]), k: int(1, 3), which: int(0, 2) },
    ({ boxed, k, which }) =>
      Effect.gen(function* () {
        const goal = [
          // A product of two unknowns.
          ["number/greaterThan", ["number/multiply", "?x", "?y"], k],
          // A string function on a number no goal binds.
          ["string/equals?", ["number/toString", "?x"], "1"],
          // Bounded on one side only.
          ["number/greaterThan", "?x", k],
        ][which] as Code;
        if (boxed) {
          const bySolver = yield* evaluate([
            "find",
            PAIR,
            ["and", ...solved("?x"), ...solved("?y"), goal],
          ]);
          const byListing = yield* evaluate([
            "find",
            PAIR,
            ["and", ...listed("?x"), ...listed("?y"), goal],
          ]);
          expect(keys(resultOf(bySolver))).toEqual(keys(resultOf(byListing)));
          return;
        }
        const body = [
          "and",
          ["schema/fits?", "?x", "value/integer?"],
          ["schema/fits?", "?y", "value/integer?"],
          ...inBox("?y"),
          goal,
        ];
        // As answers, infinitely many values cannot each be one.
        expect(yield* evaluate(["find", PAIR, body])).toMatchObject({
          ok: false,
          message: expect.stringContaining("so they cannot each be an answer"),
        });
        // Asked only whether one exists, the solver decides what it can,
        // and a goal it cannot decide still needs every value.
        const exists = yield* evaluate([
          "query",
          ["exists", ["?x", "?y"], body],
        ]);
        expect(exists).toMatchObject(
          which === 2
            ? { ok: true, value: [{}] }
            : {
                ok: false,
                message: expect.stringContaining(
                  "waits for its value. The solver cannot reason about"
                ),
              }
        );
      }),
    { timeout: 120_000, arbitrary: { runs: 60 } }
  );
});

/** A key that reads an item of a list. */
const INDEX = /^\d+$/;

const TOO_MANY = /more than/;

describe("the cases of symbolic values", () => {
  it.prop(
    "stops choosing one case of each as soon as there are more ways than it may take, before it builds them",
    { sizes: Arbitrary.array(int(1, 300), { minLength: 1, maxLength: 4 }) },
    ({ sizes }) => {
      let read = 0;
      // Cases that count how many of them are read.
      const counted = sizes.map((size): Cases => {
        const cases = Array.from({ length: size }, (_, at) => ({
          sym: fromValue(at),
          when: TRUE,
        }));
        return new Proxy(cases, {
          get: (target, key, receiver) => {
            if (typeof key === "string" && INDEX.test(key)) {
              read += 1;
            }
            return Reflect.get(target, key, receiver);
          },
        });
      });
      const ways = sizes.reduce((all, size) => all * size, 1);
      if (ways <= MOST_WAYS) {
        expect(product(counted)).toHaveLength(ways);
        return;
      }
      expect(() => product(counted)).toThrow(TOO_MANY);
      // It read at most one case past the most it may take, in each round.
      expect(read).toBeLessThanOrEqual(sizes.length * (MOST_WAYS + 1));
    },
    OPTIONS
  );
});

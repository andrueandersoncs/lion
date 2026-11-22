/**
 * A lambda written with one name in place of its list of parameters, as
 * `(lambda args body)` is in Scheme, binds the name to the list of every
 * argument: in plain code, through the functions that call a function, in a
 * call that waits for a logic variable, in a rule a snapshot saves, and in
 * the solver's step.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { LogicDatabase } from "@/logic/database";
import { loadDatabase } from "@/logic/snapshot";
import { stdlib } from "@/modules";

const small = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: -9, maximum: 9 }))
);
const items = Arbitrary.array(small, { maxLength: 4 });

const quote = (value: unknown) => ["quote", value];

/** A lambda that gives the list of its arguments, and one that sums them. */
const ALL = ["lambda", "args", "args"];
const SUM = ["lambda", "xs", ["array/reduce", "xs", 0, "number/add"]];

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

/** An argument: a number, a goal on facts, its negation, or a find. */
const argument = Arbitrary.flatMap(
  Arbitrary.schema(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 }))
  ),
  (kind) =>
    [
      small,
      Arbitrary.map(small, (n) => ["small", n]),
      Arbitrary.map(small, (n) => ["not", ["small", n]]),
      Arbitrary.map(small, (n) => [
        "find",
        "?y",
        ["and", ["small", "?y"], ["number/lessThan", "?y", n]],
      ]),
    ][kind] as Arbitrary.Arbitrary<unknown>
);

/** What a body does with the list of the arguments. */
const BODIES: readonly ((list: unknown) => unknown)[] = [
  (list) => list,
  (list) => ["array/length", list],
  (list) => ["array/map", list, ["lambda", ["v"], ["value/boolean?", "v"]]],
  (list) => ["array/reduce", list, 0, "number/add"],
];

describe("a lambda with one name for its parameters", () => {
  it.effect.prop(
    "gets every argument as a list, called directly, through func/apply, and through func/partial",
    { given: items, more: items },
    ({ given, more }) =>
      Effect.gen(function* () {
        expect(yield* run([ALL, ...given], stdlib)).toEqual(given);
        expect(yield* run([SUM, ...given], stdlib)).toBe(sum(given));
        expect(
          yield* run(["func/apply", ALL, null, ...given, quote(more)], stdlib)
        ).toEqual([...given, ...more]);
        expect(
          yield* run([["func/partial", ALL, ...given], ...more], stdlib)
        ).toEqual([...given, ...more]);
        // A name the body defines is its own, as in any lambda.
        expect(
          yield* run(
            [
              "begin",
              ["define", "n", 100],
              [
                [
                  "lambda",
                  "xs",
                  ["begin", ["define", "n", ["array/length", "xs"]], "n"],
                ],
                ...given,
              ],
            ],
            stdlib
          )
        ).toBe(given.length);
      })
  );

  it.effect.prop(
    "waits in a find for the values a goal binds, and gives what plain code gives with them in place",
    { xs: items, rest: items },
    ({ xs, rest }) =>
      Effect.gen(function* () {
        const found = yield* run(
          ["find", [SUM, "?x", ...rest], ["in", "?x", quote(xs)]],
          stdlib
        );
        const plain: number[] = [];
        for (const x of [...new Set(xs)]) {
          plain.push((yield* run([SUM, x, ...rest], stdlib)) as number);
        }
        expect(found).toEqual(plain.sort((a, b) => a - b));
      })
  );

  it.effect.prop(
    "handed to a call that waits, is given its arguments as a list there too",
    { xs: items },
    ({ xs }) =>
      Effect.gen(function* () {
        const found = yield* run(
          [
            "find",
            ["array/map", ["array/make", "?x", 1], ALL],
            ["in", "?x", quote(xs)],
          ],
          stdlib
        );
        expect(found).toEqual(
          [...new Set(xs)].sort((a, b) => a - b).map((x) => [[x], [1]])
        );
      })
  );

  it.effect.prop(
    "computes a rule head's value, and gives the same answers after the rule is saved in a snapshot",
    { ns: items, k: small },
    ({ ns, k }) =>
      Effect.gen(function* () {
        const query = ["find", ["array/make", "?x", "?t"], ["s", "?x", "?t"]];
        const [answers, snapshot] = (yield* run(
          [
            "begin",
            ["relation", "n", ["x"]],
            ["relation", "s", ["x", "t"]],
            ...ns.map((x) => ["fact", ["n", x]]),
            ["rule", ["s", "?x", [SUM, "?x", k, "?x"]], ["n", "?x"]],
            ["array/make", query, ["snapshot"]],
          ],
          stdlib
        )) as [unknown, unknown];
        expect(answers).toEqual(
          [...new Set(ns)].sort((a, b) => a - b).map((x) => [x, 2 * x + k])
        );
        const loaded = yield* loadDatabase(snapshot, stdlib);
        expect(yield* run(query, stdlib, { database: loaded })).toEqual(
          answers
        );
      })
  );

  it.effect.prop(
    "is worked out by its body in the solver's step, for every whole number",
    {
      count: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3 }))
      ),
    },
    ({ count }) =>
      Effect.gen(function* () {
        const names = Array.from({ length: count }, (_, at) => `?a${at}`);
        const proves = (claim: unknown) =>
          run(
            [
              "query",
              [
                "not",
                [
                  "exists",
                  names,
                  [
                    "and",
                    ...names.map((name) => [
                      "schema/fits?",
                      name,
                      "value/integer?",
                    ]),
                    ["not", claim],
                  ],
                ],
              ],
            ],
            stdlib,
            { database: new LogicDatabase() }
          );
        // Its sum is number/add's sum, for every whole number.
        expect(
          yield* proves([
            "number/equals?",
            [SUM, ...names],
            ["number/add", ...names],
          ])
        ).toEqual([{}]);
        // Its list is the arguments: its first item is the first argument,
        // and summing it is not the first argument alone, past one argument.
        expect(
          yield* proves([
            "number/equals?",
            ["array/head", [ALL, ...names]],
            names[0],
          ])
        ).toEqual([{}]);
        expect(
          yield* proves(["number/equals?", [SUM, ...names], names[0]])
        ).toEqual(count === 1 ? [{}] : []);
        // Handed to a function, it is given its arguments there as a list:
        // array/reduce gives the running total and an item.
        const pairs = [
          "lambda",
          "pair",
          [
            "number/add",
            ["array/head", "pair"],
            ["array/head", ["array/tail", "pair"]],
          ],
        ];
        expect(
          yield* proves([
            "number/equals?",
            ["array/reduce", ["array/make", ...names], 0, pairs],
            ["number/add", ...names],
          ])
        ).toEqual([{}]);
      })
  );

  it.effect.prop(
    "gives what a lambda with as many parameters gives with array/make of them, whatever the arguments are, goals and finds among them",
    {
      args: Arbitrary.array(argument, { maxLength: 3 }),
      body: Arbitrary.schema(
        Schema.Int.check(
          Schema.isBetween({ minimum: 0, maximum: BODIES.length - 1 })
        )
      ),
    },
    ({ args, body }) =>
      Effect.gen(function* () {
        const facts = [
          ["relation", "small", ["x"]],
          ["fact", ["small", 1], ["small", 2]],
        ];
        const names = args.map((_, at) => `a${at}`);
        const of = BODIES[body] as (list: unknown) => unknown;
        const outcome = (call: unknown) =>
          run(["begin", ...facts, call], stdlib).pipe(
            Effect.map((value) => ({ value: JSON.stringify(value) })),
            Effect.catch((error) => Effect.succeed({ error: String(error) }))
          );
        const rest = yield* outcome([["lambda", "args", of("args")], ...args]);
        const fixed = yield* outcome([
          ["lambda", names, of(["array/make", ...names])],
          ...args,
        ]);
        expect("error" in rest).toBe("error" in fixed);
        if ("value" in rest && "value" in fixed) {
          expect(rest.value).toBe(fixed.value);
        }
      })
  );
});

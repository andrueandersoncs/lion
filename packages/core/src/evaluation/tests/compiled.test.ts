/**
 * Compiling an expression changes how fast it runs, never what it gives:
 * for every generated program, the compiled evaluator gives what the
 * interpreter it replaced gives, value for value and error for error, in
 * plain code, while a value waits for a logic variable, and while a find
 * is being written. And it keeps calls of any depth working, through the
 * JavaScript stack and past it, with a call in tail position keeping
 * nothing of its caller.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Cause, Effect, Exit, Schema } from "effect";
import { raisedAs } from "@/errors/evaluation";
import { run } from "@/evaluation/evaluate";
import { LogicDatabase } from "@/logic/database";
import { show } from "@/logic/terms";
import {
  booleanOf,
  type Expression,
  environment,
  listOf,
  numberOf,
  PRELUDE,
  small,
} from "@/logic/tests/expressions";
import { element, oneOf } from "@/logic/tests/programs";
import { stdlib } from "@/modules";
import { run as interpret } from "./interpreter";

/** What a program gave, written so two runs can be compared. */
const outcome = (effect: Effect.Effect<unknown, unknown>) =>
  Effect.map(Effect.exit(effect), (exit) => {
    if (Exit.isSuccess(exit)) {
      return { value: show(exit.value) };
    }
    const error = Cause.squash(exit.cause) as Error & {
      readonly _tag?: string;
    };
    // The functions a failure left are told by the properties of
    // failures.test.ts; the interpreter is the model of what it says where
    // it was raised.
    return { error: `${error._tag ?? "Error"}: ${String(raisedAs(error))}` };
  });

/** The program's outcome under the compiler and under the interpreter. */
const both = (program: Expression, bindings: Record<string, unknown> = {}) =>
  Effect.all([
    outcome(
      run(
        program,
        { ...environment, ...bindings },
        {
          database: new LogicDatabase(),
        }
      )
    ),
    outcome(
      interpret(program, { ...environment, ...bindings }, new LogicDatabase())
    ),
  ]);

const constant = (value: Expression): Arbitrary.Arbitrary<Expression> =>
  Arbitrary.Constant(value);

/**
 * Forms that fail, or that only a few programs use, around a generated
 * number: a call of something that is not a function, a lambda given too
 * few arguments, a misspelled name, a form given what it does not take, a
 * name defined and read back, an empty `begin`, quoted code run by `eval`,
 * a library function that writes a schema with the names bound where it is
 * called, in a lambda's scope and in one a lambda calls, and a lambda with
 * one name for the list of its arguments.
 */
const oddities = (n: Arbitrary.Arbitrary<Expression>) =>
  oneOf<Expression>(
    Arbitrary.map(n, (value) => [value, 1]),
    Arbitrary.map(n, (value) => [["lambda", ["a", "b"], "a"], value]),
    Arbitrary.map(n, (value) => [
      ["lambda", "args", ["array/reduce", "args", 0, "number/add"]],
      value,
      1,
      value,
    ]),
    Arbitrary.map(n, (value) => [["lambda", "args", "args"], value]),
    Arbitrary.map(n, (value) => ["number/ad", value, 1]),
    Arbitrary.map(n, (value) => ["and", value, true]),
    Arbitrary.map(n, (value) => ["not", value]),
    Arbitrary.map(n, (value) => ["in", value, 3]),
    Arbitrary.map(n, (value) => ["begin", ["define", "y", value], "y"]),
    Arbitrary.map(n, (value) => ["begin", value, ["begin"]]),
    Arbitrary.map(n, (value) => [
      "eval",
      ["quote", ["number/add", value, "bonus"]],
    ]),
    Arbitrary.map(n, (value) => ["match", value, [2, "number/add"], "abs"]),
    Arbitrary.map(n, (value) => ({ value, nested: { again: value } })),
    constant(["eval", ["quote", { "?x": 1 }]]),
    Arbitrary.map(n, (value) => [
      ["lambda", ["p"], ["schema/problems", value, ["quote", "p"]]],
      1,
    ]),
    Arbitrary.map(n, (value) => [
      [
        "lambda",
        ["p"],
        [["lambda", ["q"], ["schema/problems", value, ["quote", "q"]]], "p"],
      ],
      1,
    ])
  );

const FEATURES = { saveable: false };

const expressionOf = (depth: number) =>
  oneOf(
    numberOf(depth, FEATURES),
    booleanOf(depth, FEATURES),
    listOf(depth, FEATURES),
    oddities(numberOf(depth - 1, FEATURES))
  );

const expression = expressionOf(2);

const input = {
  expression,
  // Zero often, since a guard in the prelude's helpers is about it.
  x: oneOf(Arbitrary.Constant(0), small),
};

const program = (...body: readonly Expression[]) => [
  "begin",
  ...PRELUDE,
  ...body,
];

const MORE = { timeout: 120_000, arbitrary: { runs: 200 } };

describe("the compiled evaluator", () => {
  it.effect.prop(
    "gives what the interpreter gives, in plain code",
    input,
    ({ expression, x }) =>
      Effect.gen(function* () {
        const [compiled, interpreted] = yield* both(program(expression), {
          "?x": x,
        });
        expect(compiled).toEqual(interpreted);
      }),
    MORE
  );

  it.effect.prop(
    "gives what the interpreter gives while a value waits for a variable",
    input,
    ({ expression }) =>
      Effect.gen(function* () {
        const [compiled, interpreted] = yield* both(program(expression));
        expect(compiled).toEqual(interpreted);
      }),
    MORE
  );

  it.effect.prop(
    "gives what the interpreter gives while a find is being written",
    { expression, xs: Arbitrary.array(small, { maxLength: 4 }) },
    ({ expression, xs }) =>
      Effect.gen(function* () {
        const [compiled, interpreted] = yield* both(
          program(["find", expression, ["in", "?x", ["quote", xs]]])
        );
        expect(compiled).toEqual(interpreted);
      }),
    MORE
  );
});

/** A lambda that calls itself `n` times: in tail position, or not. */
const LOOPS = [
  "begin",
  [
    "define",
    "count",
    [
      "lambda",
      ["n", "total"],
      [
        "cond",
        [["number/equals?", "n", 0], "total"],
        [
          "else",
          ["count", ["number/subtract", "n", 1], ["number/add", "total", 1]],
        ],
      ],
    ],
  ],
  [
    "define",
    "sum",
    [
      "lambda",
      ["n"],
      [
        "cond",
        [["number/equals?", "n", 0], 0],
        ["else", ["number/add", "n", ["sum", ["number/subtract", "n", 1]]]],
      ],
    ],
  ],
  // Each call goes through a library function that calls back into Lion.
  [
    "define",
    "nest",
    [
      "lambda",
      ["n"],
      [
        "cond",
        [["number/equals?", "n", 0], 0],
        [
          "else",
          [
            "number/add",
            1,
            [
              "aggregate/sum",
              [
                "array/map",
                ["array/make", ["number/subtract", "n", 1]],
                "nest",
              ],
            ],
          ],
        ],
      ],
    ],
  ],
];

describe("calls of any depth", () => {
  it.effect.prop(
    "give what arithmetic gives, deeper than the JavaScript stack goes",
    {
      n: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100_000 }))
      ),
      how: element(["count", "sum", "nest"] as const),
    },
    ({ n, how }) =>
      Effect.gen(function* () {
        const call = how === "count" ? [how, n, 0] : [how, n];
        const result = yield* run([...LOOPS, call], stdlib);
        expect(result).toBe(how === "sum" ? (n * (n + 1)) / 2 : n);
      }),
    { timeout: 120_000, arbitrary: { runs: 12 } }
  );
});

/** How much memory the program holds now, in bytes. */
const heap = () => process.memoryUsage().heapUsed;

/**
 * A loop that calls itself in tail position, in a `cond` case or as the
 * last expression of a `begin`, and gives how much more memory is held at
 * its last step than at its first.
 */
const tailLoop = (where: "cond" | "begin") => {
  const again = ["loop", ["number/subtract", "n", 1], "start"];
  return [
    "begin",
    [
      "define",
      "loop",
      [
        "lambda",
        ["n", "start"],
        [
          "cond",
          [
            ["number/equals?", "n", 0],
            ["number/subtract", ["host/heap"], "start"],
          ],
          ["else", where === "cond" ? again : ["begin", "n", again]],
        ],
      ],
    ],
  ];
};

describe("a call in tail position", () => {
  it.effect.prop(
    "keeps nothing of its caller, so a loop holds no more memory as it runs",
    {
      n: Arbitrary.schema(
        Schema.Int.check(
          Schema.isBetween({ minimum: 300_000, maximum: 400_000 })
        )
      ),
      where: element(["cond", "begin"] as const),
    },
    ({ n, where }) =>
      Effect.gen(function* () {
        const held = yield* run(
          [...tailLoop(where), ["loop", n, ["host/heap"]]],
          { ...stdlib, "host/heap": heap }
        );
        // A loop that kept something for each call would hold 150 MB or
        // more; what the collector has not freed yet moves this by 30 MB.
        expect(held).toBeLessThan(64_000_000);
      }),
    { timeout: 120_000, arbitrary: { runs: 4 } }
  );
});

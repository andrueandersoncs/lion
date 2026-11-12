/**
 * Generators of Lion expressions over the logic variable `?x`, for property
 * tests of everything that waits for a logic variable, and of everything
 * that asks the database a question. The model they are checked against is
 * plain evaluation: the same expression, run once for each value with `?x`
 * bound to it in the environment.
 */
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { LogicDatabase } from "@/logic/database";
import { stdlib } from "@/modules";
import { element, type Outcome, oneOf } from "./programs";

export type Expression = unknown;

/** Functions a host adds to the environment as they are. */
export const HOST = {
  "host/double": (value: number) => value * 2,
  "host/describe": (value: unknown) => Effect.succeed(`<${String(value)}>`),
};

export const environment: Record<string, unknown> = { ...stdlib, ...HOST };

const LINKS = [
  [0, 1],
  [0, 2],
  [1, 2],
  [2, 3],
  [3, 0],
  [-1, -1],
  [-2, 4],
  [4, 4],
];

/**
 * Relations every generated program can ask about: `link` between small
 * numbers, the `even` ones, and `reach`, which rules derive by recursion.
 * Adding what a database already holds changes nothing, so the prelude can
 * run against the same database any number of times.
 */
const WORLD: readonly Expression[] = [
  ["relation", "link", ["from", "to"]],
  ["relation", "even", ["n"]],
  ["relation", "reach", ["from", "to"]],
  ["fact", ...LINKS.map(([from, to]) => ["link", from, to])],
  ["fact", ...[-4, -2, 0, 2, 4].map((n) => ["even", n])],
  ["rule", ["reach", "?a", "?b"], ["link", "?a", "?b"]],
  ["rule", ["reach", "?a", "?c"], ["reach", "?a", "?b"], ["link", "?b", "?c"]],
];

/** How many rules the prelude adds to a database. */
export const WORLD_RULES = 2;

/**
 * What every generated program starts with: the relations to ask about,
 * then lambdas that branch, call themselves, only compute, or ask, a named
 * constant, and a second name for a standard function.
 */
export const PRELUDE: readonly Expression[] = [
  ...WORLD,
  // A lambda that asks a question about its argument.
  ["define", "targets", ["lambda", ["v"], ["find", "?k", ["link", "v", "?k"]]]],
  [
    "define",
    "abs",
    [
      "lambda",
      ["v"],
      [
        "cond",
        [
          ["number/lessThan", "v", 0],
          ["number/subtract", 0, "v"],
        ],
        ["else", "v"],
      ],
    ],
  ],
  [
    "define",
    "triangle",
    [
      "lambda",
      ["n"],
      [
        "cond",
        [["number/lessThanOrEqualTo", "n", 0], 0],
        [
          "else",
          ["number/add", "n", ["triangle", ["number/subtract", "n", 1]]],
        ],
      ],
    ],
  ],
  [
    "define",
    "clamp",
    [
      "lambda",
      ["v", "low", "high"],
      ["number/max", "low", ["number/min", "v", "high"]],
    ],
  ],
  // A lambda that names the logic variable itself.
  ["define", "shift", ["lambda", ["v"], ["number/add", "v", "?x"]]],
  ["define", "bonus", 3],
  ["define", "plus", "number/add"],
  // A second name for the logic variable.
  ["define", "again", "?x"],
];

export interface Features {
  /**
   * Leaves out what a snapshot cannot write: a lambda that calls itself, and
   * a function made while the program runs.
   */
  readonly saveable: boolean;
}

const constant = <A>(value: A): Arbitrary.Arbitrary<Expression> =>
  Arbitrary.Constant(value);

const integer = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

export const small = integer(-4, 4);

const leaf = oneOf<Expression>(
  constant("?x"),
  constant("?x"),
  constant("again"),
  small,
  constant("bonus")
);

/** A divisor that fails only through `?x`, never as a constant. */
const divisor = oneOf<Expression>(constant("?x"), integer(1, 4));

const call =
  (...names: readonly string[]) =>
  (...args: readonly Arbitrary.Arbitrary<Expression>[]) =>
    Arbitrary.map(
      Arbitrary.all([element(names), ...args]),
      (form): Expression => form
    );

const isNegative = ["lambda", ["v"], ["number/lessThan", "v", 0]];

/**
 * A goal with a relation in it, about a number computed from `?x`. Some have
 * a variable of their own, and some join on it. A question nested in another
 * gets a name of its own from `depth`: within a rule a name is one variable,
 * so questions that share a name would be about the same value.
 */
const goalOf = (n: Arbitrary.Arbitrary<Expression>, depth: number) => {
  const k = `?k${depth}`;
  return oneOf(
    Arbitrary.map(n, (value): Expression => ["even", value]),
    Arbitrary.map(n, (value): Expression => ["link", value, "?_"]),
    Arbitrary.map(n, (value): Expression => ["link", k, value]),
    Arbitrary.map(n, (value): Expression => ["not", ["reach", value, 0]]),
    Arbitrary.map(
      Arbitrary.all([n, n]),
      ([from, to]): Expression => ["reach", from, to]
    ),
    Arbitrary.map(
      n,
      (value): Expression => ["and", ["link", value, k], ["even", k]]
    ),
    Arbitrary.map(
      n,
      (value): Expression => [
        "or",
        ["even", value],
        ["and", ["link", k, value], ["not", ["even", k]]],
      ]
    )
  );
};

/** A find about a number computed from `?x`, with variables of its own. */
const findOf = (n: Arbitrary.Arbitrary<Expression>, depth: number) => {
  const k = `?k${depth}`;
  const m = `?m${depth}`;
  return oneOf(
    Arbitrary.map(n, (value): Expression => ["find", k, ["link", value, k]]),
    Arbitrary.map(n, (value): Expression => ["find", k, ["reach", value, k]]),
    Arbitrary.map(n, (value): Expression => ["targets", value]),
    // The template computes with the question's own variable and `?x`.
    Arbitrary.map(
      Arbitrary.all([n, n]),
      ([value, by]): Expression => [
        "find",
        ["number/add", k, by],
        ["and", ["link", value, m], ["link", m, k], ["not", ["even", m]]],
      ]
    ),
    Arbitrary.map(
      n,
      (value): Expression => [
        "find",
        k,
        ["and", ["in", k, ["array/range", -1, 3]], ["not", ["link", value, k]]],
      ]
    )
  );
};

/** Fails when `?x` is 0, so it needs a guard. */
const quotientIsSmall = ["number/lessThan", ["number/divide", 1, "?x"], 0.5];

/** A number computed from `?x`, with every kind of form that waits. */
export const numberOf = (
  depth: number,
  features: Features
): Arbitrary.Arbitrary<Expression> => {
  if (depth === 0) {
    return leaf;
  }
  const n = numberOf(depth - 1, features);
  const b = booleanOf(depth - 1, features);
  const l = listOf(depth - 1, features);
  const one = (make: (a: Expression) => Expression) => Arbitrary.map(n, make);
  const choices = [
    leaf,
    call(
      "number/add",
      "number/subtract",
      "number/multiply",
      "number/min",
      "number/max",
      "plus"
    )(n, n),
    call("number/divide", "number/remainder")(n, divisor),
    call("number/power")(n, constant(2)),
    // A standard function that arrives under a parameter's name.
    one((value) => [["lambda", ["f"], ["f", value, 1]], "number/add"]),
    call(
      "number/absolute",
      "number/floor",
      "number/ceiling",
      "number/round",
      "host/double",
      "abs",
      "shift"
    )(n),
    Arbitrary.map(
      Arbitrary.all([b, n, n]),
      ([test, then, otherwise]): Expression => [
        "cond",
        [test, then],
        ["else", otherwise],
      ]
    ),
    Arbitrary.map(
      Arbitrary.all([n, n]),
      ([value, high]): Expression => ["clamp", value, -2, high]
    ),
    Arbitrary.map(
      Arbitrary.all([n, n]),
      ([p, q]): Expression => [
        [
          "lambda",
          ["p", "q"],
          ["number/subtract", ["number/multiply", "p", 2], "q"],
        ],
        p,
        q,
      ]
    ),
    Arbitrary.map(l, (items): Expression => ["array/length", items]),
    Arbitrary.map(l, (items): Expression => ["aggregate/sum", items]),
    Arbitrary.map(
      l,
      (items): Expression => [
        "array/reduce",
        items,
        0,
        ["lambda", ["total", "item"], ["number/add", "total", "item"]],
      ]
    ),
    Arbitrary.map(
      Arbitrary.all([n, n]),
      ([first, second]): Expression => [
        "object/get",
        { first, second },
        "second",
      ]
    ),
    one((value) => [
      "match",
      value,
      [isNegative, ["lambda", ["v"], ["number/subtract", 0, "v"]]],
      ["lambda", ["v"], "v"],
    ]),
    one((value) => ["eval", ["array/make", ["quote", "number/add"], value, 1]]),
    // Questions: what a find found is a list like any other, and a goal with
    // a relation in it is a condition like any other.
    Arbitrary.map(
      findOf(n, depth),
      (found): Expression => ["array/length", found]
    ),
    Arbitrary.map(
      findOf(n, depth),
      (found): Expression => ["aggregate/sum", found]
    ),
    Arbitrary.map(
      Arbitrary.all([goalOf(n, depth), n, n]),
      ([goal, then, otherwise]): Expression => [
        "cond",
        [goal, then],
        ["else", otherwise],
      ]
    ),
    Arbitrary.map(
      Arbitrary.all([n, n]),
      ([value, by]): Expression => [
        [
          "lambda",
          ["v"],
          ["aggregate/count", ["find", "?k", ["link", "?k", "v"]]],
        ],
        ["number/add", value, by],
      ]
    ),
  ];
  const unsaveable = [
    one((value) => ["triangle", ["number/remainder", ["abs", value], 5]]),
    Arbitrary.map(
      Arbitrary.all([n, n]),
      ([first, second]): Expression => [
        ["func/partial", "number/add", first],
        second,
      ]
    ),
  ];
  return oneOf(...choices, ...(features.saveable ? [] : unsaveable));
};

/**
 * A value for a rule head. As a whole head argument an aggregate call
 * combines the rule's matches instead of a list, so the number sits inside
 * a call or a record.
 */
export const headOf = (depth: number, features: Features) =>
  Arbitrary.map(
    Arbitrary.all([numberOf(depth, features), element([true, false])]),
    ([value, wrapped]): Expression =>
      wrapped ? { value } : ["number/add", value, 0]
  );

/** True or false computed from `?x`, through functions and logic forms. */
export const booleanOf = (
  depth: number,
  features: Features
): Arbitrary.Arbitrary<Expression> => {
  const n = numberOf(depth === 0 ? 0 : depth - 1, features);
  const compare = call(
    "number/lessThan",
    "number/greaterThan",
    "number/equals?",
    "number/lessThanOrEqualTo",
    "number/greaterThanOrEqualTo",
    "="
  )(n, n);
  if (depth === 0) {
    return oneOf(constant(true), constant(false), compare, compare);
  }
  const b = booleanOf(depth - 1, features);
  return oneOf(
    compare,
    call("boolean/and", "boolean/or", "boolean/xor", "and", "or")(b, b),
    call("boolean/not", "not")(b),
    call("value/number?", "value/string?")(n),
    Arbitrary.map(
      n,
      (value): Expression => ["string/equals?", ["host/describe", value], "<0>"]
    ),
    // A guard written first protects the division after it.
    constant(["and", ["number/greaterThan", "?x", 0], quotientIsSmall]),
    constant(["or", ["number/lessThanOrEqualTo", "?x", 0], quotientIsSmall]),
    Arbitrary.map(
      Arbitrary.all([n, listOf(depth - 1, features)]),
      ([item, items]): Expression => ["in", item, items]
    ),
    Arbitrary.map(
      Arbitrary.all([b, b, b]),
      ([test, then, otherwise]): Expression => [
        "cond",
        [test, then],
        ["else", otherwise],
      ]
    ),
    // A goal with a relation in it is true or false wherever a value is
    // needed: given to a function, compared, tested, or put in a record.
    Arbitrary.map(
      goalOf(n, depth),
      (goal): Expression => ["value/identity", goal]
    ),
    Arbitrary.map(
      goalOf(n, depth),
      (goal): Expression => ["boolean/not", goal]
    ),
    Arbitrary.map(
      Arbitrary.all([goalOf(n, depth), b]),
      ([goal, value]): Expression => ["=", goal, value]
    ),
    Arbitrary.map(
      goalOf(n, depth),
      (goal): Expression => ["cond", [goal, true], ["else", false]]
    ),
    Arbitrary.map(
      goalOf(n, depth),
      (goal): Expression => ["object/get", { holds: goal }, "holds"]
    ),
    // A relation is a predicate: `match` asks it about the value.
    Arbitrary.map(
      n,
      (value): Expression => [
        "match",
        value,
        ["even", ["lambda", ["v"], true]],
        ["lambda", ["v"], false],
      ]
    ),
    Arbitrary.map(
      Arbitrary.all([n, findOf(n, depth)]),
      ([item, found]): Expression => ["in", item, found]
    )
  );
};

/** A list computed from `?x`, some through lambdas that mention it. */
export const listOf = (
  depth: number,
  features: Features
): Arbitrary.Arbitrary<Expression> => {
  const n = numberOf(depth === 0 ? 0 : depth - 1, features);
  const made = Arbitrary.map(
    Arbitrary.array(n, { maxLength: 3 }),
    (items): Expression => ["array/make", ...items]
  );
  if (depth === 0) {
    return made;
  }
  const l = listOf(depth - 1, features);
  return oneOf(
    made,
    Arbitrary.map(integer(0, 3), (end): Expression => ["array/range", 0, end]),
    Arbitrary.map(
      Arbitrary.all([l, n]),
      ([items, by]): Expression => [
        "array/map",
        items,
        ["lambda", ["item"], ["number/add", "item", by]],
      ]
    ),
    // A lambda that reaches the variable through a parameter around it,
    // and one that reaches it through a helper.
    Arbitrary.map(
      Arbitrary.all([l, n]),
      ([items, by]): Expression => [
        [
          "lambda",
          ["k"],
          [
            "array/map",
            items,
            ["lambda", ["item"], ["number/multiply", "item", "k"]],
          ],
        ],
        by,
      ]
    ),
    Arbitrary.map(
      l,
      (items): Expression => [
        "array/map",
        items,
        ["lambda", ["item"], ["shift", "item"]],
      ]
    ),
    call("array/concat")(l, l),
    call("array/tail")(l),
    findOf(n, depth),
    // A relation given to a function is asked about each item.
    Arbitrary.map(l, (items): Expression => ["array/map", items, "even"])
  );
};

/** Values for `?x`: a few distinct small integers. */
export const values = Arbitrary.map(
  Arbitrary.array(small, { minLength: 1, maxLength: 5 }),
  (items) => [...new Set(items)].sort((a, b) => a - b)
);

const outcome = (effect: Effect.Effect<unknown, unknown>) =>
  effect.pipe(
    Effect.map(
      (value): Outcome => ({
        ok: true,
        value: JSON.parse(JSON.stringify(value)) as unknown,
      })
    ),
    Effect.catch((error) =>
      Effect.succeed<Outcome>({
        ok: false,
        message: String((error as { message?: unknown }).message),
      })
    )
  );

/** Runs a program after the prelude, and reports its value or error. */
export const attempt = (
  program: readonly Expression[],
  database = new LogicDatabase(),
  bindings: Record<string, unknown> = {}
) =>
  outcome(
    run(
      ["begin", ...PRELUDE, ...program],
      { ...environment, ...bindings },
      {
        database,
      }
    )
  );

/**
 * The model: what an expression is with a value in place of `?x`. A name
 * that is bound evaluates to its value, so binding `?x` is all it takes.
 */
export const substitute = (expression: Expression, value: unknown) =>
  attempt([expression], new LogicDatabase(), { "?x": value });

/** The model for a list of values: every value's result, or the first error. */
export const substituteAll = (
  expression: Expression,
  inputs: readonly unknown[]
) =>
  Effect.gen(function* () {
    const results: unknown[] = [];
    for (const input of inputs) {
      const result = yield* substitute(expression, input);
      if (!result.ok) {
        return result;
      }
      results.push(result.value);
    }
    return { ok: true, value: results } as Outcome;
  });

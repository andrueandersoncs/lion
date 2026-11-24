/**
 * The interop grid's rows and columns.
 *
 * A row is a kind of expression over the logic variable `?x`. A column is a
 * place such an expression can stand: a rule head, a filter, a `find`, and
 * so on. Lion's two rules say what every cell must give. Whatever needs the
 * value of a logic variable waits for it, and whatever needs the value of a
 * goal asks it, so in every place an expression gives what plain code gives
 * with the variable's value written in.
 *
 * Add a row for a new kind of expression and a column for a new place an
 * expression can stand. A cell that does not give what plain code gives is
 * an exception a Lion programmer has to remember.
 */

/**
 * A number with a numerator and a denominator, an exact one such as 1/3
 * from whichever version of Lion made it, which stands for itself.
 */
const isExactNumber = (value: object) =>
  typeof (value as { readonly n?: unknown }).n === "bigint";

/** The facts a grid runs on. `?x` takes each value of `n`. */
export interface World {
  /** Pairs of the relation `link`. */
  readonly link: readonly (readonly [number, number])[];
  /** Rows of the relation `n`: whole numbers of at least 0, each once. */
  readonly n: readonly number[];
  /** Rows of the relation `small`. */
  readonly small: readonly number[];
}

export const WORLD: World = {
  link: [
    [1, 2],
    [1, 3],
    [2, 3],
  ],
  n: [1, 2, 3],
  small: [1, 2],
};

/**
 * A value written as an expression that evaluates to it: a string inside
 * `quote`, a list as the call that makes it, a record of such expressions,
 * and an unknown as the `some` form it reads as.
 */
export const literal = (value: unknown): unknown => {
  if (typeof value === "string") {
    return ["quote", value];
  }
  if (Array.isArray(value)) {
    return ["array/make", ...value.map(literal)];
  }
  if (typeof value !== "object" || value === null || isExactNumber(value)) {
    return value;
  }
  if (Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, literal(item)])
    );
  }
  // An unknown, which reads as the `some` form that makes it.
  return JSON.parse(JSON.stringify(value));
};

const facts = (relation: string, rows: readonly (readonly unknown[])[]) =>
  rows.length === 0 ? [] : [["fact", ...rows.map((row) => [relation, ...row])]];

/** The forms every program of the grid starts with. */
export const prelude = (world: World): unknown[] => [
  ["relation", "n", ["x"]],
  ["relation", "small", ["x"]],
  ["relation", "link", ["from", "to"]],
  ...facts(
    "n",
    world.n.map((x) => [x])
  ),
  ...facts(
    "small",
    world.small.map((x) => [x])
  ),
  ...facts("link", world.link),
  ["define", "double", ["lambda", ["v"], ["number/multiply", "v", 2]]],
  [
    "define",
    "sum-to",
    [
      "lambda",
      ["v"],
      [
        "cond",
        [["number/lessThan", "v", 1], 0],
        ["else", ["number/add", "v", ["sum-to", ["number/subtract", "v", 1]]]],
      ],
    ],
  ],
];

/** Functions the host adds to the standard library for the grid. */
export const HOST = {
  "host/double": (value: number) => value * 2,
};

/** The logic variable every expression is over. */
export const X = "?x";

export interface Expression {
  /** True when the expression is true or false, so it can be a goal. */
  readonly boolean?: true;
  readonly form: unknown;
  readonly name: string;
  /** Forms the expression needs after the prelude, such as a declaration. */
  readonly setup?: readonly unknown[];
}

export const EXPRESSIONS: readonly Expression[] = [
  // Plain Lion over a logic variable: the waiting rule.
  { name: "function call", form: ["number/add", X, 1] },
  { name: "nested calls", form: ["number/multiply", ["number/add", X, 1], 2] },
  { name: "call that combines its arguments", form: ["number/add", X, 1, X] },
  // Exact numbers: a fraction no decimal writes, and decimals that add exactly.
  { name: "exact fraction", form: ["number/divide", X, 3] },
  { name: "exact decimal sum", form: ["number/add", X, 0.1, 0.2] },
  { name: "remainder", form: ["number/remainder", ["number/add", X, 1], 2] },
  {
    name: "floor of a fraction",
    form: ["number/floor", ["number/divide", X, 2]],
  },
  {
    name: "ceiling of a fraction",
    form: ["number/ceiling", ["number/divide", X, 2]],
  },
  { name: "rounded fraction", form: ["number/round", ["number/divide", X, 2]] },
  {
    name: "characters of a string",
    form: ["string/chars", ["string/concat", "a𝄞", ["number/toString", X]]],
  },
  {
    name: "trimmed and cased text",
    form: [
      "string/replaceAll",
      [
        "string/toLowerCase",
        [
          "string/trim",
          ["string/concat", " A-", ["number/toString", X], "-A "],
        ],
      ],
      "a",
      "b",
    ],
  },
  {
    name: "uppercased text",
    form: [
      "string/toUpperCase",
      ["string/concat", "x", ["number/toString", X]],
    ],
  },
  {
    name: "fraction written as text",
    form: ["number/toString", ["number/divide", X, 3]],
  },
  {
    name: "text built from a number",
    form: ["string/concat", "n=", ["number/toString", X], "!"],
  },
  {
    name: "text joined from a list",
    form: [
      "string/join",
      ["array/make", ["number/toString", X, ","], ["quote", "items"]],
      " ",
    ],
  },
  {
    name: "numbers read from text",
    form: [
      "string/numbers",
      ["string/concat", "n=", ["number/toString", X, ","], "; -2!"],
      ",",
    ],
  },
  {
    name: "number read from its text",
    form: ["number/fromString", ["number/toString", X, ","], ","],
  },
  {
    name: "record with a key set and one removed",
    form: ["object/remove", ["object/set", { a: 1, b: 2 }, "x", X], "a"],
  },
  {
    name: "records merged and rebuilt from entries",
    form: [
      "object/fromEntries",
      ["object/entries", ["object/merge", { a: 1 }, { b: X }, { a: X }]],
    ],
  },
  {
    name: "JSON parsed from text",
    form: ["object/json-parse", ["object/json-stringify", { x: X }]],
  },
  { name: "comparison", form: ["number/greaterThan", X, 1], boolean: true },
  {
    name: "cond",
    form: ["cond", [["number/greaterThan", X, 1], "big"], ["else", "little"]],
  },
  {
    name: "match",
    form: [
      "match",
      X,
      [
        ["lambda", ["v"], ["number/greaterThan", "v", 1]],
        ["lambda", ["v"], "big"],
      ],
      ["lambda", ["v"], "little"],
    ],
  },
  {
    name: "match with no fallback",
    form: [
      "match",
      X,
      [
        ["lambda", ["v"], ["number/greaterThan", "v", 1]],
        ["lambda", ["v"], "big"],
      ],
      ["value/number?", ["lambda", ["v"], "little"]],
    ],
  },
  { name: "record", form: { next: ["number/add", X, 1], x: X } },
  {
    name: "record with the empty key",
    form: { "": ["number/add", X, 1], x: X },
  },
  { name: "list", form: ["array/make", X, ["number/add", X, 1]] },
  {
    name: "states of a fold",
    form: [
      "array/reductions",
      ["array/make", X, 1],
      0,
      ["lambda", ["s", "v"], ["number/add", "s", "v"]],
    ],
  },
  {
    name: "some item",
    form: [
      "array/some?",
      ["array/make", X, 0],
      ["lambda", ["v"], ["number/greaterThan", "v", 1]],
    ],
    boolean: true,
  },
  {
    name: "every item",
    form: [
      "array/every?",
      ["array/reductions", ["array/make", X, X], 0, "number/add"],
      ["lambda", ["v"], ["number/lessThan", "v", 5]],
    ],
    boolean: true,
  },
  {
    name: "filtered list",
    form: [
      "array/filter",
      ["array/make", X, 0, ["number/add", X, 1]],
      ["lambda", ["v"], ["number/greaterThan", "v", 1]],
    ],
  },
  {
    name: "reversed list",
    form: ["array/reverse", ["array/make", X, ["number/add", X, 1]]],
  },
  {
    name: "sorted list",
    form: ["array/sort", ["array/make", ["number/add", X, 1], X, 0]],
  },
  {
    name: "sorted list with comparator",
    form: [
      "array/sort",
      ["array/make", X, ["number/add", X, 1]],
      "number/greaterThan",
    ],
  },
  {
    name: "item indexed and located in a list",
    form: [
      "array/make",
      ["array/at", ["array/make", 10, X, 30], -2],
      ["array/indexOf", ["array/make", 1, 2, 3], X],
      [
        "array/find",
        ["array/make", 0, X, 9],
        ["lambda", ["v"], ["number/greaterThan", "v", 1]],
        -1,
      ],
    ],
  },
  {
    name: "lambda made by a lambda",
    form: [
      [["lambda", ["k"], ["lambda", ["v"], ["number/add", "v", "k"]]], X],
      1,
    ],
  },
  {
    name: "schema inclusion",
    form: [
      "schema/includes?",
      ["schema/anyOf", X, 9],
      [
        "schema/allOf",
        "value/integer?",
        ["lambda", ["n"], ["number/greaterThan", "n", 1]],
      ],
    ],
    boolean: true,
  },
  {
    name: "unbounded list schema inclusion",
    form: [
      "schema/includes?",
      ["schema/arrayOf", ["schema/anyOf", X, 2]],
      ["schema/arrayOf", ["lambda", ["n"], ["number/greaterThan", "n", 1]]],
    ],
    boolean: true,
  },
  {
    name: "membership in a fold's states",
    form: [
      "in",
      2,
      ["array/reductions", ["array/make", X, 1], 0, "number/add"],
    ],
    boolean: true,
  },
  {
    name: "lambda call",
    form: [["lambda", ["v"], ["number/multiply", "v", "v"]], X],
  },
  { name: "defined function", form: ["double", X] },
  { name: "recursive function", form: ["sum-to", X] },
  {
    name: "callback",
    form: [
      "array/map",
      ["array/range", 0, X],
      ["lambda", ["i"], ["number/add", "i", X]],
    ],
  },
  {
    name: "local definition",
    form: [
      [
        "lambda",
        ["v"],
        [
          "begin",
          ["define", "w", ["number/add", "v", 1]],
          ["number/multiply", "w", 2],
        ],
      ],
      X,
    ],
  },
  {
    name: "begin that checks first",
    form: [
      "begin",
      ["schema/assert", X, "value/integer?"],
      ["number/multiply", X, 2],
    ],
  },
  {
    name: "function that checks first",
    form: [
      [
        "lambda",
        ["v"],
        [
          "begin",
          ["schema/assert", "v", "value/integer?"],
          ["number/add", "v", 1],
        ],
      ],
      X,
    ],
  },
  {
    name: "set!",
    form: [
      [
        "lambda",
        ["v"],
        [
          "begin",
          ["define", "w", 0],
          ["set!", "w", ["number/add", "v", 1]],
          "w",
        ],
      ],
      X,
    ],
  },
  {
    name: "a continuation resumed",
    form: [
      "func/reset",
      [
        "lambda",
        [],
        [
          "number/add",
          1,
          ["func/shift", ["lambda", ["k"], ["number/multiply", 10, ["k", X]]]],
        ],
      ],
    ],
  },
  {
    name: "a failure caught",
    form: [
      "func/catch",
      ["lambda", [], ["number/divide", X, 0]],
      ["lambda", ["caught"], ["object/get", "caught", "failure"]],
    ],
  },
  {
    name: "a quantity's units",
    form: [
      "quantity/in",
      [
        "quantity/multiply",
        { value: X, unit: { m: 1, s: -1 } },
        { value: 2, unit: { s: 1 } },
      ],
      { m: 1 },
    ],
  },
  {
    name: "delay and force",
    form: ["value/force", ["delay", ["number/add", X, 1]]],
  },
  {
    name: "lambda with a contract",
    form: [["lambda", [["v", "value/number?"]], ["number/add", "v", 1]], X],
  },
  {
    name: "form's name as a parameter",
    form: [["lambda", ["in"], ["number/add", "in", 1]], X],
  },
  {
    name: "partial application",
    form: [["func/partial", "number/add", 10], X],
  },
  {
    name: "eval",
    form: ["eval", ["array/make", ["quote", "number/add"], X, 1]],
  },
  {
    name: "aggregate of a list",
    form: ["aggregate/sum", ["array/make", X, 10]],
  },
  {
    name: "and, or, not",
    form: [
      "and",
      ["number/greaterThan", X, 0],
      ["not", ["number/greaterThan", X, 2]],
    ],
    boolean: true,
  },
  {
    name: "and and or of nothing",
    form: ["and", ["or", ["number/greaterThan", X, 0], ["or"]], ["and"]],
    boolean: true,
  },
  {
    name: "calls that combine nothing",
    form: [
      "number/add",
      X,
      ["number/add"],
      ["number/multiply"],
      ["array/length", ["array/concat"]],
    ],
  },
  {
    name: "lambda that takes its arguments as a list",
    form: [
      ["lambda", "args", ["array/reduce", "args", 0, "number/add"]],
      X,
      1,
      X,
    ],
  },
  {
    name: "lists zipped",
    form: ["array/zip", ["array/make", X, 1], ["array/make", 2]],
  },
  { name: "equality", form: ["=", X, 2], boolean: true },
  { name: "membership", form: ["in", X, ["array/make", 1, 3]], boolean: true },
  { name: "host function", form: ["host/double", X] },
  // The logic layer as values: the asking rule.
  { name: "goal", form: ["small", X], boolean: true },
  {
    name: "goal with its own variable",
    form: ["link", X, "?y"],
    boolean: true,
  },
  { name: "not of a goal", form: ["not", ["small", X]], boolean: true },
  {
    name: "and of goals",
    form: ["and", ["small", X], ["link", X, "?y"]],
    boolean: true,
  },
  { name: "find", form: ["find", "?y", ["link", X, "?y"]] },
  {
    name: "assuming",
    form: [
      "assuming",
      ["fact", ["link", X, 9]],
      ["find", "?y", ["link", X, "?y"]],
    ],
  },
  {
    name: "goal assuming a retract",
    form: ["assuming", ["retract", ["small", X]], ["small", X]],
    boolean: true,
  },
  // A rule held by assuming has variables of its own beside `?x`.
  {
    name: "assuming a rule",
    form: [
      "assuming",
      ["rule", ["small", "?y"], ["link", X, "?y"]],
      ["find", "?z", ["small", "?z"]],
    ],
  },
  {
    name: "goal assuming a rule taken back",
    setup: [
      ["relation", "big", ["x"]],
      ["rule", ["big", "?y"], ["n", "?y"], ["number/greaterThan", "?y", 1]],
      ["rule", ["big", "?y"], ["small", "?y"]],
    ],
    form: [
      "assuming",
      [
        "retract",
        ["rule", ["big", "?y"], ["n", "?y"], ["number/greaterThan", "?y", 1]],
      ],
      ["big", X],
    ],
    boolean: true,
  },
  {
    name: "aggregate of a find",
    form: ["aggregate/count", ["find", "?y", ["link", X, "?y"]]],
  },
  // The template asks about `?x` too, so it waits while the find is written.
  {
    name: "find whose template asks",
    form: [
      "find",
      ["number/add", "?y", ["cond", [["small", X], X], ["else", 0]]],
      ["link", X, "?y"],
    ],
  },
  {
    name: "cond on a goal",
    form: ["cond", [["small", X], "little"], ["else", "big"]],
  },
  {
    name: "relation as a predicate",
    form: ["array/map", ["array/make", X, 9], "small"],
  },
  {
    name: "graph algorithm",
    form: ["find", "?to", ["graph/shortestPath", "link", X, "?to", "?_", "?_"]],
  },
  {
    name: "goal built by a function",
    form: [["lambda", ["v"], ["small", "v"]], X],
    boolean: true,
  },
  // Schemas: whatever checks a value asks whether it fits, by one rule.
  {
    name: "schema check",
    form: ["schema/fits?", X, ["schema/anyOf", 1, 2]],
    boolean: true,
  },
  {
    name: "named schema",
    setup: [
      [
        "schema",
        "Low",
        [
          "schema/allOf",
          "value/integer?",
          ["lambda", ["v"], ["number/lessThan", "v", 3]],
        ],
      ],
    ],
    form: ["Low", X],
    boolean: true,
  },
  {
    name: "schema that asks",
    form: [
      "schema/fits?",
      { id: X, tags: ["array/make", X] },
      { id: "small", tags: ["schema/arrayOf", "value/integer?"] },
    ],
    boolean: true,
  },
  {
    name: "schema over the variable",
    form: ["schema/fits?", 2, ["schema/anyOf", X, 9]],
    boolean: true,
  },
  {
    name: "schema problems",
    form: ["schema/problems", { id: X }, { id: ["schema/anyOf", 1, 2] }],
  },
  { name: "schema assert", form: ["schema/assert", X, "value/integer?"] },
  {
    name: "match on a schema",
    form: [
      "match",
      { id: X },
      [{ id: ["schema/anyOf", 1, 2] }, ["lambda", ["v"], "low"]],
      ["lambda", ["v"], "high"],
    ],
  },
  // Patterns: a variable in a schema is its value once it is bound.
  {
    name: "record pattern over the variable",
    form: [
      "schema/fits?",
      { id: 2, tags: ["array/make", 2] },
      { id: X, tags: ["array/make", X] },
    ],
    boolean: true,
  },
  {
    name: "open record",
    form: [
      "schema/fits?",
      { id: X, more: true },
      ["schema/open", { id: ["schema/anyOf", 1, 2] }],
    ],
    boolean: true,
  },
  {
    name: "record with a rest",
    form: [
      "schema/fits?",
      { id: 1, more: X },
      ["schema/open", { id: 1 }, { more: ["schema/anyOf", 1, 2] }],
    ],
    boolean: true,
  },
  {
    name: "list with a rest",
    form: [
      "schema/fits?",
      ["array/make", 1, X],
      [
        "schema/open",
        ["array/make", 1],
        ["array/make", ["schema/anyOf", 1, 2]],
      ],
    ],
    boolean: true,
  },
  {
    name: "predicate made from the variable",
    form: ["schema/fits?", 2, ["func/partial", "number/lessThan", X]],
    boolean: true,
  },
  {
    name: "schemas that name each other",
    setup: [
      [
        "schema",
        "Even",
        ["schema/anyOf", 0, { next: "Odd" }],
        "Odd",
        { next: "Even" },
      ],
    ],
    form: ["Even", { next: { next: ["number/subtract", X, 1] } }],
    boolean: true,
  },
  {
    name: "relation call with a schema",
    form: ["small", ["func/partial", "number/lessThan", X]],
    boolean: true,
  },
  {
    name: "relation call with a pattern",
    form: ["link", ["schema/anyOf", X, 9], "?_"],
    boolean: true,
  },
  // Existential rules: an unknown is a value, and exists is a goal.
  {
    name: "unknown",
    form: ["some", "?m", ["link", X, "?m"]],
  },
  {
    name: "unknown in a record",
    form: {
      of: X,
      who: ["some", "?m", ["and", ["link", X, "?m"], ["small", "?m"]]],
    },
  },
  {
    name: "unknown tested",
    form: ["value/unknown?", ["some", "?m", ["link", X, "?m"]]],
    boolean: true,
  },
  {
    name: "exists",
    form: ["exists", ["?y"], ["link", X, "?y"]],
    boolean: true,
  },
  {
    name: "exists over a filter",
    form: [
      "exists",
      ["?y"],
      ["and", ["in", "?y", ["array/range", 0, 3]], ["=", "?y", X]],
    ],
    boolean: true,
  },
  {
    name: "proof/valid? over a certificate",
    form: [
      "proof/valid?",
      {
        constraints: [
          "array/make",
          {
            constant: ["number/subtract", 0, X],
            relation: ">=",
            sum: {},
          },
        ],
        steps: [
          "array/make",
          {
            from: ["array/make", ["array/make", 0, 1]],
            tightened: false,
          },
        ],
      },
    ],
    boolean: true,
  },
  {
    name: "recursive schema inclusion",
    setup: [
      [
        "schema",
        "Even",
        ["schema/anyOf", 0, { next: { next: "Even" } }],
        "Nat",
        ["schema/anyOf", 0, { next: "Nat" }],
      ],
    ],
    form: [
      "schema/includes?",
      ["cond", [["number/equals?", X, 1], "Even"], ["else", "Nat"]],
      "Even",
    ],
    boolean: true,
  },
];

/** What plain code gives an expression for each value of `?x`, in order. */
export type Model = readonly (readonly [x: number, value: unknown])[];

export interface Position {
  /** Places that test a goal take only expressions that are true or false. */
  readonly booleanOnly?: true;
  /** What the question returns when the expression gives what plain code gives. */
  readonly expected: (model: Model) => unknown;
  readonly name: string;
  /** The form whose value shows what the expression gave. */
  readonly question: (expression: unknown, model: Model) => unknown;
  /** Reduces the question's value to what `expected` describes. */
  readonly read?: (value: unknown) => unknown;
  /** Saves the database after the setup, and asks a reloaded copy. */
  readonly reload?: true;
  /** The forms that put the expression in place, after the prelude. */
  readonly setup?: (expression: unknown, model: Model) => readonly unknown[];
}

const ORDERED = { order: "x" };

/**
 * How a value reads inside a goal that is shown: data as it is, except a
 * list, a record, and a string that reads as a name or a variable, which go
 * inside `quote`, and an unknown as the `some` form it reads as.
 */
const displayed = (value: unknown): unknown => {
  if (typeof value === "string") {
    return value.startsWith("?") || value.includes("/")
      ? ["quote", value]
      : value;
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (isExactNumber(value)) {
    // A fraction no decimal writes reads as the division that makes it.
    const { d, n } = value as { readonly d: bigint; readonly n: bigint };
    return String(value).includes("/")
      ? ["number/divide", Number(n), Number(d)]
      : value;
  }
  if (isJson(value)) {
    return ["quote", value];
  }
  if (Array.isArray(value)) {
    return ["array/make", ...value.map(displayed)];
  }
  return Object.getPrototypeOf(value) === Object.prototype
    ? Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, displayed(item)])
      )
    : JSON.parse(JSON.stringify(value));
};

/** True for JSON data with nothing else in it, such as an unknown. */
const isJson = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.every(isJson);
  }
  if (typeof value === "object" && value !== null) {
    return (
      Object.getPrototypeOf(value) === Object.prototype &&
      Object.values(value).every(isJson)
    );
  }
  return true;
};

const rows = (model: Model) => model.map(([x, v]) => ({ v, x }));

const pairs = (model: Model) => model.map(([x, v]) => [x, v]);

const everyX = (model: Model) => model.map(([x]) => ({ x }));

/** The `?x` values of some answers, each once, in order. */
const distinctX = (value: unknown) =>
  [
    ...new Set(
      (value as readonly { readonly x: number }[]).map((row) => row.x)
    ),
  ].map((x) => ({ x }));

const OUT = ["relation", "out", ["x", "v"]];

const allOut = ["query", ["out", X, "?v"], ORDERED];

/** A rule that computes the expression in its head. */
const inHead = (expression: unknown) => [
  OUT,
  ["rule", ["out", X, expression], ["n", X]],
];

/** A rule that computes the expression in its body. */
const inBody = (expression: unknown) => [
  OUT,
  ["rule", ["out", X, "?v"], ["n", X], ["=", "?v", expression]],
];

/** A relation that holds what plain code gives, to match against. */
const expectedFacts = (model: Model) => [
  ["relation", "expected", ["x", "v"]],
  ...facts(
    "expected",
    model.map(([x, v]) => [x, literal(v)])
  ),
];

/**
 * Goals that let the solver work out `?x` for itself, by type and bounds
 * rather than from facts: a whole number from the least `n` to the
 * greatest, and none of those between that `n` lacks.
 */
const solvedFor = (model: Model): unknown[] => {
  const xs = model.map(([x]) => x as number);
  if (xs.length === 0) {
    return [
      ["schema/fits?", X, "value/integer?"],
      ["=", 0, 1],
    ];
  }
  const [least, most] = [Math.min(...xs), Math.max(...xs)];
  const lacking = Array.from(
    { length: most - least + 1 },
    (_, at) => least + at
  ).filter((x) => !xs.includes(x));
  return [
    ["schema/fits?", X, "value/integer?"],
    ["number/greaterThanOrEqualTo", X, least],
    ["number/lessThanOrEqualTo", X, most],
    ...lacking.map((x) => ["boolean/not", ["number/equals?", X, x]]),
  ];
};

export const POSITIONS: readonly Position[] = [
  {
    name: "query",
    question: (expression) => [
      "query",
      ["and", ["n", X], ["=", "?v", expression]],
      ORDERED,
    ],
    expected: rows,
  },
  {
    name: "rule head",
    setup: inHead,
    question: () => allOut,
    expected: rows,
  },
  {
    name: "rule body",
    setup: inBody,
    question: () => allOut,
    expected: rows,
  },
  {
    name: "relation argument",
    setup: (_, model) => expectedFacts(model),
    question: (expression) => [
      "query",
      ["and", ["n", X], ["expected", X, expression]],
      ORDERED,
    ],
    expected: everyX,
  },
  {
    name: "filter",
    booleanOnly: true,
    question: (expression) => ["query", ["and", ["n", X], expression], ORDERED],
    read: distinctX,
    expected: (model) => everyX(model.filter(([, v]) => v === true)),
  },
  {
    name: "under not",
    booleanOnly: true,
    question: (expression) => [
      "query",
      ["and", ["n", X], ["not", expression]],
      ORDERED,
    ],
    expected: (model) => everyX(model.filter(([, v]) => v === false)),
  },
  {
    name: "find",
    question: (expression) => ["find", ["array/make", X, expression], ["n", X]],
    expected: pairs,
  },
  {
    name: "solved for",
    question: (expression, model) => [
      "query",
      ["and", ...solvedFor(model), ["=", "?v", expression]],
      ORDERED,
    ],
    expected: rows,
  },
  {
    name: "aggregate",
    setup: (expression) => [
      ["relation", "all", ["pairs"]],
      [
        "rule",
        ["all", ["aggregate/collect", ["array/make", X, expression]]],
        ["n", X],
      ],
    ],
    question: () => ["query", ["all", "?pairs"]],
    expected: (model) => (model.length === 0 ? [] : [{ pairs: pairs(model) }]),
  },
  {
    name: "inside cond",
    setup: (expression) =>
      inHead([
        "cond",
        [["number/greaterThan", X, -1], expression],
        ["else", null],
      ]),
    question: () => allOut,
    expected: rows,
  },
  {
    name: "invariant",
    setup: (expression, model) => [
      ...expectedFacts(model),
      [
        "invariant",
        ["and", ["n", X], ["not", ["expected", X, expression]]],
        { assert: "none" },
      ],
    ],
    question: () => ["query", ["n", X], ORDERED],
    expected: everyX,
  },
  {
    name: "snapshot",
    reload: true,
    setup: inBody,
    question: () => allOut,
    expected: rows,
  },
  {
    name: "goal-directed",
    setup: inBody,
    question: (_, model) => [
      "array/make",
      ...model.map(([x]) => ["query", ["out", x, "?v"]]),
    ],
    expected: (model) => model.map(([, v]) => [{ v }]),
  },
  {
    name: "rule that invents",
    setup: (expression) => [
      ["relation", "made", ["x", "v", "id"]],
      ["rule", ["exists", ["?id"], ["made", X, expression, "?id"]], ["n", X]],
    ],
    question: () => ["query", ["made", X, "?v", "?_"], ORDERED],
    expected: rows,
  },
  {
    name: "equality rule",
    // The rule holds only when the expression gives what plain code does,
    // so a rule it breaks is refused.
    setup: (expression, model) => [
      ...expectedFacts(model),
      ["rule", ["=", expression, "?v"], ["n", X], ["expected", X, "?v"]],
    ],
    question: () => ["query", ["n", X], ORDERED],
    expected: everyX,
  },
  {
    name: "inside exists",
    setup: (_, model) => expectedFacts(model),
    question: (expression) => [
      "query",
      [
        "and",
        ["n", X],
        ["expected", X, "?v"],
        ["exists", ["?w"], ["and", ["=", "?w", expression], ["=", "?w", "?v"]]],
      ],
      ORDERED,
    ],
    read: distinctX,
    expected: everyX,
  },
  {
    name: "what some describes",
    setup: () => [["relation", "about", ["v", "id"]]],
    question: (expression) => [
      "find",
      ["array/make", X, ["some", "?id", ["about", expression, "?id"]]],
      ["n", X],
    ],
    expected: (model) =>
      model.map(([x, v]) => [
        x,
        ["some", "?id", ["about", displayed(v), "?id"]],
      ]),
  },
  {
    name: "why",
    setup: inBody,
    question: (_, model) => [
      "array/make",
      ...model.map(([x, v]) => ["why", ["out", x, literal(v)]]),
    ],
    read: (value) => (value as readonly object[]).map((item) => "fact" in item),
    expected: (model) => model.map(() => true),
  },
];

/** A cell that does not give what plain code gives, and the rule behind it. */
export interface Known {
  readonly expression: string;
  readonly position: string;
  readonly why: string;
}

/**
 * The exceptions Lion has on purpose. Each is documented, and each is
 * something a Lion programmer has to remember: keep the list short.
 */
export const KNOWN: readonly Known[] = [
  {
    expression: "aggregate of a list",
    position: "rule head",
    why: "As a whole argument of a rule head, an aggregate combines one value from each of the rule's matches, not a list.",
  },
  {
    expression: "aggregate of a list",
    position: "rule that invents",
    why: "As a whole argument of a rule head, an aggregate combines one value from each of the rule's matches, not a list, and a rule that invents values cannot aggregate.",
  },
];

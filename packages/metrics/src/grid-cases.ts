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
  { name: "record", form: { next: ["number/add", X, 1], x: X } },
  {
    name: "record with the empty key",
    form: { "": ["number/add", X, 1], x: X },
  },
  { name: "list", form: ["array/make", X, ["number/add", X, 1]] },
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
    name: "aggregate of a find",
    form: ["aggregate/count", ["find", "?y", ["link", X, "?y"]]],
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
    model.map(([x, v]) => [x, ["quote", v]])
  ),
];

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
    name: "why",
    setup: inBody,
    question: (_, model) => [
      "array/make",
      ...model.map(([x, v]) => ["why", ["out", x, ["quote", v]]]),
    ],
    read: (value) => (value as readonly unknown[]).map((item) => item !== null),
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
    expression: "recursive function",
    position: "snapshot",
    why: "A lambda that calls itself has no written form, so a snapshot cannot save a rule that holds one.",
  },
];

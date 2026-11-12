/**
 * The programs the benchmark times: plain code, recursive rules, aggregates,
 * negation, graph algorithms, and questions asked from expressions. Each is
 * large enough to take milliseconds, so a change in speed shows.
 */
import { Effect } from "effect";
import { evaluate, type Lion } from "./lion.ts";

export interface Benchmark {
  /** False to time full evaluation instead of a goal-directed query. */
  readonly goalDirected?: false;
  readonly name: string;
  readonly program: unknown;
}

const FACTS = 20_000;
const CUSTOMERS = 500;

const range = (length: number) => Array.from({ length }, (_, index) => index);

const orders = range(FACTS).map((id) => [
  "order",
  id,
  `c${id % CUSTOMERS}`,
  (id * 7) % 100,
]);

const ORDERS = [
  ["relation", "order", ["id", "customer", "amount"]],
  ["fact", ...orders],
];

/** A chain of `length` edges, and the paths along it by a recursive rule. */
const chain = (length: number) => [
  ["relation", "edge", ["from", "to"]],
  ["relation", "path", ["from", "to"]],
  [
    "rule",
    ["edge", "?n", ["number/add", "?n", 1]],
    ["in", "?n", ["array/range", 0, length]],
  ],
  ["rule", ["path", "?x", "?y"], ["edge", "?x", "?y"]],
  ["rule", ["path", "?x", "?z"], ["path", "?x", "?y"], ["edge", "?y", "?z"]],
];

/** A fixed, scattered road network: the same roads on every run. */
const roads = () => {
  let seed = 7;
  const next = (below: number) => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return Math.floor((seed / 2_147_483_648) * below);
  };
  return range(3000).map(() => ["road", next(1000), next(1000), 1 + next(9)]);
};

const ROADS = [
  ["relation", "road", ["from", "to", "km"]],
  ["fact", ...roads()],
];

const CUSTOMER_FACTS = [
  ["relation", "customer", ["name"]],
  ["fact", ...range(600).map((index) => ["customer", `c${index}`])],
];

const VIPS = [
  ["relation", "vip", ["customer"]],
  ["fact", ["vip", "c1"], ["vip", "c2"]],
];

const FIB = [
  "lambda",
  ["n"],
  [
    "cond",
    [["number/lessThan", "n", 2], "n"],
    [
      "else",
      [
        "number/add",
        ["fib", ["number/subtract", "n", 1]],
        ["fib", ["number/subtract", "n", 2]],
      ],
    ],
  ],
];

export const BENCHMARKS: readonly Benchmark[] = [
  {
    name: "plain: fib(17) through a recursive lambda",
    program: ["begin", ["define", "fib", FIB], ["fib", 17]],
  },
  {
    name: "plain: array/map and array/reduce over 20,000 items",
    program: [
      "array/reduce",
      [
        "array/map",
        ["array/range", 0, FACTS],
        ["lambda", ["x"], ["number/multiply", "x", 2]],
      ],
      0,
      ["lambda", ["a", "x"], ["number/add", "a", "x"]],
    ],
  },
  {
    name: "rules: goal-directed path on a 3,000 chain",
    program: ["begin", ...chain(3000), ["query", ["path", 2997, "?to"]]],
  },
  {
    name: "rules: every path on a 150 chain",
    goalDirected: false,
    program: ["begin", ...chain(150), ["query", ["path", "?x", "?y"]]],
  },
  {
    name: "aggregates: sum and count 20,000 facts into 500 groups",
    program: [
      "begin",
      ...ORDERS,
      ["relation", "spend", ["customer", "total", "orders"]],
      [
        "rule",
        [
          "spend",
          "?c",
          ["aggregate/sum", "?amount"],
          ["aggregate/count", "?id"],
        ],
        ["order", "?id", "?c", "?amount"],
      ],
      ["query", ["spend", "?c", "?t", "?n"]],
    ],
  },
  {
    name: "waiting: filter and compute over 20,000 facts",
    program: [
      "begin",
      ...ORDERS,
      ["relation", "big", ["id", "cents"]],
      [
        "rule",
        ["big", "?id", ["number/multiply", "?amount", 100]],
        ["order", "?id", "?_", "?amount"],
        ["number/greaterThan", "?amount", 50],
      ],
      ["query", ["big", "?id", "?cents"]],
    ],
  },
  {
    name: "aggregates: shortest distances by lattice recursion",
    program: [
      "begin",
      ...ROADS,
      ["relation", "dist", ["to", "km"]],
      [
        "rule",
        ["dist", "?to", ["aggregate/min", "?km"]],
        ["road", 0, "?to", "?km"],
      ],
      [
        "rule",
        ["dist", "?to", ["aggregate/min", ["number/add", "?d", "?km"]]],
        ["dist", "?via", "?d"],
        ["road", "?via", "?to", "?km"],
      ],
      ["query", ["dist", "?to", "?km"]],
    ],
  },
  {
    name: "graph: shortest paths over 3,000 roads",
    program: [
      "begin",
      ...ROADS,
      ["query", ["graph/shortestPath", "road", 0, "?to", "?km", "?_"]],
    ],
  },
  {
    name: "graph: components of 3,000 roads",
    program: [
      "begin",
      ...ROADS,
      ["query", ["graph/components", "road", "?n", "?c"]],
    ],
  },
  {
    name: "negation: over 20,000 facts",
    program: [
      "begin",
      ...ORDERS,
      ["relation", "vip", ["customer"]],
      ["fact", ...range(50).map((index) => ["vip", `c${index}`])],
      ["query", ["and", ["order", "?id", "?c", "?_"], ["not", ["vip", "?c"]]]],
    ],
  },
  {
    name: "asking: one find over 20,000 facts",
    program: [
      "begin",
      ...ORDERS,
      ["aggregate/sum", ["find", "?a", ["order", "?_", "?_", "?a"]]],
    ],
  },
  {
    name: "asking: a find in a rule head for each of 600 customers",
    program: [
      "begin",
      ...ORDERS,
      ...CUSTOMER_FACTS,
      ["relation", "out", ["customer", "orders"]],
      [
        "rule",
        [
          "out",
          "?c",
          ["aggregate/count", ["find", "?id", ["order", "?id", "?c", "?_"]]],
        ],
        ["customer", "?c"],
      ],
      ["query", ["out", "?c", "?n"]],
    ],
  },
  {
    name: "asking: a goal as a value for each of 20,000 rows",
    program: [
      "begin",
      ...ORDERS,
      ...VIPS,
      [
        "query",
        ["and", ["order", "?id", "?c", "?_"], ["=", "?v", ["vip", "?c"]]],
      ],
    ],
  },
  {
    name: "asking: cond on a goal for each of 20,000 rows",
    program: [
      "begin",
      ...ORDERS,
      ...VIPS,
      [
        "query",
        [
          "and",
          ["order", "?id", "?c", "?_"],
          ["=", "?v", ["cond", [["vip", "?c"], "gold"], ["else", "plain"]]],
        ],
      ],
    ],
  },
  {
    name: "asking: not over a join for each of 600 customers",
    program: [
      "begin",
      ...ORDERS,
      ...CUSTOMER_FACTS,
      [
        "query",
        [
          "and",
          ["customer", "?c"],
          [
            "not",
            [
              "and",
              ["order", "?_", "?c", "?a"],
              ["number/greaterThan", "?a", 98],
            ],
          ],
        ],
      ],
    ],
  },
  {
    name: "asking: a relation as a predicate over 20,000 items",
    program: [
      "begin",
      ...ORDERS,
      ...VIPS,
      [
        "array/length",
        ["array/map", ["find", "?c", ["order", "?_", "?c", "?_"]], "vip"],
      ],
    ],
  },
];

/** Each benchmark runs this many times, and the best time counts. */
const RUNS = 3;

const once = (lion: Lion, { goalDirected, program }: Benchmark) =>
  Effect.gen(function* () {
    const started = performance.now();
    const outcome = yield* evaluate(
      lion,
      program,
      goalDirected === false ? { goalDirected } : {}
    );
    return outcome.ok ? performance.now() - started : undefined;
  });

/**
 * The best time of a benchmark in milliseconds, or undefined when the
 * program fails on this version.
 */
export const timeOf = (
  lion: Lion,
  benchmark: Benchmark
): Effect.Effect<number | undefined> =>
  Effect.gen(function* () {
    let best: number | undefined;
    for (let run = 0; run < RUNS; run += 1) {
      const time = yield* once(lion, benchmark);
      if (time === undefined) {
        return undefined;
      }
      best = Math.min(best ?? time, time);
    }
    return best;
  });

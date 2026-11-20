/**
 * The workloads `bun run scale` times at growing sizes: loading facts,
 * asking them, rules over them, and changing them. A benchmark says how
 * fast one size is; a workload run at several sizes says how the time and
 * the memory grow, which is what shows a step that reads everything again
 * for each row.
 */

export interface Workload {
  /**
   * What the last timed program gives, counted without Lion, for a workload
   * whose answer is a number of rows: it says the workload asks what its
   * name says.
   */
  readonly gives?: (n: number) => number;
  /** False to time full evaluation instead of goal-directed queries. */
  readonly goalDirected?: false;
  readonly name: string;
  /**
   * True when some timed programs are meant to fail, such as a fact an
   * invariant refuses: a failure then does not end the run.
   */
  readonly refuses?: true;
  /** Sets the database up for `n` facts. It is not timed. */
  readonly setup: (n: number) => unknown;
  /** The programs that are timed, one after another, in that database. */
  readonly timed: (n: number) => readonly unknown[];
}

const range = (length: number) => Array.from({ length }, (_, index) => index);

const chunks = <A>(items: readonly A[], by: number): A[][] =>
  range(Math.ceil(items.length / by)).map((index) =>
    items.slice(index * by, (index + 1) * by)
  );

/**
 * Numbers below `below` that look scattered and are the same on every run:
 * the minimal standard generator, whose products stay exact in a number.
 */
const scattered = (seed: number) => {
  let state = seed;
  return (below: number) => {
    state = (state * 48_271) % 2_147_483_647;
    return Math.floor((state / 2_147_483_647) * below);
  };
};

/** How many customers `n` orders are spread over: 40 orders each. */
const customersOf = (n: number) => Math.max(10, Math.floor(n / 40));

const orders = (n: number) =>
  range(n).map((id) => [
    "order",
    id,
    `c${id % customersOf(n)}`,
    (id * 7) % 100,
  ]);

const ORDER = ["relation", "order", ["id", "customer", "amount"]];
const KEYED_ORDER = [
  "relation",
  "order",
  ["id", "customer", "amount"],
  { key: "id" },
];

/** A `fact` form for every `by` of some facts. */
const facts = (rows: readonly unknown[], by: number, form = "fact") =>
  chunks(rows, by).map((some) => [form, ...some]);

const loaded = (n: number) => ["begin", ORDER, ["fact", ...orders(n)], true];

const customers = (n: number) => [
  ["relation", "customer", ["name", "tier"]],
  [
    "fact",
    ...range(customersOf(n)).map((index) => [
      "customer",
      `c${index}`,
      index % 3,
    ]),
  ],
];

/** The orders above 50, each with its customer's tier. */
const BIG = [
  ["relation", "big", ["id", "tier"]],
  [
    "rule",
    ["big", "?id", "?tier"],
    ["order", "?id", "?c", "?a"],
    ["number/greaterThan", "?a", 50],
    ["customer", "?c", "?tier"],
  ],
];

const SPEND = [
  ["relation", "spend", ["customer", "total"]],
  [
    "rule",
    ["spend", "?c", ["aggregate/sum", "?a"]],
    ["order", "?_", "?c", "?a"],
  ],
];

/** How many orders each customer has, zero among them. */
const ACTIVITY = [
  ["relation", "activity", ["customer", "orders"]],
  [
    "rule",
    [
      "activity",
      "?c",
      ["aggregate/count", ["find", "?id", ["order", "?id", "?c", "?_"]]],
    ],
    ["customer", "?c", "?_"],
  ],
];

/** A shipment nobody has named yet, for every order. */
const SHIPMENT = [
  ["relation", "shipment", ["order", "shipment"]],
  [
    "rule",
    ["exists", ["?s"], ["shipment", "?id", "?s"]],
    ["order", "?id", "?_", "?_"],
  ],
];

/**
 * `n` people in twin pairs, each with a mother a rule invents, which a key
 * on the child makes one for twins.
 */
const TWINS = (n: number) => [
  ["relation", "person", ["name"]],
  ["relation", "twin", ["a", "b"]],
  ["relation", "mother", ["child", "mother"], { key: "child" }],
  ["fact", ...range(n).map((index) => ["person", `p${index}`])],
  [
    "fact",
    ...range(Math.floor(n / 2)).map((index) => [
      "twin",
      `p${2 * index}`,
      `p${2 * index + 1}`,
    ]),
  ],
  ["rule", ["exists", ["?m"], ["mother", "?c", "?m"]], ["person", "?c"]],
  [
    "rule",
    ["mother", "?b", "?m"],
    ["twin", "?a", "?b"],
    ["mother", "?a", "?m"],
  ],
  [
    "rule",
    ["mother", "?a", "?m"],
    ["twin", "?a", "?b"],
    ["mother", "?b", "?m"],
  ],
];

/** How many of the twin pairs of `TWINS(n)` a workload uses: up to 20. */
const twinsOf = (n: number) => Math.max(1, Math.min(20, Math.floor(n / 2)));

/** `n` roads between scattered pairs of n/3 towns, each a few km long. */
const ROADS = (n: number) => {
  const next = scattered(11);
  const towns = Math.max(3, Math.floor(n / 3));
  return [
    ["relation", "road", ["from", "to", "km"]],
    [
      "fact",
      ...range(n).map(() => ["road", next(towns), next(towns), 1 + next(9)]),
    ],
  ];
};

/** The shortest distance from town 0 to every town, by recursion. */
const DISTANCE = [
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
];

/** Customers with no order above 98. */
const QUIET = [
  ["relation", "quiet", ["customer"]],
  [
    "rule",
    ["quiet", "?c"],
    ["customer", "?c", "?_"],
    [
      "not",
      ["and", ["order", "?_", "?c", "?a"], ["number/greaterThan", "?a", 98]],
    ],
  ],
];

const EDGE = ["relation", "edge", ["from", "to"]];

const PATH = [
  ["relation", "path", ["from", "to"]],
  ["rule", ["path", "?x", "?y"], ["edge", "?x", "?y"]],
  ["rule", ["path", "?x", "?z"], ["path", "?x", "?y"], ["edge", "?y", "?z"]],
];

/** `n` edges between scattered pairs of `nodes` nodes. */
const scatteredEdges = (n: number, nodes: number) => {
  const next = scattered(7);
  return range(n).map(() => ["edge", next(nodes), next(nodes)]);
};

/** `n` nodes in chains of ten: nine edges in each. */
const chainEdges = (n: number) =>
  range(n)
    .filter((index) => index % 10 !== 9)
    .map((index) => ["edge", index, index + 1]);

const ORDER_SCHEMA = [
  "schema",
  "Order",
  {
    id: "value/integer?",
    customer: "value/string?",
    amount: "value/number?",
  },
];

const count = (goal: unknown) => ["aggregate/count", ["find", true, goal]];

const size = (query: unknown) => ["array/length", query];

/** How many orders are above 50. */
const bigOrders = (n: number) =>
  range(n).filter((id) => (id * 7) % 100 > 50).length;

/** Adds one order and asks `question` again, `times` times. */
const changing = (
  n: number,
  times: number,
  question: (id: number) => unknown
) =>
  range(times).map((index) => [
    "begin",
    ["fact", ["order", n + index, "c1", 99]],
    question(n + index),
  ]);

/** Removes an order and asks `question` again, `times` times. */
const retracting = (n: number, times: number, question: unknown) =>
  range(times).map((index) => {
    const id = 1 + index * customersOf(n);
    return [
      "begin",
      ["retract", ["order", id, "c1", (id * 7) % 100]],
      question,
    ];
  });

export const WORKLOADS: readonly Workload[] = [
  {
    name: "load: n facts in one form",
    setup: () => ["begin", ORDER],
    timed: (n) => [["begin", ["fact", ...orders(n)], true]],
  },
  {
    name: "load: n facts, one per form",
    setup: () => ["begin", ORDER],
    timed: (n) => [["begin", ...facts(orders(n), 1), true]],
  },
  {
    name: "load: n facts, one per form, rows fit a schema",
    setup: () => [
      "begin",
      ORDER_SCHEMA,
      ["relation", "order", ["id", "customer", "amount"], { schema: "Order" }],
    ],
    timed: (n) => [["begin", ...facts(orders(n), 1), true]],
  },
  {
    name: "load: n facts, 100 per form, an invariant on other facts",
    setup: () => [
      "begin",
      ORDER,
      ["relation", "flag", ["x"]],
      ["invariant", ["flag", "bad"], { assert: "none" }],
    ],
    timed: (n) => [["begin", ...facts(orders(n), 100), true]],
  },
  {
    name: "load: n facts, 100 per form, an invariant on them",
    setup: () => [
      "begin",
      ORDER,
      [
        "invariant",
        ["and", ["order", "?id", "?c", "?a"], ["number/lessThan", "?a", 0]],
        { assert: "none" },
      ],
    ],
    timed: (n) => [["begin", ...facts(orders(n), 100), true]],
  },
  {
    name: "load: n facts, 100 per form, an invariant over a rule",
    setup: (n) => [
      "begin",
      ORDER,
      ...customers(n),
      ...BIG,
      ["invariant", ["big", "?id", 7], { assert: "none" }],
    ],
    timed: (n) => [["begin", ...facts(orders(n), 100), true]],
  },
  {
    name: "load: n facts, 100 per form, keyed",
    setup: () => ["begin", KEYED_ORDER],
    timed: (n) => [["begin", ...facts(orders(n), 100), true]],
  },
  {
    name: "query: every row of n",
    gives: (n) => n,
    setup: loaded,
    timed: () => [size(["query", ["order", "?id", "?c", "?a"]])],
  },
  {
    name: "query: 1,000 lookups by id in n",
    setup: loaded,
    timed: (n) => [
      [
        "begin",
        ...range(1000).map((index) => [
          "query",
          ["order", (index * 7919) % n, "?c", "?a"],
        ]),
        true,
      ],
    ],
  },
  {
    name: "rule: filter n orders and join them to n/40 customers",
    gives: bigOrders,
    setup: (n) => ["begin", ...loaded(n).slice(1), ...customers(n), ...BIG],
    timed: () => [size(["query", ["big", "?id", "?t"]])],
  },
  {
    name: "rule: sum n facts into n/40 groups",
    gives: (n) => Math.min(n, customersOf(n)),
    setup: (n) => ["begin", ...loaded(n).slice(1), ...SPEND],
    timed: () => [size(["query", ["spend", "?c", "?t"]])],
  },
  {
    name: "rule: negation over n facts",
    gives: (n) =>
      range(n).filter(
        (id) => id % customersOf(n) >= Math.ceil(customersOf(n) / 10)
      ).length,
    setup: (n) => [
      "begin",
      ...loaded(n).slice(1),
      ["relation", "vip", ["customer"]],
      [
        "fact",
        ...range(Math.ceil(customersOf(n) / 10)).map((index) => [
          "vip",
          `c${index}`,
        ]),
      ],
    ],
    timed: () => [
      count(["and", ["order", "?id", "?c", "?_"], ["not", ["vip", "?c"]]]),
    ],
  },
  {
    name: "recursion: reach from one node, n edges over n/2 nodes",
    setup: (n) => [
      "begin",
      EDGE,
      ["fact", ...scatteredEdges(n, n / 2)],
      ...PATH,
      true,
    ],
    timed: () => [size(["query", ["path", 1, "?to"]])],
  },
  {
    name: "recursion: every path, n nodes in chains of 10",
    gives: (n) => 45 * Math.floor(n / 10) + ((n % 10) * ((n % 10) + 1)) / 2,
    goalDirected: false,
    setup: (n) => ["begin", EDGE, ["fact", ...chainEdges(n)], ...PATH, true],
    timed: () => [size(["query", ["path", "?x", "?y"]])],
  },
  {
    name: "join: triangles among n edges over n/4 nodes",
    setup: (n) => ["begin", EDGE, ["fact", ...scatteredEdges(n, n / 4)], true],
    timed: () => [
      count([
        "and",
        ["edge", "?a", "?b"],
        ["edge", "?b", "?c"],
        ["edge", "?c", "?a"],
      ]),
    ],
  },
  {
    name: "change: add a fact, ask a rule about it, 20 times",
    setup: (n) => [
      "begin",
      ...loaded(n).slice(1),
      ...customers(n),
      ...BIG,
      size(["query", ["big", "?id", "?t"]]),
    ],
    timed: (n) => changing(n, 20, (id) => ["query", ["big", id, "?t"]]),
  },
  {
    name: "change: add a fact, ask every row of a rule, 20 times",
    gives: (n) => bigOrders(n) + 20,
    setup: (n) => [
      "begin",
      ...loaded(n).slice(1),
      ...customers(n),
      ...BIG,
      size(["query", ["big", "?id", "?t"]]),
    ],
    timed: (n) => changing(n, 20, () => size(["query", ["big", "?id", "?t"]])),
  },
  {
    name: "change: add a fact, ask one group's total, 20 times",
    setup: (n) => [
      "begin",
      ...loaded(n).slice(1),
      ...SPEND,
      ["query", ["spend", "c1", "?t"]],
    ],
    timed: (n) => changing(n, 20, () => ["query", ["spend", "c1", "?t"]]),
  },
  {
    name: "change: add a fact, ask every group's total, 20 times",
    gives: (n) => Math.min(n, customersOf(n)),
    setup: (n) => [
      "begin",
      ...loaded(n).slice(1),
      ...SPEND,
      size(["query", ["spend", "?c", "?t"]]),
    ],
    timed: (n) => changing(n, 20, () => size(["query", ["spend", "?c", "?t"]])),
  },
  {
    name: "change: add a fact, ask a rule with not, 20 times",
    setup: (n) => [
      "begin",
      ...loaded(n).slice(1),
      ...customers(n),
      ...QUIET,
      size(["query", ["quiet", "?c"]]),
    ],
    timed: (n) => changing(n, 20, () => size(["query", ["quiet", "?c"]])),
  },
  {
    name: "change: retract a fact, ask every row of a rule, 20 times",
    setup: (n) => [
      "begin",
      ...loaded(n).slice(1),
      ...customers(n),
      ...BIG,
      size(["query", ["big", "?id", "?t"]]),
    ],
    timed: (n) => retracting(n, 20, size(["query", ["big", "?id", "?t"]])),
  },
  {
    name: "change: retract n facts, 100 per form",
    setup: loaded,
    timed: (n) => [["begin", ...facts(orders(n), 100, "retract"), true]],
  },
  {
    name: "change: retract n facts, 100 per form, rows fit a schema",
    setup: (n) => [
      "begin",
      ORDER_SCHEMA,
      ["relation", "order", ["id", "customer", "amount"], { schema: "Order" }],
      ["fact", ...orders(n)],
      true,
    ],
    timed: (n) => [["begin", ...facts(orders(n), 100, "retract"), true]],
  },
  {
    name: "change: replace n rows of a keyed relation, 100 per form",
    setup: (n) => ["begin", KEYED_ORDER, ["fact", ...orders(n)], true],
    timed: (n) => [
      [
        "begin",
        ...facts(
          orders(n).map(([name, id, customer]) => [name, id, customer, -1]),
          100
        ),
        true,
      ],
    ],
  },
  {
    name: "change: add a fact, ask a count that can be zero, 20 times",
    gives: (n) => customersOf(n),
    setup: (n) => [
      "begin",
      ...loaded(n).slice(1),
      ...customers(n),
      ...ACTIVITY,
      size(["query", ["activity", "?c", "?k"]]),
    ],
    timed: (n) =>
      changing(n, 20, () => size(["query", ["activity", "?c", "?k"]])),
  },
  {
    name: "change: add a road, ask every shortest distance, 20 times",
    setup: (n) => [
      "begin",
      ...ROADS(n),
      ...DISTANCE,
      size(["query", ["dist", "?to", "?km"]]),
    ],
    timed: (n) =>
      range(20).map((index) => [
        "begin",
        ["fact", ["road", index, n + index, 1]],
        size(["query", ["dist", "?to", "?km"]]),
      ]),
  },
  {
    name: "change: add a fact, ask a rule that invents, 20 times",
    gives: (n) => n + 20,
    setup: (n) => [
      "begin",
      ...loaded(n).slice(1),
      ...SHIPMENT,
      size(["query", ["shipment", "?id", "?s"]]),
    ],
    timed: (n) =>
      changing(n, 20, () => size(["query", ["shipment", "?id", "?s"]])),
  },
  {
    // Mothers that a key makes one: following a change derives again only
    // the twins it touches, not every mother.
    name: "change: add a twin, ask the mother a key gave them, 20 times",
    gives: () => 1,
    setup: (n) => [
      "begin",
      ...TWINS(n),
      size(["query", ["mother", "?c", "?m"]]),
    ],
    timed: () =>
      range(20).map((index) => [
        "begin",
        [
          "fact",
          ["person", `new${index}`],
          ["twin", `p${2 * index}`, `new${index}`],
        ],
        size(["query", ["mother", `new${index}`, "?m"]]),
      ]),
  },
  {
    // A twin of two registered mothers is refused, since the key would give
    // a child both: what was derived before is kept, so the question after
    // it derives no mother again.
    name: "change: a twin a key and an equality rule refuse, ask a mother a key gave, 20 times",
    gives: () => 1,
    refuses: true,
    setup: (n) => [
      "begin",
      ...TWINS(n),
      ["relation", "registered", ["child", "mother"]],
      [
        "rule",
        ["=", "?m", "?r"],
        ["mother", "?c", "?m"],
        ["registered", "?c", "?r"],
      ],
      [
        "fact",
        ...range(20).flatMap((index) => [
          ["person", `s${index}`],
          ["registered", `p${2 * (index % twinsOf(n))}`, "eve"],
          ["registered", `s${index}`, "fay"],
        ]),
      ],
      size(["query", ["mother", "?c", "?m"]]),
    ],
    timed: (n) =>
      range(20).flatMap((index) => {
        const twin = index % twinsOf(n);
        return [
          ["fact", ["twin", `p${2 * twin}`, `s${index}`]],
          size(["query", ["mother", `p${2 * twin + 1}`, "?m"]]),
        ];
      }),
  },
  {
    // A twin of two mothers facts hold breaks the key, and no invariant
    // reads it, so the change is kept: a question about every mother fails,
    // at once since the rows are kept, and taking the twin back is followed
    // through them.
    name: "change: a twin a key cannot make one is kept, ask every mother, take it back, 20 times",
    gives: () => 1,
    refuses: true,
    setup: (n) => [
      "begin",
      ...TWINS(n),
      ["relation", "tall", ["who"]],
      [
        "fact",
        ...range(20).flatMap((index) => [
          ["person", `s${index}`],
          ["tall", ["some", "?m", ["mother", `s${index}`, "?m"]]],
          [
            "tall",
            ["some", "?m", ["mother", `p${2 * (index % twinsOf(n))}`, "?m"]],
          ],
        ]),
      ],
      size(["query", ["mother", "?c", "?m"]]),
    ],
    timed: (n) => [
      ...range(20).flatMap((index) => {
        const twin = ["twin", `p${2 * (index % twinsOf(n))}`, `s${index}`];
        return [
          ["fact", twin],
          size(["query", ["mother", "?c", "?m"]]),
          ["retract", twin],
        ];
      }),
      size(["query", ["mother", "p1", "?m"]]),
    ],
  },
  {
    name: "change: add a rule elsewhere, ask every row of a rule, 20 times",
    gives: bigOrders,
    setup: (n) => [
      "begin",
      ...loaded(n).slice(1),
      ...customers(n),
      ...BIG,
      ["relation", "flag", ["x"]],
      ["relation", "seen", ["x"]],
      ["fact", ["flag", 0]],
      size(["query", ["big", "?id", "?t"]]),
    ],
    timed: () =>
      range(20).map((index) => [
        "begin",
        ["rule", ["seen", index], ["flag", 0]],
        size(["query", ["big", "?id", "?t"]]),
      ]),
  },
  {
    name: "change: a fact an invariant refuses, ask every row of a rule, 20 times",
    gives: bigOrders,
    refuses: true,
    setup: (n) => [
      "begin",
      ...loaded(n).slice(1),
      ...customers(n),
      ...BIG,
      [
        "invariant",
        ["and", ["order", "?id", "?c", "?a"], ["number/lessThan", "?a", 0]],
        { assert: "none" },
      ],
      size(["query", ["big", "?id", "?t"]]),
    ],
    timed: (n) =>
      range(20).flatMap((index) => [
        ["fact", ["order", n + index, "c1", -1]],
        size(["query", ["big", "?id", "?t"]]),
      ]),
  },
  {
    name: "change: add an edge, ask what one node reaches, 20 times",
    setup: (n) => [
      "begin",
      EDGE,
      ["fact", ...scatteredEdges(n, n / 2)],
      ...PATH,
      size(["query", ["path", 1, "?to"]]),
    ],
    timed: (n) =>
      range(20).map((index) => [
        "begin",
        ["fact", ["edge", n + index, n + index + 1]],
        size(["query", ["path", 1, "?to"]]),
      ]),
  },
  {
    name: "why: one derived row among n",
    setup: (n) => ["begin", ...loaded(n).slice(1), ...customers(n), ...BIG],
    timed: () => [["why", ["big", 8, 2]]],
  },
  {
    name: "snapshot: write n facts",
    setup: loaded,
    timed: () => [["begin", ["snapshot"], true]],
  },
];

/**
 * How fast a time grows with the size, as the power of the size it follows
 * between two measurements: 1 for a time that grows as the size does, 2 for
 * one that grows as its square. Undefined when either time is too short to
 * tell.
 */
export const growth = (
  [smaller, shorter]: readonly [size: number, time: number],
  [larger, longer]: readonly [size: number, time: number],
  shortest = 0
): number | undefined =>
  shorter > 0 && longer > shortest && larger > smaller
    ? Math.log(longer / shorter) / Math.log(larger / smaller)
    : undefined;

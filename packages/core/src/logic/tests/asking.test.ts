/**
 * Asking: a goal is a question, and any expression can ask it. `find` gives
 * what a goal matches, a goal with a relation in it is true or false as a
 * value, and a question has variables of its own. Each is checked against a
 * model that reads the facts as plain sets.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect } from "effect";
import { run } from "@/evaluation/evaluate";
import { LogicDatabase } from "@/logic/database";
import { loadDatabase } from "@/logic/snapshot";
import { stdlib } from "@/modules";
import { element, oneOf } from "./programs";
import {
  DOMAIN,
  everyone,
  linksOf,
  member,
  reach,
  setup,
  subset,
  type World,
  world,
} from "./worlds";

type Form = unknown;

const OPTIONS = { timeout: 120_000, arbitrary: { runs: 200 } };

const MODES = [true, false];

/**
 * A relation for what a rule derives about each member, and `step`, which
 * always has rows but none whose two columns are equal.
 */
const EXTRA = [
  ["relation", "out", ["x", "v"]],
  ["relation", "step", ["from", "to"]],
  ["fact", ...DOMAIN.map((n) => ["step", n, n + 1])],
];

/** Runs forms after the world's setup. */
const evaluate = (facts: World, forms: readonly Form[], goalDirected = true) =>
  run(["begin", ...setup(facts), ...EXTRA, ...forms], stdlib, {
    database: new LogicDatabase({ goalDirected }),
  });

const numeric = (a: number, b: number) => a - b;

const targets = (facts: World, from: number) =>
  linksOf(facts)
    .filter(([source]) => source === from)
    .map(([, target]) => target)
    .sort(numeric);

/**
 * A goal about a subject, which is a variable or a value, with what the goal
 * says as a formula over the facts.
 */
interface Case {
  readonly goal: (subject: Form) => Form;
  readonly holds: (facts: World, x: number) => boolean;
}

const fixed = (
  goal: Case["goal"],
  holds: Case["holds"]
): Arbitrary.Arbitrary<Case> => Arbitrary.Constant({ goal, holds });

const leaf: Arbitrary.Arbitrary<Case> = oneOf<Case>(
  fixed(
    (s) => ["p", s],
    ({ p }, x) => p.includes(x)
  ),
  fixed(
    (s) => ["q", s],
    ({ q }, x) => q.includes(x)
  ),
  fixed(
    (s) => ["big", s],
    ({ p }, x) => p.includes(x) && x > 2
  ),
  fixed(
    (s) => ["link", s, "?_"],
    ({ links }, x) => links.some(([from]) => from === x)
  ),
  fixed(
    (s) => ["path", "?_", s],
    ({ links }, x) => links.some(([, to]) => to === x)
  ),
  // Each `?_` is a variable of its own, so any row of `step` will do.
  fixed(
    () => ["step", "?_", "?_"],
    () => true
  ),
  fixed(
    (s) => ["and", ["q", s], ["step", "?_", "?_"]],
    ({ q }, x) => q.includes(x)
  ),
  Arbitrary.map(
    member,
    (to): Case => ({
      goal: (s) => ["path", s, to],
      holds: (facts, x) => reach(facts, x).includes(to),
    })
  ),
  Arbitrary.map(
    member,
    (k): Case => ({
      goal: (s) => ["number/greaterThan", s, k],
      holds: (_, x) => x > k,
    })
  ),
  Arbitrary.map(
    subset,
    (items): Case => ({
      goal: (s) => ["in", s, ["quote", items]],
      holds: (_, x) => items.includes(x),
    })
  )
);

/**
 * A goal that joins its subject to a variable of its own, and says something
 * about that: the subject links to it, it links to the subject, or the
 * subject reaches it.
 */
const join = (inner: Arbitrary.Arbitrary<Case>, own: string) =>
  Arbitrary.map(
    Arbitrary.all([inner, element(["to", "from", "reaches"] as const)]),
    ([sub, kind]): Case => {
      if (kind === "to") {
        return {
          goal: (s) => ["and", ["link", s, own], sub.goal(own)],
          holds: (facts, x) =>
            targets(facts, x).some((to) => sub.holds(facts, to)),
        };
      }
      if (kind === "from") {
        return {
          goal: (s) => ["and", ["link", own, s], sub.goal(own)],
          holds: (facts, x) =>
            facts.links.some(
              ([from, to]) => to === x && sub.holds(facts, from)
            ),
        };
      }
      return {
        goal: (s) => ["and", ["path", s, own], sub.goal(own)],
        holds: (facts, x) => reach(facts, x).some((to) => sub.holds(facts, to)),
      };
    }
  );

/**
 * A goal built from relations, filters, joins on variables of its own, and
 * `and`, `or`, and `not`. Every join gets a name of its own from `path`.
 */
const formula = (depth: number, path = ""): Arbitrary.Arbitrary<Case> => {
  if (depth === 0) {
    return leaf;
  }
  const left = formula(depth - 1, `${path}l`);
  const pair = Arbitrary.all([left, formula(depth - 1, `${path}r`)]);
  return oneOf<Case>(
    leaf,
    join(left, `?v${path}`),
    join(left, `?v${path}`),
    Arbitrary.map(pair, ([a, b]) => ({
      goal: (s) => ["and", a.goal(s), b.goal(s)],
      holds: (facts, x) => a.holds(facts, x) && b.holds(facts, x),
    })),
    Arbitrary.map(pair, ([a, b]) => ({
      goal: (s) => ["or", a.goal(s), b.goal(s)],
      holds: (facts, x) => a.holds(facts, x) || b.holds(facts, x),
    })),
    Arbitrary.map(left, (a) => ({
      goal: (s) => ["not", a.goal(s)],
      holds: (facts, x) => !a.holds(facts, x),
    }))
  );
};

describe("a goal with a relation in it", () => {
  it.effect.prop(
    "is true as a value exactly when it has a match, and not turns it around",
    { world, formula: formula(3) },
    ({ formula: { goal, holds }, world: facts }) =>
      Effect.gen(function* () {
        for (const mode of MODES) {
          const [value, kept, dropped] = (yield* evaluate(
            facts,
            [
              [
                "array/make",
                [
                  "query",
                  ["and", everyone, ["=", "?t", goal("?x")]],
                  { order: "x" },
                ],
                [
                  "query",
                  ["and", everyone, ["=", true, goal("?x")]],
                  { order: "x" },
                ],
                [
                  "query",
                  ["and", everyone, ["not", goal("?x")]],
                  { order: "x" },
                ],
              ],
            ],
            mode
          )) as unknown[];
          const yes = DOMAIN.filter((x) => holds(facts, x));
          expect(value).toEqual(DOMAIN.map((x) => ({ x, t: holds(facts, x) })));
          expect(kept).toEqual(yes.map((x) => ({ x })));
          expect(dropped).toEqual(
            DOMAIN.filter((x) => !yes.includes(x)).map((x) => ({ x }))
          );
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "is true or false wherever plain code needs a value",
    { world, formula: formula(3), x: member },
    ({ formula: { goal, holds }, world: facts, x }) =>
      Effect.gen(function* () {
        const question = goal(x);
        const yes = holds(facts, x);
        for (const mode of MODES) {
          expect(
            yield* evaluate(
              facts,
              [
                {
                  tested: ["cond", [question, "yes"], ["else", "no"]],
                  given: ["boolean/not", question],
                  compared: ["=", question, true],
                  held: { answer: question },
                  matched: [
                    "match",
                    question,
                    [
                      ["lambda", ["v"], "v"],
                      ["lambda", ["v"], "yes"],
                    ],
                    ["lambda", ["v"], "no"],
                  ],
                },
              ],
              mode
            )
          ).toEqual({
            tested: yes ? "yes" : "no",
            given: !yes,
            compared: yes,
            held: { answer: yes },
            matched: yes ? "yes" : "no",
          });
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "means the same in a rule, before and after a snapshot",
    { world, formula: formula(3) },
    ({ formula: { goal, holds }, world: facts }) =>
      Effect.gen(function* () {
        const expected = DOMAIN.filter((x) => holds(facts, x)).map((x) => ({
          x,
        }));
        const query = ["query", ["answer", "?x"], { order: "x" }];
        const [answers, snapshot] = (yield* evaluate(facts, [
          ["rule", ["answer", "?x"], everyone, ["=", true, goal("?x")]],
          ["array/make", query, ["snapshot"]],
        ])) as [unknown, unknown];
        expect(answers).toEqual(expected);
        const loaded = yield* loadDatabase(snapshot, stdlib);
        expect(yield* run(query, stdlib, { database: loaded })).toEqual(
          expected
        );
        expect(yield* run(["snapshot"], stdlib, { database: loaded })).toEqual(
          snapshot
        );
      }),
    OPTIONS
  );

  it.effect.prop(
    "is explained by absences that are false and checks that are true",
    { world, formula: formula(2) },
    ({ formula: { goal }, world: facts }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        const program = (forms: readonly Form[]) =>
          run(["begin", ...setup(facts), ...EXTRA, ...forms], stdlib, {
            database,
          });
        const rows = (yield* program([
          ["rule", ["out", "?x", "absent"], everyone, ["not", goal("?x")]],
          [
            "rule",
            ["out", "?x", "held"],
            everyone,
            ["value/identity", goal("?x")],
          ],
          ["query", ["out", "?x", "?v"]],
        ])) as { x: number; v: string }[];
        expect(rows).toHaveLength(DOMAIN.length);
        for (const { v, x } of rows) {
          const { because } = (yield* program([["why", ["out", x, v]]])) as {
            because: Record<string, Form>[];
          };
          // A row that a goal matched is a premise too, explained in turn.
          const tests = because.flatMap((premise) =>
            "fact" in premise ? [] : Object.entries(premise)
          );
          for (const [kind, premise] of tests) {
            expect(yield* program([["value/identity", premise]])).toBe(
              kind === "check"
            );
          }
          if (v === "held") {
            expect(tests.map(([kind]) => kind)).toEqual(["check"]);
          }
        }
      }),
    OPTIONS
  );
});

const lexical = (a: readonly number[], b: readonly number[]) =>
  a.map((item, at) => item - (b[at] ?? 0)).find((order) => order !== 0) ?? 0;

/** A find about a member, with what it must find according to the facts. */
interface Shape {
  readonly find: (x: Form) => Form;
  readonly found: (facts: World, x: number) => unknown;
}

const SHAPES: Record<string, Shape> = {
  "the targets of a member": {
    find: (x) => ["find", "?y", ["link", x, "?y"]],
    found: targets,
  },
  "every pair, whatever the member": {
    find: () => ["find", ["array/make", "?a", "?b"], ["link", "?a", "?b"]],
    found: (facts) => [[-1, -1], ...linksOf(facts)].sort(lexical),
  },
  "two links away, once for each way there": {
    find: (x) => [
      "find",
      "?z",
      ["and", ["link", x, "?y"], ["link", "?y", "?z"]],
    ],
    found: (facts, x) =>
      targets(facts, x)
        .flatMap((y) => targets(facts, y))
        .sort(numeric),
  },
  "a value computed from each match that passes a question": {
    find: (x) => [
      "find",
      ["number/multiply", "?y", 10],
      ["and", ["link", x, "?y"], ["not", ["p", "?y"]]],
    ],
    found: (facts, x) =>
      targets(facts, x)
        .filter((y) => !facts.p.includes(y))
        .map((y) => y * 10),
  },
  "what a member reaches": {
    find: (x) => ["find", "?y", ["path", x, "?y"]],
    found: reach,
  },
  "a record that asks a question about each match": {
    find: (x) => ["find", { big: ["big", "?y"], to: "?y" }, ["link", x, "?y"]],
    found: (facts, x) => {
      const isBig = (y: number) => facts.p.includes(y) && y > 2;
      return targets(facts, x)
        .map((to) => ({ big: isBig(to), to }))
        .sort((a, b) => Number(a.big) - Number(b.big) || a.to - b.to);
    },
  },
  "either of two goals, each match once": {
    find: (x) => ["find", "?y", ["or", ["link", x, "?y"], ["q", "?y"]]],
    found: (facts, x) =>
      [...new Set([...targets(facts, x), -1, ...facts.q])].sort(numeric),
  },
  "a find for each match of a find": {
    find: (x) => [
      "find",
      ["array/make", "?y", ["find", "?z", ["path", "?y", "?z"]]],
      ["link", x, "?y"],
    ],
    found: (facts, x) => targets(facts, x).map((y) => [y, reach(facts, y)]),
  },
  "an aggregate of what was found": {
    find: () => ["aggregate/sum", ["find", "?y", ["link", "?_", "?y"]]],
    found: (facts) => linksOf(facts).reduce((sum, [, to]) => sum + to, -1),
  },
  "a count that can be zero": {
    find: (x) => ["aggregate/count", ["find", "?y", ["link", x, "?y"]]],
    found: (facts, x) => targets(facts, x).length,
  },
};

describe("find", () => {
  it.effect.prop(
    "gives the template's value for every match, sorted",
    { world, x: member, shape: element(Object.keys(SHAPES)) },
    ({ shape, world: facts, x }) =>
      Effect.gen(function* () {
        const { find, found } = SHAPES[shape] as Shape;
        for (const mode of MODES) {
          expect(yield* evaluate(facts, [find(x)], mode)).toEqual(
            found(facts, x)
          );
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "in a rule finds, for each answer, what it finds with the value in place",
    { world, shape: element(Object.keys(SHAPES)) },
    ({ shape, world: facts }) =>
      Effect.gen(function* () {
        const { find, found } = SHAPES[shape] as Shape;
        const expected = DOMAIN.map((x) => ({ x, v: found(facts, x) }));
        for (const mode of MODES) {
          const [inHead, inBody, one] = (yield* evaluate(
            facts,
            [
              ["rule", ["out", "?x", find("?x")], everyone],
              [
                "array/make",
                ["query", ["out", "?x", "?v"], { order: "x" }],
                [
                  "query",
                  ["and", everyone, ["=", "?v", find("?x")]],
                  { order: "x" },
                ],
                ["query", ["out", 3, "?v"]],
              ],
            ],
            mode
          )) as unknown[];
          expect(inHead).toEqual(expected);
          expect(inBody).toEqual(expected);
          expect(one).toEqual([{ v: found(facts, 3) }]);
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "matches a member exactly when its goal holds for it",
    { world, formula: formula(3) },
    ({ formula: { goal, holds }, world: facts }) =>
      Effect.gen(function* () {
        for (const mode of MODES) {
          expect(
            yield* evaluate(
              facts,
              [
                [
                  "aggregate/unique",
                  ["find", "?x", ["and", everyone, goal("?x")]],
                ],
              ],
              mode
            )
          ).toEqual(DOMAIN.filter((x) => holds(facts, x)));
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "needs its goal to bind every variable of its template",
    { world, x: member },
    ({ world: facts, x }) =>
      Effect.gen(function* () {
        const failure = (form: Form) =>
          evaluate(facts, [form]).pipe(
            Effect.flip,
            Effect.map((error) =>
              String((error as { message?: unknown }).message)
            )
          );
        expect(yield* failure(["find", "?other", ["link", x, "?y"]])).toContain(
          "its goal does not bind ?other"
        );
        // In a rule the same find is turned down when the rule is written.
        expect(
          yield* failure([
            "rule",
            ["out", "?x", ["find", "?other", ["link", "?x", "?y"]]],
            everyone,
          ])
        ).toContain("its goal does not bind ?other");
      }),
    OPTIONS
  );
});

const customer = element(["ana", "bo", "cy"]);

const orders = Arbitrary.map(
  Arbitrary.array(Arbitrary.all([customer, element([1, 2, 3, 5, 8])]), {
    maxLength: 8,
  }),
  (items) => items.map(([name, amount], id) => ({ id, name, amount }))
);

/** What each aggregate makes of some numbers, in plain JavaScript. */
const COMBINE: Record<string, (values: number[]) => unknown> = {
  count: (values) => values.length,
  countUnique: (values) => new Set(values).size,
  sum: (values) => values.reduce((sum, value) => sum + value, 0),
  mean: (values) =>
    values.length === 0
      ? null
      : values.reduce((sum, value) => sum + value, 0) / values.length,
  min: (values) => (values.length === 0 ? null : Math.min(...values)),
  max: (values) => (values.length === 0 ? null : Math.max(...values)),
  collect: (values) => [...values].sort(numeric),
  unique: (values) => [...new Set(values)].sort(numeric),
};

describe("an aggregate of a find", () => {
  it.effect.prop(
    "combines what a rule head aggregate combines, and also nothing at all",
    {
      orders,
      kind: element(Object.keys(COMBINE)),
      keyed: element([true, false]),
    },
    ({ keyed, kind, orders: items }) =>
      Effect.gen(function* () {
        const aggregate = `aggregate/${kind}`;
        const combine = COMBINE[kind] as (values: number[]) => unknown;
        // Each match counts once, whether its id has a name or is "?_".
        const id = keyed ? "?id" : "?_";
        const [byHead, byFind, inPlainCode] = (yield* run(
          [
            "begin",
            ["relation", "order", ["id", "customer", "amount"]],
            ["relation", "customer", ["name"]],
            ["relation", "byHead", ["name", "value"]],
            ["relation", "byFind", ["name", "value"]],
            [
              "fact",
              ["customer", "ana"],
              ["customer", "bo"],
              ["customer", "cy"],
            ],
            ["fact", ["order", -1, "nobody", 0]],
            ...items.map(({ amount, id: at, name }) => [
              "fact",
              ["order", at, name, amount],
            ]),
            [
              "rule",
              ["byHead", "?c", [aggregate, "?a"]],
              ["order", id, "?c", "?a"],
              ["customer", "?c"],
            ],
            [
              "rule",
              [
                "byFind",
                "?c",
                [aggregate, ["find", "?a", ["order", id, "?c", "?a"]]],
              ],
              ["customer", "?c"],
            ],
            [
              "array/make",
              ["query", ["byHead", "?c", "?v"], { order: "c" }],
              ["query", ["byFind", "?c", "?v"], { order: "c" }],
              [aggregate, ["find", "?a", ["order", id, "ana", "?a"]]],
            ],
          ],
          stdlib
        )) as unknown[];
        const amounts = (name: string) =>
          items
            .filter((item) => item.name === name)
            .map(({ amount }) => amount);
        const expected = ["ana", "bo", "cy"].map((c) => ({
          c,
          v: combine(amounts(c)),
        }));
        expect(byFind).toEqual(expected);
        // A head aggregate has no group for a customer without orders.
        expect(byHead).toEqual(
          expected.filter(({ c }) => amounts(c).length > 0)
        );
        expect(inPlainCode).toEqual(combine(amounts("ana")));
      }),
    OPTIONS
  );
});

/** Ways for a rule to ask about the relation `b` for the member `?x`. */
const QUESTIONS: Record<string, Form> = {
  "a goal under not": ["not", ["b", "?x"]],
  "a goal as a value": ["=", "?t", ["b", "?x"]],
  "a find": ["=", "?found", ["find", "?y", ["b", "?y"]]],
  "a find inside a call": [
    "number/lessThan",
    ["array/length", ["find", "?y", ["b", "?y"]]],
    9,
  ],
  "a cond": ["cond", [["b", "?x"], true], ["else", true]],
  "a relation given to a function": [
    "array/includes?",
    ["array/map", ["array/make", "?x"], "b"],
    false,
  ],
};

describe("a rule that asks a question", () => {
  it.effect.prop(
    "cannot ask about a relation that depends on the rule's own head",
    { question: element(Object.keys(QUESTIONS)), first: element(["a", "b"]) },
    ({ first, question }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        const rules: Record<string, Form> = {
          a: ["rule", ["a", "?x"], ["n", "?x"], QUESTIONS[question]],
          b: ["rule", ["b", "?x"], ["a", "?x"]],
        };
        const second = first === "a" ? "b" : "a";
        const error = yield* run(
          [
            "begin",
            ["relation", "n", ["x"]],
            ["relation", "a", ["x"]],
            ["relation", "b", ["x"]],
            ["fact", ["n", 1]],
            rules[first],
            rules[second],
          ],
          stdlib,
          { database }
        ).pipe(Effect.flip);
        expect(String((error as { message?: unknown }).message)).toContain(
          "cannot go through recursion"
        );
        // The rule that closed the cycle was not added.
        expect(database.rules).toHaveLength(1);
        expect(
          yield* run(["query", [first, "?x"]], stdlib, { database })
        ).toEqual(first === "a" ? [{ x: 1 }] : []);
      }),
    OPTIONS
  );

  it.effect.prop(
    "answers the same whatever order its rules were added in",
    {
      world,
      order: Arbitrary.map(
        Arbitrary.array(member, { minLength: 4, maxLength: 4 }),
        (keys) => [0, 1, 2, 3].sort((a, b) => (keys[a] ?? 0) - (keys[b] ?? 0))
      ),
    },
    ({ order, world: facts }) =>
      Effect.gen(function* () {
        // Each rule asks about a relation that an earlier one derives.
        const rules = [
          ["rule", ["lonely", "?x"], everyone, ["not", ["link", "?x", "?_"]]],
          [
            "rule",
            ["busy", "?x", ["find", "?y", ["path", "?x", "?y"]]],
            everyone,
            ["not", ["lonely", "?x"]],
          ],
          [
            "rule",
            ["widest", ["aggregate/max", ["array/length", "?found"]]],
            ["busy", "?_", "?found"],
          ],
          [
            "rule",
            ["leader", "?x"],
            ["busy", "?x", "?found"],
            ["widest", ["array/length", "?found"]],
            ["not", ["and", ["lonely", "?other"], ["p", "?other"]]],
          ],
        ];
        const answers = (sequence: readonly number[]) =>
          run(
            [
              "begin",
              ...setup(facts),
              ["relation", "lonely", ["x"]],
              ["relation", "busy", ["x", "found"]],
              ["relation", "widest", ["size"]],
              ["relation", "leader", ["x"]],
              ...sequence.map((at) => rules[at]),
              {
                lonely: ["find", "?x", ["lonely", "?x"]],
                busy: [
                  "find",
                  ["array/make", "?x", "?f"],
                  ["busy", "?x", "?f"],
                ],
                widest: ["find", "?s", ["widest", "?s"]],
                leader: ["find", "?x", ["leader", "?x"]],
              },
            ],
            stdlib
          );
        const expected = (yield* answers([0, 1, 2, 3])) as Record<
          string,
          unknown[]
        >;
        expect(yield* answers(order)).toEqual(expected);
        // The model: who has no link, and who reaches the most members.
        const lonely = DOMAIN.filter((x) => targets(facts, x).length === 0);
        const busy = DOMAIN.filter((x) => !lonely.includes(x));
        const widest = Math.max(...busy.map((x) => reach(facts, x).length));
        expect(expected.lonely).toEqual(lonely);
        expect(expected.widest).toEqual(busy.length === 0 ? [] : [widest]);
        expect(expected.leader).toEqual(
          lonely.some((x) => facts.p.includes(x))
            ? []
            : busy.filter((x) => reach(facts, x).length === widest)
        );
      }),
    OPTIONS
  );

  it.effect.prop(
    "holds the question, not its answer: facts added after the rule count",
    {
      world,
      added: member,
      question: element(["find", "value", "function", "cond"] as const),
    },
    ({ added, question, world: facts }) =>
      Effect.gen(function* () {
        // None of these mentions a variable of the rule, so each could be
        // worked out when the rule is written. It must not be.
        const questions = {
          find: ["aggregate/collect", ["find", "?y", ["q", "?y"]]],
          value: ["value/identity", ["q", added]],
          function: ["array/map", ["array/make", added, 0], "q"],
          cond: ["cond", [["q", added], "yes"], ["else", "no"]],
        };
        const after = [...new Set([...facts.q, added])];
        const expected = {
          find: [-1, ...after].sort(numeric),
          value: true,
          function: [true, after.includes(0)],
          cond: "yes",
        };
        for (const mode of MODES) {
          expect(
            yield* evaluate(
              facts,
              [
                ["rule", ["out", "?x", questions[question]], everyone],
                ["fact", ["q", added]],
                ["query", ["out", 0, "?v"]],
              ],
              mode
            )
          ).toEqual([{ v: expected[question] }]);
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "runs what it holds when it runs, so a call that fails only fails a match",
    { world, x: member, divisor: element([0, 2]) },
    ({ divisor, world: facts, x }) =>
      Effect.gen(function* () {
        // The call mentions no variable, and with a divisor of 0 it fails.
        const outcome = yield* evaluate(facts, [
          [
            "rule",
            ["out", "?y", ["number/divide", 6, divisor]],
            ["link", x, "?y"],
          ],
          {
            rule: ["query", ["out", "?y", "?v"], { order: "y" }],
            find: ["find", ["number/divide", 6, divisor], ["link", x, "?y"]],
          },
        ]).pipe(Effect.catch(() => Effect.succeed("failed")));
        const matched = targets(facts, x);
        if (divisor === 0 && matched.length > 0) {
          expect(outcome).toBe("failed");
        } else {
          expect(outcome).toEqual({
            rule: matched.map((y) => ({ y, v: 3 })),
            find: matched.map(() => 3),
          });
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "can ask a question it only builds when it runs, but not about itself",
    { world, relation: element(["p", "q", "big", "out"]) },
    ({ relation, world: facts }) =>
      Effect.gen(function* () {
        // The goal comes out of `eval`, so no one sees it when the rule is written.
        const built =
          relation === "out"
            ? ["array/make", ["quote", "out"], "?x", true]
            : ["array/make", ["quote", relation], "?x"];
        const outcome = yield* evaluate(facts, [
          [
            "rule",
            ["out", "?x", ["value/identity", ["eval", built]]],
            everyone,
          ],
          ["query", ["out", "?x", "?v"], { order: "x" }],
        ]).pipe(
          Effect.catch((error) =>
            Effect.succeed(String((error as { message?: unknown }).message))
          )
        );
        if (relation === "out") {
          expect(outcome).toContain(
            '"out" was asked about while its own rows were being derived'
          );
          return;
        }
        const members = relation === "q" ? facts.q : facts.p;
        expect(outcome).toEqual(
          DOMAIN.map((x) => ({
            x,
            v: members.includes(x) && (relation !== "big" || x > 2),
          }))
        );
      }),
    OPTIONS
  );
});

describe("a relation", () => {
  it.effect.prop(
    "is a predicate for the functions it is given to, and for match",
    { world, items: Arbitrary.array(member, { maxLength: 4 }) },
    ({ items, world: facts }) =>
      Effect.gen(function* () {
        const kind = [
          "lambda",
          ["x"],
          [
            "match",
            "x",
            ["big", ["lambda", ["v"], "large"]],
            ["p", ["lambda", ["v"], "small"]],
            ["lambda", ["v"], "other"],
          ],
        ];
        const model = (x: number) => {
          if (!facts.p.includes(x)) {
            return "other";
          }
          return x > 2 ? "large" : "small";
        };
        for (const mode of MODES) {
          const [inPlainCode, inARule] = (yield* evaluate(
            facts,
            [
              [
                "rule",
                [
                  "out",
                  "?x",
                  {
                    flags: ["array/map", ["array/make", "?x", 0], "q"],
                    kind: [kind, "?x"],
                  },
                ],
                everyone,
              ],
              [
                "array/make",
                {
                  flags: ["array/map", ["quote", items], "q"],
                  kinds: ["array/map", ["quote", items], kind],
                },
                ["query", ["out", "?x", "?v"], { order: "x" }],
              ],
            ],
            mode
          )) as unknown[];
          const inQ = (x: number) => facts.q.includes(x);
          expect(inPlainCode).toEqual({
            flags: items.map(inQ),
            kinds: items.map(model),
          });
          expect(inARule).toEqual(
            DOMAIN.map((x) => ({
              x,
              v: { flags: [inQ(x), inQ(0)], kind: model(x) },
            }))
          );
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "gives a fact the value of a question among its arguments",
    { world, x: member },
    ({ world: facts, x }) =>
      Effect.gen(function* () {
        expect(
          yield* evaluate(facts, [
            ["fact", ["out", x, ["find", "?y", ["link", x, "?y"]]]],
            ["fact", ["out", "member", ["p", x]]],
            ["query", ["out", "?x", "?v"]],
          ])
        ).toEqual([
          { x, v: targets(facts, x) },
          { x: "member", v: facts.p.includes(x) },
        ]);
      }),
    OPTIONS
  );
});

/** Something to ask a database, or a change to its facts. */
const step = oneOf<Form>(
  Arbitrary.map(member, (x) => ["query", ["path", x, "?to"], { order: "to" }]),
  Arbitrary.Constant([
    "query",
    ["path", "?from", "?to"],
    { order: ["from", "to"] },
  ]),
  Arbitrary.map(member, (x) => ["find", "?y", ["path", x, "?y"]]),
  Arbitrary.map(Arbitrary.all([member, member]), ([x, y]) => [
    "cond",
    [["path", x, y], "yes"],
    ["else", "no"],
  ]),
  Arbitrary.Constant([
    "query",
    ["and", ["p", "?x"], ["not", ["path", "?x", "?_"]]],
    { order: "x" },
  ]),
  Arbitrary.Constant(["query", ["big", "?x"], { order: "x" }]),
  Arbitrary.map(member, (x) => [
    "aggregate/count",
    ["find", "?y", ["and", ["path", x, "?y"], ["q", "?y"]]],
  ]),
  Arbitrary.map(member, (x) => ["why", ["path", x, x]]),
  Arbitrary.map(Arbitrary.all([member, member]), ([a, b]) => [
    "fact",
    ["link", a, b],
  ]),
  Arbitrary.map(Arbitrary.all([member, member]), ([a, b]) => [
    "retract",
    ["link", a, b],
  ]),
  Arbitrary.map(member, (x) => ["fact", ["p", x]])
);

describe("what a database has derived so far", () => {
  it.effect.prop(
    "never changes an answer: each one is what a new database gives",
    {
      world,
      steps: Arbitrary.array(step, { minLength: 1, maxLength: 8 }),
      goalDirected: element(MODES),
    },
    ({ goalDirected, steps, world: facts }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase({ goalDirected });
        yield* run(["begin", ...setup(facts)], stdlib, { database });
        const changes: Form[] = [];
        for (const form of steps) {
          const actual = yield* run(form, stdlib, { database });
          // The changes so far and this step alone, on a new database, which
          // has derived nothing when the step runs.
          expect(actual).toEqual(
            yield* evaluate(facts, [...changes, form], goalDirected)
          );
          if (["fact", "retract"].includes((form as string[])[0] ?? "")) {
            changes.push(form);
          }
        }
      }),
    OPTIONS
  );
});

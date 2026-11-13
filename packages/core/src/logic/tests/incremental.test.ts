/**
 * After a change to facts, an invariant is asked again only when the change
 * can have broken it, and sometimes only about the rows that are new. That
 * must never change which changes are kept. Each kind of goal here reads a
 * changed relation a different way: as a goal of its own, under `not`,
 * through a rule, inside an argument, in a find, in another alternative,
 * through a schema, or through a graph algorithm. A rule added along the way
 * makes a relation that held only facts depend on another. A model that
 * reads the facts as plain sets says which changes keep every invariant.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { LogicDatabase } from "@/logic/database";
import { readsOnlyArguments } from "@/logic/terms";
import { stdlib } from "@/modules";
import { attempt, element, oneOf } from "./programs";

type Form = readonly unknown[];

// A break here shows only when one particular kind of invariant meets one
// particular change, so the property runs more often than most.
const OPTIONS = { timeout: 120_000, arbitrary: { runs: 1000 } };

// Few members, so the facts of different relations often meet in one.
const DOMAIN = [0, 1, 2];

interface World {
  /** Pairs of `link`, each as "from,to". */
  readonly links: ReadonlySet<string>;
  readonly p: ReadonlySet<number>;
  /** The facts of `q`. With the rule, `q` also holds what links to itself. */
  readonly q: ReadonlySet<number>;
  /** Whether the rule that derives `q` from `link` has been added. */
  readonly ruled: boolean;
}

const linked = (world: World) =>
  [...world.links].map(
    (pair) => pair.split(",").map(Number) as [number, number]
  );

/** The rule a step can add: whatever links to itself is in `q`. */
const RULE: Form = ["rule", ["q", "?x"], ["link", "?x", "?x"]];

/** The rows of `q`: its facts, and what the rule derives once it is added. */
const rowsOfQ = (world: World): ReadonlySet<number> =>
  world.ruled
    ? new Set([
        ...world.q,
        ...linked(world).flatMap(([from, to]) => (from === to ? [from] : [])),
      ])
    : world.q;

/** Whether one or more links lead from one member to another. */
const reaches = (world: World, from: number, to: number) => {
  const seen = new Set<number>();
  const pending = [from];
  for (let at = pending.pop(); at !== undefined; at = pending.pop()) {
    for (const [source, target] of linked(world)) {
      if (source === at && !seen.has(target)) {
        seen.add(target);
        pending.push(target);
      }
    }
  }
  return seen.has(to);
};

interface Case {
  /** Whether the goal has an answer in a world. */
  readonly answered: (world: World) => boolean;
  /**
   * Whether asking the goal fails in a world. An invariant that cannot be
   * checked is not kept, so a change that makes it fail is undone.
   */
  readonly fails?: (world: World) => boolean;
  readonly goal: Form;
}

const some = (items: ReadonlySet<number>, test: (x: number) => boolean) =>
  [...items].some(test);

const CASES: readonly Case[] = [
  // Two goals over facts.
  {
    goal: ["and", ["p", "?x"], ["q", "?x"]],
    answered: (world) => some(world.p, (x) => rowsOfQ(world).has(x)),
  },
  // A relation under "not".
  {
    goal: ["and", ["p", "?x"], ["not", ["q", "?x"]]],
    answered: (world) => some(world.p, (x) => !rowsOfQ(world).has(x)),
  },
  {
    goal: ["and", ["link", "?x", "?y"], ["not", ["p", "?y"]]],
    answered: (world) => linked(world).some(([, to]) => !world.p.has(to)),
  },
  // A relation that a rule derives from the facts.
  {
    goal: ["and", ["big", "?x"], ["q", "?x"]],
    answered: (world) => some(world.p, (x) => x > 1 && rowsOfQ(world).has(x)),
  },
  // A question inside an argument of a goal over facts.
  {
    goal: [
      "and",
      ["q", "?x"],
      ["link", ["cond", [["p", "?x"], "?x"], ["else", -9]], "?_"],
    ],
    answered: (world) =>
      some(
        rowsOfQ(world),
        (x) => world.p.has(x) && linked(world).some(([from]) => from === x)
      ),
  },
  // Two alternatives.
  {
    goal: ["or", ["and", ["p", "?x"], ["link", "?x", "?x"]], ["q", 2]],
    answered: (world) =>
      rowsOfQ(world).has(2) ||
      some(world.p, (x) => world.links.has(`${x},${x}`)),
  },
  // A find inside a filter.
  {
    goal: [
      "and",
      ["p", "?x"],
      [
        "number/greaterThan",
        ["aggregate/count", ["find", "?y", ["link", "?x", "?y"]]],
        1,
      ],
    ],
    answered: (world) =>
      some(
        world.p,
        (x) => linked(world).filter(([from]) => from === x).length > 1
      ),
  },
  // A relation as a schema.
  {
    goal: ["and", ["link", "?x", "?y"], ["not", ["schema/fits?", "?y", "q"]]],
    answered: (world) =>
      linked(world).some(([, to]) => !rowsOfQ(world).has(to)),
  },
  // A named schema whose lambda asks about a relation.
  {
    goal: ["and", ["p", "?x"], ["not", ["InQ", "?x"]]],
    answered: (world) => some(world.p, (x) => !rowsOfQ(world).has(x)),
  },
  // A named schema over a record of a row, as a relation's schema is.
  {
    goal: [
      "and",
      ["link", "?x", "?y"],
      ["not", ["Known", { from: "?x", to: "?y" }]],
    ],
    answered: (world) =>
      linked(world).some(
        ([from, to]) => !(world.p.has(from) && rowsOfQ(world).has(to))
      ),
  },
  // A graph algorithm over a relation.
  {
    goal: ["graph/shortestPath", "link", 0, 2, "?km", "?_"],
    answered: (world) => reaches(world, 0, 2),
  },
  // A function from the host that reads the database on its own, where
  // Lion cannot see what it depends on.
  {
    goal: ["and", ["p", "?x"], ["not", ["host/in-q?", "?x"]]],
    answered: (world) => some(world.p, (x) => !rowsOfQ(world).has(x)),
  },
  // The same function inside a named schema, and behind a rule.
  {
    goal: ["and", ["p", "?x"], ["not", ["HostQ", "?x"]]],
    answered: (world) => some(world.p, (x) => !rowsOfQ(world).has(x)),
  },
  {
    goal: ["and", ["p", "?x"], ["not", ["hosted", "?x"]]],
    answered: (world) => some(world.p, (x) => !rowsOfQ(world).has(x)),
  },
  // A function from the host that reads nothing but its arguments, and
  // says so: the invariant is then asked only about what a change can break.
  {
    goal: ["and", ["p", "?x"], ["host/odd?", "?x"], ["not", ["q", "?x"]]],
    answered: (world) =>
      some(world.p, (x) => x % 2 === 1 && !rowsOfQ(world).has(x)),
  },
  // A filter that divides by zero on a row that links to itself, and is
  // false on every other row.
  {
    goal: [
      "and",
      ["link", "?x", "?y"],
      [
        "number/greaterThan",
        ["number/divide", 1, ["number/subtract", "?x", "?y"]],
        5,
      ],
    ],
    answered: () => false,
    fails: (world) => linked(world).some(([from, to]) => from === to),
  },
];

const SETUP: readonly Form[] = [
  ["relation", "p", ["x"]],
  ["relation", "q", ["x"]],
  ["relation", "link", ["from", "to"]],
  ["relation", "big", ["x"]],
  ["rule", ["big", "?x"], ["p", "?x"], ["number/greaterThan", "?x", 1]],
  ["schema", "InQ", ["lambda", ["v"], ["q", "v"]]],
  ["schema", "Known", { from: "p", to: "q" }],
  ["schema", "HostQ", ["lambda", ["v"], ["host/in-q?", "v"]]],
  ["relation", "hosted", ["x"]],
  ["rule", ["hosted", "?x"], ["p", "?x"], ["host/in-q?", "?x"]],
];

const member = element(DOMAIN);

type Fact = readonly ["p" | "q", number] | readonly ["link", number, number];

const fact: Arbitrary.Arbitrary<Fact> = Arbitrary.flatMap(
  element(["p", "q", "link"] as const),
  (relation): Arbitrary.Arbitrary<Fact> =>
    relation === "link"
      ? Arbitrary.map(
          Arbitrary.all([member, member]),
          ([from, to]) => ["link", from, to] as const
        )
      : Arbitrary.map(member, (x) => [relation, x] as const)
);

const facts = (maxLength: number) =>
  Arbitrary.array(fact, { minLength: 1, maxLength });

const index = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: CASES.length - 1 }))
);

type Step = readonly ["fact" | "retract" | "rule", readonly Fact[]];

const step = (...forms: readonly Step[0][]): Arbitrary.Arbitrary<Step> =>
  Arbitrary.all([element(forms), facts(2)]);

const changes = (minLength: number, maxLength: number) =>
  Arbitrary.array(step("fact", "fact", "retract"), { minLength, maxLength });

/**
 * Changes in any order, or changes to facts on both sides of the rule: an
 * invariant that was asked before the rule arrived reads more after it.
 */
const steps: Arbitrary.Arbitrary<readonly Step[]> = oneOf(
  Arbitrary.array(step("fact", "fact", "fact", "retract", "retract", "rule"), {
    minLength: 4,
    maxLength: 12,
  }),
  Arbitrary.map(
    Arbitrary.all([changes(1, 3), changes(2, 8)]),
    ([before, after]): readonly Step[] => [...before, ["rule", []], ...after]
  )
);

const given = Arbitrary.all({
  start: Arbitrary.array(fact, { maxLength: 6 }),
  // Mostly one invariant, so that no other one refuses the change first,
  // and mostly "none", which is the kind that is asked about new rows.
  invariants: Arbitrary.array(
    Arbitrary.all([index, element(["none", "none", "none", "some"] as const)]),
    { minLength: 1, maxLength: 2 }
  ),
  steps,
  goalDirected: element([true, false]),
});

const change = (
  world: World,
  form: "fact" | "retract" | "rule",
  items: readonly Fact[]
): World => {
  if (form === "rule") {
    return { ...world, ruled: true };
  }
  const next = {
    links: new Set(world.links),
    p: new Set(world.p),
    q: new Set(world.q),
    ruled: world.ruled,
  };
  for (const [relation, ...values] of items) {
    const set: Set<number | string> =
      relation === "link" ? next.links : next[relation];
    const value = relation === "link" ? values.join(",") : (values[0] ?? 0);
    if (form === "fact") {
      set.add(value);
    } else {
      set.delete(value);
    }
  }
  return next;
};

/**
 * The standard library, and a function that asks the database which members
 * `q` holds without being handed the relation.
 */
const odd = (x: unknown) => typeof x === "number" && x % 2 === 1;

readsOnlyArguments({ odd });

const environment = (database: LogicDatabase) => ({
  ...stdlib,
  "host/odd?": odd,
  "host/in-q?": (x: unknown) =>
    Effect.map(
      run(["find", "?v", ["q", "?v"]], stdlib, { database }),
      (found) => (found as unknown[]).includes(x)
    ),
});

const EMPTY: World = {
  links: new Set(),
  p: new Set(),
  q: new Set(),
  ruled: false,
};

const READ = {
  links: ["find", ["array/make", "?a", "?b"], ["link", "?a", "?b"]],
  p: ["find", "?x", ["p", "?x"]],
  q: ["find", "?x", ["q", "?x"]],
};

describe("invariants after a change to facts", () => {
  it.effect.prop(
    "are kept the same however the invariant reads what changed",
    { given },
    ({ given: { goalDirected, invariants, start, steps } }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase({ goalDirected });
        const host = environment(database);
        const go = (program: unknown) => attempt(program, database, host);
        let world = change(EMPTY, "fact", start);
        const begun = yield* go([
          "begin",
          ...SETUP,
          ...(start.length > 0 ? [["fact", ...start]] : []),
          true,
        ]);
        expect(begun.ok).toBe(true);
        // An invariant is added only when it holds.
        const kept: ((world: World) => boolean)[] = [];
        for (const [at, assert] of invariants) {
          const { answered, fails, goal } = CASES[at] as Case;
          const holds = (now: World) =>
            !fails?.(now) && answered(now) === (assert === "some");
          const added = yield* go(["invariant", goal, { assert }]);
          expect(added.ok).toBe(holds(world));
          if (added.ok) {
            kept.push(holds);
          }
        }
        for (const [form, items] of steps) {
          const next = change(world, form, items);
          const outcome = yield* go(form === "rule" ? RULE : [form, ...items]);
          const allowed = kept.every((holds) => holds(next));
          expect(outcome.ok).toBe(allowed);
          world = allowed ? next : world;
          const read = yield* go(READ);
          expect(read).toEqual({
            ok: true,
            value: {
              links: linked(world).sort(([a, b], [c, d]) => a - c || b - d),
              p: [...world.p].sort(),
              q: [...rowsOfQ(world)].sort(),
            },
          });
        }
      }),
    OPTIONS
  );
});

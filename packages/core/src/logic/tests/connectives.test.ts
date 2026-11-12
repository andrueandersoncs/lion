/**
 * `and`, `or`, and `not` over any mix of relation goals and filters, checked
 * against a model that reads the facts as sets and the goal as a boolean
 * formula.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { LogicDatabase } from "@/logic/database";
import { loadDatabase } from "@/logic/snapshot";
import { stdlib } from "@/modules";
import { element, oneOf } from "./programs";
import {
  DOMAIN,
  everyone,
  member,
  setup,
  subset,
  type World,
  world,
} from "./worlds";

type Goal = unknown;

type Truth = (world: World, x: number) => boolean;

interface Case {
  readonly goal: Goal;
  readonly holds: Truth;
}

const leaf: Arbitrary.Arbitrary<Case> = oneOf<Case>(
  Arbitrary.Constant({ goal: ["p", "?x"], holds: ({ p }, x) => p.includes(x) }),
  Arbitrary.Constant({ goal: ["q", "?x"], holds: ({ q }, x) => q.includes(x) }),
  Arbitrary.Constant({
    goal: ["big", "?x"],
    holds: ({ p }, x) => p.includes(x) && x > 2,
  }),
  Arbitrary.Constant({
    goal: ["link", "?x", "?_"],
    holds: ({ links }, x) => links.some(([from]) => from === x),
  }),
  Arbitrary.map(
    member,
    (to): Case => ({
      goal: ["link", "?x", to],
      holds: ({ links }, x) =>
        links.some(([from, target]) => from === x && target === to),
    })
  ),
  Arbitrary.map(
    member,
    (k): Case => ({
      goal: ["number/greaterThan", "?x", k],
      holds: (_, x) => x > k,
    })
  ),
  Arbitrary.map(
    member,
    (k): Case => ({ goal: ["=", "?x", k], holds: (_, x) => x === k })
  ),
  Arbitrary.map(
    subset,
    (items): Case => ({
      goal: ["in", "?x", ["quote", items]],
      holds: (_, x) => items.includes(x),
    })
  ),
  Arbitrary.map(
    Arbitrary.schema(Schema.Boolean),
    (value): Case => ({ goal: value, holds: () => value })
  )
);

/** A goal built from `and`, `or`, and `not`, with its truth as a formula. */
const formula = (depth: number): Arbitrary.Arbitrary<Case> => {
  if (depth === 0) {
    return leaf;
  }
  const part = formula(depth - 1);
  const pair = Arbitrary.all([part, part]);
  return oneOf<Case>(
    leaf,
    Arbitrary.map(pair, ([a, b]) => ({
      goal: ["and", a.goal, b.goal],
      holds: (facts, x) => a.holds(facts, x) && b.holds(facts, x),
    })),
    Arbitrary.map(pair, ([a, b]) => ({
      goal: ["or", a.goal, b.goal],
      holds: (facts, x) => a.holds(facts, x) || b.holds(facts, x),
    })),
    Arbitrary.map(part, (a) => ({
      goal: ["not", a.goal],
      holds: (facts, x) => !a.holds(facts, x),
    }))
  );
};

const rows = (values: readonly number[]) => values.map((x) => ({ x }));

const OPTIONS = { timeout: 120_000, arbitrary: { runs: 200 } };

describe("and, or, and not", () => {
  it.effect.prop(
    "answer what the goal says as a formula over the facts, either way of evaluating",
    { world, formula: formula(3) },
    ({ formula: { goal, holds }, world: facts }) =>
      Effect.gen(function* () {
        const expected = rows(DOMAIN.filter((x) => holds(facts, x)));
        const query = ["query", ["and", everyone, goal], { order: "x" }];
        for (const goalDirected of [true, false]) {
          const database = new LogicDatabase({ goalDirected });
          expect(
            yield* run(["begin", ...setup(facts), query], stdlib, { database })
          ).toEqual(expected);
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "mean the same in a rule body, before and after a snapshot",
    { world, formula: formula(3) },
    ({ formula: { goal, holds }, world: facts }) =>
      Effect.gen(function* () {
        const expected = rows(DOMAIN.filter((x) => holds(facts, x)));
        const query = ["query", ["answer", "?x"], { order: "x" }];
        const [answers, snapshot] = (yield* run(
          [
            "begin",
            ...setup(facts),
            ["rule", ["answer", "?x"], everyone, goal],
            ["array/make", query, ["snapshot"]],
          ],
          stdlib
        )) as [unknown, unknown];
        expect(answers).toEqual(expected);
        const loaded = yield* loadDatabase(snapshot, stdlib);
        expect(yield* run(query, stdlib, { database: loaded })).toEqual(
          expected
        );
      }),
    OPTIONS
  );

  it.effect.prop(
    "leave a variable out of an answer whose alternative does not bind it",
    { world },
    ({ world: facts }) =>
      Effect.gen(function* () {
        const answers = yield* run(
          [
            "begin",
            ...setup(facts),
            ["query", ["or", ["p", "?a"], ["q", "?b"]]],
          ],
          stdlib
        );
        expect(answers).toStrictEqual([
          ...[-1, ...facts.p].map((a) => ({ a })),
          ...[-1, ...facts.q].map((b) => ({ b })),
        ]);
      }),
    OPTIONS
  );
});

const flag = Arbitrary.schema(Schema.Boolean);

describe("a variable that holds true or false", () => {
  it.effect.prop(
    "is a filter, and not turns it around",
    { flags: Arbitrary.array(flag, { minLength: 1, maxLength: 6 }) },
    ({ flags }) =>
      Effect.gen(function* () {
        const ask = (goal: Goal) => [
          "query",
          ["and", ["flag", "?x", "?ok"], goal],
          { order: "x" },
        ];
        const result = yield* run(
          [
            "begin",
            ["relation", "flag", ["x", "ok"]],
            ["fact", ...flags.map((ok, x) => ["flag", x, ok])],
            { yes: ask("?ok"), no: ask(["not", "?ok"]) },
          ],
          stdlib
        );
        const keep = (wanted: boolean) =>
          flags.flatMap((ok, x) => (ok === wanted ? [{ x, ok }] : []));
        expect(result).toEqual({ yes: keep(true), no: keep(false) });
      }),
    OPTIONS
  );
});

/** Booleans, some of them written as an expression that fails when run. */
const operands = Arbitrary.array(
  Arbitrary.map(
    Arbitrary.all([flag, element([false, false, true])]),
    ([value, fails]) => ({
      value,
      fails,
    })
  ),
  { minLength: 1, maxLength: 5 }
);

describe("and and or on plain values", () => {
  it.effect.prop(
    "stop at the first value that decides the result, as in Scheme",
    { operands, form: element(["and", "or"] as const) },
    ({ form, operands: items }) =>
      Effect.gen(function* () {
        const decides = form === "or";
        const stop = items.findIndex(({ value }) => value === decides);
        const reached = stop === -1 ? items : items.slice(0, stop + 1);
        // An operand that fails stands for its value until it is reached.
        const program = [
          form,
          ...items.map(({ fails, value }) =>
            fails ? ["number/equals?", ["number/divide", 1, 0], value] : value
          ),
        ];
        const result = yield* run(program, stdlib).pipe(
          Effect.catch(() => Effect.succeed("failed"))
        );
        expect(result).toBe(
          reached.some(({ fails }) => fails)
            ? "failed"
            : (stop !== -1) === decides
        );
      }),
    OPTIONS
  );
});

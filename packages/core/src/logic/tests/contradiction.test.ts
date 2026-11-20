/**
 * Why no values meet a solver's goals. Where the solver shows a goal absent,
 * `why` names the goals that contradict each other: together they have no
 * values, and with any one of them left out they have some. A proof that a
 * rule is kept, `not` over the values that would break it, is vacuous when
 * the goals it does not deny allow no values at all, and `why` says so
 * exactly then. The model asks the same solver each set of goals with
 * `exists`, a question of its own.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { LogicDatabase } from "@/logic/database";
import { attempt, element, type Outcome, oneOf } from "./programs";

const OPTIONS = { timeout: 120_000, arbitrary: { runs: 150 } };

const int = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

/** A whole number over ?x and ?y: a variable, a constant, or a sum. */
const term = oneOf<unknown>(
  element<unknown>(["?x", "?y"]),
  int(-4, 4),
  Arbitrary.map(element(["?x", "?y"]), (name) => ["number/add", name, 1])
);

/** A term with a variable in it. */
const variable = oneOf<unknown>(
  element<unknown>(["?x", "?y"]),
  Arbitrary.map(element(["?x", "?y"]), (name) => ["number/add", name, 1])
);

/**
 * A comparison of two terms, the first with a variable: one of constants
 * alone is worked out when the rule is written, so it is no goal of the
 * solver's.
 */
const filter = Arbitrary.map(
  Arbitrary.all([
    element([
      "number/lessThan",
      "number/greaterThan",
      "number/lessThanOrEqualTo",
      "number/greaterThanOrEqualTo",
    ]),
    variable,
    term,
  ]),
  ([compare, a, b]) => [compare, a, b]
);

const filters = Arbitrary.array(filter, { minLength: 1, maxLength: 4 });

const TYPING = [
  ["schema/fits?", "?x", "value/integer?"],
  ["schema/fits?", "?y", "value/integer?"],
];

const resultOf = (outcome: Outcome) => {
  expect(outcome).toMatchObject({ ok: true });
  return outcome.ok ? outcome.value : undefined;
};

/** Whether some whole numbers meet the goals, as the solver says. */
const some = (goals: readonly unknown[]) =>
  Effect.map(
    attempt(
      ["query", ["exists", ["?x", "?y"], ["and", ...TYPING, ...goals]]],
      new LogicDatabase()
    ),
    (outcome) => (resultOf(outcome) as unknown[]).length > 0
  );

/** What `why` says of a fact a rule with the body does not give. */
const premise = (body: readonly unknown[], path: readonly string[]) =>
  Effect.map(
    attempt(
      [
        "begin",
        ["relation", "found", ["n"]],
        ["rule", ["found", 1], ...body],
        path.reduce(
          (inner: unknown, key) =>
            key === "first"
              ? ["array/head", inner]
              : ["object/get", inner, ["quote", key], null],
          ["why", ["found", 1]]
        ),
      ],
      new LogicDatabase()
    ),
    resultOf
  );

describe("the goals that contradict each other", () => {
  it.effect.prop(
    "have no values together, and some with any one left out",
    { goals: filters },
    ({ goals }) =>
      Effect.gen(function* () {
        if (yield* some(goals)) {
          return;
        }
        const contradicting = (yield* premise(
          [...TYPING, ...goals],
          ["because", "first", "but", "contradicting"]
        )) as unknown[] | null;
        expect(contradicting).not.toBeNull();
        const found = contradicting as unknown[];
        expect(yield* some(found)).toBe(false);
        for (const [at] of found.entries()) {
          expect(yield* some(found.filter((_, other) => other !== at))).toBe(
            true
          );
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "make a proof vacuous exactly when the goals it does not deny allow no values",
    { premises: filters, denied: filter },
    ({ premises, denied }) =>
      Effect.gen(function* () {
        const breaks = [...premises, ["not", denied]];
        if (yield* some(breaks)) {
          return;
        }
        const vacuous = yield* premise(
          [["not", ["exists", ["?x", "?y"], ["and", ...TYPING, ...breaks]]]],
          ["because", "first", "vacuous"]
        );
        expect(vacuous === true).toBe(!(yield* some(premises)));
      }),
    OPTIONS
  );
});

/**
 * A schema that asks about itself, through a lambda in its shape. Asked
 * about the same value, it has the least answer that agrees with itself:
 * "does not fit" when that agrees, "fits" when that does, and no answer,
 * which fails, when neither does. Asked about a smaller part of the value,
 * it is plain recursion. Asked about any other value, it is refused, since
 * such a check need not end. Each case is checked against a model in plain
 * TypeScript, in every place a schema is asked, and never runs out of time.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect } from "effect";
import { LogicDatabase } from "@/logic/database";
import { attempt, element, type Outcome } from "./programs";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** What asking a schema gives: an answer, or a failure, and which. */
type Answer =
  | { readonly fits: boolean }
  | { readonly fails: "no answer" | "not smaller" };

/** A word the message of each failure says. */
const SAYS = { "no answer": "has no answer", "not smaller": "smaller" };

/** A predicate on the value that the lambda combines with its question. */
interface Base {
  readonly lion: string;
  readonly model: (value: Json) => boolean;
}

const BASES: readonly Base[] = [
  { lion: "value/integer?", model: (v) => Number.isInteger(v) },
  { lion: "value/string?", model: (v) => typeof v === "string" },
  { lion: "value/array?", model: (v) => Array.isArray(v) },
];

/**
 * How a lambda combines the answer to its own question with the base
 * predicate, as Lion and as a model. `and` and `or` stop early in both, so
 * the question may not be asked at all.
 */
interface Combine {
  /** Whether the question is always asked. */
  readonly asks: boolean;
  readonly lion: (self: unknown, base: unknown) => unknown;
  readonly model: (self: () => boolean, base: boolean) => boolean;
}

const COMBINE: readonly Combine[] = [
  { asks: true, lion: (s) => s, model: (s) => s() },
  { asks: true, lion: (s) => ["not", s], model: (s) => !s() },
  { asks: false, lion: (s, b) => ["or", b, s], model: (s, b) => b || s() },
  { asks: false, lion: (s, b) => ["and", b, s], model: (s, b) => b && s() },
  {
    asks: false,
    lion: (s, b) => ["or", b, ["not", s]],
    model: (s, b) => b || !s(),
  },
  {
    asks: false,
    lion: (s, b) => ["and", b, ["not", s]],
    model: (s, b) => b && !s(),
  },
  {
    asks: true,
    lion: (s, b) => ["cond", [s, ["not", b]], ["else", b]],
    model: (s, b) => (s() ? !b : b),
  },
  {
    asks: true,
    lion: (s) => ["or", s, ["not", s]],
    model: (s) => s() || !s(),
  },
];

/** Two ways a lambda asks whether a value fits the schema "S". */
const ASK: readonly ((value: unknown) => unknown)[] = [
  (value) => ["schema/fits?", value, "S"],
  (value) => ["S", value],
];

/**
 * Where the lambda stands in the shape of "S": alone, or beside a name of
 * "S" itself, in schema/anyOf or schema/allOf.
 */
const PLACES: readonly {
  readonly lion: (lambda: unknown) => unknown;
  readonly model: (self: () => boolean, inner: boolean) => boolean;
}[] = [
  { lion: (lambda) => lambda, model: (_, inner) => inner },
  {
    lion: (lambda) => ["schema/anyOf", "S", lambda],
    model: (self, inner) => self() || inner,
  },
  {
    lion: (lambda) => ["schema/allOf", "S", lambda],
    model: (self, inner) => self() && inner,
  },
];

const VALUES: readonly Json[] = [1, 2, "a", [], [1], { k: 1 }, null, true];

/**
 * The least answer that agrees with itself, for an answer that depends on
 * what the same question answers.
 */
const least = (answer: (self: boolean) => boolean): Answer => {
  if (!answer(false)) {
    return { fits: false };
  }
  return answer(true) ? { fits: true } : { fails: "no answer" };
};

const sameValue = Arbitrary.map(
  Arbitrary.all({
    ask: element(ASK),
    base: element(BASES),
    combine: element(COMBINE),
    place: element(PLACES),
    value: element(VALUES),
  }),
  ({ ask, base, combine, place, value }) => {
    const lambda = ["lambda", ["v"], combine.lion(ask("v"), [base.lion, "v"])];
    const answer = least((self) =>
      place.model(
        () => self,
        combine.model(() => self, base.model(value))
      )
    );
    return { answer, shape: place.lion(lambda), value };
  }
);

/**
 * A list fits "S" when it is empty, or when the lambda, asking about its
 * tail, says so; the model is the same recursion in TypeScript.
 */
const smaller = Arbitrary.map(
  Arbitrary.all({
    ask: element(ASK),
    base: element(BASES),
    combine: element(COMBINE),
    value: Arbitrary.array(element<Json>([1, "a", null, [2]]), {
      maxLength: 5,
    }),
  }),
  ({ ask, base, combine, value }) => {
    const shape = [
      "schema/anyOf",
      ["quote", []],
      [
        "lambda",
        ["v"],
        [
          "and",
          ["value/array?", "v"],
          ["number/greaterThan", ["array/length", "v"], 0],
          combine.lion(ask(["array/tail", "v"]), [
            base.lion,
            ["array/head", "v"],
          ]),
        ],
      ],
    ];
    const model = (list: readonly Json[]): boolean =>
      list.length === 0 ||
      combine.model(() => model(list.slice(1)), base.model(list[0] as Json));
    const answer: Answer = { fits: model(value) };
    return { answer, shape, value: value as Json };
  }
);

/**
 * The lambda asks about a value that is no smaller: a larger one, or, for a
 * number, the next number. A lambda that fails on the value first, such as
 * one that adds to a string, does not fit, as a predicate that fails never
 * does.
 */
const GROWS: readonly {
  readonly lion: unknown;
  readonly asked: (value: Json) => boolean;
}[] = [
  { asked: () => true, lion: ["array/make", "v"] },
  { asked: () => true, lion: ["array/make", "v", "v"] },
  { asked: () => true, lion: { k: "v" } },
  { asked: (v) => typeof v === "number", lion: ["number/add", "v", 1] },
];

const notSmaller = Arbitrary.map(
  Arbitrary.all({
    ask: element(ASK),
    base: element(BASES),
    combine: element(COMBINE.filter(({ asks }) => asks)),
    grows: element(GROWS),
    value: element(VALUES),
  }),
  ({ ask, base, combine, grows, value }) => {
    const shape = [
      "lambda",
      ["v"],
      combine.lion(ask(grows.lion), [base.lion, "v"]),
    ];
    const answer: Answer = grows.asked(value)
      ? { fails: "not smaller" }
      : { fits: false };
    return { answer, shape, value };
  }
);

const cases = Arbitrary.flatMap(
  element([0, 1, 2]),
  (kind) =>
    [sameValue, smaller, notSmaller][kind] as Arbitrary.Arbitrary<{
      readonly answer: Answer;
      readonly shape: unknown;
      readonly value: Json;
    }>
);

/** A check that is still going after this long has no end in sight. */
const LIMIT = "10 seconds";

const evaluate = (program: unknown) =>
  attempt(program, new LogicDatabase()).pipe(
    Effect.timeoutOrElse({
      duration: LIMIT,
      orElse: () =>
        Effect.succeed<Outcome>({ message: "timed out", ok: false }),
    })
  );

/** What an outcome must be for an answer: its value, or a failure. */
const agrees = (outcome: Outcome, answer: Answer, value: unknown) => {
  if ("fails" in answer) {
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.message).toContain(SAYS[answer.fails]);
    }
  } else {
    expect(outcome).toEqual({ ok: true, value });
  }
};

/** What a find of the one value finds: the value when it fits. */
const found = (fits: boolean, value: Json) => (fits ? [value] : []);

const OPTIONS = { timeout: 120_000, arbitrary: { runs: 300 } };

describe("a schema that asks about itself", () => {
  it.effect.prop(
    "gives its least consistent answer, recurses on smaller parts, and refuses the rest",
    { given: cases },
    ({ given: { answer, shape, value } }) =>
      Effect.gen(function* () {
        const declare = ["schema", "S", shape];
        const asked = ["quote", value];
        const fits = "fits" in answer ? answer.fits : undefined;
        // In plain code, with schema/fits? and by calling the schema.
        agrees(
          yield* evaluate(["begin", declare, ["schema/fits?", asked, "S"]]),
          answer,
          fits
        );
        agrees(yield* evaluate(["begin", declare, ["S", asked]]), answer, fits);
        // As a goal in a find, for the one value.
        agrees(
          yield* evaluate([
            "begin",
            declare,
            [
              "find",
              "?v",
              ["and", ["in", "?v", ["quote", [value]]], ["S", "?v"]],
            ],
          ]),
          answer,
          fits === undefined ? undefined : found(fits, value)
        );
        // Inside another schema's lambda, where a check that fails is a
        // value that does not fit.
        expect(
          yield* evaluate([
            "begin",
            declare,
            ["schema", "Outer", ["lambda", ["v"], ["schema/fits?", "v", "S"]]],
            ["schema/fits?", asked, "Outer"],
          ])
        ).toEqual({ ok: true, value: fits === true });
      }),
    OPTIONS
  );
});

/**
 * The solver checked against plain code. Each case is a goal on one
 * number, bounded on both sides and typed by a schema, which the solver
 * decides: whether some value meets it, and, where only a few do, which.
 * Plain code then runs the same goal at sample points inside the bounds,
 * with the point written in: decimals, a fraction, integers past 2^53, and
 * a tiny number, where exact arithmetic and a double's would part.
 *
 * A case disagrees when the solver proves that no value meets the goal and
 * plain code finds a sample that does, or when a value the solver gives is
 * one plain code says does not. Either is a proof Lion's plain code would
 * contradict: the number gap, found mechanically.
 */
import { Effect } from "effect";
import { substitute } from "./grid.ts";
import { evaluate, type Lion } from "./lion.ts";

const X = "?x";
const third = ["number/divide", 1, 3];
const TWO_53 = 9_007_199_254_740_992;

/** The points plain code runs a goal at, as Lion writes them, with their place on the line. */
export const POINTS: readonly {
  readonly at: number;
  readonly written: unknown;
}[] = [
  { at: -3, written: -3 },
  { at: -1, written: -1 },
  { at: 0, written: 0 },
  { at: 1e-10, written: 1e-10 },
  { at: 0.1, written: 0.1 },
  { at: 0.15, written: 0.15 },
  { at: 0.2, written: 0.2 },
  { at: 0.25, written: 0.25 },
  { at: 1 / 3, written: third },
  { at: 0.5, written: 0.5 },
  { at: 1, written: 1 },
  { at: 2.5, written: 2.5 },
  { at: 3, written: 3 },
  { at: TWO_53, written: TWO_53 },
  { at: TWO_53 + 1, written: ["number/add", TWO_53, 1] },
  { at: 1e20, written: 1e20 },
];

/** A goal on ?x, with the constants it is made of. */
export interface Template {
  /** Whether few enough values meet it that each can be an answer. */
  readonly answers: boolean;
  readonly goal: (a: unknown, k: unknown) => unknown;
  readonly name: string;
  /** The constants it is made of: a, a and k, or none. */
  readonly uses: "" | "a" | "ak";
}

export const TEMPLATES: readonly Template[] = [
  {
    answers: false,
    goal: (a) => ["=", ["number/subtract", ["number/add", X, a], a], X],
    name: "adding a and taking it away gives x",
    uses: "a",
  },
  {
    answers: false,
    goal: (a) => [
      "not",
      ["=", ["number/subtract", ["number/add", X, a], a], X],
    ],
    name: "adding a and taking it away gives other than x",
    uses: "a",
  },
  {
    answers: true,
    goal: (a, k) => ["=", ["number/multiply", X, k], ["number/add", X, a]],
    name: "k times x is x plus a",
    uses: "ak",
  },
  {
    answers: true,
    goal: (a, k) => ["=", ["number/divide", X, k], a],
    name: "x divided by k is a",
    uses: "ak",
  },
  {
    answers: false,
    goal: (a, k) => ["number/lessThan", ["number/multiply", X, k], a],
    name: "k times x is less than a",
    uses: "ak",
  },
  {
    answers: false,
    goal: () => ["not", ["=", ["number/add", X, 1], X]],
    name: "x plus 1 is other than x",
    uses: "",
  },
  {
    answers: false,
    goal: () => ["=", ["number/add", X, 1], X],
    name: "x plus 1 is x",
    uses: "",
  },
];

const CONSTANTS: readonly unknown[] = [0.1, 0.2, third, 1, TWO_53];
const FACTORS: readonly unknown[] = [2, 3, -1, 0.5];
const BOUNDS: readonly (readonly [number, number])[] = [
  [0, 1],
  [-3, 3],
  [0.1, 0.2],
  [TWO_53 - 1, TWO_53 + 2],
  [0, 1e21],
];
const SCHEMAS = ["value/number?", "value/integer?"] as const;

/** One case: a goal, its bounds, and the schema that types ?x. */
export interface Case {
  readonly a: unknown;
  readonly bounds: readonly [number, number];
  readonly k: unknown;
  readonly schema: (typeof SCHEMAS)[number];
  readonly template: Template;
}

/** Every case: each template with each of its constants, in each bounds, under each schema. */
export const cases = (): Case[] =>
  TEMPLATES.flatMap((template) =>
    (template.uses === "" ? [0] : CONSTANTS).flatMap((a) =>
      (template.uses === "ak" ? FACTORS : [1]).flatMap((k) =>
        BOUNDS.flatMap(([lo, hi]) =>
          SCHEMAS.map((schema) => ({
            a,
            bounds: [lo, hi] as const,
            k,
            schema,
            template,
          }))
        )
      )
    )
  );

/** The sample points inside a case's bounds that its schema allows. */
export const samplesOf = (c: Case) =>
  POINTS.filter(
    ({ at }) =>
      at > c.bounds[0] &&
      at < c.bounds[1] &&
      (c.schema === "value/number?" || Number.isInteger(at))
  );

/** The goal of a case, with its bounds and its schema, over ?x. */
const constrained = (c: Case) => [
  "and",
  ["schema/fits?", X, c.schema],
  ["number/greaterThan", X, c.bounds[0]],
  ["number/lessThan", X, c.bounds[1]],
  c.template.goal(c.a, c.k),
];

/**
 * The program that asks the solver about a case and runs plain code at its
 * sample points: whether the solver proves that no value meets the goal,
 * and plain code's answer at each point.
 */
export const programOf = (c: Case): unknown => ({
  none: ["query", ["not", ["exists", [X], constrained(c)]]],
  plain: [
    "array/make",
    ...samplesOf(c).map(({ written }) =>
      substitute(c.template.goal(c.a, c.k), written)
    ),
  ],
});

/** How a case came out. */
export type Judged =
  | { readonly kind: "agrees" }
  | { readonly kind: "undecided"; readonly why: string }
  | { readonly kind: "disagrees"; readonly why: string };

/** A value is one plain code says meets the goal, inside the bounds. */
const plainHolds = (lion: Lion, c: Case, value: unknown) =>
  Effect.map(
    evaluate(lion, [
      "and",
      ["number/greaterThan", value, c.bounds[0]],
      ["number/lessThan", value, c.bounds[1]],
      substitute(c.template.goal(c.a, c.k), value),
    ]),
    (outcome) => outcome.ok && outcome.value === true
  );

/** Asks the solver and plain code about a case, and says whether they agree. */
export const judge = (lion: Lion, c: Case): Effect.Effect<Judged> =>
  Effect.gen(function* () {
    const outcome = yield* evaluate(lion, programOf(c));
    if (!outcome.ok) {
      return { kind: "undecided", why: outcome.error };
    }
    const { none, plain } = outcome.value as {
      none: unknown[];
      plain: unknown[];
    };
    // The values the solver gives where only a few meet the goal; where it
    // cannot list them, there are none to check.
    const found = c.template.answers
      ? yield* evaluate(lion, ["find", X, constrained(c)])
      : undefined;
    const answers = found?.ok === true ? (found.value as unknown[]) : [];
    const proved = Array.isArray(none) && none.length > 0;
    const samples = samplesOf(c);
    const met = plain.flatMap((value, at) =>
      value === true ? [samples[at]] : []
    );
    const wrong: unknown[] = [];
    for (const value of answers) {
      if (!(yield* plainHolds(lion, c, value))) {
        wrong.push(value);
      }
    }
    return verdictOf(
      proved,
      met.map((point) => point?.written),
      wrong
    );
  });

/**
 * The verdict on a case: it disagrees when the solver proved that no value
 * meets the goal and plain code met it at some point, or gave a value plain
 * code says does not meet it, and agrees otherwise.
 */
export const verdictOf = (
  proved: boolean,
  met: readonly unknown[],
  wrong: readonly unknown[]
): Judged => {
  if (proved && met.length > 0) {
    return {
      kind: "disagrees",
      why: `the solver proves no value meets it, and plain code at ${JSON.stringify(met[0])} says one does`,
    };
  }
  if (wrong.length > 0) {
    return {
      kind: "disagrees",
      why: `the solver gives ${JSON.stringify(wrong[0])}, and plain code says it does not meet the goal`,
    };
  }
  return { kind: "agrees" };
};

/** A case's words, for a report. */
export const caseText = (c: Case) =>
  `${c.template.name}, a = ${JSON.stringify(c.a)}, k = ${JSON.stringify(c.k)}, ${c.bounds[0]} < x < ${c.bounds[1]}, ${c.schema}`;

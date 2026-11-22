/**
 * A relation goal with variables to bind can read its rows through a later
 * relation goal that its rows leave with nothing to bind, when that goal has
 * fewer rows for the answer: the cover of a worst-case optimal join, chosen
 * for each answer. It changes what answers cost and nothing else. So a body
 * gives what a plain model of its goals gives, row for row, also over a hub
 * that most rows share; its answers come in the order the same body gives
 * them when no goal can be read early; and a filter that stands between two
 * goals still runs on every answer of the goals before it.
 */

import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect } from "effect";
import { LogicDatabase } from "@/logic/database";
import { attempt, element, oneOf } from "./programs";

type Form = readonly unknown[];
type Value = string | number | null;

/** The node most rows share, as a hub does. */
const HUB = "h";
const VALUES: readonly Value[] = [HUB, "a", "b", 1, null];
const VARIABLES = ["?a", "?b", "?c", "?d"] as const;

/** A node, the hub more often than any other. */
const node = oneOf(element([HUB]), element(VALUES));

const pair = Arbitrary.all([node, node]);

/** An edge between numbers, where one node in a few is not a number. */
const numbered = Arbitrary.all([
  oneOf(element<Value>([0]), element<Value>([0, 1, 2, 3, "x"])),
  oneOf(element<Value>([0]), element<Value>([0, 1, 2, 3, "x"])),
]);

/** The relations a body reads: two of facts, and one a rule derives. */
const RELATIONS = ["edge", "link", "hop"] as const;
type Relation = (typeof RELATIONS)[number];

/** A goal's argument: a variable, most often, an anonymous one, or a value. */
const argument = oneOf<unknown>(
  element(VARIABLES),
  element(VARIABLES),
  element(["?_"]),
  element(VALUES)
);

const goal = Arbitrary.map(
  Arbitrary.all([element(RELATIONS), argument, argument]),
  ([relation, from, to]): Form => [relation, from, to]
);

/** A goal of one of the relations, between two given variables either way. */
const between = (from: string, to: string) =>
  Arbitrary.map(
    Arbitrary.all([element(RELATIONS), element([false, true])]),
    ([relation, turned]): Form =>
      turned ? [relation, to, from] : [relation, from, to]
  );

/**
 * A ring of three or four goals, each sharing a variable with the next, so
 * the goal before the last leaves the last with nothing to bind, and
 * sometimes a goal more, which may leave a variable of its own to bind.
 */
const ring = Arbitrary.flatMap(element([3, 4]), (length) =>
  Arbitrary.map(
    Arbitrary.all([
      Arbitrary.all(
        VARIABLES.slice(0, length).map((name, at) =>
          between(name, VARIABLES[(at + 1) % length] as string)
        )
      ),
      Arbitrary.array(goal, { maxLength: 1 }),
    ]),
    ([goals, more]): Form[] => [...goals, ...more]
  )
);

/**
 * A chain of three goals: the last holds the variable the one before it
 * binds and one of its own, so its rows can give the goal before it a row
 * more than once.
 */
const chain = Arbitrary.all([
  between("?a", "?b"),
  between("?b", "?c"),
  between("?c", "?d"),
]);

const world = {
  body: oneOf<readonly Form[]>(
    ring,
    ring,
    chain,
    Arbitrary.array(goal, { minLength: 2, maxLength: 4 })
  ),
  edges: Arbitrary.array(pair, { maxLength: 16 }),
  links: Arbitrary.array(pair, { maxLength: 10 }),
};

interface World {
  readonly body: readonly Form[];
  readonly edges: readonly (readonly [Value, Value])[];
  readonly links: readonly (readonly [Value, Value])[];
}

const declared = ({ edges, links }: World): Form[] => [
  ["relation", "edge", ["from", "to"]],
  ["relation", "link", ["from", "to"]],
  ["relation", "hop", ["from", "to"]],
  ...(edges.length > 0
    ? [["fact", ...edges.map(([from, to]) => ["edge", from, to])]]
    : []),
  ...(links.length > 0
    ? [["fact", ...links.map(([from, to]) => ["link", from, to])]]
    : []),
  ["rule", ["hop", "?x", "?y"], ["link", "?y", "?x"]],
];

const isVariable = (arg: unknown): arg is string =>
  typeof arg === "string" && arg.startsWith("?");

/** The variables a body names, in a fixed order: not the anonymous one. */
const named = (body: readonly Form[]) =>
  VARIABLES.filter((name) => body.some((form) => form.includes(name)));

const distinct = (rows: readonly (readonly [Value, Value])[]) => [
  ...new Map(rows.map((row) => [JSON.stringify(row), row])).values(),
];

/**
 * Every match of a body, by a plain model: one row of each goal's relation
 * for each goal, in every combination whose values agree, as a list of the
 * values of the named variables. A row a rule derives is a link backwards.
 */
const modelMatches = ({ body, edges, links }: World) => {
  const rows: Record<Relation, readonly (readonly [Value, Value])[]> = {
    edge: distinct(edges),
    hop: distinct(links.map(([from, to]) => [to, from] as const)),
    link: distinct(links),
  };
  const out: Value[][] = [];
  const names = named(body);
  const go = (at: number, bound: ReadonlyMap<string, Value>) => {
    const form = body[at];
    if (form === undefined) {
      out.push(names.map((name) => bound.get(name) as Value));
      return;
    }
    const [relation, ...args] = form as [Relation, ...unknown[]];
    for (const row of rows[relation]) {
      const next = new Map(bound);
      const fits = args.every((arg, position) => {
        const value = row[position] as Value;
        if (arg === "?_") {
          return true;
        }
        if (!isVariable(arg)) {
          return arg === value;
        }
        if (next.has(arg)) {
          return next.get(arg) === value;
        }
        next.set(arg, value);
        return true;
      });
      if (fits) {
        go(at + 1, next);
      }
    }
  };
  go(0, new Map());
  return out;
};

const sorted = (values: readonly unknown[]) =>
  values.map((value) => JSON.stringify(value)).sort();

/** Runs a program in a database of its own. */
const value = (program: unknown) =>
  Effect.map(attempt(program, new LogicDatabase()), (outcome) => {
    if (!outcome.ok) {
      throw new Error(outcome.message);
    }
    return outcome.value;
  });

/**
 * A filter that every value passes, for each named variable: it runs as
 * soon as its variable is bound, so it stands right after the goal that
 * binds it, and no goal before it can be read through a goal after it.
 */
const passing = (body: readonly Form[]): Form[] =>
  named(body).map((name) => ["value/array?", ["array/make", name]]);

describe("a goal read through a later goal", () => {
  it.effect.prop(
    "a body matches what a plain model of its goals matches, row for row",
    world,
    (given) =>
      Effect.gen(function* () {
        const template = ["array/make", ...named(given.body)];
        const found = yield* value([
          "begin",
          ...declared(given),
          ["find", template, ["and", ...given.body]],
        ]);
        expect(sorted(found as unknown[])).toEqual(sorted(modelMatches(given)));
      }),
    { arbitrary: { runs: 1000 } }
  );

  it.effect.prop(
    "a filter that every value passes changes neither a query's answers nor their order",
    world,
    (given) =>
      Effect.gen(function* () {
        const asked = (body: readonly Form[]) =>
          value(["begin", ...declared(given), ["query", ["and", ...body]]]);
        expect(yield* asked(given.body)).toEqual(
          yield* asked([...given.body, ...passing(given.body)])
        );
      }),
    { arbitrary: { runs: 1000 } }
  );

  it.effect.prop(
    "a filter between two goals runs on every answer of the goals before it",
    { edges: Arbitrary.array(numbered, { maxLength: 14 }) },
    ({ edges }) =>
      Effect.gen(function* () {
        // The filter runs once ?c is bound, before the goal that closes the
        // triangle, and fails on a value that is not a number.
        const triangles = [
          "aggregate/count",
          [
            "find",
            1,
            [
              "and",
              ["edge", "?a", "?b"],
              ["edge", "?b", "?c"],
              ["number/greaterThan", "?c", -1],
              ["edge", "?c", "?a"],
            ],
          ],
        ];
        const outcome = yield* attempt(
          ["begin", ...declared({ body: [], edges, links: [] }), triangles],
          new LogicDatabase()
        );
        const paths = modelMatches({
          body: [
            ["edge", "?a", "?b"],
            ["edge", "?b", "?c"],
          ],
          edges,
          links: [],
        });
        const fails = paths.some(([, , c]) => typeof c !== "number");
        expect(outcome.ok).toBe(!fails);
        if (outcome.ok) {
          const closed = modelMatches({
            body: [
              ["edge", "?a", "?b"],
              ["edge", "?b", "?c"],
              ["edge", "?c", "?a"],
            ],
            edges,
            links: [],
          });
          expect(outcome.value).toBe(closed.length);
        }
      }),
    { arbitrary: { runs: 300 } }
  );
});

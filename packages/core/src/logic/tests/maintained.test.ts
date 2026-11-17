/**
 * A database keeps what it derived when facts change, and brings it up to
 * date with the change. That must never show: after any changes, with any
 * questions asked between them, a database answers every question as a
 * database that holds the same facts and rules and has derived nothing yet.
 *
 * The rules here read the changed facts in every way: by recursion, by a
 * join of two rows that can both be lost at once, through another derived
 * relation, as facts of a relation that rules also derive, under `not`, in
 * a find, through an aggregate, through an aggregate that recurses, through
 * a key, through a rule that invents, and through a graph algorithm. Which questions are asked after each
 * change is generated too, so what is already derived when the next change
 * arrives differs from run to run.
 *
 * An explanation must rest on what holds: every row `why` shows as given
 * is a fact, also for a row that was derived before a change took away
 * what first gave it.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect } from "effect";
import { LogicDatabase } from "@/logic/database";
import { loadDatabase, saveDatabase } from "@/logic/snapshot";
import { stdlib } from "@/modules";
import { attempt, element, oneOf } from "./programs";

type Form = readonly unknown[];

const NODES = ["a", "b", "c", "d"];

const SETUP: readonly Form[] = [
  ["relation", "edge", ["from", "to"]],
  ["relation", "node", ["name"]],
  ["relation", "order", ["id", "status"], { key: "id" }],
  ["relation", "path", ["from", "to"]],
  ["relation", "hop", ["from", "to"]],
  ["relation", "far", ["from", "to"]],
  ["relation", "hub", ["name"]],
  ["relation", "cancelled", ["id"]],
  ["relation", "degree", ["node", "count"]],
  ["relation", "busy", ["node"]],
  ["relation", "lonely", ["name"]],
  ["relation", "reach", ["node", "count"]],
  ["relation", "owner", ["node", "who"], { key: "node" }],
  ["relation", "grouped", ["node", "group"]],
  ["relation", "tag", ["node", "who"]],
  ["relation", "only", ["node", "to"], { key: "node" }],
  ["relation", "calm", ["name"]],
  ["relation", "wide", ["node"]],
  ["relation", "shy", ["name"]],
  ["relation", "apart", ["a", "b"]],
  ["relation", "idle", ["name"]],
  ["relation", "hops", ["to", "count"]],
  // Recursion.
  ["rule", ["path", "?x", "?y"], ["edge", "?x", "?y"]],
  ["rule", ["path", "?x", "?z"], ["path", "?x", "?y"], ["edge", "?y", "?z"]],
  // Two rows of one relation, which one change can take away together.
  ["rule", ["hop", "?x", "?z"], ["edge", "?x", "?y"], ["edge", "?y", "?z"]],
  // Rows derived from derived rows.
  [
    "rule",
    ["far", "?x", "?z"],
    ["path", "?x", "?y"],
    ["path", "?y", "?z"],
    ["not", ["=", "?x", "?z"]],
  ],
  // A relation with facts of its own, which its rule can give as well.
  ["rule", ["hub", "?n"], ["path", "?n", "?x"], ["path", "?x", "?n"]],
  ["rule", ["cancelled", "?id"], ["order", "?id", "shipped"]],
  // An aggregate, and a rule that reads it.
  ["rule", ["degree", "?n", ["aggregate/count", "?to"]], ["edge", "?n", "?to"]],
  [
    "rule",
    ["busy", "?n"],
    ["degree", "?n", "?k"],
    ["number/greaterThan", "?k", 1],
  ],
  // Questions about what changes: under "not", and in a find.
  ["rule", ["lonely", "?n"], ["node", "?n"], ["not", ["edge", "?n", "?_"]]],
  [
    "rule",
    ["reach", "?n", ["aggregate/count", ["find", "?t", ["path", "?n", "?t"]]]],
    ["node", "?n"],
  ],
  // A rule that reads what a find counted.
  [
    "rule",
    ["wide", "?n"],
    ["reach", "?n", "?k"],
    ["number/greaterThan", "?k", 1],
  ],
  // A rule that invents, into a relation with a key.
  ["rule", ["exists", ["?w"], ["owner", "?n", "?w"]], ["node", "?n"]],
  // Two goals under "not", which one change can both end.
  [
    "rule",
    ["calm", "?n"],
    ["node", "?n"],
    ["not", ["edge", "?n", "?_"]],
    ["not", ["hub", "?n"]],
  ],
  // Two goals under "not" that one row can end at once: an edge from a
  // node to itself.
  [
    "rule",
    ["apart", "?x", "?y"],
    ["node", "?x"],
    ["node", "?y"],
    ["not", ["edge", "?x", "?y"]],
    ["not", ["edge", "?y", "?x"]],
  ],
  // A goal under "not" whose anonymous variables each fit any value.
  ["rule", ["idle", "?n"], ["node", "?n"], ["not", ["order", "?_", "?_"]]],
  // A goal under "not" with a test beside it: no edge to "b".
  [
    "rule",
    ["shy", "?n"],
    ["node", "?n"],
    ["not", ["and", ["edge", "?n", "?t"], ["=", "?t", "b"]]],
  ],
  // An aggregate that recurses: the fewest edges from "a".
  ["rule", ["hops", "?to", ["aggregate/min", 1]], ["edge", "a", "?to"]],
  [
    "rule",
    ["hops", "?to", ["aggregate/min", ["number/add", "?k", 1]]],
    ["hops", "?via", "?k"],
    ["edge", "?via", "?to"],
  ],
  // A rule that invents only where no fact says who.
  ["rule", ["exists", ["?w"], ["tag", "?n", "?w"]], ["node", "?n"]],
  // A key that two derived rows can break, which fails the question.
  ["rule", ["only", "?n", "?t"], ["edge", "?n", "?t"]],
  // A graph algorithm over the facts.
  ["rule", ["grouped", "?n", "?g"], ["graph/components", "edge", "?n", "?g"]],
];

/** Refuses a change that closes a cycle, so some changes are undone. */
const NO_CYCLES: Form = ["invariant", ["path", "?x", "?x"], { assert: "none" }];

const QUESTIONS: readonly Form[] = [
  ["query", ["path", "?x", "?y"]],
  ["query", ["hop", "?x", "?y"]],
  ["query", ["far", "?x", "?y"]],
  ["query", ["hub", "?n"]],
  ["query", ["cancelled", "?id"]],
  ["query", ["degree", "?n", "?k"]],
  ["query", ["busy", "?n"]],
  ["query", ["lonely", "?n"]],
  ["query", ["reach", "?n", "?k"]],
  ["query", ["owner", "?n", "?w"]],
  ["query", ["grouped", "?n", "?g"]],
  ["query", ["tag", "?n", "?w"]],
  ["query", ["only", "?n", "?t"]],
  ["query", ["calm", "?n"]],
  ["query", ["wide", "?n"]],
  ["query", ["shy", "?n"]],
  ["query", ["apart", "?x", "?y"]],
  ["query", ["idle", "?n"]],
  ["query", ["hops", "?to", "?k"]],
  ["query", ["graph/components", "edge", "?n", "?g"]],
  // Questions that know an argument, which are answered goal-directed.
  ["query", ["path", "a", "?y"]],
  ["query", ["far", "?x", "c"]],
  ["query", ["and", ["node", "?n"], ["not", ["path", "?n", "a"]]]],
  ["find", "?x", ["and", ["hop", "?x", "?y"], ["hub", "?y"]]],
];

/** The questions whose answers are rows `why` can explain. */
const EXPLAINED: readonly (readonly [number, string, readonly string[]])[] = [
  [0, "path", ["x", "y"]],
  [1, "hop", ["x", "y"]],
  [2, "far", ["x", "y"]],
  [3, "hub", ["n"]],
  [4, "cancelled", ["id"]],
];

const node = element(NODES);
const id = element([1, 2, 3]);

const fact: Arbitrary.Arbitrary<Form> = oneOf<Form>(
  Arbitrary.map(Arbitrary.all([node, node]), ([from, to]) => [
    "edge",
    from,
    to,
  ]),
  Arbitrary.map(Arbitrary.all([node, node]), ([from, to]) => [
    "edge",
    from,
    to,
  ]),
  Arbitrary.map(node, (name) => ["node", name]),
  Arbitrary.map(node, (name) => ["hub", name]),
  Arbitrary.map(node, (name) => ["tag", name, "ann"]),
  Arbitrary.map(id, (order) => ["cancelled", order]),
  Arbitrary.map(Arbitrary.all([id, element(["open", "shipped"])]), (row) => [
    "order",
    ...row,
  ])
);

const asked = Arbitrary.array(element(QUESTIONS.map((_, at) => at)), {
  maxLength: 6,
});

interface Step {
  readonly asked: readonly number[];
  readonly form: string;
  readonly items: readonly Form[];
}

/**
 * Facts to start from, then changes. A retract mostly names facts the
 * start holds, so it takes rows away, and often several at once.
 */
const given = Arbitrary.flatMap(
  Arbitrary.array(fact, { maxLength: 10 }),
  (start) => {
    const present = start.length > 0 ? element(start) : fact;
    const add = Arbitrary.array(fact, { minLength: 1, maxLength: 3 });
    const remove = Arbitrary.array(oneOf(present, present, present, fact), {
      minLength: 1,
      maxLength: 4,
    });
    const step = oneOf<Step>(
      Arbitrary.all({ asked, form: element(["fact"]), items: add }),
      Arbitrary.all({ asked, form: element(["retract"]), items: remove })
    );
    return Arbitrary.all({
      goalDirected: element([true, false]),
      guarded: element([false, false, true]),
      // What is asked before any change is derived when the first arrives.
      first: asked,
      start: element([start]),
      steps: Arbitrary.array(step, { minLength: 1, maxLength: 10 }),
    });
  }
);

/** An answer with its rows in one order, since a query gives them in any. */
const settled = (outcome: unknown) => {
  const { ok, value } = outcome as { ok: boolean; value?: unknown };
  return ok && Array.isArray(value)
    ? [...value].map((row) => JSON.stringify(row)).sort()
    : outcome;
};

interface Explained {
  readonly because?: readonly Explained[];
  readonly fact?: unknown;
  readonly given?: boolean;
}

/** The rows an explanation shows as given, however deep. */
const givenIn = (explained: Explained | null): unknown[] => {
  if (explained === null || explained.fact === undefined) {
    return [];
  }
  return explained.given
    ? [explained.fact]
    : (explained.because ?? []).flatMap(givenIn);
};

// A break in one kind of rule shows only when a change meets a relation of
// that kind that was already derived, so the property runs often.
const OPTIONS = { timeout: 300_000, arbitrary: { runs: 1000 } };

describe("a database that keeps what it derived through changes", () => {
  it.effect.prop(
    "answers as a database that has derived nothing yet",
    { given },
    ({ given: { first, goalDirected, guarded, start, steps } }) =>
      Effect.gen(function* () {
        const kept = new LogicDatabase({ goalDirected });
        expect(yield* attempt(["begin", ...SETUP, true], kept)).toEqual({
          ok: true,
          value: true,
        });
        // The start may hold a cycle, which the invariant then refuses.
        yield* attempt(
          [
            "begin",
            ...(start.length > 0 ? [["fact", ...start]] : []),
            ...(guarded ? [NO_CYCLES] : []),
          ],
          kept
        );
        for (const at of first) {
          yield* attempt(QUESTIONS[at], kept);
        }
        for (const { asked: questions, form, items } of steps) {
          yield* attempt([form, ...items], kept);
          const fresh = yield* loadDatabase(
            JSON.parse(JSON.stringify(yield* saveDatabase(kept))),
            stdlib
          );
          for (const at of questions) {
            const question = QUESTIONS[at] as Form;
            expect(settled(yield* attempt(question, kept))).toEqual(
              settled(yield* attempt(question, fresh))
            );
          }
          for (const [at, relation, names] of EXPLAINED) {
            if (!questions.includes(at)) {
              continue;
            }
            const rows = yield* attempt(QUESTIONS[at], kept);
            for (const row of (rows as { value: Record<string, unknown>[] })
              .value) {
              const why = [
                "why",
                [relation, ...names.map((name) => row[name])],
              ];
              const explained = yield* attempt(why, kept);
              expect(explained).toMatchObject({ ok: true });
              const { value } = explained as { value: Explained | null };
              // A row is given exactly when it is a fact, whichever came
              // first: the fact, or an answer that derived the row.
              expect(value?.given ?? false).toBe(
                ((yield* attempt(why, fresh)) as { value: Explained | null })
                  .value?.given ?? false
              );
              const facts = givenIn(value);
              for (const shown of facts) {
                // What is shown as given is given: a fresh database, which
                // derived nothing before the change, says so too.
                expect(yield* attempt(["why", shown], fresh)).toMatchObject({
                  value: { given: true },
                });
              }
            }
          }
        }
      }),
    OPTIONS
  );
});

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
 * a key, through a rule that invents, through a schema, and through a graph
 * algorithm. Some
 * steps add a rule instead of facts, which the database follows too. Which questions are asked after each
 * change is generated too, so what is already derived when the next change
 * arrives differs from run to run.
 *
 * An explanation must rest on what holds: every row `why` shows as given
 * is a fact, also for a row that was derived before a change took away
 * what first gave it.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect } from "effect";
import { run } from "@/evaluation/evaluate";
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
  ["relation", "tagged", ["node"]],
  ["relation", "owned", ["node"]],
  ["relation", "bare", ["name"]],
  ["relation", "known", ["name"]],
  ["relation", "listed", ["name"]],
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
  // Rules that read what a rule that invents gave, without a key and
  // with one.
  ["rule", ["tagged", "?n"], ["tag", "?n", "?_"]],
  ["rule", ["owned", "?n"], ["owner", "?n", "?_"]],
  // A question whose variable is its own, though the body has one by the
  // same name: no hub at all.
  [
    "rule",
    ["bare", "?n"],
    ["node", "?n"],
    ["not", ["exists", ["?n"], ["hub", "?n"]]],
  ],
  // A relation read as a schema, where no relation goal shows it.
  ["rule", ["known", "?n"], ["node", "?n"], ["schema/fits?", "?n", "hub"]],
  [
    "rule",
    ["listed", "?x"],
    ["edge", "?x", "?_"],
    ["schema/fits?", "?x", "node"],
  ],
  // A graph algorithm over the facts.
  ["rule", ["grouped", "?n", "?g"], ["graph/components", "edge", "?n", "?g"]],
];

/**
 * Rules a step can add after the database has derived rows: into a
 * relation that recurses, into ones with facts of their own, and from a
 * derived relation into one that had only read facts.
 */
const LATER: readonly Form[] = [
  ["rule", ["path", "?y", "?x"], ["edge", "?x", "?y"]],
  ["rule", ["hub", "?n"], ["node", "?n"], ["edge", "?n", "?n"]],
  ["rule", ["cancelled", "?id"], ["order", "?id", "open"]],
  ["rule", ["lonely", "?n"], ["hub", "?n"]],
  ["rule", ["far", "?x", "?y"], ["hop", "?x", "?y"]],
  ["rule", ["shy", "?n"], ["busy", "?n"]],
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
  ["query", ["tagged", "?n"]],
  ["query", ["owned", "?n"]],
  ["query", ["bare", "?n"]],
  ["query", ["known", "?n"]],
  ["query", ["listed", "?x"]],
  ["query", ["hops", "?to", "?k"]],
  ["query", ["graph/components", "edge", "?n", "?g"]],
  // An algorithm over derived rows, which no rule reads.
  ["query", ["graph/components", "hop", "?n", "?g"]],
  // Questions that know an argument, which are answered goal-directed.
  ["query", ["path", "a", "?y"]],
  ["query", ["far", "?x", "c"]],
  ["query", ["hub", "a"]],
  ["query", ["cancelled", 1]],
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
    const rule = Arbitrary.map(element(LATER), (form) => [form]);
    const step = oneOf<Step>(
      Arbitrary.all({ asked, form: element(["fact"]), items: add }),
      Arbitrary.all({ asked, form: element(["fact"]), items: add }),
      Arbitrary.all({ asked, form: element(["retract"]), items: remove }),
      Arbitrary.all({ asked, form: element(["retract"]), items: remove }),
      Arbitrary.all({ asked, form: element(["rule"]), items: rule })
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
          yield* attempt(form === "rule" ? items[0] : [form, ...items], kept);
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

/**
 * The rules without two relations: the keyed one, whose rows a change can
 * refuse, and the one that reads a relation as a schema, which is followed
 * or not by what changed.
 */
const apart = (form: Form) =>
  !['"only"', '"known"', '"listed"'].some((name) =>
    JSON.stringify(form).includes(name)
  );

const FOLLOWED = SETUP.filter(apart);

const EVERYTHING = QUESTIONS.filter(apart);

/** What a change does with a relation it reaches, once it was read. */
const HOW: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    FOLLOWED.flatMap((form) =>
      form[0] === "relation" ? [[form[1] as string, "followed"]] : []
    )
  ),
  // A rule that invents into a relation with a key, and a rule that
  // reads a graph algorithm.
  owner: "derived",
  grouped: "derived",
};

/**
 * What a change does with a relation, when nothing was read since the last
 * one: a relation it cannot follow is forgotten, and so is the one relation
 * here that reads such a relation.
 */
const unreadHow = (name: string) =>
  HOW[name] === "derived" || name === "owned" ? "forgotten" : HOW[name];

/** The derived relations a change to each relation's facts always reaches. */
const READERS: Readonly<Record<string, readonly string[]>> = {
  edge: [
    "path",
    "hop",
    "degree",
    "lonely",
    "calm",
    "shy",
    "apart",
    "hops",
    "grouped",
  ],
  node: [
    "lonely",
    "reach",
    "owner",
    "tag",
    "calm",
    "shy",
    "apart",
    "idle",
    "bare",
  ],
  order: ["cancelled", "idle"],
  // A fact for a row a rule already gives changes no row, so the relations
  // that read these are reached only when their rows change.
  hub: ["hub"],
  cancelled: ["cancelled"],
  tag: ["tag"],
};

/** The facts of a database, by relation, as its snapshot writes them. */
const factsOf = (database: LogicDatabase) =>
  Effect.map(saveDatabase(database), (program) =>
    Object.fromEntries(
      (program as Form[]).flatMap((form) =>
        form[0] === "fact"
          ? [[(form[1] as Form)[0] as string, JSON.stringify(form)]]
          : []
      )
    )
  );

const change = Arbitrary.all({
  form: element(["fact", "retract"]),
  items: Arbitrary.array(fact, { minLength: 1, maxLength: 3 }),
});

describe("what a change does with what was derived", () => {
  it.effect.prop(
    "is to follow it through every rule it can, and to derive the rest again once it was read",
    {
      first: change,
      second: change,
      start: Arbitrary.array(fact, { maxLength: 10 }),
    },
    ({ first, second, start }) =>
      Effect.gen(function* () {
        const kept = new LogicDatabase();
        yield* attempt(["begin", ...FOLLOWED, true], kept);
        yield* attempt(["fact", ...start, ["node", "a"]], kept);
        const askAll = Effect.forEach(EVERYTHING, (question) =>
          attempt(question, kept)
        );
        yield* askAll;
        const model = kept.model;
        // Two changes in a row, with nothing read between them, and then
        // one more after everything was read again.
        let unread = false;
        for (const [at, { form, items }] of [first, second, first].entries()) {
          const before = yield* factsOf(kept);
          yield* attempt([form, ...items], kept);
          const after = yield* factsOf(kept);
          const moved = Object.keys(READERS).filter(
            (name) => before[name] !== after[name]
          );
          expect(kept.model).toBe(model);
          const last = new Map(kept.model?.last ?? []);
          for (const name of moved.flatMap((base) => READERS[base] ?? [])) {
            expect([name, last.get(name)]).toEqual([
              name,
              unread ? unreadHow(name) : HOW[name],
            ]);
          }
          // A step that changed no fact left what the last one did.
          const same = JSON.stringify(before) === JSON.stringify(after);
          for (const [name, how] of same ? [] : last) {
            expect([name, how]).toEqual([
              name,
              unread ? unreadHow(name) : HOW[name],
            ]);
          }
          unread ||= !same;
          if (at === 0) {
            continue;
          }
          // Every relation was derived before these changes, so every one
          // went through them: each must answer as one derived from nothing.
          const fresh = yield* loadDatabase(
            JSON.parse(JSON.stringify(yield* saveDatabase(kept))),
            stdlib
          );
          for (const question of EVERYTHING) {
            expect(settled(yield* attempt(question, kept))).toEqual(
              settled(yield* attempt(question, fresh))
            );
          }
          // The questions just asked read everything again.
          unread = false;
        }
      }),
    { timeout: 300_000, arbitrary: { runs: 300 } }
  );

  it.effect.prop(
    "keeps the rows a goal-directed query derived, and the model a refused change met",
    {
      edges: Arbitrary.array(Arbitrary.all([node, node]), {
        minLength: 1,
        maxLength: 6,
      }),
      more: Arbitrary.array(Arbitrary.all([node, node]), {
        minLength: 1,
        maxLength: 3,
      }),
    },
    ({ edges, more }) =>
      Effect.gen(function* () {
        const kept = new LogicDatabase();
        yield* attempt(["begin", ...FOLLOWED, true], kept);
        yield* attempt(
          ["fact", ...edges.map(([from, to]) => ["edge", from, to])],
          kept
        );
        // A question that knows an argument, of a relation not derived yet.
        const question = ["query", ["path", "a", "?y"]];
        yield* attempt(question, kept);
        expect(kept.goals.size).toBe(1);
        const [goal] = [...kept.goals.values()];
        const facts = yield* factsOf(kept);
        yield* attempt(
          ["fact", ...more.map(([from, to]) => ["edge", from, to])],
          kept
        );
        expect([...kept.goals.values()]).toEqual([goal]);
        const moved = (yield* factsOf(kept)).edge !== facts.edge;
        expect([...(goal?.model.last.values() ?? [])]).toEqual(
          moved
            ? [...(goal?.model.last.values() ?? [])].map(() => "followed")
            : []
        );
        expect(moved ? (goal?.model.last.size ?? 0) > 0 : true).toBe(true);
        // A change an invariant refuses leaves the model it met in place.
        yield* attempt(["begin", ["query", ["far", "?x", "?y"]], true], kept);
        const refusing = yield* attempt(
          ["invariant", ["edge", "?x", "zz"], { assert: "none" }],
          kept
        );
        expect(refusing).toMatchObject({ ok: true });
        const model = kept.model;
        const refused = yield* attempt(["fact", ["edge", "a", "zz"]], kept);
        expect(refused).toMatchObject({ ok: false });
        expect(kept.model).toBe(model);
        expect(kept.model?.state.get("path")).toBe("done");
        expect(kept.model?.state.get("far")).toBe("done");
        // A new rule derives its own relation again, once it was read, and
        // leaves the rows of the others where they are.
        yield* attempt(["query", ["hub", "?n"]], kept);
        const paths = kept.model?.relations.get("path");
        expect(yield* attempt(LATER[1], kept)).toMatchObject({ ok: true });
        expect(kept.model?.last.get("hub")).toBe("derived");
        expect(kept.model?.relations.get("path")).toBe(paths);
        expect(kept.model?.state.get("far")).toBe("done");
      }),
    { timeout: 120_000 }
  );
});

/** Questions that know an argument, of relations of every kind. */
const KNOWN: readonly Form[] = [
  ["query", ["path", "a", "?y"]],
  ["query", ["path", "?x", "b"]],
  ["query", ["far", "?x", "c"]],
  ["query", ["hub", "a"]],
  ["query", ["hub", "b"]],
  ["query", ["cancelled", 1]],
  ["query", ["cancelled", 2]],
  ["query", ["lonely", "a"]],
  ["query", ["degree", "a", "?k"]],
  ["query", ["reach", "b", "?k"]],
  ["query", ["and", ["node", "?n"], ["path", "?n", "a"]]],
];

describe("a goal-directed query that keeps what it derived", () => {
  it.effect.prop(
    "answers after each change as a database that has derived nothing yet",
    {
      start: Arbitrary.array(fact, { maxLength: 10 }),
      steps: Arbitrary.array(
        Arbitrary.all({
          asked: Arbitrary.array(element(KNOWN), {
            minLength: 1,
            maxLength: 3,
          }),
          change,
        }),
        { minLength: 1, maxLength: 8 }
      ),
    },
    ({ start, steps }) =>
      Effect.gen(function* () {
        const kept = new LogicDatabase();
        yield* attempt(["begin", ...FOLLOWED, true], kept);
        yield* attempt(["fact", ...start, ["node", "a"]], kept);
        for (const { asked: questions, change: step } of steps) {
          for (const question of questions) {
            yield* attempt(question, kept);
          }
          yield* attempt([step.form, ...step.items], kept);
          const fresh = yield* loadDatabase(
            JSON.parse(JSON.stringify(yield* saveDatabase(kept))),
            stdlib
          );
          for (const question of questions) {
            expect(settled(yield* attempt(question, kept))).toEqual(
              settled(yield* attempt(question, fresh))
            );
          }
        }
      }),
    { timeout: 300_000, arbitrary: { runs: 500 } }
  );
});

/**
 * A function from the host that asks the database which members `q` holds,
 * without being handed the relation: Lion cannot see what it reads.
 */
const hosting = (database: LogicDatabase) => ({
  ...stdlib,
  "host/in-q?": (x: unknown) =>
    Effect.map(
      run(["find", "?v", ["q", "?v"]], stdlib, { database }),
      (found) => (found as unknown[]).includes(x)
    ),
});

// The rule that holds the host function comes before the rule that derives
// what the function reads, so nothing but the order of upkeep puts it last.
const HOSTED: readonly Form[] = [
  ["relation", "p", ["x"]],
  ["relation", "q", ["x"]],
  ["relation", "link", ["from", "to"]],
  ["relation", "hosted", ["x"]],
  ["rule", ["hosted", "?x"], ["p", "?x"], ["host/in-q?", "?x"]],
  ["rule", ["q", "?x"], ["link", "?x", "?x"]],
];

const member = element([0, 1, 2]);

const hostedFact: Arbitrary.Arbitrary<Form> = oneOf<Form>(
  Arbitrary.map(member, (x) => ["p", x]),
  Arbitrary.map(member, (x) => ["q", x]),
  Arbitrary.map(Arbitrary.all([member, member]), ([from, to]) => [
    "link",
    from,
    to,
  ])
);

describe("a rule that holds a function from the host", () => {
  it.effect.prop(
    "is brought up to date after everything the function may read",
    {
      start: Arbitrary.array(hostedFact, { maxLength: 6 }),
      steps: Arbitrary.array(
        Arbitrary.all({
          form: element(["fact", "fact", "retract"]),
          items: Arbitrary.array(hostedFact, { minLength: 1, maxLength: 2 }),
        }),
        { minLength: 1, maxLength: 6 }
      ),
    },
    ({ start, steps }) =>
      Effect.gen(function* () {
        const kept = new LogicDatabase();
        const question = ["query", ["hosted", "?x"]];
        const begin = [
          "begin",
          ...HOSTED,
          ...(start.length > 0 ? [["fact", ...start]] : []),
          true,
        ];
        expect(yield* attempt(begin, kept, hosting(kept))).toMatchObject({
          ok: true,
        });
        const changes: Form[] = [];
        for (const { form, items } of steps) {
          // Asked before each change, so the relation was read since the
          // last one and is derived again when the change is made.
          yield* attempt(question, kept, hosting(kept));
          changes.push([form, ...items]);
          yield* attempt([form, ...items], kept, hosting(kept));
          const fresh = new LogicDatabase();
          yield* attempt([...begin, ...changes], fresh, hosting(fresh));
          expect(
            settled(yield* attempt(question, kept, hosting(kept)))
          ).toEqual(settled(yield* attempt(question, fresh, hosting(fresh))));
        }
      }),
    { timeout: 120_000, arbitrary: { runs: 300 } }
  );
});

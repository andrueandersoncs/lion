import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { analyze } from "@/analysis/analyze";
import { run } from "@/evaluation/evaluate";
import { LogicDatabase } from "@/logic/database";
import { loadDatabase, saveDatabase } from "@/logic/snapshot";
import { stdlib } from "@/modules";
import {
  attempt,
  change,
  edgeFact,
  element,
  INVARIANTS,
  invariant,
  name,
  oneOf,
  RULES,
  type Scenario,
  scenario,
  start,
} from "./programs";

type Form = readonly unknown[];

const QUERY_ASSERTION = "The query expected";

const isInvariantForm = (form: unknown) =>
  Array.isArray(form) && form[0] === "invariant";

const sameForm = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/** True for a `rule` or `invariant` form, which `retract` takes back. */
const isProgramForm = (item: unknown) =>
  Array.isArray(item) && (item[0] === "rule" || item[0] === "invariant");

/**
 * "Adding these facts", "Retracting this fact", or "Adding this rule"; a
 * retract that takes back a rule or invariant is "Retracting this rule".
 */
const describeChange = ([form, ...items]: Form, takesBack: boolean) => {
  const facts = items.filter((item) => !isProgramForm(item));
  const these = facts.length === 1 ? "this fact" : "these facts";
  if (form === "fact") {
    return `Adding ${these}`;
  }
  if (form === "retract") {
    return takesBack ? "Retracting this rule" : `Retracting ${these}`;
  }
  return "Adding this rule";
};

/** The message a failed query assertion becomes when an invariant fails it. */
const invariantMessage = (context: string, queryMessage: string) =>
  queryMessage.startsWith(QUERY_ASSERTION)
    ? `${context} ${queryMessage.replace("The query", "The invariant")}`
    : queryMessage;

interface Expected {
  readonly after: readonly unknown[];
  readonly outcome:
    | { readonly ok: true; readonly value: unknown }
    | { readonly ok: false; readonly message: string };
}

/**
 * What a change must do, worked out without invariants: make the same change
 * on a copy of the database that has none, then ask each invariant that
 * stays as a query assertion. The change is kept only if every assertion
 * holds; a retract that takes back a rule or invariant takes back the facts
 * it names in the same change, or nothing.
 */
const expectChange = (before: readonly unknown[], form: Form) =>
  Effect.gen(function* () {
    const forms = before.slice(1);
    const invariants = forms.filter(isInvariantForm) as Form[];
    const dropped =
      form[0] === "retract"
        ? invariants.filter((held) =>
            form.slice(1).some((item) => sameForm(item, held))
          )
        : [];
    const stays = invariants.filter((held) => !dropped.includes(held));
    const copy = yield* loadDatabase(
      ["begin", ...forms.filter((item) => !isInvariantForm(item))],
      stdlib
    );
    const outcome = yield* attempt(form, copy);
    if (!outcome.ok) {
      return { after: before, outcome } satisfies Expected;
    }
    const takesBack =
      dropped.length > 0 ||
      (form[0] === "retract" &&
        (outcome.value as readonly unknown[]).some(isProgramForm));
    for (const [, goal, options] of stays) {
      const asked = yield* attempt(["query", goal, options], copy);
      if (!asked.ok) {
        const message = invariantMessage(
          `${describeChange(form, takesBack)} breaks an invariant, so nothing changed.`,
          asked.message
        );
        return { after: before, outcome: { ok: false, message } } as Expected;
      }
    }
    const after = [...(yield* saveDatabase(copy)), ...stays];
    const value =
      dropped.length > 0
        ? [...(outcome.value as readonly unknown[]), ...dropped]
        : outcome.value;
    return { after, outcome: { ok: true, value } } satisfies Expected;
  });

/**
 * What adding an invariant must do: it is added when its query assertion
 * holds, and adding one the database already holds changes nothing.
 */
const expectInvariant = (before: readonly unknown[], form: Form) =>
  Effect.gen(function* () {
    const [, goal, options] = form;
    const asked = yield* attempt(
      ["query", goal, options],
      yield* loadDatabase(before, stdlib)
    );
    if (!asked.ok) {
      const message = invariantMessage(
        "This invariant does not hold, so it was not added.",
        asked.message
      );
      return { after: before, outcome: { ok: false, message } } as Expected;
    }
    const held = before.some((item) => sameForm(item, form));
    return {
      after: held ? before : [...before, form],
      outcome: { ok: true, value: form },
    } satisfies Expected;
  });

/** Every outcome and the database after each step. */
const trace = (database: LogicDatabase, { setup, steps }: Scenario) =>
  Effect.gen(function* () {
    yield* start(database, { setup, steps });
    const seen: unknown[] = [];
    for (const step of steps) {
      seen.push(yield* attempt(step, database), yield* saveDatabase(database));
    }
    return seen;
  });

const OPTIONS = { timeout: 60_000 };

/** The model property runs more often, so every kind of rejection shows up. */
const MODEL_OPTIONS = { timeout: 120_000, arbitrary: { runs: 300 } };

describe("invariants", () => {
  it.effect.prop(
    "keep a change exactly when every invariant still holds as a query assertion",
    { scenario },
    ({ scenario: { setup, steps } }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        yield* start(database, { setup, steps });
        for (const step of steps) {
          const before = yield* saveDatabase(database);
          const expected = isInvariantForm(step)
            ? yield* expectInvariant(before, step)
            : yield* expectChange(before, step);
          expect(yield* attempt(step, database)).toEqual(expected.outcome);
          // A rejected change leaves the very same database, facts in the
          // same order; an accepted one matches the change made without
          // invariants.
          expect(yield* saveDatabase(database)).toEqual(expected.after);
        }
      }),
    MODEL_OPTIONS
  );

  it.effect.prop(
    "give the same verdicts with and without goal-directed queries",
    { scenario },
    ({ scenario: generated }) =>
      Effect.gen(function* () {
        expect(yield* trace(new LogicDatabase(), generated)).toEqual(
          yield* trace(new LogicDatabase({ goalDirected: false }), generated)
        );
      }),
    OPTIONS
  );

  it.effect.prop(
    "survive a snapshot: a loaded database holds them and judges changes the same way",
    { scenario, next: change },
    ({ scenario: generated, next }) =>
      Effect.gen(function* () {
        const original = new LogicDatabase();
        yield* trace(original, generated);
        const saved = yield* saveDatabase(original);
        const loaded = yield* loadDatabase(
          JSON.parse(JSON.stringify(saved)),
          stdlib
        );
        expect(yield* saveDatabase(loaded)).toEqual(saved);
        expect(yield* attempt(next, loaded)).toEqual(
          yield* attempt(next, original)
        );
        expect(yield* saveDatabase(loaded)).toEqual(
          yield* saveDatabase(original)
        );
      }),
    OPTIONS
  );

  const optionKey = element(["assert", "order", "limit", "name"]);
  const optionValue = element<unknown>(["some", "none", "never", 1, null]);
  const options = oneOf<unknown>(
    Arbitrary.map(
      Arbitrary.array(Arbitrary.all([optionKey, optionValue]), {
        maxLength: 3,
      }),
      (entries) => Object.fromEntries(entries)
    ),
    element<unknown>(["none", 0, null, ["assert", "none"]])
  );

  /** The problem with an options record, in the order they are reported. */
  const optionsProblem = (value: unknown) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return `Invariant options must be a record such as {"assert": "none"}, but found ${JSON.stringify(value)}.`;
    }
    const record = value as Record<string, unknown>;
    const unknown = Object.keys(record).find((key) => key !== "assert");
    if (unknown !== undefined) {
      return `Unknown invariant option "${unknown}". The only invariant option is "assert".`;
    }
    if (!("assert" in record)) {
      return `An invariant needs the option "assert", set to "some" or "none", such as {"assert": "none"}.`;
    }
    return record.assert === "some" || record.assert === "none"
      ? undefined
      : `The invariant option "assert" must be "some" or "none", but found ${JSON.stringify(record.assert)}.`;
  };

  it.effect.prop(
    'take only the option "assert", set to "some" or "none"',
    { options },
    ({ options: given }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        yield* start(database, { setup: [], steps: [] });
        const goal = ["edge", "?x", "?y"];
        const outcome = yield* attempt(["invariant", goal, given], database);
        const problem = optionsProblem(given);
        if (problem === undefined) {
          // With no edges, "none" holds and "some" does not.
          const asked = yield* attempt(["query", goal, given], database);
          expect(outcome.ok).toBe(asked.ok);
        } else {
          expect(outcome).toEqual({ ok: false, message: problem });
        }
        expect(database.invariants).toHaveLength(outcome.ok ? 1 : 0);
      })
  );

  const variable = Arbitrary.map(name, (text) => `?${text}`);
  // Two different variables: with one name, ?first would bind ?second.
  const unsafeGoal = Arbitrary.flatMap(
    Arbitrary.filter(
      Arbitrary.all([variable, variable]),
      ([first, second]) => first !== second
    ),
    ([first, second]) =>
      element<unknown>([
        ["number/greaterThan", first, 10],
        ["not", ["number/greaterThan", first, second]],
        ["=", first, ["number/add", second, 1]],
        ["and", ["edge", first, "?_"], ["number/lessThan", second, 3]],
      ])
  );

  it.effect.prop(
    "check their goals as queries do",
    { goal: unsafeGoal, assert: element(["some", "none"]) },
    ({ goal, assert }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        yield* start(database, { setup: [], steps: [] });
        const asked = yield* attempt(["query", goal], database);
        expect(asked.ok).toBe(false);
        expect(
          yield* attempt(["invariant", goal, { assert }], database)
        ).toEqual(asked);
      })
  );

  it.prop(
    "are classified by the analyzer, with a goal and options",
    { form: invariant, extra: element([0, 1, 2]) },
    ({ form, extra }) => {
      const node = analyze(form as never);
      expect(node.specialForm).toBe("invariant");
      expect(node.children.map(({ role }) => role)).toEqual([
        "operator",
        "goal",
        "options",
      ]);
      // Any other number of arguments is not an invariant form.
      const wrong = [["invariant"], ["invariant", form[1]], [...form, form[2]]][
        extra
      ];
      expect(analyze(wrong as never).kind).toBe("invalid-call");
    }
  );
});

describe("the message of a refused change", () => {
  // Edges among two nodes, so one form often adds several from a node to
  // itself, each an answer the invariant must count.
  const loops = Arbitrary.array(
    Arbitrary.map(
      Arbitrary.all([element(["a", "b"]), element(["a", "b"])]),
      ([from, to]): Form => ["edge", from, to]
    ),
    { minLength: 1, maxLength: 5 }
  );

  it.effect.prop(
    "counts every answer the change gave, as the goal asked in full does",
    { added: loops, given: loops },
    ({ added, given }) =>
      Effect.gen(function* () {
        const goal = ["edge", "?x", "?x"];
        const relation = ["relation", "edge", ["from", "to"]];
        // What is there before holds the invariant: no edge to itself.
        const before = given.filter(([, from, to]) => from !== to);
        const kept = new LogicDatabase();
        yield* attempt(
          [
            "begin",
            relation,
            ...(before.length > 0 ? [["fact", ...before]] : []),
            ["invariant", goal, { assert: "none" }],
          ],
          kept
        );
        const asked = yield* attempt(
          [
            "begin",
            relation,
            ["fact", ...before, ...added],
            ["query", goal, { assert: "none" }],
          ],
          new LogicDatabase()
        );
        const outcome = yield* attempt(["fact", ...added], kept);
        expect(outcome).toEqual(
          asked.ok
            ? { ok: true, value: added }
            : {
                ok: false,
                message: invariantMessage(
                  `Adding ${added.length === 1 ? "this fact" : "these facts"} breaks an invariant, so nothing changed.`,
                  asked.message
                ),
              }
        );
      })
  );
});

describe("changes to the database", () => {
  const edges = Arbitrary.array(edgeFact, { minLength: 1, maxLength: 5 });

  it.effect.prop(
    "are all or nothing: a form with one bad fact changes nothing",
    {
      given: edges,
      touched: edges,
      form: element(["fact", "retract"]),
      at: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 }))
      ),
    },
    ({ given, touched, form, at }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        yield* start(database, { setup: [["fact", ...given]], steps: [] });
        const before = yield* saveDatabase(database);
        const bad = ["edge", "?x", "b"];
        const items = [...touched];
        items.splice(Math.min(at, items.length), 0, bad);
        expect(yield* attempt([form, ...items], database)).toEqual({
          ok: false,
          message:
            'Facts may only contain data, but the "from" of ["edge","?x","b"] is the logic variable "?x". To mean the string itself, write ["quote", "?x"].',
        });
        expect(yield* saveDatabase(database)).toEqual(before);
      })
  );
  /** Every row of the relations the rules derive, sorted. */
  const LOOK = {
    path: ["find", ["array/make", "?x", "?y"], ["path", "?x", "?y"]],
    degree: ["find", ["array/make", "?n", "?k"], ["degree", "?n", "?k"]],
    cancelled: ["find", "?i", ["cancelled", "?i"]],
  };

  /** Edges, rules, and invariants, and a retract of some of each. */
  const mixed = Arbitrary.flatMap(
    Arbitrary.all({
      edges,
      rules: Arbitrary.array(element(RULES), { minLength: 1, maxLength: 3 }),
      invariants: Arbitrary.array(element(INVARIANTS), { maxLength: 3 }),
    }),
    (given) =>
      Arbitrary.map(
        Arbitrary.all([
          Arbitrary.array(oneOf(element(given.edges), edgeFact), {
            maxLength: 2,
          }),
          Arbitrary.array(
            oneOf(
              element(given.rules),
              element(given.rules),
              element(INVARIANTS)
            ),
            { minLength: 1, maxLength: 2 }
          ),
        ]),
        ([facts, forms]) => ({
          ...given,
          form: ["retract", ...facts, ...forms] as Form,
        })
      )
  );

  it.effect.prop(
    "are all or nothing: a retract of facts, rules, and invariants makes every change or none",
    { mixed },
    ({ mixed: { edges: given, rules, invariants, form } }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        yield* start(database, {
          setup: [["fact", ...given], ...rules],
          steps: [],
        });
        for (const each of invariants) {
          yield* attempt(each, database);
        }
        const before = yield* saveDatabase(database);
        // Rows derived before the change, which it must bring up to date.
        yield* attempt(LOOK, database);
        const expected = yield* expectChange(before, form);
        expect(yield* attempt(form, database)).toEqual(expected.outcome);
        const after = yield* saveDatabase(database);
        expect(after).toEqual(expected.after);
        expect(yield* attempt(LOOK, database)).toEqual(
          yield* attempt(LOOK, yield* loadDatabase(after, stdlib))
        );
      }),
    { timeout: 120_000, arbitrary: { runs: 300 } }
  );
});

describe("an invariant that holds a function from the host", () => {
  const member = element([0, 1, 2, 3]);
  const step = Arbitrary.all([
    element(["fact", "fact", "retract"] as const),
    element(["p", "q"] as const),
    member,
  ]);

  /**
   * The standard library, and a function that reads `q` from the database
   * on its own, so Lion cannot tell that what it gives depends on `q`.
   */
  const hosted = (database: LogicDatabase) => ({
    ...stdlib,
    "host/in-q?": (x: unknown) =>
      Effect.map(
        run(["find", "?v", ["q", "?v"]], stdlib, { database }),
        (found) => (found as unknown[]).includes(x)
      ),
  });

  it.effect.prop(
    "is asked after every change, also one to a relation it names nowhere, as a plain model of what the function reads says",
    {
      steps: Arbitrary.array(step, { minLength: 1, maxLength: 10 }),
      assert: element(["none", "some"] as const),
      goalDirected: element([true, false]),
    },
    ({ steps, assert, goalDirected }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase({ goalDirected });
        const host = hosted(database);
        const go = (program: unknown) => attempt(program, database, host);
        // No p is in q, or some p is, with `q` read only by the function.
        const holds = (p: ReadonlySet<number>, q: ReadonlySet<number>) =>
          [...p].some((x) => q.has(x)) === (assert === "some");
        let p = new Set<number>(assert === "some" ? [0] : []);
        let q = new Set<number>(assert === "some" ? [0] : []);
        yield* go([
          "begin",
          ["relation", "p", ["x"]],
          ["relation", "q", ["x"]],
          ...(assert === "some" ? [["fact", ["p", 0], ["q", 0]]] : []),
        ]);
        expect(
          yield* go([
            "invariant",
            ["and", ["p", "?x"], ["host/in-q?", "?x"]],
            { assert },
          ])
        ).toMatchObject({ ok: true });
        for (const [form, relation, x] of steps) {
          const next = {
            p: new Set(p),
            q: new Set(q),
          };
          if (form === "fact") {
            next[relation].add(x);
          } else {
            next[relation].delete(x);
          }
          const outcome = yield* go([form, [relation, x]]);
          expect(outcome.ok).toBe(holds(next.p, next.q));
          if (outcome.ok) {
            p = next.p;
            q = next.q;
          }
          expect(
            yield* go({
              p: ["find", "?x", ["p", "?x"]],
              q: ["find", "?x", ["q", "?x"]],
            })
          ).toEqual({
            ok: true,
            value: { p: [...p].sort(), q: [...q].sort() },
          });
        }
      }),
    { timeout: 120_000, arbitrary: { runs: 200 } }
  );
});

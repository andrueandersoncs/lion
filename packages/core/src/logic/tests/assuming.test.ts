/**
 * Asking what would hold after some changes: `assuming` gives what its
 * expression gives in the database as it would be after its `fact`,
 * `retract`, and `rule` forms, made as those forms make them, and leaves
 * the database as it was. A `retract` takes back rules and invariants as
 * well as facts. No invariant refuses a change that is only assumed.
 * Checked against the same changes made for real on a database of its own
 * that has the same facts and rules and no invariants, and against a
 * database that never had the rules an assumption takes back.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect } from "effect";
import { LogicDatabase } from "@/logic/database";
import { loadDatabase, saveDatabase } from "@/logic/snapshot";
import { stdlib } from "@/modules";
import {
  attempt,
  DECLARATIONS,
  element,
  fact,
  INVARIANTS,
  NODES,
  oneOf,
  RULES,
} from "./programs";

type Form = unknown;

const OPTIONS = { timeout: 120_000, arbitrary: { runs: 200 } };

const MODES = [true, false];

/** Facts and rules to start from, and invariants to keep. */
const start = Arbitrary.all({
  facts: Arbitrary.array(fact, { maxLength: 8 }),
  rules: Arbitrary.array(element(RULES), { maxLength: 3 }),
  invariants: Arbitrary.array(element(INVARIANTS), { maxLength: 2 }),
});

/** The forms of a start, with its invariants added where they hold. */
const setup = ({
  facts,
  rules,
}: {
  readonly facts: readonly Form[];
  readonly rules: readonly Form[];
}): Form[] => [
  ...DECLARATIONS,
  ...(facts.length > 0 ? [["fact", ...facts]] : []),
  ...rules,
];

/** A `fact` or `retract` form of a few facts. */
const factChange = Arbitrary.map(
  Arbitrary.all([
    element(["fact", "fact", "retract"] as const),
    Arbitrary.array(fact, { minLength: 1, maxLength: 3 }),
  ]),
  ([form, items]): Form => [form, ...items]
);

/** A `retract` form of rules and invariants, with facts or without. */
const takeBack = Arbitrary.map(
  Arbitrary.all([
    Arbitrary.array(fact, { maxLength: 2 }),
    Arbitrary.array(
      oneOf<Form>(element(RULES), element(RULES), element(INVARIANTS)),
      {
        minLength: 1,
        maxLength: 2,
      }
    ),
  ]),
  ([facts, forms]): Form => ["retract", ...facts, ...forms]
);

/** A change: facts added or taken back, a rule added, or rules taken back. */
const changeForm = oneOf<Form>(
  factChange,
  factChange,
  element(RULES),
  takeBack
);

/** What a question can ask: every row of each relation, sorted. */
const LOOK: Form = {
  edge: ["find", ["array/make", "?x", "?y"], ["edge", "?x", "?y"]],
  path: ["find", ["array/make", "?x", "?y"], ["path", "?x", "?y"]],
  order: ["find", ["array/make", "?i", "?s"], ["order", "?i", "?s"]],
  cancelled: ["find", "?i", ["cancelled", "?i"]],
  degree: ["find", ["array/make", "?n", "?k"], ["degree", "?n", "?k"]],
  node: ["find", "?n", ["node", "?n"]],
};

/** Adds each invariant that holds, so a start never fails on one. */
const withInvariants = (database: LogicDatabase, invariants: readonly Form[]) =>
  Effect.forEach(invariants, (each) => attempt(each, database), {
    discard: true,
  });

describe("assuming", () => {
  it.effect.prop(
    "gives what the same changes made on a database of its own without invariants give, and leaves the database as it was",
    {
      given: start,
      changes: Arbitrary.array(changeForm, { minLength: 1, maxLength: 3 }),
      goalDirected: element(MODES),
    },
    ({ given, changes, goalDirected }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase({ goalDirected });
        const ready = yield* attempt(
          ["begin", ...setup(given), true],
          database
        );
        if (!ready.ok) {
          return;
        }
        yield* withInvariants(database, given.invariants);
        const before = yield* attempt(LOOK, database);
        const assumed = yield* attempt(
          ["assuming", ...changes, LOOK],
          database
        );
        // The model: the same changes, made for real on a database with the
        // same facts and rules and no invariants, since an invariant keeps
        // the database and does not refuse a change that is only assumed.
        const copy = new LogicDatabase({ goalDirected });
        yield* attempt(["begin", ...setup(given), true], copy);
        let made: { ok: boolean; message?: string } = { ok: true };
        for (const change of changes) {
          const outcome = yield* attempt(change, copy);
          if (!outcome.ok) {
            made = outcome;
            break;
          }
        }
        if (made.ok) {
          expect(assumed).toEqual(yield* attempt(LOOK, copy));
        } else {
          // A change refused for another reason is refused in the same words.
          expect(assumed).toEqual(made);
        }
        expect(yield* attempt(LOOK, database)).toEqual(before);
      }),
    OPTIONS
  );

  /** Two nodes, and whether to ask about a path between them. */
  const pair = Arbitrary.all([element(NODES), element(NODES)]);

  it.effect.prop(
    "asks for each answer of a rule what plain code asks with the answer's values",
    {
      given: start,
      asked: Arbitrary.array(pair, { minLength: 1, maxLength: 4 }),
      goalDirected: element(MODES),
    },
    ({ given, asked, goalDirected }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase({ goalDirected });
        const ready = yield* attempt(
          [
            "begin",
            ...setup(given),
            ["relation", "pair", ["from", "to"]],
            ["relation", "bridges", ["from", "to"]],
            ["fact", ...asked.map(([from, to]) => ["pair", from, to])],
            [
              "rule",
              ["bridges", "?x", "?y"],
              ["pair", "?x", "?y"],
              ["assuming", ["fact", ["edge", "?x", "?y"]], ["path", "a", "?y"]],
            ],
            true,
          ],
          database
        );
        if (!ready.ok) {
          return;
        }
        const derived = yield* attempt(
          ["find", ["array/make", "?x", "?y"], ["bridges", "?x", "?y"]],
          database
        );
        // Plain code, asked about each pair with its values in place.
        const plain: [string, string][] = [];
        for (const [from, to] of asked) {
          const outcome = yield* attempt(
            ["assuming", ["fact", ["edge", from, to]], ["path", "a", to]],
            database
          );
          if (!outcome.ok) {
            expect(derived).toMatchObject({ ok: false });
            return;
          }
          if (outcome.value === true) {
            plain.push([from, to]);
          }
        }
        const unique = [
          ...new Map(
            plain.map((each) => [JSON.stringify(each), each])
          ).values(),
        ].sort((x, y) => (JSON.stringify(x) < JSON.stringify(y) ? -1 : 1));
        expect(derived).toEqual({ ok: true, value: unique });
      }),
    OPTIONS
  );

  it.effect.prop(
    "a rule that assumes is the same after a snapshot",
    {
      given: start,
      asked: Arbitrary.array(pair, { minLength: 1, maxLength: 3 }),
    },
    ({ given, asked }) =>
      Effect.gen(function* () {
        const program = [
          ...setup(given),
          ["relation", "pair", ["from", "to"]],
          ["relation", "bridges", ["from", "to"]],
          ["fact", ...asked.map(([from, to]) => ["pair", from, to])],
          [
            "rule",
            ["bridges", "?x", "?y"],
            ["pair", "?x", "?y"],
            [
              "assuming",
              ["retract", ["edge", "?x", "?y"]],
              ["not", ["path", "?x", "?y"]],
            ],
          ],
        ];
        const ask: Form = [
          "find",
          ["array/make", "?x", "?y"],
          ["bridges", "?x", "?y"],
        ];
        const direct = yield* attempt(
          ["begin", ...program, ask],
          new LogicDatabase()
        );
        const snapshot = yield* attempt(
          ["begin", ...program, ["snapshot"]],
          new LogicDatabase()
        );
        if (!(direct.ok && snapshot.ok)) {
          return;
        }
        expect(
          yield* attempt(["begin", snapshot.value, ask], new LogicDatabase())
        ).toEqual(direct);
      }),
    OPTIONS
  );

  it.effect.prop(
    "assumptions nest: an inner one starts from what the outer one assumed",
    {
      given: start,
      outer: changeForm,
      inner: changeForm,
    },
    ({ given, outer, inner }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        const ready = yield* attempt(
          ["begin", ...setup(given), true],
          database
        );
        if (!ready.ok) {
          return;
        }
        const nested = yield* attempt(
          ["assuming", outer, ["assuming", inner, LOOK]],
          database
        );
        const both = yield* attempt(["assuming", outer, inner, LOOK], database);
        expect(nested).toEqual(both);
      }),
    { ...OPTIONS, arbitrary: { runs: 100 } }
  );

  it.effect.prop(
    "is a question: as a value in plain code it is true or false, and under not its negation",
    { given: start, change: changeForm, to: oneOf(element(NODES)) },
    ({ given, change, to }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        const ready = yield* attempt(
          ["begin", ...setup(given), true],
          database
        );
        if (!ready.ok) {
          return;
        }
        const goal: Form = ["path", "a", to];
        const holds = yield* attempt(["assuming", change, goal], database);
        const found = yield* attempt(
          ["assuming", change, ["find", true, goal]],
          database
        );
        const negated = yield* attempt(
          ["not", ["assuming", change, goal]],
          database
        );
        if (!holds.ok) {
          expect(found).toEqual(holds);
          return;
        }
        expect(holds.value).toBe(
          ((found.ok ? found.value : []) as unknown[]).length > 0
        );
        expect(negated).toEqual({ ok: true, value: !holds.value });
      }),
    OPTIONS
  );
  /** Which of the rules a start has an assumption takes back. */
  const taking = Arbitrary.all({
    given: start,
    taken: Arbitrary.array(element(RULES), { minLength: 1, maxLength: 2 }),
    added: element(RULES),
    goalDirected: element(MODES),
  });

  it.effect.prop(
    "that takes rules back gives what a database that never had them gives, and one that adds a rule what a database that has it gives",
    { taking },
    ({ taking: { given, taken, added, goalDirected } }) =>
      Effect.gen(function* () {
        const rules = [...given.rules, ...taken];
        const database = new LogicDatabase({ goalDirected });
        const ready = yield* attempt(
          ["begin", ...setup({ ...given, rules }), true],
          database
        );
        if (!ready.ok) {
          return;
        }
        yield* withInvariants(database, given.invariants);
        const before = yield* saveDatabase(database);
        const looked = yield* attempt(LOOK, database);
        const has = (kept: readonly Form[]) =>
          Effect.gen(function* () {
            const other = new LogicDatabase({ goalDirected });
            const built = yield* attempt(
              ["begin", ...setup({ ...given, rules: kept }), true],
              other
            );
            return built.ok ? yield* attempt(LOOK, other) : built;
          });
        const gone = (rule: Form) =>
          taken.some((each) => JSON.stringify(each) === JSON.stringify(rule));
        // No invariant refuses what is only assumed, so taking back the
        // rules an invariant needs gives what lacking them gives.
        expect(
          yield* attempt(["assuming", ["retract", ...taken], LOOK], database)
        ).toEqual(yield* has(rules.filter((rule) => !gone(rule))));
        expect(yield* attempt(["assuming", added, LOOK], database)).toEqual(
          yield* has([...rules, added])
        );
        // The database keeps its rules and invariants, and gives what it gave.
        expect(yield* saveDatabase(database)).toEqual(before);
        expect(yield* attempt(LOOK, database)).toEqual(looked);
      }),
    OPTIONS
  );

  /**
   * Changes that hold rules, written with the variables of a rule around
   * them: `?x` and `?y` are the outer rule's, and every other variable is
   * the held rule's own. An assumed rule can give the outer rule's values a
   * row of its own, and a `retract` can take back a rule of the program.
   */
  const RULE_CHANGES: readonly Form[] = [
    ["rule", ["path", "?x", "?z"], ["edge", "?y", "?z"]],
    [
      "retract",
      ["rule", ["path", "?a", "?b"], ["edge", "?a", "?b"]],
      ["edge", "?x", "?y"],
    ],
    [
      "retract",
      [
        "rule",
        ["path", "?a", "?c"],
        ["path", "?a", "?b"],
        ["edge", "?b", "?c"],
      ],
    ],
    ["rule", ["path", "?y", "?x"], ["node", "?x"], ["node", "?y"]],
  ];

  const ASKED: readonly Form[] = [
    ["path", "?x", "?y"],
    ["path", "a", "d"],
    ["find", "?t", ["path", "?x", "?t"]],
  ];

  /** A form with the given values in place of the outer rule's variables. */
  const valuesIn = (form: Form, x: string, y: string): Form =>
    JSON.parse(
      JSON.stringify(form)
        .replaceAll('"?x"', JSON.stringify(x))
        .replaceAll('"?y"', JSON.stringify(y))
    );

  it.effect.prop(
    "a rule and a retract it holds, asked for each answer of a rule, give what plain code gives with the answer's values",
    {
      given: start,
      asked: Arbitrary.array(pair, { minLength: 1, maxLength: 4 }),
      change: element(RULE_CHANGES),
      expression: element(ASKED),
      goalDirected: element(MODES),
    },
    ({ given, asked, change, expression, goalDirected }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase({ goalDirected });
        const ready = yield* attempt(
          [
            "begin",
            ...setup(given),
            ["relation", "pair", ["from", "to"]],
            ["relation", "found", ["from", "to", "value"]],
            ["fact", ...asked.map(([from, to]) => ["pair", from, to])],
            [
              "rule",
              ["found", "?x", "?y", "?v"],
              ["pair", "?x", "?y"],
              ["=", "?v", ["assuming", change, expression]],
            ],
            true,
          ],
          database
        );
        if (!ready.ok) {
          return;
        }
        const derived = yield* attempt(
          [
            "find",
            ["array/make", "?x", "?y", "?v"],
            ["found", "?x", "?y", "?v"],
          ],
          database
        );
        const plain: unknown[] = [];
        for (const [from, to] of asked) {
          const outcome = yield* attempt(
            [
              "assuming",
              valuesIn(change, from, to),
              valuesIn(expression, from, to),
            ],
            database
          );
          if (!outcome.ok) {
            expect(derived).toMatchObject({ ok: false });
            return;
          }
          plain.push([from, to, outcome.value]);
        }
        const unique = [
          ...new Map(
            plain.map((each) => [JSON.stringify(each), each])
          ).values(),
        ].sort((p, q) => (JSON.stringify(p) < JSON.stringify(q) ? -1 : 1));
        expect(derived).toEqual({ ok: true, value: unique });
      }),
    OPTIONS
  );

  /** Goals a rule can ask after its changes, over the outer variables. */
  const GOALS: readonly Form[] = [
    ["path", "a", "?y"],
    ["node", "?y"],
    ["not", ["path", "?x", "?y"]],
  ];

  it.effect.prop(
    "a rule that assumes is the same after a snapshot, and after changes to the facts it reads as a database that derives from them anew",
    {
      given: start,
      asked: Arbitrary.array(pair, { minLength: 1, maxLength: 3 }),
      change: element([
        ...RULE_CHANGES,
        ["fact", ["edge", "?x", "?y"]],
        ["retract", ["edge", "?x", "?y"], ["node", "?y"]],
      ]),
      goal: element(GOALS),
      later: Arbitrary.array(factChange, { maxLength: 3 }),
    },
    ({ given, asked, change, goal, later }) =>
      Effect.gen(function* () {
        const program = [
          ...setup(given),
          ["relation", "pair", ["from", "to"]],
          ["relation", "bridges", ["from", "to"]],
          ["fact", ...asked.map(([from, to]) => ["pair", from, to])],
          [
            "rule",
            ["bridges", "?x", "?y"],
            ["pair", "?x", "?y"],
            ["assuming", change, goal],
          ],
        ];
        const ask: Form = [
          "find",
          ["array/make", "?x", "?y"],
          ["bridges", "?x", "?y"],
        ];
        const database = new LogicDatabase();
        const direct = yield* attempt(["begin", ...program, ask], database);
        if (!direct.ok) {
          return;
        }
        const loaded = yield* loadDatabase(
          yield* saveDatabase(database),
          stdlib
        );
        expect(yield* attempt(ask, loaded)).toEqual(direct);
        // What the rule derived follows each change to the facts, as a
        // database that derives from the facts as they now are gives.
        for (const step of later) {
          yield* attempt(step, database);
          const now = yield* loadDatabase(
            yield* saveDatabase(database),
            stdlib
          );
          expect(yield* attempt(ask, database)).toEqual(
            yield* attempt(ask, now)
          );
        }
      }),
    OPTIONS
  );
  /** Changes an assumption refuses: a rule in a fact, a rule with no body. */
  const refused = oneOf<Form>(
    Arbitrary.map(element(RULES), (rule): Form => ["fact", rule]),
    Arbitrary.map(
      element(RULES),
      (rule): Form => ["retract", (rule as readonly unknown[]).slice(0, 2)]
    ),
    Arbitrary.map(fact, (item): Form => ["fact", item, ["edge", "a"]])
  );

  it.effect.prop(
    "never changes the database, its rules and invariants included, also when a change it holds is refused",
    {
      given: start,
      changes: Arbitrary.array(oneOf<Form>(changeForm, refused), {
        minLength: 1,
        maxLength: 3,
      }),
    },
    ({ given, changes }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        const ready = yield* attempt(
          ["begin", ...setup(given), true],
          database
        );
        if (!ready.ok) {
          return;
        }
        yield* withInvariants(database, given.invariants);
        const before = yield* saveDatabase(database);
        yield* attempt(["assuming", ...changes, LOOK], database);
        expect(yield* saveDatabase(database)).toEqual(before);
      }),
    OPTIONS
  );
  const PEOPLE = ["ann", "bo"] as const;
  const ADDRESSES = ["a@x", "b@x", "c@x"] as const;
  const email = Arbitrary.map(
    Arbitrary.all([element(PEOPLE), element(ADDRESSES)]),
    ([who, address]): Form => ["email", who, address]
  );
  const SAME = [
    "rule",
    ["=", "?a", "?b"],
    ["email", "?p", "?a"],
    ["email", "?p", "?b"],
  ];

  it.effect.prop(
    "an assumed rule that says two values are the same refuses no change, as the same rule in the database refuses no assumed fact",
    {
      given: Arbitrary.array(email, { maxLength: 3 }),
      added: Arbitrary.array(email, { minLength: 1, maxLength: 3 }),
    },
    ({ given, added }) =>
      Effect.gen(function* () {
        // One address a person at most, so the rule holds in the database.
        const facts = [
          ...new Map(
            given.map((fact) => [(fact as string[])[1], fact])
          ).values(),
        ];
        const program = [
          ["relation", "email", ["person", "address"]],
          ...(facts.length > 0 ? [["fact", ...facts]] : []),
        ];
        const look = [
          "find",
          ["array/make", "?p", "?a"],
          ["email", "?p", "?a"],
        ];
        const without = new LogicDatabase();
        yield* attempt(["begin", ...program, true], without);
        const ruled = new LogicDatabase();
        yield* attempt(["begin", ...program, SAME, true], ruled);
        expect(
          yield* attempt(["assuming", SAME, ["fact", ...added], look], without)
        ).toEqual(
          yield* attempt(["assuming", ["fact", ...added], look], ruled)
        );
      }),
    OPTIONS
  );
});

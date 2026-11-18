/**
 * Asking what would hold after some changes: `assuming` gives what its
 * expression gives in the database as it would be after its `fact` and
 * `retract` forms, made as those forms make them, and leaves the database
 * as it was. No invariant refuses a change that is only assumed. Checked
 * against the same changes made for real on a database of its own that
 * has the same facts and rules and no invariants.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect } from "effect";
import { LogicDatabase } from "@/logic/database";
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
const changeForm = Arbitrary.map(
  Arbitrary.all([
    element(["fact", "fact", "retract"] as const),
    Arbitrary.array(fact, { minLength: 1, maxLength: 3 }),
  ]),
  ([form, items]): Form => [form, ...items]
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
});

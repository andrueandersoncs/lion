/**
 * A group whose rules invent, and whose keys or equality rules make the
 * invented values one, follows a change row by row, however its rules join
 * rows: after any change it answers as a database that derived nothing yet.
 * A change an invariant refuses is followed back, also when following it
 * gave a child two mothers, so the next change is followed too.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect } from "effect";
import { LogicDatabase } from "@/logic/database";
import { attempt, element } from "./programs";

const NAMES = ["a", "b", "c", "d", "e"] as const;

/** Ways of making mothers one, any of which a program can hold. */
const WAYS = {
  // A key on mother, and twins passing a mother on.
  key: [
    [
      "rule",
      ["mother", "?b", "?m"],
      ["twin", "?a", "?b"],
      ["mother", "?a", "?m"],
    ],
    [
      "rule",
      ["mother", "?a", "?m"],
      ["twin", "?a", "?b"],
      ["mother", "?b", "?m"],
    ],
  ],
  twins: [
    [
      "rule",
      ["=", "?m1", "?m2"],
      ["twin", "?a", "?b"],
      ["mother", "?a", "?m1"],
      ["mother", "?b", "?m2"],
    ],
  ],
  registered: [
    [
      "rule",
      ["=", "?m", "?r"],
      ["mother", "?c", "?m"],
      ["registered", "?c", "?r"],
    ],
  ],
  // Unknowns that describe unknowns: a grandmother for every mother, and
  // twins' grandmothers made one.
  nested: [
    [
      "rule",
      ["exists", ["?g"], ["grandmother", "?m", "?g"]],
      ["mother", "?c", "?m"],
    ],
    [
      "rule",
      ["=", "?g1", "?g2"],
      ["twin", "?a", "?b"],
      ["mother", "?a", "?m1"],
      ["mother", "?b", "?m2"],
      ["grandmother", "?m1", "?g1"],
      ["grandmother", "?m2", "?g2"],
    ],
  ],
  // An equality rule whose two sides share no variable: it makes a's and
  // b's mothers one wherever they are, so it is derived again, not followed.
  apart: [
    [
      "rule",
      ["=", "?m1", "?m2"],
      ["mother", "a", "?m1"],
      ["mother", "b", "?m2"],
    ],
  ],
} as const;

type Way = keyof typeof WAYS;

const row = Arbitrary.all([
  element(["person", "twin", "registered"] as const),
  element(NAMES),
  element([...NAMES, "eve", "fay"]),
]);

const factOf = ([relation, a, b]: readonly [string, string, string]) => {
  if (relation === "person") {
    return ["person", a];
  }
  return relation === "twin"
    ? ["twin", a, b]
    : ["registered", a, b === "eve" || b === "fay" ? b : "eve"];
};

const program = {
  ways: Arbitrary.map(
    Arbitrary.array(element(Object.keys(WAYS) as Way[]), {
      minLength: 1,
      maxLength: 3,
    }),
    (ways) => [...new Set(ways)].sort()
  ),
  start: Arbitrary.array(row, { maxLength: 8 }),
  changes: Arbitrary.array(
    Arbitrary.all([element(["fact", "retract"] as const), row]),
    { minLength: 1, maxLength: 5 }
  ),
};

const QUESTIONS = {
  mother: ["find", ["array/make", "?c", "?m"], ["mother", "?c", "?m"]],
  // A question that knows a value is answered goal-directed, by a model of
  // its own that follows changes too.
  siblings: ["query", ["sibling", "a", "?b"]],
  grandmother: [
    "find",
    ["array/make", "?m", "?g"],
    ["grandmother", "?m", "?g"],
  ],
};

const answers = (database: LogicDatabase) =>
  Effect.map(attempt(QUESTIONS, database), (outcome) =>
    outcome.ok
      ? Object.fromEntries(
          Object.entries(outcome.value as Record<string, unknown[]>).map(
            ([name, rows]) => [
              name,
              rows.map((it) => JSON.stringify(it)).sort(),
            ]
          )
        )
      : outcome
  );

/** The declarations and rules of a program that holds the given ways. */
const rulesOf = (ways: readonly Way[]) => [
  ["relation", "person", ["name"]],
  ["relation", "twin", ["a", "b"]],
  ["relation", "registered", ["child", "mother"]],
  [
    "relation",
    "mother",
    ["child", "mother"],
    ...(ways.includes("key") ? [{ key: "child" }] : []),
  ],
  ["relation", "grandmother", ["mother", "grandmother"]],
  ["relation", "sibling", ["a", "b"]],
  ["rule", ["exists", ["?m"], ["mother", "?c", "?m"]], ["person", "?c"]],
  [
    "rule",
    ["sibling", "?a", "?b"],
    ["mother", "?a", "?m"],
    ["mother", "?b", "?m"],
  ],
  ...ways.flatMap((way): readonly unknown[] => WAYS[way]),
];

/**
 * What a database that has derived nothing gives for these facts: they come
 * before the rules, so nothing is followed, and every row is derived from
 * the facts as they are. Undefined when the facts break a rule.
 */
const fromNothing = (ways: readonly Way[], facts: Iterable<unknown>) =>
  Effect.gen(function* () {
    const database = new LogicDatabase();
    const declared = (form: unknown) => (form as unknown[])[0] === "relation";
    const made = yield* attempt(
      [
        "begin",
        ...rulesOf(ways).filter(declared),
        ...[...facts].map((it) => ["fact", it]),
        ...rulesOf(ways).filter((form) => !declared(form)),
        true,
      ],
      database
    );
    return made.ok ? yield* answers(database) : undefined;
  });

/**
 * Starts a database with the program's rules and facts, then makes each
 * change, and checks after each that it was kept exactly when a database
 * that derived nothing could hold the facts, and answers as that one does.
 * Returns how each change, or the undoing of a refused one, met the
 * mothers: followed, derived, forgotten, or untouched.
 */
const changing = (
  ways: readonly Way[],
  start: readonly (readonly [string, string, string])[],
  changes: readonly (readonly [
    "fact" | "retract",
    readonly [string, string, string],
  ])[]
) =>
  Effect.gen(function* () {
    const kept = new LogicDatabase();
    const ready = yield* attempt(
      [
        "begin",
        ...rulesOf(ways),
        ...start.map((it) => ["fact", factOf(it)]),
        true,
      ],
      kept
    );
    const met: string[] = [];
    if (!ready.ok) {
      return met;
    }
    const held = new Map(
      start.map((it) => [JSON.stringify(factOf(it)), factOf(it)])
    );
    yield* answers(kept);
    for (const [form, it] of changes) {
      const fact = factOf(it);
      const next = new Map(held);
      if (form === "fact") {
        next.set(JSON.stringify(fact), fact);
      } else {
        next.delete(JSON.stringify(fact));
      }
      const expected = yield* fromNothing(ways, next.values());
      // What the last change did with each relation, and only that.
      kept.model?.last.clear();
      const goals = kept.goals.size;
      const changed = yield* attempt([form, fact], kept);
      expect(changed.ok).toBe(expected !== undefined);
      // A refused change is followed back: what was derived is still there,
      // with what goal-directed questions derived, and the next change is
      // followed through it.
      met.push(kept.model?.last.get("mother") ?? "untouched");
      if (expected === undefined) {
        expect(kept.goals.size).toBe(goals);
        continue;
      }
      expect(yield* answers(kept)).toEqual(expected);
      held.clear();
      for (const [key, value] of next) {
        held.set(key, value);
      }
    }
    return met;
  });

const CHILDREN = ["a", "b", "c"] as const;

/** A twin, a person, or a registered mother of one of a few children. */
const often = Arbitrary.map(
  Arbitrary.all([
    element(["twin", "twin", "person", "registered"] as const),
    element(CHILDREN),
    element(CHILDREN),
    element(["eve", "fay"] as const),
  ]),
  ([relation, a, b, mother]): readonly [string, string, string] => {
    if (relation === "twin") {
      return ["twin", a, b];
    }
    return relation === "person" ? ["person", a, a] : ["registered", a, mother];
  }
);

/**
 * Programs in which a key passes mothers between twins and an equality rule
 * holds as an invariant: they start with people and one registered mother
 * each, and a twin of two registered mothers is refused, since following it
 * gives one twin two mothers, which the invariant's question meets.
 */
const refusing = {
  ways: Arbitrary.map(
    Arbitrary.array(element(["registered", "twins"] as Way[]), {
      minLength: 1,
      maxLength: 2,
    }),
    (ways) => [...new Set<Way>(["key", ...ways])].sort()
  ),
  start: Arbitrary.map(
    Arbitrary.array(
      Arbitrary.all([element(CHILDREN), element(["eve", "fay"] as const)]),
      { maxLength: 3 }
    ),
    (rows) => {
      const children = new Map<string, string>(rows.map(([c, m]) => [c, m]));
      return [...children].flatMap(
        ([child, mother]): (readonly [string, string, string])[] => [
          ["person", child, child],
          ["registered", child, mother],
        ]
      );
    }
  ),
  changes: Arbitrary.array(
    Arbitrary.all([element(["fact", "fact", "retract"] as const), often]),
    { minLength: 1, maxLength: 5 }
  ),
};

describe("a group whose rules invent and make values one", () => {
  it.effect.prop(
    "follows each change, and answers as a database that derived nothing yet",
    program,
    ({ changes, start, ways }) =>
      Effect.gen(function* () {
        const met = yield* changing(
          ways.filter((way) => way !== "apart"),
          start,
          changes
        );
        // Every relation of the group was read, so a change that reached it
        // was followed through it, not derived again.
        for (const how of met) {
          expect(how).not.toBe("derived");
          expect(how).not.toBe("forgotten");
        }
      }),
    { timeout: 300_000, arbitrary: { runs: 300 } }
  );

  it.effect.prop(
    "follows a change it refuses back, though following it found two rows with one key",
    refusing,
    ({ changes, start, ways }) =>
      Effect.map(changing(ways, start, changes), (met) => {
        for (const how of met) {
          expect(how).not.toBe("derived");
          expect(how).not.toBe("forgotten");
        }
      }),
    { timeout: 300_000, arbitrary: { runs: 200 } }
  );

  it.effect.prop(
    "follows each change where its rules join rows other than through shared variables too, and answers as a database that derived nothing yet",
    {
      ways: Arbitrary.map(
        Arbitrary.array(element(["key", "twins", "registered"] as Way[]), {
          maxLength: 2,
        }),
        (ways) => [...new Set(ways), "apart" as Way].sort()
      ),
      start: Arbitrary.array(
        Arbitrary.map(
          element(["a", "b", "c"]),
          (name) => ["person", name, name] as const
        ),
        { maxLength: 3 }
      ),
      changes: Arbitrary.array(
        Arbitrary.all([
          element(["fact", "retract"] as const),
          Arbitrary.map(
            element(["a", "b", "c"]),
            (name) => ["person", name, name] as const
          ),
        ]),
        { minLength: 1, maxLength: 4 }
      ),
    },
    ({ changes, start, ways }) =>
      Effect.map(changing(ways, start, changes), (met) => {
        for (const how of met) {
          expect(how).not.toBe("derived");
          expect(how).not.toBe("forgotten");
        }
      }),
    { timeout: 300_000, arbitrary: { runs: 200 } }
  );
});

/**
 * A relation that merges what a key gets: its key holds one row, whose
 * merged columns join every candidate the key gets, from its facts and its
 * rules alike, and whose other columns must agree. Checked against a model
 * that joins the candidates in plain TypeScript.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect } from "effect";
import { LogicDatabase } from "@/logic/database";
import { attempt, element, type Outcome } from "./programs";

type Form = unknown;

const OPTIONS = { timeout: 120_000, arbitrary: { runs: 200 } };

const MODES = [true, false];

const KINDS = ["min", "max", "union"] as const;
type Kind = (typeof KINDS)[number];

const KEYS = ["a", "b", "c"];
const OWNERS = ["ana", "bo"];

/** A candidate: a key, a value to merge, and an owner that must agree. */
type Row = readonly [key: string, value: number, owner: string];

const row: Arbitrary.Arbitrary<Row> = Arbitrary.all([
  element(KEYS),
  element([1, 2, 3, 4, 5]),
  element(OWNERS),
]);

const rows = Arbitrary.array(row, { maxLength: 6 });

/** The value a candidate gives the merged column: a number, or a list of one. */
const candidateValue = (kind: Kind, value: number): unknown =>
  kind === "union" ? [value] : value;

const join = (kind: Kind, values: readonly number[]): unknown => {
  if (kind === "min") {
    return Math.min(...values);
  }
  if (kind === "max") {
    return Math.max(...values);
  }
  return [...new Set(values)].sort((x, y) => x - y);
};

/**
 * The model: the rows the relation holds, by key, or the clash of a key whose
 * candidates name different owners.
 */
const model = (kind: Kind, candidates: readonly Row[]) => {
  const byKey = new Map<string, Row[]>();
  for (const candidate of candidates) {
    byKey.set(candidate[0], [...(byKey.get(candidate[0]) ?? []), candidate]);
  }
  const held: unknown[] = [];
  for (const [key, group] of [...byKey].sort(([x], [y]) => (x < y ? -1 : 1))) {
    if (new Set(group.map(([, , owner]) => owner)).size > 1) {
      return { clash: key };
    }
    held.push({
      key,
      value: join(
        kind,
        group.map(([, value]) => value)
      ),
      owner: group[0]?.[2],
    });
  }
  return { held };
};

const declarations = (kind: Kind): Form[] => [
  ["relation", "offer", ["key", "value", "owner"]],
  [
    "relation",
    "best",
    ["key", "value", "owner"],
    { key: "key", merge: { value: `aggregate/${kind}` } },
  ],
  [
    "rule",
    ["best", "?k", kind === "union" ? ["array/make", "?v"] : "?v", "?o"],
    ["offer", "?k", "?v", "?o"],
  ],
];

const factsOf = (relation: string, kind: Kind, given: readonly Row[]) =>
  given.length === 0
    ? []
    : [
        [
          "fact",
          ...given.map(([key, value, owner]) => [
            relation,
            key,
            relation === "best"
              ? ["quote", candidateValue(kind, value)]
              : value,
            owner,
          ]),
        ],
      ];

const ASK: Form = [
  "query",
  ["best", "?key", "?value", "?owner"],
  { order: "key" },
];

const expectModel = (outcome: Outcome, expected: ReturnType<typeof model>) => {
  if ("clash" in expected) {
    expect(outcome).toMatchObject({
      ok: false,
      message: expect.stringContaining(
        "which differ in a column that does not merge"
      ),
    });
  } else {
    expect(outcome).toEqual({ ok: true, value: expected.held });
  }
};

describe("a relation that merges what a key gets", () => {
  it.effect.prop(
    "holds for each key the join of every candidate, from its facts and its rules, and clashes where the rest disagrees",
    {
      kind: element(KINDS),
      given: rows,
      offered: rows,
      goalDirected: element(MODES),
    },
    ({ kind, given, offered, goalDirected }) =>
      Effect.gen(function* () {
        const outcome = yield* attempt(
          [
            "begin",
            ...declarations(kind),
            ...factsOf("best", kind, given),
            ...factsOf("offer", kind, offered),
            ASK,
          ],
          new LogicDatabase({ goalDirected })
        );
        expectModel(outcome, model(kind, [...given, ...offered]));
      }),
    OPTIONS
  );

  /** A change: a fact of either relation, added or retracted. */
  const change = Arbitrary.all([
    element(["fact", "retract"] as const),
    element(["best", "offer"] as const),
    row,
  ]);

  it.effect.prop(
    "follows facts that come and go to what deriving from the facts as they now are gives",
    {
      kind: element(KINDS),
      changes: Arbitrary.array(change, { minLength: 1, maxLength: 8 }),
      goalDirected: element(MODES),
    },
    ({ kind, changes, goalDirected }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase({ goalDirected });
        yield* attempt(["begin", ...declarations(kind), true], database);
        const held = {
          best: new Map<string, Row>(),
          offer: new Map<string, Row>(),
        };
        for (const [form, relation, candidate] of changes) {
          const id = JSON.stringify(candidate);
          if (form === "fact") {
            held[relation].set(id, candidate);
          } else {
            held[relation].delete(id);
          }
          const [done] = factsOf(relation, kind, [candidate]) as [Form[]];
          yield* attempt([form, ...done.slice(1)], database);
          expectModel(
            yield* attempt(ASK, database),
            model(kind, [...held.best.values(), ...held.offer.values()])
          );
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "is the same after a snapshot, which writes the merge and no rule of its own",
    { kind: element(KINDS), given: rows, offered: rows },
    ({ kind, given, offered }) =>
      Effect.gen(function* () {
        const program = [
          ...declarations(kind),
          ...factsOf("best", kind, given),
          ...factsOf("offer", kind, offered),
        ];
        const snapshot = yield* attempt(
          ["begin", ...program, ["snapshot"]],
          new LogicDatabase()
        );
        expect(snapshot.ok).toBe(true);
        if (!snapshot.ok) {
          return;
        }
        const written = snapshot.value as Form[];
        // The one rule written is the rule the program wrote.
        expect(
          written.filter((form) => Array.isArray(form) && form[0] === "rule")
        ).toHaveLength(1);
        const again = yield* attempt(
          ["begin", written, ["snapshot"]],
          new LogicDatabase()
        );
        expect(again).toEqual(snapshot);
        expectModel(
          yield* attempt(["begin", written, ASK], new LogicDatabase()),
          model(kind, [...given, ...offered])
        );
      }),
    OPTIONS
  );

  it.effect.prop(
    "gives what a rule that aggregates in its head gives, when its candidates come from rules",
    { kind: element(["min", "max"] as const), offered: rows },
    ({ kind, offered }) =>
      Effect.gen(function* () {
        // One owner, so no key clashes, as an aggregate groups by the owner too.
        const one = offered.map(([key, value]): Row => [key, value, "ana"]);
        const merged = yield* attempt(
          ["begin", ...declarations(kind), ...factsOf("offer", kind, one), ASK],
          new LogicDatabase()
        );
        const aggregated = yield* attempt(
          [
            "begin",
            ["relation", "offer", ["key", "value", "owner"]],
            ["relation", "best", ["key", "value", "owner"]],
            [
              "rule",
              ["best", "?k", [`aggregate/${kind}`, "?v"], "?o"],
              ["offer", "?k", "?v", "?o"],
            ],
            ...factsOf("offer", kind, one),
            ASK,
          ],
          new LogicDatabase()
        );
        expect(merged).toEqual(aggregated);
      }),
    OPTIONS
  );

  it.effect.prop(
    "explains a row of a selecting merge by the candidate that gives its value",
    { kind: element(["min", "max"] as const), given: rows, offered: rows },
    ({ kind, given, offered }) =>
      Effect.gen(function* () {
        const one = (each: readonly Row[]) =>
          each.map(([key, value]): Row => [key, value, "ana"]);
        const database = new LogicDatabase();
        const held = yield* attempt(
          [
            "begin",
            ...declarations(kind),
            ...factsOf("best", kind, one(given)),
            ...factsOf("offer", kind, one(offered)),
            ASK,
          ],
          database
        );
        expect(held.ok).toBe(true);
        const found = (held.ok ? held.value : []) as {
          key: string;
          value: number;
          owner: string;
        }[];
        const told = yield* attempt(
          [
            "array/make",
            ...found.map(({ key, value, owner }) => [
              "why",
              ["best", key, value, owner],
            ]),
          ],
          database
        );
        expect(told.ok).toBe(true);
        for (const [at, tree] of (
          (told.ok ? told.value : []) as {
            because: { fact: unknown[]; given: boolean }[];
          }[]
        ).entries()) {
          // The one premise is a fact, of the relation or of what its rule
          // reads, and it gives the row's value.
          const [premise] = tree.because;
          expect(premise?.given).toBe(true);
          expect(premise?.fact[2]).toBe(found[at]?.value);
        }
      }),
    OPTIONS
  );

  /** Roads between a few towns, each with a length. */
  const roads = Arbitrary.array(
    Arbitrary.all([element(KEYS), element(KEYS), element([1, 2, 3, 4])]),
    { maxLength: 7 }
  );

  it.effect.prop(
    "merges through recursion: the least distance from a town is the shortest path's length",
    { given: roads },
    ({ given }) =>
      Effect.gen(function* () {
        const outcome = yield* attempt(
          [
            "begin",
            ["relation", "road", ["from", "to", "km"]],
            [
              "relation",
              "dist",
              ["to", "km"],
              { key: "to", merge: { km: "aggregate/min" } },
            ],
            ...(given.length === 0
              ? []
              : [["fact", ...given.map((each) => ["road", ...each])]]),
            ["fact", ["dist", "a", 0]],
            [
              "rule",
              ["dist", "?y", ["number/add", "?d", "?k"]],
              ["dist", "?x", "?d"],
              ["road", "?x", "?y", "?k"],
            ],
            ["query", ["dist", "?to", "?km"], { order: "to" }],
          ],
          new LogicDatabase()
        );
        // The model: Bellman-Ford over the roads, from a.
        const best = new Map<string, number>([["a", 0]]);
        for (const _round of KEYS) {
          for (const [from, to, km] of given) {
            const start = best.get(from);
            if (
              start !== undefined &&
              start + km < (best.get(to) ?? Number.POSITIVE_INFINITY)
            ) {
              best.set(to, start + km);
            }
          }
        }
        expect(outcome).toEqual({
          ok: true,
          value: [...best]
            .sort(([x], [y]) => (x < y ? -1 : 1))
            .map(([to, km]) => ({ to, km })),
        });
      }),
    OPTIONS
  );
});

/**
 * Existential rules: a rule whose head says `exists` invents a value for
 * each variable it lists, an unknown written `["some", "?m", goal]`, but
 * only for an answer whose head does not hold already.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { LogicDatabase } from "@/logic/database";
import { compareValues, sameValue, Unknown, valueKey } from "@/logic/terms";
import { stdlib } from "@/modules";
import {
  brokenForm,
  certain,
  chase,
  declarationsOf,
  type Facts,
  factForms,
  facts,
  join,
  joinForm,
  knownRows,
  RELATIONS,
  type RuleSpec,
  ruleForm,
  rules,
} from "./existentials";
import { attempt, element, type Outcome, oneOf } from "./programs";

const NEVER_FINISHES = "in its head while recursing, which may never finish";

const program = (given: Facts, picked: readonly RuleSpec[], keyed = false) => [
  ...declarationsOf(keyed),
  ...factForms(given),
  ...picked.map(ruleForm),
];

/** The rows of every relation, each as a list of its values, sorted. */
const everyRow = (forms: readonly unknown[], database = new LogicDatabase()) =>
  attempt(
    [
      "begin",
      ...forms,
      Object.fromEntries(
        Object.entries(RELATIONS).map(([name, columns]) => [
          name,
          [
            "find",
            ["array/make", ...columns.map((column) => `?${column}`)],
            [name, ...columns.map((column) => `?${column}`)],
          ],
        ])
      ),
    ],
    database
  );

const succeeded = (outcome: Outcome) => {
  if (!outcome.ok) {
    throw new Error(outcome.message);
  }
  return outcome.value;
};

const isUnknown = (value: unknown) => Array.isArray(value);

/** Runs a program, or says the program was refused as one that may not finish. */
const accepted = (forms: readonly unknown[]) =>
  Effect.map(everyRow(forms), (outcome) => {
    if (!outcome.ok && outcome.message.includes(NEVER_FINISHES)) {
      return undefined;
    }
    return succeeded(outcome) as Record<string, unknown[][]>;
  });

const RUNS = { arbitrary: { runs: 200 } };

describe("existential rules", () => {
  it.effect.prop(
    "give the same rows without unknowns, and the same certain answers, as the semi-oblivious chase",
    { given: facts, picked: rules, goal: join },
    ({ given, goal, picked }) =>
      Effect.gen(function* () {
        const rows = yield* accepted(program(given, picked));
        if (rows === undefined) {
          return;
        }
        const model = chase(given, picked);
        // A program Lion runs finishes in the model too.
        expect(model).toBeDefined();
        if (model === undefined) {
          return;
        }
        for (const relation of Object.keys(RELATIONS)) {
          expect(
            (rows[relation] ?? [])
              .filter((row) => !row.some(isUnknown))
              .map((row) => JSON.stringify(row))
              .sort()
          ).toEqual(knownRows(model, relation));
        }
        const found = succeeded(
          yield* attempt(
            [
              "begin",
              ...program(given, picked),
              ["find", ["array/make", "?l", "?r"], joinForm(goal)],
            ],
            new LogicDatabase()
          )
        ) as unknown[][];
        expect(
          [
            ...new Set(
              found
                .filter((pair) => !pair.some(isUnknown))
                .map((pair) => JSON.stringify(pair))
            ),
          ].sort()
        ).toEqual(certain(model, goal));
      }),
    RUNS
  );

  it.effect.prop(
    "leave no answer of a rule's body without its head",
    { given: facts, picked: rules, keyed: Schema.Boolean },
    ({ given, keyed, picked }) =>
      Effect.gen(function* () {
        const outcome = yield* attempt(
          [
            "begin",
            ...program(given, picked, keyed),
            [
              "array/make",
              ...picked.map((rule) => ["query", brokenForm(rule)]),
            ],
          ],
          new LogicDatabase()
        );
        // A key can refuse two given parents of one child.
        if (
          !outcome.ok &&
          (outcome.message.includes(NEVER_FINISHES) || keyed)
        ) {
          return;
        }
        expect(succeeded(outcome)).toEqual(picked.map(() => []));
      }),
    RUNS
  );

  it.effect.prop(
    "give the same rows whatever order the rules and facts come in",
    { given: facts, picked: rules, keyed: Schema.Boolean },
    ({ given, keyed, picked }) =>
      Effect.gen(function* () {
        const forward = yield* everyRow(program(given, picked, keyed));
        const backward = yield* everyRow([
          ...declarationsOf(keyed),
          ...factForms({
            links: [...given.links].reverse(),
            // With a key, the last parent given for a child is its parent.
            parents: keyed ? given.parents : [...given.parents].reverse(),
            people: [...given.people].reverse(),
          }),
          ...[...picked].reverse().map(ruleForm),
        ]);
        // A program that fails fails either way, though which rule its
        // message names can follow the order.
        expect(backward.ok).toBe(forward.ok);
        if (forward.ok) {
          expect(backward).toEqual(forward);
        }
      }),
    RUNS
  );

  it.effect.prop(
    "give a goal-directed query what full evaluation gives",
    {
      given: facts,
      picked: rules,
      child: element(["a", "b", "c", "d"]),
      keyed: Schema.Boolean,
    },
    ({ child, given, keyed, picked }) =>
      Effect.gen(function* () {
        const question = [
          "begin",
          ...program(given, picked, keyed),
          [
            "array/make",
            ["query", ["same", child, "?b"], { order: "b" }],
            ["query", ["parent", child, "?p"], { order: "p" }],
            ["query", ["pair", child, "?y"], { order: "y" }],
          ],
        ];
        const directed = yield* attempt(question, new LogicDatabase());
        const full = yield* attempt(
          question,
          new LogicDatabase({ goalDirected: false })
        );
        // A goal-directed query never fails on a row it does not derive,
        // where full evaluation can: a key that two given parents break.
        if (full.ok || !keyed) {
          expect(directed).toEqual(full);
        }
      }),
    RUNS
  );

  it.effect.prop(
    "explain every row they derive, unknowns included",
    { given: facts, picked: rules, keyed: Schema.Boolean },
    ({ given, keyed, picked }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        const rows = yield* everyRow(program(given, picked, keyed), database);
        if (!rows.ok) {
          return;
        }
        for (const [relation, tuples] of Object.entries(
          rows.value as Record<string, unknown[][]>
        )) {
          for (const tuple of tuples) {
            // An unknown reads as the `some` form that makes it.
            const fact = [relation, ...tuple.map(written)];
            const explained = succeeded(
              yield* attempt(["why", fact], database)
            );
            expect((explained as { fact: unknown }).fact).toEqual([
              relation,
              ...tuple,
            ]);
          }
        }
      }),
    RUNS
  );

  it.effect.prop(
    "save and load: a snapshot rebuilds the same rows, and saves the same",
    {
      given: facts,
      picked: rules,
      stated: element(["a", "b", "c", "d"]),
      keyed: Schema.Boolean,
    },
    ({ given, keyed, picked, stated }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        // Facts that hold unknowns: a row exists states, and one that names
        // the unknown another holds.
        const unknowns = [
          ["fact", ["exists", ["?p"], ["parent", stated, "?p"]]],
          [
            "fact",
            ["named", ["some", "?p", ["parent", stated, "?p"]], "unknown"],
          ],
        ];
        const before = yield* everyRow(
          [...program(given, picked, keyed), ...unknowns],
          database
        );
        if (!before.ok) {
          return;
        }
        const saved = succeeded(yield* attempt(["snapshot"], database));
        const copy = new LogicDatabase();
        expect(yield* everyRow([saved], copy)).toEqual(before);
        expect(yield* attempt(["snapshot"], copy)).toEqual({
          ok: true,
          value: saved,
        });
      }),
    RUNS
  );
});

/** A value of a row written so that it evaluates to itself. */
const written = (value: unknown) =>
  typeof value === "string" ? ["quote", value] : value;

const people = Arbitrary.map(
  Arbitrary.array(element(["a", "b", "c", "d", "e"]), { maxLength: 5 }),
  (names) => [...new Set(names)].sort()
);

const known = Arbitrary.array(
  Arbitrary.all([element(["a", "b", "c", "d", "e"]), element(["eve", "fay"])]),
  { maxLength: 3 }
);

const motherOf = (child: string) => ["some", "?m", ["mother", child, "?m"]];

describe("a rule that invents", () => {
  it.effect.prop(
    "invents only for an answer whose head does not hold already",
    {
      names: people,
      given: known,
      female: Schema.Boolean,
      keyed: Schema.Boolean,
    },
    ({ female, given, keyed, names }) =>
      Effect.gen(function* () {
        // With a key, the last mother given for a child is the one it has.
        const mothers = new Map<string, string[]>();
        for (const [child, mother] of given) {
          const held = keyed ? [] : (mothers.get(child) ?? []);
          mothers.set(child, [...new Set([...held, mother])]);
        }
        const head = female
          ? ["and", ["mother", "?c", "?m"], ["female", "?m"]]
          : ["mother", "?c", "?m"];
        const outcome = yield* attempt(
          [
            "begin",
            ["relation", "person", ["name"]],
            ["relation", "female", ["name"]],
            [
              "relation",
              "mother",
              ["child", "mother"],
              ...(keyed ? [{ key: "child" }] : []),
            ],
            ...(names.length === 0
              ? []
              : [["fact", ...names.map((name) => ["person", name])]]),
            ...given.map(([child, mother]) => [
              "fact",
              ["mother", child, mother],
            ]),
            ["fact", ["female", "eve"]],
            ["rule", ["exists", ["?m"], head], ["person", "?c"]],
            ["find", ["array/make", "?c", "?m"], ["mother", "?c", "?m"]],
          ],
          new LogicDatabase()
        );
        // A child whose given mother is not female gets another, unless the
        // key says she is the only one: then she is the female mother.
        const expected: unknown[][] = [];
        for (const [child, held] of mothers) {
          for (const mother of held) {
            expected.push([child, mother]);
          }
        }
        for (const name of names) {
          const held = mothers.get(name) ?? [];
          const holds = female ? held.includes("eve") : held.length > 0;
          if (!(holds || (keyed && held.length > 0))) {
            expected.push([
              name,
              female
                ? [
                    "some",
                    "?m",
                    ["and", ["mother", name, "?m"], ["female", "?m"]],
                  ]
                : motherOf(name),
            ]);
          }
        }
        const rows = succeeded(outcome) as unknown[][];
        const sorted = (list: unknown[][]) =>
          list.map((row) => JSON.stringify(row)).sort();
        expect(sorted(rows)).toEqual(sorted(expected));
      }),
    RUNS
  );

  it.effect.prop(
    "waits for the rules that invent nothing, and a key makes what passes along links one",
    {
      names: people,
      given: known,
      links: Arbitrary.array(
        Arbitrary.all([
          element(["a", "b", "c", "d", "e"]),
          element(["a", "b", "c", "d", "e"]),
        ]),
        { maxLength: 4 }
      ),
      keyed: Schema.Boolean,
    },
    ({ given, keyed, links, names }) =>
      Effect.gen(function* () {
        const outcome = yield* attempt(
          [
            "begin",
            ["relation", "person", ["name"]],
            ["relation", "link", ["from", "to"]],
            [
              "relation",
              "mother",
              ["child", "mother"],
              ...(keyed ? [{ key: "child" }] : []),
            ],
            ...names.map((name) => ["fact", ["person", name]]),
            ...links.map(([from, to]) => ["fact", ["link", from, to]]),
            ...given.map(([child, mother]) => [
              "fact",
              ["mother", child, mother],
            ]),
            // A mother is passed on along a link, which takes rounds.
            [
              "rule",
              ["mother", "?b", "?m"],
              ["link", "?a", "?b"],
              ["mother", "?a", "?m"],
            ],
            [
              "rule",
              ["exists", ["?m"], ["mother", "?c", "?m"]],
              ["person", "?c"],
            ],
            ["find", ["array/make", "?c", "?m"], ["mother", "?c", "?m"]],
          ],
          new LogicDatabase()
        );
        // The model: mothers given, then passed on along links; a person
        // with none by then invents one, which is passed on in turn.
        const held = new Map<string, Set<string>>();
        const holder = (child: string) => {
          let set = held.get(child);
          if (set === undefined) {
            set = new Set();
            held.set(child, set);
          }
          return set;
        };
        for (const [child, mother] of given) {
          if (keyed) {
            holder(child).clear();
          }
          holder(child).add(JSON.stringify(mother));
        }
        const passOn = () => {
          for (let changed = true; changed; ) {
            changed = false;
            for (const [from, to] of links) {
              for (const mother of [...(held.get(from) ?? [])]) {
                if (!holder(to).has(mother)) {
                  holder(to).add(mother);
                  changed = true;
                }
              }
            }
          }
        };
        passOn();
        for (const name of names.filter(
          (n) => (held.get(n)?.size ?? 0) === 0
        )) {
          holder(name).add(JSON.stringify(motherOf(name)));
        }
        passOn();
        let expected = [...held].flatMap(([child, mothers]) =>
          [...mothers].map((mother) => `[${JSON.stringify(child)},${mother}]`)
        );
        if (keyed) {
          // A key makes every mother of a child one: a given one, or the
          // unknown that sorts first.
          const up = new Map<string, string>();
          const find = (value: string): string => {
            const next = up.get(value);
            return next === undefined ? value : find(next);
          };
          for (const mothers of held.values()) {
            const [first, ...rest] = [...mothers].map(find);
            for (const other of rest) {
              const [a, b] = [find(first as string), find(other)];
              if (a !== b) {
                up.set(a < b ? b : a, a < b ? a : b);
              }
            }
          }
          const classes = new Map<string, Set<string>>();
          for (const value of [...held.values()].flatMap((set) => [...set])) {
            const root = find(value);
            classes.set(root, (classes.get(root) ?? new Set()).add(value));
          }
          const isGiven = (value: string) => !value.startsWith("[");
          if (
            [...classes.values()].some(
              (members) => [...members].filter(isGiven).length > 1
            )
          ) {
            expect(outcome.ok).toBe(false);
            return;
          }
          const chosen = (value: string) => {
            const members = [...(classes.get(find(value)) ?? [value])];
            return members.find(isGiven) ?? members.sort()[0];
          };
          expected = [
            ...new Set(
              [...held].map(
                ([child, mothers]) =>
                  `[${JSON.stringify(child)},${chosen([...mothers][0] as string)}]`
              )
            ),
          ];
        }
        const rows = succeeded(outcome) as unknown[][];
        expect(rows.map((row) => JSON.stringify(row)).sort()).toEqual(
          expected.sort()
        );
      }),
    RUNS
  );

  it.effect.prop(
    "invents the unknown that some names in plain code",
    { names: people },
    ({ names }) =>
      Effect.gen(function* () {
        const rows = yield* run(
          [
            "begin",
            ["relation", "person", ["name"]],
            ["relation", "mother", ["child", "mother"]],
            ...names.map((name) => ["fact", ["person", name]]),
            [
              "rule",
              ["exists", ["?m"], ["mother", "?c", "?m"]],
              ["person", "?c"],
            ],
            [
              "array/make",
              ["find", "?m", ["mother", "?_", "?m"]],
              ["array/make", ...names.map(motherOf)],
            ],
          ],
          stdlib
        );
        const [invented, written] = rows as unknown[][];
        expect(invented).toHaveLength(names.length);
        expect(
          (invented ?? []).every((unknown, at) =>
            sameValue(unknown, (written ?? [])[at])
          )
        ).toBe(true);
      })
  );

  it.effect.prop(
    "describes an unknown in a rule with the values the answer gives, as plain code does",
    { names: people },
    ({ names }) =>
      Effect.gen(function* () {
        const described = (child: unknown) => [
          "some",
          "?m",
          [
            "mother",
            { of: child, label: ["string/concat", child, "!"], id: "?m" },
            ["array/make", "?m", child],
          ],
        ];
        const outcome = yield* attempt(
          [
            "begin",
            ["relation", "person", ["name"]],
            ["relation", "mother", ["child", "mother"]],
            ...names.map((name) => ["fact", ["person", name]]),
            [
              "array/make",
              ["find", described("?c"), ["person", "?c"]],
              [
                "array/make",
                ...names.map((name) => described(["quote", name])),
              ],
            ],
          ],
          new LogicDatabase()
        );
        const [inRule, inPlainCode] = succeeded(outcome) as unknown[][];
        expect(inRule).toEqual(inPlainCode);
      })
  );

  it.effect.prop(
    "says in a fact the rows that the same head would invent",
    { names: people },
    ({ names }) =>
      Effect.gen(function* () {
        const head = [
          "exists",
          ["?m"],
          ["and", ["mother", "?c", "?m"], ["female", "?m"]],
        ];
        const base = [
          ["relation", "person", ["name"]],
          ["relation", "female", ["name"]],
          ["relation", "mother", ["child", "mother"]],
        ];
        const rows = [
          "find",
          ["array/make", "?c", "?m"],
          ["and", ["mother", "?c", "?m"], ["female", "?m"]],
        ];
        const stated = yield* attempt(
          [
            "begin",
            ...base,
            ...names.map((name) => [
              "fact",
              [
                "exists",
                ["?m"],
                ["and", ["mother", name, "?m"], ["female", "?m"]],
              ],
            ]),
            rows,
          ],
          new LogicDatabase()
        );
        const invented = yield* attempt(
          [
            "begin",
            ...base,
            ...names.map((name) => ["fact", ["person", name]]),
            ["rule", head, ["person", "?c"]],
            rows,
          ],
          new LogicDatabase()
        );
        expect(stated).toEqual(invented);
      })
  );
});

const pairsOf = (count: number) =>
  Arbitrary.array(
    Arbitrary.all([
      element(["a", "b", "c", "d", "e"]),
      element(["a", "b", "c", "d", "e"]),
    ]),
    { maxLength: count }
  );

/** The groups of people that the twin pairs join, each sorted. */
const groupsOf = (
  names: readonly string[],
  twins: readonly (readonly [string, string])[]
) => {
  const parent = new Map(names.map((name) => [name, name]));
  const find = (name: string): string => {
    const up = parent.get(name) ?? name;
    return up === name ? name : find(up);
  };
  for (const [a, b] of twins) {
    parent.set(find(a), find(b));
  }
  const groups = new Map<string, string[]>();
  for (const name of names) {
    groups.set(find(name), [...(groups.get(find(name)) ?? []), name]);
  }
  return [...groups.values()].map((group) => group.sort());
};

describe("a key on a relation that a rule invents rows of", () => {
  it.effect.prop(
    "makes twins share one mother: a given one, or the unknown of the first",
    {
      names: people,
      twins: pairsOf(4),
      given: known,
      shared: Schema.Boolean,
    },
    ({ given, names, shared, twins }) =>
      Effect.gen(function* () {
        const pairs = twins.filter(
          ([a, b]) => names.includes(a) && names.includes(b)
        );
        const mothers = new Map(
          given.filter(([child]) => names.includes(child))
        );
        const share = shared
          ? [
              [
                "rule",
                [
                  "exists",
                  ["?m"],
                  ["and", ["mother", "?a", "?m"], ["mother", "?b", "?m"]],
                ],
                ["twin", "?a", "?b"],
              ],
            ]
          : [
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
            ];
        const outcome = yield* attempt(
          [
            "begin",
            ["relation", "person", ["name"]],
            ["relation", "twin", ["a", "b"]],
            ["relation", "mother", ["child", "mother"], { key: "child" }],
            ...names.map((name) => ["fact", ["person", name]]),
            ...pairs.map(([a, b]) => ["fact", ["twin", a, b]]),
            ...[...mothers].map(([child, mother]) => [
              "fact",
              ["mother", child, mother],
            ]),
            [
              "rule",
              ["exists", ["?m"], ["mother", "?c", "?m"]],
              ["person", "?c"],
            ],
            ...share,
            ["query", ["mother", "?c", "?m"], { order: "c" }],
          ],
          new LogicDatabase()
        );
        const groups = groupsOf(names, pairs);
        const givenIn = (group: readonly string[]) => [
          ...new Set(group.flatMap((name) => mothers.get(name) ?? [])),
        ];
        // A key allows one mother, so two given ones cannot both be it.
        if (groups.some((group) => givenIn(group).length > 1)) {
          expect(outcome.ok).toBe(false);
          return;
        }
        const rows = succeeded(outcome) as { c: string; m: unknown }[];
        expect(rows.map(({ c }) => c)).toEqual([...names]);
        for (const group of groups) {
          const held = rows.filter(({ c }) => group.includes(c));
          // One mother for the whole group.
          expect(new Set(held.map(({ m }) => JSON.stringify(m))).size).toBe(1);
          const [given] = givenIn(group);
          const mother = held[0]?.m;
          const paired = pairs.some(([a]) => group.includes(a));
          if (given !== undefined) {
            expect(mother).toBe(given);
          } else if (shared && paired) {
            // The unknown the shared head invents sorts before the others.
            expect((mother as unknown[])[2]).toEqual(
              expect.arrayContaining(["and"])
            );
          } else {
            expect(mother).toEqual(motherOf(group[0] as string));
          }
        }
      }),
    RUNS
  );
});

/** True when no row is explained, along any path, by itself. */
const wellFounded = (
  explanation: unknown,
  path: readonly string[] = []
): boolean => {
  if (typeof explanation !== "object" || explanation === null) {
    return true;
  }
  const { because = [], fact } = explanation as {
    because?: unknown[];
    fact?: unknown;
  };
  const key = JSON.stringify(fact);
  return (
    !path.includes(key) &&
    because.every((premise) => wellFounded(premise, [...path, key]))
  );
};

describe("why, after a key made unknowns one", () => {
  it.effect.prop(
    "explains every row by rows explained before it",
    {
      links: Arbitrary.array(
        Arbitrary.all([element(["a", "b", "c"]), element(["a", "b", "c"])]),
        { maxLength: 5 }
      ),
      names: Arbitrary.map(
        Arbitrary.array(element(["a", "b", "c"]), {
          minLength: 1,
          maxLength: 3,
        }),
        (items) => [...new Set(items)]
      ),
    },
    ({ links, names }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        const rows = succeeded(
          yield* attempt(
            [
              "begin",
              ["relation", "person", ["x"]],
              ["relation", "link", ["from", "to"]],
              ["relation", "parent", ["child", "parent"], { key: "child" }],
              ...names.map((name) => ["fact", ["person", name]]),
              ...links.map(([from, to]) => ["fact", ["link", from, to]]),
              [
                "rule",
                ["exists", ["?p"], ["parent", "?x", "?p"]],
                ["person", "?x"],
              ],
              [
                "rule",
                ["parent", "?b", "?p"],
                ["link", "?a", "?b"],
                ["parent", "?a", "?p"],
              ],
              ["find", ["array/make", "?c", "?p"], ["parent", "?c", "?p"]],
            ],
            database
          )
        ) as unknown[][];
        for (const [child, parent] of rows) {
          const explained = yield* attempt(
            ["why", ["parent", ["quote", child], written(parent)]],
            database
          ).pipe(Effect.timeout("2 seconds"));
          const explanation = succeeded(explained) as {
            because: unknown[];
            rule: unknown[];
          };
          expect(wellFounded(explanation)).toBe(true);
          // The rule that invents gives a child the unknown it names for
          // that child, so it explains another row only by saying what a
          // key made that unknown equal to.
          const named = ["some", "?p", ["parent", child, "?p"]];
          if (JSON.stringify(explanation.rule).includes("exists")) {
            const rests = JSON.stringify(parent) === JSON.stringify(named);
            expect(explanation.because).toContainEqual(
              rests
                ? { fact: ["person", child], given: true }
                : { same: [named, parent] }
            );
          }
        }
      }),
    RUNS
  );
});

describe("a key that makes an unknown equal to one that describes it", () => {
  it.effect.prop(
    "keeps the unknown described by nothing it equals, whichever sorts first",
    {
      first: element(["?b", "?m", "?z"]),
      second: element(["?a", "?n", "?y"]),
      later: Schema.Boolean,
    },
    ({ first, later, second }) =>
      Effect.gen(function* () {
        // ?u is invented for x, and ?w for y from x's value. Both reach z's
        // one row, so the key makes them one: the y unknown describes the
        // x unknown, so it is the x unknown that stays.
        const outcome = yield* attempt(
          [
            "begin",
            ["relation", "start", ["k"]],
            ["relation", "x", ["k", "v"]],
            ["relation", "y", ["k", "v"]],
            ["relation", "z", ["k", "v"], { key: "k" }],
            ["fact", ["start", 0]],
            ["rule", ["exists", [first], ["x", 1, first]], ["start", "?s"]],
            ["rule", ["exists", [second], ["y", "?u", second]], ["x", 1, "?u"]],
            // With `later`, the row of the unknown that describes the
            // other reaches z first.
            ...(later
              ? [
                  ["rule", ["z", 1, "?w"], ["y", "?u", "?w"]],
                  ["rule", ["z", 1, "?u"], ["y", "?u", "?w"]],
                ]
              : [
                  ["rule", ["z", 1, "?u"], ["x", 1, "?u"]],
                  ["rule", ["z", 1, "?w"], ["y", "?u", "?w"]],
                ]),
            // z is read back, so all four relations are derived together.
            ["rule", ["start", "?k"], ["z", "?k", "?v"]],
            [
              "array/make",
              ["find", "?v", ["z", "?k", "?v"]],
              ["find", ["array/make", "?u", "?w"], ["y", "?u", "?w"]],
            ],
          ],
          new LogicDatabase()
        );
        const x = ["some", first, ["x", 1, first]];
        expect(succeeded(outcome)).toEqual([[x], [[x, x]]]);
      })
  );
});

const vars = element(["?y", "?z"]);

describe("exists as a goal", () => {
  it.effect.prop(
    "matches what its goal matches, with the variables it lists its own",
    { given: facts, picked: rules, inner: vars },
    ({ given, inner, picked }) =>
      Effect.gen(function* () {
        const forms = program(given, picked);
        const outcome = yield* attempt(
          [
            "begin",
            ...forms,
            [
              "array/make",
              [
                "query",
                ["exists", [inner], ["parent", "?x", inner]],
                { order: "x" },
              ],
              ["query", ["parent", "?x", "?_"], { order: "x" }],
              [
                "find",
                "?x",
                [
                  "and",
                  ["person", "?x"],
                  ["not", ["exists", [inner], ["parent", "?x", inner]]],
                ],
              ],
              [
                "find",
                "?x",
                ["and", ["person", "?x"], ["not", ["parent", "?x", "?_"]]],
              ],
              ["exists", [inner], ["parent", "a", inner]],
              ["parent", "a", "?_"],
              // The variable it lists is not the one outside it.
              [
                "query",
                [
                  "and",
                  ["person", inner],
                  ["exists", [inner, "?w"], ["parent", inner, "?w"]],
                ],
                { order: inner.slice(1) },
              ],
              [
                "query",
                ["and", ["person", inner], ["parent", "?_", "?_"]],
                { order: inner.slice(1) },
              ],
            ],
          ],
          new LogicDatabase()
        );
        if (!outcome.ok) {
          expect(outcome.message).toContain(NEVER_FINISHES);
          return;
        }
        const [a, b, c, d, e, f, g, h] = outcome.value as unknown[];
        expect(a).toEqual(b);
        expect(c).toEqual(d);
        expect(e).toEqual(f);
        expect(g).toEqual(h);
      }),
    RUNS
  );
});

describe("a message about a goal inside exists", () => {
  it.effect.prop(
    "names its variables as the program wrote them",
    { variable: element(["?y", "?zed", "?n-1"]), bound: Schema.Boolean },
    ({ bound, variable }) =>
      Effect.gen(function* () {
        const goal = ["number/greaterThan", variable, 1];
        const outcome = yield* attempt(
          [
            "query",
            [
              "exists",
              [variable],
              bound ? ["and", ["in", "?w", ["array/make", 1]], goal] : goal,
            ],
          ],
          new LogicDatabase()
        );
        expect(outcome.ok).toBe(false);
        const message = outcome.ok ? "" : outcome.message;
        expect(message).toContain(`${variable} must first be bound`);
        expect(message).not.toContain("#");
      })
  );
});

const text = Arbitrary.schema(Schema.String);
const datum = oneOf<unknown>(
  text,
  Arbitrary.map(text, (s) => `\u0000${s}`),
  Arbitrary.schema(Schema.Int),
  Arbitrary.map(element(["a", "b", "c"]), (child) => ["mother", child])
);

describe("an unknown", () => {
  it.prop(
    "is equal to an unknown written the same way, and to no other value",
    { a: datum, b: datum },
    ({ a, b }) => {
      const make = (item: unknown) =>
        Array.isArray(item) ? new Unknown("m", item) : item;
      const [left, right] = [make(a), make(b)];
      const same = JSON.stringify(a) === JSON.stringify(b);
      expect(sameValue(left, right)).toBe(same);
      expect(valueKey([left]) === valueKey([right])).toBe(same);
      // An unknown is not the string its key would read as.
      if (left instanceof Unknown) {
        const lookalike = `\u0000?${left.key}`;
        expect(sameValue([left], [lookalike])).toBe(false);
        expect(valueKey([left]) === valueKey([lookalike])).toBe(false);
      }
    }
  );

  it.prop(
    "sorts after every record, and among unknowns by how it reads",
    { a: datum, b: datum },
    ({ a, b }) => {
      const unknown = (item: unknown) =>
        new Unknown("m", Array.isArray(item) ? item : ["about", item]);
      expect(compareValues({ any: a }, unknown(b))).toBe(-1);
      expect(Math.sign(compareValues(unknown(a), unknown(b)))).toBe(
        Math.sign(compareValues(unknown(a).form, unknown(b).form))
      );
    }
  );
});

const numbers = Arbitrary.map(
  Arbitrary.array(element([0, 1, 2, 3, 4]), { maxLength: 4 }),
  (items) => [...new Set(items)].sort((a, b) => a - b)
);

describe("the check that a program finishes", () => {
  it.effect.prop(
    "lets a recursive rule make a value for a column that never flows back",
    { given: numbers, invent: Schema.Boolean },
    ({ given, invent }) =>
      Effect.gen(function* () {
        // b's second column is made, and nothing reads it back into a.
        const made = invent
          ? ["rule", ["exists", ["?y"], ["b", "?x", "?y"]], ["a", "?x"]]
          : ["rule", ["b", "?x", ["number/add", "?x", 10]], ["a", "?x"]];
        const outcome = yield* attempt(
          [
            "begin",
            ["relation", "a", ["x"]],
            ["relation", "b", ["x", "y"]],
            ...given.map((x) => ["fact", ["a", x]]),
            made,
            ["rule", ["a", "?x"], ["b", "?x", "?y"]],
            ["find", ["array/make", "?x", "?y"], ["b", "?x", "?y"]],
          ],
          new LogicDatabase()
        );
        expect(succeeded(outcome)).toEqual(
          given.map((x) => [
            x,
            invent ? ["some", "?y", ["b", x, "?y"]] : x + 10,
          ])
        );
      })
  );

  it.effect.prop(
    "refuses a made value that flows back into making another",
    { given: numbers, invent: Schema.Boolean },
    ({ given, invent }) =>
      Effect.gen(function* () {
        const made = invent
          ? ["rule", ["exists", ["?y"], ["b", "?x", "?y"]], ["a", "?x"]]
          : ["rule", ["b", "?x", ["number/add", "?x", 10]], ["a", "?x"]];
        const outcome = yield* attempt(
          [
            "begin",
            ["relation", "a", ["x"]],
            ["relation", "b", ["x", "y"]],
            ...given.map((x) => ["fact", ["a", x]]),
            made,
            ["rule", ["a", "?y"], ["b", "?x", "?y"]],
          ],
          new LogicDatabase()
        );
        expect(outcome.ok).toBe(false);
        expect(outcome.ok ? "" : outcome.message).toContain(
          invent ? 'invents a value for "?y"' : "computes a new value"
        );
      })
  );
});

/**
 * A database follows a change to facts by adding and taking away the
 * candidates of rows, and by repairing the level each row is held from,
 * lowest first. That must give what deriving from nothing gives, and not
 * only the same rows: the level a row is held from, the level it is held
 * until, and the number of candidates it has at each level have one
 * solution for the facts there are. So after any changes a database keeps
 * for every row the very numbers a database that derived nothing yet works
 * out, also for the answers of rules that invent, the pairs of values a key
 * or an equality rule makes one, and the rows a merge ended.
 *
 * The programs here invent in two stages, pass invented values through
 * derived relations, make them one by a key, by equality rules over facts
 * and over derived rows, and by an equality rule that needs a row of the
 * second stage, so a value invented in the first stage is made one with
 * another only later. Facts that hold an unknown come and go, which says
 * whether a class may write the unknown as another value.
 *
 * Aggregates are kept by counted candidates: what each gives after any
 * changes is what a plain model computes from the facts there are.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { LogicDatabase } from "@/logic/database";
import { attempt, element, oneOf } from "./programs";

type Form = readonly unknown[];

/**
 * How many programs each property runs: 1,000, or what `LION_RUNS` says, as
 * `research/probes/weights-model` does to run several thousand.
 */
const RUNS = Number(process.env.LION_RUNS ?? 1000);
const OPTIONS = { timeout: 1000 * RUNS, arbitrary: { runs: RUNS } };

const NAMES = ["a", "b", "c", "d"] as const;

/** Ways of deriving from invented mothers, any of which a program can hold. */
const WAYS = {
  // Twins pass a mother on, which a key on mother makes one.
  pass: [
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
  // An equality rule over the rows rules invent.
  twins: [
    [
      "rule",
      ["=", "?m1", "?m2"],
      ["twin", "?a", "?b"],
      ["mother", "?a", "?m1"],
      ["mother", "?b", "?m2"],
    ],
  ],
  // An equality rule over a derived relation the unknowns pass through.
  parents: [
    [
      "rule",
      ["=", "?p1", "?p2"],
      ["twin", "?a", "?b"],
      ["parent", "?a", "?p1"],
      ["parent", "?b", "?p2"],
    ],
  ],
  // An unknown made one with a value a fact gives.
  registered: [
    [
      "rule",
      ["=", "?m", "?r"],
      ["mother", "?c", "?m"],
      ["registered", "?c", "?r"],
    ],
  ],
  // A second stage: a home for every mother, invented for unknowns too.
  homes: [
    ["rule", ["exists", ["?h"], ["home", "?m", "?h"]], ["mother", "?c", "?m"]],
  ],
  // Mothers made one only once the second stage has given one a home.
  late: [
    ["rule", ["exists", ["?h"], ["home", "?m", "?h"]], ["mother", "?c", "?m"]],
    [
      "rule",
      ["=", "?m1", "?m2"],
      ["lives", "?a", "?b"],
      ["mother", "?a", "?m1"],
      ["mother", "?b", "?m2"],
      ["home", "?m1", "?h"],
    ],
  ],
  // A rule that invents where a question about a relation it reads holds.
  guardians: [
    [
      "rule",
      ["exists", ["?g"], ["guardian", "?c", "?g"]],
      ["person", "?c"],
      ["not", ["registered", "?c", "?_"]],
    ],
  ],
} as const;

type Way = keyof typeof WAYS;

/** The declarations and rules of a program, with the ways it holds. */
const rulesOf = (ways: readonly Way[], keyed: boolean): Form[] => [
  ["relation", "person", ["name"]],
  ["relation", "twin", ["a", "b"]],
  ["relation", "lives", ["a", "b"]],
  ["relation", "registered", ["child", "mother"]],
  ["relation", "tall", ["who"]],
  [
    "relation",
    "mother",
    ["child", "mother"],
    ...(keyed ? [{ key: "child" }] : []),
  ],
  ["relation", "parent", ["child", "parent"]],
  ["relation", "home", ["who", "home"], ...(keyed ? [{ key: "who" }] : [])],
  ["relation", "guardian", ["child", "guardian"]],
  ["relation", "kin", ["a", "b"]],
  ["relation", "known", ["child"]],
  ["relation", "label", ["child", "tag"]],
  ["rule", ["exists", ["?m"], ["mother", "?c", "?m"]], ["person", "?c"]],
  ["rule", ["parent", "?c", "?m"], ["mother", "?c", "?m"]],
  // Two rows joined through a value that may be invented, and a test.
  [
    "rule",
    ["kin", "?a", "?b"],
    ["mother", "?a", "?m"],
    ["mother", "?b", "?m"],
    ["not", ["=", "?a", "?b"]],
  ],
  [
    "rule",
    ["known", "?c"],
    ["mother", "?c", "?m"],
    ["not", ["value/unknown?", "?m"]],
  ],
  // A head that computes with what may be invented.
  ["rule", ["label", "?c", ["array/make", "?c", "?m"]], ["parent", "?c", "?m"]],
  ...[...new Set(ways.flatMap((way): readonly Form[] => WAYS[way]))],
];

const RELATIONS = [
  "mother",
  "parent",
  "home",
  "guardian",
  "kin",
  "known",
  "label",
] as const;

const QUESTIONS = Object.fromEntries(
  RELATIONS.map((relation) => [
    relation,
    relation === "known"
      ? ["find", "?x", ["known", "?x"]]
      : ["find", ["array/make", "?x", "?y"], [relation, "?x", "?y"]],
  ])
);

const name = element(NAMES);

/** A fact of a relation that facts give. */
const fact: Arbitrary.Arbitrary<Form> = oneOf(
  Arbitrary.map(name, (who) => ["person", who]),
  Arbitrary.map(name, (who) => ["person", who]),
  Arbitrary.map(Arbitrary.all([name, name]), ([a, b]) => ["twin", a, b]),
  Arbitrary.map(Arbitrary.all([name, name]), ([a, b]) => ["lives", a, b]),
  Arbitrary.map(Arbitrary.all([name, element(["eve", "fay"])]), ([c, m]) => [
    "registered",
    c,
    m,
  ]),
  // A fact that holds the unknown a rule would invent, which makes it given.
  Arbitrary.map(name, (who) => ["tall", ["some", "?m", ["mother", who, "?m"]]])
);

const program = {
  changes: Arbitrary.array(
    Arbitrary.all([element(["fact", "retract"] as const), fact]),
    { minLength: 1, maxLength: 6 }
  ),
  // A key on mother and on home, or none.
  keyed: Arbitrary.schema(Schema.Boolean),
  start: Arbitrary.array(fact, { maxLength: 8 }),
  ways: Arbitrary.map(
    Arbitrary.array(element(Object.keys(WAYS) as Way[]), { maxLength: 4 }),
    (ways) => [...new Set(ways)].sort()
  ),
};

/** What a database answers, as sorted text, or why it cannot. */
const answers = (database: LogicDatabase) =>
  Effect.map(attempt(QUESTIONS, database), (outcome) =>
    outcome.ok
      ? Object.fromEntries(
          Object.entries(outcome.value as Record<string, unknown[]>).map(
            ([relation, rows]) => [
              relation,
              rows.map((row) => JSON.stringify(row)).sort(),
            ]
          )
        )
      : outcome
  );

/**
 * Every row a database keeps candidates of, with the level it is held from,
 * the level it is held until, and its candidates by level: also the rows of
 * the relations the engine keeps for itself.
 */
const weights = (database: LogicDatabase) => {
  const out: string[] = [];
  const seen = new Set<unknown>();
  for (const [member, support] of database.model?.support ?? []) {
    if (seen.has(support)) {
      continue;
    }
    seen.add(support);
    for (const [relation, entries] of support.entries) {
      for (const entry of entries.values()) {
        if (entry.n > 0) {
          const more = [...(entry.more ?? [])].sort(([a], [b]) => a - b);
          out.push(
            JSON.stringify([
              member,
              relation,
              entry.key,
              entry.from,
              String(entry.until),
              [[entry.level, entry.n], ...more],
            ])
          );
        }
      }
    }
  }
  return out.sort();
};

/** A database that holds some facts and has derived nothing yet. */
const fromNothing = (rules: readonly Form[], facts: Iterable<Form>) =>
  Effect.gen(function* () {
    const database = new LogicDatabase();
    const declared = rules.filter(([form]) => form === "relation");
    const made = yield* attempt(
      [
        "begin",
        ...declared,
        ...[...facts].map((it) => ["fact", it]),
        ...rules.filter(([form]) => form !== "relation"),
        true,
      ],
      database
    );
    return made.ok ? database : undefined;
  });

describe("rows with weights, held from a level", () => {
  it.effect.prop(
    "keep after any changes the rows, levels, and weights that deriving from nothing gives",
    program,
    ({ changes, keyed, start, ways }) =>
      Effect.gen(function* () {
        const rules = rulesOf(ways, keyed);
        const kept = new LogicDatabase();
        const ready = yield* attempt(
          ["begin", ...rules, ...start.map((it) => ["fact", it]), true],
          kept
        );
        if (!ready.ok) {
          return;
        }
        const held = new Map(start.map((it) => [JSON.stringify(it), it]));
        let before = yield* answers(kept);
        for (const [form, it] of changes) {
          const next = new Map(held);
          if (form === "fact") {
            next.set(JSON.stringify(it), it);
          } else {
            next.delete(JSON.stringify(it));
          }
          const fresh = yield* fromNothing(rules, next.values());
          kept.model?.last.clear();
          const changed = yield* attempt([form, it], kept);
          // A change is refused exactly when the facts break a rule.
          expect(changed.ok).toBe(fresh !== undefined);
          if (fresh === undefined) {
            continue;
          }
          const derived = !("ok" in before);
          before = yield* answers(kept);
          expect(before).toEqual(yield* answers(fresh));
          expect(weights(kept)).toEqual(weights(fresh));
          // An unknown a fact holds is given: no class writes it as another
          // value, so the row a rule invented with it is there as it is.
          for (const [, unknown] of "ok" in before ? [] : next.values()) {
            const who = ((unknown as Form | undefined)?.[2] as Form)?.[1];
            const invented = next.has(JSON.stringify(["person", who]));
            if (Array.isArray(unknown) && invented) {
              expect((before as Record<string, string[]>).mother).toContain(
                JSON.stringify([who, unknown])
              );
            }
          }
          // Every group was followed: none derived again, none forgotten.
          // A group whose rows could not be derived had none to follow.
          for (const how of derived ? (kept.model?.last.values() ?? []) : []) {
            expect(how).toBe("followed");
          }
          held.clear();
          for (const [key, value] of next) {
            held.set(key, value);
          }
        }
      }),
    OPTIONS
  );
});

const NODES = ["a", "b", "c", "d", "e"] as const;

const edge = Arbitrary.all([element(NODES), element(NODES)]);

/**
 * The level each path is held from, and how many candidates it has at each
 * level, worked out plainly: an edge is a candidate at level zero, and a
 * path with an edge after it is a candidate one level above the path. The
 * levels are found round by round, as the least a candidate gives.
 */
const levelsPlainly = (edges: readonly (readonly [string, string])[]) => {
  const from = new Map<string, number>();
  for (const [x, y] of edges) {
    from.set(`${x} ${y}`, 0);
  }
  for (let round = 0, grew = true; grew; round += 1) {
    grew = false;
    for (const [path, level] of [...from]) {
      const [x, y] = path.split(" ") as [string, string];
      for (const [via, z] of level === round ? edges : []) {
        if (via === y && !from.has(`${x} ${z}`)) {
          from.set(`${x} ${z}`, round + 1);
          grew = true;
        }
      }
    }
  }
  const out: string[] = [];
  for (const [path, level] of from) {
    const [x, z] = path.split(" ") as [string, string];
    const counts = new Map<number, number>();
    const add = (at: number) => counts.set(at, (counts.get(at) ?? 0) + 1);
    if (edges.some(([a, b]) => a === x && b === z)) {
      add(0);
    }
    for (const [y, end] of edges) {
      const before = from.get(`${x} ${y}`);
      if (end === z && before !== undefined) {
        add(before + 1);
      }
    }
    out.push(
      JSON.stringify([[x, z], level, [...counts].sort(([a], [b]) => a - b)])
    );
  }
  return out.sort();
};

/** The level and the candidates a database keeps for each path. */
const levelsKept = (database: LogicDatabase) =>
  [...(database.model?.support.get("path")?.entries.get("path") ?? [])]
    .flatMap(([, entry]) =>
      entry.n > 0
        ? [
            JSON.stringify([
              entry.tuple,
              entry.from,
              [[entry.level, entry.n] as const, ...(entry.more ?? [])].sort(
                ([a], [b]) => a - b
              ),
            ]),
          ]
        : []
    )
    .sort();

describe("the level a row is held from", () => {
  it.effect.prop(
    "is the least level a candidate gives it, with its candidates counted at each level, after any changes",
    {
      changes: Arbitrary.array(
        Arbitrary.all([element(["fact", "retract"] as const), edge]),
        { minLength: 1, maxLength: 10 }
      ),
      start: Arbitrary.array(edge, { maxLength: 8 }),
    },
    ({ changes, start }) =>
      Effect.gen(function* () {
        const kept = new LogicDatabase();
        yield* attempt(
          [
            "begin",
            ["relation", "edge", ["from", "to"]],
            ["relation", "path", ["from", "to"]],
            ["rule", ["path", "?x", "?y"], ["edge", "?x", "?y"]],
            [
              "rule",
              ["path", "?x", "?z"],
              ["path", "?x", "?y"],
              ["edge", "?y", "?z"],
            ],
            true,
          ],
          kept
        );
        const held = new Map<string, readonly [string, string]>();
        const all = [...start.map((it) => ["fact", it] as const), ...changes];
        for (const [form, [x, y]] of all) {
          if (form === "fact") {
            held.set(`${x} ${y}`, [x, y]);
          } else {
            held.delete(`${x} ${y}`);
          }
          yield* attempt([form, ["edge", x, y]], kept);
          yield* attempt(["query", ["path", "?x", "?y"]], kept);
          expect(levelsKept(kept)).toEqual(levelsPlainly([...held.values()]));
        }
      }),
    OPTIONS
  );
});

const GROUPS = ["g", "h"] as const;

/** A number an item holds: whole, or with a part that sums inexactly. */
const amount = oneOf(
  element([0, 1, 2, 3, 7, -4]),
  element([0.1, 0.2, 0.3, 1.5, -0.7])
);

const item: Arbitrary.Arbitrary<Form> = Arbitrary.map(
  Arbitrary.all([
    element([1, 2, 3, 4, 5, 6]),
    element(GROUPS),
    amount,
    element(["x", "yy", "zzz", "ab"]),
  ]),
  ([id, group, value, word]) => [
    "item",
    id,
    group,
    value,
    word,
    ["array/make", word, value],
  ]
);

const KINDS = [
  "count",
  "countUnique",
  "sum",
  "mean",
  "min",
  "max",
  "collect",
  "unique",
] as const;

const COMBINING: readonly Form[] = [
  ["relation", "item", ["id", "group", "value", "word", "list"], { key: "id" }],
  ...KINDS.flatMap((kind): Form[] => [
    ["relation", kind, ["group", "result"]],
    [
      "rule",
      [kind, "?g", [`aggregate/${kind}`, "?v"]],
      ["item", "?id", "?g", "?v", "?w", "?l"],
    ],
  ]),
  ["relation", "shortest", ["group", "result"]],
  [
    "rule",
    ["shortest", "?g", ["aggregate/shortest", "?w"]],
    ["item", "?id", "?g", "?v", "?w", "?l"],
  ],
  ["relation", "union", ["group", "result"]],
  [
    "rule",
    ["union", "?g", ["aggregate/union", "?l"]],
    ["item", "?id", "?g", "?v", "?w", "?l"],
  ],
];

const ascending = (a: unknown, b: unknown) => {
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  if (typeof a !== typeof b) {
    return typeof a === "number" ? -1 : 1;
  }
  return String(a) < String(b) ? -1 : Number(String(a) > String(b));
};

const distinct = <A>(values: readonly A[]) => [
  ...new Map(values.map((value) => [JSON.stringify(value), value])).values(),
];

/** What each aggregate gives for the items of one group, computed plainly. */
const combinedPlainly = (items: readonly Form[]) => {
  const values = items.map((it) => it[3] as number).sort(ascending);
  const words = items.map((it) => it[4] as string);
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    collect: values,
    count: values.length,
    countUnique: distinct(values).length,
    max: values.at(-1),
    mean: sum / values.length,
    min: values[0],
    shortest: [...words].sort(
      (a, b) => a.length - b.length || ascending(a, b)
    )[0],
    sum,
    union: distinct(items.flatMap((it) => [it[3], it[4]])).sort(ascending),
    unique: distinct(values),
  } as Record<string, unknown>;
};

describe("aggregates kept by counted candidates", () => {
  it.effect.prop(
    "give after any changes what a plain model computes from the facts there are",
    {
      changes: Arbitrary.array(
        Arbitrary.all([element(["fact", "retract"] as const), item]),
        { minLength: 1, maxLength: 8 }
      ),
      start: Arbitrary.array(item, { maxLength: 6 }),
    },
    ({ changes, start }) =>
      Effect.gen(function* () {
        const kept = new LogicDatabase();
        expect(yield* attempt(["begin", ...COMBINING, true], kept)).toEqual({
          ok: true,
          value: true,
        });
        // A keyed relation holds the last fact given for each id.
        const held = new Map<unknown, Form>();
        const all = [...start.map((it) => ["fact", it] as const), ...changes];
        for (const [form, it] of all) {
          if (form === "fact") {
            held.set(it[1], it);
          } else if (JSON.stringify(held.get(it[1])) === JSON.stringify(it)) {
            held.delete(it[1]);
          }
          expect(yield* attempt([form, it], kept)).toMatchObject({ ok: true });
          for (const kind of [...KINDS, "shortest", "union"]) {
            const found = yield* attempt(
              ["find", ["array/make", "?g", "?r"], [kind, "?g", "?r"]],
              kept
            );
            const expected = GROUPS.flatMap((group) => {
              const items = [...held.values()].filter((it) => it[2] === group);
              return items.length === 0
                ? []
                : [[group, combinedPlainly(items)[kind]]];
            });
            expect(found).toEqual({ ok: true, value: expected });
          }
          expect(kept.model?.last.get("sum") ?? "followed").toBe("followed");
        }
      }),
    OPTIONS
  );
});

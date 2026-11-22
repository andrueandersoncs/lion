import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect } from "effect";
import { analyze } from "@/analysis/analyze";
import { run } from "@/evaluation/evaluate";
import { LogicDatabase } from "@/logic/database";
import { saveDatabase } from "@/logic/snapshot";
import { stdlib } from "@/modules";
import { attempt, element, oneOf } from "./programs";

const orders = [
  ["relation", "order", ["id", "status", "total"], { key: ["id"] }],
  ["fact", ["order", 1, "open", 30], ["order", 2, "open", 12]],
];

const errorMessage = (expression: unknown) =>
  run(expression, stdlib).pipe(
    Effect.flip,
    Effect.map((error) => String((error as { message?: unknown }).message))
  );

describe("keyed relations", () => {
  it.effect("replace the row with the same key", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        [
          "begin",
          ...orders,
          ["fact", ["order", 1, "shipped", 30]],
          ["query", ["order", "?id", "?status", "?total"], { order: "id" }],
        ],
        stdlib
      );
      expect(rows).toEqual([
        { id: 1, status: "shipped", total: 30 },
        { id: 2, status: "open", total: 12 },
      ]);
    })
  );

  it.effect("let the last of several facts for one key win", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        [
          "begin",
          ...orders,
          ["fact", ["order", 3, "open", 1], ["order", 3, "paid", 1]],
          ["query", ["order", 3, "?status", "?_"]],
        ],
        stdlib
      );
      expect(rows).toEqual([{ status: "paid" }]);
    })
  );

  it.effect("key on several columns", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        [
          "begin",
          [
            "relation",
            "stock",
            ["warehouse", "sku", "count"],
            { key: ["warehouse", "sku"] },
          ],
          [
            "fact",
            ["stock", "east", "pen", 5],
            ["stock", "west", "pen", 2],
            ["stock", "east", "pen", 9],
          ],
          ["query", ["stock", "?w", "pen", "?count"], { order: "w" }],
        ],
        stdlib
      );
      expect(rows).toEqual([
        { w: "east", count: 9 },
        { w: "west", count: 2 },
      ]);
    })
  );

  it.effect("retract only an exact row", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        [
          "begin",
          ...orders,
          ["retract", ["order", 1, "shipped", 30]],
          ["retract", ["order", 2, "open", 12]],
          ["query", ["order", "?id", "?_", "?_"]],
        ],
        stdlib
      );
      expect(rows).toEqual([{ id: 1 }]);
    })
  );

  it.effect("keep upserts across runs that share a database", () =>
    Effect.gen(function* () {
      const database = new LogicDatabase();
      yield* run(["begin", ...orders], stdlib, { database });
      // Each run binds relations again by declaring them with the same key.
      const rows = yield* run(
        [
          "begin",
          orders[0],
          ["fact", ["order", 2, "paid", 12]],
          ["query", ["order", 2, "?status", "?_"]],
        ],
        stdlib,
        { database }
      );
      expect(rows).toEqual([{ status: "paid" }]);
    })
  );

  it.effect("accept rules whose rows keep one per key", () =>
    Effect.gen(function* () {
      const rows = yield* run(
        [
          "begin",
          ...orders,
          ["relation", "label", ["id", "text"], { key: "id" }],
          [
            "rule",
            ["label", "?id", "?status"],
            ["order", "?id", "?status", "?_"],
          ],
          ["query", ["label", 1, "?text"]],
        ],
        stdlib
      );
      expect(rows).toEqual([{ text: "open" }]);
    })
  );

  it.effect("report rules that derive two rows for one key", () =>
    Effect.gen(function* () {
      const program = [
        "begin",
        ...orders,
        ["relation", "summary", ["status", "id"], { key: ["status"] }],
        ["rule", ["summary", "?s", "?id"], ["order", "?id", "?s", "?_"]],
      ];
      expect(
        yield* errorMessage([...program, ["query", ["summary", "?s", "?id"]]])
      ).toContain('"summary" is keyed by ["status"], but');
      // Goal-directed queries check the rows they derive the same way.
      expect(
        yield* errorMessage([...program, ["query", ["summary", "open", "?id"]]])
      ).toContain(
        'derived ["summary","open",2] while ["summary","open",1] holds'
      );
    })
  );
});

describe("relation options", () => {
  it.effect("reject bad keys and unknown options", () =>
    Effect.gen(function* () {
      const declare = (options: unknown) =>
        errorMessage(["relation", "r", ["a", "b"], options]);
      expect(yield* declare({ key: ["c"] })).toContain('has no column "c"');
      expect(yield* declare({ key: [] })).toContain("at least one key column");
      expect(yield* declare({ key: ["a", "a"] })).toContain(
        'repeats the column "a" in its key'
      );
      expect(yield* declare({ unique: ["a"] })).toContain(
        'Unknown relation option "unique"'
      );
      expect(yield* declare({ key: 1 })).toContain("must be a column name");
      expect(yield* declare("a")).toContain(
        "Relation options must be a record"
      );
    })
  );

  it.effect("require a redeclaration to repeat the key", () =>
    Effect.gen(function* () {
      yield* run(
        [
          "begin",
          ["relation", "r", ["a", "b"], { key: "a" }],
          ["relation", "r", ["a", "b"], { key: ["a"] }],
        ],
        stdlib
      );
      expect(
        yield* errorMessage([
          "begin",
          ["relation", "r", ["a", "b"], { key: "a" }],
          ["relation", "r", ["a", "b"]],
        ])
      ).toContain('already declared with columns ["a","b"] and key ["a"]');
    })
  );

  it("are classified by the analyzer", () => {
    const node = analyze(["relation", "r", ["a"], { key: ["a"] }]);
    expect(node.specialForm).toBe("relation");
    expect(node.children.map((child) => child.role)).toEqual([
      "operator",
      "binding",
      "columns",
      "options",
    ]);
  });
});

type Order = readonly [id: number, status: string];

const order = Arbitrary.all([
  element([1, 2, 3]),
  element(["open", "shipped", "paid"]),
]);

/**
 * The rows of a keyed relation, in the order a snapshot keeps them, after a
 * fact form. A row other than the last the form gives its key is not
 * written, so the form says what that row says. The rows that are written
 * go in turn: a row that holds changes nothing, a row with a new key comes
 * last, and a row with another row's key takes that row's place at the end.
 */
const afterForm = (held: readonly Order[], form: readonly Order[]) => {
  const rows = [...held];
  const last = new Map(form.map(([id, status]) => [id, status]));
  const written = form.filter(([id, status]) => last.get(id) === status);
  for (const [id, status] of written) {
    const at = rows.findIndex(([other]) => other === id);
    if (rows[at]?.[1] !== status) {
      rows.splice(at < 0 ? rows.length : at, at < 0 ? 0 : 1);
      rows.push([id, status]);
    }
  }
  return rows;
};

describe("a fact form on a keyed relation", () => {
  it.effect.prop(
    "says what its last row for each key says, and changes nothing that row holds already",
    {
      start: Arbitrary.array(order, { maxLength: 4 }),
      form: Arbitrary.array(order, { minLength: 1, maxLength: 4 }),
    },
    ({ form, start }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        const written = (rows: readonly Order[]) =>
          rows.length === 0
            ? []
            : [["fact", ...rows.map((row) => ["order", ...row])]];
        yield* run(
          [
            "begin",
            ["relation", "order", ["id", "status"], { key: "id" }],
            ...written(start),
            ...written(form),
            true,
          ],
          stdlib,
          { database }
        );
        const saved = (yield* saveDatabase(database)) as unknown[][];
        expect(saved.filter(([kind]) => kind === "fact")).toEqual(
          written(afterForm(afterForm([], start), form))
        );
      }),
    { arbitrary: { runs: 1000 } }
  );
});

const KIDS = ["k1", "k2", "k3"] as const;

/** Rules that give a keyed relation rows: two that copy a relation, one that recurses. */
const GIVERS = {
  a: ["rule", ["out", "?k", "?v"], ["a", "?k", "?v"]],
  b: ["rule", ["out", "?k", "?v"], ["b", "?k", "?v"]],
  link: [
    "rule",
    ["out", "?k", "?v"],
    ["out", "?j", "?v"],
    ["link", "?j", "?k"],
  ],
} as const;

type Giver = keyof typeof GIVERS;

/** A fact of a relation the rules read, or of the keyed relation itself. */
const given = oneOf<readonly [string, string, number | string]>(
  Arbitrary.all([element(["a", "b"]), element(KIDS), element([1, 2, 3])]),
  Arbitrary.map(
    Arbitrary.all([element(KIDS), element([1, 2, 3])]),
    ([kid, value]) => ["out", kid, value] as const
  ),
  Arbitrary.map(
    Arbitrary.all([element(KIDS), element(KIDS)]),
    ([from, to]) => ["link", from, to] as const
  )
);

/**
 * What a question about the keyed relation says for some facts and rules,
 * worked out plainly. Its rows are its facts, the last for each key, and
 * what the rules give, to a fixed point. Two rows with one key fail the
 * question: of every such pair, the one whose rows sort first, and of its
 * two rows, the one a rule gives now, or the one that sorts later when
 * rules give both; and of the rules that give it, the one whose written
 * form sorts first.
 */
const plainly = (
  rules: readonly Giver[],
  facts: readonly (readonly [string, string, number | string])[]
) => {
  const keyed = new Map<string, number | string>();
  const read = new Set<string>();
  for (const [relation, kid, value] of facts) {
    if (relation === "out") {
      keyed.set(kid, value);
    } else {
      read.add(JSON.stringify([relation, kid, value]));
    }
  }
  const rows = new Map<string, readonly [string, number]>();
  const add = (kid: string, value: number) =>
    rows.set(JSON.stringify([kid, value]), [kid, value]);
  for (const [kid, value] of keyed) {
    add(kid, value as number);
  }
  const gives = (rule: Giver, [kid, value]: readonly [string, number]) =>
    rule === "link"
      ? KIDS.some(
          (from) =>
            rows.has(JSON.stringify([from, value])) &&
            read.has(JSON.stringify(["link", from, kid]))
        )
      : read.has(JSON.stringify([rule, kid, value]));
  for (let grew = true; grew; ) {
    const before = rows.size;
    for (const kid of KIDS) {
      for (const value of [1, 2, 3]) {
        if (rules.some((rule) => gives(rule, [kid, value]))) {
          add(kid, value);
        }
      }
    }
    grew = rows.size > before;
  }
  const sorted = [...rows.values()].sort(
    ([a, x], [b, y]) => a.localeCompare(b) || x - y
  );
  const [held, other] = sorted.filter(
    ([kid]) => sorted.filter(([each]) => each === kid).length > 1
  );
  if (held === undefined || other === undefined || held[0] !== other[0]) {
    return { rows: sorted.map((row) => JSON.stringify(row)) };
  }
  const by = (row: readonly [string, number]) =>
    rules.filter((rule) => gives(rule, row)).sort();
  const [derived, kept] =
    by(held).length > 0 && by(other).length === 0
      ? [held, other]
      : [other, held];
  const [rule] = by(derived);
  return {
    message: `"out" is keyed by ["kid"], but ${JSON.stringify(GIVERS[rule as Giver])} derived ${JSON.stringify(["out", ...derived])} while ${JSON.stringify(["out", ...kept])} holds.`,
  };
};

describe("two rows with one key", () => {
  // A database follows each change, also when its rows break a key: the
  // question then fails, naming the rows and a rule as deriving from
  // nothing would, and the next change is followed through them.
  it.effect.prop(
    "fail a question with the two rows that sort first, and the least rule that gives one now",
    {
      changes: Arbitrary.array(
        Arbitrary.all([element(["fact", "retract"] as const), given]),
        { minLength: 1, maxLength: 8 }
      ),
      rules: Arbitrary.map(
        Arbitrary.array(element(Object.keys(GIVERS) as Giver[]), {
          maxLength: 4,
        }),
        (rules) => [...new Set(rules)]
      ),
      start: Arbitrary.array(given, { maxLength: 5 }),
    },
    ({ changes, rules, start }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        const facts = new Map<
          string,
          readonly [string, string, number | string]
        >();
        const out = new Map<
          string,
          readonly [string, string, number | string]
        >();
        const note = (form: "fact" | "retract", it: (typeof start)[number]) => {
          const [relation, kid] = it;
          const name = relation === "out" ? `out ${kid}` : JSON.stringify(it);
          if (form === "fact") {
            (relation === "out" ? out : facts).set(name, it);
          } else if (
            JSON.stringify(out.get(name) ?? facts.get(name)) ===
            JSON.stringify(it)
          ) {
            out.delete(name);
            facts.delete(name);
          }
        };
        yield* attempt(
          [
            "begin",
            ["relation", "a", ["kid", "value"]],
            ["relation", "b", ["kid", "value"]],
            ["relation", "link", ["from", "to"]],
            ["relation", "out", ["kid", "value"], { key: "kid" }],
            ...rules.map((rule) => GIVERS[rule]),
            true,
          ],
          database
        );
        for (const [form, it] of [
          ...start.map((it) => ["fact", it] as const),
          ...changes,
        ]) {
          yield* attempt([form, it], database);
          note(form, it);
          const found = yield* attempt(
            ["find", ["array/make", "?k", "?v"], ["out", "?k", "?v"]],
            database
          );
          const expected = plainly(rules, [...facts.values(), ...out.values()]);
          expect(
            found.ok
              ? {
                  rows: (found.value as unknown[])
                    .map((row) => JSON.stringify(row))
                    .sort(),
                }
              : { message: found.message }
          ).toEqual(
            "rows" in expected
              ? { rows: [...(expected.rows ?? [])].sort() }
              : expected
          );
        }
      }),
    { arbitrary: { runs: 2000 }, timeout: 120_000 }
  );
});

/** Rules of twins whose mothers are invented, passed on, and registered. */
const TWIN_RULES = {
  invent: [
    "rule",
    ["exists", ["?m"], ["mother", "?c", "?m"]],
    ["person", "?c"],
  ],
  passTo: [
    "rule",
    ["mother", "?b", "?m"],
    ["twin", "?a", "?b"],
    ["mother", "?a", "?m"],
  ],
  passFrom: [
    "rule",
    ["mother", "?a", "?m"],
    ["twin", "?a", "?b"],
    ["mother", "?b", "?m"],
  ],
  registered: [
    "rule",
    ["=", "?m", "?r"],
    ["mother", "?c", "?m"],
    ["registered", "?c", "?r"],
  ],
} as const;

describe("two rows with one key, one of which a key or an equality rule made", () => {
  // Each twin's invented mother is made one with the mother registered for
  // her, so the row that holds the registered mother is given by the rule
  // that invented the one it became. Twins then pass both on, and the
  // first twin has two mothers: the refusal tells the one that sorts later
  // as derived, by the rule that invented it or the one that passed it on.
  it.effect.prop(
    "tell a row a merge gave as given by the rule that gave the row it became",
    {
      mothers: Arbitrary.filter(
        Arbitrary.all([
          element(["eve", "fay", "gil"]),
          element(["eve", "fay", "gil"]),
        ]),
        ([first, second]) => first !== second
      ),
      reversed: element([false, true]),
    },
    ({ mothers: [first, second], reversed }) =>
      Effect.gen(function* () {
        const program = [
          ["relation", "person", ["name"]],
          ["relation", "twin", ["a", "b"]],
          ["relation", "registered", ["child", "mother"]],
          ["relation", "mother", ["child", "mother"], { key: "child" }],
          ...Object.values(TWIN_RULES),
          [
            "fact",
            ["person", "a"],
            ["person", "b"],
            ["registered", "a", first],
            ["registered", "b", second],
          ],
        ];
        const twin = reversed ? ["twin", "b", "a"] : ["twin", "a", "b"];
        // The second twin's mother reaches the first twin by the rule that
        // passes a mother in the twin's direction.
        const passed = reversed ? TWIN_RULES.passTo : TWIN_RULES.passFrom;
        const [derived, held, rule] =
          second > first
            ? [second, first, passed]
            : [first, second, TWIN_RULES.invent];
        const expected = `"mother" is keyed by ["child"], but ${JSON.stringify(rule)} derived ${JSON.stringify(["mother", "a", derived])} while ${JSON.stringify(["mother", "a", held])} holds.`;
        const kept = new LogicDatabase();
        yield* attempt(
          ["begin", ...program, ["query", ["mother", "?c", "?m"]]],
          kept
        );
        expect(yield* attempt(["fact", twin], kept)).toEqual({
          message: expected,
          ok: false,
        });
        const fresh = new LogicDatabase();
        expect(
          yield* attempt(["begin", ...program, ["fact", twin]], fresh)
        ).toEqual({
          message: expected,
          ok: false,
        });
      }),
    { arbitrary: { runs: 100 } }
  );
});

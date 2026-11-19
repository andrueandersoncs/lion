/**
 * One model of a relation: a key, and how the candidates for a key combine.
 * A relation whose rules aggregate merges what each key gets with those
 * aggregates, as one that declares a merge does, so a fact and a rule with a
 * plain head give it candidates too, in whatever order they come, and the
 * database gives what a plain model that combines every candidate gives. A
 * rule or invariant taken back with `retract` leaves the database as if it
 * had never been added.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { LogicDatabase } from "@/logic/database";
import { loadDatabase, saveDatabase } from "@/logic/snapshot";
import { stdlib } from "@/modules";

const OPTIONS = { arbitrary: { runs: 150 } };

const int = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

const WHO = ["ana", "bo", "cy"] as const;
const KINDS = ["sum", "count", "min", "max"] as const;
type Kind = (typeof KINDS)[number];

/** A candidate: who it is for and its amount. */
const candidate = Arbitrary.map(
  Arbitrary.all([int(0, WHO.length - 1), int(-5, 9)]),
  ([who, amount]) => [WHO[who] as string, amount] as const
);

const candidates = Arbitrary.array(candidate, { maxLength: 6 });

/** What a plain model of the merge gives each key: its candidates combined. */
const combine = (kind: Kind, amounts: readonly number[]) => {
  if (kind === "sum") {
    return amounts.reduce((total, amount) => total + amount, 0);
  }
  if (kind === "count") {
    return amounts.length;
  }
  return kind === "min" ? Math.min(...amounts) : Math.max(...amounts);
};

const expected = (
  kind: Kind,
  given: readonly (readonly [string, number])[]
) => {
  const byWho = new Map<string, number[]>();
  for (const [who, amount] of given) {
    byWho.set(who, [...(byWho.get(who) ?? []), amount]);
  }
  return [...byWho]
    .map(([who, amounts]) => ({ who, total: combine(kind, amounts) }))
    .sort((a, b) => (a.who < b.who ? -1 : 1));
};

/** Moves the item at `from` to the front. */
const rotate = <A>(items: readonly A[], from: number) => {
  const at = from % items.length;
  return [...items.slice(at), ...items.slice(0, at)];
};

const query = ["query", ["total", "?who", "?total"], { order: "who" }];

describe("a relation whose rules aggregate", () => {
  it.effect.prop(
    "combines every candidate for a key, from facts, from rules that aggregate, and from rules with plain heads, in any order",
    {
      kind: Arbitrary.schema(Schema.Literals(KINDS)),
      sales: candidates,
      refunds: candidates,
      direct: candidates,
      declared: Arbitrary.schema(Schema.Literals(["merge", "key", "nothing"])),
      order: int(0, 4),
    },
    ({ declared, direct, kind, order, refunds, sales }) =>
      Effect.gen(function* () {
        const numbered = (rows: readonly (readonly [string, number])[]) =>
          rows.map(([who, amount], id) => [id, who, amount]);
        const forms = [
          ...(sales.length === 0
            ? []
            : [["fact", ...numbered(sales).map((row) => ["sale", ...row])]]),
          ...(refunds.length === 0
            ? []
            : [
                ["fact", ...numbered(refunds).map((row) => ["refund", ...row])],
              ]),
          ...(direct.length === 0
            ? []
            : [["fact", ...direct.map((row) => ["total", ...row])]]),
          [
            "rule",
            [
              "total",
              "?w",
              declared === "merge" ? "?a" : [`aggregate/${kind}`, "?a"],
            ],
            ["sale", "?id", "?w", "?a"],
          ],
          ["rule", ["total", "?w", "?a"], ["refund", "?id", "?w", "?a"]],
        ];
        // A key alone leaves the merge to the rule that aggregates.
        const options = {
          merge: [{ key: "who", merge: { total: `aggregate/${kind}` } }],
          key: [{ key: "who" }],
          nothing: [],
        }[declared];
        const database = new LogicDatabase();
        const program = [
          "begin",
          ["relation", "sale", ["id", "who", "amount"]],
          ["relation", "refund", ["id", "who", "amount"]],
          ["relation", "total", ["who", "total"], ...options],
          ...rotate(forms, order),
          query,
        ];
        // A fact repeated is one fact, so it is one candidate. Under a key
        // the relation declares without a merge, a fact replaces the fact
        // its key has, so a form keeps its last fact for each key.
        const distinct = [
          ...new Map(
            direct.map((row) => [
              declared === "key" ? row[0] : JSON.stringify(row),
              row,
            ])
          ).values(),
        ];
        const want = expected(kind, [...sales, ...refunds, ...distinct]);
        expect(yield* run(program, stdlib, { database })).toEqual(want);
        // A snapshot keeps every candidate, and loads into the same answers.
        const loaded = yield* loadDatabase(
          yield* saveDatabase(database),
          stdlib
        );
        expect(yield* run(query, stdlib, { database: loaded })).toEqual(want);
      }),
    OPTIONS
  );
});

describe("retract", () => {
  it.effect.prop(
    "takes a rule back, leaving what a database that never had it gives",
    {
      sales: candidates,
      refunds: candidates,
      taken: Arbitrary.schema(Schema.Literals(["aggregate", "plain", "both"])),
    },
    ({ refunds, sales, taken }) =>
      Effect.gen(function* () {
        const numbered = (rows: readonly (readonly [string, number])[]) =>
          rows.map(([who, amount], id) => [id, who, amount]);
        const aggregate = [
          "rule",
          ["total", "?w", ["aggregate/sum", "?a"]],
          ["sale", "?id", "?w", "?a"],
        ];
        const plain = [
          "rule",
          ["total", "?w", "?a"],
          ["refund", "?id", "?w", "?a"],
        ];
        const setup = [
          ["relation", "sale", ["id", "who", "amount"]],
          ["relation", "refund", ["id", "who", "amount"]],
          ["relation", "total", ["who", "total"]],
          [
            "fact",
            ["sale", 0, "ana", 0],
            ...numbered(sales).map((r) => ["sale", ...r]),
          ],
          [
            "fact",
            ["refund", 0, "ana", 0],
            ...numbered(refunds).map((r) => ["refund", ...r]),
          ],
        ];
        const gone = {
          aggregate: [aggregate],
          plain: [plain],
          both: [aggregate, plain],
        }[taken];
        const kept = [aggregate, plain].filter(
          (rule) => !(gone as unknown[]).includes(rule)
        );
        const retracted = yield* run(
          [
            "begin",
            ...setup,
            aggregate,
            plain,
            query,
            ["retract", ...gone],
            query,
          ],
          stdlib
        );
        const never = yield* run(["begin", ...setup, ...kept, query], stdlib);
        expect(retracted).toEqual(never);
      }),
    OPTIONS
  );

  it.effect.prop(
    "takes an invariant back, so a fact it refused can be added",
    {
      refused: int(0, 9),
      others: Arbitrary.array(int(0, 9), { maxLength: 4 }),
    },
    ({ others, refused }) =>
      Effect.gen(function* () {
        const invariant = ["invariant", ["p", refused], { assert: "none" }];
        const kept = others.filter((x) => x !== refused);
        const setup = [
          ["relation", "p", ["x"]],
          ...kept.map((x) => ["fact", ["p", x]]),
          invariant,
        ];
        const refusedFirst = yield* Effect.flip(
          run(["begin", ...setup, ["fact", ["p", refused]]], stdlib)
        );
        expect(String(refusedFirst.message)).toContain("breaks an invariant");
        expect(
          yield* run(
            [
              "begin",
              ...setup,
              ["retract", invariant],
              ["fact", ["p", refused]],
              ["find", "?x", ["p", "?x"]],
            ],
            stdlib
          )
        ).toEqual([...new Set([...kept, refused])].sort((a, b) => a - b));
      }),
    OPTIONS
  );
});

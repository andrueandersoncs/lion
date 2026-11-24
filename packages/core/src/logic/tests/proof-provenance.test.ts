import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { loadDatabase, saveDatabase } from "@/logic/snapshot";
import { stdlib } from "@/modules";

const int = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

describe("proof/facts and proof/assumptions", () => {
  it.effect.prop(
    "proof/facts returns the exact subset of asserted base facts supporting a derivation",
    {
      edges: Arbitrary.array(Arbitrary.all([int(0, 4), int(0, 4)]), {
        minLength: 1,
        maxLength: 8,
      }),
    },
    ({ edges }) =>
      Effect.gen(function* () {
        const uniqueEdges = [
          ...new Map(
            edges.map(([u, v]) => [`${u},${v}`, [u, v] as const])
          ).values(),
        ];
        const program = [
          "begin",
          ["relation", "e", ["u", "v"]],
          ["relation", "reach", ["u", "v"]],
          ["fact", ...uniqueEdges.map(([u, v]) => ["e", u, v])],
          ["rule", ["reach", "?x", "?y"], ["e", "?x", "?y"]],
          [
            "rule",
            ["reach", "?x", "?z"],
            ["reach", "?x", "?y"],
            ["e", "?y", "?z"],
          ],
          [
            "query",
            [
              "and",
              ["reach", "?u", "?v"],
              ["=", "?facts", ["proof/facts", ["why", ["reach", "?u", "?v"]]]],
            ],
          ],
        ];
        const rows = (yield* run(program, stdlib)) as readonly {
          u: number;
          v: number;
          facts: readonly (readonly [string, number, number])[];
        }[];
        const baseSet = new Set(uniqueEdges.map(([u, v]) => `e:${u}:${v}`));
        for (const row of rows) {
          expect(row.facts.length).toBeGreaterThan(0);
          for (const fact of row.facts) {
            expect(baseSet.has(`${fact[0]}:${fact[1]}:${fact[2]}`)).toBe(true);
          }
        }
      })
  );

  it.effect.prop(
    "proof/facts collects every contributing base fact of an aggregate rule and proof/assumptions collects leaf absences",
    {
      items: Arbitrary.array(
        Arbitrary.all({
          id: int(0, 5),
          val: int(1, 20),
          excluded: Arbitrary.schema(Schema.Boolean),
        }),
        { minLength: 1, maxLength: 6 }
      ),
    },
    ({ items }) =>
      Effect.gen(function* () {
        const byId = new Map<number, { val: number; excluded: boolean }>();
        for (const item of items) {
          byId.set(item.id, { val: item.val, excluded: item.excluded });
        }
        const active = [...byId.entries()].filter(([, v]) => !v.excluded);
        const sum = active.reduce((acc, [, v]) => acc + v.val, 0);
        const program = [
          "begin",
          ["relation", "entry", ["id", "val"], { key: "id" }],
          ["relation", "blocked", ["id"]],
          ["relation", "total", ["n"]],
          [
            "fact",
            ...[...byId.entries()].map(([id, { val }]) => ["entry", id, val]),
            ...[...byId.entries()]
              .filter(([, v]) => v.excluded)
              .map(([id]) => ["blocked", id]),
          ],
          [
            "rule",
            ["total", ["aggregate/sum", "?v"]],
            ["entry", "?id", "?v"],
            ["not", ["blocked", "?id"]],
          ],
        ];
        const db = yield* loadDatabase(program, stdlib);
        const reloaded = yield* loadDatabase(yield* saveDatabase(db), stdlib);
        if (active.length === 0) {
          const absent = yield* run(
            ["proof/assumptions", ["why", ["total", 0]]],
            stdlib,
            { database: reloaded }
          );
          expect(Array.isArray(absent)).toBe(true);
        } else {
          const facts = (yield* run(
            ["proof/facts", ["why", ["total", sum]]],
            stdlib,
            { database: reloaded }
          )) as readonly unknown[][];
          expect(facts).toEqual(
            active
              .map(([id, { val }]) => ["entry", id, val])
              .sort((a, b) => (a[1] as number) - (b[1] as number))
          );

          const assumptions = (yield* run(
            ["proof/assumptions", ["why", ["total", sum]]],
            stdlib,
            { database: reloaded }
          )) as readonly unknown[][];
          expect(assumptions).toEqual(
            active
              .map(([id]) => ["blocked", id])
              .sort((a, b) => (a[1] as number) - (b[1] as number))
          );
        }
      })
  );
});

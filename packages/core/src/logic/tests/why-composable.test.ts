/**
 * Composable `why`: `why` is a first-class question obeying Lion's asking and
 * waiting rules, so it works in queries, `find`, rule heads and bodies, `cond`,
 * `assuming`, invariants, and snapshots, and always agrees with top-level `why`.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { LogicDatabase } from "@/logic/database";
import { loadDatabase, saveDatabase } from "@/logic/snapshot";
import { stdlib } from "@/modules";

const node = Arbitrary.schema(Schema.Literals(["a", "b", "c", "d"]));
const edge = Arbitrary.schema(
  Schema.Tuple([
    Schema.Literals(["a", "b", "c", "d"]),
    Schema.Literals(["a", "b", "c", "d"]),
  ])
);
const edges = Arbitrary.array(edge, { minLength: 1, maxLength: 6 });
const smallInt = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 5 }))
);

const reachSetup = (pairs: readonly (readonly [string, string])[]) => [
  ["relation", "edge", ["from", "to"]],
  ["relation", "reach", ["from", "to"]],
  ["rule", ["reach", "?x", "?y"], ["edge", "?x", "?y"]],
  ["rule", ["reach", "?x", "?z"], ["reach", "?x", "?y"], ["edge", "?y", "?z"]],
  ["fact", ...pairs.map(([from, to]) => ["edge", from, to])],
];

describe("composable why", () => {
  it.effect.prop(
    "why in query, find, rule head, rule body, cond, and snapshots matches top-level why for holding and absent rows",
    { pairs: edges, start: node, target: node },
    ({ pairs, start, target }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        yield* run(
          [
            "begin",
            ...reachSetup(pairs),
            ["relation", "probe", ["from", "to"]],
            ["fact", ["probe", start, target]],
            ["relation", "from_head", ["from", "to", "proof"]],
            [
              "rule",
              ["from_head", "?x", "?y", ["why", ["reach", "?x", "?y"]]],
              ["probe", "?x", "?y"],
            ],
            ["relation", "from_body", ["from", "to", "proof"]],
            [
              "rule",
              ["from_body", "?x", "?y", "?p"],
              ["probe", "?x", "?y"],
              ["=", "?p", ["why", ["reach", "?x", "?y"]]],
            ],
            ["relation", "from_cond", ["from", "to", "proof"]],
            [
              "rule",
              [
                "from_cond",
                "?x",
                "?y",
                [
                  "cond",
                  [
                    ["probe", "?x", "?y"],
                    ["why", ["reach", "?x", "?y"]],
                  ],
                  ["else", null],
                ],
              ],
              ["probe", "?x", "?y"],
            ],
          ],
          stdlib,
          { database }
        );

        const direct = yield* run(["why", ["reach", start, target]], stdlib, {
          database,
        });
        const inQuery = (yield* run(
          [
            "query",
            [
              "and",
              ["probe", "?x", "?y"],
              ["=", "?p", ["why", ["reach", "?x", "?y"]]],
            ],
          ],
          stdlib,
          { database }
        )) as readonly { readonly p: unknown }[];
        const inFind = (yield* run(
          ["find", ["why", ["reach", "?x", "?y"]], ["probe", "?x", "?y"]],
          stdlib,
          { database }
        )) as readonly unknown[];
        const inHead = (yield* run(
          ["find", "?p", ["from_head", start, target, "?p"]],
          stdlib,
          { database }
        )) as readonly unknown[];
        const inBody = (yield* run(
          ["find", "?p", ["from_body", start, target, "?p"]],
          stdlib,
          { database }
        )) as readonly unknown[];
        const inCond = (yield* run(
          ["find", "?p", ["from_cond", start, target, "?p"]],
          stdlib,
          { database }
        )) as readonly unknown[];

        expect(inQuery[0]?.p).toEqual(direct);
        expect(inFind[0]).toEqual(direct);
        expect(inHead[0]).toEqual(direct);
        expect(inBody[0]).toEqual(direct);
        expect(inCond[0]).toEqual(direct);

        // Snapshot round-trip preserves rules containing `why`.
        const snap = yield* saveDatabase(database);
        const reloaded = yield* loadDatabase(snap, stdlib);
        const afterReload = (yield* run(
          ["find", "?p", ["from_head", start, target, "?p"]],
          stdlib,
          { database: reloaded }
        )) as readonly unknown[];
        expect(afterReload[0]).toEqual(direct);
      }),
    { arbitrary: { runs: 40 } }
  );

  it.effect.prop(
    "why inside assuming explains against the assumed database without mutating the original",
    { pairs: edges, extra: edge, target: node },
    ({ pairs, extra: [u, v], target }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        yield* run(["begin", ...reachSetup(pairs)], stdlib, { database });
        const before = yield* run(["why", ["reach", u, target]], stdlib, {
          database,
        });

        const assumedWhy = yield* run(
          ["assuming", ["fact", ["edge", u, v]], ["why", ["reach", u, target]]],
          stdlib,
          { database }
        );

        // Must match a fresh database that actually has the extra edge.
        const fresh = new LogicDatabase();
        yield* run(["begin", ...reachSetup([...pairs, [u, v]])], stdlib, {
          database: fresh,
        });
        const expected = yield* run(["why", ["reach", u, target]], stdlib, {
          database: fresh,
        });
        expect(assumedWhy).toEqual(expected);

        // Original database is completely untouched.
        const after = yield* run(["why", ["reach", u, target]], stdlib, {
          database,
        });
        expect(after).toEqual(before);
      }),
    { arbitrary: { runs: 40 } }
  );

  it.effect.prop(
    "rules deriving why stay consistent with a fresh database after facts change, even when the explained row still holds",
    { a: smallInt, b: smallInt },
    ({ a, b }) =>
      Effect.gen(function* () {
        const [first, second] = a <= b ? [a, b + 1] : [b, a + 1];
        const setup = [
          ["relation", "src", ["id", "tag"]],
          ["relation", "ok", ["tag"]],
          ["rule", ["ok", "?t"], ["src", "?_", "?t"]],
          ["relation", "proof", ["tag", "tree"]],
          ["rule", ["proof", "?t", ["why", ["ok", "?t"]]], ["ok", "?t"]],
        ];
        const kept = new LogicDatabase();
        yield* run(
          [
            "begin",
            ...setup,
            ["fact", ["src", first, "x"], ["src", second, "x"]],
          ],
          stdlib,
          { database: kept }
        );
        // Materialize `proof` before mutating.
        yield* run(["query", ["proof", "x", "?tree"]], stdlib, {
          database: kept,
        });
        // Retract the first witness: ok("x") STILL holds, via `second` instead!
        yield* run(["retract", ["src", first, "x"]], stdlib, {
          database: kept,
        });
        const actual = yield* run(["query", ["proof", "x", "?tree"]], stdlib, {
          database: kept,
        });

        const fresh = new LogicDatabase();
        yield* run(
          ["begin", ...setup, ["fact", ["src", second, "x"]]],
          stdlib,
          { database: fresh }
        );
        const expected = yield* run(
          ["query", ["proof", "x", "?tree"]],
          stdlib,
          { database: fresh }
        );
        expect(actual).toEqual(expected);
      }),
    { arbitrary: { runs: 30 } }
  );

  it.effect.prop(
    "refuses unbound variables in composable why, unstratified self-why, and non-ground plain why",
    { n: smallInt },
    ({ n }) =>
      Effect.gen(function* () {
        const unsafeMsg = yield* run(
          [
            "begin",
            ["relation", "p", ["x"]],
            ["fact", ["p", n]],
            ["query", ["and", ["p", "?x"], ["=", "?w", ["why", ["p", "?y"]]]]],
          ],
          stdlib
        ).pipe(
          Effect.flip,
          Effect.map((e) => String((e as { message?: unknown }).message))
        );
        expect(unsafeMsg).toContain("Unsafe why");
        expect(unsafeMsg).toContain("?y");

        const cycleMsg = yield* run(
          [
            "begin",
            ["relation", "p", ["x"]],
            ["relation", "q", ["x", "w"]],
            ["fact", ["p", n]],
            ["rule", ["q", "?x", ["why", ["q", "?x", 1]]], ["p", "?x"]],
          ],
          stdlib
        ).pipe(
          Effect.flip,
          Effect.map((e) => String((e as { message?: unknown }).message))
        );
        expect(cycleMsg).toContain("depends on");

        const plainVarMsg = yield* run(
          ["begin", ["relation", "p", ["x"]], ["why", ["p", "?x"]]],
          stdlib
        ).pipe(
          Effect.flip,
          Effect.map((e) => String((e as { message?: unknown }).message))
        );
        expect(plainVarMsg).toContain("Facts may only contain data");
      }),
    { arbitrary: { runs: 20 } }
  );

  it.effect.prop(
    "why evaluates nested questions with their own variables identically inside query and plain code",
    {
      n: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 5 }))
      ),
    },
    ({ n }) =>
      Effect.gen(function* () {
        const setup = [
          ["relation", "link", ["from", "to"]],
          ["relation", "flag", ["v"]],
          ["fact", ["link", n, n + 1], ["flag", true]],
        ];
        const plain = yield* run(
          ["begin", ...setup, ["why", ["flag", ["link", n, "?y"]]]],
          stdlib
        );
        const queried = (yield* run(
          [
            "begin",
            ...setup,
            [
              "query",
              [
                "and",
                ["link", "?x", "?_"],
                ["=", "?w", ["why", ["flag", ["link", "?x", "?y"]]]],
              ],
            ],
          ],
          stdlib
        )) as readonly { w: unknown }[];
        expect(queried).toEqual([{ x: n, w: plain }]);
      }),
    { arbitrary: { runs: 20 } }
  );
});

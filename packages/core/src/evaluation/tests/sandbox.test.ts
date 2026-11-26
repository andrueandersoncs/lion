import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Exit, Schema } from "effect";
import { run, runWithMetrics } from "@/evaluation/evaluate";
import { countBaseFacts, type ExecutionMetrics } from "@/evaluation/sandbox";
import { LogicDatabase } from "@/logic/database";
import { safeStdlib, stdlib, UNSAFE_STDLIB_NAMES } from "@/modules";

const smallPos = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 25 }))
);
const smallInt = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: -50, maximum: 50 }))
);
const smallLimit = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 8 }))
);
const relationNames = ["alpha", "beta", "gamma"] as const;
const pickRelation = Arbitrary.map(
  Arbitrary.schema(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2 }))
  ),
  (index) => relationNames[index] as (typeof relationNames)[number]
);
const unsafeName = Arbitrary.map(
  Arbitrary.schema(
    Schema.Int.check(
      Schema.isBetween({ minimum: 0, maximum: UNSAFE_STDLIB_NAMES.size - 1 })
    )
  ),
  (index) => [...UNSAFE_STDLIB_NAMES][index] as string
);
const safeName = Arbitrary.map(
  Arbitrary.schema(
    Schema.Int.check(
      Schema.isBetween({
        minimum: 0,
        maximum: Object.keys(safeStdlib).length - 1,
      })
    )
  ),
  (index) => Object.keys(safeStdlib)[index] as string
);

describe("safeStdlib", () => {
  it.prop(
    "omits every unsafe host-interop name and preserves every safe binding",
    { safe: safeName, unsafe: unsafeName },
    ({ safe, unsafe }) => {
      expect(Object.hasOwn(safeStdlib, unsafe)).toBe(false);
      expect(safeStdlib[safe]).toBe(stdlib[safe]);
      expect(Object.isFrozen(safeStdlib)).toBe(true);
    }
  );

  it.effect.prop(
    "evaluates pure expressions identically to stdlib",
    { a: smallInt, b: smallInt },
    ({ a, b }) =>
      Effect.gen(function* () {
        const expr = [
          "begin",
          ["relation", "item", ["x"]],
          ["fact", ["item", a], ["item", b]],
          ["array/make", ["number/add", a, b], ["find", "?x", ["item", "?x"]]],
        ];
        expect(yield* run(expr, safeStdlib)).toEqual(yield* run(expr, stdlib));
      })
  );

  it.effect.prop(
    "rejects calls to omitted unsafe names",
    { unsafe: unsafeName },
    ({ unsafe }) =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(run([unsafe, {}], safeStdlib));
        expect(Exit.isFailure(exit)).toBe(true);
      })
  );
});

describe("execution limits and metering", () => {
  it.effect.prop(
    "enforces maxSteps on recursion and prevents func/catch from swallowing it",
    {
      n: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 8, maximum: 30 }))
      ),
    },
    ({ n }) =>
      Effect.gen(function* () {
        const countdown = [
          "begin",
          [
            "define",
            "loop",
            [
              "lambda",
              ["k"],
              [
                "cond",
                [["number/lessThanOrEqualTo", "k", 0], 0],
                ["else", ["loop", ["number/subtract", "k", 1]]],
              ],
            ],
          ],
          ["loop", n],
        ];
        // Plenty of steps succeeds.
        const ok = yield* runWithMetrics(countdown, safeStdlib, {
          limits: { maxSteps: n * 10 + 20 },
        });
        expect(ok.value).toBe(0);
        expect(ok.metrics.steps).toBeGreaterThanOrEqual(n);
        expect(ok.metrics.durationMs).toBeGreaterThanOrEqual(0);

        // Tight budget fails with ResourceLimitError even when wrapped in func/catch.
        const wrapped = [
          "func/catch",
          ["lambda", [], countdown],
          ["lambda", ["e"], "caught"],
        ];
        let reported: ExecutionMetrics | undefined;
        const exit = yield* Effect.exit(
          run(wrapped, safeStdlib, {
            limits: { maxSteps: Math.max(1, Math.floor(n / 2)) },
            onMetrics: (m) => {
              reported = m;
            },
          })
        );
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          const error = exit.cause.reasons[0];
          expect(error?._tag).toBe("Fail");
          if (error?._tag === "Fail") {
            expect((error.error as { readonly _tag?: string })._tag).toBe(
              "ResourceLimitError"
            );
            expect((error.error as { readonly limit?: string }).limit).toBe(
              "steps"
            );
          }
        }
        expect(reported).toBeDefined();
        expect(reported?.steps).toBeGreaterThan(Math.max(1, Math.floor(n / 2)));
      })
  );

  it.effect.prop(
    "enforces maxSteps on persisted lambdas and higher-order array/map callbacks",
    {
      count: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 10, maximum: 30 }))
      ),
    },
    ({ count }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        yield* run(
          [
            "define",
            "inc",
            ["lambda", ["x"], ["number/add", "x", 1]],
            { persist: true },
          ],
          safeStdlib,
          { database }
        );
        const exit = yield* Effect.exit(
          run(["array/map", ["array/range", 0, count], "inc"], safeStdlib, {
            database,
            limits: { maxSteps: Math.floor(count / 2) },
          })
        );
        expect(Exit.isFailure(exit)).toBe(true);
      })
  );

  it.effect.prop(
    "enforces maxFacts atomically and rolls back over-quota batches",
    {
      batch: Arbitrary.array(smallInt, { maxLength: 12, minLength: 1 }),
      limit: smallLimit,
    },
    ({ batch, limit }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        yield* run(["relation", "n", ["v"]], safeStdlib, { database });
        const distinct = new Set(batch).size;
        const factForm = ["fact", ...batch.map((v) => ["n", v])];
        const wrapped = [
          "func/catch",
          ["lambda", [], factForm],
          ["lambda", ["_"], "caught"],
        ];
        const exit = yield* Effect.exit(
          run(wrapped, safeStdlib, { database, limits: { maxFacts: limit } })
        );
        if (distinct <= limit) {
          expect(Exit.isSuccess(exit)).toBe(true);
          expect(countBaseFacts(database)).toBe(distinct);
        } else {
          expect(Exit.isFailure(exit)).toBe(true);
          expect(countBaseFacts(database)).toBe(0);
        }
      })
  );

  it.effect.prop(
    "allows keyed upserts at the maxFacts ceiling without exceeding the limit",
    {
      a: smallInt,
      b: smallInt,
    },
    ({ a, b }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        yield* run(
          [
            "begin",
            ["relation", "kv", ["k", "v"], { key: ["k"] }],
            ["fact", ["kv", "only", a]],
          ],
          safeStdlib,
          { database }
        );
        const result = yield* runWithMetrics(
          ["fact", ["kv", "only", b]],
          safeStdlib,
          { database, limits: { maxFacts: 1 } }
        );
        expect(result.metrics.totalFacts).toBe(1);
        expect(
          yield* run(["query", ["kv", "only", "?v"]], safeStdlib, { database })
        ).toEqual([{ v: b }]);
      })
  );

  it.effect.prop(
    "enforces maxDurationMs cooperatively on long loops",
    { n: smallPos },
    ({ n }) =>
      Effect.gen(function* () {
        const spin = [
          "begin",
          [
            "define",
            "spin",
            ["lambda", ["k"], ["spin", ["number/add", "k", 1]]],
          ],
          ["spin", n],
        ];
        const exit = yield* Effect.exit(
          run(spin, safeStdlib, { limits: { maxDurationMs: 1 } })
        );
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          const reason = exit.cause.reasons[0];
          expect(reason?._tag).toBe("Fail");
          if (reason?._tag === "Fail") {
            expect((reason.error as { readonly _tag?: string })._tag).toBe(
              "ResourceLimitError"
            );
            expect((reason.error as { readonly limit?: string }).limit).toBe(
              "duration"
            );
          }
        }
      })
  );
});

describe("database permissions", () => {
  it.effect.prop(
    "readOnly blocks all persistent mutations while allowing queries, why, proof, and assuming",
    { v: smallInt },
    ({ v }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        yield* run(
          [
            "begin",
            ["relation", "edge", ["from", "to"]],
            ["relation", "reach", ["from", "to"]],
            ["rule", ["reach", "?x", "?y"], ["edge", "?x", "?y"]],
            ["fact", ["edge", "a", v]],
          ],
          safeStdlib,
          { database }
        );

        const ro = { database, permissions: { readOnly: true } };

        // Reads, why, snapshot, and assuming all work under readOnly.
        expect(
          yield* run(["query", ["reach", "a", "?y"]], safeStdlib, ro)
        ).toEqual([{ y: v }]);
        expect(
          yield* run(["why", ["reach", "a", v]], safeStdlib, ro)
        ).toBeDefined();
        expect(
          yield* run(
            [
              "assuming",
              ["fact", ["edge", "a", v + 1]],
              ["find", "?y", ["reach", "a", "?y"]],
            ],
            safeStdlib,
            ro
          )
        ).toEqual([v, v + 1]);

        // Every persistent mutation fails and cannot be caught by func/catch.
        const mutations = [
          ["relation", "other", ["x"]],
          ["schema", "Num", "value/number?"],
          ["define", "helper", v, { persist: true }],
          [
            "rule",
            ["reach", "?x", "?z"],
            ["edge", "?x", "?y"],
            ["edge", "?y", "?z"],
          ],
          ["invariant", ["edge", "a", v], { assert: "some" }],
          ["fact", ["edge", "b", v]],
          ["retract", ["edge", "a", v]],
          ["retract", ["edge", "a", "?y"], { where: ["=", "?y", v] }],
          ["retract", ["rule", ["reach", "?x", "?y"], ["edge", "?x", "?y"]]],
        ];

        for (const mutation of mutations) {
          const exit = yield* Effect.exit(
            run(
              [
                "func/catch",
                ["lambda", [], mutation],
                ["lambda", ["_"], "caught"],
              ],
              safeStdlib,
              ro
            )
          );
          expect(Exit.isFailure(exit)).toBe(true);
          if (Exit.isFailure(exit)) {
            const reason = exit.cause.reasons[0];
            expect(reason?._tag).toBe("Fail");
            if (reason?._tag === "Fail") {
              expect((reason.error as { readonly _tag?: string })._tag).toBe(
                "PermissionError"
              );
            }
          }
        }
        // Database state is untouched.
        expect(countBaseFacts(database)).toBe(1);
        expect(database.rules.length).toBe(1);
        expect(database.relations.has("other")).toBe(false);
      })
  );

  it.effect.prop(
    "writableRelations permits only listed relations and rejects mixed batches atomically",
    {
      allowed: pickRelation,
      target: pickRelation,
      v: smallInt,
    },
    ({ allowed, target, v }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        yield* run(
          [
            "begin",
            ["relation", "alpha", ["v"]],
            ["relation", "beta", ["v"]],
            ["relation", "gamma", ["v"]],
          ],
          safeStdlib,
          { database }
        );
        const permissions = {
          declareRelations: false,
          declareSchemas: false,
          mutateInvariants: false,
          mutateRules: false,
          persistDefinitions: false,
          writableRelations: [allowed],
        };

        const exit = yield* Effect.exit(
          run(["fact", [allowed, v], [target, v + 1]], safeStdlib, {
            database,
            permissions,
          })
        );
        if (target === allowed) {
          expect(Exit.isSuccess(exit)).toBe(true);
          expect(countBaseFacts(database)).toBe(2);
        } else {
          expect(Exit.isFailure(exit)).toBe(true);
          expect(countBaseFacts(database)).toBe(0);
        }
      })
  );
});

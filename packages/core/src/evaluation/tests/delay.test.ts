/**
 * Promises, as Racket's `delay` and `force` make them. A promise runs its
 * expression the first time it is forced, and keeps the value: forcing it
 * any number of times gives what the expression gives, and runs it once,
 * or never when it is never forced. A failure keeps nothing, so each force
 * runs the expression again. Forcing a promise while it is being forced
 * fails, and forcing any other value gives that value.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { makeEnvironment } from "@/evaluation/environment";
import { run } from "@/evaluation/evaluate";
import type { Delayed } from "@/evaluation/special-forms/delay";
import { element } from "@/logic/tests/programs";
import { stdlib } from "@/modules";
import { LionEnvironmentService } from "@/services/evaluation";

const outcome = (program: unknown) =>
  run(program, stdlib).pipe(
    Effect.map((value) => ({ value })),
    Effect.catch((error) =>
      Effect.succeed({ failed: String((error as Error).message) })
    )
  );

const count = (most: number) =>
  Arbitrary.schema(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: most }))
  );

describe("delay and value/force", () => {
  it.effect.prop(
    "give the expression's value each time, running it once if it is ever forced",
    { forces: count(4), n: count(9) },
    ({ forces, n }) =>
      Effect.gen(function* () {
        // The expression counts its runs, then gives n squared.
        const program = [
          "begin",
          ["define", "runs", 0],
          [
            "define",
            "later",
            [
              "delay",
              [
                "begin",
                ["set!", "runs", ["number/add", "runs", 1]],
                ["number/multiply", n, n],
              ],
            ],
          ],
          {
            forced: [
              "array/make",
              ...Array.from({ length: forces }, () => ["value/force", "later"]),
            ],
            runs: "runs",
          },
        ];
        expect(yield* outcome(program)).toEqual({
          value: {
            forced: Array.from({ length: forces }, () => n * n),
            runs: forces > 0 ? 1 : 0,
          },
        });
      })
  );

  it.effect.prop(
    "run a failing expression again at each force, since a failure keeps nothing",
    { forces: count(4) },
    ({ forces }) =>
      Effect.gen(function* () {
        let runs = 0;
        const later = (yield* run(
          ["delay", ["begin", ["host/count"], ["number/divide", 1, 0]]],
          {
            ...stdlib,
            "host/count": () => {
              runs += 1;
              return runs;
            },
          }
        )) as Delayed;
        for (let at = 0; at < forces; at += 1) {
          const forced = yield* Effect.exit(
            Effect.provideService(
              later.force(),
              LionEnvironmentService,
              makeEnvironment({})
            )
          );
          expect(forced._tag).toBe("Failure");
        }
        expect(runs).toBe(forces);
        expect(later.forced).toBe(false);
      })
  );

  it.effect.prop(
    "fail when a promise is forced while it is being forced",
    { n: count(9) },
    ({ n }) =>
      Effect.gen(function* () {
        const program = [
          "begin",
          [
            "define",
            "later",
            ["delay", ["number/add", n, ["value/force", "later"]]],
          ],
          ["value/force", "later"],
        ];
        expect(yield* outcome(program)).toEqual({
          failed:
            "A promise was forced while it was being forced, so forcing it would never end.",
        });
      })
  );

  it.effect.prop(
    "give any other value back as it is",
    {
      value: element<unknown>([
        0,
        -2.5,
        "text",
        true,
        null,
        ["quote", [1, 2]],
        ["quote", { a: 1 }],
      ]),
    },
    ({ value }) =>
      Effect.gen(function* () {
        expect(yield* outcome(["value/force", value])).toEqual(
          yield* outcome(value)
        );
        expect(yield* outcome(["value/promise?", value])).toEqual({
          value: false,
        });
      })
  );
});

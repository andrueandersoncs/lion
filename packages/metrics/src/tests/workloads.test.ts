/**
 * The workloads `bun run scale` times. Each is a program for every size, so
 * each must run at any size, and one whose answer is a number of rows must
 * give the number its name says, counted here without Lion. How a time
 * grows is read back from times made to grow at a known rate.
 */
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { evaluate, load, newDatabase } from "../lion.ts";
import { CORE, REPOSITORY } from "../sources.ts";
import { growth, WORKLOADS } from "../workloads.ts";
import { between, element } from "./generators.ts";

const lion = Effect.runPromise(load(join(REPOSITORY, CORE)));

describe("a workload", () => {
  it.effect.prop(
    "runs at every size, and gives the rows its name says",
    { n: between(20, 400), workload: element(WORKLOADS) },
    ({ n, workload }) =>
      Effect.gen(function* () {
        const core = yield* Effect.promise(() => lion);
        const database = newDatabase(core, workload.goalDirected ?? true);
        const programs = [workload.setup(n), ...workload.timed(n)];
        let last: unknown;
        for (const program of programs) {
          const outcome = yield* evaluate(core, program, { database });
          expect(outcome).toMatchObject({ ok: true });
          last = outcome.ok ? outcome.value : undefined;
        }
        if (workload.gives !== undefined) {
          expect(last).toBe(workload.gives(n));
        }
      }),
    { timeout: 120_000 }
  );
});

describe("growth", () => {
  it.prop(
    "is the power of the size a time follows",
    {
      factor: between(2, 100),
      power: between(0, 30),
      size: between(1, 10_000),
      unit: between(1, 500),
    },
    ({ factor, power, size, unit }) => {
      const time = (n: number) => unit * n ** (power / 10);
      const larger = size * factor;
      expect(growth([size, time(size)], [larger, time(larger)])).toBeCloseTo(
        power / 10,
        6
      );
    }
  );

  it.prop(
    "says nothing about a time too short to tell",
    {
      shortest: between(1, 100),
      size: between(1, 1000),
      time: between(1, 100),
    },
    ({ shortest, size, time }) => {
      expect(
        growth([size, time], [size * 10, time * 10], shortest) === undefined
      ).toBe(time * 10 <= shortest);
    }
  );
});

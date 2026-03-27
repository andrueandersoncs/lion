import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";

describe("run", () => {
  it("should evaluate an expression", () =>
    Effect.gen(function* () {
      const result = yield* run(["math/+", 1, 2], stdlib);
      expect(result).toBe(3);
    }));

  it("should evaluate an expression with a function call from the environment", () =>
    Effect.gen(function* () {
      const result = yield* run(["greet", "Lion"], {
        ...stdlib,
        greet: (name: string) => Effect.succeed(`Hello, ${name}!`),
      });
      expect(result).toBe("Hello, Lion!");
    }));

  it("should evaluate an expression with a function call from the environment", () =>
    Effect.gen(function* () {
      const result = yield* run(["clamp", 0, 100, 150], {
        ...stdlib,
        clamp: (min: number, max: number, value: number) =>
          Effect.succeed(Math.min(max, Math.max(min, value))),
      });
      expect(result).toBe(100);
    }));
});

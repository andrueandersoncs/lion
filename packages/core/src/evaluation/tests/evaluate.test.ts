import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";

describe("run", () => {
  it.effect("should evaluate an expression", () =>
    Effect.gen(function* () {
      const result = yield* run(["number/add", 1, 2], stdlib);
      expect(result).toBe(3);
    })
  );

  it.effect(
    "should evaluate an expression with a function call from the environment",
    () =>
      Effect.gen(function* () {
        const result = yield* run(["greet", "Lion"], {
          ...stdlib,
          greet: (name: string) => Effect.succeed(`Hello, ${name}!`),
        });
        expect(result).toBe("Hello, Lion!");
      })
  );

  it.effect(
    "should evaluate an expression with a function call from the environment",
    () =>
      Effect.gen(function* () {
        const result = yield* run(["clamp", 0, 100, 150], {
          ...stdlib,
          clamp: (min: number, max: number, value: number) =>
            Effect.succeed(Math.min(max, Math.max(min, value))),
        });
        expect(result).toBe(100);
      })
  );

  it.effect("should call a function when in call position", () =>
    Effect.gen(function* () {
      const program = [["object/get", "obj", "fn"], 1, 2];
      const result = yield* run(program, {
        ...stdlib,
        obj: {
          fn: (a: number, b: number) => Effect.succeed(a + b),
        },
      });
      expect(result).toBe(3);
    })
  );

  it.effect("should return a function as a value", () =>
    Effect.gen(function* () {
      const result = yield* run("value/identity", stdlib);
      expect(result).toBe(stdlib["value/identity"]);
    })
  );
});

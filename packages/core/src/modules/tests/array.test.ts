import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { run } from "@/evaluation/evaluate";
import { module as array } from "../array.ts";
import { stdlib } from "../index.ts";

describe("array", () => {
  it("should return the head of an array", () => {
    expect(Effect.runSync(array.head([12, 34, 56]))).toEqual(12);
  });
  it("should return the tail of an array", () => {
    expect(Effect.runSync(array.tail([12, 34, 56]))).toEqual([34, 56]);
  });
  it("should return the length of an array", () => {
    expect(Effect.runSync(array.length([12, 34, 56]))).toEqual(3);
  });
  it("should return the concat of twon arrays", () => {
    expect(Effect.runSync(array.concat([12, 34, 56], [78, 90]))).toEqual([
      12, 34, 56, 78, 90,
    ]);
  });
  describe("map", () => {
    it("should map an array", () => {
      expect(
        Effect.runSync(
          array.map([12, 34, 56], (x: number) => Effect.succeed(x * 2))
        )
      ).toEqual([24, 68, 112]);
    });
    it.effect("should map an array (via run())", () =>
      Effect.gen(function* () {
        const result = yield* run(
          [
            "array/map",
            ["array/make", 12, 34, 56],
            ["lambda", ["x"], ["number/multiply", "x", 2]],
          ],
          stdlib
        );
        expect(result).toEqual([24, 68, 112]);
      })
    );
  });
  describe("reduce", () => {
    it("should reduce an array", () => {
      expect(
        Effect.runSync(
          array.reduce([1, 2, 3, 4], 0, (acc: number, x: number) =>
            Effect.succeed(acc + x)
          )
        )
      ).toEqual(10);
    });
    it.effect("should reduce an array (via run())", () =>
      Effect.gen(function* () {
        const result = yield* run(
          [
            "array/reduce",
            ["array/make", 1, 2, 3, 4],
            0,
            ["lambda", ["acc", "x"], ["number/add", "acc", "x"]],
          ],
          stdlib
        );
        expect(result).toEqual(10);
      })
    );
  });
});

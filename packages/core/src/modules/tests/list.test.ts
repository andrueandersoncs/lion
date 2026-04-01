import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "../index.ts";
import { list } from "../list.ts";

describe("list", () => {
  it("should return the head of a list", () => {
    expect(Effect.runSync(list.head([12, 34, 56]))).toEqual(12);
  });
  it("should return the tail of a list", () => {
    expect(Effect.runSync(list.tail([12, 34, 56]))).toEqual([34, 56]);
  });
  it("should return the length of a list", () => {
    expect(Effect.runSync(list.length([12, 34, 56]))).toEqual(3);
  });
  it("should return the concat of two lists", () => {
    expect(Effect.runSync(list.concat([12, 34, 56], [78, 90]))).toEqual([
      12, 34, 56, 78, 90,
    ]);
  });
  describe("map", () => {
    it("should map a list", () => {
      expect(
        Effect.runSync(
          list.map([12, 34, 56], (x: number) => Effect.succeed(x * 2))
        )
      ).toEqual([24, 68, 112]);
    });
    it.effect("should map a list (via run())", () =>
      Effect.gen(function* () {
        const result = yield* run(
          [
            "list/map",
            ["list/list", 12, 34, 56],
            ["lambda", ["x"], ["math/*", "x", 2]],
          ],
          stdlib
        );
        expect(result).toEqual([24, 68, 112]);
      })
    );
  });
  describe("reduce", () => {
    it("should reduce a list", () => {
      expect(
        Effect.runSync(
          list.reduce([1, 2, 3, 4], 0, (acc: number, x: number) =>
            Effect.succeed(acc + x)
          )
        )
      ).toEqual(10);
    });
    it.effect("should reduce a list (via run())", () =>
      Effect.gen(function* () {
        const result = yield* run(
          [
            "list/reduce",
            ["list/list", 1, 2, 3, 4],
            0,
            ["lambda", ["acc", "x"], ["math/+", "acc", "x"]],
          ],
          stdlib
        );
        expect(result).toEqual(10);
      })
    );
  });
});

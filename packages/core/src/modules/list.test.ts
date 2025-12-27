import { describe, it, expect } from "@effect/vitest";
import { list } from "./list.ts";
import { Effect } from "effect";

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
    expect(Effect.runSync(list.concat([12, 34, 56], [78, 90]))).toEqual([12, 34, 56, 78, 90]);
  });
});

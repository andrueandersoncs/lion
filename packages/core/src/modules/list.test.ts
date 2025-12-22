import { describe, it, expect } from "bun:test";
import { list } from "./list";
import { Effect, Schema, Option } from "effect";

describe("list", () => {
  it("should return the head of a list", () => {
    expect(Effect.runSync(list.head(Schema.Number)([12, 34, 56]))).toEqual(Option.some(12));
  });
  it("should return the tail of a list", () => {
    expect(Effect.runSync(list.tail(Schema.Number)([12, 34, 56]))).toEqual(Option.some([34, 56]));
  });
  it("should return the length of a list", () => {
    expect(Effect.runSync(list.length(Schema.Number)([12, 34, 56]))).toEqual(3);
  });
  it("should return the concat of two lists", () => {
    expect(Effect.runSync(list.concat(Schema.Number)([12, 34, 56], [78, 90]))).toEqual([12, 34, 56, 78, 90]);
  });
});

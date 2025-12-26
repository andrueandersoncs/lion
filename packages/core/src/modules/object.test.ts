import { describe, it, expect } from "@effect/vitest";
import { object } from "./object";
import { Effect } from "effect";

describe("object", () => {
  it("should return the value of a key in an object", () => {
    expect(Effect.runSync(object.get({ a: 1 }, "a"))).toEqual(1);
  });
  it("should return the keys of an object", () => {
    expect(Effect.runSync(object.keys({ a: 1, b: 2 }))).toEqual(["a", "b"]);
  });
  it("should return the values of an object", () => {
    expect(Effect.runSync(object.values({ a: 1, b: 2 }))).toEqual([1, 2]);
  });
});

import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { func } from "../func.ts";

describe("func/identity", () => {
  it("should return the identity of a value", () => {
    expect(Effect.runSync(func.identity(1))).toEqual(1);
  });
});

describe("func/bind", () => {
  it("should bind a function to an object", () => {
    const context = {};
    const fn = () => {
      expect(this).toEqual(context);
    };
    const boundFn = func.bind(fn, context);
    Effect.runSync(boundFn);
  });
});

describe("func/callback", () => {
  it("should call a function with the given arguments", () => {
    const callback = func.callback((a: number, b: number) => a + b);
    expect(Effect.runSync(callback)(1, 2)).toEqual(3);
  });
});

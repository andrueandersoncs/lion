import { describe, expect, it } from "@effect/vitest";
import { math } from "./math.ts";
import { Effect } from "effect";

describe("math", () => {
  it("should add two numbers", () => {
    expect(Effect.runSync(math["+"](1, 2))).toBe(3);
  });

  it("should add many numbers", () => {
    expect(Effect.runSync(math["+"](1, 2, 3, 4, 5))).toBe(15);
  })

  it("should subtract two numbers", () => {
    expect(Effect.runSync(math["-"](1, 2))).toBe(-1);
  });

  it("should multiply two numbers", () => {
    expect(Effect.runSync(math["*"](1, 2))).toBe(2);
  });

  it("should divide two numbers", () => {
    expect(Effect.runSync(math["/"](1, 2))).toBe(0.5);
  });

  it("should check if two numbers are equal", () => {
    expect(Effect.runSync(math["="](1, 1))).toBe(true);
  });

  it("should check if one number is less than another", () => {
    expect(Effect.runSync(math["<"](1, 2))).toBe(true);
  });

  it("should check if one number is greater than another", () => {
    expect(Effect.runSync(math[">"](1, 2))).toBe(false);
  });

  it("should check if one number is less than or equal to another", () => {
    expect(Effect.runSync(math["<="](1, 2))).toBe(true);
  });

  it("should check if one number is greater than or equal to another", () => {
    expect(Effect.runSync(math[">="](1, 2))).toBe(false);
  });
});

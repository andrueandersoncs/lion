import { describe, it, expect } from "@effect/vitest";
import { logic } from "../logic.ts";
import { Effect } from "effect";

describe("logic", () => {
  it("should return the negation of a boolean", () => {
    expect(Effect.runSync(logic.not(true))).toBe(false);
  });
  it("should return the conjunction of two booleans", () => {
    expect(Effect.runSync(logic.and(true, true))).toBe(true);
  });
  it("should return the disjunction of two booleans", () => {
    expect(Effect.runSync(logic.or(true, false))).toBe(true);
  });
  it("should return the conditional of a boolean", () => {
    expect(Effect.runSync(logic.if(true, 1, 2))).toBe(1);
  });
});

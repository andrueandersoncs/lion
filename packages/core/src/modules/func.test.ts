import { describe, it, expect } from "@effect/vitest";
import { func } from "./func.ts";
import { Effect } from "effect";

describe("func", () => {
  it("should return the identity of a value", () => {
    expect(Effect.runSync(func.identity(1))).toEqual(1);
  });
});

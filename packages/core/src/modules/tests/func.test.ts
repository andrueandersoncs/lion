import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { func } from "../func.ts";

describe("func", () => {
  it("should return the identity of a value", () => {
    expect(Effect.runSync(func.identity(1))).toEqual(1);
  });
});

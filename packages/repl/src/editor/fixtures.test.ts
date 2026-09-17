import { analyze, flattenAnalysis } from "@lionlang/core/analysis/analyze";
import { describe, expect, it } from "vitest";
import { createSyntheticProgram } from "./fixtures";

describe("performance fixtures", () => {
  it.each([
    100, 1000, 5000,
  ])("creates exactly %i wide semantic nodes", (size) => {
    expect(
      flattenAnalysis(analyze(createSyntheticProgram(size) as never))
    ).toHaveLength(size);
  });

  it.each([
    100, 1000, 5000,
  ])("creates exactly %i deep semantic nodes", (size) => {
    expect(
      flattenAnalysis(analyze(createSyntheticProgram(size, "deep") as never))
    ).toHaveLength(size);
  });
});

import { describe, expect, test } from "vitest";
import { generateFunctionLabels } from "../index.ts";
import { math } from "../math.ts";

describe("labeled functions", () => {
  test("it labels functions", () => {
    const labeledMath = generateFunctionLabels("math", math);
    expect(labeledMath).toMatchObject({
      "math/+": math["+"],
    });
  });
});

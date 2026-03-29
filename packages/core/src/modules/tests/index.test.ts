import { describe, expect, test } from "vitest";
import { namespaceEntries } from "../index.ts";
import { math } from "../math.ts";

describe("labeled functions", () => {
  test("it labels functions", () => {
    const labeledMath = namespaceEntries("math", math);
    expect(labeledMath).toMatchObject({
      "math/+": math["+"],
    });
  });
});

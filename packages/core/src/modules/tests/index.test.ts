import { describe, expect, test } from "vitest";
import { namespaceEntries } from "../index.ts";
import { module as number } from "../number.ts";

describe("labeled modules", () => {
  test("it labels modules", () => {
    const labeledNumber = namespaceEntries("number", number);
    expect(labeledNumber).toMatchObject({
      "number/add": number.add,
    });
  });
});

import { describe, expect, it } from "@effect/vitest";
import { analyze, flattenAnalysis } from "@/analysis/analyze";

const childRoles = (value: Parameters<typeof analyze>[0]) =>
  analyze(value).children.map(({ role }) => role);

describe("analyze", () => {
  it("classifies every supported special form from evaluator schemas", () => {
    expect(analyze(["eval", 1]).specialForm).toBe("eval");
    expect(analyze(["quote", 1]).specialForm).toBe("quote");
    expect(analyze(["begin", 1]).specialForm).toBe("begin");
    expect(analyze(["define", "x", 1]).specialForm).toBe("define");
    expect(analyze(["lambda", ["x"], "x"]).specialForm).toBe("lambda");
    expect(analyze(["cond", [true, 1]]).specialForm).toBe("cond");
    expect(
      analyze([
        "match",
        1,
        ["value/number?", "value/identity"],
        "value/identity",
      ]).specialForm
    ).toBe("match");
  });

  it("returns an invalid node instead of throwing for malformed forms", () => {
    const node = analyze(["define", "x"]);
    expect(node.kind).toBe("invalid-call");
    expect(node.diagnostic).toContain("invalid structure");
  });

  it("preserves record order, paths, and ambiguous string relationships", () => {
    const node = analyze({ second: "x", first: 1 });
    expect(node.children.map(({ role }) => role)).toEqual(["second", "first"]);
    expect(node.children[0]?.node.pointer).toBe("/second");
    expect(node.children[0]?.node.relationships).toEqual([
      { kind: "reference-candidate", name: "x" },
    ]);
  });

  it("marks quoted descendants and exposes every structural child", () => {
    const node = analyze(["quote", ["number/add", 1, 2]]);
    const flat = flattenAnalysis(node);
    expect(flat).toHaveLength(6);
    expect(flat.find(({ pointer }) => pointer === "/1/0")?.quoted).toBe(true);
    expect(flat.find(({ pointer }) => pointer === "/1/2")?.quoted).toBe(true);
    expect(childRoles(["quote", 1])).toEqual(["operator", "quoted-value"]);
  });

  it("treats quoted form-shaped arrays as literal data", () => {
    const flat = flattenAnalysis(analyze(["quote", ["define", "x"]]));
    const array = flat.find(({ pointer }) => pointer === "/1");
    expect(array?.kind).toBe("array");
    expect(array?.label).toBe("array · 2");
    expect(array?.specialForm).toBeUndefined();
    expect(array?.children.map(({ role }) => role)).toEqual(["item", "item"]);
    expect(flat.some(({ kind }) => kind === "invalid-call")).toBe(false);
  });

  it("classifies empty arrays, calls, records, and primitive roots", () => {
    expect(analyze([]).kind).toBe("empty-array");
    expect(analyze(["number/add", 1, 2]).kind).toBe("call");
    expect(analyze({}).kind).toBe("record");
    expect(analyze(null).kind).toBe("primitive");
  });
});

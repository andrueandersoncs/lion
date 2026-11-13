import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Schema } from "effect";
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

describe("analyze: a schema form", () => {
  const index = (count: number) =>
    Arbitrary.schema(
      Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: count - 1 }))
    );

  const NAMES = ["Order", "Line", "Expr", "Sum"];

  const SHAPES: readonly unknown[] = [
    "value/number?",
    { id: "value/integer?", lines: ["schema/arrayOf", "Line"] },
    ["schema/anyOf", "Order", 1],
    ["quote", "open"],
  ];

  /** One to four schemas, each a name and a shape. */
  const declared = Arbitrary.array(index(SHAPES.length), {
    minLength: 1,
    maxLength: NAMES.length,
  });

  it.prop(
    "names a schema at every second place, and reads each shape as an expression",
    { picks: declared },
    ({ picks }) => {
      const pairs = picks.map((pick, at) => [NAMES[at], SHAPES[pick]]);
      const node = analyze(["schema", ...pairs.flat()] as never);
      expect(node.specialForm).toBe("schema");
      expect(node.children.map(({ role }) => role)).toEqual([
        "operator",
        ...pairs.flatMap(() => ["binding", "shape"]),
      ]);
      // Every name is a definition, in the order written.
      expect(node.relationships).toEqual(
        pairs.map(([name]) => ({ kind: "definition", name }))
      );
      // A shape is read like any expression: the same node, one place in.
      for (const [at, [, shape]] of pairs.entries()) {
        const child = node.children[2 * at + 2]?.node;
        expect(child?.kind).toBe(analyze(shape as never).kind);
        expect(child?.pointer).toBe(`/${2 * at + 2}`);
      }
      // Inside quote the form is data, and defines nothing.
      const quoted = analyze(["quote", ["schema", ...pairs.flat()]] as never);
      expect(
        flattenAnalysis(quoted).flatMap(({ relationships }) =>
          relationships.filter(({ kind }) => kind === "definition")
        )
      ).toEqual([]);
    }
  );
});

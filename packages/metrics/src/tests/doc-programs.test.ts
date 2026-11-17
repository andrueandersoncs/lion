/**
 * Finding the programs a document shows. A document here is made of prose,
 * fenced blocks of other languages, json blocks that are data, and json
 * blocks that are programs: only the programs are found, each with the line
 * its block starts on, in the order written.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary } from "effect";
import { programsIn } from "../doc-programs.ts";
import { between, element, word } from "./generators.ts";

type Part =
  | { readonly kind: "prose"; readonly text: string }
  | { readonly kind: "code"; readonly text: string }
  | { readonly kind: "data"; readonly value: unknown }
  | { readonly kind: "program"; readonly value: unknown };

const program = Arbitrary.map(
  Arbitrary.all([element(["begin", "query", "number/add"]), between(0, 9)]),
  ([name, number]): unknown => [name, number, ["quote", "x"]]
);

const part: Arbitrary.Arbitrary<Part> = Arbitrary.flatMap(
  element(["prose", "code", "data", "program"] as const),
  (kind): Arbitrary.Arbitrary<Part> => {
    if (kind === "program") {
      return Arbitrary.map(program, (value) => ({ kind, value }));
    }
    if (kind === "data") {
      return Arbitrary.map(between(0, 9), (value) => ({
        kind,
        value: value % 2 === 0 ? { count: value } : [value, "not a name"],
      }));
    }
    return Arbitrary.map(word, (text) => ({ kind, text }));
  }
);

/** The lines a part is written as. */
const written = (each: Part) => {
  if (each.kind === "prose") {
    return [each.text, ""];
  }
  if (each.kind === "code") {
    return ["```bash", each.text, "```", ""];
  }
  return ["```json", JSON.stringify(each.value, null, 2), "```", ""];
};

describe("programsIn", () => {
  it.prop(
    "finds the json blocks that are programs, with the line each starts on",
    { parts: Arbitrary.array(part, { maxLength: 12 }) },
    ({ parts }) => {
      const lines: string[] = [];
      const expected: [number, unknown][] = [];
      for (const each of parts) {
        if (each.kind === "program") {
          expected.push([lines.length + 1, each.value]);
        }
        lines.push(...written(each).flatMap((line) => line.split("\n")));
      }
      expect(programsIn(lines.join("\n"))).toEqual(expected);
    }
  );
});

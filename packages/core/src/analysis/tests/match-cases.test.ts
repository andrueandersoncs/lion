/**
 * A match case no value can reach. The analysis warns of a case whose
 * schema allows no value that an earlier case's schema leaves, so the
 * earlier case takes every value that fits it. The model is a table of
 * which of a few schemas include which, written by hand.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary } from "effect";
import { analyze, flattenAnalysis } from "@/analysis/analyze";
import { element } from "@/logic/tests/programs";
import { stdlib } from "@/modules";

/** Schemas, by a name the table uses. */
const SCHEMAS = {
  number: "value/number?",
  integer: "value/integer?",
  oneOrTwo: ["schema/anyOf", 1, 2],
  one: 1,
  string: "value/string?",
  sale: { kind: ["quote", "sale"] },
  saleOrRefund: [
    "schema/anyOf",
    { kind: ["quote", "sale"] },
    { kind: ["quote", "refund"] },
  ],
} as const;

type Name = keyof typeof SCHEMAS;

/** What each schema's values all fit, itself among them. */
const INSIDE: Record<Name, readonly Name[]> = {
  number: ["number"],
  integer: ["integer", "number"],
  oneOrTwo: ["oneOrTwo", "integer", "number"],
  one: ["one", "oneOrTwo", "integer", "number"],
  string: ["string"],
  sale: ["sale", "saleOrRefund"],
  saleOrRefund: ["saleOrRefund"],
};

const cases = Arbitrary.array(element(Object.keys(SCHEMAS) as Name[]), {
  minLength: 1,
  maxLength: 4,
});

describe("a match case no value can reach", () => {
  it.prop(
    "is warned of exactly when an earlier case's schema includes its schema",
    { names: cases, fallback: element([true, false]) },
    ({ names, fallback }) => {
      const program = [
        "match",
        5,
        ...names.map((name) => [SCHEMAS[name], ["lambda", ["v"], name]]),
        ...(fallback ? [["lambda", ["v"], "none"]] : []),
      ];
      const warned = flattenAnalysis(analyze(program as never, stdlib))
        .filter((node) => node.warning !== undefined)
        .map((node) => node.pointer)
        .sort();
      const expected = names
        .flatMap((name, at) =>
          names.slice(0, at).some((earlier) => INSIDE[name].includes(earlier))
            ? [`/${at + 2}`]
            : []
        )
        .sort();
      expect(warned).toEqual(expected);
    }
  );
});

/** Finite schemas, each with the values it allows. */
const FINITE = {
  one: [1, [1]],
  two: [2, [2]],
  oneOrTwo: [
    ["schema/anyOf", 1, 2],
    [1, 2],
  ],
  sale: [{ kind: ["quote", "sale"] }, ["sale"]],
  refund: [{ kind: ["quote", "refund"] }, ["refund"]],
  saleOrRefund: [
    [
      "schema/anyOf",
      { kind: ["quote", "sale"] },
      { kind: ["quote", "refund"] },
    ],
    ["sale", "refund"],
  ],
} as const;

type Finite = keyof typeof FINITE;

const finiteNames = Object.keys(FINITE) as Finite[];

describe("a match on a parameter with a contract, with no fallback", () => {
  it.prop(
    "is warned of exactly when its cases leave out a value the contract allows",
    {
      contract: element(finiteNames),
      cases: Arbitrary.array(element(finiteNames), {
        minLength: 1,
        maxLength: 3,
      }),
    },
    ({ contract, cases }) => {
      const program = [
        "lambda",
        [["x", FINITE[contract][0]]],
        [
          "match",
          "x",
          ...cases.map((name) => [FINITE[name][0], ["lambda", ["v"], name]]),
        ],
      ];
      const match = flattenAnalysis(analyze(program as never, stdlib)).find(
        (node) => node.specialForm === "match"
      );
      const covered = new Set<unknown>(
        cases.flatMap((name) => [...(FINITE[name][1] as readonly unknown[])])
      );
      const leaves = (FINITE[contract][1] as readonly unknown[]).some(
        (value) => !covered.has(value as never)
      );
      expect(match?.warning !== undefined).toBe(leaves);
    }
  );
});

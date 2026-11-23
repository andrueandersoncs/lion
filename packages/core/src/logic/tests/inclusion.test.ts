/**
 * schema/includes? says whether every value one schema allows fits another.
 * For a schema that lists its values, the model lists them too and checks
 * each; for whole numbers between bounds, every number of the box is
 * checked by plain code. Where Lion answers, it agrees.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { LogicDatabase } from "@/logic/database";
import { attempt } from "./programs";
import {
  countOf,
  finite,
  fits,
  type Json,
  lion,
  listed,
  PRELUDE,
  type Shape,
  shape,
} from "./shapes";

const OPTIONS = { timeout: 120_000 };

const int = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

const evaluate = (form: unknown) =>
  attempt(["begin", ...PRELUDE, form], new LogicDatabase());

const small = (given: Shape) => {
  const count = countOf(given);
  return count !== undefined && count <= 200;
};

/** A comparison of the number n with a bound. */
const comparison = Arbitrary.map(
  Arbitrary.all([
    Arbitrary.schema(
      Schema.Literals([
        "number/lessThan",
        "number/lessThanOrEqualTo",
        "number/greaterThan",
        "number/greaterThanOrEqualTo",
      ])
    ),
    int(-4, 4),
    int(-3, 3),
  ]),
  ([op, bound, k]) => [
    op,
    ["number/add", ["number/multiply", k, "n"], 1],
    bound,
  ]
);

/** Whole numbers between two bounds, and maybe a comparison more. */
const bounded = (low: number, high: number, more: unknown[]) => [
  "schema/allOf",
  "value/integer?",
  [
    "lambda",
    ["n"],
    [
      ["number/greaterThanOrEqualTo", "n", low],
      ["number/lessThanOrEqualTo", "n", high],
      ...more,
    ].reduce((all, each) => ["boolean/and", all, each]),
  ],
];

describe("schema/includes?", () => {
  it.effect.prop(
    "says a schema that lists its values includes another exactly when each of its values fits that one",
    { inner: Arbitrary.filter(finite(2), small), outer: shape(2) },
    ({ inner, outer }) =>
      Effect.gen(function* () {
        const values = listed(inner);
        if (values === undefined) {
          return;
        }
        const outcome = yield* evaluate([
          "schema/includes?",
          lion(inner),
          lion(outer),
        ]);
        expect(outcome).toEqual({
          ok: true,
          value: values.every((value) => fits(outer, value as Json)),
        });
      }),
    OPTIONS
  );

  it.effect.prop(
    "decides for whole numbers whether each between bounds meets a comparison, as checking every one says",
    {
      low: int(-4, 0),
      high: int(0, 4),
      inner: Arbitrary.array(comparison, { maxLength: 1 }),
      outer: comparison,
      record: Arbitrary.schema(Schema.Boolean),
    },
    ({ high, inner, low, outer, record }) =>
      Effect.gen(function* () {
        const innerSchema = bounded(low, high, inner);
        const outerSchema = [
          "schema/allOf",
          "value/integer?",
          ["lambda", ["n"], outer],
        ];
        // The same, about a field of a record.
        const wrap = (schema: unknown) => (record ? { a: schema } : schema);
        const outcome = yield* evaluate([
          "schema/includes?",
          wrap(innerSchema),
          wrap(outerSchema),
        ]);
        const check = (schema: unknown, n: number) =>
          evaluate(["schema/fits?", n, schema]);
        let every = true;
        for (let n = low; n <= high; n += 1) {
          const allowed = yield* check(innerSchema, n);
          if (allowed.ok && allowed.value === true) {
            const fit = yield* check(outerSchema, n);
            every &&= fit.ok && fit.value === true;
          }
        }
        expect(outcome).toEqual({ ok: true, value: every });
      }),
    OPTIONS
  );

  it.effect.prop(
    "never says an unbounded schema is included where some value of a box fails the other",
    { outer: comparison },
    ({ outer }) =>
      Effect.gen(function* () {
        const outerSchema = [
          "schema/allOf",
          "value/integer?",
          ["lambda", ["n"], outer],
        ];
        const outcome = yield* evaluate([
          "schema/includes?",
          "value/integer?",
          outerSchema,
        ]);
        expect(outcome).toMatchObject({ ok: true });
        let anyFails = false;
        for (let n = -10; n <= 10; n += 1) {
          const fit = yield* evaluate(["schema/fits?", n, outerSchema]);
          anyFails ||= !(fit.ok && fit.value === true);
        }
        if (anyFails) {
          expect(outcome).toEqual({ ok: true, value: false });
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "says a schema includes itself, whatever it allows",
    { given: shape(2) },
    ({ given }) =>
      Effect.gen(function* () {
        const outcome = yield* evaluate([
          "schema/includes?",
          lion(given),
          lion(given),
        ]);
        expect(outcome).toEqual({ ok: true, value: true });
      }),
    OPTIONS
  );

  /** Disjoint atomic kinds in Lion, with number split into integer and non-integer. */
  const ATOMS = [
    "int",
    "non-int",
    "string",
    "boolean",
    "null",
    "array",
    "object",
    "function",
    "symbol",
    "promise",
    "unknown",
    "undefined",
  ] as const;

  type Atom = (typeof ATOMS)[number];

  const KIND_SCHEMAS: Readonly<Record<string, readonly Atom[]>> = {
    "value/integer?": ["int"],
    "value/number?": ["int", "non-int"],
    "value/string?": ["string"],
    "value/boolean?": ["boolean"],
    "value/null?": ["null"],
    "value/array?": ["array"],
    "value/object?": ["object"],
    "value/function?": ["function"],
    "value/symbol?": ["symbol"],
    "value/promise?": ["promise"],
    "value/unknown?": ["unknown"],
    "value/undefined?": ["undefined"],
    "value/any?": ATOMS,
  };

  const kindName = Arbitrary.schema(
    Schema.Literals(Object.keys(KIND_SCHEMAS) as [string, ...string[]])
  );

  const kindUnion = Arbitrary.array(kindName, { minLength: 1, maxLength: 3 });

  it.effect.prop(
    "decides inclusion across all value kinds and unions of them, matching set inclusion",
    { inner: kindUnion, outer: kindUnion },
    ({ inner, outer }) =>
      Effect.gen(function* () {
        const toSchema = (names: readonly string[]) =>
          names.length === 1 ? names[0] : ["schema/anyOf", ...names];
        const innerAtoms = new Set(inner.flatMap((n) => KIND_SCHEMAS[n] ?? []));
        const outerAtoms = new Set(outer.flatMap((n) => KIND_SCHEMAS[n] ?? []));
        const expected = [...innerAtoms].every((a) => outerAtoms.has(a));
        const outcome = yield* evaluate([
          "schema/includes?",
          toSchema(inner),
          toSchema(outer),
        ]);
        expect(outcome).toEqual({ ok: true, value: expected });
      }),
    OPTIONS
  );

  const fieldKind = Arbitrary.schema(
    Schema.Literals(["value/integer?", "value/number?", "value/string?"])
  );

  const fieldIncludes = (a: string, b: string) =>
    a === b || (a === "value/integer?" && b === "value/number?");

  it.effect.prop(
    "decides inclusion between open records, exact records, and schema/recordOf",
    {
      innerOpen: Arbitrary.schema(Schema.Boolean),
      outerOpen: Arbitrary.schema(Schema.Boolean),
      innerHasY: Arbitrary.schema(Schema.Boolean),
      outerHasY: Arbitrary.schema(Schema.Boolean),
      ix: fieldKind,
      iy: fieldKind,
      ox: fieldKind,
      oy: fieldKind,
    },
    ({ innerHasY, innerOpen, ix, iy, outerHasY, outerOpen, ox, oy }) =>
      Effect.gen(function* () {
        const innerFields = innerHasY ? { x: ix, y: iy } : { x: ix };
        const outerFields = outerHasY ? { x: ox, y: oy } : { x: ox };
        const inner = innerOpen ? ["schema/open", innerFields] : innerFields;
        const outer = outerOpen ? ["schema/open", outerFields] : outerFields;
        const expected =
          fieldIncludes(ix, ox) &&
          (!innerOpen || outerOpen) &&
          (!outerHasY || (innerHasY && fieldIncludes(iy, oy))) &&
          (outerOpen || !innerHasY || outerHasY);
        const outcome = yield* evaluate(["schema/includes?", inner, outer]);
        expect(outcome).toEqual({ ok: true, value: expected });
      }),
    OPTIONS
  );

  it.effect.prop(
    "decides inclusion between unbounded and bounded arrayOf, open lists, and tuples",
    {
      itemA: fieldKind,
      itemB: fieldKind,
      modeA: Arbitrary.schema(
        Schema.Literals(["unbounded", "bounded", "open1", "tuple1"])
      ),
      modeB: Arbitrary.schema(
        Schema.Literals(["unbounded", "bounded", "open1", "tuple1", "split"])
      ),
      boundA: int(0, 3),
      boundB: int(0, 3),
    },
    ({ boundA, boundB, itemA, itemB, modeA, modeB }) =>
      Effect.gen(function* () {
        const make = (mode: string, item: string, bound: number) => {
          switch (mode) {
            case "unbounded":
              return ["schema/arrayOf", item];
            case "bounded":
              return ["schema/arrayOf", item, bound];
            case "open1":
              return ["schema/open", ["array/make", item]];
            case "split":
              return [
                "schema/anyOf",
                ["quote", []],
                ["schema/open", ["array/make", item], ["schema/arrayOf", item]],
              ];
            default:
              return ["array/make", item];
          }
        };
        // Exact model of which (length, itemKind) pairs each list schema allows.
        const lengths = [0, 1, 2, 3, 4];
        const allows = (
          mode: string,
          item: string,
          bound: number,
          len: number,
          head: string,
          tail: string
        ) => {
          const hOk = len === 0 || fieldIncludes(head, item);
          const tOk = len <= 1 || fieldIncludes(tail, item);
          switch (mode) {
            case "unbounded":
            case "split":
              return hOk && tOk;
            case "bounded":
              return len <= bound && hOk && tOk;
            case "open1":
              return len >= 1 && hOk;
            default:
              return len === 1 && hOk;
          }
        };
        const samples = ["value/integer?", "value/number?", "value/string?"];
        let expected = true;
        for (const len of lengths) {
          for (const head of samples) {
            for (const tail of samples) {
              if (
                allows(modeA, itemA, boundA, len, head, tail) &&
                !allows(modeB, itemB, boundB, len, head, tail)
              ) {
                expected = false;
              }
            }
          }
        }
        const outcome = yield* evaluate([
          "schema/includes?",
          make(modeA, itemA, boundA),
          make(modeB, itemB, boundB),
        ]);
        expect(outcome).toEqual({ ok: true, value: expected });
      }),
    OPTIONS
  );
});

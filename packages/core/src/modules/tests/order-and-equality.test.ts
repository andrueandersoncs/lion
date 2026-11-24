/**
 * String ordering, total value comparison & equality, and structural
 * `array/includes?`: all obey Lion's exact value semantics and agree with
 * `=`, `in`, `array/indexOf`, `array/sort`, and the symbolic solver.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";

const text = Arbitrary.schema(Schema.String.check(Schema.isMaxLength(8)));
const smallInt = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: -20, maximum: 20 }))
);
const denom = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 7 }))
);
const isoDate = Arbitrary.schema(
  Schema.Literals([
    "2024-01-15",
    "2024-12-31",
    "2025-01-01",
    "2025-06-30",
    "2026-03-03",
  ])
);

const quoted = (value: unknown) => ["quote", value];

describe("string ordering", () => {
  it.effect.prop(
    "lessThan, greaterThan, lessThanOrEqualTo, greaterThanOrEqualTo form a total order matching value/compare and array/sort",
    { a: text, b: text, c: text },
    ({ a, b, c }) =>
      Effect.gen(function* () {
        const res = (yield* run(
          {
            lt: ["string/lessThan", quoted(a), quoted(b)],
            gt: ["string/greaterThan", quoted(a), quoted(b)],
            le: ["string/lessThanOrEqualTo", quoted(a), quoted(b)],
            ge: ["string/greaterThanOrEqualTo", quoted(a), quoted(b)],
            eq: ["string/equals?", quoted(a), quoted(b)],
            cmp: ["value/compare", quoted(a), quoted(b)],
            sorted: [
              "array/sort",
              ["array/make", quoted(a), quoted(b), quoted(c)],
              "string/lessThan",
            ],
            defaultSorted: [
              "array/sort",
              ["array/make", quoted(a), quoted(b), quoted(c)],
            ],
          },
          stdlib
        )) as Record<string, unknown>;

        expect(res.lt).toBe(a < b);
        expect(res.gt).toBe(a > b);
        expect(res.le).toBe(a <= b);
        expect(res.ge).toBe(a >= b);
        expect(res.cmp).toBe(Number(a > b) - Number(a < b));
        expect(res.le).toBe(Boolean(res.lt || res.eq));
        expect(res.ge).toBe(Boolean(res.gt || res.eq));
        expect(res.sorted).toEqual(res.defaultSorted);
      })
  );

  it.effect.prop(
    "breaks symmetry in undirected Datalog rules and filters ISO dates",
    { d1: isoDate, d2: isoDate },
    ({ d1, d2 }) =>
      Effect.gen(function* () {
        const rows = (yield* run(
          [
            "begin",
            ["relation", "event", ["date"]],
            ["fact", ["event", d1], ["event", d2]],
            ["relation", "ordered_pair", ["earlier", "later"]],
            [
              "rule",
              ["ordered_pair", "?a", "?b"],
              ["event", "?a"],
              ["event", "?b"],
              ["string/lessThan", "?a", "?b"],
            ],
            ["query", ["ordered_pair", "?a", "?b"]],
          ],
          stdlib
        )) as readonly { readonly a: string; readonly b: string }[];

        if (d1 === d2) {
          expect(rows).toEqual([]);
        } else {
          const [lo, hi] = d1 < d2 ? [d1, d2] : [d2, d1];
          expect(rows).toEqual([{ a: lo, b: hi }]);
        }
      })
  );
});

describe("value/equals?, value/compare, and structural array/includes?", () => {
  it.effect.prop(
    "value/equals? and value/compare agree with =, array/sort, and total-order laws on nested records, lists, and exact fractions",
    { n1: smallInt, d1: denom, n2: smallInt, d2: denom, key: text },
    ({ n1, d1, n2, d2, key }) =>
      Effect.gen(function* () {
        const exprA = { k: quoted(key), q: ["number/divide", n1, d1] };
        const exprB = { k: quoted(key), q: ["number/divide", n2, d2] };
        const res = (yield* run(
          {
            eq: ["value/equals?", exprA, exprB],
            unify: ["=", exprA, exprB],
            ab: ["value/compare", exprA, exprB],
            ba: ["value/compare", exprB, exprA],
            aa: ["value/compare", exprA, exprA],
          },
          stdlib
        )) as {
          readonly eq: boolean;
          readonly unify: boolean;
          readonly ab: number;
          readonly ba: number;
          readonly aa: number;
        };

        expect(res.eq).toBe(res.unify);
        expect(res.aa).toBe(0);
        expect(res.ab).toBe(-res.ba === 0 ? 0 : -res.ba);
        expect([-1, 0, 1]).toContain(res.ab);
        expect(res.ab === 0).toBe(res.eq);
      })
  );

  it.effect.prop(
    "array/includes? uses structural equality on records, lists, and exact fractions, agreeing with array/indexOf and in",
    { n1: smallInt, d1: denom, n2: smallInt, d2: denom, k: text },
    ({ n1, d1, n2, d2, k }) =>
      Effect.gen(function* () {
        const item1 = { k: quoted(k), v: ["number/divide", n1, d1] };
        const item2 = ["array/make", ["number/divide", n1, d1], quoted(k)];
        const sameRec = {
          k: quoted(k),
          v: ["number/divide", n1 * 2, d1 * 2],
        };
        const sameArr = [
          "array/make",
          ["number/divide", n1 * 2, d1 * 2],
          quoted(k),
        ];
        const needleRec = { k: quoted(k), v: ["number/divide", n2, d2] };
        const needleArr = ["array/make", ["number/divide", n2, d2], quoted(k)];
        const list = ["array/make", item1, item2];

        const res = (yield* run(
          {
            incSameRec: ["array/includes?", list, sameRec],
            incSameArr: ["array/includes?", list, sameArr],
            incRec: ["array/includes?", list, needleRec],
            idxRec: ["array/indexOf", list, needleRec],
            inRec: ["in", needleRec, list],
            incArr: ["array/includes?", list, needleArr],
            idxArr: ["array/indexOf", list, needleArr],
            inArr: ["in", needleArr, list],
          },
          stdlib
        )) as {
          readonly incSameRec: boolean;
          readonly incSameArr: boolean;
          readonly incRec: boolean;
          readonly idxRec: number;
          readonly inRec: boolean;
          readonly incArr: boolean;
          readonly idxArr: number;
          readonly inArr: boolean;
        };

        const same = n1 * d2 === n2 * d1;
        expect(res.incSameRec).toBe(true);
        expect(res.incSameArr).toBe(true);
        expect(res.incRec).toBe(same);
        expect(res.incRec).toBe(res.idxRec >= 0);
        expect(res.incRec).toBe(res.inRec);
        expect(res.incArr).toBe(same);
        expect(res.incArr).toBe(res.idxArr >= 0);
        expect(res.incArr).toBe(res.inArr);
      })
  );

  it.effect.prop(
    "symbolic solver proves value/equals? and value/compare laws over unbounded integers",
    { c: smallInt },
    ({ c }) =>
      Effect.gen(function* () {
        // No integer x has value/compare(x, x + 1) != -1
        const cmpRefuted = yield* run(
          [
            "query",
            [
              "and",
              ["schema/fits?", "?x", "value/integer?"],
              [
                "not",
                ["=", ["value/compare", "?x", ["number/add", "?x", 1]], -1],
              ],
            ],
          ],
          stdlib
        );
        expect(cmpRefuted).toEqual([]);

        // Solver finds the exact integer x where value/equals?({v: x}, {v: c}) holds
        const eqSolved = yield* run(
          [
            "query",
            [
              "and",
              ["schema/fits?", "?x", "value/integer?"],
              ["value/equals?", { v: "?x" }, { v: c }],
            ],
          ],
          stdlib
        );
        expect(eqSolved).toEqual([{ x: c }]);
      }),
    { arbitrary: { runs: 25 } }
  );
});

/**
 * `why` explains a derived row by what its rule rested on. A figure a rule
 * computed rests on its inputs and on the arithmetic that made it, so the
 * explanation shows that arithmetic on the values it was given, and that
 * arithmetic, worked again, gives the figure.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";

const amount = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: -1000, maximum: 1000 }))
);

const ITEMS = ["a", "b", "c"] as const;

interface Premise {
  readonly check?: unknown;
  readonly fact?: unknown;
}

describe("why on a computed figure", () => {
  it.effect.prop(
    "shows the arithmetic on its inputs, which gives the figure",
    {
      amounts: Arbitrary.array(amount, { minLength: 3, maxLength: 3 }),
      scales: Arbitrary.array(amount, { minLength: 1, maxLength: 2 }),
    },
    ({ amounts, scales }) =>
      Effect.gen(function* () {
        const line = new Map(ITEMS.map((item, at) => [item, amounts[at] ?? 0]));
        const figure = [
          "rule",
          ["figure", "?x", "?y", "?r"],
          ["line", "?x", "?a"],
          ["line", "?y", "?b"],
          ["in", "?k", ["quote", scales]],
          ["=", "?r", ["number/add", ["number/multiply", "?a", "?k"], "?b"]],
        ];
        const setup = [
          ["relation", "line", ["item", "amount"]],
          ["relation", "figure", ["x", "y", "result"]],
          ["fact", ...[...line].map(([item, n]) => ["line", item, n])],
          figure,
        ];
        const rows = (yield* run(
          ["begin", ...setup, ["query", ["figure", "?x", "?y", "?result"]]],
          stdlib
        )) as { result: number; x: string; y: string }[];
        expect(rows.length).toBeGreaterThan(0);
        for (const { result, x, y } of rows) {
          const { because } = (yield* run(
            ["begin", ...setup, ["why", ["figure", x, y, result]]],
            stdlib
          )) as { because: readonly Premise[] };
          // The engine may test a rule's goals in another order than written.
          const facts = because.flatMap((p) => ("fact" in p ? [p.fact] : []));
          const checks = because.flatMap((p) => ("check" in p ? [p] : []));
          const chosen = checks.find((p) => (p.check as unknown[])[0] === "in");
          const computed = checks.find(
            (p) => (p.check as unknown[])[0] === "="
          );
          const a = line.get(x as never) ?? 0;
          const b = line.get(y as never) ?? 0;
          expect(because).toHaveLength(4);
          expect(facts).toEqual(
            expect.arrayContaining([
              ["line", x, a],
              ["line", y, b],
            ])
          );
          // The scale it was given is one of those `in` chose from.
          const k = scales.find(
            (scale) =>
              JSON.stringify(computed?.check) ===
              JSON.stringify([
                "=",
                result,
                ["number/add", ["number/multiply", a, scale], b],
              ])
          );
          expect(k === undefined ? computed : a * k + b).toBe(result);
          // Each goal the rule tested, as it held, holds when asked again.
          for (const premise of [chosen, computed]) {
            expect(yield* run(premise?.check, stdlib)).toBe(true);
          }
        }
      })
  );
});

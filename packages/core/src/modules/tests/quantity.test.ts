/**
 * Numbers that carry their units. The model is plain TypeScript: a unit is
 * a map from base unit to exponent; a product adds the exponents and a
 * quotient takes them away; a sum needs one unit; and a result with no unit
 * left is its number.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { element } from "@/logic/tests/programs";
import { stdlib } from "@/modules";

type Unit = Record<string, number>;

interface Quantity {
  readonly unit: Unit;
  readonly value: number;
}

const BASES = ["m", "s", "kg"] as const;

const exponent = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: -2, maximum: 2 }))
);

const quantity = Arbitrary.map(
  Arbitrary.all([
    Arbitrary.schema(
      Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 9 }))
    ),
    exponent,
    exponent,
    exponent,
  ]),
  ([value, ...exponents]): Quantity => ({
    value,
    unit: Object.fromEntries(
      BASES.flatMap((base, at) =>
        exponents[at] === 0 ? [] : [[base, exponents[at] as number]]
      )
    ),
  })
);

/** The unit without 0s, in the order of names. */
const normal = (unit: Unit): Unit =>
  Object.fromEntries(
    Object.entries(unit)
      .filter(([, n]) => n !== 0)
      .sort(([a], [b]) => (a < b ? -1 : 1))
  );

const combined = (a: Unit, b: Unit, by: number) => {
  const out = { ...a };
  for (const [name, n] of Object.entries(b)) {
    out[name] = (out[name] ?? 0) + by * n;
  }
  return normal(out);
};

/** What Lion gives for a quantity: its number when no unit is left. */
const given = (value: number, unit: Unit) =>
  Object.keys(unit).length === 0 ? value : { value, unit };

const literal = (q: Quantity) => ["quote", q];

const outcome = (program: unknown) =>
  run(program, stdlib).pipe(
    Effect.map((value) => ({ value })),
    Effect.catch((error) =>
      Effect.succeed({ failed: String((error as Error).message) })
    )
  );

describe("quantities", () => {
  it.effect.prop(
    "multiply and divide as the model does, adding and taking away exponents",
    { a: quantity, b: quantity },
    ({ a, b }) =>
      Effect.gen(function* () {
        expect(
          yield* outcome(["quantity/multiply", literal(a), literal(b)])
        ).toEqual({
          value: given(a.value * b.value, combined(a.unit, b.unit, 1)),
        });
        expect(
          yield* outcome(["quantity/divide", literal(a), literal(b)])
        ).toEqual({
          value: given(a.value / b.value, combined(a.unit, b.unit, -1)),
        });
      })
  );

  it.effect.prop(
    "add and subtract only quantities of one unit, and say which differ",
    { a: quantity, b: quantity, op: element(["add", "subtract"] as const) },
    ({ a, b, op }) =>
      Effect.gen(function* () {
        const result = yield* outcome([
          `quantity/${op}`,
          literal(a),
          literal(b),
        ]);
        const same =
          JSON.stringify(normal(a.unit)) === JSON.stringify(normal(b.unit));
        if (same) {
          expect(result).toEqual({
            value: given(
              op === "add" ? a.value + b.value : a.value - b.value,
              normal(a.unit)
            ),
          });
        } else {
          expect((result as { failed: string }).failed).toContain(
            `quantity/${op}: `
          );
          expect((result as { failed: string }).failed).toContain(
            "have different units"
          );
        }
      })
  );

  it.effect.prop(
    "give back the quantity a quotient was made from, and its number in its own unit",
    { a: quantity, b: quantity, n: exponent },
    ({ a, b, n }) =>
      Effect.gen(function* () {
        // (a / b) * b is a again, and a to the n has n times its exponents.
        const back = yield* outcome([
          "quantity/multiply",
          ["quantity/divide", literal(a), literal(b)],
          literal(b),
        ]);
        expect(back).toEqual({ value: given(a.value, normal(a.unit)) });
        expect(
          yield* outcome(["quantity/in", literal(a), ["quote", a.unit]])
        ).toEqual({ value: a.value });
        const powered = Object.fromEntries(
          Object.entries(a.unit).map(([name, e]) => [name, e * n])
        );
        expect(yield* outcome(["quantity/power", literal(a), n])).toEqual({
          value: given(a.value ** n, normal(powered)),
        });
      })
  );
});

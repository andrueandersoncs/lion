/**
 * Lion's numbers are JSON numbers, so arithmetic never produces Infinity or
 * NaN: a result that is not a finite number is an ArithmeticError. Integers
 * a JSON number holds exactly do exact arithmetic: an integer result of
 * them that is not the exact one is an ArithmeticError too.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { nearestSum } from "@/logic/tests/programs";
import { stdlib } from "@/modules";

/** Ordinary numbers, plus zeros and numbers near the largest double. */
const number = Arbitrary.flatMap(
  Arbitrary.schema(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 }))
  ),
  (kind) =>
    kind === 0
      ? Arbitrary.schema(Schema.Literals([0, 1e308, -1e308, 1.5e308]))
      : Arbitrary.schema(
          Schema.Int.check(Schema.isBetween({ minimum: -1000, maximum: 1000 }))
        )
);

const OPERATIONS: Record<string, (a: number, b: number) => number> = {
  "number/add": (a, b) => a + b,
  "number/subtract": (a, b) => a - b,
  "number/multiply": (a, b) => a * b,
  "number/divide": (a, b) => a / b,
  "number/remainder": (a, b) => a % b,
  "number/power": (a, b) => a ** b,
  "number/min": Math.min,
  "number/max": Math.max,
};

/** The exact result of integers, for the operations that are exact on them. */
const EXACT: Record<string, (a: bigint, b: bigint) => bigint> = {
  "number/add": (a, b) => a + b,
  "number/subtract": (a, b) => a - b,
  "number/multiply": (a, b) => a * b,
  "number/power": (a, b) => a ** b,
};

/** Whether JavaScript's result is the exact one, where it should be. */
const isExact = (name: string, a: number, b: number, result: number) => {
  const exact = EXACT[name];
  if (
    exact === undefined ||
    !Number.isSafeInteger(a) ||
    !Number.isSafeInteger(b) ||
    !Number.isInteger(result) ||
    // A negative power is a fraction, which rounds as a float does.
    (name === "number/power" && b < 0)
  ) {
    return true;
  }
  return exact(BigInt(a), BigInt(b)) === BigInt(result);
};

const ROUNDING: Record<string, (a: number) => number> = {
  "number/absolute": Math.abs,
  "number/floor": Math.floor,
  "number/ceiling": Math.ceil,
  "number/round": Math.round,
};

/** Eighths, so halves and quarters come up and stay exact. */
const fraction = Arbitrary.map(
  Arbitrary.schema(
    Schema.Int.check(Schema.isBetween({ minimum: -80, maximum: 80 }))
  ),
  (eighths) => eighths / 8
);

/** The result, or the tag and message of the error. */
const outcome = (program: unknown) =>
  run(program, stdlib).pipe(
    Effect.map((value) => ({ value })),
    Effect.catch((error) =>
      Effect.succeed({
        tag: (error as { _tag?: unknown })._tag,
        message: String((error as { message?: unknown }).message),
      })
    )
  );

describe("arithmetic", () => {
  it.effect.prop(
    "returns the JavaScript result when it is finite and, for integers a JSON number holds, exact, and fails otherwise",
    { a: number, b: number },
    ({ a, b }) =>
      Effect.gen(function* () {
        for (const [name, operate] of Object.entries(OPERATIONS)) {
          const expected = operate(a, b);
          const result = yield* outcome([name, a, b]);
          if (Number.isFinite(expected) && isExact(name, a, b, expected)) {
            expect(result).toEqual({ value: expected });
          } else {
            expect(result).toMatchObject({ tag: "ArithmeticError" });
            expect((result as { message: string }).message).toContain(name);
          }
        }
      })
  );

  it.effect.prop(
    "on one number agrees with JavaScript, and zero equals negative zero",
    { a: fraction },
    ({ a }) =>
      Effect.gen(function* () {
        for (const [name, operate] of Object.entries(ROUNDING)) {
          const expected = operate(a);
          // JSON writes -0 as 0, so Lion treats them as one number.
          expect(yield* outcome(["=", [name, a], expected + 0])).toEqual({
            value: true,
          });
          expect(
            yield* outcome(["number/equals?", [name, a], expected])
          ).toEqual({
            value: true,
          });
        }
      })
  );

  it.effect.prop(
    "of aggregate/sum and aggregate/mean follows the same rule",
    { values: Arbitrary.array(number, { minLength: 1, maxLength: 5 }) },
    ({ values }) =>
      Effect.gen(function* () {
        // A sum is the number nearest the exact sum, so it fails only
        // when that is beyond every number.
        const sum = nearestSum(values);
        for (const [name, expected] of [
          ["aggregate/sum", sum],
          ["aggregate/mean", sum / values.length],
        ] as const) {
          const result = yield* outcome([name, ["quote", values]]);
          if (Number.isFinite(expected)) {
            expect(result).toEqual({ value: expected });
          } else {
            expect(result).toMatchObject({ tag: "ArithmeticError" });
          }
        }
      })
  );
});

/** Integers near the last one a JSON number holds exactly, on either side of 0. */
const nearTheEdge = Arbitrary.map(
  Arbitrary.all([
    Arbitrary.schema(
      Schema.Int.check(Schema.isBetween({ minimum: -4, maximum: 0 }))
    ),
    Arbitrary.schema(Schema.Boolean),
    Arbitrary.schema(Schema.Boolean),
  ]),
  ([below, negative, half]) => {
    const near = (half ? 2 ** 52 : Number.MAX_SAFE_INTEGER) + below;
    return negative ? -near : near;
  }
);

describe("integers a JSON number holds exactly", () => {
  it.effect.prop(
    "add, subtract, multiply, and sum to the exact result, or fail naming it",
    {
      values: Arbitrary.array(nearTheEdge, { minLength: 2, maxLength: 4 }),
    },
    ({ values }) =>
      Effect.gen(function* () {
        const [a, b] = values as [number, number];
        for (const name of [
          "number/add",
          "number/subtract",
          "number/multiply",
        ]) {
          const exact = (EXACT[name] as (x: bigint, y: bigint) => bigint)(
            BigInt(a),
            BigInt(b)
          );
          const result = yield* outcome([name, a, b]);
          if (exact === BigInt(Number(exact))) {
            expect(result).toEqual({ value: Number(exact) });
          } else {
            expect(result).toMatchObject({ tag: "ArithmeticError" });
            expect((result as { message: string }).message).toContain(
              `is ${exact}, but`
            );
          }
        }
        // The text of the exact sum reads back as it, or as the number JSON
        // writes with its digits, or as nothing.
        const exactSum = values.reduce((sum, value) => sum + BigInt(value), 0n);
        const read = yield* outcome(["number/fromString", `${exactSum}`]);
        const reads =
          exactSum === BigInt(Number(exactSum)) ||
          JSON.stringify(Number(exactSum)) === `${exactSum}`;
        expect(read).toEqual({ value: reads ? Number(exactSum) : null });
        const total = exactSum;
        const summed = yield* outcome(["aggregate/sum", ["quote", values]]);
        if (total === BigInt(Number(total))) {
          expect(summed).toEqual({ value: Number(total) });
        } else {
          expect((summed as { message: string }).message).toContain(
            `of integers is ${total}, but`
          );
        }
      })
  );
});

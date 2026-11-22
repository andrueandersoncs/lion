/**
 * Every Lion number is exact. These properties check Lion's arithmetic,
 * order, text, and JSON against a model of fractions written apart from
 * `numbers/exact.ts`, and check that what the solver proves about numbers
 * holds of what plain code computes.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Result, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { readJson, writeJson } from "@/evaluation/reading";
import { LogicDatabase } from "@/logic/database";
import { loadDatabase, saveDatabase } from "@/logic/snapshot";
import { element, oneOf } from "@/logic/tests/programs";
import { stdlib } from "@/modules";
import { Exact, fromRational, type LionNumber, ratio } from "@/numbers/exact";
import {
  asFraction,
  type Fraction,
  minus,
  order,
  over,
  plus,
  same,
  times,
} from "@/numbers/tests/model";

const int = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

/** A fraction from its numerator and denominator, in Lion's one form. */
const lion = (n: bigint, d = 1n): LionNumber => fromRational(ratio(n, d));

/**
 * Numbers of every kind: small whole numbers, decimals with up to four
 * places, whole numbers past 2^53, thirds, and tiny and huge doubles.
 */
const number: Arbitrary.Arbitrary<LionNumber> = oneOf(
  Arbitrary.map(int(-1000, 1000), (n) => n),
  Arbitrary.map(
    Arbitrary.all([int(-100_000, 100_000), int(1, 4)]),
    ([n, places]) => lion(BigInt(n), 10n ** BigInt(places))
  ),
  Arbitrary.map(Arbitrary.all([int(-1000, 1000), int(0, 30)]), ([n, past]) =>
    lion(2n ** 53n * BigInt(n) + BigInt(past))
  ),
  Arbitrary.map(int(-1000, 1000), (n) => lion(3n * BigInt(n) + 1n, 3n)),
  // Safe integers at the edge, whose sums and products leave the safe ones.
  Arbitrary.map(int(0, 3), (k) => Number.MAX_SAFE_INTEGER - k),
  Arbitrary.map(int(0, 3), (k) => -Number.MAX_SAFE_INTEGER + k),
  element<LionNumber>([5e-324, 1e300, -1e-7, 0.1, 0.2, 2 ** 60])
);

/** One to forty digits, the first not 0. */
const DIGITS_UP_TO_FORTY = /^[1-9]\d{0,39}$/;

interface Outcome {
  readonly tag?: unknown;
  readonly value?: unknown;
}

/** What a Lion run gives, or the tag of its failure. */
const outcome = (program: unknown) =>
  run(program, stdlib).pipe(
    Effect.map((value): Outcome => ({ value })),
    Effect.catch((error) =>
      Effect.succeed<Outcome>({ tag: (error as { _tag?: unknown })._tag })
    )
  );

/** The decimal digits of a fraction to `places` places, cut, not rounded. */
const digitsOf = ([n, d]: Fraction, places: number) => {
  const negative = n * d < 0n;
  const top = (n < 0n ? -n : n) * 10n ** BigInt(places);
  const scaled = top / (d < 0n ? -d : d);
  const text = scaled.toString().padStart(places + 1, "0");
  return `${negative ? "-" : ""}${text.slice(0, -places)}.${text.slice(-places)}`;
};

/**
 * Whether a JavaScript number writes a fraction: the double nearest it, read
 * from forty digits, writes the same fraction.
 */
const doubleWrites = (fraction: Fraction) => {
  const near = Number.parseFloat(digitsOf(fraction, 40));
  return Number.isFinite(near) && same(asFraction(near), fraction);
};

/** A Lion number is in its one form: a double when one writes it, and otherwise an `Exact`. */
const inOneForm = (value: unknown) =>
  value instanceof Exact
    ? !doubleWrites(asFraction(value))
    : typeof value === "number" && Number.isFinite(value);

const ARITHMETIC: Record<string, (a: Fraction, b: Fraction) => Fraction> = {
  "number/add": plus,
  "number/subtract": minus,
  "number/multiply": times,
  "number/divide": over,
};

describe("exact arithmetic", () => {
  it.effect.prop(
    "adds, subtracts, multiplies, and divides exactly, and gives each result in its one form",
    { a: number, b: number },
    ({ a, b }) =>
      Effect.gen(function* () {
        for (const [name, model] of Object.entries(ARITHMETIC)) {
          const result = yield* outcome([name, a, b]);
          if (name === "number/divide" && same(asFraction(b), [0n, 1n])) {
            expect(result, name).toEqual({ tag: "ArithmeticError" });
            continue;
          }
          const expected = model(asFraction(a), asFraction(b));
          expect(same(asFraction(result.value), expected), name).toBe(true);
          expect(inOneForm(result.value), name).toBe(true);
        }
      })
  );

  it.effect.prop(
    "orders numbers as their fractions are ordered, and equal values are one value",
    { a: number, b: number },
    ({ a, b }) =>
      Effect.gen(function* () {
        const sign = order(asFraction(a), asFraction(b));
        expect(yield* run(["number/lessThan", a, b], stdlib)).toBe(sign < 0);
        expect(yield* run(["number/equals?", a, b], stdlib)).toBe(sign === 0);
        // A value made two ways is the same value, wherever it is compared.
        const made = ["number/add", ["number/subtract", a, b], b];
        expect(yield* run(["=", made, a], stdlib)).toBe(true);
        expect(
          yield* run(
            [
              "begin",
              ["relation", "n", ["x"]],
              ["fact", ["n", a], ["n", made]],
              ["aggregate/count", ["find", "?x", ["n", "?x"]]],
            ],
            stdlib
          )
        ).toBe(1);
      })
  );

  it.effect.prop(
    "sums and means exactly, in any order",
    { values: Arbitrary.array(number, { minLength: 1, maxLength: 6 }) },
    ({ values }) =>
      Effect.gen(function* () {
        const total = values
          .map(asFraction)
          .reduce<Fraction>((sum, each) => plus(sum, each), [0n, 1n]);
        const sum = yield* run(["aggregate/sum", ["quote", values]], stdlib);
        const reversed = yield* run(
          ["aggregate/sum", ["quote", [...values].reverse()]],
          stdlib
        );
        expect(same(asFraction(sum), total)).toBe(true);
        expect(sum).toBe(reversed);
        const mean = yield* run(["aggregate/mean", ["quote", values]], stdlib);
        expect(
          same(asFraction(mean), over(total, [BigInt(values.length), 1n]))
        ).toBe(true);
      })
  );

  it.effect.prop(
    "rounds to a number of places, a half up",
    { a: number, places: int(-2, 4) },
    ({ a, places }) =>
      Effect.gen(function* () {
        const [n, d] = asFraction(a);
        const scale: Fraction =
          places >= 0
            ? [10n ** BigInt(places), 1n]
            : [1n, 10n ** BigInt(-places)];
        // floor(a × scale + 1/2) ÷ scale, with floor as the model takes it.
        const [m, e] = plus(times([n, d], scale), [1n, 2n]);
        const quotient = m / e;
        const floored = m < 0n && quotient * e !== m ? quotient - 1n : quotient;
        const result = yield* run(["number/round", a, places], stdlib);
        expect(same(asFraction(result), over([floored, 1n], scale))).toBe(true);
      })
  );

  it.effect.prop(
    "takes a whole power exactly",
    { a: number, b: int(-4, 4) },
    ({ a, b }) =>
      Effect.gen(function* () {
        const base = asFraction(a);
        const result = yield* outcome(["number/power", a, b]);
        if (b < 0 && base[0] === 0n) {
          expect(result).toEqual({ tag: "ArithmeticError" });
          return;
        }
        let expected: Fraction = [1n, 1n];
        for (let at = 0; at < Math.abs(b); at += 1) {
          expected = times(expected, base);
        }
        if (b < 0) {
          expected = over([1n, 1n], expected);
        }
        expect(same(asFraction(result.value), expected)).toBe(true);
      })
  );
});

describe("exact numbers as text and as JSON", () => {
  it.effect.prop(
    "read back from number/toString as the same number, 1/3 among them",
    { a: number },
    ({ a }) =>
      Effect.gen(function* () {
        expect(
          yield* run(["number/fromString", ["number/toString", a]], stdlib)
        ).toBe(a);
      })
  );

  it.effect.prop(
    "are written as JSON and read back as the same number, unless no decimal writes them",
    { values: Arbitrary.array(number, { maxLength: 4 }) },
    ({ values }) =>
      Effect.gen(function* () {
        const written = yield* Effect.result(writeJson(values));
        const decimal = values.every(
          (value) => !(value instanceof Exact) || value.d % 3n !== 0n
        );
        if (decimal) {
          const text = Result.getOrThrow(written);
          expect(yield* readJson(text)).toEqual(values);
        } else {
          expect(Result.isFailure(written)).toBe(true);
        }
      })
  );

  it.effect.prop(
    "are read from JSON text exactly as their digits write them",
    {
      digits: Arbitrary.schema(
        Schema.String.check(Schema.isPattern(DIGITS_UP_TO_FORTY))
      ),
      places: int(0, 30),
      negative: Arbitrary.schema(Schema.Boolean),
    },
    ({ digits, places, negative }) =>
      Effect.gen(function* () {
        let shown = digits;
        if (places >= digits.length) {
          shown = `0.${digits.padStart(places, "0")}`;
        } else if (places > 0) {
          shown = `${digits.slice(0, -places)}.${digits.slice(-places)}`;
        }
        const text = `${negative ? "-" : ""}${shown}`;
        const [value] = (yield* readJson(`[${text}]`)) as unknown[];
        const fraction: Fraction = [
          (negative ? -1n : 1n) * BigInt(digits),
          10n ** BigInt(places),
        ];
        expect(same(asFraction(value), fraction)).toBe(true);
        expect(inOneForm(value)).toBe(true);
      })
  );

  it.effect.prop(
    "are kept exactly by a snapshot, 1/3 and 2^53 + 1 among them",
    { values: Arbitrary.array(number, { minLength: 1, maxLength: 4 }) },
    ({ values }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        yield* run(
          [
            "begin",
            ["relation", "n", ["x"]],
            ["fact", ...values.map((value) => ["n", value])],
          ],
          stdlib,
          { database }
        );
        const saved = yield* saveDatabase(database);
        const text = JSON.stringify(saved);
        const loaded = yield* loadDatabase(yield* readJson(text), stdlib);
        const rows = (store: LogicDatabase) =>
          run(["find", "?x", ["n", "?x"]], stdlib, { database: store });
        expect(yield* rows(loaded)).toEqual(yield* rows(database));
      })
  );
});

describe("how large a number may grow", () => {
  it.effect.prop(
    "is 4,300 digits for one read from text and for a whole power, and no limit for a sum",
    { extra: int(1, 50) },
    ({ extra }) =>
      Effect.gen(function* () {
        const most = "9".repeat(4300);
        const more = "9".repeat(4300 + extra);
        expect(
          Result.isSuccess(yield* Effect.result(readJson(`[${most}]`)))
        ).toBe(true);
        expect(
          Result.isFailure(yield* Effect.result(readJson(`[${more}]`)))
        ).toBe(true);
        expect(yield* run(["number/fromString", more], stdlib)).toBeNull();
        expect(
          yield* outcome(["number/power", 10, 4300 + extra * 100])
        ).toEqual({
          tag: "ArithmeticError",
        });
        const power = yield* run(["number/power", 10, 4000], stdlib);
        expect(
          yield* run(["string/length", ["number/toString", power]], stdlib)
        ).toBe(4001);
        // A sum of such numbers may go past the limit: only text is limited.
        const doubled = yield* run(
          ["number/add", power, power, power, power],
          stdlib
        );
        expect(
          same(asFraction(doubled), times([4n, 1n], asFraction(power)))
        ).toBe(true);
      })
  );
});

describe("what the solver proves about numbers", () => {
  it.effect.prop(
    "holds of plain code: adding and taking away a number leaves any number as it was",
    { k: number, x: number },
    ({ k, x }) =>
      Effect.gen(function* () {
        const changes = (v: unknown) => [
          "not",
          ["number/equals?", ["number/subtract", ["number/add", v, k], k], v],
        ];
        // The solver proves that no number changes ...
        expect(
          yield* run(
            [
              "query",
              [
                "not",
                [
                  "exists",
                  ["?v"],
                  [
                    "and",
                    ["schema/fits?", "?v", "value/number?"],
                    changes("?v"),
                  ],
                ],
              ],
            ],
            stdlib
          )
        ).toEqual([{}]);
        // ... and plain code agrees for every number tried.
        expect(yield* run(changes(x), stdlib)).toBe(false);
      })
  );

  it.effect.prop(
    "gives values that meet the filters in plain code",
    { a: number, b: number, c: number },
    ({ a, b, c }) =>
      Effect.gen(function* () {
        const found = (yield* run(
          [
            "find",
            "?x",
            [
              "and",
              ["schema/fits?", "?x", "value/number?"],
              ["=", ["number/add", ["number/multiply", a, "?x"], b], c],
            ],
          ],
          stdlib
        ).pipe(Effect.orElseSucceed(() => []))) as unknown[];
        for (const x of found) {
          expect(
            yield* run(["number/add", ["number/multiply", a, x], b], stdlib)
          ).toBe(c);
        }
      })
  );
});

import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { module as array } from "../array.ts";
import { stdlib } from "../index.ts";

describe("array", () => {
  it("should return the head of an array", () => {
    expect(Effect.runSync(array.head([12, 34, 56]))).toEqual(12);
  });
  it("should return the tail of an array", () => {
    expect(Effect.runSync(array.tail([12, 34, 56]))).toEqual([34, 56]);
  });
  it("should return the length of an array", () => {
    expect(Effect.runSync(array.length([12, 34, 56]))).toEqual(3);
  });
  it.effect("should return the concat of twon arrays", () =>
    Effect.gen(function* () {
      const result = yield* run(
        ["array/concat", ["array/make", 12, 34, 56], ["array/make", 78, 90]],
        stdlib
      );
      expect(result).toEqual([12, 34, 56, 78, 90]);
    })
  );
  describe("map", () => {
    it("should map an array", () => {
      expect(
        Effect.runSync(
          array.map([12, 34, 56], (x: number) => Effect.succeed(x * 2))
        )
      ).toEqual([24, 68, 112]);
    });
    it.effect("should map an array (via run())", () =>
      Effect.gen(function* () {
        const result = yield* run(
          [
            "array/map",
            ["array/make", 12, 34, 56],
            ["lambda", ["x"], ["number/multiply", "x", 2]],
          ],
          stdlib
        );
        expect(result).toEqual([24, 68, 112]);
      })
    );
  });
  describe("reduce", () => {
    it("should reduce an array", () => {
      expect(
        Effect.runSync(
          array.reduce([1, 2, 3, 4], 0, (acc: number, x: number) =>
            Effect.succeed(acc + x)
          )
        )
      ).toEqual(10);
    });
    it.effect("should reduce an array (via run())", () =>
      Effect.gen(function* () {
        const result = yield* run(
          [
            "array/reduce",
            ["array/make", 1, 2, 3, 4],
            0,
            ["lambda", ["acc", "x"], ["number/add", "acc", "x"]],
          ],
          stdlib
        );
        expect(result).toEqual(10);
      })
    );
  });
});

describe("array/reductions", () => {
  const list = Arbitrary.schema(
    Schema.Array(
      Schema.Int.check(Schema.isBetween({ minimum: -50, maximum: 50 }))
    )
  );
  it.effect.prop(
    "gives every value array/reduce passes through: the k-th is the first k items reduced, and the last is array/reduce's",
    { items: list, initial: list },
    ({ initial, items }) =>
      Effect.gen(function* () {
        // A step that keeps the order of what it saw, so any other order shows.
        const step = [
          "lambda",
          ["seen", "x"],
          ["array/concat", "seen", ["array/make", "x"]],
        ];
        const states = yield* run(
          ["array/reductions", ["quote", items], ["quote", initial], step],
          stdlib
        );
        expect(states).toEqual(
          Array.from({ length: items.length + 1 }, (_, k) => [
            ...initial,
            ...items.slice(0, k),
          ])
        );
        const reduced = yield* run(
          ["array/reduce", ["quote", items], ["quote", initial], step],
          stdlib
        );
        expect((states as unknown[]).at(-1)).toEqual(reduced);
      })
  );
});

describe("array/some? and array/every?", () => {
  const items = Arbitrary.schema(
    Schema.Array(
      Schema.Int.check(Schema.isBetween({ minimum: -5, maximum: 5 }))
    )
  );
  const above = Arbitrary.schema(
    Schema.Int.check(Schema.isBetween({ minimum: -5, maximum: 5 }))
  );
  it.effect.prop(
    "say whether the function is true for some item, and for each, asking no further than the first item that settles it",
    { items, above },
    ({ above, items }) =>
      Effect.gen(function* () {
        const test = ["lambda", ["x"], ["number/greaterThan", "x", above]];
        const some = yield* run(
          ["array/some?", ["quote", items], test],
          stdlib
        );
        const every = yield* run(
          ["array/every?", ["quote", items], test],
          stdlib
        );
        expect(some).toBe(items.some((x) => x > above));
        expect(every).toBe(items.every((x) => x > above));
        // An item after the one that settles it would fail, and is not asked.
        const failing = [
          "lambda",
          ["x"],
          [
            "cond",
            [
              ["number/equals?", "x", 99],
              ["number/add", "x", "not a number"],
            ],
            ["else", ["number/greaterThan", "x", above]],
          ],
        ];
        const settled = (stop: boolean) => {
          const at = items.findIndex((x) => x > above === stop);
          return at === -1 ? undefined : [...items.slice(0, at + 1), 99];
        };
        const someList = settled(true);
        if (someList !== undefined) {
          expect(
            yield* run(["array/some?", ["quote", someList], failing], stdlib)
          ).toBe(true);
        }
        const everyList = settled(false);
        if (everyList !== undefined) {
          expect(
            yield* run(["array/every?", ["quote", everyList], failing], stdlib)
          ).toBe(false);
        }
      })
  );

  it.effect.prop(
    "fail when the function gives anything but true or false, as a condition does",
    {
      items: Arbitrary.array(Arbitrary.schema(Schema.Int), { minLength: 1 }),
    },
    ({ items }) =>
      Effect.gen(function* () {
        for (const name of ["array/some?", "array/every?"]) {
          const outcome = yield* Effect.exit(
            run([name, ["quote", items], ["lambda", ["x"], "x"]], stdlib)
          );
          expect(outcome._tag).toBe("Failure");
        }
      })
  );
});

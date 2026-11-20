import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";
import { module as func } from "../func.ts";

describe("func/bind", () => {
  it("should bind a function to an object", () => {
    const context = {};
    const fn = () => {
      expect(this).toEqual(context);
    };
    const boundFn = func.bind(fn, context);
    Effect.runSync(boundFn);
  });
});

describe("func/callback", () => {
  it("should call a function with the given arguments", () => {
    const callback = func.callback((a: number, b: number) => a + b);
    expect(Effect.runSync(callback)(1, 2)).toEqual(3);
  });
});

/** Up to four parameters, and up to six arguments host code passes. */
const counts = {
  parameters: Arbitrary.schema(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 4 }))
  ),
  given: Arbitrary.schema(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 6 }))
  ),
};

describe("a callback host code calls", () => {
  it.effect.prop(
    "gives a Lion function as many of the host's arguments as it takes, and fails as a call does when the host gives fewer",
    counts,
    ({ parameters, given }) =>
      Effect.gen(function* () {
        const names = ["a", "b", "c", "d"].slice(0, parameters);
        const callback = (yield* run(
          ["func/callback", ["lambda", names, ["array/make", ...names]]],
          stdlib
        )) as (...args: unknown[]) => Promise<unknown>;
        const args = Array.from({ length: given }, (_, at) => at * 10);
        const outcome = yield* Effect.promise(() =>
          callback(...args).then(
            (value) => ({ value }),
            (error: Error) => ({ error: error.message })
          )
        );
        expect(outcome).toStrictEqual(
          given >= parameters
            ? { value: args.slice(0, parameters) }
            : {
                error: `${JSON.stringify(["lambda", names, ["array/make", ...names]])} takes ${parameters} argument${parameters === 1 ? "" : "s"} but got ${given}.`,
              }
        );
      })
  );

  it.effect.prop(
    "gives a library function and a function func/partial built as many as each takes",
    counts,
    ({ parameters, given }) =>
      Effect.gen(function* () {
        // number/max takes one or more; a partial with some given takes the rest.
        const filled = Array.from({ length: parameters }, (_, at) => -at);
        const callback = (yield* run(
          [
            "func/callback",
            filled.length === 0
              ? "number/absolute"
              : ["func/partial", "number/subtract", ...filled.slice(0, 1)],
          ],
          stdlib
        )) as (...args: unknown[]) => Promise<unknown>;
        const args = Array.from({ length: given }, (_, at) => at + 5);
        const outcome = yield* Effect.promise(() =>
          callback(...args).then(
            (value) => ({ value }),
            () => ({ value: "failed" })
          )
        );
        // number/absolute takes 1; number/subtract with one given takes 1 more.
        const first = args[0] as number;
        let expected: unknown = "failed";
        if (given > 0) {
          expected =
            filled.length === 0
              ? Math.abs(first)
              : (filled[0] as number) - first;
        }
        expect(outcome).toStrictEqual({ value: expected });
      })
  );
});

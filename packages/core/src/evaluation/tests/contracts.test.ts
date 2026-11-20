/**
 * A lambda's contracts. A parameter written `[name, schema]` checks its
 * argument as `schema/assert` does, when the call is made: the lambda gives
 * what the same lambda with `schema/assert` first in its body gives in plain
 * code, also where the call waits for a logic variable, in a `find` and in a
 * rule. A misfit fails before the body runs, so a failure leaves the
 * caller first, as Racket blames the party that broke a contract.
 */
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { run } from "@/evaluation/evaluate";
import { element } from "@/logic/tests/programs";
import { stdlib } from "@/modules";

/** Schemas a contract can hold. */
const SCHEMAS: readonly unknown[] = [
  "value/number?",
  "value/integer?",
  "value/string?",
  ["schema/anyOf", 1, 2],
  ["lambda", ["n"], ["number/greaterThan", "n", 0]],
  { id: "value/integer?" },
];

/** Arguments, some fitting each schema and some not. */
const VALUES: readonly unknown[] = [
  1,
  2,
  -3,
  2.5,
  "two",
  ["quote", { id: 4 }],
  ["quote", { id: "x" }],
];

/** What the body does with the argument: something every value allows. */
const BODY = ["array/make", "n", "n"];

/** The places a call can stand: plain code, a find, and a rule. */
const PLACES: Record<string, (fn: unknown, value: unknown) => unknown> = {
  "plain code": (fn, value) => [fn, value],
  find: (fn, value) => [
    "find",
    [fn, "?x"],
    ["in", "?x", ["array/make", value]],
  ],
  rule: (fn, value) => [
    "begin",
    ["relation", "given", ["x"]],
    ["relation", "made", ["x", "y"]],
    ["fact", ["given", value]],
    ["rule", ["made", "?x", [fn, "?x"]], ["given", "?x"]],
    ["find", "?y", ["made", "?_", "?y"]],
  ],
};

const outcome = (program: unknown) =>
  run(program, stdlib).pipe(
    Effect.map((value) => ({ value })),
    Effect.catch((error) =>
      Effect.succeed({ failed: String((error as Error).message) })
    )
  );

describe("a lambda's contract", () => {
  it.effect.prop(
    "gives what schema/assert first in its body gives in plain code, wherever the call stands",
    {
      schema: element(SCHEMAS),
      value: element(VALUES),
      place: element(Object.keys(PLACES)),
    },
    ({ schema, value, place }) =>
      Effect.gen(function* () {
        const write = PLACES[place] as (fn: unknown, value: unknown) => unknown;
        const contracted = ["lambda", [["n", schema]], BODY];
        // The model: in plain code, the value checked first, then the body.
        const model = yield* outcome([
          ["lambda", ["n"], ["begin", ["schema/assert", "n", schema], BODY]],
          value,
        ]);
        const result = yield* outcome(write(contracted, value));
        if ("failed" in model || place === "plain code") {
          expect(result).toEqual(model);
        } else {
          expect(result).toEqual({ value: [model.value] });
        }
      })
  );

  it.effect.prop(
    "fails before the body runs, so a misfit names the caller first",
    { schema: element(SCHEMAS), value: element(VALUES) },
    ({ schema, value }) =>
      Effect.gen(function* () {
        const program = [
          "begin",
          ["define", "checked", ["lambda", [["n", schema]], BODY]],
          [
            "define",
            "caller",
            ["lambda", ["v"], ["array/make", ["checked", "v"]]],
          ],
          ["caller", value],
        ];
        const asserted = yield* outcome(["schema/assert", value, schema]);
        const result = yield* outcome(program);
        if ("failed" in asserted) {
          expect(result).toEqual({
            failed: `${asserted.failed} (in "caller")`,
          });
        } else {
          expect(result).toHaveProperty("value");
        }
      })
  );
});

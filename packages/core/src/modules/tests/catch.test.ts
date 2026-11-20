/**
 * Failures a program catches and reads as data. `func/catch` gives what its
 * thunk gives, or what its handler gives for the failure as a record: the
 * failure's kind and the message it fails with uncaught. `func/raise` fails
 * with a value, which the record gives back. A call that waits for a logic
 * variable is no failure, so a catch in a `find` gives for each value what
 * it gives in plain code with the value in place.
 */
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { run } from "@/evaluation/evaluate";
import { element } from "@/logic/tests/programs";
import { stdlib } from "@/modules";

/** Expressions over n: some give a value, some fail in different ways. */
const EXPRESSIONS: readonly unknown[] = [
  ["number/add", "n", 1],
  ["number/divide", 1, "n"],
  ["number/add", "n", "one"],
  ["object/get", ["quote", { a: 1 }], "missing"],
  ["func/raise", ["array/make", "n", "n"]],
  ["func/raise", "out of stock"],
  ["number/add", 9_007_199_254_740_991, "n"],
];

const outcome = (program: unknown) =>
  run(program, stdlib).pipe(
    Effect.map((value) => ({ value })),
    Effect.catch((error) =>
      Effect.succeed({
        failure: (error as { _tag?: string })._tag,
        message: String((error as Error).message),
      })
    )
  );

/** A thunk over n's value, and a handler that gives the failure record. */
const caught = (expression: unknown, n: unknown) => [
  "func/catch",
  ["lambda", [], [["lambda", ["n"], expression], n]],
  ["lambda", ["failure"], "failure"],
];

describe("func/catch and func/raise", () => {
  it.effect.prop(
    "give the thunk's value, or the failure it fails with uncaught, as a record",
    { expression: element(EXPRESSIONS), n: element<unknown>([0, 2, -1]) },
    ({ expression, n }) =>
      Effect.gen(function* () {
        const uncaught = yield* outcome([["lambda", ["n"], expression], n]);
        const result = yield* outcome(caught(expression, n));
        if ("value" in uncaught) {
          expect(result).toEqual(uncaught);
          return;
        }
        const record = (result as { value: Record<string, unknown> }).value;
        expect(record.message).toBe(uncaught.message);
        expect(record.failure).toBe(
          Array.isArray(expression) && expression[0] === "func/raise"
            ? "raised"
            : uncaught.failure
        );
      })
  );

  it.effect.prop(
    "give back the value a failure was raised with",
    {
      value: element<unknown>([
        "text",
        7,
        null,
        true,
        ["quote", [1, 2]],
        ["quote", { code: "x" }],
      ]),
    },
    ({ value }) =>
      Effect.gen(function* () {
        const result = yield* outcome([
          "func/catch",
          ["lambda", [], ["func/raise", value]],
          ["lambda", ["failure"], ["object/get", "failure", "value"]],
        ]);
        expect(result).toEqual(yield* outcome(value));
      })
  );

  it.effect.prop(
    "in a find, give for each value what plain code gives with the value in place",
    { expression: element(EXPRESSIONS) },
    ({ expression }) =>
      Effect.gen(function* () {
        const values = [0, 2, -1];
        const found = yield* outcome([
          "find",
          caught(expression, "?n"),
          ["in", "?n", ["array/make", ...values]],
        ]);
        const plain: unknown[] = [];
        for (const n of values) {
          plain.push(
            ((yield* outcome(caught(expression, n))) as { value: unknown })
              .value
          );
        }
        // A find gives its answers in an order of its own, once each.
        const sorted = (values: readonly unknown[]) =>
          [...new Set(values.map((value) => JSON.stringify(value)))].sort();
        expect(sorted((found as { value: unknown[] }).value)).toEqual(
          sorted(plain)
        );
      })
  );

  it.effect.prop(
    "give a failure that left named functions with its message as raised, and its raised value",
    {
      value: element<unknown>(["text", 7, ["quote", { code: "x" }]]),
      raise: element([true, false]),
    },
    ({ value, raise }) =>
      Effect.gen(function* () {
        // The failure leaves "inner" and "outer" before the catch sees it.
        const failing = raise ? ["func/raise", "v"] : ["number/divide", 1, 0];
        const program = (body: unknown) => [
          "begin",
          ["define", "inner", ["lambda", ["v"], failing]],
          [
            "define",
            "outer",
            ["lambda", ["v"], ["array/make", ["inner", "v"]]],
          ],
          body,
        ];
        const uncaught = yield* outcome(program(["outer", value]));
        const record = (
          (yield* outcome(
            program([
              "func/catch",
              ["lambda", [], ["outer", value]],
              ["lambda", ["failure"], "failure"],
            ])
          )) as { value: Record<string, unknown> }
        ).value;
        const message = (uncaught as { message: string }).message;
        expect(message).toContain(' (in "inner", called from "outer")');
        expect(record.message).toBe(
          message.replace(' (in "inner", called from "outer")', "")
        );
        if (raise) {
          expect(record.value).toEqual(
            ((yield* outcome(value)) as { value: unknown }).value
          );
        }
      })
  );

  it.effect.prop(
    "leave a call that waits for a variable waiting, not caught",
    { n: element([1, 2]) },
    ({ n }) =>
      Effect.gen(function* () {
        // Nothing binds ?x, so the thunk's call waits: no failure, so the
        // handler is never called, and the catch waits as the call does.
        const result = yield* outcome([
          "func/catch",
          ["lambda", [], ["number/add", "?x", n]],
          ["lambda", ["failure"], "caught"],
        ]);
        expect(result).not.toEqual({ value: "caught" });
      })
  );
});

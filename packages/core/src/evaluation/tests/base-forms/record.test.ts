import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, pipe, Record, Schema } from "effect";
import { InvalidFunctionCallError } from "@/errors/evaluation";
import { run } from "@/evaluation/evaluate";
import { isWaiting } from "@/logic/terms";
import { stdlib } from "@/modules";
import { LionRecordExpressionSchema } from "@/schemas/lion-expression";

describe("evaluate", () => {
  it.effect.prop(
    "should evaluate record expressions by evaluating the values of the record",
    [LionRecordExpressionSchema],
    ([expression]) =>
      Effect.gen(function* () {
        const result = yield* pipe(
          run(expression, {}),
          Effect.catchTag("InvalidFunctionCallError", (e) => Effect.succeed(e))
        );
        const expected = yield* pipe(
          Record.map(expression, (value) => run(value, {})),
          Effect.all,
          Effect.catchTag("InvalidFunctionCallError", (e) => Effect.succeed(e))
        );
        const waits =
          !(expected instanceof InvalidFunctionCallError) &&
          Object.values(expected).some(isWaiting);
        if (!waits) {
          expect(result).toEqual(expected);
          return;
        }
        // A record that holds a logic value waits. It is written with every
        // key, a waiting value as that value is written, and any other value
        // as an expression that gives it back.
        const written = JSON.parse(JSON.stringify(result));
        expect(Object.keys(written)).toEqual(Object.keys(expected));
        for (const [key, value] of Object.entries(expected)) {
          if (isWaiting(value)) {
            expect(written[key]).toEqual(JSON.parse(JSON.stringify(value)));
          } else {
            expect(yield* run(written[key], {})).toEqual(value);
          }
        }
      })
  );
});

/** A record of numbers with any keys JSON allows, but __proto__. */
const numbers = Arbitrary.filter(
  Arbitrary.schema(Schema.Record(Schema.String, Schema.Int)),
  (record) => !Object.hasOwn(record, "__proto__")
);

describe("record keys", () => {
  it.effect.prop(
    "keep every key JSON allows, the empty key among them",
    { record: numbers },
    ({ record }) =>
      Effect.gen(function* () {
        // Numbers evaluate to themselves, so the record does too.
        expect(yield* run(record, {})).toEqual(record);
        // A key is found as the key it was written under.
        expect(yield* run(["object/keys", record], stdlib)).toStrictEqual(
          Object.keys(record)
        );
        for (const [key, value] of Object.entries(record)) {
          expect(
            yield* run(["object/get", record, ["quote", key]], stdlib)
          ).toBe(value);
        }
      })
  );
});

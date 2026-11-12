import { describe, expect, it } from "@effect/vitest";
import { Effect, pipe, Record } from "effect";
import { InvalidFunctionCallError } from "@/errors/evaluation";
import { run } from "@/evaluation/evaluate";
import { isWaiting } from "@/logic/terms";
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
        // A record that holds a logic value waits: it shows as it was written.
        const waits =
          !(expected instanceof InvalidFunctionCallError) &&
          Object.values(expected).some(isWaiting);
        expect(waits ? JSON.parse(JSON.stringify(result)) : result).toEqual(
          waits ? expression : expected
        );
      })
  );
});

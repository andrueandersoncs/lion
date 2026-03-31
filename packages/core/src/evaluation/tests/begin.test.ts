import { describe, expect, it } from "@effect/vitest";
import { Array as Arr, Effect, Match, pipe } from "effect";
import { run } from "@/evaluation/evaluate";
import { BeginFormSchema } from "@/schemas/evaluation";

describe("begin special form", () => {
  it.effect.prop(
    "should evaluate the arguments in order and return the last result",
    [BeginFormSchema],
    ([expression]) =>
      Effect.gen(function* () {
        const result = yield* run(expression, {}).pipe(
          Effect.catchTag("InvalidFunctionCallError", (e) => Effect.succeed(e))
        );
        const [_, ...args] = expression;
        const evaluatedArgs = yield* Effect.all(
          Arr.map(args, (arg) => run(arg, {}))
        ).pipe(
          Effect.catchTag("InvalidFunctionCallError", (e) => Effect.succeed(e))
        );
        const expected = pipe(
          Match.value(evaluatedArgs),
          Match.when(Arr.isNonEmptyArray, (a) => Arr.lastNonEmpty(a)),
          Match.when(Arr.isEmptyArray, () => []),
          Match.orElse((a) => a)
        );
        expect(result).toEqual(expected);
      })
  );
});

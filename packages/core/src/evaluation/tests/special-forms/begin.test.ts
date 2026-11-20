import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Array as Arr, Effect, Match, pipe, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { environment, numberOf, PRELUDE } from "@/logic/tests/expressions";
import { element, outcome } from "@/logic/tests/programs";
import { BeginFormSchema } from "@/schemas/evaluation";

/**
 * Forms of a program over `?x`, which no answer binds there, so a form that
 * needs it waits: a definition of such a value, or the value on its own.
 */
const forms = Arbitrary.array(
  Arbitrary.all([numberOf(2, { saveable: false }), element([true, false])]),
  { minLength: 1, maxLength: 4 }
);

const cut = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 4 }))
);

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
          Match.when(Arr.isArrayNonEmpty, (a) => Arr.lastNonEmpty(a)),
          Match.when(Arr.isArrayEmpty, () => []),
          Match.orElse((a) => a)
        );
        expect(result).toEqual(expected);
      })
  );

  it.effect.prop(
    "runs a program's forms one at a time, also those of a begin among them, whatever waits",
    { forms, cut },
    ({ forms, cut }) =>
      Effect.gen(function* () {
        const written = forms.map(([value, named], at) =>
          named ? ["define", `d${at}`, value] : value
        );
        // Every name the forms define is read after them all.
        const read = [
          "array/make",
          ...forms.flatMap(([, named], at) => (named ? [`d${at}`] : [])),
          ["quote", "done"],
        ];
        const program = (...body: readonly unknown[]) =>
          outcome(run(["begin", ...PRELUDE, ...body, read], environment));
        const nested = yield* program(
          ["begin", ...written.slice(0, cut)],
          ...written.slice(cut)
        );
        expect(nested).toEqual(yield* program(...written));
      })
  );
});

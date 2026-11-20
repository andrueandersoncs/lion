/**
 * `eval` runs its code as a program, so `["eval", code]` gives what running
 * `code` gives. Code that mentions a logic variable gives a value that
 * waits, and each way of writing it waits as a different value: `eval`
 * waits as a whole while its code is not known. What waits computes what it
 * would compute with values in place of the variables, so the two are
 * compared by what they give once a `find` binds the variables.
 */
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { run } from "@/evaluation/evaluate";
import { isWaiting, type LogicValue } from "@/logic/terms";
import { EvalFormSchema } from "@/schemas/evaluation";

const outcome = (program: unknown) =>
  run(program, {}).pipe(
    Effect.catchTag("InvalidFunctionCallError", (e) => Effect.succeed(e))
  );

/** What a program gives, with its logic variables bound to 1 if it waits. */
const settled = (program: unknown) =>
  Effect.gen(function* () {
    const value = yield* outcome(program);
    if (!isWaiting(value)) {
      return { value };
    }
    const { variables } = value as LogicValue;
    return {
      bound: yield* outcome([
        "find",
        program,
        ["and", ...variables.map((variable) => ["=", variable, 1])],
      ]),
    };
  });

describe("eval special form", () => {
  it.effect.prop(
    "an eval expression gives what running its argument gives",
    [EvalFormSchema],
    ([expression]) =>
      Effect.gen(function* () {
        expect(yield* settled(expression)).toEqual(
          yield* settled(expression[1])
        );
      })
  );
});

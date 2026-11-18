/**
 * The value a key or an equality rule keeps when it makes values one. Each
 * class of values that are one is written as its least member: a known
 * value, else the unknown that nests the fewest unknowns, else the one that
 * sorts first. So which value is kept depends only on the class, never on
 * the order in which the values were made one.
 */
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { LogicDatabase } from "@/logic/database";
import {
  mergeForms,
  mergeProgram,
  model,
  racingProgram,
  seed,
  shuffled,
} from "./merges";
import { attempt, oneOf } from "./programs";

const programs = oneOf(mergeProgram, racingProgram);

/** Each relation's rows as text, sorted, so two answers compare as text. */
const rowsOf = (value: unknown) =>
  Object.fromEntries(
    Object.entries(value as Record<string, unknown[]>).map(
      ([relation, rows]) => [
        relation,
        rows.map((row) => JSON.stringify(row)).sort(),
      ]
    )
  );

const answer = (forms: readonly unknown[]) =>
  Effect.map(attempt(["begin", ...forms], new LogicDatabase()), (outcome) =>
    outcome.ok ? rowsOf(outcome.value) : undefined
  );

const RUNS = { arbitrary: { runs: 300 } };

describe("the value a key or an equality rule keeps", () => {
  it.effect.prop(
    "is the least member of its class: a known value, else the unknown that nests the fewest, else the one that sorts first",
    { program: programs },
    ({ program }) =>
      Effect.gen(function* () {
        const lion = yield* answer(mergeForms(program));
        // Lion refuses some programs the model takes, such as a key that
        // would make one an unknown a relation it only reads invented.
        if (lion === undefined) {
          return;
        }
        const expected = model(program);
        expect(JSON.stringify(expected && rowsOf(expected), null, 1)).toBe(
          JSON.stringify(lion, null, 1)
        );
      }),
    RUNS
  );

  it.effect.prop(
    "does not depend on the order the rules are written in or the facts are given in",
    { program: programs, order: seed },
    ({ order, program }) =>
      Effect.gen(function* () {
        const reordered = {
          ...program,
          rules: shuffled(program.rules, order),
          facts: shuffled(program.facts, order + 1),
        };
        expect(yield* answer(mergeForms(reordered))).toEqual(
          yield* answer(mergeForms(program))
        );
      }),
    RUNS
  );
});

/**
 * An array is always a call, so `["?a", "?b"]` calls `?a`: it is no list
 * pattern. A goal that matches a list written so cannot run, and its
 * message says what the array is and how to write the list. Written as the
 * message says, with `array/make`, the goal matches the list.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";

const small = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: -9, maximum: 9 }))
);
const count = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3 }))
);

const NAMES = ["?a", "?b", "?c"];

describe("a list pattern written as a bare array", () => {
  it.effect.prop(
    "cannot run, and the message says it calls its first variable and how to write the list, which then matches as a list does, in a find and in a rule",
    {
      inRule: Arbitrary.schema(Schema.Boolean),
      rows: Arbitrary.array(
        Arbitrary.array(small, { maxLength: 3, minLength: 3 }),
        {
          maxLength: 4,
        }
      ),
      useIn: Arbitrary.schema(Schema.Boolean),
      width: count,
    },
    ({ inRule, rows, useIn, width }) =>
      Effect.gen(function* () {
        const names = NAMES.slice(0, width);
        const tuples = rows.map((row) => row.slice(0, width));
        const goalOf = (pattern: unknown) =>
          useIn
            ? ["in", pattern, ["quote", tuples]]
            : ["=", pattern, ["quote", tuples[0] ?? []]];
        const program = (pattern: unknown) =>
          inRule
            ? [
                "begin",
                ["relation", "r", names.map((n) => n.slice(1))],
                ["rule", ["r", ...names], goalOf(pattern)],
                ["find", ["array/make", ...names], ["r", ...names]],
              ]
            : ["find", ["array/make", ...names], goalOf(pattern)];
        const bare = yield* run(program(names), stdlib).pipe(
          Effect.map(() => undefined),
          Effect.catch((error) => Effect.succeed(String(error)))
        );
        const written = `["array/make",${names.map((n) => JSON.stringify(n)).join(",")}]`;
        expect(bare).toContain(`calls "${names[0]}"`);
        expect(bare).toContain(written);
        const found = (yield* run(
          program(JSON.parse(written)),
          stdlib
        )) as unknown[][];
        const expected = useIn
          ? tuples
          : [tuples[0]].filter((t) => t !== undefined && t.length === width);
        const key = (rowsOf: readonly unknown[][]) =>
          [...new Set(rowsOf.map((r) => JSON.stringify(r)))].sort();
        expect(key(found)).toStrictEqual(key(expected as unknown[][]));
      })
  );
});

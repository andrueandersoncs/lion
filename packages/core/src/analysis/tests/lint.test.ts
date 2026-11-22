/**
 * The lint of a program read as data finds a list written as a bare array
 * where running the program finds it: it warns of a program exactly when
 * running it is refused with the note that the array is a call, and of no
 * other, whether the list stands in a find or a rule, in `in` or `=`, and
 * whether a goal before it binds its first variable but not the rest.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { factsOf, lint } from "@/analysis/lint";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";

const boolean = Arbitrary.schema(Schema.Boolean);
const width = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 2, maximum: 3 }))
);
const NAMES = ["?a", "?b", "?c"];
const NOTE = "since an array is always a call";

describe("the lint of a list written as a call", () => {
  it.effect.prop(
    "warns of a program exactly when running it is refused with the note that the array is a call",
    {
      bare: boolean,
      bindAll: boolean,
      bindFirst: boolean,
      inRule: boolean,
      outside: boolean,
      useIn: boolean,
      wide: width,
    },
    ({ bare, bindAll, bindFirst, inRule, outside, useIn, wide }) =>
      Effect.gen(function* () {
        const names = NAMES.slice(0, wide);
        const pattern = bare ? names : ["array/make", ...names];
        const tuple = names.map((_, at) => at + 1);
        const goal = useIn
          ? ["in", pattern, ["quote", [tuple]]]
          : ["=", pattern, ["quote", tuple]];
        let bound: string[] = [];
        if (bindAll) {
          bound = names;
        } else if (bindFirst) {
          bound = names.slice(0, 1);
        }
        const goals = [...bound.map((name) => ["n", name]), goal];
        const declare = [
          ["relation", "n", ["x"]],
          ["fact", ["n", 1]],
        ];
        // Outside a rule, a find, or a query the array is plain code, a
        // call of a logic variable that waits, and no goal at all.
        const plain = [
          "begin",
          ...declare,
          ["define", "later", ["lambda", [], pattern]],
          1,
        ];
        const inLogic = inRule
          ? [
              "begin",
              ...declare,
              ["relation", "r", names.map((n) => n.slice(1))],
              ["rule", ["r", ...names], ...goals],
              ["find", ["array/make", ...names], ["r", ...names]],
            ]
          : [
              "begin",
              ...declare,
              ["find", ["array/make", ...names], ["and", ...goals]],
            ];
        const program = outside ? plain : inLogic;
        const linted = yield* lint(program);
        const failed = yield* run(program, stdlib).pipe(
          Effect.map(() => ""),
          Effect.catch((error) => Effect.succeed(String(error)))
        );
        expect(linted.length > 0).toBe(failed.includes(NOTE));
        // A list whose variables goals before it bind all is a call that
        // runs, which the lint leaves to plain code; one with a variable
        // left that nothing binds cannot run.
        expect(linted.length > 0).toBe(bare && !bindAll && !outside);
        for (const each of linted) {
          expect(each.warning).toContain(NOTE);
          expect(each.warning).toContain(
            `["array/make",${names.map((n) => JSON.stringify(n)).join(",")}]`
          );
        }
      })
  );

  it.prop(
    "reads a program as one term for each value it holds, each named by its JSON pointer once",
    {
      program: Arbitrary.schema(
        Schema.Array(
          Schema.Union([
            Schema.String,
            Schema.Number,
            Schema.Array(Schema.String),
          ])
        )
      ),
    },
    ({ program }) => {
      const terms = factsOf(program).filter(
        ([relation]) => relation === "term"
      );
      const count = (value: unknown): number =>
        Array.isArray(value) ? 1 + value.reduce((n, v) => n + count(v), 0) : 1;
      expect(terms.length).toBe(count(program));
      expect(new Set(terms.map(([, at]) => at)).size).toBe(terms.length);
    }
  );
});

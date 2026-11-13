/**
 * A fact holds JSON data. An argument that is anything else is refused, and
 * the message says which column it is for and what it is. A bare string
 * that is a name is the usual cause: it evaluates to the relation, schema,
 * function, or logic variable it names. The message then says how to write
 * the string itself, and the form it suggests is accepted and stores the
 * string. `fact`, `retract`, and `why` refuse in the same words.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";

const OPTIONS = { timeout: 120_000, arbitrary: { runs: 300 } };

const integer = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

const element = <A>(items: readonly A[]) =>
  Arbitrary.map(integer(0, items.length - 1), (at) => items[at] as A);

const FUNCTIONS = Object.keys(stdlib).filter(
  (key) => typeof (stdlib as Record<string, unknown>)[key] === "function"
);

const word = Arbitrary.schema(
  Schema.String.check(Schema.isPattern(/^[a-z]{1,6}$/))
);

/** What a bare string can name, with a name of that kind. */
const named = Arbitrary.flatMap(integer(0, 3), (pick) =>
  Arbitrary.map(
    Arbitrary.all([word, element(FUNCTIONS)]),
    ([letters, fn]): readonly [kind: string, name: string] =>
      (
        [
          ["relation", `rel-${letters}`],
          ["schema", `Schema-${letters}`],
          ["function", fn],
          ["logic variable", `?${letters}`],
        ] as const
      )[pick] as readonly [string, string]
  )
);

/** The columns of a relation, with the one that gets the stray argument. */
const columns = Arbitrary.flatMap(
  Arbitrary.filter(
    Arbitrary.array(word, { minLength: 1, maxLength: 4 }),
    (names) => new Set(names).size === names.length
  ),
  (names) =>
    Arbitrary.map(
      integer(0, names.length - 1),
      (at) => [names.map((each) => `col-${each}`), at] as const
    )
);

const FORMS = ["fact", "retract", "why"] as const;

/** Declares the relation that takes the facts, and what the name names. */
const declare = (
  cols: readonly string[],
  [kind, name]: readonly [string, string]
) => [
  ["relation", "note", cols],
  ...(kind === "relation" ? [["relation", name, ["id", "title"]]] : []),
  ...(kind === "schema" ? [["schema", name, "value/string?"]] : []),
];

/** The message a program fails with; null when it runs. */
const failure = (program: unknown) =>
  run(program, stdlib).pipe(
    Effect.as<string | null>(null),
    Effect.catch((error) =>
      Effect.succeed(String((error as { message?: unknown }).message))
    )
  );

describe("a fact holds only JSON data", () => {
  it.effect.prop(
    "a string that is a name is refused, and the form the message suggests is the string",
    {
      shape: columns,
      what: named,
      form: element(FORMS),
      rest: Arbitrary.array(integer(-9, 9), { minLength: 4, maxLength: 4 }),
    },
    ({ shape: [cols, at], what, form, rest }) =>
      Effect.gen(function* () {
        const [kind, name] = what;
        const args = (stray: unknown) =>
          cols.map((_, index) => (index === at ? stray : rest[index]));
        const written = ["note", ...args(name)];
        expect(
          yield* failure(["begin", ...declare(cols, what), [form, written]])
        ).toBe(
          `Facts may only contain JSON data, but the "${cols[at]}" of ${JSON.stringify(written)} is the ${kind} "${name}". To mean the string itself, write ["quote", "${name}"].`
        );
        // The fact as the message says to write it holds the string.
        const variables = cols.map((_, index) => `?v${index}`);
        expect(
          yield* run(
            [
              "begin",
              ...declare(cols, what),
              ["fact", ["note", ...args(["quote", name])]],
              ["find", ["array/make", ...variables], ["note", ...variables]],
            ],
            stdlib
          )
        ).toEqual([args(name)]);
      }),
    OPTIONS
  );

  it.effect.prop(
    "any other argument that is not data is refused with what it is",
    {
      shape: columns,
      pick: integer(0, 2),
      form: element(FORMS),
      rest: Arbitrary.array(integer(-9, 9), { minLength: 4, maxLength: 4 }),
    },
    ({ shape: [cols, at], pick, form, rest }) =>
      Effect.gen(function* () {
        const [stray, why] = (
          [
            [["lambda", ["x"], "x"], "is not JSON data"],
            [["number/add", "?x", 1], "waits for a logic variable"],
            [["array/make", "number/add", 1], "is not JSON data"],
          ] as const
        )[pick] as readonly [unknown, string];
        const written = [
          "note",
          ...cols.map((_, index) => (index === at ? stray : rest[index])),
        ];
        expect(
          yield* failure(["begin", ["relation", "note", cols], [form, written]])
        ).toBe(
          `Facts may only contain JSON data, but the "${cols[at]}" of ${JSON.stringify(written)} is ${JSON.stringify(stray)}, which ${why}.`
        );
      }),
    OPTIONS
  );
});

/**
 * What a string means is settled by the scopes it is written in: a string a
 * scope around it declares is a name, and any other is data, whatever is
 * bound later. A body declares the names it defines from its start, a
 * binding of a special form's name makes the form a call where it is in
 * scope, an array that names a form but has another shape says what the
 * form takes, and a condition is true or false, as a filter is.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";
import {
  fitsForm,
  SPECIAL_FORM_NAMES,
  type SpecialFormName,
  USAGE,
} from "@/schemas/evaluation";

const OPTIONS = { arbitrary: { runs: 200 } };

const NOT_TRUTH =
  /^A condition must be true or false, but \["quote",.* is .*\.$/;

/** A plain word nothing in the standard library or these programs binds. */
const word = Arbitrary.filter(
  Arbitrary.schema(Schema.String.check(Schema.isPattern(/^[a-z]{1,7}$/))),
  (name) =>
    !(
      Object.hasOwn(stdlib, name) ||
      (SPECIAL_FORM_NAMES as readonly string[]).includes(name) ||
      ["f", "a", "else"].includes(name)
    )
);

const int = Arbitrary.schema(Schema.Int);

/** A JSON value: what a condition or a filter could give. */
const json: Arbitrary.Arbitrary<unknown> = Arbitrary.schema(
  Schema.Union([
    Schema.Boolean,
    Schema.Int,
    Schema.String,
    Schema.Null,
    Schema.Array(Schema.Int),
    Schema.Record(
      Schema.String.check(Schema.isPattern(/^[a-z]{0,3}$/)),
      Schema.Int
    ),
  ])
);

const form = Arbitrary.schema(Schema.Literals(SPECIAL_FORM_NAMES));

const outcome = (program: unknown) =>
  Effect.map(Effect.result(run(program, stdlib)), (result) =>
    result._tag === "Success"
      ? { value: result.success as unknown }
      : {
          error: (result.failure as { _tag: string })._tag,
          message: (result.failure as Error).message,
        }
  );

describe("what a string means", () => {
  it.effect.prop(
    "is settled where it is written: a name bound later by eval does not change code compiled before",
    { name: word, value: int },
    ({ name, value }) =>
      Effect.gen(function* () {
        const program = [
          "begin",
          ["define", "f", ["lambda", [], name]],
          ["define", "a", ["f"]],
          ["eval", ["quote", ["define", name, value]]],
          ["array/make", "a", ["f"], ["eval", ["quote", name]]],
        ];
        // Code compiled after the binding, as eval's is, sees it.
        expect(yield* run(program, stdlib)).toEqual([name, name, value]);
      }),
    OPTIONS
  );

  it.effect.prop(
    "is a body's definition from the start of the body, so reading it before its define fails",
    { name: word, value: int, inLambda: Arbitrary.schema(Schema.Boolean) },
    ({ name, value, inLambda }) =>
      Effect.gen(function* () {
        const wrap = (body: unknown) =>
          inLambda ? [["lambda", [], body]] : body;
        const later = wrap([
          "begin",
          ["define", "f", ["lambda", [], name]],
          ["define", name, value],
          ["f"],
        ]);
        expect(yield* run(later, stdlib)).toBe(value);
        const early = wrap([
          "begin",
          ["define", "a", name],
          ["define", name, value],
        ]);
        expect(yield* outcome(early)).toMatchObject({
          error: "UndefinedYetError",
        });
        // Outside the body, the string is data again.
        expect(
          yield* run(["array/make", [["lambda", [], later]], name], stdlib)
        ).toEqual([value, name]);
      }),
    OPTIONS
  );

  it.effect.prop(
    "is a call where a binding of a special form's name is in scope, and the form everywhere else",
    { name: form, value: int },
    ({ name, value }) =>
      Effect.gen(function* () {
        const shadowed = [["lambda", [name], [name, value]], "value/identity"];
        expect(yield* run(shadowed, stdlib)).toBe(value);
        // The same array outside the scope is the form, as it was.
        const outside = yield* outcome([name, value]);
        const asForm = yield* outcome([
          "begin",
          [["lambda", [name], name], 0],
          [name, value],
        ]);
        expect(asForm).toEqual(outside);
      }),
    OPTIONS
  );
});

describe("set!", () => {
  it.effect.prop(
    "changes only a name a scope declares, and fails on any other, changing nothing",
    { name: word, value: int },
    ({ name, value }) =>
      Effect.gen(function* () {
        const failed = yield* outcome([
          "array/make",
          [["lambda", [], ["set!", name, value]]],
          name,
        ]);
        expect(failed).toMatchObject({ error: "UnboundNameError" });
        expect(
          yield* run(
            ["begin", ["define", name, 0], ["set!", name, value], name],
            stdlib
          )
        ).toBe(value);
      }),
    OPTIONS
  );
});

describe("an array that names a special form", () => {
  it.effect.prop(
    "fails with what the form takes when it does not have the form's shape",
    {
      name: form,
      args: Arbitrary.array(json, { maxLength: 4 }),
    },
    ({ name, args }) =>
      Effect.gen(function* () {
        const expression = [name, ...args.map((arg) => ["quote", arg])];
        if (fitsForm(name as SpecialFormName, expression)) {
          return;
        }
        expect(yield* outcome(expression)).toEqual({
          error: "MalformedFormError",
          message: `${JSON.stringify(expression)} is not a well-formed ${name} form: ${USAGE[name as SpecialFormName]}`,
        });
      }),
    OPTIONS
  );
});

describe("a condition", () => {
  it.effect.prop(
    "is true or false, as a filter is: cond fails on exactly the values a filter fails on",
    { value: json },
    ({ value }) =>
      Effect.gen(function* () {
        const quoted = ["quote", value];
        const chosen = yield* outcome(["cond", [quoted, 1], ["else", 2]]);
        const filtered = yield* outcome([
          "query",
          ["and", ["=", "?v", quoted], "?v"],
        ]);
        expect("error" in chosen).toBe("error" in filtered);
        if (typeof value === "boolean") {
          expect(chosen).toEqual({ value: value ? 1 : 2 });
        } else {
          expect(chosen).toMatchObject({
            error: "LogicError",
            message: expect.stringMatching(NOT_TRUTH),
          });
        }
      }),
    OPTIONS
  );
});

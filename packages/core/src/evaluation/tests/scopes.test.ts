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
import { LogicDatabase } from "@/logic/database";
import { loadDatabase, saveDatabase } from "@/logic/snapshot";
import { element, oneOf } from "@/logic/tests/programs";
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
    "is the same in every logic form as in plain code, also when eval binds it while the program runs, and after a snapshot",
    {
      name: Arbitrary.filter(
        word,
        (name) => !["out", "n", "y", "z", "k"].includes(name)
      ),
      value: int,
      declared: Arbitrary.schema(Schema.Boolean),
      shape: Arbitrary.schema(
        Schema.Literals(["name", "list", "call", "record", "cond"])
      ),
      where: Arbitrary.schema(
        Schema.Literals([
          "find",
          "rule",
          "waiting rule",
          "fact",
          "assuming",
          "lambda",
          "query",
        ])
      ),
    },
    ({ declared, name, shape, value, where }) =>
      Effect.gen(function* () {
        const expression = {
          name,
          list: ["array/make", name, 1],
          call: [["lambda", [], name]],
          record: { k: name },
          cond: ["cond", [true, name], ["else", 0]],
        }[shape];
        const answers = ["find", "?z", ["out", "?z"]];
        const logic = {
          find: ["find", "?z", ["=", "?z", expression]],
          rule: [
            "begin",
            ["rule", ["out", "?z"], ["=", "?z", expression]],
            answers,
          ],
          // A cond that waits for ?y is held by the rule, closed over the
          // names it reads.
          "waiting rule": [
            "begin",
            [
              "rule",
              ["out", "?z"],
              ["n", "?y"],
              [
                "=",
                "?z",
                [
                  "cond",
                  [["number/equals?", "?y", 1], expression],
                  ["else", 0],
                ],
              ],
            ],
            answers,
          ],
          fact: ["begin", ["fact", ["out", expression]], answers],
          assuming: ["assuming", ["fact", ["out", expression]], answers],
          lambda: [["lambda", [], ["find", "?z", ["=", "?z", expression]]]],
          query: ["query", ["=", "?z", expression]],
        }[where];
        const database = new LogicDatabase();
        const program = [
          "begin",
          ...(declared ? [["define", name, 0]] : []),
          ["relation", "out", ["z"]],
          ["relation", "n", ["y"]],
          ["fact", ["n", 1]],
          // Code eval runs is compiled as it runs, so this binds the name
          // after everything else was compiled.
          ["eval", ["quote", ["define", name, value]]],
          ["array/make", expression, logic],
        ];
        const [plain, given] = (yield* run(program, stdlib, {
          database,
        })) as [unknown, unknown];
        expect(given).toEqual(where === "query" ? [{ z: plain }] : [plain]);
        // A snapshot writes what the rules hold, and loads into the same
        // answers wherever it is loaded.
        const loaded = yield* loadDatabase(
          yield* saveDatabase(database),
          stdlib
        );
        if (where === "rule" || where === "waiting rule") {
          expect(yield* run(answers, stdlib, { database: loaded })).toEqual([
            plain,
          ]);
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "at the head of a call is a name, never data: one no scope declares is looked up where the call runs, in plain code and in logic forms alike",
    {
      name: Arbitrary.filter(
        word,
        (name) => !["out", "n", "y", "z", "k"].includes(name)
      ),
      value: int,
      kind: Arbitrary.schema(Schema.Literals(["relation", "function"])),
      where: Arbitrary.schema(
        Schema.Literals(["plain", "find", "rule", "fact", "lambda"])
      ),
    },
    ({ kind, name, value, where }) =>
      Effect.gen(function* () {
        // Code eval runs binds the name after the program was compiled.
        const binds =
          kind === "relation"
            ? ["begin", ["relation", name, ["v"]], ["fact", [name, value]]]
            : ["define", name, ["lambda", ["v"], ["number/add", "v", 1]]];
        const called = kind === "relation" ? [name, "?v"] : [name, value];
        const expected = kind === "relation" ? [value] : [value + 1];
        const use = {
          plain:
            kind === "relation"
              ? ["find", "?v", called]
              : ["array/make", called],
          find:
            kind === "relation"
              ? ["find", "?v", called]
              : ["find", "?v", ["=", "?v", called]],
          rule: [
            "begin",
            [
              "rule",
              ["out", "?v"],
              kind === "relation" ? called : ["=", "?v", called],
            ],
            ["find", "?v", ["out", "?v"]],
          ],
          fact:
            kind === "relation"
              ? ["begin", ["fact", [name, value + 1]], ["find", "?v", called]]
              : [
                  "begin",
                  ["fact", ["out", called]],
                  ["find", "?v", ["out", "?v"]],
                ],
          lambda: [
            [
              "lambda",
              [],
              kind === "relation"
                ? ["find", "?v", called]
                : ["array/make", called],
            ],
          ],
        }[where];
        const want =
          where === "fact" && kind === "relation"
            ? [value, value + 1].sort((a, b) => a - b)
            : expected;
        const result = yield* run(
          [
            "begin",
            ["relation", "out", ["v"]],
            ["eval", ["quote", binds]],
            // Anywhere else the string is data, as it was when compiled.
            ["array/make", use, name],
          ],
          stdlib
        );
        expect(result).toEqual([want, name]);
      }),
    OPTIONS
  );

  it.effect.prop(
    "in code eval runs is what it is in the same code run as a program: the code declares what it defines and the relations it declares",
    {
      first: word,
      second: word,
      value: int,
      order: Arbitrary.schema(Schema.Literals(["use first", "define first"])),
      inLambda: Arbitrary.schema(Schema.Boolean),
    },
    ({ first, inLambda, order, second, value }) =>
      Effect.gen(function* () {
        const definitions = [
          ["define", first, ["lambda", [], second]],
          ["define", second, value],
          ["relation", "out", ["z"]],
          ["fact", ["out", second]],
        ];
        const uses = ["array/make", [first], ["find", "?z", ["out", "?z"]]];
        const code = [
          "begin",
          ...(order === "use first"
            ? [["define", "early", [first]], ...definitions]
            : definitions),
          uses,
        ];
        const wrap = (body: unknown) =>
          inLambda ? [["lambda", [], body]] : body;
        expect(yield* outcome(wrap(["eval", ["quote", code]]))).toEqual(
          yield* outcome(wrap(code))
        );
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
    "is a body's definition also where the body uses the form of that name, which then fails and says why",
    { name: form, value: int, inLambda: Arbitrary.schema(Schema.Boolean) },
    ({ inLambda, name, value }) =>
      Effect.gen(function* () {
        const wrap = (body: unknown) =>
          inLambda ? [["lambda", [], body]] : body;
        const uses = [
          ["begin", [name, value], ["define", name, value]],
          ["begin", ["define", name, value]],
        ];
        for (const body of name === "define" ? uses : uses.slice(0, 1)) {
          const failed = yield* outcome(wrap(body));
          expect(failed).toMatchObject({ error: "UndefinedYetError" });
          expect((failed as { message: string }).message).toContain(
            `calls that definition, which has no value yet, instead of being the ${name} form`
          );
        }
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

  it.effect.prop(
    "is refused in retract and assuming, which hold a rule or invariant form, as the form itself is refused",
    {
      name: Arbitrary.schema(Schema.Literals(["rule", "invariant"])),
      args: Arbitrary.array(
        oneOf<unknown>(
          Arbitrary.map(json, (value) => ["quote", value]),
          element<unknown>([
            "?x",
            "n",
            ["n", "?x"],
            ["n", 1],
            ["number/add", "?x", 1],
            { assert: "none" },
          ])
        ),
        { maxLength: 3 }
      ),
    },
    ({ args, name }) =>
      Effect.gen(function* () {
        const held = [name, ...args];
        const within = (expression: unknown) => [
          "begin",
          ["relation", "n", ["x"]],
          expression,
        ];
        const made = yield* outcome(within(held));
        if (!("error" in made)) {
          return;
        }
        expect(yield* outcome(within(["retract", held]))).toEqual(made);
        expect(
          yield* outcome(within(["assuming", ["retract", held], true]))
        ).toEqual(made);
        if (name === "rule") {
          expect(yield* outcome(within(["assuming", held, true]))).toEqual(
            made
          );
        }
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

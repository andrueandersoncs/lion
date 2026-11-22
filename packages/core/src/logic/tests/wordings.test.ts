/**
 * One rule, one wording. Where a rule is broken in several places, in plain
 * code and in a rule or query, by a relation and by a schema, by a fact and
 * by a rule, the message says it in the same words, and names what each
 * place has: the expression, the value, the column, the relation.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { LogicDatabase } from "@/logic/database";
import { unlisted } from "@/logic/listing";
import { Shapeless, shapeOf } from "@/logic/symbols";
import { stdlib } from "@/modules";
import { USAGE } from "@/schemas/evaluation";
import { element, oneOf } from "./programs";

const small = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: -9, maximum: 9 }))
);
const letters = Arbitrary.schema(
  Schema.String.check(Schema.isPattern(/^[a-z]{1,4}$/))
);
const choice = Arbitrary.schema(Schema.Boolean);

/** A value that is not a list: a number, a string, true or false, null, or a record. */
const notAList: Arbitrary.Arbitrary<unknown> = oneOf<unknown>(
  small,
  letters,
  choice,
  element([null]),
  Arbitrary.map(small, (n) => ({ n }))
);

/** What `show` writes of a value: the JSON text a message holds. */
const shown = (value: unknown) => JSON.stringify(value);

const failure = (program: unknown) =>
  run(program, stdlib, { database: new LogicDatabase() }).pipe(
    Effect.map((value) => `gave ${shown(value)}`),
    Effect.catch((error) =>
      Effect.succeed(String((error as { message?: unknown }).message))
    )
  );

/** A message with the words that name one place's own expression set aside. */
const naming = (message: string, own: string) => message.split(own).join("E");

describe("one wording for one rule", () => {
  it.effect.prop(
    "in over a value that is not a list says the same in plain code, in a query, and in a rule, naming the expression and the value",
    { value: notAList },
    ({ value }) =>
      Effect.gen(function* () {
        const plain = yield* failure([
          "begin",
          ["define", "xs", ["quote", value]],
          ["in", 1, "xs"],
        ]);
        const query = yield* failure([
          "query",
          ["and", ["=", "?xs", ["quote", value]], ["in", 1, "?xs"]],
        ]);
        const rule = yield* failure([
          "begin",
          ["relation", "r", ["x"]],
          [
            "rule",
            ["r", "?x"],
            ["=", "?xs", ["quote", value]],
            ["in", "?x", "?xs"],
          ],
          ["query", ["r", "?x"]],
        ]);
        const expected = `"in" expects a list, but E is ${shown(value)}.`;
        expect(naming(plain, '"xs"')).toBe(expected);
        expect(naming(query, '"?xs"')).toBe(expected);
        expect(naming(rule, '"?xs"')).toBe(expected);
      })
  );

  it.effect.prop(
    "a value that is not a function says in a rule what a match case says in plain code, and names the call that waited for it",
    { value: notAList },
    ({ value }) =>
      Effect.gen(function* () {
        const plain = yield* failure([
          "begin",
          ["define", "f", ["quote", value]],
          ["match", 1, ["value/number?", "f"]],
        ]);
        const inRule = yield* failure([
          "query",
          ["and", ["=", "?f", ["quote", value]], ["=", "?y", ["?f", 1]]],
        ]);
        expect(plain).toBe(
          `${shown(value)} is not a function, so it cannot be called.`
        );
        // The call is written as an expression that gives it, so a record
        // in it is quoted.
        expect(inRule.startsWith(`${plain.slice(0, -1)} in [`)).toBe(true);
        expect(inRule.endsWith(",1].")).toBe(true);
      })
  );

  it.effect.prop(
    "a find, a rule, and a query that give something other than data say so in the same words, with what they gave",
    { fn: element(["number/add", "string/concat", "array/make"]) },
    ({ fn }) =>
      Effect.gen(function* () {
        const find = ["find", "?f", ["=", "?f", fn]];
        const rule = ["rule", ["r", "?f"], ["=", "?f", fn]];
        const messages = [
          [yield* failure(find), shown(find)],
          [
            yield* failure([
              "begin",
              ["relation", "r", ["f"]],
              rule,
              ["query", ["r", "?x"]],
            ]),
            `Rule ${shown(rule)}`,
          ],
          [yield* failure(["query", ["=", "?f", fn]]), "The query"],
        ] as const;
        for (const [message, who] of messages) {
          expect(
            message.startsWith(`${who} produced a value that is not data: `)
          ).toBe(true);
          expect(message).toContain(fn);
        }
      })
  );

  it.effect.prop(
    "a name declared as a relation and as a schema says which it is, in either order",
    { given: letters, relationFirst: choice },
    ({ given, relationFirst }) =>
      Effect.gen(function* () {
        // A name with a prefix is never a special form's.
        const name = `my${given}`;
        const relation = ["relation", name, ["a"]];
        const schema = ["schema", name, "value/number?"];
        const message = yield* failure(
          relationFirst
            ? ["begin", relation, schema]
            : ["begin", schema, relation]
        );
        const [first, second] = relationFirst
          ? ["relation", "schema"]
          : ["schema", "relation"];
        expect(message).toBe(
          `"${name}" is a ${first} here, so it cannot also name a ${second}.`
        );
      })
  );

  it.effect.prop(
    "a relation and a schema declared again differently say so in the same words, with what was declared",
    {
      columns: Arbitrary.array(letters, { maxLength: 3, minLength: 1 }),
      name: letters,
    },
    ({ columns, name }) =>
      Effect.gen(function* () {
        const distinct = [...new Set(columns)];
        const relation = yield* failure([
          "begin",
          ["relation", name, distinct],
          ["relation", name, [...distinct, "zzzzz"]],
        ]);
        const schema = yield* failure([
          "begin",
          ["schema", "S", "value/number?"],
          ["schema", "S", "value/string?"],
        ]);
        expect(relation).toBe(
          `Relation "${name}" is already declared with columns ${shown(distinct)}.`
        );
        expect(schema).toBe(
          'Schema "S" is already declared with the shape "value/number?".'
        );
      })
  );

  it.effect.prop(
    "columns that repeat a name, and a key that does, name the first column repeated, in one wording",
    {
      inKey: choice,
      names: Arbitrary.array(element(["a", "b", "c", "d"]), {
        maxLength: 5,
        minLength: 2,
      }),
    },
    ({ inKey, names }) =>
      Effect.gen(function* () {
        const seen = new Set<string>();
        let repeated: string | undefined;
        for (const name of names) {
          if (seen.has(name) && repeated === undefined) {
            repeated = name;
          }
          seen.add(name);
        }
        const message = yield* failure(
          inKey
            ? ["relation", "r", [...seen], { key: names }]
            : ["relation", "r", names]
        );
        if (repeated === undefined) {
          expect(message).not.toContain("repeats");
          return;
        }
        expect(message).toBe(
          `Relation "r" repeats the column "${repeated}"${inKey ? " in its key" : ""}.`
        );
      }),
    { arbitrary: { runs: 200 } }
  );

  it.effect.prop(
    "a key and a merge that name a column the relation lacks say so in one wording, with its columns",
    { inKey: choice, missing: element(["x", "y"]) },
    ({ inKey, missing }) =>
      Effect.gen(function* () {
        const options = inKey
          ? { key: [missing] }
          : { key: ["a"], merge: { [missing]: "aggregate/min" } };
        const message = yield* failure(["relation", "r", ["a", "b"], options]);
        expect(message).toBe(
          `Relation "r" has no column "${missing}" for its ${inKey ? "key" : "merge"}. Its columns are ["a","b"].`
        );
      })
  );

  it.effect.prop(
    "a fact and a rule for a relation a graph algorithm computes are told the same thing",
    { byRule: choice, node: letters },
    ({ byRule, node }) =>
      Effect.gen(function* () {
        const road = ["relation", "road", ["from", "to", "km"]];
        const message = yield* failure(
          byRule
            ? [
                "begin",
                road,
                [
                  "rule",
                  ["graph/pageRank", "road", "?n", 1],
                  ["road", "?n", "?_", "?_"],
                ],
              ]
            : ["begin", road, ["fact", ["graph/pageRank", "road", node, 1]]]
        );
        expect(message).toBe(
          `["graph/pageRank","road"] is computed from its inputs, so ${byRule ? "a rule" : "a fact"} cannot add to it.`
        );
      })
  );

  it.effect.prop(
    "a rule that invents a value for a relation that aggregates is told the same thing, whether it aggregates itself or another rule does",
    {
      aggregate: element(["aggregate/count", "aggregate/sum", "aggregate/max"]),
      itself: choice,
    },
    ({ aggregate, itself }) =>
      Effect.gen(function* () {
        const declared = [
          ["relation", "c", ["k", "n"]],
          ["relation", "p", ["k"]],
        ];
        const message = yield* failure(
          itself
            ? [
                "begin",
                ...declared,
                [
                  "rule",
                  ["exists", ["?m"], ["c", "?m", [aggregate, "?k"]]],
                  ["p", "?k"],
                ],
              ]
            : [
                "begin",
                ...declared,
                ["rule", ["c", "?k", [aggregate, "?k"]], ["p", "?k"]],
                ["rule", ["exists", ["?m"], ["c", "?k", "?m"]], ["p", "?k"]],
              ]
        );
        expect(message).toContain(
          'invents a value for "c", whose rules aggregate. A rule that invents values cannot give a row of a relation that aggregates.'
        );
      })
  );

  it.effect.prop(
    "a goal that gives neither true nor false says in a query and in a rule what a condition of cond says in plain code",
    {
      call: element([
        ["number/add", "?n", 0],
        ["number/multiply", "?n", 2],
        ["array/make", "?n"],
      ]),
      n: small,
    },
    ({ call, n }) =>
      Effect.gen(function* () {
        const given = call.map((part) => (part === "?n" ? n : part));
        const plain = yield* failure(["cond", [given, 1], ["else", 2]]);
        const query = yield* failure(["query", ["and", ["=", "?n", n], call]]);
        const rule = yield* failure([
          "begin",
          ["relation", "r", ["n"]],
          ["rule", ["r", "?n"], ["=", "?n", n], call],
          ["query", ["r", "?n"]],
        ]);
        expect(
          plain.startsWith("A condition must be true or false, but ")
        ).toBe(true);
        expect(plain).toContain(shown(given));
        expect(query).toBe(plain);
        expect(rule).toBe(plain);
      })
  );

  it.effect.prop(
    "exists in a rule head and some in a goal, given an expression that computes with the variable they own, say so in the same words",
    {
      fn: element([
        ["string/concat", "?m", "!"],
        ["number/add", "?m", 1],
      ]),
      inRecord: choice,
    },
    ({ fn, inRecord }) =>
      Effect.gen(function* () {
        const arg = inRecord ? { a: fn } : fn;
        const goal = ["m", "?c", arg];
        const declared = ["relation", "m", ["c", "m"]];
        const head = ["exists", ["?m"], goal];
        const exists = yield* failure([
          "begin",
          declared,
          ["relation", "p", ["n"]],
          ["rule", head, ["p", "?c"]],
        ]);
        const some = yield* failure([
          "begin",
          declared,
          ["query", ["some", "?m", goal]],
        ]);
        const said = (message: string, who: string, form: string) =>
          message.startsWith(`${who} computes with`)
            ? naming(message.slice(who.length), `"${form}"`)
            : message;
        const rest = said(exists, `Rule head ${shown(head)}`, "exists");
        expect(said(some, shown(arg), "some")).toBe(rest);
        expect(rest.startsWith(" computes with a variable that E owns.")).toBe(
          true
        );
      })
  );

  it.effect.prop(
    "exists and some, whose goal does not mention the variable they own, say so in the same words",
    {
      form: element(["exists", "some"] as const),
      owned: element(["?q", "?w"]),
    },
    ({ form, owned }) =>
      Effect.gen(function* () {
        const goal = ["m", "a", "?r"];
        const message = yield* failure([
          "begin",
          ["relation", "m", ["c", "m"]],
          form === "exists"
            ? ["fact", ["exists", [owned], goal]]
            : ["some", owned, goal],
        ]);
        expect(message).toBe(
          `${form} owns "${owned}", but its goal does not mention it: ${shown(goal)}.`
        );
      })
  );

  it.effect.prop(
    "a fact or retract form among the changes of assuming says what the form says on its own of what is no relation call",
    {
      at: element([0, 1, 2]),
      form: element(["fact", "retract"] as const),
      item: oneOf<unknown>(small, element([null, true])),
    },
    ({ at, form, item }) =>
      Effect.gen(function* () {
        const calls = [
          ["e", 1, 2],
          ["e", 2, 3],
        ];
        const change = [form, ...calls.slice(0, at), item, ...calls.slice(at)];
        const declared = ["relation", "e", ["a", "b"]];
        const alone = yield* failure(["begin", declared, change]);
        const assumed = yield* failure([
          "begin",
          declared,
          ["assuming", change, true],
        ]);
        expect(alone).toBe(
          `${form} expects relation calls, but found ${shown(item)}.`
        );
        expect(assumed).toBe(alone);
      })
  );

  it.effect.prop(
    "an assuming with no change or no expression is told as any form of the wrong shape is",
    {
      // A value that is no change fails the form's shape; a change with no
      // expression after it fails as assuming reads its parts.
      part: oneOf<unknown>(
        small,
        element([true, null]),
        Arbitrary.map(small, (n) => ["fact", ["e", n, n]])
      ),
    },
    ({ part }) =>
      Effect.gen(function* () {
        const message = yield* failure([
          "begin",
          ["relation", "e", ["a", "b"]],
          ["assuming", part],
        ]);
        expect(message).toBe(
          `${shown(["assuming", part])} is not a well-formed assuming form: ${USAGE.assuming}`
        );
      })
  );

  it.effect.prop(
    "a schema that cannot stand for its values gives a listing and the solver the same reason",
    {
      kind: element(["open", "arrayOf", "predicate", "itself"] as const),
      item: element(["value/integer?", "value/string?", "value/boolean?"]),
    },
    ({ item, kind }) =>
      Effect.gen(function* () {
        const written = {
          arrayOf: ["schema/arrayOf", item],
          itself: [
            "begin",
            ["schema", "T", ["schema/anyOf", null, { next: "T" }]],
            "T",
          ],
          open: ["schema/open", { a: item }],
          predicate: ["lambda", ["v"], ["value/integer?", "v"]],
        }[kind];
        const schema = yield* run(written, stdlib, {
          database: new LogicDatabase(),
        });
        const solver = shapeOf(schema, "x", new Map(), new Set());
        expect(solver).toBeInstanceOf(Shapeless);
        expect(unlisted(schema)).toContain(
          `and here ${(solver as Shapeless).why}.`
        );
      })
  );
});

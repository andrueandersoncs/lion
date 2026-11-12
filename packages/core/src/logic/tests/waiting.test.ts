import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { LogicDatabase } from "@/logic/database";
import { loadDatabase } from "@/logic/snapshot";
import {
  attempt,
  booleanOf,
  type Expression,
  environment,
  headOf,
  listOf,
  numberOf,
  substitute,
  substituteAll,
  values,
  WORLD_RULES,
} from "./expressions";
import { element, type Outcome } from "./programs";

const ANY = { saveable: false };
const SAVEABLE = { saveable: true };

const OPTIONS = { timeout: 120_000 };

/** What a snapshot cannot write: the prelude's lambda that calls itself. */
const UNWRITABLE = /triangle|func\/partial/;

/** Every value of `?x`, given to the expression by `in`. */
const each = (inputs: readonly number[]) => ["in", "?x", ["quote", inputs]];

/** The numbers as facts, and a relation for what a rule derives from them. */
const facts = (inputs: readonly number[]) => [
  ["relation", "n", ["x"]],
  ["relation", "out", ["x", "y"]],
  ["fact", ...inputs.map((input) => ["n", input])],
];

/** What the engine must answer: the model's rows, or any failure. */
const expectRows = (
  actual: Outcome,
  expected: Outcome,
  rows: (results: readonly unknown[]) => unknown
) => {
  if (expected.ok) {
    expect(actual).toEqual({
      ok: true,
      value: rows(expected.value as unknown[]),
    });
  } else {
    expect(actual.ok).toBe(false);
  }
};

const paired = (inputs: readonly number[]) => (results: readonly unknown[]) =>
  inputs.map((x, at) => ({ x, y: results[at] }));

const kept =
  (inputs: readonly number[], keep: boolean) => (results: readonly unknown[]) =>
    inputs.filter((_, at) => results[at] === keep).map((x) => ({ x }));

const expression = element(["number", "boolean", "list"] as const);

describe("an expression that mentions a logic variable", () => {
  it.effect.prop(
    "computes, for each answer, what it computes with the value in place of the variable",
    {
      number: numberOf(3, ANY),
      boolean: booleanOf(3, ANY),
      list: listOf(3, ANY),
      kind: expression,
      inputs: values,
    },
    ({ inputs, kind, ...expressions }) =>
      Effect.gen(function* () {
        const value = expressions[kind];
        const actual = yield* attempt([
          ["query", ["and", each(inputs), ["=", "?y", value]], { order: "x" }],
        ]);
        expectRows(actual, yield* substituteAll(value, inputs), paired(inputs));
      }),
    OPTIONS
  );

  it.effect.prop(
    "computes the same in a rule head, with and without goal-directed queries",
    { value: headOf(3, ANY), inputs: values },
    ({ inputs, value }) =>
      Effect.gen(function* () {
        const expected = yield* substituteAll(value, inputs);
        const program = [
          ...facts(inputs),
          ["rule", ["out", "?x", value], ["n", "?x"]],
        ];
        // A goal-directed query derives only what it asks about, so it
        // cannot fail on the other values.
        const first = yield* substituteAll(value, inputs.slice(0, 1));
        for (const goalDirected of [true, false]) {
          const database = new LogicDatabase({ goalDirected });
          const all = yield* attempt(
            [...program, ["query", ["out", "?x", "?y"], { order: "x" }]],
            database
          );
          expectRows(all, expected, paired(inputs));
          if (database.rules.length === WORLD_RULES) {
            // The rule was turned down when it was written: its expression
            // cannot run for any value, so the model fails for every one.
            expect(first.ok).toBe(false);
            continue;
          }
          const one = yield* attempt(
            [["query", ["out", inputs[0], "?y"]]],
            database
          );
          expectRows(one, goalDirected ? first : expected, ([y]) => [{ y }]);
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "is a filter that keeps the answers it is true for, and under not, the others",
    { filter: booleanOf(2, ANY), inputs: values },
    ({ filter, inputs }) =>
      Effect.gen(function* () {
        const expected = yield* substituteAll(filter, inputs);
        const ask = (goal: Expression) =>
          attempt([["query", ["and", each(inputs), goal], { order: "x" }]]);
        expectRows(yield* ask(filter), expected, kept(inputs, true));
        expectRows(yield* ask(["not", filter]), expected, kept(inputs, false));
      }),
    OPTIONS
  );

  it.effect.prop(
    "must be true or false to be a filter",
    { value: numberOf(2, ANY), inputs: values },
    ({ inputs, value }) =>
      Effect.gen(function* () {
        const model = yield* substituteAll(value, inputs);
        const actual = yield* attempt([
          ["query", ["and", each(inputs), ["number/add", value, "?x"]]],
        ]);
        expect(actual.ok).toBe(false);
        if (model.ok && !actual.ok) {
          expect(actual.message).toContain("A filter must be true or false");
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "feeds an aggregate one value per match",
    { value: numberOf(2, ANY), inputs: values },
    ({ inputs, value }) =>
      Effect.gen(function* () {
        const expected = yield* substituteAll(value, inputs);
        const actual = yield* attempt([
          ...facts(inputs),
          ["relation", "summary", ["total", "largest", "all"]],
          [
            "rule",
            [
              "summary",
              ["aggregate/sum", value],
              ["aggregate/max", value],
              ["aggregate/collect", value],
            ],
            ["n", "?x"],
          ],
          ["query", ["summary", "?total", "?largest", "?all"]],
        ]);
        expectRows(actual, expected, (results) => {
          const numbers = results as number[];
          return [
            {
              total: numbers.reduce((sum, item) => sum + item, 0),
              largest: Math.max(...numbers),
              all: [...numbers].sort((a, b) => a - b),
            },
          ];
        });
      }),
    OPTIONS
  );
});

describe("a rule that holds waiting forms", () => {
  it.effect.prop(
    "survives a snapshot that is loaded without the program's definitions",
    { value: headOf(3, ANY), filter: booleanOf(2, ANY), inputs: values },
    ({ filter, inputs, value }) =>
      Effect.gen(function* () {
        const query = ["query", ["out", "?x", "?y"], { order: "x" }];
        const database = new LogicDatabase();
        const original = yield* attempt(
          [
            ...facts(inputs),
            ["rule", ["out", "?x", value], ["n", "?x"], filter],
            query,
          ],
          database
        );
        const snapshot = yield* attempt([["snapshot"]], database);
        if (!snapshot.ok) {
          // Only a lambda that calls itself, or a function made while the
          // program ran, has no written form.
          expect(JSON.stringify([value, filter])).toMatch(UNWRITABLE);
          expect(snapshot.message).toContain(
            "is a function a snapshot cannot write"
          );
          return;
        }
        // The loading environment has no prelude: the saved rule stands alone.
        const loaded = yield* loadDatabase(snapshot.value, environment);
        const again = yield* attempt([query], loaded);
        expect(again.ok).toBe(original.ok);
        if (original.ok) {
          expect(again).toEqual(original);
        }
        expect(yield* attempt([["snapshot"]], loaded)).toEqual(snapshot);
      }),
    { ...OPTIONS, arbitrary: { runs: 300 } }
  );

  it.effect.prop(
    "is added once however often the program runs, so its matches count once",
    { value: numberOf(2, SAVEABLE), inputs: values, times: element([2, 3]) },
    ({ inputs, times, value }) =>
      Effect.gen(function* () {
        const expected = yield* substituteAll(value, inputs);
        const database = new LogicDatabase();
        const program = [
          ...facts(inputs),
          ["relation", "total", ["sum"]],
          ["rule", ["total", ["aggregate/sum", value]], ["n", "?x"]],
        ];
        for (let run = 0; run < times; run += 1) {
          yield* attempt(program, database);
        }
        expect(database.rules).toHaveLength(WORLD_RULES + 1);
        expectRows(
          yield* attempt([["query", ["total", "?sum"]]], database),
          expected,
          (results) => [
            { sum: (results as number[]).reduce((sum, item) => sum + item, 0) },
          ]
        );
      }),
    OPTIONS
  );

  it.effect.prop(
    "is the same rule under any name for its functions",
    { inputs: values, by: element([0, 1, 5]) },
    ({ by, inputs }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        const total = (add: Expression) => [
          "rule",
          ["total", ["aggregate/sum", [add, "?x", by]]],
          ["n", "?x"],
        ];
        const rows = yield* attempt(
          [
            ...facts(inputs),
            ["relation", "total", ["sum"]],
            total("number/add"),
            total("plus"),
            // The function arrives as an argument, under a third name.
            [["lambda", ["add"], total("add")], "number/add"],
            ["query", ["total", "?sum"]],
          ],
          database
        );
        expect(database.rules).toHaveLength(WORLD_RULES + 1);
        expect(rows).toEqual({
          ok: true,
          value: [{ sum: inputs.reduce((sum, x) => sum + x + by, 0) }],
        });
      }),
    OPTIONS
  );

  it.effect.prop(
    "explains each answer with checks that are true Lion and absences that are false",
    { filter: booleanOf(2, ANY), inputs: values },
    ({ filter, inputs }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        const model = yield* substituteAll(filter, inputs);
        const setup = yield* attempt(
          [
            ...facts(inputs),
            ["relation", "kept", ["x"]],
            ["relation", "dropped", ["x"]],
            ["rule", ["kept", "?x"], ["n", "?x"], filter],
            ["rule", ["dropped", "?x"], ["n", "?x"], ["not", filter]],
          ],
          database
        );
        expect(setup.ok).toBe(true);
        if (!model.ok) {
          return;
        }
        for (const [at, input] of inputs.entries()) {
          const relation = (model.value as boolean[])[at] ? "kept" : "dropped";
          const why = yield* attempt([["why", [relation, input]]], database);
          expect(why.ok).toBe(true);
          const { because } = (why as { value: { because: object[] } }).value;
          // A test that needs no variable runs before the relation goal.
          const tests = because.filter((premise) => !("fact" in premise));
          expect(because).toHaveLength(tests.length + 1);
          expect(because).toContainEqual({ fact: ["n", input], given: true });
          for (const premise of tests) {
            const [kind, goal] = Object.entries(premise)[0] ?? [];
            const holds = yield* substitute(goal, input);
            expect(holds).toEqual({ ok: true, value: kind === "check" });
          }
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "keeps the values its names had when it was written",
    { value: headOf(3, ANY), inputs: values, later: element([0, 7, -9]) },
    ({ inputs, later, value }) =>
      Effect.gen(function* () {
        // The model never sees the names change; the rule must not either.
        const expected = yield* substituteAll(value, inputs);
        const actual = yield* attempt([
          ...facts(inputs),
          ["rule", ["out", "?x", value], ["n", "?x"]],
          ["define", "bonus", later],
          ["define", "plus", "number/multiply"],
          ["define", "abs", ["lambda", ["v"], later]],
          ["define", "clamp", ["lambda", ["v", "low", "high"], later]],
          ["query", ["out", "?x", "?y"], { order: "x" }],
        ]);
        expectRows(actual, expected, paired(inputs));
      }),
    OPTIONS
  );
});

describe("an invariant that holds waiting forms", () => {
  it.effect.prop(
    "rejects exactly the facts its filter is true for",
    { filter: booleanOf(2, ANY), inputs: values },
    ({ filter, inputs }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        const setup = yield* attempt(
          [
            ["relation", "n", ["x"]],
            ["invariant", ["and", ["n", "?x"], filter], { assert: "none" }],
          ],
          database
        );
        expect(setup.ok).toBe(true);
        const held: number[] = [];
        for (const input of inputs) {
          const model = yield* substitute(filter, input);
          const added = yield* attempt([["fact", ["n", input]]], database);
          expect(added.ok).toBe(model.ok && model.value === false);
          if (added.ok) {
            held.push(input);
          }
          expect(
            yield* attempt([["query", ["n", "?x"], { order: "x" }]], database)
          ).toEqual({ ok: true, value: held.map((x) => ({ x })) });
        }
      }),
    OPTIONS
  );
});

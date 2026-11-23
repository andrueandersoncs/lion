/**
 * The analysis reads every string as the evaluator does: the names a scope
 * declares, logic variables, data, and the names nothing binds, by the same
 * scopes. It is checked against the evaluator, never against itself: a
 * program means the same after every binding the analysis finds is renamed
 * at every string it says means that binding, and every string it says is
 * data is quoted; a string means, when it runs, what the analysis says; and
 * every error the analysis flags is the error the run fails with.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import {
  analyze,
  flattenAnalysis,
  pathToPointer,
  type SemanticNode,
  type StructuralPath,
} from "@/analysis/analyze";
import { run } from "@/evaluation/evaluate";
import { LogicVariable } from "@/logic/terms";
import { element } from "@/logic/tests/programs";
import { stdlib } from "@/modules";
import { isSpecialFormName } from "@/schemas/evaluation";
import {
  BOUND,
  type Expression,
  FREE,
  type Outcome,
  outcome,
  program,
} from "./programs";

const OPTIONS = { arbitrary: { runs: 300 } };

/** Every node of a program's analysis, with the standard library bound. */
const nodesOf = (expression: Expression) =>
  flattenAnalysis(analyze(expression as never, stdlib));

/** The value at a path of a program. */
const at = (expression: Expression, path: StructuralPath): unknown =>
  path.reduce<unknown>(
    (value, segment) => (value as Record<string, unknown>)[segment],
    expression
  );

/** A copy of a program with the values at some pointers replaced. */
const replaced = (
  expression: Expression,
  by: ReadonlyMap<string, unknown>,
  path: StructuralPath = []
): unknown => {
  const pointer = pathToPointer(path);
  if (by.has(pointer)) {
    return by.get(pointer);
  }
  if (Array.isArray(expression)) {
    return expression.map((item, index) =>
      replaced(item, by, [...path, index])
    );
  }
  if (typeof expression === "object" && expression !== null) {
    return Object.fromEntries(
      Object.entries(expression).map(([key, item]) => [
        key,
        replaced(item, by, [...path, key]),
      ])
    );
  }
  return expression;
};

/**
 * The program with each binding the analysis finds in it renamed, at every
 * string the analysis says binds or means it, and each string it says is
 * evaluated as data quoted. The environment's bindings keep their names.
 */
const renamed = (expression: Expression, nodes: readonly SemanticNode[]) => {
  const fresh = new Map<string, string>();
  const by = new Map<string, unknown>();
  for (const { meaning, pointer, quoted, value } of nodes) {
    if (
      (meaning?.kind === "name" || meaning?.kind === "binding") &&
      meaning.binding.kind !== "environment"
    ) {
      const { id } = meaning.binding;
      const name = fresh.get(id) ?? `b${fresh.size}`;
      fresh.set(id, name);
      by.set(pointer, name);
    } else if (meaning?.kind === "data" && !quoted) {
      by.set(pointer, ["quote", value]);
    }
  }
  return { renamed: replaced(expression, by), bindings: fresh.size };
};

/** Two outcomes are the same: the same value, or the same kind of error. */
const same = (left: Outcome, right: Outcome) =>
  "value" in left && "value" in right
    ? expect(right.value).toEqual(left.value)
    : expect("error" in right && right.error).toBe(
        "error" in left && left.error
      );

describe("analyze: what a string means", () => {
  it.effect.prop(
    "is the same after every binding is renamed where the analysis says it is meant, and every string it calls data is quoted",
    { expression: program() },
    ({ expression }) =>
      Effect.gen(function* () {
        const nodes = nodesOf(expression);
        const byPointer = new Map(nodes.map((node) => [node.pointer, node]));
        for (const node of nodes) {
          // Every string means something, and only strings do.
          expect(node.meaning !== undefined).toBe(
            typeof node.value === "string"
          );
          // A binding is written at the strings that say they bind it.
          const meaning = node.meaning;
          if (meaning?.kind === "name" || meaning?.kind === "binding") {
            for (const pointer of meaning.binding.at) {
              expect(byPointer.get(pointer)?.meaning).toMatchObject({
                kind: "binding",
                binding: { id: meaning.binding.id },
              });
            }
          }
        }
        const { renamed: changed } = renamed(expression, nodes);
        same(yield* outcome(expression), yield* outcome(changed));
      }),
    OPTIONS
  );

  /** A string, or a library name with a letter changed. */
  const string = Arbitrary.flatMap(
    Arbitrary.schema(
      Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 9 }))
    ),
    (pick): Arbitrary.Arbitrary<string> => {
      const library = Object.keys(stdlib);
      const named = element(library);
      if (pick < 4) {
        return element([...BOUND, ...FREE, "?y", "lambda", "else"]);
      }
      if (pick < 6) {
        return named;
      }
      // A library name with one letter added, which may read as misspelled.
      return Arbitrary.map(named, (name) => `${name}q`);
    }
  );

  it.effect.prop(
    "is, when it runs in a lambda, the parameter, library value, logic variable, data, or error the analysis says",
    {
      text: string,
      names: Arbitrary.array(element([...BOUND, "?y", "number/add"]), {
        maxLength: 3,
      }),
    },
    ({ text, names }) =>
      Effect.gen(function* () {
        const args = names.map((_, index) => index * 10);
        const expression = [["lambda", names, text], ...args];
        const node = nodesOf(expression).find(
          ({ pointer }) => pointer === "/0/2"
        );
        const result = yield* Effect.result(run(expression, stdlib));
        const value = result._tag === "Success" ? result.success : undefined;
        const meaning = node?.meaning;
        switch (meaning?.kind) {
          case "name": {
            const { binding } = meaning;
            const place = names.lastIndexOf(text);
            expect(value).toBe(
              binding.kind === "parameter" ? args[place] : stdlib[text]
            );
            // A parameter's binding is written where the lambda lists it.
            expect(binding.at).toEqual(
              binding.kind === "parameter"
                ? names.flatMap((item, index) =>
                    item === text ? [`/0/1/${index}`] : []
                  )
                : []
            );
            break;
          }
          case "logic-variable":
            expect(value).toEqual(new LogicVariable(text.slice(1)));
            break;
          case "data":
            expect(value).toBe(text);
            break;
          default:
            expect(meaning?.kind).toBe("unbound");
            expect(result._tag === "Failure" && result.failure).toMatchObject({
              _tag: "UnboundNameError",
              message: node?.diagnostic,
            });
        }
      }),
    OPTIONS
  );
});

describe("analyze: a part that fails when it runs", () => {
  it.effect.prop(
    "is flagged with the error the run fails with: a malformed form, or a name nothing binds",
    { expression: program(true) },
    ({ expression }) =>
      Effect.gen(function* () {
        const flagged = nodesOf(expression).flatMap(({ diagnostic }) =>
          diagnostic === undefined ? [] : [diagnostic]
        );
        const result = yield* outcome(expression);
        const failsSo =
          "error" in result &&
          ["MalformedFormError", "UnboundNameError"].includes(result.error);
        if (failsSo) {
          expect(flagged).toContain(result.message);
        }
        if (flagged.length === 0) {
          expect(failsSo).toBe(false);
        }
      }),
    OPTIONS
  );
});

describe("analyze: the shape of a program", () => {
  it.prop(
    "has a node at the pointer of every part, holding the part's value",
    { expression: program(true) },
    ({ expression }) => {
      for (const node of nodesOf(expression)) {
        const value = at(expression, node.path);
        expect(node.pointer).toBe(pathToPointer(node.path));
        if (node.value !== undefined) {
          expect(node.value).toBe(value);
        }
        // Each part has a node for every element or key it holds.
        if (typeof value === "object" && value !== null) {
          expect(
            node.children.map(({ node: child }) => child.path.at(-1))
          ).toEqual(
            Array.isArray(value)
              ? value.map((_, index) => index)
              : Object.keys(value)
          );
        }
      }
    },
    OPTIONS
  );

  it.prop(
    "is data inside quote: every part is quoted, every string is data, and nothing fails",
    { expression: program(true) },
    ({ expression }) => {
      const nodes = nodesOf(["quote", expression]).slice(2);
      for (const node of nodes) {
        expect(node.quoted).toBe(true);
        expect(node.diagnostic).toBeUndefined();
        expect(["special-form", "call", "invalid-call"]).not.toContain(
          node.kind
        );
        if (typeof node.value === "string") {
          expect(node.meaning).toEqual({ kind: "data" });
        }
      }
    },
    OPTIONS
  );
});

describe("analyze: a schema form", () => {
  const index = (count: number) =>
    Arbitrary.schema(
      Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: count - 1 }))
    );

  const NAMES = ["Order", "Line", "Expr", "Sum"];

  const SHAPES: readonly unknown[] = [
    "value/number?",
    { id: "value/integer?", lines: ["schema/arrayOf", "Line"] },
    ["schema/anyOf", "Order", 1],
    ["quote", "open"],
  ];

  /** One to four schemas, each a name and a shape. */
  const declared = Arbitrary.array(index(SHAPES.length), {
    minLength: 1,
    maxLength: NAMES.length,
  });

  it.prop(
    "binds a schema at every second place, and reads each shape as an expression where the form's schemas are bound",
    { picks: declared },
    ({ picks }) => {
      const pairs = picks.map((pick, place) => [NAMES[place], SHAPES[pick]]);
      const form = ["schema", ...pairs.flat()];
      const node = analyze(form as never, stdlib);
      expect(node.specialForm).toBe("schema");
      expect(node.children.map(({ role }) => role)).toEqual([
        "operator",
        ...pairs.flatMap(() => ["binding", "shape"]),
      ]);
      // Every name binds a schema of the run's top scope, where it is written.
      expect(node.children.filter((_, place) => place % 2 === 1)).toEqual(
        pairs.map(([name], place) =>
          expect.objectContaining({
            node: expect.objectContaining({
              meaning: {
                kind: "binding",
                binding: expect.objectContaining({
                  kind: "schema",
                  name,
                  top: true,
                  at: [`/${2 * place + 1}`],
                }),
              },
            }),
          })
        )
      );
      // A name a shape mentions means the schema of that name.
      for (const shape of flattenAnalysis(node).slice(1)) {
        if (
          NAMES.slice(0, pairs.length).includes(shape.value as string) &&
          shape.meaning?.kind === "name"
        ) {
          expect(shape.meaning.binding.kind).toBe("schema");
        }
      }
      // Inside quote the form is data, and binds nothing.
      expect(
        flattenAnalysis(analyze(["quote", form] as never, stdlib)).filter(
          ({ meaning }) => meaning?.kind === "binding"
        )
      ).toEqual([]);
    }
  );
});

describe("analyze: the parts a form reads as written", () => {
  /**
   * Strings a scope can bind: plain names, a logic variable's name, special
   * forms' names, a library function's, and an aggregate's.
   */
  const WORDS = [
    "x",
    "y",
    "f",
    "?x",
    "in",
    "not",
    "some",
    "number/add",
    "aggregate/max",
  ];

  /** A row of 0s and 1s, so that rows often share a key and merge. */
  const row = Arbitrary.array(
    Arbitrary.schema(
      Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1 }))
    ),
    { minLength: 3, maxLength: 3 }
  );

  it.effect.prop(
    "are data: every string in a relation's columns and options, and in a query's and an invariant's options, is data the run does not read by scope",
    {
      words: Arbitrary.array(element(WORDS), { minLength: 1, maxLength: 3 }),
      keyed: element(["none", "string", "list", "merge"]),
      order: element(["c0", "-c0"]),
      limit: element([undefined, 1]),
      rows: Arbitrary.array(row, { minLength: 1, maxLength: 3 }),
    },
    ({ keyed, limit, order, rows, words }) =>
      Effect.gen(function* () {
        const columns = [...new Set(words)];
        const [first, second] = columns;
        const merged = keyed === "merge" && second !== undefined;
        const relationOptions = {
          ...(keyed === "string" ? { key: first } : {}),
          ...(keyed === "list" || merged ? { key: [first] } : {}),
          ...(merged ? { merge: { [second]: "aggregate/max" } } : {}),
        };
        const queryOptions = {
          order,
          ...(limit === undefined ? {} : { limit }),
        };
        const variables = columns.map((_, at) => `?c${at}`);
        // With a key, the key decides each column it does not merge.
        const fact = (values: readonly number[]) =>
          columns.map((_, at) =>
            keyed === "none" || at === 0 || (merged && at === 1)
              ? values[at]
              : values[0]
          );
        const forms = [
          ["relation", "r", columns, relationOptions],
          ...rows.map((values) => ["fact", ["r", ...fact(values)]]),
          ["invariant", ["r", ...variables], { assert: "some" }],
          ["query", ["r", ...variables], queryOptions],
        ];
        // Every string the forms read as written, each bound to a number.
        const strings = [
          ...new Set([
            ...columns,
            ...(merged ? ["aggregate/max"] : []),
            order,
            "some",
          ]),
        ];
        const bindings = strings.map((name) => ["define", name, 0]);
        const plain = ["begin", ...forms];
        const bound = ["begin", ...bindings, ...forms];
        const last = forms.length;
        const written = [
          `/${bindings.length + 1}/2`,
          `/${bindings.length + 1}/3`,
          `/${bindings.length + last - 1}/2`,
          `/${bindings.length + last}/2`,
        ];
        const inside = flattenAnalysis(analyze(bound as never, stdlib)).filter(
          ({ pointer }) =>
            written.some(
              (part) => pointer === part || pointer.startsWith(`${part}/`)
            )
        );
        expect(
          inside.filter(({ value }) => typeof value === "string")
        ).not.toEqual([]);
        for (const node of inside) {
          expect(node.quoted).toBe(true);
          expect(node.diagnostic).toBeUndefined();
          if (typeof node.value === "string") {
            expect(node.meaning).toEqual({ kind: "data" });
          }
        }
        // The run reads them as written too: binding them changes nothing.
        const ran = yield* outcome(plain);
        expect(ran).toEqual({ value: expect.anything() });
        same(ran, yield* outcome(bound));
      }),
    OPTIONS
  );
});

const SHORT_WORD = /^[a-z]{2,6}$/;

describe("analyze: the head of a call", () => {
  // A name nothing binds: neither a library function nor a special form,
  // since `["or", 0]` is the `or` form, not a call.
  const word = Arbitrary.filter(
    Arbitrary.schema(Schema.String.check(Schema.isPattern(SHORT_WORD))),
    (name) => !(Object.hasOwn(stdlib, name) || isSpecialFormName(name))
  );

  it.effect.prop(
    "is a name, never data: one no scope declares is unbound where it is written, and the call fails unless the run binds it before it runs",
    {
      name: word,
      value: Arbitrary.schema(Schema.Int),
      early: element([true, false]),
    },
    ({ early, name, value }) =>
      Effect.gen(function* () {
        const call = [name, value];
        const bind = [
          "eval",
          ["quote", ["define", name, ["lambda", ["v"], "v"]]],
        ];
        const expression = [
          "begin",
          ...(early ? [bind] : []),
          ["array/make", call, name],
        ];
        const nodes = nodesOf(expression as Expression);
        const meaningAt = (pointer: string) =>
          nodes.find((node) => node.pointer === pointer)?.meaning?.kind;
        const head = `/${early ? 2 : 1}/1/0`;
        const elsewhere = `/${early ? 2 : 1}/2`;
        expect(meaningAt(head)).toBe("unbound");
        // The same string where it is not the head is data.
        expect(meaningAt(elsewhere)).toBe("data");
        const ran = yield* outcome(expression as Expression);
        expect(ran).toEqual(
          early
            ? { value: [value, name] }
            : expect.objectContaining({ error: "InvalidFunctionCallError" })
        );
      }),
    OPTIONS
  );
});

const ARITY_ERROR =
  /takes \d+( to \d+| or more)? arguments?( \([^)]*\))? but got \d+\./;

const expectedArity = (kind: string, arity: number) => {
  if (kind === "schema") {
    return 1;
  }
  if (kind === "relation") {
    return Math.max(1, arity);
  }
  return arity;
};

describe("analyze: static arity checking", () => {
  const FIXED_STDLIB = [
    "number/divide",
    "number/subtract",
    "number/floor",
    "number/round",
    "array/head",
    "array/slice",
    "array/sort",
    "string/chars",
    "string/join",
    "object/get",
    "schema/includes?",
    "graph/shortestPath",
  ] as const;

  const argCount = Arbitrary.schema(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 6 }))
  );

  it.effect.prop(
    "flags wrong-arity calls to stdlib functions with the exact runtime error message",
    { fn: element(FIXED_STDLIB), count: argCount },
    ({ count, fn }) =>
      Effect.gen(function* () {
        const call = [fn, ...Array.from({ length: count }, (_, at) => at)];
        const root = analyze(call as never, stdlib);
        const ran = yield* outcome(call);
        const isArityError =
          "error" in ran &&
          ran.error === "LogicError" &&
          ARITY_ERROR.test(ran.message);
        if (isArityError) {
          expect(root.diagnostic).toBe(ran.message);
        } else {
          expect(root.diagnostic).toBeUndefined();
        }
      }),
    OPTIONS
  );

  it.effect.prop(
    "flags wrong-arity calls to declared relations, schemas, immediate lambdas, and unmutated defined lambdas",
    {
      arity: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 }))
      ),
      got: argCount,
      kind: element([
        "relation",
        "schema",
        "immediate",
        "defined",
        "rest",
        "mutated",
      ]),
    },
    ({ arity, got, kind }) =>
      Effect.gen(function* () {
        const params = Array.from({ length: arity }, (_, at) => `p${at}`);
        const args = Array.from({ length: got }, (_, at) => at);
        let program: unknown;
        let callPointer: string;
        if (kind === "relation") {
          const cols =
            arity === 0
              ? ["c0"]
              : Array.from({ length: arity }, (_, at) => `c${at}`);
          program = [
            "begin",
            ["relation", "edge", cols],
            ["query", ["edge", ...args]],
          ];
          callPointer = "/2/1";
        } else if (kind === "schema") {
          program = [
            "begin",
            ["schema", "Num", "value/number?"],
            ["Num", ...args],
          ];
          callPointer = "/2";
        } else if (kind === "immediate") {
          program = [["lambda", params, 0], ...args];
          callPointer = "";
        } else if (kind === "defined") {
          program = [
            "begin",
            ["define", "f", ["lambda", params, 0]],
            ["f", ...args],
          ];
          callPointer = "/2";
        } else if (kind === "rest") {
          program = [
            "begin",
            ["define", "f", ["lambda", "all", "all"]],
            ["f", ...args],
          ];
          callPointer = "/2";
        } else {
          program = [
            "begin",
            ["define", "f", ["lambda", params, 0]],
            ["set!", "f", ["lambda", "all", "all"]],
            ["f", ...args],
          ];
          callPointer = "/3";
        }
        const callNode = flattenAnalysis(
          analyze(program as never, stdlib)
        ).find((node) => node.pointer === callPointer);
        const ran = yield* outcome(program);
        const expectedError =
          kind !== "rest" &&
          kind !== "mutated" &&
          got !== expectedArity(kind, arity);
        if (expectedError) {
          expect(ran).toMatchObject({ error: "LogicError" });
          expect(callNode?.diagnostic).toBe(
            "message" in ran ? ran.message : undefined
          );
        } else {
          expect(callNode?.diagnostic).toBeUndefined();
        }
      }),
    OPTIONS
  );
});

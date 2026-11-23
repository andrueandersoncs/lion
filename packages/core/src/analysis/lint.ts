/**
 * Lints written in Lion: rules over a program read as data, so a known
 * mistake is a question, and finding it again in other programs is asking
 * the same question of them.
 *
 * A program becomes facts about its terms, each named by its JSON pointer:
 * - `term(at, parent, kind)`: "array", "string", "record", or "other"; the
 *   program itself has the parent "".
 * - `item(parent, index, at)`: the item an array holds at an index, or the
 *   value a record holds under a key.
 * - `text(at, word)`: what a string says.
 * - `size(at, n)`: how many items an array holds.
 * - `head(at, word)`: an array whose first item is a string.
 *
 * The one lint so far finds a list written as a bare array inside a rule, a
 * find, a query, an invariant, or an exists: an array whose first item is a
 * logic variable and which holds a variable no goal around it binds, such
 * as `["?a", "?b"]` in `["in", ["?a", "?b"], pairs]`. Lion reads it as a call of `?a`. Agents
 * write it more than any other mistake.
 */
import { Effect } from "effect";
import { pathToPointer, type StructuralPath } from "@/analysis/analyze";
import { run } from "@/evaluation/evaluate";
import { listWrittenAsCall } from "@/logic/compile";
import { stdlib } from "@/modules";

/** A part of a program a lint warns of, with where it stands. */
export interface Linted {
  readonly at: string;
  readonly warning: string;
}

const quoted = (value: unknown) => ["quote", value];

/** The facts a program is made of, as rows of relations. */
export const factsOf = (program: unknown): unknown[][] => {
  const rows: unknown[][] = [];
  const visit = (value: unknown, path: StructuralPath, parent: string) => {
    const at = pathToPointer(path);
    if (Array.isArray(value)) {
      rows.push(["term", at, parent, "array"], ["size", at, value.length]);
      if (typeof value[0] === "string") {
        rows.push(["head", at, value[0]]);
      }
      value.forEach((item, index) => {
        rows.push(["item", at, index, pathToPointer([...path, index])]);
        visit(item, [...path, index], at);
      });
      return;
    }
    if (typeof value === "string") {
      rows.push(["term", at, parent, "string"], ["text", at, value]);
      return;
    }
    if (typeof value === "object" && value !== null) {
      rows.push(["term", at, parent, "record"]);
      for (const [key, item] of Object.entries(value)) {
        rows.push(["item", at, key, pathToPointer([...path, key])]);
        visit(item, [...path, key], at);
      }
      return;
    }
    rows.push(["term", at, parent, "other"]);
  };
  visit(program, [], "");
  return rows;
};

const SCOPES = ["rule", "find", "query", "invariant", "exists"];

/** The rules of the lints, over the relations `factsOf` gives. */
export const LINT_RULES: readonly unknown[] = [
  ["relation", "term", ["at", "parent", "kind"]],
  ["relation", "item", ["parent", "index", "at"]],
  ["relation", "text", ["at", "word"]],
  ["relation", "size", ["at", "n"]],
  ["relation", "head", ["at", "word"]],

  ["relation", "inside", ["at", "outer"]],
  ["rule", ["inside", "?a", "?o"], ["term", "?a", "?o", "?_"]],
  [
    "rule",
    ["inside", "?a", "?o"],
    ["term", "?a", "?p", "?_"],
    ["inside", "?p", "?o"],
  ],

  ["relation", "scope", ["at"]],
  [
    "rule",
    ["scope", "?s"],
    ["head", "?s", "?w"],
    ["in", "?w", ["quote", SCOPES]],
  ],

  ["relation", "declared", ["name"]],
  [
    "rule",
    ["declared", "?n"],
    ["head", "?r", ["quote", "relation"]],
    ["item", "?r", 1, "?q"],
    ["text", "?q", "?n"],
  ],

  // A rule's head says what the rule gives; its body binds what it holds.
  ["relation", "rule_head", ["at"]],
  [
    "rule",
    ["rule_head", "?h"],
    ["head", "?r", ["quote", "rule"]],
    ["item", "?r", 1, "?h"],
  ],
  // The variables an exists lists are a list of names, not a call.
  ["relation", "names_listed", ["at"]],
  [
    "rule",
    ["names_listed", "?l"],
    ["head", "?e", ["quote", "exists"]],
    ["item", "?e", 1, "?l"],
  ],

  // Goals that bind the variables they hold as arguments of their own.
  ["relation", "binder", ["at"]],
  [
    "rule",
    ["binder", "?a"],
    ["head", "?a", "?w"],
    ["declared", "?w"],
    ["not", ["rule_head", "?a"]],
  ],
  [
    "rule",
    ["binder", "?a"],
    ["head", "?a", "?w"],
    ["in", "?w", ["quote", ["in", "="]]],
  ],

  ["relation", "bound", ["scope", "variable"]],
  [
    "rule",
    ["bound", "?s", "?v"],
    ["binder", "?a"],
    ["inside", "?a", "?s"],
    ["scope", "?s"],
    ["item", "?a", "?i", "?q"],
    ["number/greaterThan", "?i", 0],
    ["text", "?q", "?v"],
    ["string/startsWith", "?v", ["quote", "?"]],
  ],

  // A variable an array holds that no goal of any scope around it binds.
  ["relation", "unbound_in", ["at", "variable"]],
  [
    "rule",
    ["unbound_in", "?p", "?w"],
    ["item", "?p", "?_", "?q"],
    ["text", "?q", "?w"],
    ["string/startsWith", "?w", ["quote", "?"]],
    [
      "not",
      ["and", ["inside", "?p", "?t"], ["scope", "?t"], ["bound", "?t", "?w"]],
    ],
  ],

  // A list written as a bare array: an array inside a scope whose first item
  // is a logic variable and which holds a variable nothing around it binds.
  // Lion reads it as a call of the first, which cannot run.
  ["relation", "list_written_as_call", ["at", "variable"]],
  [
    "rule",
    ["list_written_as_call", "?p", "?v"],
    ["head", "?p", "?v"],
    ["string/startsWith", "?v", ["quote", "?"]],
    ["size", "?p", "?n"],
    ["number/greaterThan", "?n", 1],
    ["not", ["names_listed", "?p"]],
    ["inside", "?p", "?s"],
    ["scope", "?s"],
    ["unbound_in", "?p", "?_"],
  ],
];

/** The program that asks the lints of a program read as data. */
export const lintProgram = (
  program: unknown,
  declared: readonly string[] = []
): unknown => {
  const rows = [
    ...factsOf(program),
    ...declared.map((name) => ["declared", name]),
  ];
  return [
    "begin",
    ...LINT_RULES,
    ...(rows.length === 0
      ? []
      : [
          [
            "fact",
            ...rows.map(([relation, ...args]) => [
              relation,
              ...args.map(quoted),
            ]),
          ],
        ]),
    ["find", ["array/make", "?p", "?v"], ["list_written_as_call", "?p", "?v"]],
  ];
};

/** The term a JSON pointer names in a program. */
const termAt = (program: unknown, pointer: string): unknown =>
  pointer
    .split("/")
    .slice(1)
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce<unknown>(
      (term, key) =>
        typeof term === "object" && term !== null
          ? (term as Record<string, unknown>)[key]
          : undefined,
      program
    );

/** What the lints find in a program, each with where it stands. */
export const lint = (
  program: unknown,
  declared: readonly string[] = []
): Effect.Effect<Linted[]> =>
  run(lintProgram(program, declared), stdlib).pipe(
    Effect.map((found) =>
      [
        ...new Map(
          (found as [string, string][]).map(
            ([at, variable]) => [at, variable] as const
          )
        ),
      ]
        .sort(([a], [b]) => Number(a > b) - Number(a < b))
        .map(([at, variable]) => {
          const items = termAt(program, at) as unknown[];
          return {
            at,
            warning: listWrittenAsCall(
              JSON.stringify(items),
              JSON.stringify(variable),
              items.map((item) => JSON.stringify(item))
            ),
          };
        })
    ),
    Effect.orDie
  );

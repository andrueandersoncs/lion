/**
 * Generators of small logic programs for property tests, and helpers that run
 * them. Programs share a fixed set of relations so any generated fact, rule,
 * or invariant can be combined with any other.
 */
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import type { LogicDatabase } from "@/logic/database";
import { stdlib } from "@/modules";

type Form = readonly unknown[];

const index = (count: number) =>
  Arbitrary.schema(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: count - 1 }))
  );

/** One of the given items. */
export const element = <A>(items: readonly A[]): Arbitrary.Arbitrary<A> =>
  Arbitrary.map(index(items.length), (at) => items[at] as A);

/** A value from one of the given generators. */
export const oneOf = <A>(
  ...choices: readonly Arbitrary.Arbitrary<A>[]
): Arbitrary.Arbitrary<A> =>
  Arbitrary.flatMap(
    index(choices.length),
    (at) => choices[at] as Arbitrary.Arbitrary<A>
  );

const LOWERCASE_NAME = /^[a-z]{1,6}$/;

/** A short lowercase name, such as a logic variable's name without its "?". */
export const name = Arbitrary.schema(
  Schema.String.check(Schema.isPattern(LOWERCASE_NAME))
);

export const NODES = ["a", "b", "c", "d"] as const;

/** "d" is left out, so an edge to it ends at an unknown node. */
const KNOWN_NODES = ["a", "b", "c"];

export const DECLARATIONS: readonly Form[] = [
  ["relation", "edge", ["from", "to"]],
  ["relation", "path", ["from", "to"]],
  ["relation", "node", ["name"]],
  ["relation", "order", ["id", "status"], { key: "id" }],
  ["relation", "cancelled", ["id"]],
  ["relation", "degree", ["node", "count"]],
  ["fact", ...KNOWN_NODES.map((name) => ["node", name])],
];

/** Rules over the declared relations: recursion, `or`, and an aggregate. */
export const RULES: readonly Form[] = [
  ["rule", ["path", "?x", "?y"], ["edge", "?x", "?y"]],
  ["rule", ["path", "?x", "?z"], ["path", "?x", "?y"], ["edge", "?y", "?z"]],
  ["rule", ["degree", "?n", ["aggregate/count", "?to"]], ["edge", "?n", "?to"]],
  ["rule", ["path", "?y", "?x"], ["edge", "?x", "?y"]],
  ["rule", ["cancelled", "?id"], ["order", "?id", "shipped"]],
  [
    "rule",
    ["path", "?x", "?y"],
    ["or", ["edge", "?x", "?y"], ["edge", "?y", "?x"]],
  ],
];

/**
 * Invariants over the declared relations, using recursion, negation, an
 * aggregate, a filter, known arguments, and a graph algorithm that fails on
 * a cycle.
 */
export const INVARIANTS: readonly Form[] = [
  ["invariant", ["path", "?x", "?x"], { assert: "none" }],
  [
    "invariant",
    ["and", ["edge", "?_", "?to"], ["not", ["node", "?to"]]],
    { assert: "none" },
  ],
  ["invariant", ["edge", "?x", "?x"], { assert: "none" }],
  ["invariant", ["edge", "a", "?_"], { assert: "some" }],
  [
    "invariant",
    ["and", ["degree", "?n", "?k"], ["number/greaterThan", "?k", 2]],
    { assert: "none" },
  ],
  [
    "invariant",
    ["and", ["order", "?id", "shipped"], ["cancelled", "?id"]],
    { assert: "none" },
  ],
  ["invariant", ["order", "?_", "open"], { assert: "some" }],
  ["invariant", ["path", "a", "d"], { assert: "none" }],
  [
    "invariant",
    [
      "and",
      ["graph/topologicalOrder", "edge", "?n", "?p"],
      ["number/lessThan", "?p", 0],
    ],
    { assert: "none" },
  ],
];

const node = element(NODES);
const orderId = element([1, 2, 3]);

export const edgeFact = Arbitrary.map(
  Arbitrary.all([node, node]),
  ([from, to]): Form => ["edge", from, to]
);

export const fact: Arbitrary.Arbitrary<Form> = oneOf(
  edgeFact,
  edgeFact,
  Arbitrary.map(
    Arbitrary.all([orderId, element(["open", "shipped"])]),
    ([id, status]): Form => ["order", id, status]
  ),
  Arbitrary.map(orderId, (id): Form => ["cancelled", id])
);

const facts = (form: "fact" | "retract", maxLength: number) =>
  Arbitrary.map(
    Arbitrary.array(fact, { minLength: 1, maxLength }),
    (items): Form => [form, ...items]
  );

/** A form that changes the database: facts added or retracted, or a rule. */
export const change: Arbitrary.Arbitrary<Form> = oneOf(
  facts("fact", 3),
  facts("fact", 3),
  facts("retract", 2),
  element(RULES)
);

export const invariant = element(INVARIANTS);

export interface Scenario {
  /** Facts and rules to start from, before any invariant. */
  readonly setup: readonly Form[];
  /** Invariants to add and changes to make, in order. */
  readonly steps: readonly Form[];
}

/**
 * A setup, then invariants and changes in any order. Retracts mostly name
 * facts the setup added, so they can break "some" invariants.
 */
export const scenario: Arbitrary.Arbitrary<Scenario> = Arbitrary.flatMap(
  Arbitrary.all({
    facts: Arbitrary.array(fact, { maxLength: 8 }),
    rules: Arbitrary.array(element(RULES), { maxLength: 3 }),
  }),
  ({ facts: given, rules }) => {
    const present = given.length > 0 ? element(given) : fact;
    const retract = Arbitrary.map(
      Arbitrary.array(oneOf(present, present, fact), {
        minLength: 1,
        maxLength: 2,
      }),
      (items): Form => ["retract", ...items]
    );
    const step = oneOf(
      invariant,
      invariant,
      facts("fact", 3),
      facts("fact", 3),
      retract,
      element(RULES)
    );
    return Arbitrary.map(
      Arbitrary.array(step, { minLength: 1, maxLength: 10 }),
      (steps): Scenario => ({
        setup: [...(given.length > 0 ? [["fact", ...given]] : []), ...rules],
        steps,
      })
    );
  }
);

export type Outcome =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly message: string };

/** Runs a program against a database and reports its value or error. */
export const attempt = (
  program: unknown,
  database: LogicDatabase
): Effect.Effect<Outcome> =>
  run(program, stdlib, { database }).pipe(
    Effect.map(
      (value): Outcome => ({
        ok: true,
        value: JSON.parse(JSON.stringify(value)) as unknown,
      })
    ),
    Effect.catch((error) =>
      Effect.succeed<Outcome>({
        ok: false,
        message: String((error as { message?: unknown }).message),
      })
    ),
    Effect.orDie
  );

/** Declares the shared relations, then adds the scenario's setup. */
export const start = (database: LogicDatabase, { setup }: Scenario) =>
  run(["begin", ...DECLARATIONS, ...setup], stdlib, { database });

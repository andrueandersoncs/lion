/**
 * Small models shaped like a research model, for property tests of
 * goal-directed queries: claims whose content is a record, rules that take
 * claims apart with record patterns and `schema/open`, heads that hold
 * records, constants, and computed values, recursion, negation, and `in`.
 * Questions about them know their arguments in each of those places. Some
 * heads hold a value that asks a question of its own, a `find` or a goal,
 * and questions know that value too. A plain model reads a world as lists.
 */
import { Arbitrary } from "effect";
import { element, oneOf } from "./programs";

export const TOPICS = ["t0", "t1", "t2", "t3"];
const RULE_NAMES = ["r0", "r1"];
const TAGS = ["x", "y", "z"];
/** The keys of a claim's content besides its topic or rule. */
const DETAILS = ["value", "holds", "tags"];

/** What a claim says: a topic's value, whether a rule holds, or tags. */
export type Says =
  | { readonly topic: string; readonly value: number }
  | { readonly rule: string; readonly holds: number }
  | { readonly tags: readonly string[] };

/** A question: a topic or a rule, as the record that asks about it. */
export type Question = { readonly topic: string } | { readonly rule: string };

export interface ClaimWorld {
  readonly claims: readonly Says[];
  /** Links between topics. */
  readonly links: readonly (readonly [string, string])[];
  /** Questions, each open or not. */
  readonly questions: readonly (readonly [Question, boolean])[];
  /** The keys a claim's base leaves out of its content. */
  readonly readings: readonly string[];
}

const says: Arbitrary.Arbitrary<Says> = oneOf<Says>(
  Arbitrary.map(
    Arbitrary.all([element(TOPICS), element([0, 1, 2])]),
    ([topic, value]) => ({ topic, value })
  ),
  Arbitrary.map(
    Arbitrary.all([element(RULE_NAMES), element([0, 1])]),
    ([rule, holds]) => ({ rule, holds })
  ),
  Arbitrary.map(Arbitrary.array(element(TAGS), { maxLength: 3 }), (tags) => ({
    tags: [...new Set(tags)],
  }))
);

export const question: Arbitrary.Arbitrary<Question> = oneOf<Question>(
  Arbitrary.map(element(TOPICS), (topic) => ({ topic })),
  Arbitrary.map(element(RULE_NAMES), (rule) => ({ rule }))
);

export const claimWorld: Arbitrary.Arbitrary<ClaimWorld> = Arbitrary.all({
  claims: Arbitrary.array(says, { minLength: 1, maxLength: 12 }),
  questions: Arbitrary.array(
    Arbitrary.all([question, element([true, false])]),
    { maxLength: 6 }
  ),
  links: Arbitrary.array(Arbitrary.all([element(TOPICS), element(TOPICS)]), {
    maxLength: 4,
  }),
  readings: Arbitrary.map(
    Arbitrary.array(element(DETAILS), { maxLength: 3 }),
    (keys) => [...new Set(keys)]
  ),
});

/** The kinds of flag the rules raise, none of them a relation's name. */
export const KINDS = ["contested", "quiet", "linked"];

/** A claim's content as Lion writes it: a list is made with `array/make`. */
const written = (content: Says) =>
  "tags" in content ? { tags: ["array/make", ...content.tags] } : content;

/**
 * Declares the relations, adds the world's facts, and adds the rules:
 *
 * - `answer` takes a claim's content apart with `schema/open`, under a head
 *   that holds a record;
 * - `said` and `disputed` join on what `answer` gives;
 * - `flag` has a constant in each head, and reads `disputed` with no known
 *   argument, asks `said` under `not`, and follows `reach`;
 * - `tagged` binds its first column with `in`, and `scaled` computes its
 *   second;
 * - `base` computes a claim's content without the keys `reading` holds, with
 *   a `find` of those keys, and `meant` reads it under another name;
 *   `values` holds what a `find` of `said` gives a question, and `settled`
 *   whether the goal `disputed` holds of it.
 */
export const claimProgram = ({
  claims,
  links,
  questions,
  readings,
}: ClaimWorld) => [
  ["relation", "claim", ["id", "says"]],
  ["relation", "question", ["q", "open"]],
  ["relation", "link", ["from", "to"]],
  ["relation", "answer", ["question", "value", "claim"]],
  ["relation", "said", ["question", "value"]],
  ["relation", "disputed", ["question"]],
  ["relation", "flag", ["kind", "question"]],
  ["relation", "reach", ["from", "to"]],
  ["relation", "tagged", ["tag", "claim"]],
  ["relation", "scaled", ["question", "value"]],
  ["relation", "reading", ["key"]],
  ["relation", "base", ["claim", "base"]],
  ["relation", "meant", ["base", "claim"]],
  ["relation", "values", ["question", "values"]],
  ["relation", "settled", ["question", "settled"]],
  [
    "fact",
    ...claims.map((content, at) => ["claim", `c${at}`, written(content)]),
  ],
  ...(readings.length === 0
    ? []
    : [["fact", ...readings.map((key) => ["reading", ["quote", key]])]]),
  ...(questions.length === 0
    ? []
    : [["fact", ...questions.map(([q, open]) => ["question", q, open])]]),
  ...(links.length === 0
    ? []
    : [
        [
          "fact",
          ...links.map(([from, to]) => [
            "link",
            { topic: from },
            { topic: to },
          ]),
        ],
      ]),
  [
    "rule",
    ["answer", { topic: "?t" }, "?v", "?c"],
    ["claim", "?c", ["schema/open", { topic: "?t", value: "?v" }]],
  ],
  [
    "rule",
    ["answer", { rule: "?r" }, "?v", "?c"],
    ["claim", "?c", ["schema/open", { rule: "?r", holds: "?v" }]],
  ],
  [
    "rule",
    ["said", "?q", "?v"],
    ["question", "?q", true],
    ["answer", "?q", "?v", "?_"],
  ],
  [
    "rule",
    ["disputed", "?q"],
    ["said", "?q", "?v"],
    ["said", "?q", "?w"],
    ["number/lessThan", "?v", "?w"],
  ],
  ["rule", ["flag", "contested", "?q"], ["disputed", "?q"]],
  [
    "rule",
    ["flag", "quiet", "?q"],
    ["question", "?q", "?_"],
    ["not", ["said", "?q", "?_"]],
  ],
  [
    "rule",
    ["flag", "linked", "?q"],
    ["question", "?q", true],
    ["reach", "?q", "?_"],
  ],
  ["rule", ["reach", "?a", "?b"], ["link", "?a", "?b"]],
  ["rule", ["reach", "?a", "?c"], ["reach", "?a", "?b"], ["link", "?b", "?c"]],
  [
    "rule",
    ["tagged", "?t", "?c"],
    ["claim", "?c", ["schema/open", { tags: "?ts" }]],
    ["in", "?t", "?ts"],
  ],
  [
    "rule",
    ["scaled", "?q", ["number/multiply", "?v", 10]],
    ["said", "?q", "?v"],
  ],
  [
    "rule",
    [
      "base",
      "?c",
      [
        "array/reduce",
        ["find", "?key", ["reading", "?key"]],
        "?says",
        ["lambda", ["rest", "key"], ["object/remove", "rest", "key"]],
      ],
    ],
    ["claim", "?c", "?says"],
  ],
  ["rule", ["meant", "?base", "?c"], ["base", "?c", "?base"]],
  [
    "rule",
    ["values", "?q", ["find", "?v", ["said", "?q", "?v"]]],
    ["question", "?q", "?_"],
  ],
  [
    "rule",
    ["settled", "?q", ["not", ["disputed", "?q"]]],
    ["question", "?q", true],
  ],
];

/**
 * A rule that raises a flag of its own kind from `trap`, whose one rule
 * fails as soon as it runs: a claim's id is not a number. A query that
 * never asks for that kind never reaches it.
 */
export const TRAP = [
  ["relation", "trap", ["claim"]],
  [
    "rule",
    ["trap", "?c"],
    ["claim", "?c", "?_"],
    ["number/greaterThan", "?c", 0],
  ],
  ["rule", ["flag", "trapped", "?q"], ["trap", "?_"], ["question", "?q", "?_"]],
];

/** A claim's content as Lion writes it, without some keys. */
const without = (content: Says, keys: readonly string[]) =>
  Object.fromEntries(
    Object.entries(written(content)).filter(([key]) => !keys.includes(key))
  );

/**
 * What a claim's base can be: its content without some of the keys besides
 * its topic or rule.
 */
const base = Arbitrary.map(
  Arbitrary.all([says, Arbitrary.array(element(DETAILS), { maxLength: 3 })]),
  ([content, dropped]) => without(content, dropped)
);

const VALUE_LISTS = [[], [0], [1], [0, 1], [0, 2], [1, 2], [0, 1, 2]];

/**
 * Questions that know an argument a rule's head computes by asking a
 * question, a `find` or a goal used as a value, with bases from `bases`.
 */
const askComputedOf = (
  bases: Arbitrary.Arbitrary<Record<string, unknown>>
): Arbitrary.Arbitrary<unknown> =>
  oneOf<unknown>(
    Arbitrary.map(bases, (b) => ["query", ["meant", b, "?c"], { order: "c" }]),
    Arbitrary.map(bases, (b) => ["query", ["base", "?c", b], { order: "c" }]),
    Arbitrary.map(bases, (b) => [
      "query",
      ["and", ["=", "?b", b], ["meant", "?b", "?c"]],
      { order: "c" },
    ]),
    Arbitrary.map(bases, (b) => ["find", "?c", ["meant", b, "?c"]]),
    Arbitrary.map(element(VALUE_LISTS), (values) => [
      "query",
      ["values", "?q", ["array/make", ...values]],
      { order: "q" },
    ]),
    Arbitrary.map(question, (q) => [
      "query",
      ["values", "?q", ["find", "?v", ["said", q, "?v"]]],
      { order: "q" },
    ]),
    Arbitrary.map(element([true, false]), (settled) => [
      "query",
      ["settled", "?q", settled],
      { order: "q" },
    ])
  );

/**
 * A world, and a question about it that knows an argument a head computes
 * by asking. Half of its bases are those of the world's own claims.
 */
export const computedQuestion = Arbitrary.flatMap(claimWorld, (world) =>
  Arbitrary.map(
    askComputedOf(
      oneOf(
        base,
        Arbitrary.map(element(world.claims), (content) =>
          without(content, world.readings)
        )
      )
    ),
    (step) => ({ step, world })
  )
);

/** Something to ask of the model, each knowing an argument somewhere. */
export const ask: Arbitrary.Arbitrary<unknown> = oneOf<unknown>(
  askComputedOf(base),
  Arbitrary.map(question, (q) => [
    "query",
    ["answer", q, "?v", "?c"],
    { order: ["v", "c"] },
  ]),
  Arbitrary.map(question, (q) => ["query", ["said", q, "?v"], { order: "v" }]),
  Arbitrary.map(question, (q) => ["query", ["disputed", q]]),
  Arbitrary.map(element(KINDS), (kind) => [
    "query",
    ["flag", kind, "?q"],
    { order: "q" },
  ]),
  Arbitrary.map(question, (q) => [
    "query",
    ["reach", q, "?to"],
    { order: "to" },
  ]),
  Arbitrary.map(element(TAGS), (tag) => [
    "query",
    ["tagged", tag, "?c"],
    { order: "c" },
  ]),
  Arbitrary.map(element([0, 10, 20]), (value) => [
    "query",
    ["scaled", "?q", value],
    { order: "q" },
  ]),
  Arbitrary.map(question, (q) => ["find", "?v", ["said", q, "?v"]]),
  Arbitrary.map(question, (q) => [
    "cond",
    [["disputed", q], "yes"],
    ["else", "no"],
  ]),
  Arbitrary.map(element(KINDS), (kind) => [
    "aggregate/count",
    ["find", "?q", ["flag", kind, "?q"]],
  ]),
  Arbitrary.Constant([
    "query",
    ["and", ["question", "?q", true], ["said", "?q", "?v"]],
    { order: ["q", "v"] },
  ])
);

const sameQuestion = (a: Question, b: Question) =>
  JSON.stringify(a) === JSON.stringify(b);

/** The values claims give a question, by a plain reading of the world. */
const valuesOf = ({ claims }: ClaimWorld, q: Question) =>
  new Set(
    claims.flatMap((content) => {
      if ("topic" in q && "topic" in content && content.topic === q.topic) {
        return [content.value];
      }
      return "rule" in q && "rule" in content && content.rule === q.rule
        ? [content.holds]
        : [];
    })
  );

/** The open questions that claims give two values, as `disputed` finds. */
export const disputedOf = (facts: ClaimWorld): Question[] => {
  const open = facts.questions.filter(([, isOpen]) => isOpen).map(([q]) => q);
  return open
    .filter((q, at) => open.findIndex((other) => sameQuestion(other, q)) === at)
    .filter((q) => valuesOf(facts, q).size > 1);
};

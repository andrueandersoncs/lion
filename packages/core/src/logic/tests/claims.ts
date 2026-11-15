/**
 * Small models shaped like a research model, for property tests of
 * goal-directed queries: claims whose content is a record, rules that take
 * claims apart with record patterns and `schema/open`, heads that hold
 * records, constants, and computed values, recursion, negation, and `in`.
 * Questions about them know their arguments in each of those places. A plain
 * model reads a world as lists.
 */
import { Arbitrary } from "effect";
import { element, oneOf } from "./programs";

export const TOPICS = ["t0", "t1", "t2", "t3"];
const RULE_NAMES = ["r0", "r1"];
const TAGS = ["x", "y", "z"];

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
 *   second.
 */
export const claimProgram = ({ claims, links, questions }: ClaimWorld) => [
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
  [
    "fact",
    ...claims.map((content, at) => ["claim", `c${at}`, written(content)]),
  ],
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

/** Something to ask of the model, each knowing an argument somewhere. */
export const ask: Arbitrary.Arbitrary<unknown> = oneOf<unknown>(
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

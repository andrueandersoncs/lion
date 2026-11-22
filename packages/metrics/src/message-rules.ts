/**
 * The messages `bun run measure` counts, grouped by the rule each states.
 * The groups are a Lion program, `message-rules.json`: what each message
 * reads as, the rules with what each says, and the rules kept in several
 * wordings on purpose. The messages themselves are the source's, given as
 * facts, so the groups follow the source as it is.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Effect } from "effect";
import { evaluate, type Lion } from "./lion.ts";

const RULES = join(import.meta.dirname, "message-rules.json");

/** A rule stated in several wordings: the messages that state it. */
export interface Group {
  readonly because?: string;
  readonly rule: string;
  readonly says: string;
  readonly texts: readonly string[];
  readonly topic: string;
}

/** One topic: how many rules it has, and how many messages state them. */
export interface Topic {
  readonly messages: number;
  readonly rules: number;
  readonly topic: string;
}

/** What the model says of the messages a version has. */
export interface MessageRules {
  /** Readings of messages the source no longer has. */
  readonly gone: readonly (readonly [text: string, rule: string])[];
  /** Rules kept in several wordings, with why each stays. */
  readonly kept: readonly Group[];
  /** Rules kept on purpose that one wording states now. */
  readonly keptAlone: readonly string[];
  readonly topics: readonly Topic[];
  /** Rules stated in several wordings that nothing keeps. */
  readonly toUnify: readonly Group[];
  /** Messages no reading says the rule of. */
  readonly unread: readonly string[];
  /** Rules a reading names that the model does not state. */
  readonly unstated: readonly string[];
}

/** The model's forms: its relations, rules, readings, and kept rules. */
export const messageRulesForms = (
  text = readFileSync(RULES, "utf8")
): unknown[] => (JSON.parse(text) as unknown[]).slice(1);

/** The program that asks the model about some messages. */
export const messageRulesProgram = (
  messages: readonly string[],
  forms: readonly unknown[] = messageRulesForms()
): unknown => [
  "begin",
  ...forms,
  ...(messages.length === 0
    ? []
    : [["fact", ...messages.map((text) => ["message", ["quote", text]])]]),
  [
    "array/make",
    [
      "find",
      ["array/make", "?r", "?k", "?s", "?ts"],
      ["to_unify", "?r", "?k", "?s", "?ts"],
    ],
    [
      "find",
      ["array/make", "?r", "?k", "?s", "?ts", "?b"],
      ["and", ["several", "?r", "?k", "?s", "?ts"], ["kept", "?r", "?b"]],
    ],
    [
      "find",
      ["array/make", "?k", "?n", "?m"],
      ["topic_size", "?k", "?n", "?m"],
    ],
    ["find", "?t", ["unread", "?t"]],
    ["find", ["array/make", "?t", "?r"], ["gone", "?t", "?r"]],
    ["find", "?r", ["unstated", "?r"]],
    ["find", "?r", ["kept_alone", "?r"]],
  ],
];

type Row = readonly string[];

const group = ([rule, topic, says, texts, because]: readonly unknown[]) =>
  ({
    rule,
    says,
    texts,
    topic,
    ...(because === undefined ? {} : { because }),
  }) as Group;

/** Asks the model about some messages, such as the ones a version has. */
export const messageRules = (
  lion: Lion,
  messages: readonly string[],
  forms?: readonly unknown[]
): Effect.Effect<MessageRules, string> =>
  Effect.flatMap(
    evaluate(lion, messageRulesProgram(messages, forms)),
    (outcome) => {
      if (!outcome.ok) {
        return Effect.fail(outcome.error);
      }
      const [toUnify, kept, topics, unread, gone, unstated, keptAlone] =
        outcome.value as [
          Row[],
          Row[],
          [string, number, number][],
          string[],
          [string, string][],
          string[],
          string[],
        ];
      return Effect.succeed({
        gone,
        kept: kept.map(group),
        keptAlone,
        toUnify: toUnify.map(group),
        topics: topics.map(([topic, rules, count]) => ({
          messages: count,
          rules,
          topic,
        })),
        unread,
        unstated,
      });
    }
  );

const listed = (heading: string, items: readonly string[]) =>
  items.length === 0 ? [] : ["", heading, ...items.map((item) => `  ${item}`)];

const groupLines = (groups: readonly Group[]) =>
  groups.flatMap(({ because, rule, says, texts, topic }) => [
    `  ${rule} (${topic}): ${says}`,
    ...(because === undefined ? [] : [`    kept: ${because}`]),
    ...texts.map((text) => `    ${JSON.stringify(text)}`),
  ]);

/** The report `bun run measure --messages` prints. */
export const messageRulesLines = (model: MessageRules): string[] => {
  const messages = model.topics.reduce((sum, { messages: n }) => sum + n, 0);
  const rules = model.topics.reduce((sum, { rules: n }) => sum + n, 0);
  return [
    `messages read: ${messages}, stating ${rules} rules in ${model.topics.length} topics`,
    `rules in several wordings: ${model.toUnify.length} to unify, ${model.kept.length} kept`,
    ...model.topics.map(
      ({ messages: n, rules: k, topic }) =>
        `  ${topic}: ${k} rules, ${n} messages`
    ),
    ...(model.toUnify.length === 0
      ? []
      : ["", "To unify:", ...groupLines(model.toUnify)]),
    ...(model.kept.length === 0
      ? []
      : ["", "Kept:", ...groupLines(model.kept)]),
    ...listed("Messages no reading says the rule of:", model.unread),
    ...listed(
      "Readings of messages the source no longer has:",
      model.gone.map(([text, rule]) => `${JSON.stringify(text)}: ${rule}`)
    ),
    ...listed("Rules a reading names that are not stated:", model.unstated),
    ...listed("Rules kept that one wording states now:", model.keptAlone),
  ];
};

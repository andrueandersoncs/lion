/**
 * The messages grouped by rule, as the Lion model derives them, checked
 * against a plain model of the same readings: maps from a rule to the
 * messages that state it.
 */
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect } from "effect";
import { load } from "../lion.ts";
import {
  type Group,
  messageRules,
  messageRulesForms,
} from "../message-rules.ts";
import { CORE, REPOSITORY } from "../sources.ts";
import { element } from "./generators.ts";

const lion = Effect.runPromise(load(join(REPOSITORY, CORE)));

/** The model's relations and rules, without the readings it holds. */
const logic = messageRulesForms().filter(
  (form) => !(Array.isArray(form) && form[0] === "fact")
);

const TEXTS = ["a b c d", "e f g h", 'i "j" … k', "l m n o", "p … q r"];
const RULES = ["r1", "r2", "r3"];

const sorted = <A>(items: readonly A[]) =>
  [...items].sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));

const groupRow = ({ rule, texts, topic, because }: Group) => [
  rule,
  topic,
  [...texts].sort(),
  because ?? null,
];

describe("the messages grouped by rule", () => {
  it.effect.prop(
    "give the rules several messages state, the messages no reading covers, and the readings no message has, as a plain model does",
    {
      kept: Arbitrary.array(element(RULES), { maxLength: 2 }),
      messages: Arbitrary.array(element(TEXTS), { maxLength: 5 }),
      readings: Arbitrary.array(
        Arbitrary.all({ rule: element(RULES), text: element(TEXTS) }),
        { maxLength: 6 }
      ),
      stated: Arbitrary.array(element(RULES), { maxLength: 3 }),
      topics: Arbitrary.array(element(["t1", "t2"]), {
        maxLength: 3,
        minLength: 3,
      }),
    },
    ({ kept, messages, readings, stated, topics }) =>
      Effect.gen(function* () {
        const shown = new Set(messages);
        const read = new Map(
          readings.map(({ rule, text }) => [
            `${text}\u0000${rule}`,
            { rule, text },
          ])
        );
        const topicOf = new Map(
          [...new Set(stated)].map((rule) => [
            rule,
            topics[RULES.indexOf(rule)] ?? "t1",
          ])
        );
        const keptRules = new Set(kept);
        const facts = [
          ...[...topicOf].map(([rule, topic]) => [
            "stated",
            rule,
            topic,
            ["quote", `says ${rule}`],
          ]),
          ...[...read.values()].map(({ rule, text }) => [
            "reads",
            ["quote", text],
            rule,
          ]),
          ...[...keptRules].map((rule) => [
            "kept",
            rule,
            ["quote", `because ${rule}`],
          ]),
        ];
        const got = yield* messageRules(
          yield* Effect.promise(() => lion),
          [...shown],
          [...logic, ...(facts.length === 0 ? [] : [["fact", ...facts]])]
        );

        const texts = new Map<string, string[]>();
        for (const { rule, text } of read.values()) {
          if (shown.has(text)) {
            texts.set(rule, [...(texts.get(rule) ?? []), text]);
          }
        }
        const several = [...texts].filter(
          ([rule, list]) => list.length > 1 && topicOf.has(rule)
        );
        const row = ([rule, list]: [string, string[]], because?: string) => [
          rule,
          topicOf.get(rule),
          [...list].sort(),
          because ?? null,
        ];
        expect(sorted(got.toUnify.map(groupRow))).toEqual(
          sorted(
            several.filter(([rule]) => !keptRules.has(rule)).map((g) => row(g))
          )
        );
        expect(sorted(got.kept.map(groupRow))).toEqual(
          sorted(
            several
              .filter(([rule]) => keptRules.has(rule))
              .map((g) => row(g, `because ${g[0]}`))
          )
        );
        const readTexts = new Set([...read.values()].map(({ text }) => text));
        expect(sorted(got.unread)).toEqual(
          sorted([...shown].filter((text) => !readTexts.has(text)))
        );
        expect(sorted(got.gone)).toEqual(
          sorted(
            [...read.values()]
              .filter(({ text }) => !shown.has(text))
              .map(({ rule, text }) => [text, rule])
          )
        );
        expect(sorted(got.unstated)).toEqual(
          sorted(
            [...new Set([...read.values()].map(({ rule }) => rule))].filter(
              (rule) => !topicOf.has(rule)
            )
          )
        );
        const severalRules = new Set(several.map(([rule]) => rule));
        expect(sorted(got.keptAlone)).toEqual(
          sorted([...keptRules].filter((rule) => !severalRules.has(rule)))
        );
        const byTopic = new Map<string, { rules: Set<string>; n: number }>();
        for (const [rule, list] of texts) {
          const topic = topicOf.get(rule);
          if (topic !== undefined) {
            const counted = byTopic.get(topic) ?? { n: 0, rules: new Set() };
            counted.rules.add(rule);
            counted.n += list.length;
            byTopic.set(topic, counted);
          }
        }
        expect(sorted(got.topics)).toEqual(
          sorted(
            [...byTopic].map(([topic, { n, rules }]) => ({
              messages: n,
              rules: rules.size,
              topic,
            }))
          )
        );
      }),
    { timeout: 120_000 }
  );
});

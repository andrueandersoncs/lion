import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect } from "effect";
import { evaluate, load } from "../lion.ts";
import { readStale } from "../loop.ts";
import { CORE, REPOSITORY } from "../sources.ts";
import { between, element } from "./generators.ts";

/** The evaluator of the working tree, loaded once. */
const lion = Effect.runPromise(load(join(REPOSITORY, CORE)));

/** The research step that says which answers rest on stale probes. */
const STEP = (
  JSON.parse(
    readFileSync(join(REPOSITORY, "research/steps/58-si-stale.json"), "utf8")
  ) as unknown[]
).slice(1);

const SOURCES = ["s1", "s2", "s3"];

describe("the research model's answers that rest on stale probes", () => {
  it.effect.prop(
    "are the present answers whose claim comes from a source a later change made stale, and no other",
    {
      answers: Arbitrary.array(
        Arbitrary.all({
          claim: between(0, 4),
          q: element(["q1", "q2"]),
          v: between(0, 2),
        }),
        { maxLength: 5 }
      ),
      claims: Arbitrary.array(element(SOURCES), { maxLength: 5, minLength: 5 }),
      stale: Arbitrary.array(element(SOURCES), { maxLength: 3 }),
    },
    ({ answers, claims, stale }) =>
      Effect.gen(function* () {
        const quoted = (v: unknown) => ["quote", v];
        const program = [
          "begin",
          ["relation", "answer", ["question", "value", "claim"]],
          ["relation", "claim", ["id", "source", "quote", "says"]],
          ...STEP,
          ...(answers.length === 0
            ? []
            : [
                [
                  "fact",
                  ...answers.map((a) => [
                    "answer",
                    quoted(a.q),
                    a.v,
                    quoted(`c${a.claim}`),
                  ]),
                ],
              ]),
          [
            "fact",
            ...claims.map((s, at) => [
              "claim",
              quoted(`c${at}`),
              quoted(s),
              "",
              {},
            ]),
          ],
          ...(stale.length === 0
            ? []
            : [
                [
                  "fact",
                  ...stale.map((s) => [
                    "stale_source",
                    quoted(s),
                    quoted("abc1234"),
                  ]),
                ],
              ]),
          [
            "find",
            ["array/make", "?s", "?q", "?v"],
            ["stale_answer", "?q", "?v", "?s"],
          ],
        ];
        const outcome = yield* evaluate(
          yield* Effect.promise(() => lion),
          program
        );
        expect(outcome.ok).toBe(true);
        const got = new Set(
          ((outcome.ok ? outcome.value : []) as unknown[][]).map((r) =>
            JSON.stringify(r)
          )
        );
        const expected = new Set(
          answers
            .filter((a) => stale.includes(claims[a.claim] as string))
            .map((a) => JSON.stringify([claims[a.claim], a.q, a.v]))
        );
        expect([...got].sort()).toStrictEqual([...expected].sort());
      })
  );

  it.prop(
    "are counted from what bun run stale printed, and nothing when it printed no count",
    { count: between(-1, 500) },
    ({ count }) => {
      const printed = [
        "stale probe sources, research: 3",
        ...(count < 0
          ? []
          : [`answers resting on stale probes, research: ${count}`]),
      ].join("\n");
      expect(readStale(printed)).toBe(count < 0 ? undefined : count);
    }
  );
});

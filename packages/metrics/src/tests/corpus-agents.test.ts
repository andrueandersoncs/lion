import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import {
  type Attempt,
  attemptLine,
  attemptsOf,
  causesOf,
  errorWords,
  firstTryRan,
  taskText,
} from "../corpus-agents.ts";
import { load } from "../lion.ts";
import { CORE, REPOSITORY } from "../sources.ts";
import { between, element, word } from "./generators.ts";

/** The evaluator of the working tree, loaded once. */
const lion = Effect.runPromise(load(join(REPOSITORY, CORE)));

const WORDS = errorWords();

/**
 * A try: one that ran, or one that failed with a message that holds the
 * words of none, one, or two of the causes, among others.
 */
const attempt: Arbitrary.Arbitrary<Attempt> = Arbitrary.map(
  Arbitrary.all({
    after: word,
    also: between(0, WORDS.length),
    before: word,
    ok: Arbitrary.schema(Schema.Boolean),
    says: between(0, WORDS.length),
  }),
  ({ after, also, before, ok, says }): Attempt =>
    ok
      ? { ok }
      : {
          error: `${before} ${WORDS[says]?.[0] ?? ""} ${WORDS[also]?.[0] ?? ""} ${after}`,
          ok,
        }
);

const inputs = Arbitrary.schema(
  Schema.Record(
    Schema.String.check(Schema.isPattern(/^[a-z]{1,8}$/)),
    Schema.Union([
      Schema.Number,
      Schema.String,
      Schema.Array(Schema.Array(Schema.String)),
    ])
  )
);

describe("an agents' run of the corpus", () => {
  it.prop(
    "tells the agent the task's statement and every input it binds, with its value",
    { bound: inputs, id: word, statement: word },
    ({ bound, id, statement }) => {
      const text = taskText({
        check: true,
        id,
        inputs: bound,
        origin: "",
        pillar: "logic",
        statement,
        tags: [],
      });
      expect(text.includes(`\n${statement}\n`)).toBe(true);
      for (const [name, value] of Object.entries(bound)) {
        expect(
          text.includes(`- \`${name}\`: \`${JSON.stringify(value)}\``)
        ).toBe(true);
      }
      expect(text.includes("No names are bound")).toBe(
        Object.keys(bound).length === 0
      );
    }
  );

  it.prop(
    "reads back every try ./try logged, in order, past lines that are no try, and the first try ran when it did not fail",
    {
      junk: Arbitrary.array(element(["", "{", "[1]", '{"ok": "yes"}']), {
        maxLength: 3,
      }),
      tries: Arbitrary.array(attempt, { maxLength: 6 }),
    },
    ({ junk, tries }) => {
      const text = [...junk, ...tries.map(attemptLine), ...junk].join("\n");
      const read = attemptsOf(text);
      expect(read).toStrictEqual(tries);
      expect(firstTryRan(read)).toBe(tries[0]?.ok === true);
    }
  );

  it.effect.prop(
    "counts each failed try under every cause whose words its message holds, or under other, as a plain model does",
    {
      worked: Arbitrary.array(
        Arbitrary.all({
          attempts: Arbitrary.array(attempt, { maxLength: 4 }),
          task: element(["t1", "t2", "t3"]),
        }),
        { maxLength: 4 }
      ),
    },
    ({ worked }) =>
      Effect.gen(function* () {
        const got = yield* causesOf(yield* Effect.promise(() => lion), worked);
        const hits = new Map<string, Set<string>>();
        const tasks = new Map<string, Set<string>>();
        for (const { attempts, task } of worked) {
          attempts.forEach((each, at) => {
            if (each.ok) {
              return;
            }
            const message = each.error ?? "";
            const causes = WORDS.filter(([words]) =>
              message.includes(words)
            ).map(([, cause]) => cause);
            for (const cause of causes.length === 0 ? ["other"] : causes) {
              hits.set(
                cause,
                (hits.get(cause) ?? new Set()).add(`${task} ${at + 1}`)
              );
              tasks.set(cause, (tasks.get(cause) ?? new Set()).add(task));
            }
          });
        }
        expect(
          [...got].sort(
            (a, b) => Number(a.cause > b.cause) - Number(a.cause < b.cause)
          )
        ).toStrictEqual(
          [...hits.keys()].sort().map((cause) => ({
            cause,
            tasks: tasks.get(cause)?.size ?? 0,
            tries: hits.get(cause)?.size ?? 0,
          }))
        );
        expect(got.map((each) => each.tries)).toStrictEqual(
          [...got.map((each) => each.tries)].sort((a, b) => b - a)
        );
      })
  );
});

import { describe, expect, it } from "@effect/vitest";
import { Arbitrary } from "effect";
import {
  addSpent,
  caseLimits,
  gradeOf,
  linesOf,
  messageOf,
  promptFor,
  type Spent,
  sessionOrder,
  sessionPrompt,
  skillNameOf,
  spentOf,
  unknownOptions,
} from "../skill-eval.ts";
import { between, element, oneOf, text } from "./generators.ts";

const CHECK_TEXT = /^[a-z][a-z ,:'"-]{0,19}$/;
const PROMPT_TEXT = /^[a-z .,]{1,40}$/;

const stage = Arbitrary.all({
  failures: Arbitrary.array(text(CHECK_TEXT), { maxLength: 3 }),
  name: element(["reading", "framing", "conclusions", "page", "report"]),
  passed: between(0, 9),
});

/** What the case's grader prints for its stages: a line each, and its failures under it. */
const printed = (
  stages: readonly (typeof stage extends Arbitrary.Arbitrary<infer A>
    ? A
    : never)[]
) =>
  stages
    .flatMap(({ failures, name, passed }) => [
      `${name.padEnd(12)} ${passed} of ${passed + failures.length}`,
      ...failures.map((failure) => `  failed  ${failure}`),
    ])
    .join("\n");

describe("the skill eval's grade", () => {
  it.prop(
    "adds up what the grader prints for each stage, and keeps each failure",
    { stages: Arbitrary.array(stage, { maxLength: 5 }) },
    ({ stages }) => {
      const failures = stages.flatMap((each) => each.failures);
      const passed = stages.reduce((sum, each) => sum + each.passed, 0);
      expect(gradeOf(printed(stages))).toEqual({
        failures,
        passed,
        total: passed + failures.length,
      });
    }
  );
});

describe("the skill eval's cost", () => {
  it.prop(
    "reads the result message wherever it stands, and fails a run that printed none",
    {
      cost: between(0, 2000),
      error: between(0, 1),
      models: Arbitrary.array(element(["opus", "haiku", "fable"]), {
        maxLength: 3,
      }),
      ms: between(0, 4_000_000),
      shape: between(0, 2),
      turns: between(1, 150),
    },
    ({ cost, error, models, ms, shape, turns }) => {
      const result = {
        duration_ms: ms,
        is_error: error === 1,
        // No models at all is a result message that does not say.
        ...(models.length === 0
          ? {}
          : {
              modelUsage: Object.fromEntries(
                models.map((model) => [model, { costUSD: 1 }])
              ),
            }),
        num_turns: turns,
        total_cost_usd: cost / 100,
        type: "result",
      };
      const system = { subtype: "init", type: "system" };
      const output = [
        JSON.stringify([system, result]),
        JSON.stringify(result),
        `not json ${cost}`,
      ][shape] as string;
      expect(spentOf(output)).toEqual(
        shape === 2
          ? {
              costUsd: undefined,
              error: true,
              minutes: undefined,
              models: [],
              turns: undefined,
            }
          : {
              costUsd: cost / 100,
              error: error === 1,
              minutes: ms / 60_000,
              models: [...new Set(models)].sort(),
              turns,
            }
      );
    }
  );
});

describe("the skill eval's lines", () => {
  it.prop(
    "say each number as a question and its value, and list the failures the grade reads back",
    {
      cost: between(0, 2000),
      failures: Arbitrary.array(text(CHECK_TEXT), { maxLength: 3 }),
      models: Arbitrary.array(element(["fable", "haiku", "opus"]), {
        maxLength: 2,
      }),
      passed: between(0, 30),
      turns: between(1, 150),
    },
    ({ cost, failures, models, passed, turns }) => {
      const graded = {
        costUsd: cost / 100,
        failures,
        folder: "out/run",
        minutes: 12.34,
        models,
        passed,
        total: passed + failures.length,
        turns,
      };
      const lines = linesOf(graded);
      expect(lines.slice(0, 7)).toEqual([
        "run: out/run",
        `checks passed: ${passed} of ${passed + failures.length}`,
        `checks failed: ${failures.length}`,
        `cost usd: ${(cost / 100).toFixed(2)}`,
        "minutes: 12.3",
        `turns: ${turns}`,
        `models: ${models.length === 0 ? "unknown" : models.join(", ")}`,
      ]);
      expect(gradeOf(lines.join("\n")).failures).toEqual(failures);
    }
  );
});

describe("the skill eval's case and prompt", () => {
  it.prop(
    "reads a case's turns and time, with the defaults when it gives none, and puts the case's prompt after where the skill is",
    {
      seconds: between(0, 9000),
      shown: between(0, 3),
      turns: between(1, 500),
      words: text(PROMPT_TEXT),
    },
    ({ seconds, shown, turns, words }) => {
      const yaml = [
        "name: a-case",
        ...(shown % 2 === 1 ? [`max_turns: ${turns}`] : []),
        ...(shown >= 2 ? [`timeout_seconds: ${seconds}`] : []),
        "tags: [x]",
      ].join("\n");
      expect(caseLimits(yaml)).toEqual({
        maxTurns: shown % 2 === 1 ? turns : 150,
        timeoutSeconds: shown >= 2 ? seconds : 3600,
      });
      const prompt = promptFor("lion-research", words);
      expect(
        prompt.startsWith("The lion-research skill is in the folder ./skill.")
      ).toBe(true);
      expect(prompt.endsWith(`${words.trim()}\n`)).toBe(true);
    }
  );
});

const SKILL_NAME = /^[a-z][a-z-]{0,15}$/;
const BODY_TEXT = /^[a-z .:-]{0,30}$/;

describe("the skill eval's skill", () => {
  it.prop(
    "names the skill its SKILL.md's front matter names, wherever the name stands among the other keys, and nothing a line of the body says",
    {
      after: between(0, 1),
      body: text(BODY_TEXT),
      front: between(0, 2),
      name: text(SKILL_NAME),
      other: text(SKILL_NAME),
    },
    ({ after, body, front, name, other }) => {
      // front: 0 no front matter, 1 front matter without a name, 2 with one.
      const keys = [
        `description: ${body}`,
        ...(front === 2 ? [`name: ${name}`] : []),
      ];
      const ordered = after === 1 ? keys.reverse() : keys;
      const skillMd = [
        ...(front === 0 ? [] : ["---", ...ordered, "---"]),
        "",
        `# ${body}`,
        `name: ${other}`,
      ].join("\n");
      expect(skillNameOf(skillMd)).toBe(front === 2 ? name : undefined);
    }
  );

  it.prop(
    "gives a run with no skill the case's prompt alone, and a run with one the line that says where it is first",
    { name: text(SKILL_NAME), words: text(PROMPT_TEXT) },
    ({ name, words }) => {
      expect(promptFor(undefined, words)).toBe(`${words.trim()}\n`);
      expect(promptFor(name, words)).toBe(
        `The ${name} skill is in the folder ./skill. Read ./skill/SKILL.md before anything else and follow it; where it says "this skill's folder", it means ./skill.\n\n${words.trim()}\n`
      );
    }
  );
});

const EARLIER = /^[a-zA-Z0-9 .,$&'`{}-]{0,40}$/;

describe("the skill eval's sessions", () => {
  it.prop(
    "takes a case's numbered prompts in the order of their numbers, and no other file",
    {
      numbers: Arbitrary.array(between(1, 30), { maxLength: 6 }),
      others: Arbitrary.array(
        element(["notes.md", "1.txt", "README.md", "2a.md", "x.md"]),
        { maxLength: 3 }
      ),
    },
    ({ numbers, others }) => {
      const unique = [...new Set(numbers)];
      const files = [...unique.map((n) => `${n}.md`), ...others].reverse();
      expect(sessionOrder(files)).toEqual(
        [...unique].sort((a, b) => a - b).map((n) => `${n}.md`)
      );
    }
  );

  it.prop(
    "puts the earlier session's message, word for word, wherever the template says {{earlier}}, and changes nothing else",
    {
      earlier: text(EARLIER),
      parts: Arbitrary.array(text(PROMPT_TEXT), { maxLength: 4, minLength: 1 }),
    },
    ({ earlier, parts }) => {
      const filled = sessionPrompt(parts.join("{{earlier}}"), earlier);
      expect(filled).toBe(parts.join(earlier.trim()));
      expect(filled.split(earlier.trim()).length - 1).toBeGreaterThanOrEqual(
        parts.length - 1
      );
    }
  );
});

const spent: Arbitrary.Arbitrary<Spent> = Arbitrary.all({
  costUsd: oneOf(
    Arbitrary.map(between(0, 900), (c) => (c / 100) as number | undefined),
    Arbitrary.map(between(0, 0), () => undefined)
  ),
  error: Arbitrary.map(between(0, 1), (e) => e === 1),
  minutes: oneOf(
    Arbitrary.map(between(0, 90), (m) => m as number | undefined),
    Arbitrary.map(between(0, 0), () => undefined)
  ),
  models: Arbitrary.map(
    Arbitrary.array(element(["fable", "haiku", "opus"]), { maxLength: 2 }),
    (ms) => [...new Set(ms)].sort()
  ),
  turns: oneOf(
    Arbitrary.map(between(1, 150), (t) => t as number | undefined),
    Arbitrary.map(between(0, 0), () => undefined)
  ),
});

describe("the skill eval's sessions together", () => {
  it.prop(
    "add up what every session spent, unknown when any part is, name every model once, and fail when any session failed",
    { sessions: Arbitrary.array(spent, { maxLength: 4, minLength: 1 }) },
    ({ sessions }) => {
      const total = sessions.reduce(addSpent);
      const known = (key: "costUsd" | "minutes" | "turns") =>
        sessions.some((each) => each[key] === undefined)
          ? undefined
          : sessions.reduce((sum, each) => sum + (each[key] as number), 0);
      expect(
        total.costUsd === undefined
          ? undefined
          : Math.round(total.costUsd * 100)
      ).toBe(
        known("costUsd") === undefined
          ? undefined
          : Math.round((known("costUsd") as number) * 100)
      );
      expect(total.minutes).toBe(known("minutes"));
      expect(total.turns).toBe(known("turns"));
      expect(total.models).toEqual(
        [...new Set(sessions.flatMap((each) => each.models))].sort()
      );
      expect(total.error).toBe(sessions.some((each) => each.error));
    }
  );

  it.prop(
    "read the message a session ended with from its result message, wherever it stands, and none from a run that printed none",
    { message: text(EARLIER), shape: between(0, 3) },
    ({ message, shape }) => {
      const result = { result: message, total_cost_usd: 1, type: "result" };
      const output = [
        JSON.stringify([{ subtype: "init", type: "system" }, result]),
        JSON.stringify(result),
        JSON.stringify({ ...result, result: 7 }),
        `not json ${message}`,
      ][shape] as string;
      expect(messageOf(output)).toBe(shape < 2 ? message : undefined);
    }
  );
});

describe("the skill eval's command line", () => {
  it.prop(
    "refuses every word that asks for an option it does not have, and no other word",
    {
      words: Arbitrary.array(
        oneOf(
          element(["--runs", "--from", "--bare", "--model"]),
          element(["--form", "--from skills/x", "--bar", "--"]),
          element(["lion-reasoning", "rechecks-what-changed", "2", "skills/x"])
        ),
        { maxLength: 8 }
      ),
    },
    ({ words }) => {
      const known = ["runs", "from", "bare", "model"];
      expect(unknownOptions(words, known)).toEqual(
        words.filter(
          (word) =>
            word.startsWith("--") && !known.some((name) => word === `--${name}`)
        )
      );
    }
  );
});

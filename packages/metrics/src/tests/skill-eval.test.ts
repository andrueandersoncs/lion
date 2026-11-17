import { describe, expect, it } from "@effect/vitest";
import { Arbitrary } from "effect";
import {
  caseLimits,
  gradeOf,
  linesOf,
  promptFor,
  spentOf,
} from "../skill-eval.ts";
import { between, element, text } from "./generators.ts";

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

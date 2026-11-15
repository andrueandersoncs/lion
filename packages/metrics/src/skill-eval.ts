/**
 * The parts of a skill eval run that are plain computation: the prompt an
 * agent gets, what a run cost, what the case's grader said, and the lines a
 * run prints for the reasoning skill to quote.
 */

/** One graded run of a skill's eval case. */
export interface Graded {
  readonly costUsd: number | undefined;
  readonly failures: readonly string[];
  readonly folder: string;
  readonly minutes: number | undefined;
  readonly passed: number;
  readonly total: number;
  readonly turns: number | undefined;
}

/** What a headless agent run reported about itself. */
export interface Spent {
  readonly costUsd: number | undefined;
  readonly error: boolean;
  readonly minutes: number | undefined;
  readonly turns: number | undefined;
}

/**
 * The case's prompt, after a first line that says where the copy of the
 * skill is. The run reads the skill from that folder, since the session's
 * own skills are switched off, so no installed copy can stand in for it.
 */
export const promptFor = (skill: string, prompt: string): string =>
  `The ${skill} skill is in the folder ./skill. Read ./skill/SKILL.md before anything else and follow it; where it says "this skill's folder", it means ./skill.\n\n${prompt.trim()}\n`;

const STAGE_LINE = /^(\S+)\s+(\d+) of (\d+)$/;
const FAILED_LINE = /^\s+failed\s+(.*)$/;

/**
 * What the grader printed, as the checks passed, the checks in all, and each
 * failure's line. The grader prints a line per stage, "reading 3 of 3", and
 * under it a line for each check that failed.
 */
export const gradeOf = (
  output: string
): { failures: string[]; passed: number; total: number } => {
  let passed = 0;
  let total = 0;
  const failures: string[] = [];
  for (const line of output.split("\n")) {
    const stage = STAGE_LINE.exec(line.trimEnd());
    if (stage !== null) {
      passed += Number(stage[2]);
      total += Number(stage[3]);
      continue;
    }
    const failed = FAILED_LINE.exec(line);
    if (failed !== null) {
      failures.push(failed[1] as string);
    }
  }
  return { failures, passed, total };
};

const numberOr = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

/**
 * What a headless run cost, read from the result message `claude -p
 * --output-format json` prints last. A run that printed nothing readable
 * spent an unknown amount and failed.
 */
export const spentOf = (output: string): Spent => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return {
      costUsd: undefined,
      error: true,
      minutes: undefined,
      turns: undefined,
    };
  }
  const messages = Array.isArray(parsed) ? parsed : [parsed];
  const result = [...messages]
    .reverse()
    .find(
      (message) =>
        typeof message === "object" &&
        message !== null &&
        (message as { type?: unknown }).type === "result"
    ) as Record<string, unknown> | undefined;
  const ms = numberOr(result?.duration_ms);
  return {
    costUsd: numberOr(result?.total_cost_usd),
    error: result === undefined || result.is_error === true,
    minutes: ms === undefined ? undefined : ms / 60_000,
    turns: numberOr(result?.num_turns),
  };
};

const fixed = (value: number | undefined, digits: number) =>
  value === undefined ? "unknown" : value.toFixed(digits);

/**
 * The lines a run prints: each one a question and its value, so the
 * reasoning skill can quote it as the observation of a score. A run with no
 * research folder passed nothing.
 */
export const linesOf = (graded: Graded): string[] => [
  `run: ${graded.folder}`,
  `checks passed: ${graded.passed} of ${graded.total}`,
  `checks failed: ${graded.total - graded.passed}`,
  `cost usd: ${fixed(graded.costUsd, 2)}`,
  `minutes: ${fixed(graded.minutes, 1)}`,
  `turns: ${graded.turns ?? "unknown"}`,
  ...graded.failures.map((failure) => `  failed  ${failure}`),
];

/** The numbers a case's settings give: its turns and its time, in seconds. */
export const caseLimits = (
  yaml: string
): { maxTurns: number; timeoutSeconds: number } => {
  const read = (name: string, fallback: number) => {
    const found = new RegExp(`^${name}:\\s*(\\d+)\\s*$`, "m").exec(yaml);
    return found === null ? fallback : Number(found[1]);
  };
  return {
    maxTurns: read("max_turns", 150),
    timeoutSeconds: read("timeout_seconds", 3600),
  };
};

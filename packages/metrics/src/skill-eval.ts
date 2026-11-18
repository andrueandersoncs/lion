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
  /** The models that ran it, in order of name; none when it did not say. */
  readonly models: readonly string[];
  readonly passed: number;
  readonly total: number;
  readonly turns: number | undefined;
}

/** What a headless agent run reported about itself. */
export interface Spent {
  readonly costUsd: number | undefined;
  readonly error: boolean;
  readonly minutes: number | undefined;
  /** The models the run used, in order of name; none when it did not say. */
  readonly models: readonly string[];
  readonly turns: number | undefined;
}

/**
 * The case's prompt, after a first line that says where the copy of the
 * skill is. The run reads the skill from that folder, since the session's
 * own skills are switched off, so no installed copy can stand in for it. A
 * run with no skill, the baseline a skill is measured against, gets the
 * case's prompt alone.
 */
export const promptFor = (skill: string | undefined, prompt: string): string =>
  skill === undefined
    ? `${prompt.trim()}\n`
    : `The ${skill} skill is in the folder ./skill. Read ./skill/SKILL.md before anything else and follow it; where it says "this skill's folder", it means ./skill.\n\n${prompt.trim()}\n`;

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const NAME_LINE = /^name:[ \t]*(\S+)[ \t]*$/m;

/**
 * The name a SKILL.md gives its skill in its front matter, so a run of a
 * changed copy or of a baseline skill is told which skill it has.
 */
export const skillNameOf = (skillMd: string): string | undefined => {
  const front = FRONT_MATTER.exec(skillMd)?.[1];
  return front === undefined ? undefined : NAME_LINE.exec(front)?.[1];
};

/**
 * The words of a command line that ask for an option the command does not
 * have, such as a misspelled `--form`, or `--from <folder>` passed as one
 * word. A command that ignored them would run something else than was asked.
 */
export const unknownOptions = (
  words: readonly string[],
  known: readonly string[]
): string[] =>
  words.filter(
    (word) => word.startsWith("--") && !known.includes(word.slice(2))
  );

const SESSION_FILE = /^(\d+)\.md$/;

/**
 * The prompts of a case that runs more than one session, in order: the
 * files of its `sessions/` folder named by number, such as `1.md` and
 * `2.md`. Other files are not sessions.
 */
export const sessionOrder = (names: readonly string[]): string[] =>
  names
    .filter((name) => SESSION_FILE.test(name))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));

/**
 * A later session's prompt: its template, with the message the session
 * before it ended with wherever the template says `{{earlier}}`, word for
 * word.
 */
export const sessionPrompt = (template: string, earlier: string): string =>
  template.split("{{earlier}}").join(earlier.trim());

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

/** The result message `claude -p --output-format json` prints last, if it printed one. */
const resultOf = (output: string): Record<string, unknown> | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return undefined;
  }
  const messages = Array.isArray(parsed) ? parsed : [parsed];
  return [...messages]
    .reverse()
    .find(
      (message) =>
        typeof message === "object" &&
        message !== null &&
        (message as { type?: unknown }).type === "result"
    ) as Record<string, unknown> | undefined;
};

/** The message a headless run ended with, which the next session of its case is given. */
export const messageOf = (output: string): string | undefined => {
  const message = resultOf(output)?.result;
  return typeof message === "string" ? message : undefined;
};

/**
 * What a headless run cost, read from the result message `claude -p
 * --output-format json` prints last. A run that printed nothing readable
 * spent an unknown amount and failed.
 */
export const spentOf = (output: string): Spent => {
  const result = resultOf(output);
  const ms = numberOr(result?.duration_ms);
  const usage = result?.modelUsage;
  return {
    costUsd: numberOr(result?.total_cost_usd),
    error: result === undefined || result.is_error === true,
    minutes: ms === undefined ? undefined : ms / 60_000,
    models:
      typeof usage === "object" && usage !== null
        ? Object.keys(usage).sort()
        : [],
    turns: numberOr(result?.num_turns),
  };
};

const sum = (a: number | undefined, b: number | undefined) =>
  a === undefined || b === undefined ? undefined : a + b;

/**
 * What the sessions of one run spent together. A sum with an unknown part
 * is unknown, and a run failed when any of its sessions did.
 */
export const addSpent = (a: Spent, b: Spent): Spent => ({
  costUsd: sum(a.costUsd, b.costUsd),
  error: a.error || b.error,
  minutes: sum(a.minutes, b.minutes),
  models: [...new Set([...a.models, ...b.models])].sort(),
  turns: sum(a.turns, b.turns),
});

const fixed = (value: number | undefined, digits: number) =>
  value === undefined ? "unknown" : value.toFixed(digits);

/**
 * The lines a run prints: each one a question and its value, so the
 * reasoning skill can quote it as the observation of a score. The models
 * that ran it are one of them, since runs under different models answer
 * different questions. A run with no research folder passed nothing.
 */
export const linesOf = (graded: Graded): string[] => [
  `run: ${graded.folder}`,
  `checks passed: ${graded.passed} of ${graded.total}`,
  `checks failed: ${graded.total - graded.passed}`,
  `cost usd: ${fixed(graded.costUsd, 2)}`,
  `minutes: ${fixed(graded.minutes, 1)}`,
  `turns: ${graded.turns ?? "unknown"}`,
  `models: ${graded.models.length === 0 ? "unknown" : graded.models.join(", ")}`,
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

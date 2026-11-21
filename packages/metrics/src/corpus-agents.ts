/**
 * The parts of an agents' run of the capability corpus that are plain
 * computation: what an agent is told about a task, the tries its `./try`
 * logged, whether the first one ran, and what caused the tries that
 * failed, by the rules in `agent-errors.json`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Effect } from "effect";
import type { Task } from "./capability.ts";
import { evaluate, type Lion } from "./lion.ts";

/** One run of a task's program by `./try`, as the attempts file holds it. */
export interface Attempt {
  /** Why the program failed; none when it ran. */
  readonly error?: string;
  readonly ok: boolean;
}

/** What `TASK.md` says: the statement, the inputs bound, and how to try. */
export const taskText = (task: Task): string => {
  const names = Object.keys(task.inputs);
  const inputs =
    names.length === 0
      ? "No names are bound when it runs."
      : [
          "When the program runs, these names are bound to the task's inputs, which `inputs.json` also holds:",
          "",
          ...names.map(
            (name) => `- \`${name}\`: \`${JSON.stringify(task.inputs[name])}\``
          ),
        ].join("\n");
  return [
    `# ${task.id}`,
    "",
    task.statement,
    "",
    "## What to hand in",
    "",
    "Write a Lion program in `solution.json`. Lion is a Lisp whose programs are JSON, and `LION.md` is its documentation. The program's value is what the task asks for.",
    "",
    inputs,
    "",
    "## Trying it",
    "",
    "`./try` runs `solution.json` the way the grader does, with the inputs bound, and prints its value, or why it failed. Run it as often as you like. Checks you do not see then judge the value it gives. `./lion` is Lion's command line, for anything else.",
    "",
  ].join("\n");
};

/** What the agent is asked, in a folder that holds `TASK.md`. */
export const AGENT_PROMPT =
  "Solve the task that TASK.md in this folder describes. Work only in this folder, and finish when solution.json holds your program.\n";

/** The line `./try` appends for an attempt. */
export const attemptLine = (attempt: Attempt): string =>
  `${JSON.stringify(attempt)}\n`;

/** The attempts a file of lines holds, in order; a line that is no attempt is skipped. */
export const attemptsOf = (text: string): Attempt[] =>
  text.split("\n").flatMap((line): Attempt[] => {
    try {
      const value = JSON.parse(line) as unknown;
      if (
        typeof value === "object" &&
        value !== null &&
        typeof (value as Attempt).ok === "boolean"
      ) {
        const { error, ok } = value as Attempt;
        return [typeof error === "string" ? { error, ok } : { ok }];
      }
      return [];
    } catch {
      return [];
    }
  });

/** A task's first try ran when the agent tried it and that try did not fail. */
export const firstTryRan = (attempts: readonly Attempt[]): boolean =>
  attempts[0]?.ok === true;

/** How many failed tries, and of how many tasks, one cause explains. */
export interface Cause {
  readonly cause: string;
  readonly tasks: number;
  readonly tries: number;
}

const RULES = join(import.meta.dirname, "agent-errors.json");

/** The words of an error and the cause they say, as the rules hold them. */
export const errorWords = (): readonly (readonly [string, string])[] =>
  (JSON.parse(readFileSync(RULES, "utf8")) as unknown[])
    .filter(
      (form): form is unknown[] => Array.isArray(form) && form[0] === "fact"
    )
    .flatMap((form) => form.slice(1) as [string, string, string][])
    .filter((row) => row[0] === "says")
    .map(([, words, cause]) => [words, cause] as const);

/** The program that asks the rules what caused each failed try. */
export const causesProgram = (
  tries: readonly {
    readonly attempts: readonly Attempt[];
    readonly task: string;
  }[]
): unknown => {
  const rows = tries.flatMap(({ attempts, task }) =>
    attempts.flatMap((attempt, at) =>
      attempt.ok
        ? []
        : [["attempt", ["quote", task], at + 1, ["quote", attempt.error ?? ""]]]
    )
  );
  const rules = (JSON.parse(readFileSync(RULES, "utf8")) as unknown[]).slice(1);
  return [
    "begin",
    ...rules,
    ...(rows.length === 0 ? [] : [["fact", ...rows]]),
    ["find", ["array/make", "?c", "?n", "?k"], ["counted", "?c", "?n", "?k"]],
  ];
};

/** What caused the failed tries, the most frequent cause first. */
export const causesOf = (
  lion: Lion,
  tries: readonly {
    readonly attempts: readonly Attempt[];
    readonly task: string;
  }[]
): Effect.Effect<Cause[], string> =>
  evaluate(lion, causesProgram(tries)).pipe(
    Effect.flatMap((outcome) =>
      outcome.ok
        ? Effect.succeed(
            [
              ...new Map(
                (outcome.value as [string, number, number][]).map(
                  ([cause, n, k]) =>
                    [cause, { cause, tasks: k, tries: n }] as const
                )
              ).values(),
            ].sort(
              (a, b) =>
                b.tries - a.tries ||
                b.tasks - a.tasks ||
                Number(a.cause > b.cause) - Number(a.cause < b.cause)
            )
          )
        : Effect.fail(outcome.error)
    )
  );

/** What an agents' run spent and how its tries went, besides the scores. */
export interface AgentsSummary {
  readonly causes: readonly Cause[];
  readonly costUsd: number;
  /** Tasks whose first try ran, of the tasks the agents worked. */
  readonly firstRan: number;
  readonly models: readonly string[];
  /** Tasks left unworked because the budget would not cover them. */
  readonly notRun: number;
  readonly worked: number;
}

/** The lines an agents' run prints besides the scores, each a question and its value. */
export const agentsLines = (summary: AgentsSummary): string[] => [
  `models: ${summary.models.length === 0 ? "unknown" : summary.models.join(", ")}`,
  `cost usd: ${summary.costUsd.toFixed(2)}`,
  `first tries that ran: ${summary.firstRan} of ${summary.worked}`,
  ...(summary.notRun === 0
    ? []
    : [`not worked for the budget: ${summary.notRun}`]),
  ...summary.causes.map(
    (cause) =>
      `failed tries, ${cause.cause}: ${cause.tries} in ${cause.tasks} task${cause.tasks === 1 ? "" : "s"}`
  ),
];

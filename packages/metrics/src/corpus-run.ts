/**
 * Runs agents on a capability corpus. Each task is worked by one headless
 * `claude -p` session in a folder of its own, outside the repository, so
 * neither the repository's CLAUDE.md nor anyone's memory of it reaches the
 * agent, inside a folder that cannot be listed, so no agent finds another's
 * or a reference program. The folder holds the task's statement and inputs,
 * Lion's documentation, `./lion`, and `./try`, which runs the program as the
 * grader does and logs each try where the agent does not work.
 *
 * The run stops starting tasks when what it spent, with what the tasks
 * still running may spend, would pass the budget.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Task } from "./capability.ts";
import {
  AGENT_PROMPT,
  type Attempt,
  attemptsOf,
  firstTryRan,
  taskText,
} from "./corpus-agents.ts";
import { type Spent, spentOf } from "./skill-eval.ts";
import { REPOSITORY } from "./sources.ts";

/** How agents work the corpus. */
export interface AgentsOptions {
  /** The most the whole run may spend, in US dollars. */
  readonly budget: number;
  readonly jobs: number;
  readonly maxTurns: number;
  readonly model: string;
  /** The most one task's session may spend, in US dollars. */
  readonly taskBudget: number;
  readonly timeoutSeconds: number;
}

/** What one task's session did. */
export interface Worked {
  readonly attempts: readonly Attempt[];
  readonly spent: Spent;
  readonly task: string;
}

/** What a run of agents left: where, the tasks it worked, and those it did not. */
export interface AgentsRun {
  readonly folder: string;
  readonly notRun: readonly string[];
  readonly solutions: string;
  readonly worked: readonly Worked[];
}

const DOCS = join(REPOSITORY, "packages/core/README.md");
const CLI = join(REPOSITORY, "packages/cli/dist/bin.mjs");
const TRY = join(REPOSITORY, "packages/metrics/try.ts");
const WORK = join(tmpdir(), "lion-corpus-agents");

const quotedForShell = (path: string) => `'${path.replaceAll("'", "'\\''")}'`;

const script = (path: string, body: string) => {
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
};

/** Sets up a task's folder: what the agent reads and the two commands it runs. */
const prepare = (work: string, task: Task, attempts: string) => {
  mkdirSync(work, { recursive: true });
  writeFileSync(join(work, "TASK.md"), taskText(task));
  if (Object.keys(task.inputs).length > 0) {
    writeFileSync(
      join(work, "inputs.json"),
      `${JSON.stringify(task.inputs, null, 2)}\n`
    );
  }
  copyFileSync(DOCS, join(work, "LION.md"));
  script(
    join(work, "try"),
    `LION_ATTEMPTS=${quotedForShell(attempts)} exec bun ${quotedForShell(TRY)} "$(dirname "$0")"`
  );
  script(join(work, "lion"), `exec bun ${quotedForShell(CLI)} "$@"`);
};

const session = (work: string, options: AgentsOptions): Promise<string> =>
  new Promise((done) => {
    const child = spawn(
      "claude",
      [
        "-p",
        AGENT_PROMPT,
        "--output-format",
        "json",
        "--max-turns",
        String(options.maxTurns),
        "--model",
        options.model,
        "--max-budget-usd",
        String(options.taskBudget),
        "--setting-sources",
        "project",
        "--disable-slash-commands",
        "--no-session-persistence",
        "--allowedTools",
        "Read",
        "Glob",
        "Grep",
        "Write",
        "Edit",
        "Bash",
        "--disallowedTools",
        "WebSearch",
        "WebFetch",
      ],
      { cwd: work }
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", () => undefined);
    const timer = setTimeout(
      () => child.kill("SIGTERM"),
      options.timeoutSeconds * 1000
    );
    child.on("close", () => {
      clearTimeout(timer);
      done(output);
    });
  });

/** Works one task: its folder, its session, and what it left. */
const work = async (
  task: Task,
  run: string,
  options: AgentsOptions
): Promise<Worked> => {
  const folder = join(WORK, randomUUID());
  const attempts = join(run, "attempts", `${task.id}.jsonl`);
  writeFileSync(attempts, "");
  prepare(folder, task, attempts);
  const output = await session(folder, options);
  writeFileSync(join(run, "transcripts", `${task.id}.json`), output);
  const solution = join(folder, "solution.json");
  if (existsSync(solution)) {
    copyFileSync(solution, join(run, "solutions", `${task.id}.json`));
  }
  rmSync(folder, { force: true, recursive: true });
  return {
    attempts: attemptsOf(readFileSync(attempts, "utf8")),
    spent: spentOf(output),
    task: task.id,
  };
};

/**
 * Works the tasks, `jobs` at a time, into `out`/<stamp>: a solution, a
 * transcript, and the logged tries of each task.
 */
export const runAgents = async (
  tasks: readonly Task[],
  out: string,
  options: AgentsOptions
): Promise<AgentsRun> => {
  if (!existsSync(CLI)) {
    throw new Error(
      `There is no ${CLI}: build the workspace first, with bunx turbo build.`
    );
  }
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const run = join(out, stamp);
  for (const part of ["attempts", "solutions", "transcripts"]) {
    mkdirSync(join(run, part), { recursive: true });
  }
  mkdirSync(WORK, { recursive: true });
  chmodSync(WORK, 0o300);
  const queue = [...tasks];
  const worked: Worked[] = [];
  const notRun: string[] = [];
  let spent = 0;
  let running = 0;
  const next = async (): Promise<void> => {
    const task = queue.shift();
    if (task === undefined) {
      return;
    }
    if (spent + options.taskBudget * (running + 1) > options.budget) {
      notRun.push(task.id, ...queue.splice(0).map((each) => each.id));
      return;
    }
    running += 1;
    const done = await work(task, run, options);
    running -= 1;
    spent += done.spent.costUsd ?? options.taskBudget;
    worked.push(done);
    console.error(
      `${task.id}: ${firstTryRan(done.attempts) ? "first try ran" : "first try failed"}, ${done.attempts.length} tries, $${(done.spent.costUsd ?? 0).toFixed(2)}`
    );
    return next();
  };
  await Promise.all(
    Array.from({ length: Math.max(1, options.jobs) }, () => next())
  );
  return {
    folder: run,
    notRun,
    solutions: join(run, "solutions"),
    worked: [...worked].sort(
      (a, b) => Number(a.task > b.task) - Number(a.task < b.task)
    ),
  };
};

// Runs a corpus task's program the way the grader's first run does, for an
// agent working the task: `solution.json`, with `inputs.json` bound.
//
//   bun try.ts <folder>
//
// It prints the program's value as JSON, or why it failed, and appends the
// try to the file LION_ATTEMPTS names, a line of JSON each. An agents' run
// of the corpus reads those lines to say whether a task's first try ran and
// what the failed tries had in common.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Effect } from "effect";
import { type Attempt, attemptLine } from "./src/corpus-agents.ts";
import { evaluate, load } from "./src/lion.ts";
import { CORE, REPOSITORY } from "./src/sources.ts";

const folder = process.argv[2] ?? process.cwd();

const readJson = (name: string): { value: unknown } | { error: string } => {
  const path = join(folder, name);
  if (!existsSync(path)) {
    return { error: `There is no ${name} in ${folder}.` };
  }
  try {
    return { value: JSON.parse(readFileSync(path, "utf8")) as unknown };
  } catch (error) {
    return { error: `${name} is not JSON: ${(error as Error).message}` };
  }
};

/** A value as the agent reads it: JSON, or what it is when JSON cannot write it. */
const shown = (value: unknown): string => {
  if (typeof value === "function") {
    return "a function";
  }
  try {
    return JSON.stringify(value, null, 1) ?? String(value);
  } catch {
    return String(value);
  }
};

const tried = (attempt: Attempt) => {
  const log = process.env.LION_ATTEMPTS;
  if (log !== undefined) {
    appendFileSync(log, attemptLine(attempt));
  }
};

const main = Effect.gen(function* () {
  const program = readJson("solution.json");
  const inputs = existsSync(join(folder, "inputs.json"))
    ? readJson("inputs.json")
    : { value: {} };
  const failure =
    ("error" in program && program.error) ||
    ("error" in inputs && inputs.error);
  if (failure) {
    tried({ error: failure, ok: false });
    console.log(failure);
    process.exitCode = 1;
    return;
  }
  const lion = yield* load(join(REPOSITORY, CORE));
  const outcome = yield* evaluate(lion, (program as { value: unknown }).value, {
    environment: (inputs as { value: Record<string, unknown> }).value,
  });
  const written = (program as { value: unknown }).value;
  if (outcome.ok) {
    tried({ ok: true, program: written });
    console.log(shown(outcome.value));
    return;
  }
  tried({ error: outcome.error, ok: false, program: written });
  console.log(`The program failed: ${outcome.error}`);
  process.exitCode = 1;
});

Effect.runPromise(main);

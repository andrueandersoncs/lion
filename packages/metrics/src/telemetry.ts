/**
 * The telemetry of the checks the commit hook runs: one line of JSON for
 * each, in `out/telemetry.jsonl`. A check that passed and failed on the
 * same tree of files is flaky: its outcome is not the files' to decide.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { REPOSITORY } from "./sources.ts";

export const TELEMETRY = join(REPOSITORY, "out", "telemetry.jsonl");

/** One run of a check. */
export interface Logged {
  readonly check: string;
  readonly passed: boolean;
  readonly seconds: number;
  /** The git tree of the files it ran on. */
  readonly tree: string;
}

/** Appends a run of a check to the telemetry. */
export const logCheck = (logged: Logged, file = TELEMETRY): void => {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(logged)}\n`);
};

/** The runs a telemetry file holds; a line that is no run is skipped. */
export const loggedOf = (text: string): Logged[] =>
  text.split("\n").flatMap((line): Logged[] => {
    try {
      const value = JSON.parse(line) as Partial<Logged>;
      return typeof value.check === "string" &&
        typeof value.passed === "boolean" &&
        typeof value.tree === "string" &&
        typeof value.seconds === "number"
        ? [
            {
              check: value.check,
              passed: value.passed,
              seconds: value.seconds,
              tree: value.tree,
            },
          ]
        : [];
    } catch {
      return [];
    }
  });

/** The checks that both passed and failed on one tree, each once, in order of name. */
export const flakyOf = (runs: readonly Logged[]): string[] => {
  const outcomes = new Map<string, Set<boolean>>();
  for (const run of runs) {
    const key = `${run.tree} ${run.check}`;
    outcomes.set(key, (outcomes.get(key) ?? new Set()).add(run.passed));
  }
  return [
    ...new Set(
      runs
        .filter((run) => outcomes.get(`${run.tree} ${run.check}`)?.size === 2)
        .map((run) => run.check)
    ),
  ].sort();
};

/** The runs logged so far. */
export const readLogged = (file = TELEMETRY): Logged[] =>
  existsSync(file) ? loggedOf(readFileSync(file, "utf8")) : [];

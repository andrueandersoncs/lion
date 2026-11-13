#!/usr/bin/env node
// Builds model.json from the steps, in order, and from what the files the
// observations depend on hold now.
//
//   node replay.mjs
//
// Run it in the task folder after you edit a step. It replaces model.json
// only when every step runs; when one fails it names that step and its
// error, and model.json stays as it was. Runs under node or bun.
import { readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  inTaskFolder,
  isMain,
  projectRoot,
  readJson,
  runProgram,
  versionsNow,
  watchedPaths,
} from "./lib.mjs";

/** The steps of a task folder, in the order they run. */
export const stepNames = (folder) =>
  readdirSync(join(folder, "steps"))
    .filter((file) => file.endsWith(".json"))
    .sort();

/**
 * Every step as one program, followed by the versions of the project:
 * `versions` gives them for the paths the steps' observations depend on.
 */
export const programOf = (steps, versions) => [
  "begin",
  ...steps,
  versions(
    watchedPaths(steps.flatMap((step) => (Array.isArray(step) ? step : [])))
  ),
  "replayed",
];

const firstFailing = (folder, names) => {
  const building = join(folder, "model.finding.json");
  rmSync(building, { force: true });
  try {
    for (const name of names) {
      const step = readJson(join(folder, "steps", name));
      const result = runProgram(step, building, { keep: true });
      if (!result.ok) {
        return { error: result.error, name };
      }
    }
    return undefined;
  } finally {
    rmSync(building, { force: true });
  }
};

/**
 * Rebuilds the model of a task folder. Gives `{ok: true, steps}`, or
 * `{ok: false, step, error}` with the model left as it was.
 */
export const replay = (folder) => {
  const names = stepNames(folder);
  const steps = names.map((name) => readJson(join(folder, "steps", name)));
  const root = projectRoot(folder);
  const building = join(folder, "model.building.json");
  rmSync(building, { force: true });
  const result = runProgram(
    programOf(steps, (watched) => versionsNow(folder, root, watched)),
    building,
    { keep: true }
  );
  if (!result.ok) {
    rmSync(building, { force: true });
    const failing = firstFailing(folder, names);
    return {
      error: failing?.error ?? result.error,
      ok: false,
      step: failing?.name,
    };
  }
  renameSync(building, join(folder, "model.json"));
  return { ok: true, steps: names.length };
};

const main = () => {
  inTaskFolder();
  const result = replay(".");
  if (!result.ok) {
    console.error(result.error);
    console.error(
      `${result.step === undefined ? "The steps" : `steps/${result.step}`} failed. model.json is as it was.`
    );
    process.exit(1);
  }
  console.log(`model.json rebuilt from ${result.steps} steps.`);
};

if (isMain(import.meta.url)) {
  main();
}

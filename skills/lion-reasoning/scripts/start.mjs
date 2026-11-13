#!/usr/bin/env node
// Makes a task folder and its first model.
//
//   node start.mjs <task name>
//
// Run it at the root of the project. It makes .lion/<task name>/ with the
// folders a task keeps, copies in the core and the standing questions, keeps
// .lion out of git without touching a tracked file, keeps the project as it
// is now as the first version, and builds the model.
// Run it again on a folder that exists and it changes nothing there but the
// model, which it rebuilds. Runs under node or bun.
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { isMain, projectRoot, SKILL, snapshot, TASKS } from "./lib.mjs";
import { replay } from "./replay.mjs";

const NAME = /^[a-z0-9][a-z0-9-]*$/;

/** Adds `.lion/` to the repository's own list of ignored paths, once. */
const ignoreTasks = () => {
  const git = spawnSync("git", ["rev-parse", "--git-path", "info/exclude"], {
    encoding: "utf8",
  });
  if (git.status !== 0) {
    return;
  }
  const exclude = git.stdout.trim();
  const listed = existsSync(exclude) ? readFileSync(exclude, "utf8") : "";
  if (!listed.split("\n").includes(`${TASKS}/`)) {
    mkdirSync(join(exclude, ".."), { recursive: true });
    appendFileSync(
      exclude,
      `${listed === "" || listed.endsWith("\n") ? "" : "\n"}${TASKS}/\n`
    );
  }
};

const main = (name) => {
  if (name === undefined || !NAME.test(name)) {
    console.error(
      "Usage: node start.mjs <task name>, in lowercase letters, digits, and hyphens."
    );
    process.exit(1);
  }
  const folder = join(TASKS, name);
  for (const part of ["steps", "notes", "seen"]) {
    mkdirSync(join(folder, part), { recursive: true });
  }
  const core = join(folder, "steps", "00-core.json");
  if (!existsSync(core)) {
    copyFileSync(join(SKILL, "assets", "core.json"), core);
  }
  const checks = join(folder, "checks.json");
  if (!existsSync(checks)) {
    copyFileSync(join(SKILL, "assets", "checks.json"), checks);
  }
  ignoreTasks();
  snapshot(folder, projectRoot(folder));
  const result = replay(folder);
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
  console.log(`${folder} is ready, with a model of ${result.steps} steps.`);
};

if (isMain(import.meta.url)) {
  main(process.argv[2]);
}

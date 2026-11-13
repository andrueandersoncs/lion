#!/usr/bin/env node
// Builds model.json from the steps, in order, and stops at the first that
// fails.
//
//   node replay.mjs
//
// Run it in the research folder. It runs every steps/*.json with the lion
// command into a new model, and replaces model.json only when all of them
// pass. A step written as steps/<name>.src.json is first written out as
// steps/<name>.json, with each "@utc-minutes" and "@utc-text" in it replaced
// by the function of that name from this skill's assets, so a frame can use
// the time functions without holding a copy of them. Runs under node or bun.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = /\.src\.json$/;
const assets = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
const helper = (name) =>
  JSON.parse(readFileSync(join(assets, `${name}.json`), "utf8"));

/** A program with each "@name" in it replaced by what `helpers` holds for it. */
export const expanded = (program, helpers) => {
  if (typeof program === "string" && program.startsWith("@")) {
    return program.slice(1) in helpers ? helpers[program.slice(1)] : program;
  }
  if (Array.isArray(program)) {
    return program[0] === "quote"
      ? program
      : program.map((part) => expanded(part, helpers));
  }
  return program !== null && typeof program === "object"
    ? Object.fromEntries(
        Object.entries(program).map(([key, part]) => [
          key,
          expanded(part, helpers),
        ])
      )
    : program;
};

const lion = (args) => {
  const first = spawnSync("bunx", ["@lionlang/cli", ...args], {
    encoding: "utf8",
  });
  return first.error
    ? spawnSync("npx", ["-y", "@lionlang/cli", ...args], { encoding: "utf8" })
    : first;
};

const main = () => {
  if (!existsSync("steps")) {
    console.error(
      "There is no steps folder here. Run this in the research folder."
    );
    process.exit(1);
  }
  const helpers = {
    "utc-minutes": helper("utc-minutes"),
    "utc-text": helper("utc-text"),
  };
  for (const name of readdirSync("steps").filter((file) => SOURCE.test(file))) {
    const program = JSON.parse(readFileSync(join("steps", name), "utf8"));
    writeFileSync(
      join("steps", name.replace(SOURCE, ".json")),
      `${JSON.stringify(expanded(program, helpers))}\n`
    );
  }
  const building = "model.building.json";
  rmSync(building, { force: true });
  const steps = readdirSync("steps")
    .filter((file) => file.endsWith(".json") && !SOURCE.test(file))
    .sort();
  for (const name of steps) {
    const step = join("steps", name);
    const result = lion([step, "--database", building]);
    if (result.status !== 0) {
      rmSync(building, { force: true });
      console.error(`${result.stderr ?? ""}${result.stdout ?? ""}`.trim());
      console.error(`Stopped at ${step}. model.json is as it was.`);
      process.exit(1);
    }
    console.log(`ok ${step}`);
  }
  renameSync(building, "model.json");
  console.log(`model.json rebuilt from ${steps.length} steps.`);
};

// True when this file is the program that was started, by whatever path:
// the skill is often installed as a link.
const started = () => {
  try {
    return (
      realpathSync(process.argv[1] ?? "") ===
      realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
};

if (started()) {
  main();
}

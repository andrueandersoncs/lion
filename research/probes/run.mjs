#!/usr/bin/env node
// Runs Lion programs and saves what they give as the text of a source, so a
// claim about what Lion does quotes a program's real output.
//
//   node research/probes/run.mjs <source id> <probe> [<probe> ...]
//
// Run it from the repository root after `bunx turbo build --filter=@lionlang/cli`.
// Each probe is the name of a program in research/probes/, without `.json`.
// It writes research/sources/<source id>.txt: a first line naming the commit
// and the versions it ran on, then each program and what it gave. A source
// keeps the words a claim quotes, so to check Lion again after it changed,
// write a new source id, such as lion-probes-<date>, and record what it says:
// the newer word replaces the older one in the model.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [id, ...probes] = process.argv.slice(2);
if (id === undefined || probes.length === 0) {
  console.error(
    "Usage: node research/probes/run.mjs <source id> <probe> [<probe> ...]"
  );
  process.exit(1);
}

const cli = join("packages", "cli", "dist", "bin.mjs");
const version = (path) => JSON.parse(readFileSync(path, "utf8")).version;
const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
  encoding: "utf8",
}).trim();
const day = new Date().toISOString().slice(0, 10);

const run = (path) => {
  try {
    return execFileSync("node", [cli, path], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    return `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
};

const parts = [
  `Lion programs run for research with @lionlang/cli ${version("packages/cli/package.json")} built at commit ${commit} (core ${version("packages/core/package.json")}), ${day}.`,
];
for (const probe of probes) {
  const path = join("research", "probes", `${probe}.json`);
  parts.push(
    "",
    `== program ${probe}.json`,
    readFileSync(path, "utf8").trimEnd(),
    "== gives",
    run(path).trimEnd()
  );
}
writeFileSync(
  join("research", "sources", `${id}.txt`),
  `${parts.join("\n")}\n`
);
console.log(`research/sources/${id}.txt: ${probes.length} programs.`);

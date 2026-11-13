#!/usr/bin/env node
// Runs a command and keeps what it showed as evidence.
//
//   node see.mjs <source id> [--about <path> ...] -- <command>
//
// Run it in the task folder; the command runs at the root of the project,
// through the shell, with its errors in the same stream as its output. It
// prints what the command showed and saves it as seen/<source id>.txt,
// ending with the command's exit status, so a quote can be taken from either.
// It saves seen/<source id>.json too: the command, and the hash of each path
// it depends on as they were when it ran (the whole project when no --about
// is given). record.mjs takes the source from there, so the notes need only
// the observations. Runs under node or bun.
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  hasherFor,
  inTaskFolder,
  isMain,
  MAX_OUTPUT,
  pathIn,
  projectRoot,
  snapshot,
} from "./lib.mjs";

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** The parts of the arguments: the id, the paths, and the command. */
export const parse = (args) => {
  const split = args.indexOf("--");
  if (split < 1) {
    return undefined;
  }
  const [id, ...options] = args.slice(0, split);
  const about = [];
  for (let at = 0; at < options.length; at += 2) {
    if (options[at] !== "--about" || options[at + 1] === undefined) {
      return undefined;
    }
    about.push(options[at + 1]);
  }
  const command = args.slice(split + 1).join(" ");
  return command === "" || !ID.test(id ?? "")
    ? undefined
    : { about, command, id };
};

/** The text kept for a run: the command, what it showed, how it ended. */
export const transcript = (command, output, status) =>
  `$ ${command}\n${output}${output.endsWith("\n") || output === "" ? "" : "\n"}[exit status ${status}]\n`;

const main = (args) => {
  const parsed = parse(args);
  if (parsed === undefined) {
    console.error(
      "Usage: node see.mjs <source id> [--about <path> ...] -- <command>"
    );
    process.exit(1);
  }
  inTaskFolder();
  const { about, command, id } = parsed;
  const text = join("seen", `${id}.txt`);
  if (existsSync(text)) {
    console.error(
      `${text} exists, and evidence is never overwritten. Choose another id.`
    );
    process.exit(1);
  }
  const root = projectRoot(".");
  const manifest = snapshot(".", root);
  const paths = about.length === 0 ? ["."] : about.map((p) => pathIn(root, p));
  const hash = hasherFor(root, paths);
  const hashes = Object.fromEntries(
    paths.map((path) => [path, hash(manifest, path)])
  );
  const run = spawnSync("sh", ["-c", `(${command}) 2>&1`], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: MAX_OUTPUT,
  });
  const output = run.stdout ?? "";
  const status = run.status ?? run.signal ?? "unknown";
  writeFileSync(text, transcript(command, output, status));
  writeFileSync(
    join("seen", `${id}.json`),
    `${JSON.stringify({ hashes, kind: "ran", what: command }, null, 1)}\n`
  );
  process.stdout.write(output);
  console.log(`[exit status ${status}] saved as ${text}`);
};

if (isMain(import.meta.url)) {
  main(process.argv.slice(2));
}

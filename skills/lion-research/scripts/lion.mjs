// The Lion command every script of this skill runs: the one `LION_CLI`
// names, such as "bun ~/lion/packages/cli/dist/bin.mjs", or else the
// published one. The replay builds the model with it, and the page runs the
// Lion it gives with `lion worker`, so a page's check and the page run the
// same Lion.
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** What separates the words of a command. */
const SPACES = /\s+/;

/** A model, or a page's engine, is larger than spawnSync's default buffer. */
const MAX_BUFFER = 512 * 1024 * 1024;

/** The command and its first arguments, as `LION_CLI` names them, if it does. */
const named = () => {
  const words = process.env.LION_CLI?.trim().split(SPACES) ?? [];
  return words.length > 0 && words[0] !== "" ? words : undefined;
};

/** How the scripts run the Lion command, as a person would type it. */
export const lionCommand = () => named()?.join(" ") ?? "bunx @lionlang/cli";

/**
 * Runs the Lion command with `args`. `encoding` is spawnSync's: "utf8" by
 * default, or "buffer" for the bytes it printed.
 */
export const lion = (args, encoding = "utf8") => {
  const options = { encoding, maxBuffer: MAX_BUFFER };
  const chosen = named();
  if (chosen !== undefined) {
    const [command = "", ...rest] = chosen;
    return spawnSync(command, [...rest, ...args], options);
  }
  const first = spawnSync("bunx", ["@lionlang/cli", ...args], options);
  return first.error
    ? spawnSync("npx", ["-y", "@lionlang/cli", ...args], options)
    : first;
};

const isMain = () => {
  try {
    return (
      realpathSync(process.argv[1] ?? "") ===
      realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
};

if (isMain()) {
  const ran = lion(process.argv.slice(2));
  if (ran.stdout) {
    process.stdout.write(ran.stdout);
  }
  if (ran.stderr) {
    process.stderr.write(ran.stderr);
  }
  process.exit(ran.status ?? 1);
}

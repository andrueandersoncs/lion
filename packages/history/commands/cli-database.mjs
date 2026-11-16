/**
 * What the `lion` command does with a program and with `--database`: runs
 * the CLI from its source on tiny programs in a temporary folder, and prints
 * each exit code, what it wrote, and the saved store. A probe's command: it
 * writes nothing in the repository. Run from packages/cli.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const folder = mkdtempSync(join(tmpdir(), "lion-probe-"));
const file = (name, program) => {
  writeFileSync(join(folder, name), JSON.stringify(program));
  return join(folder, name);
};
const store = join(folder, "store.json");
const lion = (...args) => {
  const ran = spawnSync("bun", ["src/bin.ts", ...args], { encoding: "utf8" });
  return `exit ${ran.status}, prints ${ran.stdout.replace(/\s+/g, "")}, says ${ran.stderr.replace(/\s+/g, " ").trim()}`;
};
try {
  const sum = file("sum.json", ["number/add", 1, ["string/length", "four"]]);
  const setup = file("setup.json", [
    "begin",
    ["relation", "stock", ["item", "count"]],
    ["relation", "low", ["item"]],
    ["relation", "lows", ["count"]],
    [
      "rule",
      ["low", "?item"],
      ["stock", "?item", "?count"],
      ["number/lessThan", "?count", 5],
    ],
    ["rule", ["lows", ["aggregate/count", "?item"]], ["low", "?item"]],
    [
      "invariant",
      ["and", ["stock", "?item", "?count"], ["number/lessThan", "?count", 0]],
      { assert: "none" },
    ],
    ["fact", ["stock", "nails", 3], ["stock", "bolts", 9]],
    ["query", ["lows", "?count"]],
  ]);
  const sell = file("sell.json", ["fact", ["stock", "glue", -1]]);
  console.log(`lion sum.json: ${lion(sum)}`);
  console.log(
    `lion setup.json --database store.json: ${lion(setup, "--database", store)}`
  );
  console.log(
    `lion setup.json --database store.json, again: ${lion(setup, "--database", store)}`
  );
  const saved = readFileSync(store, "utf8");
  console.log(`store.json:\n${saved}`);
  console.log(
    `lion sell.json --database store.json: ${lion(sell, "--database", store)}`
  );
  console.log(
    `store.json is what it was: ${readFileSync(store, "utf8") === saved}`
  );
} finally {
  rmSync(folder, { recursive: true });
}

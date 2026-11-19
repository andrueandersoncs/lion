// Runs the properties of rows with weights, held from a level, against Lion's
// engine (this worktree's core), and prints what held.
//
//   W1  A database that followed changes keeps, for every row, the level it is
//       held from, the level it is held until, and its candidates by level, as
//       a database that derived nothing yet works them out: also for the
//       answers of rules that invent, the pairs of values made one, and the
//       rows a merge ended. The programs invent in two stages and make values
//       one by a key and by equality rules.
//   W2  The level each path of a random graph is held from, and its candidates
//       at each level, are what a plain model works out round by round, after
//       any edge changes.
//   W3  Ten aggregates kept by counted candidates give, after any changes, what
//       a plain model computes from the facts there are.
//
//   bun run test.ts [runs]
//
// The properties are in packages/core/src/logic/tests/weights.test.ts.
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const runs = process.argv[2] ?? "5000";
const core = join(import.meta.dir, "..", "..", "..", "packages", "core");
const output = join(tmpdir(), `weights-model-${process.pid}.json`);
spawnSync(
  "bunx",
  [
    "vitest",
    "run",
    "src/logic/tests/weights.test.ts",
    "--reporter=json",
    `--outputFile=${output}`,
    "--testTimeout=100000000",
  ],
  { cwd: core, env: { ...process.env, LION_RUNS: runs }, stdio: "ignore" }
);
const report = JSON.parse(readFileSync(output, "utf8")) as {
  testResults: { assertionResults: { status: string; title: string }[] }[];
};
rmSync(output);
const held = new Map(
  report.testResults.flatMap((file) =>
    file.assertionResults.map(({ status, title }) => [title, status === "passed"] as const)
  )
);
const LINES: readonly (readonly [string, string, string])[] = [
  [
    "keep after any changes the rows, levels, and weights that deriving from nothing gives",
    "W1",
    `rows, levels, and weights kept through changes equal those derived from nothing in each of ${runs} random programs that invent in two stages and make values one`,
  ],
  [
    "is the least level a candidate gives it, with its candidates counted at each level, after any changes",
    "W2",
    `the level and the candidates by level of every path equal a plain round-by-round model after every edge change in each of ${runs} random graphs`,
  ],
  [
    "give after any changes what a plain model computes from the facts there are",
    "W3",
    `each of 10 aggregates kept by counted candidates equals a plain model after every change in each of ${runs} random runs`,
  ],
];
for (const [title, id, text] of LINES) {
  console.log(`${id}  ${held.get(title) ? text : `FAILED: ${title}`}`);
}

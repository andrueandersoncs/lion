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
//   W4  In programs where a twin passes on a keyed mother inside the group
//       that derives mothers, a rule of that group never finds two rows with
//       one key: the row that comes beside another is read from the level
//       after, when the key has made the two one.
//   W5  `why` tells a path by the least answer at the level it is held from,
//       of the first rule that has one, as a plain model of the levels says,
//       with the rule that recurses listed first.
//   W6  `why` tells an invented home by the least child of its mother, the
//       least answer that invented it.
//   W7  `why` tells every row after any changes as a database that derived
//       nothing tells it, with the facts given in either order.
//   W8  `why` tells every row a rule whose head computes gives by the claim
//       it computed the row from, after any changes.
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
  [
    "never give a rule two rows with one key, though one comes beside the other",
    "W4",
    `no rule of the group that derives a keyed relation found two rows with one key in each of ${runs} random programs where a twin passes a mother on`,
  ],
  [
    "tells why a path holds by the least answer at that level, of the first rule that has one",
    "W5",
    `why told every path by the least answer at its level, of the first rule that has one, as a plain model says, after every edge change in each of ${runs} random graphs`,
  ],
  [
    "tells an invented row by the least answer that invented it",
    "W6",
    `why told every invented home by the least answer that invented it after every change in each of ${runs} random programs`,
  ],
  [
    "tells every row after any changes as deriving from nothing tells it, whatever order the facts came in",
    "W7",
    `why told every row after changes as a database that derived nothing told it, with the facts in either order, in each of ${runs} random programs`,
  ],
  [
    "tells every row a rule gives by the claim it computed the row from, after any changes",
    "W8",
    `why told every row a rule whose head computes gave by the claim it computed the row from, after every change in each of ${runs} random programs`,
  ],
];
for (const [title, id, text] of LINES) {
  console.log(`${id}  ${held.get(title) ? text : `FAILED: ${title}`}`);
}

// Times the hub-graph triangle program of hubs.mjs at m = 500, 1,000, 2,000,
// and 4,000, as the lion-improvements run did on 2026-11-17, and prints the
// lines a source keeps: the edges and triangles each program gives, the wall
// time of each run, including the CLI's start-up, and how the time grows
// between the two largest sizes.
//
//   node research/probes/hubs/time.mjs <runs> <command> [<argument> ...]
//
// Run it from the repository root. The command is the Lion CLI, run with the
// program's path as its last argument, such as `node packages/cli/dist/bin.mjs`
// for the CLI built from the working tree.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [runs, command, ...prefix] = process.argv.slice(2);
const sizes = [500, 1000, 2000, 4000];
const folder = mkdtempSync(join(tmpdir(), "lion-hubs-"));
const generator = join("research", "probes", "hubs", "hubs.mjs");

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const seconds = (s) => `${s.toFixed(2)} s`;

const timed = [];
for (const m of sizes) {
  const path = join(folder, `hubs-${m}.json`);
  writeFileSync(
    path,
    execFileSync("node", [generator, String(m)], { encoding: "utf8" })
  );
  const times = [];
  let gives;
  for (let run = 0; run < Number(runs); run += 1) {
    const start = process.hrtime.bigint();
    gives = JSON.parse(
      execFileSync(command, [...prefix, path], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      })
    );
    times.push(Number(process.hrtime.bigint() - start) / 1e9);
  }
  const edges = gives.edges.toLocaleString("en-US");
  const triangles = gives.triangles.toLocaleString("en-US");
  console.log(
    `${edges} edges, ${triangles} triangles: real ${times.map(seconds).join(", ")}; median ${seconds(median(times))}`
  );
  timed.push({ edges: gives.edges, s: median(times) });
}
const [before, last] = timed.slice(-2);
const power = Math.log(last.s / before.s) / Math.log(last.edges / before.edges);
console.log(
  `time grows about n^${power.toFixed(1)} between the two largest sizes`
);

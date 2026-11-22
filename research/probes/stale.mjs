// The research model's evidence that a later change to Lion made stale:
// the sources a probe wrote, each with the commit it ran at, whose files
// changed since, and the answers of the model that rest on them now.
//
//   node research/probes/stale.mjs          from the repository's root
//   node research/probes/stale.mjs --json
//
// A probe's source names the commit it ran at in its first line ("built at
// commit 7d623a7"). A Lion program a probe ran depends on Lion's core and
// command line; a run of Lion's own tools depends on all its packages. A
// source is stale when what it depends on changed since its commit, in a
// commit or in the working tree. The model is asked, assuming those
// sources are stale and changing nothing, which of its present answers rest
// on them: a probe run again under a new source id replaces them, so the
// answers then rest on the new run. Run `replay.mjs` first, so model.json
// holds every step.
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SOURCES = join("research", "sources");
const BUILT = /built at commit ([0-9a-f]{7,40})/;
const PROGRAMS = ["packages/core/src", "packages/cli/src"];
const TOOLS = ["packages"];

/** What a source's probe depends on: Lion, for programs; every package, for tools. */
const dependsOn = (id) => (id.startsWith("lion-host-") ? TOOLS : PROGRAMS);

const stale = readdirSync(SOURCES)
  .filter((file) => file.endsWith(".txt"))
  .sort()
  .flatMap((file) => {
    const first =
      readFileSync(join(SOURCES, file), "utf8").split("\n")[0] ?? "";
    const commit = BUILT.exec(first)?.[1];
    if (commit === undefined) {
      return [];
    }
    const id = file.slice(0, -".txt".length);
    const changed = spawnSync(
      "git",
      ["diff", "--quiet", commit, "--", ...dependsOn(id)],
      { encoding: "utf8" }
    ).status;
    return changed === 1 ? [{ commit, id }] : [];
  });

const program = [
  "assuming",
  ...(stale.length === 0
    ? []
    : [
        [
          "fact",
          ...stale.map(({ commit, id }) => [
            "stale_source",
            ["quote", id],
            ["quote", commit],
          ]),
        ],
      ]),
  [
    "find",
    ["array/make", "?s", "?q", "?v"],
    ["stale_answer", "?q", "?v", "?s"],
  ],
];
// The program is asked of a copy of the model, so the model stays as the
// replay built it.
const scratch = mkdtempSync(join(tmpdir(), "lion-stale-"));
const asking = join(scratch, "stale.json");
const copy = join(scratch, "model.json");
writeFileSync(asking, JSON.stringify(program));
writeFileSync(copy, readFileSync(join("research", "model.json")));
let asked;
try {
  asked = execFileSync(
    "bun",
    ["packages/cli/dist/bin.mjs", asking, "--database", copy],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }
  );
} finally {
  rmSync(scratch, { force: true, recursive: true });
}
const answers = JSON.parse(asked);
const resting = new Map();
for (const [source, question, value] of answers) {
  resting.set(source, [...(resting.get(source) ?? []), { question, value }]);
}
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ answers, stale }, null, 2));
} else {
  console.log(
    [
      `stale probe sources, research: ${stale.length}`,
      `answers resting on stale probes, research: ${answers.length}`,
      ...stale.map(
        ({ commit, id }) =>
          `  ${id}, run at ${commit}: ${(resting.get(id) ?? []).length} answers rest on it`
      ),
    ].join("\n")
  );
}

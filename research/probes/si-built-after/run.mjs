// Runs what the self-improvement branch built after the research run weighed
// it (si-built ran at 7d623a7), and the searches that show what is still not, and saves what each printed as the text of a source, so
// a claim about Lion's own tools quotes their real output.
//
//   node research/probes/si-built-after/run.mjs <source id>
//
// Run it from the repository root after `bunx turbo build --filter=@lionlang/cli`
// and `bun run affected --map`, which writes the reach map that
// `affected --check` reads. It writes research/sources/<source id>.txt: a
// first line naming the commit and the versions it ran on, then each command
// and what it gave. To see the tools again after they change, run it under a
// new source id and record what the new text says.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [id] = process.argv.slice(2);
if (id === undefined) {
  console.error(
    "Usage: node research/probes/si-built-after/run.mjs <source id>"
  );
  process.exit(1);
}

/** Each command, with what it shows, in the order a reader would ask. */
const COMMANDS = [
  {
    shows:
      "the solver checked against plain code at decimals, a fraction, and past 2^53 (M5)",
    run: ["bun", "run", "oracle"],
  },
  {
    shows:
      "what picking tests by the functions a change touches would have run for the last 30 commits (M3)",
    run: ["bun", "run", "affected", "--replay", "30"],
  },
  {
    shows:
      "the agents' run of the corpus on 2026-11-21, graded again, with its failed tries counted by cause (M4, M6)",
    run: [
      "bun",
      "run",
      "capability",
      "--graded",
      "out/capability/agents/2026-11-21T22-59-43-613Z",
    ],
  },
];

/**
 * Each search of the repository, with what it shows: the lines that match
 * `pattern` in the files under `paths`, counted, and the files that hold them.
 */
const SEARCHES = [
  {
    shows:
      "a line of the metrics that writes down a check the commit hook ran, its time, and its outcome (M8)",
    label: "lines that log a check",
    pattern: /logCheck\(/,
    paths: ["packages/metrics/affected.ts", "packages/metrics/loop.ts"],
  },
  {
    shows: "a rule that names the constraints a change puts at risk (M2)",
    label: "lines that name a constraint at risk",
    pattern: /at_risk|atRisk/,
    paths: [
      "history/research/steps",
      "packages/metrics/src",
      "improvement/notes",
    ],
  },
  {
    shows:
      "a relation of the research model that lists a probe's evidence as out of date (M9)",
    label: "lines that declare a relation of stale evidence",
    pattern: /\["relation",\s*"(stale|out_of_date)"/,
    paths: ["research/steps"],
  },
];

const SKIPPED = new Set(["node_modules", "dist", "tests"]);

/** The files under `path`, leaving out built code, dependencies, and tests. */
const files = (path) =>
  statSync(path).isDirectory()
    ? readdirSync(path)
        .filter((name) => !SKIPPED.has(name))
        .sort()
        .flatMap((name) => files(join(path, name)))
    : [path];

const search = ({ label, pattern, paths }) => {
  const found = paths
    .flatMap(files)
    .map((file) => ({
      file,
      lines: readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => pattern.test(line)).length,
    }))
    .filter(({ lines }) => lines > 0);
  const total = found.reduce((sum, { lines }) => sum + lines, 0);
  return [
    `${label}: ${total} lines`,
    ...found.map(({ file, lines }) => `  ${file}: ${lines}`),
  ].join("\n");
};

const version = (path) => JSON.parse(readFileSync(path, "utf8")).version;
const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
  encoding: "utf8",
}).trim();
const day = new Date().toISOString().slice(0, 10);

/** A word of a command a shell would read as written, needing no quotes. */
const PLAIN_WORD = /^[\w./:=-]+$/;

const shown = (word) => (PLAIN_WORD.test(word) ? word : `'${word}'`);

const run = ([command, ...args]) => {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const printed = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    return `${printed}(exit ${error.status ?? "?"})`;
  }
};

const parts = [
  `Lion's own tools and searches of the repository, run for the self-improvement research run with @lionlang/cli ${version("packages/cli/package.json")} built at commit ${commit} (core ${version("packages/core/package.json")}), ${day}.`,
];
for (const { shows, run: command } of COMMANDS) {
  parts.push(
    "",
    `$ ${command.map(shown).join(" ")}   (${shows})`,
    run(command).trimEnd()
  );
}
for (const searched of SEARCHES) {
  parts.push(
    "",
    `$ grep -rcE '${searched.pattern.source}' ${searched.paths.join(" ")}   (${searched.shows}; built code, dependencies, and tests left out)`,
    search(searched)
  );
}
const path = join("research", "sources", `${id}.txt`);
writeFileSync(path, `${parts.join("\n")}\n`);
console.log(
  `${path}: ${COMMANDS.length} commands and ${SEARCHES.length} searches.`
);

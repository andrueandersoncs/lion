// Runs what the self-improvement plan says is built, and the searches that
// show what is not, and saves what each printed as the text of a source, so
// a claim about Lion's own tools quotes their real output.
//
//   node research/probes/si-built/run.mjs <source id>
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
  console.error("Usage: node research/probes/si-built/run.mjs <source id>");
  process.exit(1);
}

/** Each command, with what it shows, in the order a reader would ask. */
const COMMANDS = [
  {
    shows: "the capability corpus, graded by its reference programs (M4)",
    run: ["bun", "run", "capability"],
  },
  {
    shows: "the interop grid over every pair of its rows (M7)",
    run: ["bun", "run", "pairs"],
  },
  {
    shows:
      "whether picking tests by the reach map is sound for every listed mutation (M3)",
    run: ["bun", "run", "affected", "--check"],
  },
  {
    shows:
      "the rules in force that no probe checks, counted by the project record (M2)",
    run: [
      "bun",
      "run",
      "history",
      "ask",
      '["array/length", ["find", "?rule", ["untested", "?rule"]]]',
    ],
  },
  {
    shows:
      "the cases of the rule scheme-racket-semantics a probe runs, and those a decision excepts as departures (M4)",
    run: [
      "bun",
      "run",
      "history",
      "ask",
      '{"probed": ["array/length", ["aggregate/unique", ["find", "?case", ["and", ["predicted", "scheme-racket-semantics", "?case", "?_", "?_"], ["firsthand", {"behavior": "?case"}, "?_", "Lion at HEAD"]]]]], "excepted": ["array/length", ["aggregate/unique", ["find", "?case", ["and", ["predicted", "scheme-racket-semantics", "?case", "?_", "?_"], ["firsthand", {"behavior": "?case"}, "?_", "Lion at HEAD"], ["excepted", "scheme-racket-semantics", "?case"]]]]]}',
    ],
  },
  {
    shows:
      "what the improvement record says, judged by the published Lion (M1)",
    run: ["bun", "run", "loop", "status"],
  },
];

/**
 * Each search of the repository, with what it shows: the lines that match
 * `pattern` in the files under `paths`, counted, and the files that hold them.
 */
const SEARCHES = [
  {
    shows:
      "a line of the commit hook that writes down a check it ran, its time, or its outcome (M8)",
    label: "lines that write a record of a check",
    pattern: />>|tee |appendFile|writeFile|\.jsonl/,
    paths: [".husky/pre-commit"],
  },
  {
    shows:
      "a rule that names the constraints a change puts at risk, in the project record, the metrics, or the improvement record (M2)",
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
  {
    shows:
      "where the warnings of `lion check` are written: in TypeScript, or as Lion rules (M6)",
    label: "lines that write lion check's warning of a case no value can reach",
    pattern: /can never be reached/,
    paths: ["packages/core/src", "packages/cli/src"],
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
